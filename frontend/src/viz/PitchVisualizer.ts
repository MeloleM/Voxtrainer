import {
  frequencyToMidi,
  midiToNoteName,
  midiToFrequency,
  isInScale,
  VOCAL_RANGE,
} from "../audio/noteUtils";

export interface PitchPoint {
  midi: number; // fractional MIDI note
  time: number; // timestamp (ms)
}

export interface VisualizerOptions {
  showNoteLabels: boolean;
  showHz: boolean;
  /** How many seconds of history to display */
  timeWindow: number;
  /** Scale intervals (semitone offsets from root). null = chromatic (show all). */
  scaleIntervals: number[] | null;
  /** Root note index (0=C, 1=C#, ... 11=B). Only used when scaleIntervals is set. */
  rootNote: number;
}

const DEFAULT_OPTIONS: VisualizerOptions = {
  showNoteLabels: false,
  showHz: false,
  timeWindow: 4,
  scaleIntervals: null,
  rootNote: 0,
};

/**
 * Scrolling piano-roll pitch visualizer.
 * Y-axis = pitch (MIDI notes), X-axis = time (scrolling left).
 * Draws note grid lines + the user's pitch as a trailing line.
 */
export class PitchVisualizer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private history: PitchPoint[] = [];
  private options: VisualizerOptions;

  // Visible MIDI range — default spans C2 to C5 to cover deep voices
  private midiLow = 36; // C2
  private midiHigh = 72; // C5

  constructor(canvas: HTMLCanvasElement, options?: Partial<VisualizerOptions>) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  setOptions(options: Partial<VisualizerOptions>): void {
    Object.assign(this.options, options);
  }

  setRange(lowMidi: number, highMidi: number): void {
    this.midiLow = Math.max(VOCAL_RANGE.low, lowMidi);
    this.midiHigh = Math.min(VOCAL_RANGE.high, highMidi);
  }

  pushPitch(frequency: number): void {
    const midi = frequencyToMidi(frequency);
    this.history.push({ midi, time: performance.now() });
  }

  pushSilence(): void {
    // Gap marker — we push NaN so the line breaks
    this.history.push({ midi: NaN, time: performance.now() });
  }

  draw(): void {
    const { canvas, ctx, options } = this;
    // Use CSS dimensions (not canvas.width/height which includes DPR scaling)
    const rect = canvas.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;
    const now = performance.now();
    const windowMs = options.timeWindow * 1000;

    // Trim old points
    const cutoff = now - windowMs;
    while (this.history.length > 0 && this.history[0].time < cutoff) {
      this.history.shift();
    }

    // Clear
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, w, h);

    this.drawGrid(w, h);
    this.drawPitchLine(w, h, now, windowMs);
  }

  private midiToY(midi: number, h: number): number {
    // Higher pitch = higher on screen (lower Y)
    const range = this.midiHigh - this.midiLow;
    const ratio = (midi - this.midiLow) / range;
    return h - ratio * h;
  }

  private timeToX(time: number, w: number, now: number, windowMs: number): number {
    // Newest = right edge, oldest = left edge
    const age = now - time;
    return w - (age / windowMs) * w;
  }

  private drawGrid(w: number, h: number): void {
    const { ctx, options } = this;
    const hasScale = options.scaleIntervals && options.scaleIntervals.length < 12;

    for (let midi = Math.ceil(this.midiLow); midi <= Math.floor(this.midiHigh); midi++) {
      const y = this.midiToY(midi, h);
      const noteIndex = ((midi % 12) + 12) % 12;
      const isC = noteIndex === 0;
      const inScale = !hasScale || isInScale(midi, options.rootNote, options.scaleIntervals!);

      if (hasScale && !inScale) {
        // Out-of-scale notes: very faint line only, no label
        ctx.strokeStyle = "rgba(255,255,255,0.04)";
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
        continue;
      }

      // In-scale (or chromatic) grid line
      ctx.strokeStyle = isC ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.18)";
      ctx.lineWidth = isC ? 1.5 : 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();

      // Labels
      if (options.showNoteLabels || options.showHz) {
        ctx.fillStyle = "rgba(255,255,255,0.5)";
        ctx.font = "11px monospace";
        let label = "";
        if (options.showNoteLabels) label += midiToNoteName(midi);
        if (options.showHz) {
          if (label) label += " ";
          label += `${midiToFrequency(midi).toFixed(0)}Hz`;
        }
        ctx.fillText(label, 4, y - 3);
      }
    }
  }

  private drawPitchLine(w: number, h: number, now: number, windowMs: number): void {
    const { ctx, history } = this;
    if (history.length < 2) return;

    ctx.strokeStyle = "#4fc3f7";
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.shadowColor = "#4fc3f7";
    ctx.shadowBlur = 6;

    ctx.beginPath();
    let drawing = false;

    for (let i = 0; i < history.length; i++) {
      const p = history[i];
      if (isNaN(p.midi)) {
        // Silence gap — break the line
        drawing = false;
        continue;
      }

      const x = this.timeToX(p.time, w, now, windowMs);
      const y = this.midiToY(p.midi, h);

      if (!drawing) {
        ctx.moveTo(x, y);
        drawing = true;
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();
    ctx.shadowBlur = 0;

    // Draw current pitch dot at the rightmost point
    const last = history[history.length - 1];
    if (last && !isNaN(last.midi)) {
      const x = this.timeToX(last.time, w, now, windowMs);
      const y = this.midiToY(last.midi, h);
      ctx.fillStyle = "#fff";
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
