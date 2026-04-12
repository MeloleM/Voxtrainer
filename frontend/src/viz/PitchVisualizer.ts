import {
  frequencyToMidi,
  midiToNoteName,
  midiToFrequency,
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
}

const DEFAULT_OPTIONS: VisualizerOptions = {
  showNoteLabels: false,
  showHz: false,
  timeWindow: 4,
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

  // Visible MIDI range (can be adjusted by diagnostic later)
  private midiLow = 48; // C3
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
    this.midiLow = Math.max(VOCAL_RANGE.low, lowMidi - 4);
    this.midiHigh = Math.min(VOCAL_RANGE.high, highMidi + 4);
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
    const w = canvas.width;
    const h = canvas.height;
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

    for (let midi = Math.ceil(this.midiLow); midi <= Math.floor(this.midiHigh); midi++) {
      const y = this.midiToY(midi, h);
      const noteIndex = ((midi % 12) + 12) % 12;
      const isC = noteIndex === 0;
      const isNatural = [0, 2, 4, 5, 7, 9, 11].includes(noteIndex);

      // Grid line
      ctx.strokeStyle = isC ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.07)";
      ctx.lineWidth = isC ? 1.5 : 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();

      // Labels (only on natural notes to avoid clutter)
      if (isNatural && (options.showNoteLabels || options.showHz)) {
        ctx.fillStyle = "rgba(255,255,255,0.4)";
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
