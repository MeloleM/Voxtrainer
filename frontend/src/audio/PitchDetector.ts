import { PitchDetector as Pitchy } from "pitchy";

/**
 * Wraps pitchy to extract pitch from an AnalyserNode.
 * Returns frequency in Hz and a clarity value (0-1).
 * Returns null when clarity is below threshold (silence / noise).
 */
export interface PitchResult {
  frequency: number; // Hz
  clarity: number; // 0-1
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

  detect(analyser: AnalyserNode): PitchResult | null {
    analyser.getFloatTimeDomainData(this.buffer);

    // Check if there's any signal — skip detection on silence
    let maxAmplitude = 0;
    for (let i = 0; i < this.buffer.length; i++) {
      const abs = Math.abs(this.buffer[i]);
      if (abs > maxAmplitude) maxAmplitude = abs;
    }
    if (maxAmplitude < 0.005) return null;

    const [frequency, clarity] = this.detector.findPitch(
      this.buffer,
      analyser.context.sampleRate
    );

    if (clarity < this.clarityThreshold) return null;
    if (frequency < 50 || frequency > 1500) return null;

    return { frequency, clarity };
  }
}
