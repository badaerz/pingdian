"use client";

import { useSyncExternalStore } from "react";

const key = "story-forge:editor-display:v1";
const event = "pingdian:reading-preferences";
const defaults = { fontSize: 18, lineHeight: 2.12 };
export const readingSizes = [16, 18, 20, 22, 24];
export const readingSpacing = [[1.7, "紧凑"], [2.12, "舒展"], [2.35, "宽松"]] as const;
function getSnapshot() {
  try { return localStorage.getItem(key) ?? ""; } catch { return ""; }
}
function read(raw: string) {
  try {
    const { fontSize, lineHeight } = JSON.parse(raw);
    return { fontSize: readingSizes.includes(fontSize) ? fontSize as number : defaults.fontSize, lineHeight: readingSpacing.some(([size]) => size === lineHeight) ? lineHeight as number : defaults.lineHeight };
  } catch { return defaults; }
}
function subscribe(callback: () => void) {
  window.addEventListener(event, callback);
  window.addEventListener("storage", callback);
  return () => { window.removeEventListener(event, callback); window.removeEventListener("storage", callback); };
}
export function useReadingPreferences() {
  const preferences = read(useSyncExternalStore(subscribe, getSnapshot, () => ""));
  return [preferences, (update: (previous: typeof defaults) => typeof defaults) => {
    try { localStorage.setItem(key, JSON.stringify(update(read(getSnapshot())))); } catch { return; }
    window.dispatchEvent(new Event(event));
  }] as const;
}
