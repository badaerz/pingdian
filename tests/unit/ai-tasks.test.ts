import { afterEach, describe, expect, it, vi } from "vitest";
import { fixtureForTask } from "@/lib/ai/fixtures";
import { runAiTask, type AiTaskInput } from "@/lib/ai/tasks";
import { aiConfigFromEnvironment, createAiPostHandler } from "@/app/api/ai/route";
import { POST as legacyGeneratePOST } from "@/app/api/generate/route";
import { POST as knowledgeSearchPOST } from "@/app/api/knowledge/search/route";
import { validateTaskPayload } from "@/lib/ai/validation";
import { knowledgeRecords } from "@/lib/knowledge/catalog";
import { createRequestBudget } from "@/lib/http/request-budget";

const POST = createAiPostHandler({
  requestBudget: createRequestBudget({
    limits: { perClientPerMinute: 1_000, daily: 100_000 },
  }),
});

const input: AiTaskInput = {
  task: "continue",
  project: {
    title: "雾港来信",
    genre: "纯文学短篇",
    logline: "一封迟到二十年的信，迫使守夜人重新选择离开或留下。",
    activeChapterId: "chapter-1",
    contextRevision: 7,
    chapters: [{ id: "chapter-1", title: "第一章", content: "码头的钟停在凌晨三点十七分。", wordCount: 18, summary: "来信抵达", order: 0 }],
    characters: [],
    worldEntries: [],
    blueprint: [],
  },
};

const config = {
  apiKey: "test-key",
  baseUrl: "https://api.deepseek.com/v1",
  model: "deepseek-chat",
  timeoutMs: 1000,
  maxInputChars: 24000,
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function modelResponse(task: "mentor", selectedText: string) {
  return new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify(fixtureForTask(task, input.project, { selectedText })) } }],
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

function configureVectorEnvironment() {
  vi.stubEnv("EMBEDDING_PUBLIC_SEARCH_ENABLED", "true");
  vi.stubEnv("EMBEDDING_API_KEY", "embedding-secret");
  vi.stubEnv("EMBEDDING_BASE_URL", "https://embedding.example/v1");
  vi.stubEnv("EMBEDDING_MODEL", "embedding-model");
  vi.stubEnv("EMBEDDING_DIMENSIONS", "384");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://safe.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-safe-key");
}

describe("runAiTask", () => {
  it("disables the live provider when the explicit defense lock is enabled", () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "should-not-be-used");
    vi.stubEnv("NEXT_PUBLIC_DEMO_LOCKED", "true");
    expect(aiConfigFromEnvironment().apiKey).toBe("");
  });

  it("also disables the legacy generation provider in defense mode", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "should-not-be-used");
    vi.stubEnv("NEXT_PUBLIC_DEMO_LOCKED", "true");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);

    const response = await legacyGeneratePOST(new Request("http://localhost/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ operation: "continue", title: "测试", content: "本地正文" }),
    }));

    expect(response.status).toBe(200);
    expect((await response.json()).mode).toBe("demo");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("returns deterministic candidates without calling a model when the key is missing", async () => {
    const fetcher = vi.fn();
    const result = await runAiTask(input, { ...config, apiKey: "" }, fetcher);

    expect(result.mode).toBe("demo");
    expect(result.task).toBe("continue");
    expect(result.contextRevision).toBe(7);
    expect(result.result).toMatchObject({ candidates: expect.any(Array) });
    expect(result.warnings[0]).toContain("未配置");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("模型返回被截断的 JSON 时用 jsonrepair 修复，不直接回退成演示结果", async () => {
    // 2026-11-20 AC19 实测：同一输入模型时好时坏，约 1/5 的样本返回残缺 JSON。
    // 修复只让它能解析，内容仍要过完整校验；防幻觉底线不受影响。
    const complete = JSON.stringify({ candidates: [
      { label: "推进", content: "雾里传来第二声汽笛。", rationale: "用动作推进", tags: ["悬念"] },
      { label: "停顿", content: "他把信封放回灯下。", rationale: "保持克制", tags: ["节奏"] },
    ] });
    const truncated = complete.slice(0, complete.length - 1); // 少了最后的 }
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: truncated } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const result = await runAiTask(input, config, fetcher);

    expect(result.mode).toBe("live");
    expect(result.result).toMatchObject({ candidates: expect.any(Array) });
  });

  it("修复也救不回来的内容仍然回退（不许因为加了修复就放宽）", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "这不是 JSON，只是一段散文。" } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const result = await runAiTask(input, config, fetcher);

    expect(result.mode).toBe("demo");
    expect(result.warnings.join(" ")).toContain("演示结果");
  });

  it("normalizes a valid live response into pending candidates", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ candidates: [
        { label: "推进", content: "雾里传来第二声汽笛。", rationale: "用动作推进", tags: ["悬念"] },
        { label: "停顿", content: "他把信封放回灯下。", rationale: "保持克制", tags: ["节奏"] },
      ] }) } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const result = await runAiTask(input, config, fetcher);

    expect(result.mode).toBe("live");
    expect(result.contextRevision).toBe(7);
    expect(result.result).toMatchObject({ candidates: expect.arrayContaining([expect.objectContaining({
      label: "推进",
      status: "pending",
      generatedRevision: 7,
      mode: "live",
      target: { type: "chapter", id: "chapter-1" },
    })]) });
    expect(result.warnings).toHaveLength(0);
    const requestBody = JSON.parse(fetcher.mock.calls[0][1].body as string) as { max_tokens?: number };
    expect(requestBody.max_tokens).toBe(2_400);
  });

  it("normalizes a provider visual brief whose palette is returned as a Chinese string", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ visualBrief: {
        title: "回响的草场",
        subject: "杭盖，声音采集师",
        composition: "人物居中偏左，草原与远山展开",
        palette: "冷绿（草原），信号金（设备指示灯），炭黑（服装和阴影）",
        atmosphere: "电影感，纪实风格，宁静而深邃",
        negativePrompt: "文字、标志、水印",
      } }) } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const result = await runAiTask({ ...input, task: "visual-brief", input: { characterId: "character-1" } }, config, fetcher);

    expect(result.mode).toBe("live");
    expect(result.result).toMatchObject({ visualBrief: { palette: [
      "冷绿（草原）",
      "信号金（设备指示灯）",
      "炭黑（服装和阴影）",
    ] } });
    expect(result.warnings).toEqual([]);
  });

  it("parses a visual brief wrapped in provider markdown or explanatory prose", async () => {
    const visualBrief = { visualBrief: {
      title: "回响的草场",
      subject: "杭盖",
      composition: "人物偏左，空间向右展开",
      palette: ["冷绿", "信号金"],
      atmosphere: "克制",
      negativePrompt: "文字、水印",
    } };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: `以下是视觉简报：\n\n\`\`\`json\n${JSON.stringify(visualBrief)}\n\`\`\`` } }],
    }), { status: 200 }));

    const result = await runAiTask({ ...input, task: "visual-brief", input: { characterId: "character-1" } }, config, fetcher);

    expect(result.mode).toBe("live");
    expect(result.result).toEqual(visualBrief);
  });

  it("falls back when the model returns malformed task JSON", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "不是 JSON" } }],
    }), { status: 200 }));

    const result = await runAiTask(input, config, fetcher);

    expect(result.mode).toBe("demo");
    expect(result.result).toMatchObject({ candidates: expect.any(Array) });
    expect(result.warnings.join(" ")).toContain("JSON");
  });

  it("rejects an oversized model response before parsing it", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: "x".repeat(250_000) } }],
    }), { status: 200 }));

    const result = await runAiTask(input, config, fetcher);

    expect(result.mode).toBe("demo");
    expect(result.warnings.join(" ")).toContain("响应过大");
  });

  it("validates a structured literary mentor response", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ mentor: {
        thesis: "动作延迟让人物的回避可见。",
        evidence: [{ quote: "他没有拆开", source: "observation" }],
        craft: ["延宕"], effect: ["制造克制张力"], consistency: ["与守候主题一致"],
        experiments: ["把动作拆成两个短句"], questions: ["他害怕信里出现什么？"],
        references: [],
      } }) } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const result = await runAiTask({ ...input, task: "mentor", input: { selectedText: "他没有拆开" } }, config, fetcher);

    expect(result.mode).toBe("live");
    expect(result.result).toMatchObject({ mentor: { thesis: expect.any(String), evidence: [{ source: "observation" }] } });
  });

  it("blocks model requests when locked facts exceed the server budget", async () => {
    const fetcher = vi.fn();
    const project = structuredClone(input.project);
    project.characters = [{ id: "c1", name: "杭盖", role: "主角", desire: "寻找声音", flaw: "回避", arc: "", fear: "失去记忆", notes: "锁定".repeat(2000), locked: true, order: 0 }];

    const result = await runAiTask({ ...input, project }, { ...config, maxInputChars: 240 }, fetcher);

    expect(result.mode).toBe("demo");
    expect(result.warnings.join(" ")).toContain("锁定事实");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("retrieves knowledge only for configured live tasks that can use it", async () => {
    const retrieve = vi.fn().mockResolvedValue({
      mode: "keyword",
      evidence: [{
        retrievalId: "knowledge-1",
        workId: "work-1",
        chunkType: "technique_explanation",
        content: "延宕通过推迟关键动作维持读者预期。",
        quote: "延宕通过推迟关键动作",
        sourceStatus: "verified",
      }],
    });

    const mentor = await runAiTask(
      { ...input, task: "mentor", input: { selectedText: "码头的钟停在凌晨三点十七分。" } },
      config,
      vi.fn().mockResolvedValue(modelResponse("mentor", "码头的钟停在凌晨三点十七分。")),
      { retrieveKnowledge: retrieve },
    );
    expect(retrieve).toHaveBeenCalledTimes(1);
    expect(mentor.warnings.join(" ")).not.toContain("keyword");
    expect(mentor.notices?.join(" ")).toContain("keyword");

    retrieve.mockClear();
    await runAiTask(input, { ...config, apiKey: "" }, vi.fn(), { retrieveKnowledge: retrieve });
    expect(retrieve).not.toHaveBeenCalled();
  });

  it("sends user-authored settings and task constraints to the model", async () => {
    const taskInput: AiTaskInput = {
      ...input,
      task: "world",
      project: {
        ...input.project,
        title: "潮汐石路",
        logline: "林岚必须在石路消失前交出录音。",
        characters: [{ id: "c1", name: "林岚", role: "录音师", desire: "留下证据", flaw: "不愿求助", arc: "", fear: "被误解", notes: "用户设定", locked: false, order: 0 }],
        worldEntries: [{ id: "w1", category: "地点", label: "潮汐石路", content: "退潮后只出现二十分钟", locked: false, order: 0 }],
        blueprint: [{ id: "b1", title: "交出录音", beatType: "转折", summary: "林岚必须在石路消失前行动", active: true, locked: false, order: 0 }],
      },
      input: { prompt: "基于这些设定补全世界观，不能改写石路的时间限制。" },
    };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ worldEntries: [{ id: "w1", category: "地点", label: "潮汐石路", content: "退潮后只出现二十分钟", locked: false, order: 0 }] }) } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const result = await runAiTask(taskInput, config, fetcher, { retrieveKnowledge: vi.fn().mockResolvedValue({ mode: "none", evidence: [] }) });

    expect(result.mode).toBe("live");
    const request = JSON.parse(fetcher.mock.calls[0][1].body as string) as { messages: Array<{ role: string; content: string }> };
    expect(request.messages[1].content).toContain("不能改写石路的时间限制");
    expect(request.messages[1].content).toContain("潮汐石路");
    expect(request.messages[1].content).toContain("退潮后只出现二十分钟");
    expect(request.messages[1].content).toContain("林岚");
  });

  it("does not retrieve knowledge before returning a no-key demo", async () => {
    const retrieve = vi.fn();
    const fetcher = vi.fn();

    const result = await runAiTask(
      { ...input, task: "mentor", input: { selectedText: input.project.chapters[0].content } },
      { ...config, apiKey: "" },
      fetcher,
      { retrieveKnowledge: retrieve },
    );

    expect(result.mode).toBe("demo");
    expect(retrieve).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("keeps a deterministic demo result when retrieval throws", async () => {
    const result = await runAiTask(
      { ...input, task: "analysis-v2", input: { sourceText: input.project.chapters[0].content, sourceKind: "narrative" } },
      config,
      vi.fn().mockRejectedValue(new Error("model unavailable")),
      { retrieveKnowledge: vi.fn().mockRejectedValue(new Error("retrieval unavailable")) },
    );

    expect(result.mode).toBe("demo");
    expect(result.contextRevision).toBe(7);
    expect(result.warnings.join(" ")).toContain("知识检索");
    expect(result.warnings.join(" ")).toContain("降级");
  });

  it.each([
    ["argumentative", "narrative"],
    ["narrative", "argumentative"],
  ] as const)("falls back when a %s analysis request receives a coherent %s live result", async (requestedKind, returnedKind) => {
    const taskInput: AiTaskInput = {
      ...input,
      task: "analysis-v2",
      input: { sourceText: input.project.chapters[0].content, sourceKind: requestedKind },
    };
    const mismatchedPayload = fixtureForTask("analysis-v2", taskInput.project, {
      sourceText: taskInput.input?.sourceText,
      sourceKind: returnedKind,
    });
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(mismatchedPayload) } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const result = await runAiTask(taskInput, config, fetcher, {
      retrieveKnowledge: vi.fn().mockResolvedValue({ mode: "none", evidence: [] }),
    });

    expect(result.mode).toBe("demo");
    expect(result.result).toMatchObject({ sourceKind: requestedKind });
    expect(result.warnings.join(" ")).toContain("结构或证据");
  });

  it("validates new live JSON and falls back to a valid fixture when it is unsafe", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ direction: { understanding: "缺少其余字段" } }) } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const result = await runAiTask({ ...input, task: "story-direction" }, config, fetcher);

    expect(result.mode).toBe("demo");
    expect(result.result).toEqual(fixtureForTask("story-direction", input.project));
    expect(result.warnings.join(" ")).toContain("结构");
  });

  it("places retrieved knowledge in a separated context and forbids training ghostwriting", async () => {
    const taskInput: AiTaskInput = {
      ...input,
      task: "training-feedback-v2",
      input: {
        sourceText: input.project.chapters[0].content,
        answer: "我让人物停在钟下。",
        sourceKind: "narrative",
      },
    };
    const livePayload = fixtureForTask("training-feedback-v2", taskInput.project, taskInput.input);
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(livePayload) } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const retrieve = vi.fn().mockResolvedValue({ mode: "none", evidence: [] });

    const result = await runAiTask(taskInput, config, fetcher, { retrieveKnowledge: retrieve });

    expect(result.mode).toBe("live");
    const request = JSON.parse(fetcher.mock.calls[0][1].body as string) as { messages: Array<{ role: string; content: string }> };
    expect(request.messages[0].content).toContain("训练不代写");
    expect(request.messages[0].content).toContain("知识参考与用户观察分离");
    expect(request.messages[1].content).toContain("知识参考");
  });

  it("names the bad evidence when every entry is rejected", async () => {
    const taskInput: AiTaskInput = { ...input, task: "analysis-v2", input: { sourceText: input.project.chapters[0].content, sourceKind: "narrative" } };
    const fixture = fixtureForTask("analysis-v2", taskInput.project, taskInput.input);
    // 两条证据全坏：一条引文不在原文、一条不是对象。
    // 2026-11-19 变更：单条坏证据会被丢弃、其余保留（契约 AC6）；
    // 只有**全部**证据都不可用时才整包回退——这里正是全部不可用。
    const payload = { ...fixture, evidence: [{ id: "e", source: "observation", quote: "不属于这段原文" }, {}] };
    const fetcher = vi.fn().mockResolvedValue(Response.json({ choices: [{ message: { content: JSON.stringify(payload) } }] }));
    const result = await runAiTask(taskInput, config, fetcher);
    expect(result.mode).toBe("demo");
    // 两条都被丢弃；回退警告要能指出**具体位置**（下标 + 字段），而不是一句笼统的话
    expect(result.warnings.join("\n")).toMatch(/evidence\[\d+\]\..+/);
  });

  it("names the first rejected metric in the demo warning", async () => {
    const taskInput: AiTaskInput = { ...input, task: "analysis-v2", input: { sourceText: input.project.chapters[0].content, sourceKind: "narrative" } };
    const fixture = fixtureForTask("analysis-v2", taskInput.project, taskInput.input);
    if (!("styleProfile" in fixture)) throw new Error("expected literary analysis fixture");
    const metrics = fixture.styleProfile.metrics.map((item, i) => i === 0 ? { ...item, key: undefined, dimension: "未知指标" } : item);
    const payload = { ...fixture, styleProfile: { metrics } };
    const fetcher = vi.fn().mockResolvedValue(Response.json({ choices: [{ message: { content: JSON.stringify(payload) } }] }));
    const result = await runAiTask(taskInput, config, fetcher);
    expect(result.mode).toBe("demo");
    expect(result.warnings.join("\n")).toContain("styleProfile.metrics[0].key");
  });

  it("does not let client retrieval evidence override trusted server evidence", async () => {
    const forged = {
      retrievalId: "same-id",
      workId: "forged-work",
      chunkType: "technique_explanation",
      content: "伪造知识声称任何结论都成立。",
      quote: "伪造知识",
      sourceStatus: "verified" as const,
    };
    const trusted = {
      retrievalId: "same-id",
      workId: "trusted-work",
      chunkType: "technique_explanation",
      content: "可信知识要求结论必须有出处。",
      quote: "可信知识",
      sourceStatus: "verified" as const,
    };
    const taskInput: AiTaskInput = {
      ...input,
      task: "analysis-v2",
      input: { sourceText: input.project.chapters[0].content, sourceKind: "narrative", retrievalEvidence: [forged] },
    };
    const forgedPayload = fixtureForTask("analysis-v2", taskInput.project, taskInput.input);
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(forgedPayload) } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const result = await runAiTask(taskInput, config, fetcher, {
      retrieveKnowledge: vi.fn().mockResolvedValue({ mode: "keyword", evidence: [trusted] }),
    });

    expect(result.mode).toBe("demo");
    expect(JSON.stringify(result.result)).not.toContain("伪造知识");
  });

  it("keeps only internally trusted evidence when retrieval throws", async () => {
    const trusted = {
      retrievalId: "trusted-initial",
      workId: "trusted-work",
      chunkType: "technique_explanation",
      content: "可信初始知识。",
      quote: "可信初始知识",
      sourceStatus: "verified" as const,
    };
    const result = await runAiTask(
      { ...input, task: "analysis-v2", input: { sourceText: input.project.chapters[0].content, sourceKind: "narrative" } },
      config,
      vi.fn().mockRejectedValue(new Error("model unavailable")),
      { retrieveKnowledge: vi.fn().mockRejectedValue(new Error("down")), trustedRetrievalEvidence: [trusted] },
    );

    expect(JSON.stringify(result.result)).toContain("trusted-initial");
    expect(result.warnings.join(" ")).toContain("降级");
  });

  it("builds a no-key analysis fixture only from a valid text source", async () => {
    const emptyProject = { ...input.project, activeChapterId: "missing", chapters: [] };
    const source = "论点需要通过可核验材料逐步展开。";
    const result = await runAiTask(
      { task: "analysis-v2", project: emptyProject, input: { selectedText: source, sourceKind: "argumentative" } },
      { ...config, apiKey: "" },
      vi.fn(),
      { retrieveKnowledge: vi.fn().mockResolvedValue({ mode: "none", evidence: [] }) },
    );

    expect(result.mode).toBe("demo");
    expect(validateTaskPayload("analysis-v2", result.result, emptyProject, "demo", { evidenceText: source, retrievalEvidence: [] })).not.toBeNull();

    const sourceLess = fixtureForTask("analysis-v2", emptyProject, { sourceKind: "narrative" });
    expect(JSON.stringify(sourceLess)).not.toContain(emptyProject.logline);
    expect(JSON.stringify(sourceLess)).not.toContain(emptyProject.title);
  });

  it("fails explicitly instead of returning an invalid demo fixture", async () => {
    const emptyProject = { ...input.project, activeChapterId: "missing", chapters: [] };

    await expect(runAiTask(
      { task: "mentor", project: emptyProject },
      { ...config, apiKey: "" },
      vi.fn(),
    )).rejects.toThrow("AI_DEMO_FIXTURE_INVALID");
  });

  it("uses evidenceText as the complete source for every analysis task with or without an active chapter", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    vi.stubEnv("EMBEDDING_PUBLIC_SEARCH_ENABLED", "false");
    const evidenceOnly = "ZXQV_EVIDENCE_9173";
    const noActiveProject = { ...input.project, activeChapterId: "missing", chapters: [] };

    for (const task of ["analysis", "analysis-v2", "knowledge-extract", "mentor"] as const) {
      for (const project of [input.project, noActiveProject]) {
        const response = await POST(new Request("http://localhost/api/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ task, project, input: { evidenceText: evidenceOnly, sourceKind: "narrative" } }),
        }));
        expect(response.status, `${task}:${project.activeChapterId}`).toBe(200);
        const result = await response.json() as { result: unknown };
        expect(JSON.stringify(result.result), `${task}:${project.activeChapterId}`).toContain(evidenceOnly);
        expect(validateTaskPayload(task, result.result, project, "demo", { evidenceText: evidenceOnly }), task).not.toBeNull();
      }
    }
  });

  it("lets selectedText replace blank explicit fields without trusting the active chapter", async () => {
    const selectedText = "选区文本只有一扇尚未打开的门。";
    for (const task of ["analysis", "analysis-v2", "knowledge-extract"] as const) {
      const taskInput: AiTaskInput = {
        ...input,
        task,
        input: { sourceText: "  ", evidenceText: "\t", selectedText, sourceKind: "narrative" },
      };
      const payload = fixtureForTask(task, taskInput.project, taskInput.input);
      const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify(payload) } }],
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
      const result = await runAiTask(taskInput, config, fetcher, {
        retrieveKnowledge: vi.fn().mockResolvedValue({ mode: "none", evidence: [] }),
      });

      expect(result.mode, task).toBe("live");
      expect(JSON.stringify(result.result), task).toContain(selectedText);
      expect(JSON.stringify(result.result), task).not.toContain(input.project.chapters[0].content);
    }
  });
});

describe("POST /api/ai input validation", () => {
  it("returns 400 for an unknown task", async () => {
    const response = await POST(new Request("http://localhost/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, task: "unknown-task" }),
    }));

    expect(response.status).toBe(400);
  });

  it("returns 400 when nested task input exceeds its limit", async () => {
    const response = await POST(new Request("http://localhost/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, task: "analysis-v2", input: { sourceText: "字".repeat(20_001) } }),
    }));

    expect(response.status).toBe(400);
  });

  it("returns 400 when evidence-bound tasks omit their required source", async () => {
    const consistencyResponse = await POST(new Request("http://localhost/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, task: "consistency-check", input: {} }),
    }));
    const trainingResponse = await POST(new Request("http://localhost/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, task: "training-feedback-v2", input: {} }),
    }));

    expect(consistencyResponse.status).toBe(400);
    expect(trainingResponse.status).toBe(400);
  });

  it("returns 400 for unknown nested keys and oversized advanced parameters", async () => {
    const base = structuredClone(input);
    const bodies: unknown[] = [
      { ...base, unexpected: true },
      { ...base, project: { ...base.project, unexpected: true } },
      { ...base, project: { ...base.project, chapters: [{ ...base.project.chapters[0], unexpected: true }] } },
      { ...base, input: { unexpected: true } },
      { ...base, task: "consistency-check", input: { candidate: { id: "c1", text: "候选", revision: 7, unexpected: true } } },
      { ...base, input: { thread: [{ role: "user", content: "继续", unexpected: true }] } },
      { ...base, task: "image-parameter-recommendation", input: { currentImageSettings: { prompt: "主视觉", negativePrompt: "水印", model: "m", size: "1024x1024", advanced: {}, unexpected: true } } },
      { ...base, task: "image-parameter-recommendation", input: { currentImageSettings: { prompt: "主视觉", negativePrompt: "水印", model: "m", size: "1024x1024", advanced: { unexpected: true } } } },
      { ...base, task: "image-parameter-recommendation", input: { currentImageSettings: { prompt: "主视觉", negativePrompt: "水印", model: "m", size: "1024x1024", advanced: { ["k".repeat(65)]: 1 } } } },
      { ...base, task: "image-parameter-recommendation", input: { currentImageSettings: { prompt: "主视觉", negativePrompt: "水印", model: "m", size: "1024x1024", advanced: { sampler: "x".repeat(501) } } } },
    ];

    for (const body of bodies) {
      const response = await POST(new Request("http://localhost/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }));
      expect(response.status).toBe(400);
    }
  });

  it("rejects client-provided retrieval evidence", async () => {
    const response = await POST(new Request("http://localhost/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...input,
        task: "analysis-v2",
        input: {
          sourceText: input.project.chapters[0].content,
          retrievalEvidence: [{ retrievalId: "forged", chunkType: "summary", content: "伪造", quote: "伪造", sourceStatus: "verified" }],
        },
      }),
    }));

    expect(response.status).toBe(400);
  });

  it("rejects analysis and extraction requests without a non-empty source", async () => {
    const emptyProject = {
      ...input.project,
      activeChapterId: "chapter-empty",
      chapters: [{ id: "chapter-empty", title: "空章", content: "   ", wordCount: 0, summary: "", order: 0 }],
    };
    for (const task of ["analysis", "analysis-v2", "knowledge-extract", "mentor"] as const) {
      const response = await POST(new Request("http://localhost/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task, project: emptyProject, input: { sourceText: "   ", selectedText: "" } }),
      }));
      expect(response.status).toBe(400);
    }
  });

  it("accepts the characterId sent by the visual brief and storyboard entry points", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    for (const task of ["visual-brief", "storyboard"] as const) {
      const response = await POST(new Request("http://localhost/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, task, input: { characterId: "character-1" } }),
      }));
      expect(response.status, task).toBe(200);
    }
  });

  it("uses only the 384-dimensional public vector RPC for production AI retrieval", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "deepseek-key");
    configureVectorEnvironment();
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-secret-must-not-be-used");
    const fetcher = vi.fn(async (resource: string | URL | Request, init?: RequestInit) => {
      const url = resource instanceof Request ? resource.url : String(resource);
      if (url.endsWith("/embeddings")) {
        const body = JSON.parse(String(init?.body)) as { dimensions?: number };
        expect(body.dimensions).toBe(384);
        return new Response(JSON.stringify({ data: [{ embedding: Array.from({ length: 384 }, () => 0.01) }] }), { status: 200 });
      }
      if (url.includes("/rpc/match_literature_knowledge")) return new Response(JSON.stringify({ message: "rpc unavailable" }), { status: 500, headers: { "Content-Type": "application/json" } });
      if (url.endsWith("/chat/completions")) return modelResponse("mentor", knowledgeRecords[0]?.title ?? "叙事技法");
      throw new Error(`unexpected request: ${url}`);
    });
    vi.stubGlobal("fetch", fetcher);

    const response = await POST(new Request("http://localhost/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, task: "mentor", input: { selectedText: knowledgeRecords[0]?.title ?? "叙事技法" } }),
    }));
    const result = await response.json() as { warnings: string[]; notices?: string[] };

    expect(response.status).toBe(200);
    const urls = fetcher.mock.calls.map(([resource]) => resource instanceof Request ? resource.url : String(resource));
    expect(urls.some((url) => url.includes("/embeddings"))).toBe(true);
    expect(urls.some((url) => url.includes("/rpc/match_literature_knowledge"))).toBe(true);
    expect(urls.some((url) => url.includes("match_literature_knowledge_private"))).toBe(false);
    expect(fetcher.mock.calls.some(([resource, init]) => {
      const headers = resource instanceof Request ? resource.headers : new Headers(init?.headers);
      return [...headers.values()].some((value) => value.includes("service-secret-must-not-be-used"));
    })).toBe(false);
    expect(result.notices?.join(" ")).toContain("知识检索：keyword");
  });

  it("returns a validated no-key demo before any production embedding or RPC", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "");
    configureVectorEnvironment();
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);

    const response = await POST(new Request("http://localhost/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, task: "mentor", input: { selectedText: input.project.chapters[0].content } }),
    }));
    const body = await response.json() as { mode: string; result: unknown };

    expect(response.status).toBe(200);
    expect(body.mode).toBe("demo");
    expect(validateTaskPayload("mentor", body.result, input.project, "demo", { evidenceText: input.project.chapters[0].content })).not.toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("shares the minute budget across knowledge and AI routes and degrades AI to keyword", async () => {
    vi.spyOn(Date, "now").mockReturnValue(800_000);
    vi.stubEnv("DEEPSEEK_API_KEY", "deepseek-key");
    configureVectorEnvironment();
    vi.stubEnv("EMBEDDING_PUBLIC_SEARCH_MAX_PER_MINUTE", "1");
    vi.stubEnv("EMBEDDING_PUBLIC_SEARCH_MAX_CONCURRENT", "2");
    const selectedText = knowledgeRecords[0]?.title ?? "叙事技法";
    let embeddingCalls = 0;
    vi.stubGlobal("fetch", vi.fn(async (resource: string | URL | Request) => {
      const url = resource instanceof Request ? resource.url : String(resource);
      if (url.endsWith("/embeddings")) {
        embeddingCalls += 1;
        return Response.json({ data: [{ embedding: Array.from({ length: 384 }, () => 0.01) }] });
      }
      if (url.includes("/rpc/match_literature_knowledge")) return Response.json([]);
      if (url.endsWith("/chat/completions")) return modelResponse("mentor", selectedText);
      throw new Error(`unexpected request: ${url}`);
    }));

    expect((await knowledgeSearchPOST(new Request("http://localhost/api/knowledge/search", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: selectedText }),
    }))).status).toBe(200);
    const response = await POST(new Request("http://localhost/api/ai", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...input, task: "mentor", input: { selectedText } }),
    }));
    const body = await response.json() as { warnings: string[] };

    expect(response.status).toBe(200);
    expect(embeddingCalls).toBe(1);
    expect(body.warnings.join(" ")).toContain("预算");
    expect(body.warnings.join(" ")).toContain("keyword");
  });

  it("shares the concurrent slot across knowledge and AI routes and releases it in finally", async () => {
    vi.spyOn(Date, "now").mockReturnValue(900_000);
    vi.stubEnv("DEEPSEEK_API_KEY", "deepseek-key");
    configureVectorEnvironment();
    vi.stubEnv("EMBEDDING_PUBLIC_SEARCH_MAX_PER_MINUTE", "10");
    vi.stubEnv("EMBEDDING_PUBLIC_SEARCH_MAX_CONCURRENT", "1");
    const selectedText = knowledgeRecords[0]?.title ?? "叙事技法";
    let settleRpc: ((response: Response) => void) | undefined;
    const pendingRpc = new Promise<Response>((resolve) => { settleRpc = resolve; });
    let embeddingCalls = 0;
    let rpcCalls = 0;
    vi.stubGlobal("fetch", vi.fn(async (resource: string | URL | Request) => {
      const url = resource instanceof Request ? resource.url : String(resource);
      if (url.endsWith("/embeddings")) {
        embeddingCalls += 1;
        return Response.json({ data: [{ embedding: Array.from({ length: 384 }, () => 0.01) }] });
      }
      if (url.includes("/rpc/match_literature_knowledge")) {
        rpcCalls += 1;
        return rpcCalls === 1 ? pendingRpc : Response.json([]);
      }
      if (url.endsWith("/chat/completions")) return modelResponse("mentor", selectedText);
      throw new Error(`unexpected request: ${url}`);
    }));

    const knowledgeRequest = knowledgeSearchPOST(new Request("http://localhost/api/knowledge/search", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: selectedText }),
    }));
    await vi.waitFor(() => expect(rpcCalls).toBe(1));
    const aiResponse = await POST(new Request("http://localhost/api/ai", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...input, task: "mentor", input: { selectedText } }),
    }));
    const aiBody = await aiResponse.json() as { warnings: string[] };

    expect(aiResponse.status).toBe(200);
    expect(embeddingCalls).toBe(1);
    expect(aiBody.warnings.join(" ")).toContain("预算");
    settleRpc?.(Response.json([]));
    expect((await knowledgeRequest).status).toBe(200);

    const afterRelease = await POST(new Request("http://localhost/api/ai", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...input, task: "mentor", input: { selectedText } }),
    }));
    expect(afterRelease.status).toBe(200);
    expect(embeddingCalls).toBe(2);
  });

  it("falls back to safe defaults for invalid AI numeric environment values", () => {
    for (const invalid of ["NaN", "Infinity", "0", "-1", "1.5", "999", "120001", "99999999"]) {
      vi.stubEnv("AI_TIMEOUT_MS", invalid);
      vi.stubEnv("AI_MAX_INPUT_CHARS", invalid);
      expect(aiConfigFromEnvironment()).toMatchObject({ timeoutMs: 45_000, maxInputChars: 24_000 });
    }

    vi.stubEnv("AI_TIMEOUT_MS", "5000");
    vi.stubEnv("AI_MAX_INPUT_CHARS", "30000");
    expect(aiConfigFromEnvironment()).toMatchObject({ timeoutMs: 5_000, maxInputChars: 30_000 });
  });
});
