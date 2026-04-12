import { useRef, useEffect, useCallback, useState } from "react";
import { AudioEngine } from "../audio/AudioEngine";
import { PitchDetector } from "../audio/PitchDetector";
import { PitchVisualizer } from "../viz/PitchVisualizer";
import { frequencyToMidi, midiToNoteName, centsOffPitch } from "../audio/noteUtils";

export function PitchDisplay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<AudioEngine | null>(null);
  const detectorRef = useRef<PitchDetector | null>(null);
  const vizRef = useRef<PitchVisualizer | null>(null);
  const rafRef = useRef<number>(0);
  const analyserRef = useRef<AnalyserNode | null>(null);

  const [running, setRunning] = useState(false);
  const [currentNote, setCurrentNote] = useState<string>("");
  const [currentHz, setCurrentHz] = useState<string>("");
  const [currentCents, setCurrentCents] = useState<number>(0);

  // Settings
  const [showNoteLabels, setShowNoteLabels] = useState(false);
  const [showHz, setShowHz] = useState(false);

  const tick = useCallback(() => {
    const analyser = analyserRef.current;
    const detector = detectorRef.current;
    const viz = vizRef.current;
    if (!analyser || !detector || !viz) return;

    const result = detector.detect(analyser);
    if (result) {
      viz.pushPitch(result.frequency);
      const midi = frequencyToMidi(result.frequency);
      setCurrentNote(midiToNoteName(midi));
      setCurrentHz(`${result.frequency.toFixed(1)} Hz`);
      setCurrentCents(Math.round(centsOffPitch(result.frequency)));
    } else {
      viz.pushSilence();
      setCurrentNote("");
      setCurrentHz("");
      setCurrentCents(0);
    }

    viz.draw();
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const startMic = useCallback(async () => {
    if (running) return;

    const engine = new AudioEngine();
    const analyser = await engine.start();
    const detector = new PitchDetector(analyser, 0.9);

    engineRef.current = engine;
    analyserRef.current = analyser;
    detectorRef.current = detector;

    const canvas = canvasRef.current!;
    // Match canvas internal resolution to display size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    // Reset canvas dimensions to CSS size for drawing math
    canvas.width = rect.width;
    canvas.height = rect.height;

    const viz = new PitchVisualizer(canvas, { showNoteLabels, showHz });
    vizRef.current = viz;

    setRunning(true);
    rafRef.current = requestAnimationFrame(tick);
  }, [running, showNoteLabels, showHz, tick]);

  const stopMic = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    engineRef.current?.stop();
    engineRef.current = null;
    analyserRef.current = null;
    detectorRef.current = null;
    vizRef.current = null;
    setRunning(false);
    setCurrentNote("");
    setCurrentHz("");
    setCurrentCents(0);
  }, []);

  // Update visualizer options live
  useEffect(() => {
    vizRef.current?.setOptions({ showNoteLabels, showHz });
  }, [showNoteLabels, showHz]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      engineRef.current?.stop();
    };
  }, []);

  const centsColor =
    Math.abs(currentCents) <= 10
      ? "#4caf50"
      : Math.abs(currentCents) <= 25
        ? "#ff9800"
        : "#f44336";

  return (
    <div className="pitch-display">
      <div className="controls">
        <button onClick={running ? stopMic : startMic}>
          {running ? "Stop" : "Start Mic"}
        </button>

        <label className="toggle">
          <input
            type="checkbox"
            checked={showNoteLabels}
            onChange={(e) => setShowNoteLabels(e.target.checked)}
          />
          Note labels
        </label>

        <label className="toggle">
          <input
            type="checkbox"
            checked={showHz}
            onChange={(e) => setShowHz(e.target.checked)}
          />
          Hz
        </label>
      </div>

      <div className="canvas-wrapper">
        <canvas ref={canvasRef} />
      </div>

      {running && (
        <div className="pitch-readout">
          <span className="note">{currentNote || "—"}</span>
          {currentNote && (
            <>
              <span className="hz">{currentHz}</span>
              <span className="cents" style={{ color: centsColor }}>
                {currentCents > 0 ? "+" : ""}
                {currentCents} cents
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
