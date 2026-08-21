import { render } from "@testing-library/react";
import { ScrollMotion } from "@/components/ui/scroll-motion";

const { fromTo, set, to, registerPlugin } = vi.hoisted(() => ({
  fromTo: vi.fn(),
  set: vi.fn(),
  to: vi.fn(),
  registerPlugin: vi.fn(),
}));

vi.mock("gsap", () => ({
  gsap: {
    registerPlugin,
    context: (callback: () => void) => { callback(); return { revert: vi.fn() }; },
    utils: { toArray: (selector: string) => Array.from(document.querySelectorAll(selector)) },
    fromTo,
    set,
    to,
  },
}));
vi.mock("gsap/ScrollTrigger", () => ({ ScrollTrigger: {} }));

it("animates hero, orbit nodes, sections, and the process line", () => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as typeof window.matchMedia;
  document.body.innerHTML = `<div data-motion-hero></div><div data-motion-logo></div><div data-motion-orbit></div><section data-motion-section><div data-motion-item></div></section><svg><path data-motion-process-line></path></svg>`;
  const path = document.querySelector<SVGPathElement>("[data-motion-process-line]")!;
  path.getTotalLength = () => 1;

  render(<ScrollMotion />);

  expect(registerPlugin).toHaveBeenCalledTimes(1);
  expect(fromTo).toHaveBeenCalled();
  expect(set).toHaveBeenCalledWith(path, { strokeDasharray: 1, strokeDashoffset: 1 });
  expect(to).toHaveBeenCalled();
});

it("does not initialize animation when reduced motion is requested", () => {
  registerPlugin.mockClear();
  window.matchMedia = vi.fn().mockReturnValue({ matches: true }) as typeof window.matchMedia;
  render(<ScrollMotion />);
  expect(registerPlugin).not.toHaveBeenCalled();
});
