import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { AiProgress } from "@/components/ui/ai-progress";

it("shows an indeterminate wait while server progress is unavailable", () => {
  render(<AiProgress status="loading" label="正在生成故事方向" />);

  const progress = screen.getByRole("progressbar", { name: "正在生成故事方向" });
  expect(progress).not.toHaveAttribute("aria-valuenow");
  expect(progress).toHaveAttribute("aria-valuetext", "等待服务器响应");
});

it("marks the request complete at one hundred percent", () => {
  render(<AiProgress status="success" label="文学诊断" />);

  expect(screen.getByRole("progressbar", { name: "文学诊断" })).toHaveAttribute("aria-valuenow", "100");
  expect(screen.getByText("请求完成")).toBeVisible();
});

it("keeps a visible interruption state when generation fails", () => {
  render(<AiProgress status="error" label="文学诊断生成进度" />);

  expect(screen.getByText("生成中断")).toBeVisible();
  expect(screen.getByRole("progressbar", { name: "文学诊断生成进度" })).toHaveAttribute("aria-valuenow", "0");
});
