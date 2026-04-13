/**
 * Exercise & Level type system for VoxTrainer.
 *
 * Design goals:
 * - Every exercise type from the curriculum is representable
 * - Levels carry enough context to feel warm and encouraging
 * - Easy to author as JSON, easy to generate programmatically
 * - The engine is generic — it reads a Level and runs it
 */

// ─── Exercise types ──────────────────────────────────────────────

export type ExerciseType =
  | "note-matching"       // Hold a single note within tolerance
  | "sequence"            // Play a sequence of notes (stepwise, intervals)
  | "glissando"           // Slide between two pitches, hit target by intersection
  | "breath"              // Sustain volume above threshold for duration
  | "diagnostic"          // Range test — find comfortable low/high
  | "call-response"       // Engine plays, user echoes (with/without guide)
  | "mute-track";         // Play along → guide mutes → user continues → reveal drift

// ─── Note selection ──────────────────────────────────────────────

/** How notes are chosen for the exercise. */
export type NoteSelection =
  | { mode: "random"; count: number }                              // N random in-scale notes
  | { mode: "fixed"; notes: number[] }                             // Specific MIDI notes
  | { mode: "pattern"; degrees: number[]; repeats?: number }       // Scale degree pattern (0-indexed)
  | { mode: "interval"; intervals: number[]; repeats?: number }    // Semitone intervals from root
  | { mode: "range-test" };                                        // Diagnostic: sweep to find range

// ─── Feedback ────────────────────────────────────────────────────

/** Contextual feedback messages shown during the exercise. */
export interface ExerciseFeedback {
  /** Shown before the first note. Sets the tone. */
  intro: string;
  /** Shown while waiting for the user to start singing. */
  waiting: string;
  /** Shown while user is holding within tolerance. */
  holding: string;
  /** Shown on successful note completion. Rotates if array. */
  success: string | string[];
  /** Shown when user drifts flat. */
  tooFlat?: string;
  /** Shown when user drifts sharp. */
  tooSharp?: string;
  /** Shown at the end — can reference {score}, {avg}, {noteCount}. */
  complete: string;
  /** Tip shown after completion — pedagogical context. */
  tip?: string;
}

// ─── Configs per exercise type ───────────────────────────────────

export interface NoteMatchingConfig {
  type: "note-matching";
  noteSelection: NoteSelection;
  toleranceCents: number;
  holdMs: number;
  /** Play reference tone before each note. */
  playReference: boolean;
  /** How long to play the reference before expecting user (ms). 0 = continuous. */
  referenceLeadMs: number;
}

export interface SequenceConfig {
  type: "sequence";
  noteSelection: NoteSelection;    // Must be pattern or interval mode
  toleranceCents: number;
  holdMs: number;
  /** Tempo in BPM — controls pace between notes. null = user-paced. */
  tempoBpm: number | null;
  playReference: boolean;
  /** Track transition quality (clean jump vs lazy slide). */
  scoreTransitions: boolean;
}

export interface GlissandoConfig {
  type: "glissando";
  /** Start MIDI note (or "user-low" / "user-high" for adaptive). */
  startNote: number | "user-low" | "user-high";
  /** Target MIDI note to land on. */
  targetNote: number | "user-mid";
  toleranceCents: number;
  holdMs: number;
  /** "up" | "down" | "both" — direction of the slide. */
  direction: "up" | "down" | "both";
}

export interface BreathConfig {
  type: "breath";
  /** Minimum volume (0-1) the user must sustain. */
  minVolume: number;
  /** Target sustain duration in ms. */
  targetMs: number;
  /** Number of breath reps. */
  reps: number;
}

export interface DiagnosticConfig {
  type: "diagnostic";
  /** What to test. */
  test: "range" | "accuracy" | "both";
}

export interface CallResponseConfig {
  type: "call-response";
  noteSelection: NoteSelection;
  toleranceCents: number;
  holdMs: number;
  /** How many times the guide plays before user echoes. */
  guidePlays: number;
  /** Whether the guide continues playing during user's turn (training wheels). */
  guideOverlap: boolean;
}

export interface MuteTrackConfig {
  type: "mute-track";
  noteSelection: NoteSelection;   // The full phrase
  toleranceCents: number;
  holdMs: number;
  /** How many notes are guided before muting. */
  guidedCount: number;
  /** How many notes are muted (user sings alone). */
  mutedCount: number;
  /** Show drift comparison after muted section. */
  showDrift: boolean;
}

export type ExerciseConfig =
  | NoteMatchingConfig
  | SequenceConfig
  | GlissandoConfig
  | BreathConfig
  | DiagnosticConfig
  | CallResponseConfig
  | MuteTrackConfig;

// ─── Level ───────────────────────────────────────────────────────

export type Difficulty = "beginner" | "intermediate" | "advanced";

export interface Level {
  /** Unique ID, e.g. "s1-03a" */
  id: string;
  /** Display name, e.g. "First Notes" */
  name: string;
  /** Which stage this belongs to (1-4). */
  stage: number;
  /** Order within the stage (for sorting). */
  order: number;
  /** Difficulty tier — affects tolerance defaults and feedback tone. */
  difficulty: Difficulty;
  /** 1-2 sentence description shown before starting. Warm, encouraging. */
  description: string;
  /** What skill this trains — shown as a subtle tag. */
  skill: string;
  /** The exercise configuration. */
  config: ExerciseConfig;
  /** Contextual feedback messages. */
  feedback: ExerciseFeedback;
  /** Unlock condition: IDs of levels that must be completed first. Empty = always available. */
  requires: string[];
}

// ─── Stage metadata ──────────────────────────────────────────────

export interface Stage {
  number: number;
  name: string;
  description: string;
  levels: Level[];
}

// ─── Runtime state ───────────────────────────────────────────────

export type RunPhase =
  | "intro"         // Showing level intro/description
  | "reference"     // Playing reference tone (lead-in)
  | "listening"     // Waiting for user to start singing
  | "holding"       // User is within tolerance, accumulating hold
  | "success"       // Note completed successfully
  | "complete"      // All notes done, showing results
  | "idle";         // No exercise running

export interface NoteResult {
  targetMidi: number;
  avgCentsOff: number;
  held: boolean;
}

export interface RunState {
  phase: RunPhase;
  level: Level | null;
  noteIndex: number;
  totalNotes: number;
  holdProgress: number;
  results: NoteResult[];
  message: string;
  /** Which success message to show (index into feedback.success array). */
  successIndex: number;
}
