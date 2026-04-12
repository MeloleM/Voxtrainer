/**
 * Pitch ↔ note conversion utilities.
 * All based on A4 = 440 Hz, 12-TET.
 */

const NOTE_NAMES = [
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
