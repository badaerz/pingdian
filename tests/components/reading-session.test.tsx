import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { ReadingSession } from "@/components/marketing/reading-session";

afterEach(() => vi.unstubAllGlobals());

it("keeps the full reduced-motion reading and working destinations", () => {
  vi.stubGlobal("matchMedia", () => ({matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn()}));
  render(<ReadingSession />);
  const hero = screen.getByRole("region");
  expect(hero).not.toHaveAttribute("data-flow");
  expect(screen.getByRole("link", {name: /贴一段文字/})).toHaveAttribute("href", "#try-reading");
  expect(screen.getByRole("link", {name: "诊断"})).toHaveAttribute("href", "/project/reading/analysis?sample=denggao");
  fireEvent.keyDown(window, {key: "Escape"});
  expect(hero).toHaveAttribute("data-skip");
});
