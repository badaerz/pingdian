import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it } from "vitest";
import { StoryProvider, useStory } from "@/providers/story-provider";
import { createProjectDocument, createStoryStore } from "@/lib/story-store";

function UserStoryProbe() {
  const { state, createProject, selectProject, setState } = useStory();
  return <div>
    <button onClick={() => createProject({ title: "用户持久化项目", genre: "短篇", logline: "测试本地保存" })}>创建用户项目</button>
    <button onClick={() => selectProject(state.projects.find((project) => project.title === "用户持久化项目")?.id ?? "")}>选择用户项目</button>
    <button onClick={() => setState((current) => ({
      ...current,
      chapters: [{ ...current.chapters[0], content: "刷新后仍在" }, ...current.chapters.slice(1)],
    }))}>{state.chapters[0].content}</button>
    <output>{state.projects.map((project) => project.title).join(",")}</output>
  </div>;
}

function DeleteProbe() {
  const { state, createProject, removeProject } = useStory();
  return <div>
    <button onClick={() => createProject({ title: "待删除作品", genre: "短篇", logline: "测试" })}>创建</button>
    <button onClick={() => removeProject(state.projects.find((project) => project.title === "待删除作品")?.id ?? "")}>删除</button>
    <output>{state.projects.map((project) => project.title).join(",")}</output>
  </div>;
}

function BuiltinDeleteProbe() {
  const { state, removeProject } = useStory();
  return <div>
    <button onClick={() => removeProject("demo")}>删除主答辩案例</button>
    <button onClick={() => removeProject("demo-demo_002")}>删除回归案例</button>
    <output>{state.projects.map((project) => project.title).join(",")}</output>
  </div>;
}

function ExtendedStateProbe() {
  const { state, appendDirectionMessage, setImageGenerationSettings, saveConsistencyReport, confirmConsistencyReport, recordTrainingAttempt } = useStory();
  return <div>
    <button onClick={() => appendDirectionMessage({ id: "message-1", role: "user", content: "保留留白", tags: ["克制"], createdAt: "刚刚", contextRevision: state.contextRevision })}>追加方向</button>
    <button onClick={() => setImageGenerationSettings({ prompt: "旧矿场", negativePrompt: "文字", model: "custom-image", size: "1024x1024", advanced: { steps: 20 } })}>更新图片参数</button>
    <button onClick={() => saveConsistencyReport({ candidateId: "candidate-1", contextRevision: state.contextRevision, findings: [], checkedAt: "刚刚", mode: "live", userConfirmation: "none" })}>保存一致性</button>
    <button onClick={() => confirmConsistencyReport("candidate-1", "confirmed")}>确认一致性</button>
    <button onClick={() => recordTrainingAttempt({ exerciseId: "exercise-1", title: "练习", note: "一次尝试", answer: "只应出现在训练历史里的答案", feedback: { score: 80 } })}>记录训练</button>
    <output>{JSON.stringify({ messages: state.dialogueThreads, settings: state.imageGenerationSettings, reports: state.consistencyReports, trainingAttemptRefs: state.trainingAttemptRefs, revision: state.contextRevision })}</output>
  </div>;
}

function TrainingProbe() {
  const { state, syncStatus, trainingHistory, recordTrainingAttempt, clearTrainingHistory } = useStory();
  return <div>
    <button onClick={() => recordTrainingAttempt({ exerciseId: "exercise-1", title: "练习", note: "一次尝试", answer: "训练答案", feedback: { score: 80 } })}>记录训练</button>
    <button onClick={clearTrainingHistory}>清空训练</button>
    <output>{JSON.stringify({ syncStatus, ids: trainingHistory.map((item) => item.id), refs: state.trainingAttemptRefs })}</output>
  </div>;
}

beforeEach(() => localStorage.clear());

it("restores the active project's saved prose after the provider remounts", async () => {
  const user = userEvent.setup();
  const first = render(<StoryProvider><UserStoryProbe /></StoryProvider>);
  await user.click(screen.getByRole("button", { name: "创建用户项目" }));
  await user.click(screen.getAllByRole("button")[2]);
  await waitFor(() => expect(screen.getByRole("button", { name: "刷新后仍在" })).toBeVisible());
  first.unmount();

  render(<StoryProvider><UserStoryProbe /></StoryProvider>);
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("用户持久化项目"));
  await user.click(screen.getByRole("button", { name: "选择用户项目" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "刷新后仍在" })).toBeVisible());
});

it("persists project deletion in the v3 document store", async () => {
  const user = userEvent.setup();
  render(<StoryProvider><DeleteProbe /></StoryProvider>);
  await user.click(screen.getByRole("button", { name: "创建" }));
  await user.click(screen.getByRole("button", { name: "删除" }));

  await waitFor(() => {
    const stored = JSON.parse(localStorage.getItem("story-forge:projects:v3") ?? "{}");
    expect(Object.values(stored.documents ?? {}).some((document) => (document as { project?: { title?: string } }).project?.title === "待删除作品")).toBe(false);
  });
});

it("keeps both built-in defense cases when deletion is requested", async () => {
  const user = userEvent.setup();
  render(<StoryProvider><BuiltinDeleteProbe /></StoryProvider>);

  await user.click(screen.getByRole("button", { name: "删除主答辩案例" }));
  await user.click(screen.getByRole("button", { name: "删除回归案例" }));

  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("回响的草场,雾港来信"));

  const stored = JSON.parse(localStorage.getItem("story-forge:projects:v3") ?? "{}");
  expect(Object.keys(stored.documents ?? {})).toEqual(expect.arrayContaining(["demo", "demo-demo_002"]));
});

it("keeps extended project state and training references in browser storage", async () => {
  const user = userEvent.setup();
  render(<StoryProvider><ExtendedStateProbe /></StoryProvider>);
  const initialRevision = JSON.parse(screen.getByRole("status").textContent ?? "{}").revision;

  await user.click(screen.getByRole("button", { name: "追加方向" }));
  await user.click(screen.getByRole("button", { name: "更新图片参数" }));
  await user.click(screen.getByRole("button", { name: "保存一致性" }));
  await user.click(screen.getByRole("button", { name: "确认一致性" }));
  await user.click(screen.getByRole("button", { name: "记录训练" }));

  await waitFor(() => {
    const value = JSON.parse(screen.getByRole("status").textContent ?? "{}");
    expect(value.messages).toHaveLength(1);
    expect(value.settings.model).toBe("custom-image");
    expect(value.reports[0].userConfirmation).toBe("confirmed");
    expect(value.trainingAttemptRefs).toHaveLength(1);
    expect(value.revision).toBe(initialRevision);
    expect(JSON.parse(localStorage.getItem("story-forge:training:v1") ?? "[]")).toHaveLength(1);
  });
});

it("keeps sync status disabled and stores training attempts only locally", async () => {
  const user = userEvent.setup();
  render(<StoryProvider><TrainingProbe /></StoryProvider>);
  await user.click(screen.getByRole("button", { name: "记录训练" }));

  await waitFor(() => {
    const value = JSON.parse(screen.getByRole("status").textContent ?? "{}");
    expect(value.syncStatus).toBe("disabled");
    expect(value.ids).toHaveLength(1);
    expect(value.refs).toEqual(value.ids);
  });
});

it("clears project training references with local history", async () => {
  const user = userEvent.setup();
  render(<StoryProvider><TrainingProbe /></StoryProvider>);
  await user.click(screen.getByRole("button", { name: "记录训练" }));
  await user.click(screen.getByRole("button", { name: "清空训练" }));

  await waitFor(() => {
    const value = JSON.parse(screen.getByRole("status").textContent ?? "{}");
    expect(value.ids).toEqual([]);
    expect(value.refs).toEqual([]);
  });
});

it("clears training references from every project without changing project content", async () => {
  const user = userEvent.setup();
  const saved = createStoryStore();
  const other = createProjectDocument({ title: "第二个项目", genre: "短篇", logline: "测试全局清空" });
  saved.documents.demo.trainingAttemptRefs = ["attempt-demo"];
  other.trainingAttemptRefs = ["attempt-other"];
  other.chapters[0].content = "必须保留的第二项目正文";
  saved.documents[other.project.id] = other;
  localStorage.setItem("story-forge:projects:v3", JSON.stringify(saved));
  render(<StoryProvider><TrainingProbe /></StoryProvider>);
  await waitFor(() => expect(JSON.parse(screen.getByRole("status").textContent ?? "{}").refs).toEqual(["attempt-demo"]));

  await user.click(screen.getByRole("button", { name: "清空训练" }));
  await waitFor(() => {
    const persisted = JSON.parse(localStorage.getItem("story-forge:projects:v3") ?? "null");
    expect(Object.values(persisted.documents).every((item) => (item as { trainingAttemptRefs: string[] }).trainingAttemptRefs.length === 0)).toBe(true);
    expect(persisted.documents[other.project.id].chapters[0].content).toBe("必须保留的第二项目正文");
  });
});
