import { beforeEach, describe, expect, it } from "vitest";
import {
  LEGACY_STORY_STORE_KEY,
  PREVIOUS_STORY_STORE_KEY,
  STORY_STORE_KEY,
  createProjectDocument,
  createStoryStore,
  loadStoryStore,
  reconcileStoryStore,
  saveStoryStore,
} from "@/lib/story-store";
import { acceptCandidate } from "@/lib/story-state";
import { createAnalysisSnapshot } from "@/lib/analysis/snapshot";
import { fixtureForTask } from "@/lib/ai/fixtures";
import { contextFromState } from "@/lib/ai/story-context";
import { initialStoryState } from "@/data/mock-data";
import type { LiteraryAnalysisResult, StoryState } from "@/lib/types";

describe("story store", () => {
  beforeEach(() => localStorage.clear());

  it("persists a new project's independent chapter and setup data", () => {
    const store = createStoryStore();
    const document = createProjectDocument({
      title: "潮汐日记",
      genre: "纯文学短篇",
      logline: "一名潜水员在退潮后发现一座倒置的房子。",
    });
    document.chapters[0].content = "第一段正文";
    document.worldEntries[0].content = "海边小镇";
    store.documents[document.project.id] = document;

    saveStoryStore(store);

    const restored = loadStoryStore();
    expect(restored?.documents[document.project.id].chapters[0].content).toBe("第一段正文");
    expect(restored?.documents[document.project.id].worldEntries[0].content).toBe("海边小镇");
    expect(restored?.version).toBe(3);
  });

  it("migrates legacy asset generationSettings to sanitized requestedSettings and persists only the current contract", () => {
    const store = createStoryStore();
    const legacyAsset = {
      id: "asset-legacy-settings",
      kind: "poster",
      title: "旧版海报候选",
      characterId: "char-legacy",
      mode: "demo",
      previewUrl: "/visuals/ip-lab-poster.webp",
      createdAt: "2026-08-20T00:00:00.000Z",
      confirmed: true,
      generationSettings: {
        prompt: "旧版正向词",
        negativePrompt: "旧版负向词",
        model: "Qwen/Qwen-Image",
        size: "928x1664",
        advanced: { steps: 31, seed: 8, nested: { mustDrop: true } },
        secretNestedField: "must-drop",
      },
      providerRequest: { model: "Qwen/Qwen-Image", prompt: "旧版正向词", authorization: "must-drop" },
      runtimeOnly: { mustDrop: true },
    };
    const document = structuredClone(store.documents.demo) as unknown as Record<string, unknown>;
    document.ipAssets = [legacyAsset];

    const reconciled = reconcileStoryStore({ version: 3, documents: { demo: document } } as unknown as Parameters<typeof reconcileStoryStore>[0]);
    const migrated = reconciled.documents.demo.ipAssets[0];

    expect(migrated.requestedSettings).toEqual({
      prompt: "旧版正向词",
      negativePrompt: "旧版负向词",
      model: "Qwen/Qwen-Image",
      size: "928x1664",
      advanced: { steps: 31, seed: 8 },
    });
    expect(migrated).toMatchObject({ kind: "poster", title: "旧版海报候选", characterId: "char-legacy" });
    expect(migrated).not.toHaveProperty("generationSettings");
    expect(migrated.providerRequest).toEqual({ model: "Qwen/Qwen-Image", prompt: "旧版正向词" });
    expect(migrated).not.toHaveProperty("runtimeOnly");

    saveStoryStore(reconciled);
    const persisted = JSON.parse(localStorage.getItem(STORY_STORE_KEY) ?? "{}") as { documents: { demo: { ipAssets: Array<Record<string, unknown>> } } };
    expect(persisted.documents.demo.ipAssets[0]).toHaveProperty("requestedSettings");
    expect(persisted.documents.demo.ipAssets[0]).not.toHaveProperty("generationSettings");
    expect(loadStoryStore()?.documents.demo.ipAssets[0]).toEqual(migrated);
  });

  it("falls back to a fresh store when cached data is invalid", () => {
    localStorage.setItem(STORY_STORE_KEY, "not-json");

    const restored = loadStoryStore();

    expect(restored).toBeNull();
  });

  it("uses 回响的草场 as the primary demo and 雾港来信 as a regression case", () => {
    const store = createStoryStore();
    const projects = Object.values(store.documents).map((document) => document.project);

    expect(projects[0]?.title).toBe("回响的草场");
    expect(projects.some((project) => project.title === "雾港来信")).toBe(true);
    expect(store.documents.demo.characters.map((character) => character.name)).toContain("杭盖");
    expect(store.documents.demo.dialogueThreads).toEqual([]);
    expect(store.documents.demo.imageGenerationSettings?.model).toBe("Qwen/Qwen-Image");
    expect(store.documents.demo.analysisSnapshots).toEqual([]);
    expect(store.documents.demo.consistencyReports).toEqual([]);
    expect(store.documents.demo.trainingAttemptRefs).toEqual([]);
  });

  it("restores the canonical regression case when a legacy demo id was overwritten", () => {
    const current = createStoryStore();
    const legacyRegression = structuredClone(current.documents["demo-demo_002"]);
    legacyRegression.project.id = "demo";
    legacyRegression.chapters[0].content = `${legacyRegression.chapters[0].content}\n\n已删除的段落`;
    localStorage.setItem(LEGACY_STORY_STORE_KEY, JSON.stringify({
      version: 1,
      documents: { demo: legacyRegression },
    }));

    const restored = loadStoryStore();

    expect(restored?.documents.demo.project.title).toBe("回响的草场");
    expect(restored?.documents["demo-demo_002"].project.id).toBe("demo-demo_002");
    expect(restored?.documents["demo-demo_002"].chapters[0].content).toBe(current.documents["demo-demo_002"].chapters[0].content);
    expect(restored?.documents["demo-demo_002"].worldEntries.map((entry) => entry.category)).toEqual(["时代", "地点", "规则", "氛围"]);
    expect(restored?.documents["demo-demo_002"].contextRevision).toBe(1);
    expect(localStorage.getItem(LEGACY_STORY_STORE_KEY)).not.toBeNull();
    expect(localStorage.getItem(STORY_STORE_KEY)).not.toBeNull();
  });

  it("restores canonical builtin chapter titles and order", () => {
    const canonical = createStoryStore();
    const savedDemo = structuredClone(canonical.documents.demo);
    savedDemo.chapters[0].title = "第一章";
    savedDemo.chapters[0].order = 17;

    const restored = reconcileStoryStore({ version: 3, documents: { demo: savedDemo } });
    const fallback = reconcileStoryStore({ version: 3, documents: {} });

    expect(restored.documents.demo.chapters[0].title).toBe(canonical.documents.demo.chapters[0].title);
    expect(restored.documents.demo.chapters[0].order).toBe(canonical.documents.demo.chapters[0].order);
    expect(fallback.documents.demo.chapters[0].title).toBe(canonical.documents.demo.chapters[0].title);
  });

  it("creates editable ordered records and starts new work in the wizard", () => {
    const document = createProjectDocument({ title: "潮汐日记", genre: "短篇", logline: "退潮后的房子" });

    expect(document.activeChapterId).toBe(document.chapters[0].id);
    expect(document.chapters[0]).toMatchObject({ order: 0, summary: "" });
    expect(document.worldEntries).toHaveLength(4);
    expect(document.contextRevision).toBe(1);
    expect(document.workflowStage).toBe("inspiration");
    expect(document.ipAssets).toEqual([]);
    expect(document.dialogueThreads).toEqual([]);
    expect(document.imageGenerationSettings).toEqual({
      prompt: "",
      negativePrompt: "",
      model: "Qwen/Qwen-Image",
      size: "1328x1328",
      advanced: {},
    });
    expect(document.analysisSnapshots).toEqual([]);
    expect(document.consistencyReports).toEqual([]);
    expect(document.trainingAttemptRefs).toEqual([]);
  });

  it("migrates v2 documents without changing authored content", () => {
    const current = createStoryStore();
    const legacyDocument = structuredClone(current.documents.demo);
    const legacyRecord = legacyDocument as unknown as Record<string, unknown>;
    delete legacyRecord.dialogueThreads;
    delete legacyRecord.imageGenerationSettings;
    delete legacyRecord.analysisSnapshots;
    delete legacyRecord.consistencyReports;
    delete legacyRecord.trainingAttemptRefs;
    legacyDocument.project.id = "project-v2";
    legacyDocument.chapters[0].title = "用户自定义章名";
    legacyDocument.chapters[0].content = "作者章节原文";
    legacyDocument.chapters[0].order = 12;
    legacyDocument.characters[0].notes = "作者人物备注";
    legacyDocument.characters[0].order = 8;
    legacyDocument.blueprint[0].summary = "作者蓝图摘要";
    legacyDocument.blueprint[0].order = 20;
    const authored = {
      chapters: structuredClone(legacyDocument.chapters),
      characters: structuredClone(legacyDocument.characters),
      blueprint: structuredClone(legacyDocument.blueprint),
      candidates: structuredClone(legacyDocument.candidates),
      versions: structuredClone(legacyDocument.versions),
    };

    const migrated = reconcileStoryStore({
      version: 2,
      documents: { "project-v2": legacyDocument },
    } as Parameters<typeof reconcileStoryStore>[0]);
    const document = migrated.documents["project-v2"];

    expect(migrated.version).toBe(3);
    expect(document.chapters).toEqual(authored.chapters);
    expect(document.characters).toEqual(authored.characters);
    expect(document.blueprint).toEqual(authored.blueprint);
    expect(document.candidates).toEqual(authored.candidates);
    expect(document.versions).toEqual(authored.versions);
    expect(document.dialogueThreads).toEqual([]);
    expect(document.imageGenerationSettings).toEqual({
      prompt: "",
      negativePrompt: "",
      model: "Qwen/Qwen-Image",
      size: "1328x1328",
      advanced: {},
    });
    expect(document.analysisSnapshots).toEqual([]);
    expect(document.consistencyReports).toEqual([]);
    expect(document.trainingAttemptRefs).toEqual([]);
  });

  it("drops runtime-only fields during migration and direct persistence", () => {
    const current = createStoryStore();
    const trainingObject = { answer: "完整训练答案", feedback: { score: 99 } };
    const unsafeDocument = {
      ...structuredClone(current.documents.demo),
      project: { ...current.documents.demo.project, id: "project-whitelist" },
      sourceText: "临时上传原文",
      uploadedText: "浏览器会话文本",
      retrievalEvidence: [{ content: "RAG 片段" }],
      trainingAnswers: [{ answer: "完整练习答案" }],
      arbitraryRuntimeField: { secret: true },
    };
    unsafeDocument.chapters[0] = { ...unsafeDocument.chapters[0], sourceText: "章节注入" } as typeof unsafeDocument.chapters[0];
    unsafeDocument.candidates[0] = { ...unsafeDocument.candidates[0], tags: ["合法候选标签", trainingObject, 7], retrievalEvidence: [{ content: "候选注入" }] } as unknown as typeof unsafeDocument.candidates[0];
    unsafeDocument.analysis[0] = { ...unsafeDocument.analysis[0], evidenceIds: ["E1", trainingObject, 8] } as unknown as typeof unsafeDocument.analysis[0];
    const graphEdge = unsafeDocument.characterGraph.edges[0] ?? { id: "edge-filter", source: "source", target: "target", label: "关系" };
    unsafeDocument.characterGraph.edges[0] = { ...graphEdge, sourceEvidenceIds: ["E1", trainingObject, 9] } as unknown as typeof graphEdge;
    unsafeDocument.dialogueThreads = [{ id: "message-nested", role: "user", content: "合法消息", tags: ["合法消息标签", trainingObject, 10], createdAt: "刚刚", contextRevision: 1, uploadedText: "消息注入" } as unknown as typeof unsafeDocument.dialogueThreads[number]];
    unsafeDocument.trainingAttemptRefs = ["attempt-safe", trainingObject, 11] as unknown as string[];
    unsafeDocument.consistencyReports = [{
      candidateId: unsafeDocument.candidates[0].id,
      contextRevision: 1,
      findings: [{ id: "finding-nested", category: "plot", severity: "medium", expectedFact: "合法事实", candidateQuote: "合法引用", priorEvidence: "合法证据", suggestion: "合法建议", unknown: "finding 注入" }],
      checkedAt: "刚刚",
      mode: "live",
      userConfirmation: "none",
    } as unknown as typeof unsafeDocument.consistencyReports[number]];
    const unsafeStore = { version: 3 as const, documents: { "project-whitelist": unsafeDocument } };

    const migrated = reconcileStoryStore(unsafeStore as unknown as Parameters<typeof reconcileStoryStore>[0]);
    const migratedRecord = migrated.documents["project-whitelist"] as unknown as Record<string, unknown>;
    const document = migrated.documents["project-whitelist"];
    expect(migratedRecord.project).toEqual(unsafeDocument.project);
    expect(migratedRecord).not.toHaveProperty("sourceText");
    expect(migratedRecord).not.toHaveProperty("uploadedText");
    expect(migratedRecord).not.toHaveProperty("retrievalEvidence");
    expect(migratedRecord).not.toHaveProperty("trainingAnswers");
    expect(migratedRecord).not.toHaveProperty("arbitraryRuntimeField");
    expect(document.chapters[0]).not.toHaveProperty("sourceText");
    expect(document.chapters[0].content).toBe(unsafeDocument.chapters[0].content);
    expect(document.candidates[0]).not.toHaveProperty("retrievalEvidence");
    expect(document.candidates[0].content).toBe(unsafeDocument.candidates[0].content);
    expect(document.candidates[0].tags).toEqual(["合法候选标签"]);
    expect(document.analysis[0].evidenceIds).toEqual(["E1"]);
    expect(document.characterGraph.edges[0].sourceEvidenceIds).toEqual(["E1"]);
    expect(document.dialogueThreads[0]).not.toHaveProperty("uploadedText");
    expect(document.dialogueThreads[0].content).toBe("合法消息");
    expect(document.dialogueThreads[0].tags).toEqual(["合法消息标签"]);
    expect(document.trainingAttemptRefs).toEqual(["attempt-safe"]);
    expect(document.consistencyReports[0].findings[0]).not.toHaveProperty("unknown");
    expect(document.consistencyReports[0].findings[0].suggestion).toBe("合法建议");

    saveStoryStore(unsafeStore as unknown as Parameters<typeof saveStoryStore>[0]);
    const persisted = JSON.parse(localStorage.getItem(STORY_STORE_KEY) ?? "null").documents["project-whitelist"];
    expect(persisted).not.toHaveProperty("sourceText");
    expect(persisted).not.toHaveProperty("uploadedText");
    expect(persisted).not.toHaveProperty("retrievalEvidence");
    expect(persisted).not.toHaveProperty("trainingAnswers");
    expect(persisted).not.toHaveProperty("arbitraryRuntimeField");
    expect(JSON.stringify(persisted)).not.toContain("完整训练答案");
  });

  it("drops malformed nested dialogue and consistency records without losing healthy records or projects", () => {
    const current = createStoryStore();
    const healthy = structuredClone(current.documents.demo);
    healthy.project = { ...healthy.project, id: "project-healthy", title: "完整项目" };
    healthy.chapters[0].content = "必须保留的其他项目正文";
    const mixed = structuredClone(current.documents.demo);
    mixed.project = { ...mixed.project, id: "project-mixed", title: "混合记录项目" };
    const candidateId = mixed.candidates[0].id;
    const validMessage = { id: "message-good", role: "user" as const, content: "保留这条讨论", tags: ["推进冲突"], createdAt: "刚刚", contextRevision: mixed.contextRevision };
    mixed.candidates[0].generatedRevision = mixed.contextRevision;
    const malformedReportCandidate = { ...mixed.candidates[0], id: "candidate-malformed-report", label: "仅有畸形报告的候选" };
    mixed.candidates.push(malformedReportCandidate);
    const validFinding = { id: "finding-good", category: "plot" as const, severity: "low" as const, expectedFact: "已建立事实", candidateQuote: "候选引用", priorEvidence: "既有证据", suggestion: "保留因果链" };
    const validReport = { candidateId, contextRevision: mixed.contextRevision, findings: [validFinding], checkedAt: "刚刚", mode: "demo" as const, userConfirmation: "none" as const };
    const validSnapshot = {
      id: "snapshot-good",
      contextRevision: mixed.contextRevision,
      createdAt: "刚刚",
      mode: "demo" as const,
      analysis: structuredClone(mixed.analysis),
      characterGraph: structuredClone(mixed.characterGraph),
      plotCurve: structuredClone(mixed.plotCurve),
      emotionCurve: structuredClone(mixed.emotionCurve),
    };
    const unsafeMixed = mixed as unknown as Record<string, unknown>;
    unsafeMixed.dialogueThreads = [
      validMessage,
      null,
      { id: 7, role: "user", content: "坏消息", tags: [], createdAt: "刚刚", contextRevision: 1 },
      { ...validMessage, id: "message-bad-direction", role: "assistant", direction: { understanding: "缺字段" } },
    ];
    unsafeMixed.consistencyReports = [
      validReport,
      null,
      { ...validReport, candidateId: 8 },
      { ...validReport, checkedAt: "全坏 finding", findings: [null, { ...validFinding, severity: "critical" }] },
      { ...validReport, candidateId: malformedReportCandidate.id, checkedAt: "稍后", findings: [validFinding, { ...validFinding, id: "finding-bad-high", severity: "high", candidateQuote: 42 }] },
    ];
    unsafeMixed.analysisSnapshots = [validSnapshot, null, { ...validSnapshot, id: 9 }];
    unsafeMixed.imageGenerationSettings = { prompt: "保留提示词", negativePrompt: "水印", model: "image-model", size: "1024x1024", advanced: { steps: 30, unsafe: { nested: true } } };
    unsafeMixed.trainingAttemptRefs = ["attempt-good", null, { answer: "不得持久化" }];
    localStorage.setItem(STORY_STORE_KEY, JSON.stringify({ version: 3, documents: { "project-healthy": healthy, "project-mixed": mixed } }));

    const restored = loadStoryStore();

    expect(restored).not.toBeNull();
    expect(restored?.documents["project-healthy"].chapters[0].content).toBe("必须保留的其他项目正文");
    expect(restored?.documents["project-mixed"].dialogueThreads).toEqual([validMessage]);
    expect(restored?.documents["project-mixed"].consistencyReports).toEqual([validReport]);
    expect(restored?.documents["project-mixed"].analysisSnapshots).toEqual([validSnapshot]);
    expect(restored?.documents["project-mixed"].imageGenerationSettings.advanced).toEqual({ steps: 30 });
    expect(restored?.documents["project-mixed"].trainingAttemptRefs).toEqual(["attempt-good"]);
    const restoredDocument = restored!.documents["project-mixed"];
    const { project, ...documentState } = restoredDocument;
    const storyState: StoryState = { ...documentState, projects: [project], activeProjectId: project.id };
    expect(acceptCandidate(storyState, malformedReportCandidate.id)).toBe(storyState);
  });

  it("fills missing image setting fields without replacing existing values", () => {
    const current = createStoryStore();
    const document = {
      ...structuredClone(current.documents.demo),
      project: { ...current.documents.demo.project, id: "project-image-settings" },
      imageGenerationSettings: { prompt: "保留提示词", advanced: { steps: 31, enhance: true } },
    };

    const migrated = reconcileStoryStore({ version: 2, documents: { "project-image-settings": document } } as unknown as Parameters<typeof reconcileStoryStore>[0]);

    expect(migrated.documents["project-image-settings"].imageGenerationSettings).toEqual({
      prompt: "保留提示词",
      negativePrompt: "",
      model: "Qwen/Qwen-Image",
      size: "1328x1328",
      advanced: { steps: 31, enhance: true },
    });
  });

  it("preserves existing v3 extension fields", () => {
    const current = createStoryStore();
    const candidateId = current.documents.demo.candidates[0].id;
    const context = contextFromState(initialStoryState);
    const sourceText = context.chapters[0].content;
    const result = fixtureForTask("analysis-v2", context, { sourceText, sourceKind: "narrative" }) as LiteraryAnalysisResult;
    const completeSnapshot = createAnalysisSnapshot({
      projectId: "demo",
      chapterId: current.documents.demo.chapters[0].id,
      sourceText,
      contextRevision: 7,
      mode: "live",
      warnings: ["分析降级提示"],
      result,
      id: "snapshot-1",
      now: "刚刚",
    });
    const document = {
      ...structuredClone(current.documents.demo),
      dialogueThreads: [{ id: "message-1", role: "user" as const, content: "保留这个方向", tags: ["克制"], createdAt: "刚刚", contextRevision: 7 }],
      imageGenerationSettings: { prompt: "草原上的旧矿场", negativePrompt: "文字", model: "custom-image", size: "1024x1024", advanced: { steps: 28 } },
      analysisSnapshots: [{ ...completeSnapshot, runtimeOnly: "must-drop" }],
      consistencyReports: [{ candidateId, contextRevision: 7, findings: [], checkedAt: "刚刚", mode: "live" as const, userConfirmation: "reviewed" as const }],
      trainingAttemptRefs: ["attempt-1"],
    };

    const reconciled = reconcileStoryStore({ version: 3, documents: { demo: document } } as unknown as Parameters<typeof reconcileStoryStore>[0]);

    expect(reconciled.version).toBe(3);
    expect(reconciled.documents.demo.dialogueThreads).toEqual(document.dialogueThreads);
    expect(reconciled.documents.demo.imageGenerationSettings).toEqual(document.imageGenerationSettings);
    const expectedSnapshot = { ...document.analysisSnapshots[0] };
    delete (expectedSnapshot as Record<string, unknown>).runtimeOnly;
    expect(reconciled.documents.demo.analysisSnapshots).toEqual([expectedSnapshot]);
    expect(reconciled.documents.demo.consistencyReports).toEqual(document.consistencyReports);
    expect(reconciled.documents.demo.trainingAttemptRefs).toEqual(document.trainingAttemptRefs);
  });

  it("drops each invalid v2 snapshot fail-closed while preserving another project's valid snapshot", () => {
    const store = createStoryStore();
    const context = contextFromState(initialStoryState);
    const sourceText = context.chapters[0].content;
    const result = fixtureForTask("analysis-v2", context, { sourceText, sourceKind: "narrative" }) as LiteraryAnalysisResult;
    const valid = createAnalysisSnapshot({ projectId: "demo", chapterId: "demo-chapter-1", sourceText, contextRevision: 3, mode: "live", warnings: [], result, id: "valid-analysis", now: "2026-08-21T00:00:00.000Z" });
    const invalidRange = structuredClone(valid);
    invalidRange.id = "invalid-range";
    invalidRange.themeHeatmap![0].value = 101;
    const invalidEndpoint = structuredClone(valid);
    invalidEndpoint.id = "invalid-endpoint";
    invalidEndpoint.characterGraph.edges[0].target = "missing-node";
    const invalidObservation = structuredClone(valid);
    invalidObservation.id = "invalid-observation";
    invalidObservation.evidence!.push({ id: "inference-only", source: "inference", claim: "不可作为用户派生图依据", note: "推断" });
    invalidObservation.characterGraph.nodes[0].evidenceIds = ["inference-only"];
    const invalidReference = structuredClone(valid);
    invalidReference.id = "invalid-reference";
    invalidReference.styleProfile!.metrics[0].evidenceIds = ["missing-evidence"];
    store.documents.demo.analysisSnapshots = [invalidRange, invalidEndpoint, invalidObservation, invalidReference];

    const other = createProjectDocument({ title: "保留项目", genre: "短篇", logline: "验证项目隔离" });
    const otherValid = structuredClone(valid);
    otherValid.id = "other-valid";
    otherValid.sourceProjectId = other.project.id;
    otherValid.sourceChapterId = other.chapters[0].id;
    other.analysisSnapshots = [otherValid];
    store.documents[other.project.id] = other;

    const reconciled = reconcileStoryStore(store);

    expect(reconciled.documents.demo.analysisSnapshots).toEqual([]);
    expect(reconciled.documents[other.project.id].analysisSnapshots).toHaveLength(1);
    expect(reconciled.documents[other.project.id].analysisSnapshots[0]).toMatchObject({ id: "other-valid", domainAnalysis: { kind: "narrative" } });
  });

  it("persists structured direction replies and assigns every migrated version to a chapter", () => {
    const current = createStoryStore();
    const document = structuredClone(current.documents.demo);
    document.dialogueThreads = [{
      id: "assistant-direction",
      role: "assistant",
      content: "先让人物做出不可撤回的选择。",
      tags: ["推进冲突"],
      createdAt: "刚刚",
      contextRevision: document.contextRevision,
      mode: "demo",
      warnings: ["离线演示结果"],
      direction: {
        understanding: "人物正处于回避与行动之间。",
        recommendation: "先让人物做出不可撤回的选择。",
        risks: ["避免过早解释"],
        question: "人物会失去什么？",
        suggestedTags: ["推进冲突", "埋设悬念"],
      },
    }];
    const legacyVersions = document.versions.map((version) => ({
      id: version.id,
      versionNo: version.versionNo,
      content: version.content,
      source: version.source,
      createdAt: version.createdAt,
    }));

    const reconciled = reconcileStoryStore({ version: 3, documents: { demo: { ...document, versions: legacyVersions } } } as unknown as Parameters<typeof reconcileStoryStore>[0]);

    expect(reconciled.documents.demo.dialogueThreads).toEqual(document.dialogueThreads);
    expect(reconciled.documents.demo.versions.length).toBeGreaterThan(0);
    expect(reconciled.documents.demo.versions.every((version) => version.chapterId === document.activeChapterId)).toBe(true);
  });

  it("migrates only targetless legacy chapter candidates and removes reports for deleted explicit targets", () => {
    const current = createStoryStore();
    const document = structuredClone(current.documents.demo);
    const firstChapter = document.chapters[0];
    const activeChapter = { ...firstChapter, id: "chapter-active", title: "当前章", order: 1 };
    document.chapters = [firstChapter, activeChapter];
    document.activeChapterId = activeChapter.id;
    const base = document.candidates[0];
    const targetless = { ...base, id: "candidate-targetless" } as unknown as Record<string, unknown>;
    delete targetless.target;
    delete targetless.applyMode;
    document.candidates = [
      targetless as unknown as typeof base,
      { ...base, id: "candidate-deleted", target: { type: "chapter", id: "chapter-deleted" }, applyMode: "append" } as unknown as typeof base,
      { ...base, id: "candidate-valid", target: { type: "chapter", id: firstChapter.id }, applyMode: "append" } as unknown as typeof base,
    ];
    document.consistencyReports = document.candidates.map((candidate) => ({
      candidateId: candidate.id,
      contextRevision: candidate.generatedRevision,
      findings: [],
      checkedAt: "刚刚",
      mode: "demo" as const,
      userConfirmation: "none" as const,
    }));

    const reconciled = reconcileStoryStore({ version: 3, documents: { demo: document } });
    const migrated = reconciled.documents.demo;

    expect(migrated.candidates.map((candidate) => candidate.id)).toEqual(["candidate-targetless", "candidate-valid"]);
    expect(migrated.candidates.find((candidate) => candidate.id === "candidate-targetless")?.target).toEqual({ type: "chapter", id: activeChapter.id });
    expect(migrated.consistencyReports.map((report) => report.candidateId)).toEqual(["candidate-targetless", "candidate-valid"]);
  });

  it("migrates only chapterless legacy versions and drops versions explicitly targeting deleted chapters", () => {
    const current = createStoryStore();
    const document = structuredClone(current.documents.demo);
    document.project = { ...document.project, id: "project-version-migration", title: "版本迁移项目" };
    const firstChapter = document.chapters[0];
    const activeChapter = { ...firstChapter, id: "chapter-active", title: "当前章", order: 1 };
    document.chapters = [firstChapter, activeChapter];
    document.activeChapterId = activeChapter.id;
    const targetless = {
      id: "version-targetless",
      versionNo: document.versions[0].versionNo,
      content: document.versions[0].content,
      source: document.versions[0].source,
      createdAt: document.versions[0].createdAt,
    };
    const legacyVersions = [
      targetless,
      { ...document.versions[0], id: "version-deleted", chapterId: "chapter-deleted" },
      { ...document.versions[0], id: "version-valid", chapterId: firstChapter.id },
    ];

    const reconciled = reconcileStoryStore({ version: 3, documents: { "project-version-migration": { ...document, versions: legacyVersions } } } as unknown as Parameters<typeof reconcileStoryStore>[0]);

    expect(reconciled.documents["project-version-migration"].versions.map((version) => ({ id: version.id, chapterId: version.chapterId }))).toEqual([
      { id: "version-targetless", chapterId: activeChapter.id },
      { id: "version-valid", chapterId: firstChapter.id },
    ]);
  });

  it("restores canonical content for v3 builtin projects after local deletion", () => {
    const saved = createStoryStore();
    const canonical = createStoryStore();
    saved.documents.demo.project.title = "用户改名后的草场";
    saved.documents.demo.chapters = [];
    saved.documents.demo.characters = [];
    saved.documents.demo.worldEntries = [];
    saved.documents.demo.blueprint = [];
    saved.documents.demo.versions = [];

    const reconciled = reconcileStoryStore(saved);

    expect(reconciled.documents.demo.project).toEqual(canonical.documents.demo.project);
    expect(reconciled.documents.demo.chapters).toEqual(canonical.documents.demo.chapters);
    expect(reconciled.documents.demo.characters).toEqual(canonical.documents.demo.characters);
    expect(reconciled.documents.demo.worldEntries).toEqual(canonical.documents.demo.worldEntries);
    expect(reconciled.documents.demo.blueprint).toEqual(canonical.documents.demo.blueprint);
    expect(reconciled.documents.demo.versions).toEqual(canonical.documents.demo.versions);
  });

  it("loads the v2 storage key and writes the migrated v3 store", () => {
    const current = createStoryStore();
    const legacyDocument = structuredClone(current.documents.demo);
    const legacyRecord = legacyDocument as unknown as Record<string, unknown>;
    delete legacyRecord.dialogueThreads;
    delete legacyRecord.imageGenerationSettings;
    delete legacyRecord.analysisSnapshots;
    delete legacyRecord.consistencyReports;
    delete legacyRecord.trainingAttemptRefs;
    localStorage.setItem(PREVIOUS_STORY_STORE_KEY, JSON.stringify({ version: 2, documents: { demo: legacyDocument } }));

    const restored = loadStoryStore();

    expect(restored?.version).toBe(3);
    expect(restored?.documents.demo.dialogueThreads).toEqual([]);
    expect(localStorage.getItem(PREVIOUS_STORY_STORE_KEY)).not.toBeNull();
    expect(localStorage.getItem(STORY_STORE_KEY)).not.toBeNull();
  });

  it("preserves v2 candidate targets and application modes when reloading", () => {
    const store = createStoryStore();
    const document = store.documents.demo;
    document.candidates.push({
      id: "character-candidate",
      label: "人物卡候选",
      content: "杭盖的恐惧是失去最后一段声音记忆。",
      rationale: "补全人物内在阻力。",
      tags: ["人物"],
      status: "pending",
      generatedRevision: document.contextRevision,
      mode: "live",
      target: { type: "character", id: document.characters[0].id },
      applyMode: "replace-fields",
    });
    saveStoryStore(store);

    const restored = loadStoryStore();
    const candidate = restored?.documents.demo.candidates.find((item) => item.id === "character-candidate");

    expect(candidate).toMatchObject({ target: { type: "character", id: document.characters[0].id }, applyMode: "replace-fields", mode: "live" });
  });
});
