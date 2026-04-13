import { centsOffPitch, midiToFrequency, midiToNoteName, isInScale, frequencyToMidi } from "../audio/noteUtils";
import { ToneGenerator, type ToneType } from "../audio/ToneGenerator";
import type {
  Level,
  NoteMatchingConfig,
  SequenceConfig,
  GlissandoConfig,
  BreathConfig,
  NoteSelection,
  RunPhase,
  RunState,
  NoteResult,
} from "./types";

export type StateListener = (state: RunState) => void;

/** How long to show the intro before starting (ms). */
const INTRO_DURATION = 3500;

/** If user can't match a note within this time, skip it (ms). */
const NOTE_TIMEOUT = 20000;

/**
 * Runs any exercise level. Consumes a Level JSON and manages
 * the tick-by-tick state machine.
 */
export class ExerciseEngine {
  private tone = new ToneGenerator();
  private targetNotes: number[] = [];
  private noteIndex = 0;
  private phase: RunPhase = "idle";
  private holdAccum = 0;
  private lastTickTime = 0;
  private noteStartTime = 0;       // when current note started (for timeout)
  private centsHistory: number[] = [];
  private signedCentsHistory: number[] = []; // for direction tracking
  private results: NoteResult[] = [];
  private listener: StateListener | null = null;
  private level: Level | null = null;
  private successIndex = 0;

  // Per-level config
  private toleranceCents = 30;
  private holdMs = 2000;
  private playReference = true;

  // Diagnostic state
  private diagLow = Infinity;
  private diagHigh = -Infinity;
  private diagTimeout: ReturnType<typeof setTimeout> | null = null;

  // Breath state
  private breathRepsCompleted = 0;
  private breathTotalReps = 3;
  private breathTargetMs = 5000;
  private breathMinVolume = 0.15;
  private breathAccum = 0;

  // Glissando state
  private glissandoTarget = 60;

  // User settings
  private toneType: ToneType = "piano";
  private toneVolume = 0.12;

  onStateChange(listener: StateListener): void {
    this.listener = listener;
  }

  setToneType(type: ToneType): void {
    this.toneType = type;
  }

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
      this.playReference = false;
      this.glissandoTarget = this.resolveAdaptiveNote(cfg.targetNote, userRangeLow, userRangeHigh);
      this.targetNotes = [this.glissandoTarget];
    } else if (config.type === "breath") {
      const cfg = config as BreathConfig;
      this.breathTotalReps = cfg.reps;
      this.breathTargetMs = cfg.targetMs;
      this.breathMinVolume = cfg.minVolume;
      this.breathRepsCompleted = 0;
      this.breathAccum = 0;
      this.targetNotes = [];
    } else if (config.type === "diagnostic") {
      this.diagLow = Infinity;
      this.diagHigh = -Infinity;
      this.targetNotes = [];
    } else {
      // call-response, mute-track — treat as sequence for now
      this.targetNotes = [];
    }

    // Show intro
    this.phase = "intro";
    this.emit();

    setTimeout(() => {
      this.beginExercise();
    }, INTRO_DURATION);
  }

  /** Called after intro finishes — starts the actual exercise. */
  private beginExercise(): void {
    if (this.phase !== "intro") return; // stopped during intro

    const config = this.level?.config;
    if (!config) return;

    if (config.type === "diagnostic") {
      this.phase = "listening";
      this.lastTickTime = performance.now();
      // Diagnostic runs for 20 seconds then completes
      this.diagTimeout = setTimeout(() => this.completeDiagnostic(), 20000);
      this.emit();
    } else if (config.type === "breath") {
      this.phase = "listening";
      this.breathAccum = 0;
      this.lastTickTime = performance.now();
      this.emit();
    } else if (config.type === "glissando") {
      // Play the target tone so user knows what to aim for
      this.tone.play(midiToFrequency(this.glissandoTarget), this.toneVolume, this.toneType);
      // Stop the reference after 2s, then user slides to find it
      setTimeout(() => this.tone.stop(), 2000);
      this.phase = "listening";
      this.holdAccum = 0;
      this.centsHistory = [];
      this.lastTickTime = performance.now();
      this.noteStartTime = performance.now();
      this.emit();
    } else {
      // Note-based exercises
      if (this.targetNotes.length === 0) {
        this.phase = "complete";
        this.emit();
        return;
      }
      this.advanceToNote();
    }
  }

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
          do {
            pick = pool[Math.floor(Math.random() * pool.length)];
          } while (pick === lastPick && pool.length > 1);
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
      if (!scaleIntervals || isInScale(midi, rootNote, scaleIntervals)) {
        pool.push(midi);
      }
    }
    return pool;
  }

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

    if (this.playReference) {
      this.tone.play(midiToFrequency(midi), this.toneVolume, this.toneType);
    }

    this.emit();
  }

  /**
   * Called every frame. frequency=null means silence.
   * amplitude is 0-1 peak level (always available).
   */
  tick(frequency: number | null, amplitude: number): void {
    const config = this.level?.config;
    if (!config) return;

    if (config.type === "diagnostic") {
      this.tickDiagnostic(frequency);
      return;
    }

    if (config.type === "breath") {
      this.tickBreath(amplitude);
      return;
    }

    // Note-based: note-matching, sequence, glissando
    if (this.phase !== "listening" && this.phase !== "holding") return;

    const midi = this.targetNotes[this.noteIndex];
    if (midi === undefined) return;

    const now = performance.now();
    const dt = now - this.lastTickTime;
    this.lastTickTime = now;

    // Check timeout
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

      if (this.phase === "listening") {
        this.phase = "holding";
      }

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
        if (this.holdAccum === 0) {
          this.phase = "listening";
        }
      }
    }

    this.emit();
  }

  private tickDiagnostic(frequency: number | null): void {
    if (this.phase !== "listening") return;
    if (frequency === null) return;

    const midi = frequencyToMidi(frequency);
    const rounded = Math.round(midi);
    if (rounded >= 24 && rounded <= 96) { // Reasonable vocal range
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
      if (this.phase === "listening") {
        this.phase = "holding";
      }

      if (this.breathAccum >= this.breathTargetMs) {
        // Rep complete
        this.breathRepsCompleted++;
        this.results.push({ targetMidi: 0, avgCentsOff: 0, held: true });
        this.phase = "success";
        this.successIndex++;
        this.emit();

        if (this.breathRepsCompleted >= this.breathTotalReps) {
          setTimeout(() => {
            this.phase = "complete";
            this.emit();
          }, 800);
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
      // Volume dropped
      if (this.phase === "holding") {
        this.breathAccum = Math.max(0, this.breathAccum - dt * 1.5);
        if (this.breathAccum === 0) {
          this.phase = "listening";
        }
      }
    }

    this.emit();
  }

  getTargetNote(): { midi: number; toleranceCents: number } | null {
    if (this.phase === "idle" || this.phase === "complete" || this.phase === "intro") return null;

    const config = this.level?.config;
    if (!config) return null;

    // Diagnostic and breath don't have target notes
    if (config.type === "diagnostic" || config.type === "breath") return null;

    const midi = this.targetNotes[this.noteIndex];
    if (midi === undefined) return null;
    return { midi, toleranceCents: this.toleranceCents };
  }

  getState(): RunState {
    const fb = this.level?.feedback;
    let message = "";

    switch (this.phase) {
      case "idle":
        message = "";
        break;
      case "intro":
        message = fb?.intro ?? "";
        break;
      case "listening":
        message = fb?.waiting ?? "Sing the note...";
        break;
      case "holding": {
        const config = this.level?.config;
        if (config?.type === "breath") {
          const pct = Math.round((this.breathAccum / this.breathTargetMs) * 100);
          message = `${fb?.holding ?? "Hold..."} (${pct}%)`;
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

    // For diagnostic, show range discovery progress
    if (this.phase === "listening" && this.level?.config.type === "diagnostic") {
      if (this.diagLow < Infinity) {
        message = `Range so far: ${midiToNoteName(this.diagLow)} — ${midiToNoteName(this.diagHigh)}. Keep exploring!`;
      } else {
        message = fb?.waiting ?? "Sing your lowest comfortable note...";
      }
    }

    // Compute hold progress
    let holdProgress = 0;
    const config = this.level?.config;
    if (config?.type === "breath") {
      holdProgress = this.breathTargetMs > 0 ? Math.min(1, this.breathAccum / this.breathTargetMs) : 0;
    } else {
      holdProgress = this.holdMs > 0 ? Math.min(1, this.holdAccum / this.holdMs) : 0;
    }

    // Total notes depends on exercise type
    let totalNotes = this.targetNotes.length;
    if (config?.type === "breath") {
      totalNotes = this.breathTotalReps;
    }

    let noteIdx = this.noteIndex;
    if (config?.type === "breath") {
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

    // Build verdict
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

    // Diagnostic range
    const rangeLowStr = this.diagLow < Infinity ? midiToNoteName(this.diagLow) : "?";
    const rangeHighStr = this.diagHigh > -Infinity ? midiToNoteName(this.diagHigh) : "?";

    // Breath reps
    const reps = this.breathRepsCompleted;

    // Replace all template vars
    template = template
      .replace("{noteCount}", String(noteCount))
      .replace("{avg}", avg.toFixed(0))
      .replace("{verdict}", verdict)
      .replace("{tendency}", tendency)
      .replace("{tendencyAdvice}", tendencyAdvice)
      .replace("{rangeLow}", rangeLowStr)
      .replace("{rangeHigh}", rangeHighStr)
      .replace("{reps}", String(reps))
      .replace("{transitionScore}", "—"); // placeholder until transition scoring is built

    return template;
  }

  getTip(): string | null {
    return this.level?.feedback?.tip ?? null;
  }

  stop(): void {
    this.phase = "idle";
    this.tone.stop();
    if (this.diagTimeout) {
      clearTimeout(this.diagTimeout);
      this.diagTimeout = null;
    }
    this.emit();
  }

  dispose(): void {
    this.tone.dispose();
    if (this.diagTimeout) {
      clearTimeout(this.diagTimeout);
      this.diagTimeout = null;
    }
  }

  private emit(): void {
    this.listener?.(this.getState());
  }
}
