"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { initialStoryState } from "@/data/mock-data";
import { acceptCandidate, discardCandidate, restoreVersion } from "@/lib/story-state";
import type { StoryState } from "@/lib/types";

interface StoryContextValue {
  state: StoryState;
  setState: React.Dispatch<React.SetStateAction<StoryState>>;
  accept: (id: string, content?: string) => void;
  discard: (id: string) => void;
  restore: (id: string) => void;
  reset: () => void;
}

const StoryContext = createContext<StoryContextValue | null>(null);

export function StoryProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<StoryState>(() => structuredClone(initialStoryState));
  const value = useMemo<StoryContextValue>(() => ({
    state,
    setState,
    accept: (id, content) => setState((current) => acceptCandidate(current, id, content)),
    discard: (id) => setState((current) => discardCandidate(current, id)),
    restore: (id) => setState((current) => restoreVersion(current, id)),
    reset: () => setState(structuredClone(initialStoryState)),
  }), [state]);
  return <StoryContext.Provider value={value}>{children}</StoryContext.Provider>;
}

export function useStory() {
  const context = useContext(StoryContext);
  if (!context) throw new Error("useStory must be used inside StoryProvider");
  return context;
}
