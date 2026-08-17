import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AnalysisWorkspace } from "@/components/analysis/analysis-workspace";

it("shows six dimensions and opens cited evidence", async () => {
  const user = userEvent.setup();
  render(<AnalysisWorkspace />);
  expect(screen.getAllByTestId("analysis-dimension")).toHaveLength(6);
  await user.click(screen.getAllByRole("button", { name: "证据 E1" })[0]);
  expect(screen.getByRole("dialog", { name: "原文证据" })).toBeVisible();
  expect(screen.getByText("用户文本")).toBeVisible();
});
