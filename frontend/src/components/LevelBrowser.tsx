import { getStages, isLevelUnlocked } from "../exercises/LevelLoader";
import type { Level, Difficulty } from "../exercises/types";

interface LevelBrowserProps {
  completedIds: Set<string>;
  onSelectLevel: (level: Level) => void;
  onClose: () => void;
}

const DIFFICULTY_COLORS: Record<Difficulty, string> = {
  beginner: "var(--color-success)",
  intermediate: "var(--color-warning)",
  advanced: "var(--color-error)",
};

export function LevelBrowser({ completedIds, onSelectLevel, onClose }: LevelBrowserProps) {
  const stages = getStages();

  return (
    <div className="level-browser">
      <div className="level-browser-header">
        <h2>Exercises</h2>
        <button className="btn-secondary" onClick={onClose}>
          Close
        </button>
      </div>

      {stages.map((stage) => (
        <div key={stage.number} className="stage-section">
          <div className="stage-header">
            <span className="stage-number">Stage {stage.number}</span>
            <span className="stage-name">{stage.name}</span>
          </div>
          <p className="stage-description">{stage.description}</p>

          <div className="level-grid">
            {stage.levels.map((level) => {
              const unlocked = isLevelUnlocked(level, completedIds);
              const completed = completedIds.has(level.id);

              return (
                <button
                  key={level.id}
                  className={`level-card${completed ? " completed" : ""}${!unlocked ? " locked" : ""}`}
                  disabled={!unlocked}
                  onClick={() => unlocked && onSelectLevel(level)}
                >
                  <div className="level-card-top">
                    <span className="level-name">{level.name}</span>
                    {completed && <span className="level-check">&#10003;</span>}
                    {!unlocked && <span className="level-lock">&#128274;</span>}
                  </div>
                  <p className="level-description">{level.description}</p>
                  <div className="level-card-footer">
                    <span
                      className="level-difficulty"
                      style={{ color: DIFFICULTY_COLORS[level.difficulty] }}
                    >
                      {level.difficulty}
                    </span>
                    <span className="level-skill">{level.skill}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
