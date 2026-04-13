import { centsOffPitch, midiToFrequency, midiToNoteName, isInScale, frequencyToMidi } from "../audio/noteUtils";
import { ToneGenerator, type ToneType } from "../audio/ToneGenerator";
import type {
  Level,
  NoteMatchingConfig,
  SequenceConfig,
  GlissandoConfig,
  BreathConfig,
  CallResponseConfig,
  MuteTrackConfig,
  NoteSelection,
  RunPhase,
  RunState,
  NoteResult,
} from "./types";

export type StateListener = (state: RunState) => void;

const INTRO_DURATION = 3500;
const NOTE_TIMEOUT = 20000;

export class ExerciseEngine {
  private tone = new ToneGenerator();
  private targetNotes: number[] = [];
  private noteIndex = 0;
  private phase: RunPhase = "idle";
  private holdAccum = 0;
  private lastTickTime = 0;
  private noteStartTime = 0;
  private centsHistory: number[] = [];
  private signedCentsHistory: number[] = [];
  private results: NoteResult[] = [];
  private listener: StateListener | null = null;
  private level: Level | null = null;
  private successIndex = 0;

  private toleranceCents = 30;
  private holdMs = 2000;
  private playReference = true;

  // Diagnostic
  private diagLow = Infinity;
  private diagHigh = -Infinity;
  private diagTimeout: ReturnType<typeof setTimeout> | null = null;

  // Breath
  private breathRepsCompleted = 0;
  private breathTotalReps = 3;
  private breathTargetMs = 5000;
  private breathMinVolume = 0.02;
  private breathAccum = 0;
  private breathCalibrating = false;
  private breathCalibSamples: number[] = [];
  private breathCalibTimeout: ReturnType<typeof setTimeout> | null = null;

  // Glissando
  private glissandoTarget = 60;

  // Call-response
  private crPlayingGuide = false;
  private crGuideNoteIndex = 0;
  private crGuideTimer: ReturnType<typeof setTimeout> | null = null;

  // Mute-track
  private mtGuidedCount = 4;
  private mtIsGuided = true;

  // Settings
  private toneType: ToneType = "piano";
  private toneVolume = 0.12;

  onStateChange(listener: StateListener): void {
    this.listener = listener;
  }

  setToneType(type: ToneType): void { this.toneType = type; }

  setVolume(volume: number): void {
    this.toneVolume = volume;
    this.tone.setVolume(volume);
  }

  startLevel(
    level: Level,
    userRangeLow: number,
    userRangeHigh: number,
    scaleIntervals: number[] | null,
    rootNote: number
  ): void {
    this.level = level;
    this.results = [];
    this.noteIndex = 0;
    this.successIndex = 0;
    this.signedCentsHistory = [];
    this.clearTimers();

    const config = level.config;

    if (config.type === "note-matching" || config.type === "sequence") {
      const cfg = config as NoteMatchingConfig | SequenceConfig;
      this.toleranceCents = cfg.toleranceCents;
      this.holdMs = cfg.holdMs;
      this.playReference = cfg.playReference;
      this.targetNotes = this.resolveNotes(cfg.noteSelection, userRangeLow, userRangeHigh, scaleIntervals, rootNote);
    } else if (config.type === "glissando") {
      const cfg = config as GlissandoConfig;
      this.toleranceCents = cfg.toleranceCents;
      this.holdMs = cfg.holdMs;
      this.glissandoTarget = this.resolveAdaptiveNote(cfg.targetNote, userRangeLow, userRangeHigh);
      this.targetNotes = [this.glissandoTarget];
    } else if (config.type === "breath") {
      const cfg = config as BreathConfig;
      this.breathTotalReps = cfg.reps;
      this.breathTargetMs = cfg.targetMs;
      this.breathRepsCompleted = 0;
      this.breathAccum = 0;
      this.targetNotes = [];
    } else if (config.type === "diagnostic") {
      this.diagLow = Infinity;
      this.diagHigh = -Infinity;
      this.targetNotes = [];
    } else if (config.type === "call-response") {
      const cfg = config as CallResponseConfig;
      this.toleranceCents = cfg.toleranceCents;
      this.holdMs = cfg.holdMs;
      this.targetNotes = this.resolveNotes(cfg.noteSelection, userRangeLow, userRangeHigh, scaleIntervals, rootNote);
      this.crPlayingGuide = false;
      this.crGuideNoteIndex = 0;
    } else if (config.type === "mute-track") {
      const cfg = config as MuteTrackConfig;
      this.toleranceCents = cfg.toleranceCents;
      this.holdMs = cfg.holdMs;
      this.mtGuidedCount = cfg.guidedCount;
      this.mtIsGuided = true;
      this.targetNotes = this.resolveNotes(cfg.noteSelection, userRangeLow, userRangeHigh, scaleIntervals, rootNote);
    }

    this.phase = "intro";
    this.emit();
    setTimeout(() => this.beginExercise(), INTRO_DURATION);
  }

  private beginExercise(): void {
    if (this.phase !== "intro") return;
    const config = this.level?.config;
    if (!config) return;

    if (config.type === "diagnostic") {
      this.phase = "listening";
      this.lastTickTime = performance.now();
      this.diagTimeout = setTimeout(() => this.completeDiagnostic(), 20000);
      this.emit();
    } else if (config.type === "breath") {
      // Auto-calibrate: measure noise floor for 2 seconds
      this.breathCalibrating = true;
      this.breathCalibSamples = [];
      this.phase = "reference"; // repurpose "reference" as calibration phase
      this.lastTickTime = performance.now();
      this.emit();
      this.breathCalibTimeout = setTimeout(() => this.finishBreathCalibration(), 2000);
    } else if (config.type === "glissando") {
      this.tone.play(midiToFrequency(this.glissandoTarget), this.toneVolume, this.toneType);
      setTimeout(() => { if (this.phase === "listening") this.tone.stop(); }, 2000);
      this.phase = "listening";
      this.holdAccum = 0;
      this.centsHistory = [];
      this.lastTickTime = performance.now();
      this.noteStartTime = performance.now();
      this.emit();
    } else if (config.type === "call-response") {
      this.startCallResponseGuide();
    } else if (config.type === "mute-track") {
      this.mtIsGuided = true;
      if (this.targetNotes.length === 0) {
        this.phase = "complete";
        this.emit();
        return;
      }
      this.advanceToNote(); // starts with guided (reference tone plays)
    } else {
      if (this.targetNotes.length === 0) {
        this.phase = "complete";
        this.emit();
        return;
      }
      this.advanceToNote();
    }
  }

  // ─── Breath calibration ─────────────────────────────────────

  private finishBreathCalibration(): void {
    this.breathCalibTimeout = null;
    this.breathCalibrating = false;

    if (this.breathCalibSamples.length > 0) {
      const avg = this.breathCalibSamples.reduce((a, b) => a + b, 0) / this.breathCalibSamples.length;
      // Set threshold at 3x noise floor, minimum 0.005
      this.breathMinVolume = Math.max(0.005, avg * 3);
    } else {
      this.breathMinVolume = 0.01;
    }

    this.phase = "listening";
    this.breathAccum = 0;
    this.lastTickTime = performance.now();
    this.emit();
  }

  // ─── Call-response ──────────────────────────────────────────

  private startCallResponseGuide(): void {
    // Play the full phrase to the user first
    this.crPlayingGuide = true;
    this.crGuideNoteIndex = 0;
    this.phase = "reference";
    this.emit();
    this.playGuideNote();
  }

  private playGuideNote(): void {
    if (this.crGuideNoteIndex >= this.targetNotes.length) {
      // Done playing guide — now user echoes
      this.crPlayingGuide = false;
      this.tone.stop();
      // Brief pause before user's turn
      this.crGuideTimer = setTimeout(() => {
        this.noteIndex = 0;
        this.advanceToNote();
      }, 800);
      return;
    }

    const midi = this.targetNotes[this.crGuideNoteIndex];
    this.tone.play(midiToFrequency(midi), this.toneVolume, this.toneType);

    // Each guide note plays for holdMs, then advance
    const playDuration = Math.max(600, this.holdMs * 0.8);
    this.crGuideTimer = setTimeout(() => {
      this.tone.stop();
      this.crGuideNoteIndex++;
      // Brief gap between guide notes
      this.crGuideTimer = setTimeout(() => this.playGuideNote(), 200);
    }, playDuration);

    this.emit();
  }

  // ─── Mute-track ─────────────────────────────────────────────

  private isGuidedNote(): boolean {
    return this.noteIndex < this.mtGuidedCount;
  }

  // ─── Common note advance ────────────────────────────────────

  private advanceToNote(): void {
    if (this.noteIndex >= this.targetNotes.length) {
      this.phase = "complete";
      this.tone.stop();
      this.emit();
      return;
    }

    const midi = this.targetNotes[this.noteIndex];
    this.phase = "listening";
    this.holdAccum = 0;
    this.centsHistory = [];
    this.lastTickTime = performance.now();
    this.noteStartTime = performance.now();

    const config = this.level?.config;

    // Decide whether to play reference
    if (config?.type === "mute-track") {
      this.mtIsGuided = this.isGuidedNote();
      if (this.mtIsGuided) {
        this.tone.play(midiToFrequency(midi), this.toneVolume, this.toneType);
      } else {
        this.tone.stop();
      }
    } else if (config?.type === "call-response") {
      // User echoes — no reference during echo
      this.tone.stop();
    } else if (this.playReference) {
      this.tone.play(midiToFrequency(midi), this.toneVolume, this.toneType);
    }

    this.emit();
  }

  // ─── Tick ───────────────────────────────────────────────────

  tick(frequency: number | null, amplitude: number): void {
    const config = this.level?.config;
    if (!config) return;

    // Breath calibration — collect ambient samples
    if (this.breathCalibrating) {
      this.breathCalibSamples.push(amplitude);
      return;
    }

    if (config.type === "diagnostic") {
      this.tickDiagnostic(frequency);
      return;
    }
    if (config.type === "breath") {
      this.tickBreath(amplitude);
      return;
    }
    // call-response during guide playback — ignore user input
    if (config.type === "call-response" && this.crPlayingGuide) return;

    this.tickNoteBased(frequency);
  }

  private tickNoteBased(frequency: number | null): void {
    if (this.phase !== "listening" && this.phase !== "holding") return;

    const midi = this.targetNotes[this.noteIndex];
    if (midi === undefined) return;

    const now = performance.now();
    const dt = now - this.lastTickTime;
    this.lastTickTime = now;

    if (now - this.noteStartTime > NOTE_TIMEOUT) {
      this.results.push({ targetMidi: midi, avgCentsOff: 999, held: false });
      this.noteIndex++;
      this.advanceToNote();
      return;
    }

    if (frequency === null) {
      if (this.phase === "holding") {
        this.phase = "listening";
        this.holdAccum = 0;
        this.emit();
      }
      return;
    }

    const cents = centsOffPitch(frequency, midiToFrequency(midi));

    if (Math.abs(cents) <= this.toleranceCents) {
      this.centsHistory.push(cents);
      this.signedCentsHistory.push(cents);
      this.holdAccum += dt;

      if (this.phase === "listening") this.phase = "holding";

      if (this.holdAccum >= this.holdMs) {
        const avgCents = this.centsHistory.reduce((a, b) => a + Math.abs(b), 0) / this.centsHistory.length;
        this.results.push({ targetMidi: midi, avgCentsOff: avgCents, held: true });
        this.phase = "success";
        this.tone.stop();
        this.successIndex++;
        this.emit();

        setTimeout(() => {
          this.noteIndex++;
          this.advanceToNote();
        }, 800);
        return;
      }
    } else {
      if (this.phase === "holding") {
        this.holdAccum = Math.max(0, this.holdAccum - dt * 2);
        if (this.holdAccum === 0) this.phase = "listening";
      }
    }

    this.emit();
  }

  private tickDiagnostic(frequency: number | null): void {
    if (this.phase !== "listening") return;
    if (frequency === null) return;
    const midi = frequencyToMidi(frequency);
    const rounded = Math.round(midi);
    if (rounded >= 24 && rounded <= 96) {
      if (rounded < this.diagLow) this.diagLow = rounded;
      if (rounded > this.diagHigh) this.diagHigh = rounded;
    }
    this.emit();
  }

  private completeDiagnostic(): void {
    if (this.phase !== "listening") return;
    this.diagTimeout = null;
    this.phase = "complete";
    this.emit();
  }

  private tickBreath(amplitude: number): void {
    if (this.phase !== "listening" && this.phase !== "holding") return;

    const now = performance.now();
    const dt = now - this.lastTickTime;
    this.lastTickTime = now;

    if (amplitude >= this.breathMinVolume) {
      this.breathAccum += dt;
      if (this.phase === "listening") this.phase = "holding";

      if (this.breathAccum >= this.breathTargetMs) {
        this.breathRepsCompleted++;
        this.results.push({ targetMidi: 0, avgCentsOff: 0, held: true });
        this.phase = "success";
        this.successIndex++;
        this.emit();

        if (this.breathRepsCompleted >= this.breathTotalReps) {
          setTimeout(() => { this.phase = "complete"; this.emit(); }, 800);
        } else {
          setTimeout(() => {
            this.phase = "listening";
            this.breathAccum = 0;
            this.lastTickTime = performance.now();
            this.emit();
          }, 1200);
        }
        return;
      }
    } else {
      if (this.phase === "holding") {
        this.breathAccum = Math.max(0, this.breathAccum - dt * 1.5);
        if (this.breathAccum === 0) this.phase = "listening";
      }
    }

    this.emit();
  }

  // ─── State ──────────────────────────────────────────────────

  getTargetNote(): { midi: number; toleranceCents: number } | null {
    if (this.phase === "idle" || this.phase === "complete" || this.phase === "intro") return null;
    const config = this.level?.config;
    if (!config || config.type === "diagnostic" || config.type === "breath") return null;

    // During call-response guide playback, show the note being played
    if (config.type === "call-response" && this.crPlayingGuide) {
      const midi = this.targetNotes[this.crGuideNoteIndex];
      if (midi !== undefined) return { midi, toleranceCents: this.toleranceCents };
      return null;
    }

    const midi = this.targetNotes[this.noteIndex];
    if (midi === undefined) return null;
    return { midi, toleranceCents: this.toleranceCents };
  }

  getState(): RunState {
    const fb = this.level?.feedback;
    const config = this.level?.config;
    let message = "";

    switch (this.phase) {
      case "idle":
        message = "";
        break;
      case "intro":
        message = fb?.intro ?? "";
        break;
      case "reference": {
        if (config?.type === "breath") {
          message = "Calibrating mic — stay quiet for a moment...";
        } else if (config?.type === "call-response") {
          const midi = this.targetNotes[this.crGuideNoteIndex];
          message = midi !== undefined
            ? `Listen: ${midiToNoteName(midi)} (${this.crGuideNoteIndex + 1}/${this.targetNotes.length})`
            : "Listen to the phrase...";
        } else {
          message = "Listen...";
        }
        break;
      }
      case "listening": {
        if (config?.type === "diagnostic") {
          if (this.diagLow < Infinity) {
            message = `Range so far: ${midiToNoteName(this.diagLow)} — ${midiToNoteName(this.diagHigh)}. Keep exploring!`;
          } else {
            message = fb?.waiting ?? "Sing your lowest comfortable note...";
          }
        } else if (config?.type === "mute-track" && !this.mtIsGuided) {
          message = "On your own now — keep the pitch going...";
        } else {
          message = fb?.waiting ?? "Sing the note...";
        }
        break;
      }
      case "holding": {
        if (config?.type === "breath") {
          const pct = Math.round((this.breathAccum / this.breathTargetMs) * 100);
          message = `${fb?.holding ?? "Hold..."} (${pct}%)`;
        } else if (config?.type === "mute-track" && !this.mtIsGuided) {
          message = "Holding without guide — trust your ear...";
        } else {
          message = fb?.holding ?? "Hold it...";
        }
        break;
      }
      case "success": {
        const msgs = fb?.success ?? "Nice!";
        if (Array.isArray(msgs)) {
          message = msgs[(this.successIndex - 1) % msgs.length];
        } else {
          message = msgs;
        }
        break;
      }
      case "complete":
        message = this.buildCompleteMessage();
        break;
    }

    let holdProgress = 0;
    if (config?.type === "breath") {
      holdProgress = this.breathTargetMs > 0 ? Math.min(1, this.breathAccum / this.breathTargetMs) : 0;
    } else {
      holdProgress = this.holdMs > 0 ? Math.min(1, this.holdAccum / this.holdMs) : 0;
    }

    let totalNotes = this.targetNotes.length;
    let noteIdx = this.noteIndex;
    if (config?.type === "breath") {
      totalNotes = this.breathTotalReps;
      noteIdx = this.breathRepsCompleted;
    }

    return {
      phase: this.phase,
      level: this.level,
      noteIndex: noteIdx,
      totalNotes,
      holdProgress,
      results: [...this.results],
      message,
      successIndex: this.successIndex,
    };
  }

  private buildCompleteMessage(): string {
    const fb = this.level?.feedback;
    if (!fb) return "Done!";
    const config = this.level?.config;

    let template = fb.complete;
    const noteCount = this.results.length;
    const avg = noteCount > 0
      ? this.results.reduce((a, r) => a + r.avgCentsOff, 0) / noteCount
      : 0;

    // Verdict
    let verdict = "";
    if (config?.type === "breath") {
      verdict = "Your breath control is building.";
    } else if (config?.type === "diagnostic") {
      verdict = "";
    } else {
      if (avg <= 5) verdict = "Incredible precision.";
      else if (avg <= 10) verdict = "Excellent accuracy!";
      else if (avg <= 15) verdict = "Really solid work.";
      else if (avg <= 25) verdict = "Good progress — keep at it.";
      else verdict = "You're building the foundation. Every session gets easier.";
    }

    // Direction tracking
    let tendency = "centered";
    let tendencyAdvice = "Your pitch is well-centered.";
    if (this.signedCentsHistory.length > 3) {
      const avgSigned = this.signedCentsHistory.reduce((a, b) => a + b, 0) / this.signedCentsHistory.length;
      if (avgSigned < -5) {
        tendency = "flat";
        tendencyAdvice = "Try singing 'Gee' or 'Nee' — these consonants lift your placement and help you land sharper.";
      } else if (avgSigned > 5) {
        tendency = "sharp";
        tendencyAdvice = "Try singing 'Guh' or 'Muh' — these relax your placement and help you settle into pitch.";
      }
    }

    // Mute-track guided vs solo comparison
    let guidedAvg = "—";
    let mutedAvg = "—";
    let drift = "—";
    if (config?.type === "mute-track") {
      const guidedResults = this.results.slice(0, this.mtGuidedCount);
      const mutedResults = this.results.slice(this.mtGuidedCount);
      if (guidedResults.length > 0) {
        const gAvg = guidedResults.reduce((a, r) => a + r.avgCentsOff, 0) / guidedResults.length;
        guidedAvg = gAvg.toFixed(0);
      }
      if (mutedResults.length > 0) {
        const mAvg = mutedResults.reduce((a, r) => a + r.avgCentsOff, 0) / mutedResults.length;
        mutedAvg = mAvg.toFixed(0);
        const gAvgNum = guidedResults.length > 0
          ? guidedResults.reduce((a, r) => a + r.avgCentsOff, 0) / guidedResults.length : 0;
        drift = Math.abs(parseFloat(mutedAvg) - gAvgNum).toFixed(0);
      }
    }

    // Range
    const rangeLowStr = this.diagLow < Infinity ? midiToNoteName(this.diagLow) : "?";
    const rangeHighStr = this.diagHigh > -Infinity ? midiToNoteName(this.diagHigh) : "?";

    template = template
      .replace("{noteCount}", String(noteCount))
      .replace("{avg}", avg.toFixed(0))
      .replace("{verdict}", verdict)
      .replace("{tendency}", tendency)
      .replace("{tendencyAdvice}", tendencyAdvice)
      .replace("{rangeLow}", rangeLowStr)
      .replace("{rangeHigh}", rangeHighStr)
      .replace("{reps}", String(this.breathRepsCompleted))
      .replace("{transitionScore}", "—")
      .replace("{guidedAvg}", guidedAvg)
      .replace("{mutedAvg}", mutedAvg)
      .replace("{drift}", drift);

    return template;
  }

  getTip(): string | null {
    return this.level?.feedback?.tip ?? null;
  }

  // ─── Helpers ────────────────────────────────────────────────

  private resolveAdaptiveNote(note: number | "user-low" | "user-mid" | "user-high", low: number, high: number): number {
    if (note === "user-low") return low;
    if (note === "user-high") return high;
    if (note === "user-mid") return Math.round((low + high) / 2);
    return note;
  }

  private resolveNotes(
    selection: NoteSelection,
    rangeLow: number,
    rangeHigh: number,
    scaleIntervals: number[] | null,
    rootNote: number
  ): number[] {
    switch (selection.mode) {
      case "random": {
        const pool = this.buildPool(rangeLow, rangeHigh, scaleIntervals, rootNote);
        if (pool.length === 0) return [];
        const notes: number[] = [];
        let lastPick = -1;
        for (let i = 0; i < selection.count; i++) {
          let pick: number;
          do { pick = pool[Math.floor(Math.random() * pool.length)]; }
          while (pick === lastPick && pool.length > 1);
          lastPick = pick;
          notes.push(pick);
        }
        return notes;
      }
      case "fixed":
        return [...selection.notes];
      case "pattern": {
        const pool = this.buildPool(rangeLow, rangeHigh, scaleIntervals, rootNote);
        if (pool.length === 0) return [];
        const midMidi = Math.round((rangeLow + rangeHigh) / 2);
        const startIdx = pool.reduce((best, n, i) =>
          Math.abs(n - midMidi) < Math.abs(pool[best] - midMidi) ? i : best, 0);
        const notes: number[] = [];
        const repeats = selection.repeats ?? 1;
        for (let r = 0; r < repeats; r++) {
          for (const degree of selection.degrees) {
            const idx = Math.min(Math.max(0, startIdx + degree), pool.length - 1);
            notes.push(pool[idx]);
          }
        }
        return notes;
      }
      case "interval": {
        const pool = this.buildPool(rangeLow, rangeHigh, scaleIntervals, rootNote);
        if (pool.length === 0) return [];
        const maxInterval = Math.max(...selection.intervals);
        const validRoots = pool.filter((n) => n + maxInterval <= rangeHigh);
        if (validRoots.length === 0) return [];
        const root = validRoots[Math.floor(Math.random() * validRoots.length)];
        const notes: number[] = [];
        const repeats = selection.repeats ?? 1;
        for (let r = 0; r < repeats; r++) {
          for (const interval of selection.intervals) {
            notes.push(root + interval);
          }
        }
        return notes;
      }
      case "range-test":
        return [];
    }
  }

  private buildPool(rangeLow: number, rangeHigh: number, scaleIntervals: number[] | null, rootNote: number): number[] {
    const pool: number[] = [];
    for (let midi = rangeLow; midi <= rangeHigh; midi++) {
      if (!scaleIntervals || isInScale(midi, rootNote, scaleIntervals)) pool.push(midi);
    }
    return pool;
  }

  stop(): void {
    this.phase = "idle";
    this.tone.stop();
    this.clearTimers();
    this.emit();
  }

  dispose(): void {
    this.tone.dispose();
    this.clearTimers();
  }

  private clearTimers(): void {
    if (this.diagTimeout) { clearTimeout(this.diagTimeout); this.diagTimeout = null; }
    if (this.breathCalibTimeout) { clearTimeout(this.breathCalibTimeout); this.breathCalibTimeout = null; }
    if (this.crGuideTimer) { clearTimeout(this.crGuideTimer); this.crGuideTimer = null; }
  }

  private emit(): void {
    this.listener?.(this.getState());
  }
}
