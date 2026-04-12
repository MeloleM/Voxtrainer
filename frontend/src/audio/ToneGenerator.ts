export type ToneType = "sine" | "piano";

/**
 * Plays reference tones for exercises.
 * Supports pure sine and synthesized piano (additive harmonics + decay).
 */
export class ToneGenerator {
  private context: AudioContext | null = null;
  private activeNodes: AudioNode[] = [];
  private masterGain: GainNode | null = null;

  private ensureContext(): AudioContext {
    if (!this.context) {
      this.context = new AudioContext();
    }
    return this.context;
  }

  play(frequency: number, volume = 0.15, type: ToneType = "sine"): void {
    this.stop();
    if (type === "piano") {
      this.playPiano(frequency, volume);
    } else {
      this.playSine(frequency, volume);
    }
  }

  private playSine(frequency: number, volume: number): void {
    const ctx = this.ensureContext();

    this.masterGain = ctx.createGain();
    this.masterGain.gain.setValueAtTime(0, ctx.currentTime);
    this.masterGain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.03);
    this.masterGain.connect(ctx.destination);

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    osc.connect(this.masterGain);
    osc.start();

    this.activeNodes = [osc, this.masterGain];
  }

  /**
   * Synthesized piano using additive harmonics with per-partial decay.
   * Higher harmonics decay faster, giving a natural piano timbre.
   * Re-triggers every 2s so it sustains during exercises.
   */
  private playPiano(frequency: number, volume: number): void {
    const ctx = this.ensureContext();

    this.masterGain = ctx.createGain();
    this.masterGain.gain.setValueAtTime(volume, ctx.currentTime);
    this.masterGain.connect(ctx.destination);

    // Harmonic amplitudes (relative) — approximates piano spectrum
    const harmonics = [1.0, 0.5, 0.35, 0.15, 0.1, 0.06, 0.03];
    const nodes: AudioNode[] = [this.masterGain];

    for (let h = 0; h < harmonics.length; h++) {
      const partialFreq = frequency * (h + 1);
      if (partialFreq > 10000) break; // skip inaudible partials

      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(partialFreq, ctx.currentTime);

      const partialGain = ctx.createGain();
      const amp = harmonics[h] * 0.3; // scale down since we're summing
      // Attack + decay envelope per partial
      partialGain.gain.setValueAtTime(0, ctx.currentTime);
      partialGain.gain.linearRampToValueAtTime(amp, ctx.currentTime + 0.01);
      // Higher harmonics decay faster
      const decayTime = 1.5 / (1 + h * 0.8);
      const sustainLevel = amp * 0.25;
      partialGain.gain.exponentialRampToValueAtTime(
        Math.max(sustainLevel, 0.001),
        ctx.currentTime + decayTime
      );

      osc.connect(partialGain);
      partialGain.connect(this.masterGain);
      osc.start();

      nodes.push(osc, partialGain);
    }

    this.activeNodes = nodes;
  }

  stop(): void {
    if (this.masterGain && this.context) {
      const now = this.context.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, now);
      this.masterGain.gain.linearRampToValueAtTime(0, now + 0.03);

      // Stop all oscillators
      for (const node of this.activeNodes) {
        if (node instanceof OscillatorNode) {
          node.stop(now + 0.04);
        }
      }
    }
    this.activeNodes = [];
    this.masterGain = null;
  }

  setVolume(volume: number): void {
    if (this.masterGain && this.context) {
      this.masterGain.gain.linearRampToValueAtTime(
        volume,
        this.context.currentTime + 0.02
      );
    }
  }

  dispose(): void {
    this.stop();
    if (this.context) {
      this.context.close();
      this.context = null;
    }
  }
}
