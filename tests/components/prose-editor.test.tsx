import { render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ProseEditor } from "@/components/studio/prose-editor";

it("does not emit the defense case while switching to an editable user project", async () => {
  const onChange = vi.fn();
  const view = render(<ProseEditor content="内置答辩案例正文" onChange={onChange} readOnly />);

  await waitFor(() => expect(screen.getByLabelText("正文编辑器")).toHaveTextContent("内置答辩案例正文"));
  onChange.mockClear();

  view.rerender(<ProseEditor content="用户项目正文" onChange={onChange} readOnly={false} />);

  await waitFor(() => expect(screen.getByLabelText("正文编辑器")).toHaveTextContent("用户项目正文"));
  expect(onChange).not.toHaveBeenCalledWith("内置答辩案例正文");
});
