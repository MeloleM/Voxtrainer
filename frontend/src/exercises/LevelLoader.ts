import type { Level, Stage } from "./types";

// Stage 1
import s1_01 from "./levels/stage1/01-find-your-voice.json";
import s1_02 from "./levels/stage1/02-steady-breath.json";
import s1_03 from "./levels/stage1/03-first-notes.json";
import s1_04 from "./levels/stage1/04-finding-the-pitch.json";
import s1_05 from "./levels/stage1/05-note-matching-intermediate.json";
import s1_06 from "./levels/stage1/06-direction-check.json";

// Stage 2
import s2_01 from "./levels/stage2/01-stepwise-up.json";
import s2_02 from "./levels/stage2/02-thirds.json";
import s2_03 from "./levels/stage2/03-fifths.json";
import s2_04 from "./levels/stage2/04-echo-game.json";
import s2_05 from "./levels/stage2/05-mute-track.json";

const ALL_LEVELS: Level[] = [
  s1_01, s1_02, s1_03, s1_04, s1_05, s1_06,
  s2_01, s2_02, s2_03, s2_04, s2_05,
] as unknown as Level[];

const STAGE_META: { number: number; name: string; description: string }[] = [
  {
    number: 1,
    name: "Finding Your Voice",
    description: "Build the basics — breath, range, and matching single notes.",
  },
  {
    number: 2,
    name: "Intervals & Independence",
    description: "Navigate between notes and learn to hold pitch on your own.",
  },
];

export function getAllLevels(): Level[] {
  return ALL_LEVELS.sort((a, b) => a.stage - b.stage || a.order - b.order);
}

export function getStages(): Stage[] {
  const levels = getAllLevels();
  return STAGE_META.map((meta) => ({
    ...meta,
    levels: levels.filter((l) => l.stage === meta.number),
  }));
}

export function getLevelById(id: string): Level | undefined {
  return ALL_LEVELS.find((l) => l.id === id);
}

/**
 * Check if a level is unlocked given a set of completed level IDs.
 */
export function isLevelUnlocked(level: Level, completedIds: Set<string>): boolean {
  if (level.requires.length === 0) return true;
  return level.requires.every((req) => completedIds.has(req));
}
