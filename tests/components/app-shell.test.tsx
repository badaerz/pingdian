import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AppShell } from "@/components/layout/app-shell";
import { StoryProvider, useStory } from "@/providers/story-provider";

vi.mock("next/navigation", () => ({ usePathname: () => "/projects" }));

it("renders navigation and a visible browser-only storage state", () => {
  render(<StoryProvider><AppShell><div>内容</div></AppShell></StoryProvider>);
  expect(screen.getByRole("link", { name: "评点" })).toHaveAttribute("href", "/");
  expect(screen.getAllByText("仅存本地").length).toBeGreaterThan(0);
  expect(screen.getByRole("link", { name: "项目桌面" })).toHaveAttribute("href", "/projects");
  expect(screen.getByRole("link", { name: "知识图谱" })).toHaveAttribute("href", "/knowledge");
});

it("keeps studio and analysis navigation in the active project", async () => {
  function LocalProject() {
    const { createProject } = useStory();
    return <button onClick={() => createProject({ title: "案例副本", genre: "短篇", logline: "本地副本" })}>建立副本</button>;
  }
  render(<StoryProvider><AppShell><LocalProject /></AppShell></StoryProvider>);
  await userEvent.click(screen.getByRole("button", { name: "建立副本" }));
  const studioPath = screen.getAllByRole("link", { name: "创作台" })[0].getAttribute("href");
  expect(studioPath).toMatch(/^\/project\/project-.+\/studio$/);
  expect(screen.getByRole("link", { name: "文学诊断" })).toHaveAttribute("href", studioPath?.replace(/studio$/, "analysis"));
});
