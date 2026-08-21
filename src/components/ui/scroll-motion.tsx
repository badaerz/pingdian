"use client";

import { useLayoutEffect } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

export function ScrollMotion() {
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    if (!window.matchMedia) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return;

    gsap.registerPlugin(ScrollTrigger);
    const context = gsap.context(() => {
      const sections = gsap.utils.toArray<HTMLElement>("[data-motion-section]");
      sections.forEach((section) => {
        const items = section.querySelectorAll<HTMLElement>("[data-motion-item]");
        if (!items.length) return;
        gsap.fromTo(items, { autoAlpha: 0, y: 28 }, {
          autoAlpha: 1,
          y: 0,
          duration: 0.78,
          ease: "power3.out",
          stagger: 0.1,
          scrollTrigger: { trigger: section, start: "top 78%", once: true },
        });
      });

      const heroItems = gsap.utils.toArray<HTMLElement>("[data-motion-hero]");
      if (heroItems.length) {
        gsap.fromTo(heroItems, { autoAlpha: 0, y: 22 }, {
          autoAlpha: 1,
          y: 0,
          duration: 0.9,
          ease: "power3.out",
          stagger: 0.1,
          delay: 0.12,
        });
      }

      const logo = document.querySelector<HTMLElement>("[data-motion-logo]");
      if (logo) {
        gsap.fromTo(logo, { autoAlpha: 0, scale: 0.92 }, { autoAlpha: 1, scale: 1, duration: 1, ease: "power3.out" });
      }

      const orbitNodes = gsap.utils.toArray<HTMLElement>("[data-motion-orbit]");
      if (orbitNodes.length) {
        gsap.fromTo(orbitNodes, { autoAlpha: 0, scale: 0.7 }, { autoAlpha: 1, scale: 1, duration: 0.55, stagger: 0.12, delay: 0.35, ease: "back.out(1.5)" });
      }

      const processLine = document.querySelector<SVGPathElement>("[data-motion-process-line]");
      if (processLine) {
        const length = processLine.getTotalLength();
        gsap.set(processLine, { strokeDasharray: length, strokeDashoffset: length });
        gsap.to(processLine, {
          strokeDashoffset: 0,
          ease: "none",
          scrollTrigger: { trigger: processLine, start: "top 82%", end: "bottom 42%", scrub: true },
        });
      }
    });

    return () => context.revert();
  }, []);

  return null;
}
