/**
 * Plays reference tones for exercises.
 * Uses Web Audio API OscillatorNode — sine wave by default.
 */
export class ToneGenerator {
  private context: AudioContext | null = null;
  private oscillator: OscillatorNode | null = null;
  private gainNode: GainNode | null = null;

  private ensureContext(): AudioContext {
    if (!this.context) {
      this.context = new AudioContext();
    }
    return this.context;
  }

  /**
   * Start playing a tone at the given frequency.
   * Ramps in over 30ms to avoid click.
   */
  play(frequency: number, volume = 0.15): void {
    this.stop();
    const ctx = this.ensureContext();

    this.gainNode = ctx.createGain();
    this.gainNode.gain.setValueAtTime(0, ctx.currentTime);
    this.gainNode.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.03);
    this.gainNode.connect(ctx.destination);

    this.oscillator = ctx.createOscillator();
    this.oscillator.type = "sine";
    this.oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
    this.oscillator.connect(this.gainNode);
    this.oscillator.start();
  }

  /** Stop the current tone with a 30ms ramp-out to avoid click. */
  stop(): void {
    if (this.gainNode && this.oscillator && this.context) {
      const now = this.context.currentTime;
      this.gainNode.gain.cancelScheduledValues(now);
      this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
      this.gainNode.gain.linearRampToValueAtTime(0, now + 0.03);
      this.oscillator.stop(now + 0.04);
    }
    this.oscillator = null;
    this.gainNode = null;
  }

  /** Change the frequency of the currently playing tone (smooth glide). */
  setFrequency(frequency: number): void {
    if (this.oscillator && this.context) {
      this.oscillator.frequency.linearRampToValueAtTime(
        frequency,
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
