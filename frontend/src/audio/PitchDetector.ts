import { PitchDetector as Pitchy } from "pitchy";

/**
 * Wraps pitchy to extract pitch from an AnalyserNode.
 * Returns frequency in Hz and a clarity value (0-1).
 * Returns null when clarity is below threshold (silence / noise).
 */
export interface PitchResult {
  frequency: number; // Hz
  clarity: number; // 0-1
  amplitude: number; // 0-1 peak amplitude
}

export interface DetectResult {
  pitch: PitchResult | null;
  amplitude: number; // always available, even when pitch is null
}

export class PitchDetector {
  private detector: Pitchy<Float32Array<ArrayBuffer>>;
  private buffer: Float32Array<ArrayBuffer>;
  private clarityThreshold: number;

  constructor(analyser: AnalyserNode, clarityThreshold = 0.85) {
    const bufferSize = analyser.fftSize;
    this.buffer = new Float32Array(bufferSize) as Float32Array<ArrayBuffer>;
    this.detector = Pitchy.forFloat32Array(bufferSize);
    this.clarityThreshold = clarityThreshold;
  }

  /** Returns pitch (may be null) and amplitude (always available). */
  detectFull(analyser: AnalyserNode): DetectResult {
    analyser.getFloatTimeDomainData(this.buffer);

    let maxAmplitude = 0;
    for (let i = 0; i < this.buffer.length; i++) {
      const abs = Math.abs(this.buffer[i]);
      if (abs > maxAmplitude) maxAmplitude = abs;
    }

    if (maxAmplitude < 0.005) {
      return { pitch: null, amplitude: maxAmplitude };
    }

    const [frequency, clarity] = this.detector.findPitch(
      this.buffer,
      analyser.context.sampleRate
    );

    if (clarity < this.clarityThreshold || frequency < 50 || frequency > 1500) {
      return { pitch: null, amplitude: maxAmplitude };
    }

    return {
      pitch: { frequency, clarity, amplitude: maxAmplitude },
      amplitude: maxAmplitude,
    };
  }

  /** Legacy compat — returns pitch or null. */
  detect(analyser: AnalyserNode): PitchResult | null {
    return this.detectFull(analyser).pitch;
  }
}
