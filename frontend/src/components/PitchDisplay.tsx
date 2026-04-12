import { useRef, useEffect, useCallback, useState } from "react";
import { AudioEngine } from "../audio/AudioEngine";
import { PitchDetector } from "../audio/PitchDetector";
import { PitchVisualizer } from "../viz/PitchVisualizer";
import {
  frequencyToMidi,
  midiToNoteName,
  centsOffPitch,
  VOCAL_RANGE,
  SCALES,
  SCALE_NAMES,
  NOTE_NAMES,
} from "../audio/noteUtils";

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

  // Range (MIDI note numbers) — must span at least 12 semitones (1 octave)
  const [rangeLow, setRangeLow] = useState(36); // C2
  const [rangeHigh, setRangeHigh] = useState(72); // C5

  // Scale
  const [scaleName, setScaleName] = useState("Chromatic");
  const [rootNote, setRootNote] = useState(0); // 0 = C

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
    const detector = new PitchDetector(analyser, 0.85);

    engineRef.current = engine;
    analyserRef.current = analyser;
    detectorRef.current = detector;

    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    // Set canvas buffer to full native resolution
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext("2d")!;
    // Scale all drawing ops so we work in CSS-pixel coordinates
    ctx.scale(dpr, dpr);

    const scaleIntervals = scaleName === "Chromatic" ? null : SCALES[scaleName];
    const viz = new PitchVisualizer(canvas, {
      showNoteLabels,
      showHz,
      scaleIntervals,
      rootNote,
    });
    viz.setRange(rangeLow, rangeHigh);
    vizRef.current = viz;

    setRunning(true);
    rafRef.current = requestAnimationFrame(tick);
  }, [running, showNoteLabels, showHz, rangeLow, rangeHigh, scaleName, rootNote, tick]);

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
    const scaleIntervals = scaleName === "Chromatic" ? null : SCALES[scaleName];
    vizRef.current?.setOptions({ showNoteLabels, showHz, scaleIntervals, rootNote });
  }, [showNoteLabels, showHz, scaleName, rootNote]);

  // Update range live
  useEffect(() => {
    vizRef.current?.setRange(rangeLow, rangeHigh);
  }, [rangeLow, rangeHigh]);

  const handleRangeLow = (midi: number) => {
    setRangeLow(midi);
    // Enforce minimum 1 octave span
    if (rangeHigh - midi < 12) setRangeHigh(midi + 12);
  };

  const handleRangeHigh = (midi: number) => {
    setRangeHigh(midi);
    if (midi - rangeLow < 12) setRangeLow(midi - 12);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      engineRef.current?.stop();
    };
  }, []);

  const centsClass =
    Math.abs(currentCents) <= 10
      ? "on-pitch"
      : Math.abs(currentCents) <= 25
        ? "near-pitch"
        : "off-pitch";

  return (
    <div className="pitch-display">
      {/* ── Toolbar ── */}
      <div className="toolbar">
        <div className="toolbar-group">
          <button
            className="btn-primary"
            onClick={running ? stopMic : startMic}
          >
            {running ? "Stop" : "Start Mic"}
          </button>
        </div>

        <div className="toolbar-separator" />

        <div className="toolbar-group">
          <button
            className={`toggle-pill${showNoteLabels ? " active" : ""}`}
            onClick={() => setShowNoteLabels(!showNoteLabels)}
          >
            Notes
          </button>
          <button
            className={`toggle-pill${showHz ? " active" : ""}`}
            onClick={() => setShowHz(!showHz)}
          >
            Hz
          </button>
        </div>

        <div className="toolbar-separator" />

        <div className="toolbar-group">
          <label className="pill-select">
            <span>Low</span>
            <select
              value={rangeLow}
              onChange={(e) => handleRangeLow(Number(e.target.value))}
            >
              {Array.from(
                { length: VOCAL_RANGE.high - VOCAL_RANGE.low - 11 },
                (_, i) => {
                  const midi = VOCAL_RANGE.low + i;
                  return (
                    <option key={midi} value={midi}>
                      {midiToNoteName(midi)}
                    </option>
                  );
                }
              )}
            </select>
          </label>

          <label className="pill-select">
            <span>High</span>
            <select
              value={rangeHigh}
              onChange={(e) => handleRangeHigh(Number(e.target.value))}
            >
              {Array.from(
                { length: VOCAL_RANGE.high - VOCAL_RANGE.low - 11 },
                (_, i) => {
                  const midi = VOCAL_RANGE.low + 12 + i;
                  return (
                    <option key={midi} value={midi}>
                      {midiToNoteName(midi)}
                    </option>
                  );
                }
              )}
            </select>
          </label>
        </div>

        <div className="toolbar-separator" />

        <div className="toolbar-group">
          <label className="pill-select">
            <span>Scale</span>
            <select
              value={scaleName}
              onChange={(e) => setScaleName(e.target.value)}
            >
              {SCALE_NAMES.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          {scaleName !== "Chromatic" && (
            <label className="pill-select">
              <span>Root</span>
              <select
                value={rootNote}
                onChange={(e) => setRootNote(Number(e.target.value))}
              >
                {NOTE_NAMES.map((name, i) => (
                  <option key={i} value={i}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>

      {/* ── Canvas + Readout row ── */}
      <div className="canvas-row">
        <div className="canvas-viewport">
          <canvas ref={canvasRef} />
        </div>

        <div className="pitch-readout">
          <span className="readout-note">{currentNote || "—"}</span>
          <span className="readout-hz">{currentHz || "\u00A0"}</span>
          {currentNote ? (
            <span className={`readout-cents ${centsClass}`}>
              {currentCents > 0 ? "+" : ""}
              {currentCents}c
            </span>
          ) : (
            <span className="readout-cents">&nbsp;</span>
          )}
        </div>
      </div>
    </div>
  );
}
