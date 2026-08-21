import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { AiProgress } from "@/components/ui/ai-progress";

it("exposes staged progress while an AI request is running", () => {
  render(<AiProgress status="loading" label="正在生成故事方向" />);

  const progress = screen.getByRole("progressbar", { name: "正在生成故事方向" });
  expect(progress).toHaveAttribute("aria-valuemin", "0");
  expect(progress).toHaveAttribute("aria-valuemax", "100");
  expect(Number(progress.getAttribute("aria-valuenow"))).toBeLessThanOrEqual(92);
  expect(progress.getAttribute("aria-valuetext")).toContain("准备上下文");
});

it("marks the request complete at one hundred percent", () => {
  render(<AiProgress status="success" label="文学诊断" />);

  expect(screen.getByRole("progressbar", { name: "文学诊断" })).toHaveAttribute("aria-valuenow", "100");
  expect(screen.getByText("校验完成")).toBeVisible();
});

it("keeps a visible interruption state when generation fails", () => {
  render(<AiProgress status="error" label="文学诊断生成进度" />);

  expect(screen.getByText("生成中断")).toBeVisible();
  expect(screen.getByRole("progressbar", { name: "文学诊断生成进度" })).toHaveAttribute("aria-valuenow", "0");
});
