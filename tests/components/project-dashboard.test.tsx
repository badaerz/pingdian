import { render, screen } from "@testing-library/react";
import { ProjectDashboard } from "@/components/projects/project-dashboard";
import { StoryProvider } from "@/providers/story-provider";

it("shows a connected humanities graph on the project dashboard", () => {
  render(<StoryProvider><ProjectDashboard /></StoryProvider>);

  const graph = screen.getByLabelText("人物、主题与技法的关系图");
  expect(graph.querySelectorAll("path.graph-link")).toHaveLength(4);
  expect(graph.querySelectorAll("circle.graph-traveler")).toHaveLength(4);
  expect(graph.querySelectorAll("animateMotion")).toHaveLength(4);
  expect(graph.querySelectorAll(".graph-node")).toHaveLength(4);
});

it("marks both built-in defense cases as permanently retained", () => {
  render(<StoryProvider><ProjectDashboard /></StoryProvider>);

  expect(screen.getAllByText("答辩案例 · 永久保留")).toHaveLength(2);
  expect(screen.queryByRole("button", { name: "删除 回响的草场" })).toBeNull();
  expect(screen.queryByRole("button", { name: "删除 雾港来信" })).toBeNull();
});
