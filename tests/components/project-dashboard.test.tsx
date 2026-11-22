import { render, screen } from "@testing-library/react";
import { ProjectDashboard } from "@/components/projects/project-dashboard";
import { StoryProvider } from "@/providers/story-provider";

it("opens creation and the home text entry from an empty desk", () => {
  render(<StoryProvider><ProjectDashboard /></StoryProvider>);
  expect(screen.getByText("还没有作品。新建一个，或到首页贴一段文字试试。")).toBeVisible();
  expect(screen.getAllByRole("link", { name: "新建作品" }).every(link => link.getAttribute("href") === "/projects/new")).toBe(true);
  expect(screen.getByRole("link", { name: "到首页贴一段文字" })).toHaveAttribute("href", "/");
});
