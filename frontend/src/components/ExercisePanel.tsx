import type { ExerciseState } from "../exercises/ExerciseEngine";
import type { ToneType } from "../audio/ToneGenerator";

interface ExercisePanelProps {
  exerciseActive: boolean;
  state: ExerciseState | null;
  toneType: ToneType;
  toneVolume: number;
  onStart: () => void;
  onStop: () => void;
  onToneTypeChange: (type: ToneType) => void;
  onVolumeChange: (volume: number) => void;
}

export function ExercisePanel({
  exerciseActive,
  state,
  toneType,
  toneVolume,
  onStart,
  onStop,
  onToneTypeChange,
  onVolumeChange,
}: ExercisePanelProps) {
  const phase = state?.phase ?? "idle";
  const progress = state?.holdProgress ?? 0;
  const noteIndex = state?.noteIndex ?? 0;
  const totalNotes = state?.totalNotes ?? 0;
  const message = state?.message ?? "";

  return (
    <div className="exercise-panel">
      <div className="exercise-controls">
        {!exerciseActive ? (
          <button className="btn-primary" onClick={onStart}>
            Note Matching
          </button>
        ) : (
          <button className="btn-secondary active" onClick={onStop}>
            Stop Exercise
          </button>
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

        {exerciseActive && totalNotes > 0 && phase !== "done" && (
          <span className="exercise-progress-text">
            {noteIndex + 1} / {totalNotes}
          </span>
        )}
      </div>

      {exerciseActive && (
        <div className="exercise-status">
          <span className={`exercise-message phase-${phase}`}>
            {message}
          </span>

          {(phase === "hold" || phase === "listening") && (
            <div className="hold-bar">
              <div
                className="hold-bar-fill"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
          )}

          {phase === "done" && state && state.score.length > 0 && (
            <div className="exercise-score">
              {state.score.map((cents, i) => (
                <span
                  key={i}
                  className={`score-dot ${cents <= 10 ? "great" : cents <= 25 ? "good" : "ok"}`}
                  title={`${cents.toFixed(0)}c off`}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
