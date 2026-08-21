import type { LiterarySourceKind } from "@/lib/types";

const ARGUMENT_MARKERS = ["因此", "所以", "首先", "其次", "综上", "本文", "认为", "可见", "表明", "论点", "论据", "证据", "推理", "应当", "一方面", "另一方面", "换言之"];
const NARRATIVE_MARKERS = ["他说", "她说", "看见", "听见", "走进", "推开", "转身", "门外", "窗前", "此刻", "忽然", "随后"];

export function detectLiterarySourceKind(sourceText: string): LiterarySourceKind {
  const text = sourceText.trim();
  if (!text) return "narrative";
  const argumentScore = ARGUMENT_MARKERS.reduce((score, marker) => score + (text.includes(marker) ? 1 : 0), 0)
    + (/[；;]/.test(text) ? 1 : 0);
  const narrativeScore = NARRATIVE_MARKERS.reduce((score, marker) => score + (text.includes(marker) ? 1 : 0), 0)
    + (/[“”]/.test(text) ? 1 : 0);
  return argumentScore >= 2 && argumentScore > narrativeScore ? "argumentative" : "narrative";
}
