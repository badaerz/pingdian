"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { acceptCandidate, discardCandidate, restoreVersion } from "@/lib/story-state";
import { createProjectDocument, createStoryStore, loadStoryStore, saveStoryStore, type StoryStore } from "@/lib/story-store";
import type { Project, StoryState } from "@/lib/types";

interface StoryContextValue {
  state: StoryState;
  setState: React.Dispatch<React.SetStateAction<StoryState>>;
  accept: (id: string, content?: string) => void;
  discard: (id: string) => void;
  restore: (id: string) => void;
  createProject: (input: Pick<Project, "title" | "genre" | "logline">) => string;
  selectProject: (id: string) => void;
  reset: () => void;
}

const StoryContext = createContext<StoryContextValue | null>(null);

function toStoryState(store: StoryStore, requestedProjectId: string): StoryState {
  const document = store.documents[requestedProjectId] ?? store.documents.demo ?? Object.values(store.documents)[0];
  if (!document) throw new Error("Story store has no project documents");
  const { project, ...content } = document;
  return {
    ...content,
    projects: Object.values(store.documents).map((item) => item.project),
    activeProjectId: project.id,
  };
}

function updateActiveDocument(store: StoryStore, state: StoryState): StoryStore {
  const { projects, activeProjectId, ...document } = state;
  const current = store.documents[activeProjectId];
  if (!current) return store;
  const project = projects.find((item) => item.id === activeProjectId) ?? current.project;
  return { ...store, documents: { ...store.documents, [activeProjectId]: { ...document, project } } };
}

export function StoryProvider({ children }: { children: React.ReactNode }) {
  const [store, setStore] = useState<StoryStore>(() => createStoryStore());
  const [activeProjectId, setActiveProjectId] = useState("demo");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const saved = loadStoryStore();
    queueMicrotask(() => {
      if (saved) setStore(saved);
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (hydrated) saveStoryStore(store);
  }, [hydrated, store]);

  const state = useMemo(() => toStoryState(store, activeProjectId), [activeProjectId, store]);
  const setState = useCallback<React.Dispatch<React.SetStateAction<StoryState>>>((action) => {
    setStore((current) => {
      const currentState = toStoryState(current, activeProjectId);
      const nextState = typeof action === "function" ? action(currentState) : action;
      return updateActiveDocument(current, nextState);
    });
  }, [activeProjectId]);

  const value = useMemo<StoryContextValue>(() => ({
    state,
    setState,
    accept: (id, content) => setState((current) => acceptCandidate(current, id, content)),
    discard: (id) => setState((current) => discardCandidate(current, id)),
    restore: (id) => setState((current) => restoreVersion(current, id)),
    createProject: (input) => {
      const document = createProjectDocument(input);
      setStore((current) => ({ ...current, documents: { ...current.documents, [document.project.id]: document } }));
      setActiveProjectId(document.project.id);
      return document.project.id;
    },
    selectProject: (id) => { if (store.documents[id]) setActiveProjectId(id); },
    reset: () => { setStore(createStoryStore()); setActiveProjectId("demo"); },
  }), [setState, state, store]);
  return <StoryContext.Provider value={value}>{children}</StoryContext.Provider>;
}

export function useStory() {
  const context = useContext(StoryContext);
  if (!context) throw new Error("useStory must be used inside StoryProvider");
  return context;
}
