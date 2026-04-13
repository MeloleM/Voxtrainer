import { centsOffPitch, midiToFrequency, isInScale } from "../audio/noteUtils";
import { ToneGenerator, type ToneType } from "../audio/ToneGenerator";
import type {
  Level,
  NoteMatchingConfig,
  SequenceConfig,
  NoteSelection,
  RunPhase,
  RunState,
  NoteResult,
} from "./types";

export type StateListener = (state: RunState) => void;

/**
 * Runs any exercise level. Consumes a Level JSON and manages
 * the tick-by-tick state machine.
 *
 * Currently implements: note-matching, sequence.
 * Other types (glissando, breath, diagnostic, call-response, mute-track)
 * will be added as we build their UI.
 */
export class ExerciseEngine {
  private tone = new ToneGenerator();
  private targetNotes: number[] = [];     // MIDI notes to hit, in order
  private noteIndex = 0;
  private phase: RunPhase = "idle";
  private holdAccum = 0;
  private lastTickTime = 0;
  private centsHistory: number[] = [];
  private results: NoteResult[] = [];
  private listener: StateListener | null = null;
  private level: Level | null = null;
  private successIndex = 0;

  // Configurable per-level
  private toleranceCents = 30;
  private holdMs = 2000;
  private playReference = true;

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

  /**
   * Start running a level.
   * rangeLow/rangeHigh and scale info are the user's current settings.
   */
  startLevel(
    level: Level,
    rangeLow: number,
    rangeHigh: number,
    scaleIntervals: number[] | null,
    rootNote: number
  ): void {
    this.level = level;
    this.results = [];
    this.noteIndex = 0;
    this.successIndex = 0;

    const config = level.config;

    if (config.type === "note-matching" || config.type === "sequence") {
      const cfg = config as NoteMatchingConfig | SequenceConfig;
      this.toleranceCents = cfg.toleranceCents;
      this.holdMs = cfg.holdMs;
      this.playReference = cfg.playReference;
      this.targetNotes = this.resolveNotes(
        cfg.noteSelection,
        rangeLow,
        rangeHigh,
        scaleIntervals,
        rootNote
      );
    } else {
      // Stub for other types — just show intro
      this.targetNotes = [];
    }

    if (this.targetNotes.length === 0 && config.type !== "diagnostic" && config.type !== "breath") {
      // No valid notes — can't run
      this.phase = "complete";
      this.emit();
      return;
    }

    // Show intro briefly, then start first note
    this.phase = "intro";
    this.emit();

    setTimeout(() => {
      this.advanceToNote();
    }, 2000);
  }

  /**
   * Resolve a NoteSelection into concrete MIDI note numbers.
   */
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
        // Scale degree pattern — resolve relative to rootNote within range
        const pool = this.buildPool(rangeLow, rangeHigh, scaleIntervals, rootNote);
        if (pool.length === 0) return [];
        // Find a good starting note near the middle of the range
        const midMidi = Math.round((rangeLow + rangeHigh) / 2);
        // Find the pool note closest to mid
        const startIdx = pool.reduce((best, n, i) =>
          Math.abs(n - midMidi) < Math.abs(pool[best] - midMidi) ? i : best, 0);
        const notes: number[] = [];
        const repeats = selection.repeats ?? 1;
        for (let r = 0; r < repeats; r++) {
          for (const degree of selection.degrees) {
            const idx = Math.min(startIdx + degree, pool.length - 1);
            notes.push(pool[idx]);
          }
        }
        return notes;
      }

      case "interval": {
        // Semitone offsets from a randomly chosen root in the pool
        const pool = this.buildPool(rangeLow, rangeHigh, scaleIntervals, rootNote);
        if (pool.length === 0) return [];
        const maxInterval = Math.max(...selection.intervals);
        // Pick a root that leaves room for the largest interval
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
        return []; // Diagnostic handles its own flow
    }
  }

  private buildPool(
    rangeLow: number,
    rangeHigh: number,
    scaleIntervals: number[] | null,
    rootNote: number
  ): number[] {
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

    if (this.playReference) {
      this.tone.play(midiToFrequency(midi), this.toneVolume, this.toneType);
    }

    this.emit();
  }

  /**
   * Called every animation frame with the current detected pitch.
   */
  tick(frequency: number | null): void {
    if (this.phase !== "listening" && this.phase !== "holding") return;

    const midi = this.targetNotes[this.noteIndex];
    const now = performance.now();
    const dt = now - this.lastTickTime;
    this.lastTickTime = now;

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
      this.holdAccum += dt;

      if (this.phase === "listening") {
        this.phase = "holding";
      }

      if (this.holdAccum >= this.holdMs) {
        // Note completed
        const avgCents =
          this.centsHistory.reduce((a, b) => a + Math.abs(b), 0) /
          this.centsHistory.length;
        this.results.push({
          targetMidi: midi,
          avgCentsOff: avgCents,
          held: true,
        });

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

  getTargetNote(): { midi: number; toleranceCents: number } | null {
    if (
      this.phase === "idle" ||
      this.phase === "complete" ||
      this.phase === "intro"
    )
      return null;
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
      case "holding":
        message = fb?.holding ?? "Hold it...";
        break;
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

    return {
      phase: this.phase,
      level: this.level,
      noteIndex: this.noteIndex,
      totalNotes: this.targetNotes.length,
      holdProgress:
        this.holdMs > 0 ? Math.min(1, this.holdAccum / this.holdMs) : 0,
      results: [...this.results],
      message,
      successIndex: this.successIndex,
    };
  }

  private buildCompleteMessage(): string {
    const fb = this.level?.feedback;
    if (!fb) return "Done!";

    let template = fb.complete;
    const noteCount = this.results.length;
    const avg =
      noteCount > 0
        ? this.results.reduce((a, r) => a + r.avgCentsOff, 0) / noteCount
        : 0;

    // Build verdict based on performance
    let verdict = "";
    if (avg <= 5) verdict = "Incredible precision.";
    else if (avg <= 10) verdict = "Excellent accuracy!";
    else if (avg <= 15) verdict = "Really solid work.";
    else if (avg <= 25) verdict = "Good progress — keep at it.";
    else verdict = "You're building the foundation. Every session gets easier.";

    template = template
      .replace("{noteCount}", String(noteCount))
      .replace("{avg}", avg.toFixed(0))
      .replace("{verdict}", verdict);

    return template;
  }

  /** Get the tip for the current level (shown after completion). */
  getTip(): string | null {
    return this.level?.feedback?.tip ?? null;
  }

  stop(): void {
    this.phase = "idle";
    this.tone.stop();
    this.emit();
  }

  dispose(): void {
    this.tone.dispose();
  }

  private emit(): void {
    this.listener?.(this.getState());
  }
}
