import type { ExerciseState } from "../exercises/ExerciseEngine";

interface ExercisePanelProps {
  exerciseActive: boolean;
  state: ExerciseState | null;
  onStart: () => void;
  onStop: () => void;
}

export function ExercisePanel({ exerciseActive, state, onStart, onStop }: ExercisePanelProps) {
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
