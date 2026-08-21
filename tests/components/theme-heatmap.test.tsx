import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { ThemeHeatmap } from "@/components/analysis/theme-heatmap";

it("renders an academic theme-segment matrix and opens cell evidence", async () => {
  const user = userEvent.setup();
  const onEvidence = vi.fn();
  render(<ThemeHeatmap cells={[
    { theme: "归属", segment: "开端", value: 25, evidenceId: "E1" },
    { theme: "归属", segment: "转折", value: 78, evidenceId: "E2" },
    { theme: "记忆", segment: "开端", value: 62, evidenceId: "E1" },
    { theme: "记忆", segment: "转折", value: 41, evidenceId: "E3" },
  ]} onEvidence={onEvidence} />);

  expect(screen.getByRole("table", { name: "主题演变热力图" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "归属 · 转折 · 强度 78" }));
  expect(onEvidence).toHaveBeenCalledWith("E2", "转折");
});
