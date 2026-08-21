import { render, screen } from "@testing-library/react";
import { MarketingHome } from "@/components/marketing/marketing-home";

it("presents the Story Forge brand and links to real workspaces", () => {
  const { container } = render(<MarketingHome />);

  expect(screen.getByRole("heading", { name: "以叙事智能 淬炼文学匠心" })).toBeVisible();
  expect(container.querySelectorAll('img[src*="story-forge-logo-20260821.png"]')).toHaveLength(1);
  expect(container.querySelectorAll('img[src*="story-forge-mark-20260821.png"]')).toHaveLength(2);
  expect(screen.getByText("Story Forge（故事熔炉）")).toBeVisible();
  expect(screen.getByText("FORGING LITERARY CRAFT WITH NARRATIVE INTELLIGENCE")).toBeVisible();
  expect(screen.getAllByRole("link", { name: "进入工作台" })).toHaveLength(2);
  expect(screen.getAllByRole("link", { name: "进入工作台" })[0]).toHaveAttribute("href", "/projects");
  expect(screen.getByRole("link", { name: "查看答辩案例" })).toHaveAttribute("href", "/project/demo/studio");
  expect(screen.getByRole("link", { name: "探索文学诊断" })).toHaveAttribute("href", "/project/demo/analysis");
    expect(screen.getAllByRole("link", { name: "打开知识图谱" })).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "打开知识图谱" })[0]).toHaveAttribute("href", "/knowledge");
  expect(screen.getByRole("link", { name: "进入写作训练" })).toHaveAttribute("href", "/training");
  expect(screen.getByRole("link", { name: /进入 IP 实验场/ })).toHaveAttribute("href", "/project/demo/ip-lab");
});

it("presents the full narrative structure without the stray punctuation", () => {
  render(<MarketingHome />);

  expect(screen.getByRole("heading", { name: "从灵感到作品，一条可解释的创作路径" })).toBeVisible();
  expect(screen.queryByText("AI 能，")).not.toBeInTheDocument();
  ["输入灵感", "生成设定", "构建蓝图", "协作写作", "诊断与导出"].forEach((label) => {
    expect(screen.getByText(label)).toBeVisible();
  });
});

it("renders connected literary dimensions in one coordinate system", () => {
  render(<MarketingHome />);

  ["literature", "work", "author", "theme", "craft"].forEach((node) => {
    expect(document.querySelector(`[data-node="${node}"]`)).toBeVisible();
  });
  expect(screen.getByTestId("literary-path-work")).toHaveAttribute("data-connects", "work");
});

it("annotates each literary relationship on its connecting line", () => {
  render(<MarketingHome />);

  const relations = [
    ["work", "产出"],
    ["author", "署名"],
    ["theme", "聚焦"],
    ["craft", "采用"],
  ];

  relations.forEach(([node, label]) => {
    const relation = screen.getByTestId(`literary-relation-${node}`);
    expect(relation).toHaveTextContent(label);
    expect(relation).toHaveAttribute("aria-label", expect.stringContaining(label));
    expect(screen.getByTestId(`literary-path-${node}`)).toHaveClass("literary-graph-edge");
  });
  expect(document.querySelector(".literary-graph-label title")).not.toBeInTheDocument();
  expect(document.querySelectorAll(".literary-graph-signal")).toHaveLength(4);
});

it("keeps orbit nodes evenly distributed around the brand mark", () => {
  render(<MarketingHome />);

  const nodes = Array.from(document.querySelectorAll<HTMLElement>(".brand-orbit-node"));
  expect(nodes).toHaveLength(6);
  expect(nodes.map((node) => node.className)).toEqual([
    "brand-orbit-node orbit-inspiration",
    "brand-orbit-node orbit-character",
    "brand-orbit-node orbit-world",
    "brand-orbit-node orbit-analysis",
    "brand-orbit-node orbit-writing",
    "brand-orbit-node orbit-knowledge",
  ]);
  expect(nodes.every((node) => node.dataset.orbitAngle)).toBe(true);
});

it("labels the knowledge graph as a real digital humanities capability", () => {
  render(<MarketingHome />);

  expect(screen.getAllByRole("heading", { name: "文学知识图谱" }).length).toBeGreaterThan(0);
  expect(screen.getByText("作品、作者、主题与技法不是装饰性节点，而是一条可以检索、解释和进入训练的关系网络。")).toBeVisible();
});

it("uses the product-level digital-humanities artwork and keeps an explicit route to 回响的草场", () => {
  render(<MarketingHome />);

  expect(screen.getByRole("img", { name: "故事熔炉完整品牌标识" })).toBeVisible();
  expect(screen.getByRole("link", { name: /进入回响的草场/ })).toHaveAttribute("href", "/project/demo/studio");
});
