import type { RunState } from "../exercises/types";
import type { ToneType } from "../audio/ToneGenerator";

interface ExercisePanelProps {
  state: RunState | null;
  tip: string | null;
  toneType: ToneType;
  toneVolume: number;
  onStop: () => void;
  onToneTypeChange: (type: ToneType) => void;
  onVolumeChange: (volume: number) => void;
}

export function ExercisePanel({
  state,
  tip,
  toneType,
  toneVolume,
  onStop,
  onToneTypeChange,
  onVolumeChange,
}: ExercisePanelProps) {
  if (!state || state.phase === "idle") return null;

  const { phase, noteIndex, totalNotes, holdProgress, message, results, level } = state;

  return (
    <div className="exercise-panel">
      <div className="exercise-controls">
        <button className="btn-secondary active" onClick={onStop}>
          Stop
        </button>

        {level && (
          <span className="exercise-level-name">{level.name}</span>
        )}

        <div className="toolbar-separator" />

        <button
          className={`toggle-pill${toneType === "sine" ? " active" : ""}`}
          onClick={() => onToneTypeChange("sine")}
        >
          Sine
        </button>
        <button
          className={`toggle-pill${toneType === "piano" ? " active" : ""}`}
          onClick={() => onToneTypeChange("piano")}
        >
          Piano
        </button>

        <div className="toolbar-separator" />

        <div className="volume-control">
          <span className="volume-label">Vol</span>
          <input
            type="range"
            min="0"
            max="0.4"
            step="0.01"
            value={toneVolume}
            onChange={(e) => onVolumeChange(Number(e.target.value))}
            className="volume-slider"
          />
        </div>

        {totalNotes > 0 && phase !== "complete" && phase !== "intro" && (
          <span className="exercise-progress-text">
            {Math.min(noteIndex + 1, totalNotes)} / {totalNotes}
          </span>
        )}
      </div>

      <div className="exercise-status">
        <span className={`exercise-message phase-${phase}`}>
          {message}
        </span>

        {(phase === "holding" || phase === "listening") && totalNotes > 0 && (
          <div className="hold-bar">
            <div
              className="hold-bar-fill"
              style={{ width: `${holdProgress * 100}%` }}
            />
          </div>
        )}

        {phase === "complete" && results.length > 0 && (
          <div className="exercise-score">
            {results.map((r, i) => (
              <span
                key={i}
                className={`score-dot ${r.avgCentsOff <= 10 ? "great" : r.avgCentsOff <= 25 ? "good" : "ok"}`}
                title={`${r.avgCentsOff.toFixed(0)}c off`}
              />
            ))}
          </div>
        )}
      </div>

      {phase === "complete" && tip && (
        <p className="exercise-tip">{tip}</p>
      )}
    </div>
  );
}
