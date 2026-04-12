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

export interface TargetNote {
  midi: number;           // integer MIDI note to match
  toleranceCents: number; // e.g. 30 for beginner
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
  /** Target note for exercises. null = free play. */
  targetNote: TargetNote | null;
}

const DEFAULT_OPTIONS: VisualizerOptions = {
  showNoteLabels: false,
  showHz: false,
  timeWindow: 4,
  scaleIntervals: null,
  rootNote: 0,
  targetNote: null,
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
  private lastSmoothedMidi = NaN;

  // Subtle EMA — only smooths small jitter, skips jumps > 2 semitones
  private readonly smoothAlpha = 0.55;
  private readonly smoothMaxJump = 2;

  // Active note highlight with fade
  private highlightMidi = -1;
  private highlightOpacity = 0;
  private lastHighlightTime = 0;
  private readonly highlightFadeMs = 25;

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
    const rawMidi = frequencyToMidi(frequency);
    // Subtle EMA — only smooth small jitter, skip on large jumps
    let midi: number;
    if (isNaN(this.lastSmoothedMidi) || Math.abs(rawMidi - this.lastSmoothedMidi) > this.smoothMaxJump) {
      midi = rawMidi;
    } else {
      midi = this.lastSmoothedMidi + this.smoothAlpha * (rawMidi - this.lastSmoothedMidi);
    }
    this.lastSmoothedMidi = midi;
    this.history.push({ midi, time: performance.now() });
  }

  pushSilence(): void {
    this.lastSmoothedMidi = NaN;
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
    ctx.fillStyle = "#121212";
    ctx.fillRect(0, 0, w, h);

    // Determine closest in-scale note for highlight
    this.updateHighlight(now);

    this.drawGrid(w, h);
    this.drawTargetBand(w, h);
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

  private updateHighlight(now: number): void {
    // Find the current pitch (last non-NaN)
    const last = this.history.length > 0 ? this.history[this.history.length - 1] : null;
    let targetMidi = -1;

    if (last && !isNaN(last.midi)) {
      const rounded = Math.round(last.midi);
      const { scaleIntervals, rootNote } = this.options;
      const hasScale = scaleIntervals && scaleIntervals.length < 12;
      // Only highlight if the note is in the visible range and in scale
      if (rounded >= this.midiLow && rounded <= this.midiHigh) {
        if (!hasScale || isInScale(rounded, rootNote, scaleIntervals!)) {
          targetMidi = rounded;
        }
      }
    }

    if (targetMidi !== this.highlightMidi) {
      this.highlightMidi = targetMidi;
      this.lastHighlightTime = now;
    }

    // Compute opacity with fade
    if (this.highlightMidi === -1) {
      // Fade out
      const elapsed = now - this.lastHighlightTime;
      this.highlightOpacity = Math.max(0, 1 - elapsed / this.highlightFadeMs);
    } else {
      // Fade in
      const elapsed = now - this.lastHighlightTime;
      this.highlightOpacity = Math.min(1, elapsed / this.highlightFadeMs);
    }
  }

  private drawGrid(w: number, h: number): void {
    const { ctx, options } = this;
    const hasScale = options.scaleIntervals && options.scaleIntervals.length < 12;

    for (let midi = Math.ceil(this.midiLow); midi <= Math.floor(this.midiHigh); midi++) {
      const y = this.midiToY(midi, h);
      const noteIndex = ((midi % 12) + 12) % 12;
      const isC = noteIndex === 0;
      const inScale = !hasScale || isInScale(midi, options.rootNote, options.scaleIntervals!);
      const isHighlighted = midi === this.highlightMidi && this.highlightOpacity > 0;

      if (hasScale && !inScale) {
        ctx.strokeStyle = "rgba(255,255,255,0.04)";
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
        continue;
      }

      if (isHighlighted) {
        // Yellow highlight with fade opacity
        const a = this.highlightOpacity * 0.6;
        ctx.strokeStyle = `rgba(255,214,10,${a})`;
        ctx.lineWidth = 2;
      } else {
        ctx.strokeStyle = isC ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.18)";
        ctx.lineWidth = isC ? 1.5 : 0.5;
      }

      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();

      // Labels
      if (options.showNoteLabels || options.showHz) {
        if (isHighlighted) {
          const a = this.highlightOpacity * 0.9;
          ctx.fillStyle = `rgba(255,214,10,${a})`;
        } else {
          ctx.fillStyle = "rgba(179,179,179,0.7)";
        }
        ctx.font = '16px "JetBrains Mono", "Fira Code", monospace';
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

  private drawTargetBand(w: number, h: number): void {
    const { ctx, options } = this;
    const target = options.targetNote;
    if (!target) return;

    const centerY = this.midiToY(target.midi, h);
    // Convert cents tolerance to MIDI fraction (100 cents = 1 semitone)
    const toleranceMidi = target.toleranceCents / 100;
    const topY = this.midiToY(target.midi + toleranceMidi, h);
    const bottomY = this.midiToY(target.midi - toleranceMidi, h);
    const bandHeight = bottomY - topY;

    // Outer tolerance band — subtle green zone
    ctx.fillStyle = "rgba(30, 215, 96, 0.08)";
    ctx.fillRect(0, topY, w, bandHeight);

    // Inner ±5 cents "perfect" zone — brighter
    const perfectMidi = 5 / 100;
    const perfectTop = this.midiToY(target.midi + perfectMidi, h);
    const perfectBottom = this.midiToY(target.midi - perfectMidi, h);
    ctx.fillStyle = "rgba(30, 215, 96, 0.15)";
    ctx.fillRect(0, perfectTop, w, perfectBottom - perfectTop);

    // Center line — the exact target note
    ctx.strokeStyle = "rgba(30, 215, 96, 0.5)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(w, centerY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Target label on right side
    ctx.fillStyle = "rgba(30, 215, 96, 0.8)";
    ctx.font = 'bold 18px "JetBrains Mono", "Fira Code", monospace';
    ctx.textAlign = "right";
    ctx.fillText(midiToNoteName(target.midi), w - 12, centerY - 8);
    ctx.textAlign = "left";
  }

  private drawPitchLine(w: number, h: number, now: number, windowMs: number): void {
    const { ctx, history } = this;
    if (history.length < 2) return;

    ctx.strokeStyle = "#1db4d7";
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.shadowColor = "#1db4d7";
    ctx.shadowBlur = 6;

    // Build segments (runs of non-NaN points separated by silence)
    const segments: { x: number; y: number }[][] = [];
    let current: { x: number; y: number }[] = [];

    for (let i = 0; i < history.length; i++) {
      const p = history[i];
      if (isNaN(p.midi)) {
        if (current.length > 0) {
          segments.push(current);
          current = [];
        }
        continue;
      }
      current.push({
        x: this.timeToX(p.time, w, now, windowMs),
        y: this.midiToY(p.midi, h),
      });
    }
    if (current.length > 0) segments.push(current);

    // Draw each segment as a smooth quadratic spline through midpoints
    for (const pts of segments) {
      if (pts.length < 2) {
        // Single point — just draw a dot
        if (pts.length === 1) {
          ctx.beginPath();
          ctx.arc(pts[0].x, pts[0].y, 2, 0, Math.PI * 2);
          ctx.fill();
        }
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);

      for (let i = 0; i < pts.length - 1; i++) {
        const mx = (pts[i].x + pts[i + 1].x) / 2;
        const my = (pts[i].y + pts[i + 1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
      }
      // Final segment to the last point
      const last = pts[pts.length - 1];
      ctx.lineTo(last.x, last.y);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    // Draw current pitch dot at the rightmost point
    const lastPt = history[history.length - 1];
    if (lastPt && !isNaN(lastPt.midi)) {
      const x = this.timeToX(lastPt.time, w, now, windowMs);
      const y = this.midiToY(lastPt.midi, h);
      ctx.fillStyle = "#fff";
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
