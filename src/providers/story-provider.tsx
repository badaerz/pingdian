"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { acceptCandidate, appendDirectionMessage, confirmConsistencyReport, discardCandidate, restoreVersion, rollbackPreviousVersion, saveConsistencyReport, setImageGenerationSettings } from "@/lib/story-state";
import { createProjectDocument, createStoryStore, loadStoryStore, saveStoryStore, type ProjectDocument, type StoryStore } from "@/lib/story-store";
import type { ConsistencyReport, ImageGenerationSettings, Project, StoryDirectionMessage, StoryState } from "@/lib/types";
import { clearAssetBlobs } from "@/lib/assets/indexed-db";
import { initialStoryState } from "@/data/mock-data";
import { canMutateDemoState, isDemoLocked } from "@/lib/demo-mode";

const TRAINING_HISTORY_KEY = "story-forge:training:v1";
const APP_STORAGE_PREFIX = "story-forge:";

export type SyncStatus = "disabled" | "connecting" | "synced" | "offline";

interface AiRunInput {
  projectId?: string;
  task: string;
  mode: string;
  request: unknown;
  result: unknown;
}

export interface TrainingHistoryItem {
  id: string;
  exerciseId: string;
  title: string;
  date: string;
  note: string;
  answer: string;
  feedback: unknown;
  attemptNo?: number;
  previousAttemptId?: string;
  scores?: Array<{ dimension: string; score: number; reason?: string }>;
  evidenceQuotes?: string[];
  sourceDiagnosticId?: string;
  referenceId?: string;
}

interface StoryContextValue {
  state: StoryState;
  documents: StoryStore["documents"];
  setState: React.Dispatch<React.SetStateAction<StoryState>>;
  accept: (id: string, content?: string) => void;
  discard: (id: string) => void;
  restore: (id: string) => void;
  rollbackPrevious: () => void;
  appendDirectionMessage: (message: StoryDirectionMessage) => void;
  setImageGenerationSettings: (settings: ImageGenerationSettings) => void;
  saveConsistencyReport: (report: ConsistencyReport) => void;
  confirmConsistencyReport: (candidateId: string, confirmation?: ConsistencyReport["userConfirmation"]) => void;
  createProject: (input: Pick<Project, "title" | "genre" | "logline">, seed?: Partial<Pick<ProjectDocument, "chapters" | "characters" | "worldEntries" | "blueprint" | "workflowStage" | "contextRevision">>) => string;
  removeProject: (id: string) => void;
  selectProject: (id: string) => void;
  reset: () => void;
  syncStatus: SyncStatus;
  trainingHistory: TrainingHistoryItem[];
  recordTrainingAttempt: (input: Omit<TrainingHistoryItem, "id" | "date">) => void;
  clearTrainingHistory: () => void;
  clearLocalUserData: () => Promise<void>;
  recordAiRun: (input: AiRunInput) => void;
  demoLocked: boolean;
}

const StoryContext = createContext<StoryContextValue | null>(null);

function toStoryState(store: StoryStore, requestedProjectId: string): StoryState {
  const document = store.documents[requestedProjectId] ?? Object.values(store.documents)[0];
  if (!document) return initialStoryState;
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
  const [activeProjectId, setActiveProjectId] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [trainingHistory, setTrainingHistory] = useState<TrainingHistoryItem[]>([]);
  const demoLocked = isDemoLocked();
  const trainingHistoryRef = useRef(trainingHistory);

  useEffect(() => {
    const saved = loadStoryStore();
    queueMicrotask(() => {
      if (saved) setStore(saved);
      const savedTraining = window.localStorage.getItem(TRAINING_HISTORY_KEY);
      if (savedTraining) {
        try {
          const parsed = JSON.parse(savedTraining) as TrainingHistoryItem[];
          if (Array.isArray(parsed)) {
            trainingHistoryRef.current = parsed;
            setTrainingHistory(parsed);
          }
        } catch { /* keep an empty local history */ }
      }
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (hydrated) saveStoryStore(store);
  }, [hydrated, store]);

  useEffect(() => {
    if (hydrated && typeof window !== "undefined") window.localStorage.setItem(TRAINING_HISTORY_KEY, JSON.stringify(trainingHistory));
  }, [hydrated, trainingHistory]);

  useEffect(() => {
    trainingHistoryRef.current = trainingHistory;
  }, [trainingHistory]);

  const state = useMemo(() => toStoryState(store, activeProjectId), [activeProjectId, store]);
  const setState = useCallback<React.Dispatch<React.SetStateAction<StoryState>>>((action) => {
    setStore((current) => {
      const currentState = toStoryState(current, activeProjectId);
      const nextState = typeof action === "function" ? action(currentState) : action;
      if (!canMutateDemoState(currentState, nextState, demoLocked)) return current;
      return updateActiveDocument(current, nextState);
    });
  }, [activeProjectId, demoLocked]);

  const value = useMemo<StoryContextValue>(() => ({
    state,
    documents: store.documents,
    setState,
    accept: (id, content) => setState((current) => acceptCandidate(current, id, content)),
    discard: (id) => setState((current) => discardCandidate(current, id)),
    restore: (id) => setState((current) => restoreVersion(current, id)),
    rollbackPrevious: () => setState((current) => rollbackPreviousVersion(current)),
    appendDirectionMessage: (message) => setState((current) => appendDirectionMessage(current, message)),
    setImageGenerationSettings: (settings) => setState((current) => setImageGenerationSettings(current, settings)),
    saveConsistencyReport: (report) => setState((current) => saveConsistencyReport(current, report)),
    confirmConsistencyReport: (candidateId, confirmation) => setState((current) => confirmConsistencyReport(current, candidateId, confirmation)),
    createProject: (input, seed) => {
      const base = createProjectDocument(input);
      const chapters = seed?.chapters ?? base.chapters;
      const document: ProjectDocument = {
        ...base,
        ...seed,
        activeChapterId: chapters[0]?.id ?? base.activeChapterId,
        chapters,
        project: { ...base.project, wordCount: chapters.reduce((total, chapter) => total + chapter.wordCount, 0), status: "writing" },
      };
      setStore((current) => ({ ...current, documents: { ...current.documents, [document.project.id]: document } }));
      setActiveProjectId(document.project.id);
      return document.project.id;
    },
    removeProject: (id) => {
      setStore((current) => {
        if (!current.documents[id]) return current;
        const documents = { ...current.documents };
        delete documents[id];
        if (activeProjectId === id) setActiveProjectId(Object.keys(documents)[0] ?? "");
        return { ...current, documents };
      });
    },
    selectProject: (id) => { if (store.documents[id]) setActiveProjectId(id); },
    reset: () => { setStore(createStoryStore()); setActiveProjectId(""); },
    syncStatus: "disabled",
    trainingHistory,
    recordTrainingAttempt: (input) => {
      const previous = trainingHistoryRef.current.find((attempt) => attempt.exerciseId === input.exerciseId);
      const local: TrainingHistoryItem = { ...input, previousAttemptId: input.previousAttemptId ?? previous?.id, id: crypto.randomUUID(), date: "刚刚" };
      const nextHistory = [local, ...trainingHistoryRef.current];
      trainingHistoryRef.current = nextHistory;
      setTrainingHistory(nextHistory);
      setState((current) => ({ ...current, trainingAttemptRefs: [...current.trainingAttemptRefs, local.id] }));
    },
    clearTrainingHistory: () => {
      trainingHistoryRef.current = [];
      setTrainingHistory([]);
      setStore((current) => ({
        ...current,
        documents: Object.fromEntries(Object.entries(current.documents).map(([id, document]) => [id, { ...document, trainingAttemptRefs: [] }])),
      }));
    },
    clearLocalUserData: async () => {
      if (typeof window !== "undefined") {
        for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
          const key = window.localStorage.key(index);
          if (key?.startsWith(APP_STORAGE_PREFIX) || (key?.startsWith("sb-") && key.endsWith("-auth-token"))) {
            window.localStorage.removeItem(key);
          }
        }
      }
      const cleanStore = createStoryStore();
      trainingHistoryRef.current = [];
      setTrainingHistory([]);
      setStore(cleanStore);
      setActiveProjectId("");
      await clearAssetBlobs();
    },
    recordAiRun: () => undefined,
    demoLocked,
  }), [activeProjectId, demoLocked, setState, state, store, trainingHistory]);
  return <StoryContext.Provider value={value}>{children}</StoryContext.Provider>;
}

export function useStory() {
  const context = useContext(StoryContext);
  if (!context) throw new Error("useStory must be used inside StoryProvider");
  return context;
}

export function useStoryOptional() {
  return useContext(StoryContext);
}
