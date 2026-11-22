import { render, screen, within } from "@testing-library/react";
import { KnowledgeWorkspace } from "@/components/knowledge/knowledge-workspace";

it("shows classic text deconstruction for the selected work", async () => {
  render(<KnowledgeWorkspace />);

  expect(await screen.findByText("经典文本解构")).toBeVisible();
  expect(screen.getByText("情节结构")).toBeVisible();
  expect(screen.getByRole("region", { name: "来源证据" })).toBeVisible();
  expect(screen.getByText("为什么这样写")).toBeVisible();
  expect(screen.getByText("训练提示")).toBeVisible();
  expect(screen.getByText("来源状态")).toBeVisible();
  expect(screen.getByText(/已核验|待核验|摘要来源/)).toBeVisible();
});

it("distinguishes knowledge node types and uses the dedicated graph theme", async () => {
  render(<KnowledgeWorkspace />);

  const legend = await screen.findByLabelText("知识图谱节点类型");
  expect(within(legend).getByText("作品")).toBeVisible();
  expect(within(legend).getByText("作者")).toBeVisible();
  expect(within(legend).getByText("主题")).toBeVisible();
  expect(within(legend).getByText("技法")).toBeVisible();
  expect(screen.getByTestId("character-graph").closest(".graph-module")).toHaveClass("graph-module-dark");
});

it("keeps the selected node and its direct relationships readable outside the canvas", async () => {
  render(<KnowledgeWorkspace />);

  const focus = await screen.findByLabelText("当前图谱焦点");
  expect(within(focus).getByText("孔乙己")).toBeVisible();
  expect(within(focus).getByText("作品")).toBeVisible();
  expect(focus).toHaveTextContent(/\d+ 条直接关系/);
  expect(within(focus).getAllByRole("button").length).toBeGreaterThan(0);
});
