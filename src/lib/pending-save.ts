export interface PendingChapterSave {
  projectId: string;
  chapterId: string;
  content: string;
}

interface PendingSaveCoordinator {
  schedule: (draft: PendingChapterSave, save: (draft: PendingChapterSave) => void) => void;
  resolveBeforeAccept: (target: Pick<PendingChapterSave, "projectId" | "chapterId">, storedContent: (draft: PendingChapterSave) => string | undefined) => { kind: "accept" } | { kind: "flush"; draft: PendingChapterSave };
  flushProject: (projectId: string) => void;
  dispose: () => void;
}

export function createPendingSaveCoordinator(delay = 500): PendingSaveCoordinator {
  const pending = new Map<string, { draft: PendingChapterSave; save: (draft: PendingChapterSave) => void; timer: ReturnType<typeof setTimeout> }>();
  const keyFor = ({ projectId, chapterId }: Pick<PendingChapterSave, "projectId" | "chapterId">) => `${projectId}\u0000${chapterId}`;
  const flush = (key: string) => {
    const current = pending.get(key);
    if (!current) return;
    pending.delete(key);
    clearTimeout(current.timer);
    current.save(current.draft);
  };
  return {
    schedule: (draft, save) => {
      const key = keyFor(draft);
      const existing = pending.get(key);
      if (existing) clearTimeout(existing.timer);
      const timer = setTimeout(() => {
        flush(key);
      }, delay);
      pending.set(key, { draft, save, timer });
    },
    resolveBeforeAccept: (target, storedContent) => {
      const key = keyFor(target);
      const current = pending.get(key);
      if (!current) return { kind: "accept" };
      pending.delete(key);
      clearTimeout(current.timer);
      if (storedContent(current.draft) !== current.draft.content) {
        return { kind: "flush", draft: current.draft };
      }
      return { kind: "accept" };
    },
    flushProject: (projectId) => {
      [...pending.entries()].filter(([, current]) => current.draft.projectId === projectId).forEach(([key]) => flush(key));
    },
    dispose: () => {
      [...pending.keys()].forEach(flush);
    },
  };
}
