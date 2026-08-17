import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, it } from "vitest";
import { StoryProvider, useStory } from "@/providers/story-provider";

function StoryProbe() {
  const { state, setState } = useStory();
  return <button onClick={() => setState((current) => ({
    ...current,
    chapters: [{ ...current.chapters[0], content: "刷新后仍在" }, ...current.chapters.slice(1)],
  }))}>{state.chapters[0].content}</button>;
}

beforeEach(() => localStorage.clear());

it("restores the active project's saved prose after the provider remounts", async () => {
  const user = userEvent.setup();
  const first = render(<StoryProvider><StoryProbe /></StoryProvider>);

  await user.click(screen.getByRole("button"));
  await waitFor(() => expect(screen.getByRole("button")).toHaveTextContent("刷新后仍在"));
  first.unmount();

  render(<StoryProvider><StoryProbe /></StoryProvider>);

  await waitFor(() => expect(screen.getByRole("button")).toHaveTextContent("刷新后仍在"));
});
