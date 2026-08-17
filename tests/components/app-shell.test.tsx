import { render, screen } from "@testing-library/react";
import { AppShell } from "@/components/layout/app-shell";

it("renders navigation and a visible demo state", () => {
  render(<AppShell><div>内容</div></AppShell>);
  expect(screen.getByText("故事熔炉")).toBeVisible();
  expect(screen.getAllByText("演示数据").length).toBeGreaterThan(0);
  expect(screen.getByRole("link", { name: "项目桌面" })).toHaveAttribute("href", "/");
  expect(screen.getByRole("link", { name: "文学图谱" })).toHaveAttribute("href", "/knowledge");
});
