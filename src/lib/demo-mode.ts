const DEFENSE_PROJECT_IDS = new Set(["demo", "demo-demo_002"]);
const PROTECTED_STATE_KEYS = [
  "chapters",
  "characters",
  "worldEntries",
  "blueprint",
  "versions",
] as const;

type DemoStateShape = {
  activeProjectId: string;
  chapters?: unknown;
  characters?: unknown;
  worldEntries?: unknown;
  blueprint?: unknown;
  versions?: unknown;
  candidates?: unknown;
  analysisSnapshots?: unknown;
};

export function isDemoLocked(environment?: Record<string, string | undefined>) {
  const value = environment
    ? environment.NEXT_PUBLIC_DEMO_LOCKED
    : process.env.NEXT_PUBLIC_DEMO_LOCKED;
  return value === "true";
}

export function isDefenseProjectId(projectId: string) {
  return DEFENSE_PROJECT_IDS.has(projectId);
}

export function canMutateDemoState(current: DemoStateShape, next: DemoStateShape, _locked = isDemoLocked()) {
  void _locked;

  if (!isDefenseProjectId(current.activeProjectId)) return true;
  return PROTECTED_STATE_KEYS.every((key) => current[key] === next[key]);
}
