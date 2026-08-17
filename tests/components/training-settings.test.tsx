import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TrainingWorkspace } from "@/components/training/training-workspace";
import { SettingsWorkspace } from "@/components/settings/settings-workspace";
import { StoryProvider } from "@/providers/story-provider";

it("returns process feedback without a total score", async () => {
  const user = userEvent.setup();
  render(<TrainingWorkspace />);
  await user.type(screen.getByLabelText("练习文本"), "她握紧门把，直到指节发白。 ");
  await user.click(screen.getByRole("button", { name: "提交练习" }));
  expect(await screen.findByText("观察到的优势")).toBeVisible();
  expect(screen.queryByText("总分")).not.toBeInTheDocument();
});

it("switches between demo success and failure states", async () => {
  const user = userEvent.setup();
  render(<StoryProvider><SettingsWorkspace /></StoryProvider>);
  await user.click(screen.getByRole("button", { name: "模拟失败状态" }));
  expect(screen.getByRole("alert")).toHaveTextContent("演示服务暂时不可用");
});
