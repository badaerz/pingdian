import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StoryProvider } from "@/providers/story-provider";
import { StudioWorkspace } from "@/components/studio/studio-workspace";

it("keeps AI output in candidates until confirmation", async () => {
  const user = userEvent.setup();
  render(<StoryProvider><StudioWorkspace /></StoryProvider>);
  const original = screen.getByTestId("prose-editor").textContent;
  await user.click(screen.getByRole("button", { name: "续写" }));
  expect(await screen.findByText("生成完成")).toBeVisible();
  expect(screen.getByTestId("prose-editor").textContent).toBe(original);
  await user.click(screen.getAllByRole("button", { name: "采纳候选" })[0]);
  await user.click(screen.getByRole("button", { name: "确认采纳" }));
  expect(screen.getByTestId("prose-editor").textContent).toContain("雾中的汽笛");
});
