import { render, screen } from "@testing-library/react";
import { AppShell } from "@/components/layout/app-shell";
import { StoryProvider } from "@/providers/story-provider";

vi.mock("next/navigation", () => ({ usePathname: () => "/projects" }));

it("renders navigation and a visible browser-only storage state", () => {
  const { container } = render(<StoryProvider><AppShell><div>内容</div></AppShell></StoryProvider>);
  expect(screen.getByRole("link", { name: "Story Forge 首页" })).toHaveAttribute("href", "/");
  expect(container.querySelector('img[src*="story-forge-mark-20260821.png"]')).not.toBeNull();
  expect(container.querySelector('img[src*="story-forge-full-logo-20260820.png"]')).toBeNull();
  expect(screen.getAllByText("仅存本地").length).toBeGreaterThan(0);
  expect(screen.getByRole("link", { name: "项目桌面" })).toHaveAttribute("href", "/projects");
  expect(screen.getByRole("link", { name: "知识图谱" })).toHaveAttribute("href", "/knowledge");
});
