import { centsOffPitch, midiToFrequency, midiToNoteName, isInScale } from "../audio/noteUtils";
import { ToneGenerator } from "../audio/ToneGenerator";

export type ExercisePhase = "idle" | "listening" | "hold" | "success" | "done";

export interface ExerciseNote {
  midi: number;
  toleranceCents: number;
  holdMs: number;          // how long user must hold within tolerance
}

export interface ExerciseState {
  phase: ExercisePhase;
  currentNote: ExerciseNote | null;
  noteIndex: number;
  totalNotes: number;
  holdProgress: number;    // 0-1, how far through the hold
  score: number[];         // cents deviation per completed note
  message: string;
}

export type ExerciseListener = (state: ExerciseState) => void;

/**
 * Single-note matching exercise.
 * Generates a sequence of notes within the user's range/scale,
 * plays a reference tone, and tracks whether the user matches.
 */
export class ExerciseEngine {
  private tone = new ToneGenerator();
  private notes: ExerciseNote[] = [];
  private noteIndex = 0;
  private phase: ExercisePhase = "idle";
  private holdAccum = 0;        // accumulated hold time in ms
  private lastTickTime = 0;
  private centsHistory: number[] = [];
  private score: number[] = [];
  private listener: ExerciseListener | null = null;
  private toleranceCents: number;
  private holdMs: number;

  constructor(toleranceCents = 30, holdMs = 3000) {
    this.toleranceCents = toleranceCents;
    this.holdMs = holdMs;
  }

  onStateChange(listener: ExerciseListener): void {
    this.listener = listener;
  }

  /**
   * Generate a note-matching exercise.
   * Picks random in-scale notes within the given MIDI range.
   */
  startNoteMatching(
    count: number,
    rangeLow: number,
    rangeHigh: number,
    scaleIntervals: number[] | null,
    rootNote: number
  ): void {
    this.notes = [];
    // Build pool of valid notes
    const pool: number[] = [];
    for (let midi = rangeLow; midi <= rangeHigh; midi++) {
      if (!scaleIntervals || isInScale(midi, rootNote, scaleIntervals)) {
        pool.push(midi);
      }
    }
    if (pool.length === 0) return;

    // Pick `count` notes, avoiding consecutive repeats
    let lastPick = -1;
    for (let i = 0; i < count; i++) {
      let pick: number;
      do {
        pick = pool[Math.floor(Math.random() * pool.length)];
      } while (pick === lastPick && pool.length > 1);
      lastPick = pick;
      this.notes.push({
        midi: pick,
        toleranceCents: this.toleranceCents,
        holdMs: this.holdMs,
      });
    }

    this.noteIndex = 0;
    this.score = [];
    this.startCurrentNote();
  }

  private startCurrentNote(): void {
    if (this.noteIndex >= this.notes.length) {
      this.phase = "done";
      this.tone.stop();
      this.emit();
      return;
    }

    const note = this.notes[this.noteIndex];
    this.phase = "listening";
    this.holdAccum = 0;
    this.centsHistory = [];
    this.lastTickTime = performance.now();

    // Play reference tone
    this.tone.play(midiToFrequency(note.midi), 0.12);

    this.emit();
  }

  /**
   * Called every animation frame with the current detected pitch.
   * frequency = null means silence.
   */
  tick(frequency: number | null): void {
    if (this.phase !== "listening" && this.phase !== "hold") return;

    const note = this.notes[this.noteIndex];
    const now = performance.now();
    const dt = now - this.lastTickTime;
    this.lastTickTime = now;

    if (frequency === null) {
      // Silence — reset hold but stay in listening
      if (this.phase === "hold") {
        this.phase = "listening";
        this.holdAccum = 0;
        this.emit();
      }
      return;
    }

    const cents = centsOffPitch(frequency, midiToFrequency(note.midi));

    if (Math.abs(cents) <= note.toleranceCents) {
      // Within tolerance
      this.centsHistory.push(cents);
      this.holdAccum += dt;

      if (this.phase === "listening") {
        this.phase = "hold";
      }

      if (this.holdAccum >= note.holdMs) {
        // Success — compute average deviation
        const avgCents = this.centsHistory.reduce((a, b) => a + Math.abs(b), 0) / this.centsHistory.length;
        this.score.push(avgCents);
        this.phase = "success";
        this.tone.stop();
        this.emit();

        // Auto-advance after 800ms
        setTimeout(() => {
          this.noteIndex++;
          this.startCurrentNote();
        }, 800);
        return;
      }
    } else {
      // Outside tolerance — reset hold progress
      if (this.phase === "hold") {
        this.holdAccum = Math.max(0, this.holdAccum - dt * 2); // drain faster than build
        if (this.holdAccum === 0) {
          this.phase = "listening";
        }
      }
    }

    this.emit();
  }

  /** Get the current target note for the visualizer. */
  getTargetNote(): { midi: number; toleranceCents: number } | null {
    if (this.phase === "idle" || this.phase === "done") return null;
    const note = this.notes[this.noteIndex];
    if (!note) return null;
    return { midi: note.midi, toleranceCents: note.toleranceCents };
  }

  getState(): ExerciseState {
    const note = this.notes[this.noteIndex] ?? null;
    let message = "";
    switch (this.phase) {
      case "idle":
        message = "Select an exercise to begin";
        break;
      case "listening":
        message = note ? `Sing ${midiToNoteName(note.midi)}` : "";
        break;
      case "hold":
        message = "Hold it...";
        break;
      case "success":
        message = "Nice!";
        break;
      case "done": {
        if (this.score.length === 0) {
          message = "Done!";
        } else {
          const avg = this.score.reduce((a, b) => a + b, 0) / this.score.length;
          message = `Done! Avg: ${avg.toFixed(0)} cents off`;
        }
        break;
      }
    }

    return {
      phase: this.phase,
      currentNote: note,
      noteIndex: this.noteIndex,
      totalNotes: this.notes.length,
      holdProgress: note ? Math.min(1, this.holdAccum / note.holdMs) : 0,
      score: [...this.score],
      message,
    };
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
