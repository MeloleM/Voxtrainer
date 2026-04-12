/**
 * Pitch ↔ note conversion utilities.
 * All based on A4 = 440 Hz, 12-TET.
 */

export const NOTE_NAMES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const;

/** Convert frequency (Hz) to MIDI note number (fractional, for cent accuracy). */
export function frequencyToMidi(freq: number): number {
  return 69 + 12 * Math.log2(freq / 440);
}

/** Convert MIDI note number to frequency (Hz). */
export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** Get the note name + octave for an integer MIDI note. */
export function midiToNoteName(midi: number): string {
  const rounded = Math.round(midi);
  const octave = Math.floor(rounded / 12) - 1;
  const noteIndex = ((rounded % 12) + 12) % 12;
  return `${NOTE_NAMES[noteIndex]}${octave}`;
}

/** Get deviation in cents from the nearest semitone. */
export function centsOffPitch(freq: number): number {
  const midi = frequencyToMidi(freq);
  const nearestMidi = Math.round(midi);
  return (midi - nearestMidi) * 100;
}

/** Vocal range constants (MIDI note numbers). */
export const VOCAL_RANGE = {
  low: 36, // C2
  high: 84, // C6
} as const;

/**
 * Scale definitions as semitone offsets from the root (0-11).
 * Used to filter which grid lines are drawn.
 */
export const SCALES: Record<string, number[]> = {
  "Chromatic": [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  "Major": [0, 2, 4, 5, 7, 9, 11],
  "Natural Minor": [0, 2, 3, 5, 7, 8, 10],
  "Pentatonic Major": [0, 2, 4, 7, 9],
  "Pentatonic Minor": [0, 3, 5, 7, 10],
  "Blues": [0, 3, 5, 6, 7, 10],
} as const;

export const SCALE_NAMES = Object.keys(SCALES);

/** Check if a MIDI note belongs to a given scale with a given root. */
export function isInScale(midi: number, rootNoteIndex: number, scaleIntervals: number[]): boolean {
  const semitone = ((midi - rootNoteIndex) % 12 + 12) % 12;
  return scaleIntervals.includes(semitone);
}
