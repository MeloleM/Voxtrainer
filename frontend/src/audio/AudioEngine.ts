/**
 * Manages mic capture and provides the AnalyserNode for pitch detection.
 * Keeps Web Audio API setup in one place.
 */
export class AudioEngine {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private analyserNode: AnalyserNode | null = null;

  async start(): Promise<AnalyserNode> {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });

    this.context = new AudioContext();
    this.sourceNode = this.context.createMediaStreamSource(this.stream);

    this.analyserNode = this.context.createAnalyser();
    this.analyserNode.fftSize = 2048;

    this.sourceNode.connect(this.analyserNode);

    return this.analyserNode;
  }

  get sampleRate(): number {
    return this.context?.sampleRate ?? 44100;
  }

  stop(): void {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.sourceNode?.disconnect();
    this.context?.close();
    this.context = null;
    this.stream = null;
    this.sourceNode = null;
    this.analyserNode = null;
  }
}
