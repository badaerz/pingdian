export type SaveStatus = "idle" | "saving" | "saved" | "failed";
export type CandidateStatus = "pending" | "accepted" | "discarded";
export type EvidenceSource = "user" | "knowledge" | "inference";

export interface Project {
  id: string;
  title: string;
  genre: string;
  logline: string;
  updatedAt: string;
  wordCount: number;
  status: "writing" | "analysis" | "draft";
}

export interface Chapter {
  id: string;
  title: string;
  content: string;
  wordCount: number;
}

export interface Character {
  id: string;
  name: string;
  role: string;
  desire: string;
  flaw: string;
  arc: string;
}

export interface BlueprintNode {
  id: string;
  title: string;
  beatType: string;
  summary: string;
  active?: boolean;
}

export interface Candidate {
  id: string;
  label: string;
  content: string;
  rationale: string;
  tags: string[];
  status: CandidateStatus;
}

export interface Version {
  id: string;
  versionNo: number;
  content: string;
  source: "manual" | "candidate" | "restore-snapshot";
  createdAt: string;
}

export interface Evidence {
  id: string;
  source: EvidenceSource;
  quote: string;
  note: string;
  chapter: string;
}

export interface AnalysisDimension {
  id: string;
  name: string;
  summary: string;
  impact: string;
  suggestion: string;
  score: number;
  evidenceIds: string[];
}

export interface GraphNode {
  id: string;
  label: string;
  type: "work" | "author" | "era" | "theme" | "technique" | "character";
  era?: string;
  themes?: string[];
  techniques?: string[];
  description?: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label: string;
}

export interface KnowledgeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface StoryState {
  projects: Project[];
  activeProjectId: string;
  chapters: Chapter[];
  characters: Character[];
  world: { era: string; place: string; rules: string; atmosphere: string };
  blueprint: BlueprintNode[];
  candidates: Candidate[];
  versions: Version[];
  evidence: Evidence[];
  analysis: AnalysisDimension[];
  characterGraph: KnowledgeGraph;
  knowledge: KnowledgeGraph;
  plotCurve: Array<{ beat: string; value: number; evidenceId: string }>;
  emotionCurve: Array<{ beat: string; value: number; evidenceId: string }>;
}
