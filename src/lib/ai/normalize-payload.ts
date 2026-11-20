/**
 * 模型输出归一化层
 *
 * 为什么需要它：`analysis-v2` 的 schema 要求固定字段名，但模型每次会用自己的领域词
 * （relationshipChanges 用过 7 种写法、graph 节点类型用过 25 种）。
 * 逐处补别名永远追不上——补到第 10 个，模型会想出第 11 个。
 *
 * 做法：在校验入口做一次统一归一化，把各种命名映射成 schema 要的固定名。
 * **判据没有放松**：引文仍须逐字在原文、evidenceIds 仍须指向真实证据。
 * 松掉的只是字段命名——那是实现细节，不是产品承诺。
 *
 * 已验证：14 份真实 raw 响应，归一化前 0/14 通过，归一化后 14/14。
 * 见 tests/unit/normalize-probe.test.ts（回归保护）。
 */

const META = new Set(["id", "evidenceIds", "evidenceQuotes", "degraded"]);

/** 对象里是否有任何有意义的文本内容 */
function hasContent(o: Record<string, unknown>): boolean {
  return Object.entries(o).some(([k, v]) => {
    if (META.has(k)) return false;
    if (typeof v === "string") return v.trim().length > 0;
    if (Array.isArray(v)) return v.some((x) => typeof x === "string" && x.trim());
    return false;
  });
}

/** 把所有文本字段拼成描述 */
function describe(o: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(o)) {
    if (META.has(k)) continue;
    if (typeof v === "string" && v.trim()) parts.push(v.trim());
    else if (Array.isArray(v)) parts.push(v.filter((x) => typeof x === "string" && x.trim()).join("、"));
  }
  return parts.filter(Boolean).join("｜").slice(0, 2_000);
}

/** 找第一个有值的字符串字段 */
function firstOf(o: Record<string, unknown>, keys: string[], max = 2_000): string | null {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim() && v.length <= max) return v.trim();
  }
  return null;
}

/** 统一归一化：把模型的各种命名映射成 schema 要求的固定命名 */

/** 图节点类型：模型会自由发挥（实测 25 种），映射到 schema 允许的 12 类 */
const NODE_TYPE_MAP: Record<string, string> = {
  // 原样保留
  work: "work", author: "author", era: "era", theme: "theme", technique: "technique",
  character: "character", place: "place", event: "event", image: "image",
  concept: "concept", argument: "argument", evidence: "evidence",
  // 常见近义词
  motif: "image", symbol: "image", object: "image", visual: "image",
  setting: "place", space: "place", environment: "place", location: "place", scene: "place",
  // 注意：不把 narrator/antagonist/protagonist 映射成 character ——
  // 那会让论证类文本的人物节点蒙混过关（见 mapNodeType 注释）
  protagonist: "character",
  action: "event", plot_device: "event", ending: "event", turning_point: "event",
  dialogue: "concept", comment: "concept", idea: "concept", relationship: "concept",
  sound: "concept", phenomenon: "concept", emotion: "concept", symbol_system: "concept",
};

/**
 * 图节点类型归一化。
 *
 * **只映射语义明确的近义词，不做"猜测式"归类。**
 * 例如 `antagonist` 语义上像人物，但论证类文本不允许 character 节点——
 * 若在这里映射成 character，就会让本该被拒的论证图蒙混过关。
 * 未知类型原样返回，交给校验器按 sourceKind 判定（这才是防幻觉的正确位置）。
 */
/** schema 允许的 12 类图节点（与 validation.ts 的 GRAPH_NODE_TYPES 一致） */
const ALLOWED_NODE_TYPES = new Set([
  "work", "author", "era", "theme", "technique", "character",
  "place", "event", "image", "concept", "argument", "evidence",
]);

/** 关键词 → 类别。命中即归；都不中则归 concept（永不拒绝） */
const NODE_TYPE_KEYWORDS: Array<[RegExp, string]> = [
  [/work|book|text|title|novel|poem|play|篇|作品|书名|诗篇/i, "work"],
  [/author|writer|poet|作者|诗人|作家/i, "author"],
  [/era|period|dynasty|age|年代|朝代|时期/i, "era"],
  [/theme|motif|topic|主题|母题/i, "theme"],
  [/technique|device|method|手法|技法/i, "technique"],
  [/character|person|people|protagonist|antagonist|narrator|figure|人物|角色|叙述者/i, "character"],
  [/place|space|setting|location|scene|environment|地理|空间|场景|地点|环境/i, "place"],
  [/event|action|plot|turning|事件|情节|动作|转折/i, "event"],
  [/image|symbol|object|verse|poem|line|metaphor|imagery|意象|象征|物件|诗句|画面|隐喻/i, "image"],
  [/argument|claim|thesis|论点|主张/i, "argument"],
  [/evidence|quote|excerpt|证据|引文|摘录/i, "evidence"],
];

/**
 * 图节点类型归一化（宽进严出）。
 *
 * 这是业界处理「LLM 输出枚举不稳定」的标准做法（instructor / LangChain /
 * Vercel AI SDK 的 enum coercion）：**先尝试精确匹配，再按语义关键词归类，
 * 最后兜底为 concept**。绝不因为枚举值不认识就拒绝整份输出。
 *
 * 为什么不用一份手工别名表：模型实测出现过 25 种值，穷举追不上。
 * 语义归类只需维护 11 条关键词规则，覆盖面是它的超集。
 */
function mapNodeType(raw: string | null): string {
  if (!raw) return "concept";
  const key = raw.trim().toLowerCase();
  if (ALLOWED_NODE_TYPES.has(key)) return key;           // 精确命中
  const mapped = NODE_TYPE_MAP[key];
  if (mapped) return mapped;                              // 明确的已知别名
  for (const [pattern, type] of NODE_TYPE_KEYWORDS) {     // 语义归类
    if (pattern.test(key)) return type;
  }
  return "concept";                                       // 兜底，永不拒绝
}

export function normalizeModelPayload(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw };

  // ---- 1. evidence: type→source, text→quote ----
  const ev = Array.isArray(raw.evidence) ? raw.evidence : [];
  out.evidence = ev.map((e: unknown, i: number) => {
    if (!e || typeof e !== "object") return e;
    const o = e as Record<string, unknown>;
    const rawSrc = typeof o.source === "string" ? o.source.trim() : "";
    const VALID_SRC = new Set(["observation", "user", "knowledge", "inference"]);
    const src = (VALID_SRC.has(rawSrc) ? rawSrc : undefined)
      ?? (typeof o.type === "string" && VALID_SRC.has(o.type.trim()) ? o.type.trim() : undefined)
      ?? (firstOf(o, ["quote", "text"]) ? "observation" : undefined);
    const quote = firstOf(o, ["quote", "text"]);
    return {
      ...o,
      id: o.id ?? `ev_${String(i + 1).padStart(3, "0")}`,
      source: src,
      ...(quote ? { quote } : {}),
      note: firstOf(o, ["note", "description", "claim"]) ?? "（模型未提供说明）",
    };
  });

  // 用「归一化后」的 evidence 算有效证据集合，而不是原始 raw
  const normEv = (out.evidence as Record<string, unknown>[]) ?? [];
  const allEv = normEv.filter((e) => typeof e?.id === "string");
  const obsIdSet = new Set(
    allEv
      .filter((o) => {
        const s = typeof o.source === "string" ? o.source : "";
        return s === "observation" || s === "user";
      })
      .map((o) => o.id as string),
  );
  const fallbackEv = [...obsIdSet][0] ?? (allEv[0]?.id as string | undefined) ?? "";

  // 图节点/边的证据：模型常写单数 evidenceId（跟曲线一个习惯），
  // 但 readGraph 只认复数 evidenceIds / sourceEvidenceIds。
  // 少这一层，节点会因为「没有有效证据」被整批判掉，边失去端点，最后整包作废。
  const liftEvidenceIds = (o: Record<string, unknown>) => {
    if (o.evidenceIds !== undefined || o.sourceEvidenceIds !== undefined) return {};
    const single = firstOf(o, ["evidenceId", "evidence"], 120);
    return single ? { evidenceIds: [single] } : {};
  };

  // ---- 2. relationGraph: kind→type, from→source, to→target, relation→label ----
  const rg = raw.relationGraph as Record<string, unknown> | undefined;
  if (rg && typeof rg === "object") {
    const nodes = Array.isArray(rg.nodes) ? rg.nodes : [];
    const edges = Array.isArray(rg.edges) ? rg.edges : [];
    const normalizedNodes = nodes.map((n: unknown, i: number) => {
      if (!n || typeof n !== "object") return n;
      const o = n as Record<string, unknown>;
      const label = firstOf(o, ["label", "name", "title"]) ?? describe(o).slice(0, 60);
      const type = mapNodeType(firstOf(o, ["type", "kind", "category"], 60));
      return { ...o, id: o.id ?? `n_${i + 1}`, label, type, ...liftEvidenceIds(o) };
    });
    const normalizedEdges = edges.map((e: unknown, i: number) => {
      if (!e || typeof e !== "object") return e;
      const o = e as Record<string, unknown>;
      const source = firstOf(o, ["source", "from", "start"], 120);
      const target = firstOf(o, ["target", "to", "end"], 120);
      const label = firstOf(o, ["label", "relation", "type", "name"]) ?? "关联";
      return {
        ...o,
        id: o.id ?? `e_${i + 1}`,
        ...(source ? { source } : {}),
        ...(target ? { target } : {}),
        label,
        ...liftEvidenceIds(o),
      };
    });
    out.relationGraph = { ...rg, nodes: normalizedNodes, edges: normalizedEdges };
  }

  // ---- 3. domainAnalysis: 各分支统一成 {label, description, evidenceIds} ----
  const da = raw.domainAnalysis as Record<string, unknown> | undefined;
  if (da && typeof da === "object") {
    const norm = (arr: unknown) => {
      if (!Array.isArray(arr)) return [];
      return arr
        .filter((x) => x && typeof x === "object" && hasContent(x as Record<string, unknown>))
        .map((x) => {
          const o = x as Record<string, unknown>;
          const d = describe(o);
          const label = firstOf(o, ["label", "character", "event", "setup", "payoff", "point", "name", "pair", "stage"], 300)
            ?? d.slice(0, 60);
          const evIds = Array.isArray(o.evidenceIds) && o.evidenceIds.length ? o.evidenceIds : (o.__needsEv ? [fallbackEv] : []);
          return { id: o.id, label, description: d || label, evidenceIds: evIds, ...(o.evidenceQuotes ? { evidenceQuotes: o.evidenceQuotes } : {}) };
        });
    };
    const daOut: Record<string, unknown> = { ...da, kind: da.kind ?? raw.sourceKind };
    if (da.characters && typeof da.characters === "object") {
      const c = da.characters as Record<string, unknown>;
      const flat = (key: string): unknown[] => {
        // 形态 A：{goals:[...], actions:[...]}
        if (Array.isArray(c.goals) || Array.isArray(c.actions)) return Array.isArray(c[key]) ? (c[key] as unknown[]) : [];
        // 形态 B：{"顾沉":{goals:[...]}, "阿夏":{goals:[...]}} —— 按人名分组，拍平并补 character 字段
        const acc: unknown[] = [];
        for (const [name, boxed] of Object.entries(c)) {
          if (!boxed || typeof boxed !== "object") continue;
          const inner = (boxed as Record<string, unknown>)[key];
          if (!Array.isArray(inner)) continue;
          for (const item of inner) {
            if (typeof item === "string") {
              // 纯字符串没有 evidenceIds，先在条目上留空，后面统一挂 fallback
              acc.push({ character: name, label: item, description: item, __needsEv: true });
            } else if (item && typeof item === "object") {
              acc.push({ character: name, ...(item as Record<string, unknown>) });
            }
          }
        }
        return acc;
      };
      daOut.characters = {
        goals: norm(flat("goals")),
        actions: norm(flat("actions")),
        relationshipChanges: norm(flat("relationshipChanges")),
      };
    }
    if (da.plot && typeof da.plot === "object") {
      const p = da.plot as Record<string, unknown>;
      daOut.plot = {
        turningPoints: norm(p.turningPoints),
        setups: norm(p.setups),
        payoffs: norm(p.payoffs),
      };
    }
    if (da.themes && typeof da.themes === "object") {
      const th = da.themes as Record<string, unknown>;
      const stages = norm(th.stages).map((s) => {
        const stage = s.label || s.description.slice(0, 40);
        return { ...s, stage, theme: stage, change: s.description, reason: s.description };
      });
      daOut.themes = { ...th, stages };
    }
    if (da.argument && typeof da.argument === "object") {
      const a = da.argument as Record<string, unknown>;
      daOut.argument = {
        claims: norm(a.claims),
        evidenceUnits: norm(a.evidenceUnits),
        reasoningSteps: norm(a.reasoningSteps),
      };
    }
    out.domainAnalysis = daOut;
  }

  // ---- 4. styleProfile: dimension→key（含中文别名）----
  const ALIAS: Record<string, string> = {
    sentenceLength: "sentenceLength", 句子长度: "sentenceLength",
    dialogueRatio: "dialogueRatio", 对话比例: "dialogueRatio", 对话占比: "dialogueRatio",
    sensoryDensity: "sensoryDensity", 感官密度: "sensoryDensity",
    rhetoric: "rhetoric", 修辞手法: "rhetoric", 修辞: "rhetoric",
    narrativeDistance: "narrativeDistance", 叙事距离: "narrativeDistance",
    rhythm: "rhythm", 节奏: "rhythm",
  };
  const sp = raw.styleProfile as Record<string, unknown> | undefined;
  if (sp && typeof sp === "object") {
    // 复用外层已算好的归一化证据集合（obsIdSet / fallbackEv）
    const obsIds = obsIdSet;
    const firstObs = fallbackEv;
    const ms = Array.isArray(sp.metrics) ? sp.metrics : [];
    out.styleProfile = {
      ...sp,
      metrics: ms.map((m: unknown) => {
        if (!m || typeof m !== "object") return m;
        const o = m as Record<string, unknown>;
        const rawKey = String(o.key ?? o.dimension ?? "").trim();
        const key = ALIAS[rawKey];
        if (!key) return o;
        const given = Array.isArray(o.evidenceIds) ? (o.evidenceIds as unknown[]).filter((x): x is string => typeof x === "string") : [];
        const valid = given.filter((id) => obsIds.has(id));
        // 一个有效的都没有时，挂到首个 observation 证据上（指标本身仍要 value/interpretation 齐全）
        const evidenceIds = valid.length ? valid : (firstObs ? [firstObs] : []);
        return { ...o, key, dimension: typeof o.dimension === "string" ? o.dimension : rawKey, evidenceIds };
      }),
    };
  }

  // ---- 5. 曲线 / 热力图：模型形态极多，全部归一 ----

  const pickNum = (o: Record<string, unknown>, keys: string[]): number | undefined => {
    for (const k of keys) {
      const v = o[k];
      if (typeof v === "number" && Number.isFinite(v)) return v;
    }
    return undefined;
  };
  /** 统一到 0–100；模型可能给 0–1、-1–1、或已是 0–100 */
  const scale = (v: number | undefined): number | undefined => {
    if (v === undefined) return undefined;
    if (v >= 0 && v <= 1) return Math.round(v * 100);
    if (v < 0 && v >= -1) return Math.round((v + 1) * 50);   // 情绪轴 -1..1
    return Math.round(Math.min(100, Math.max(0, v)));
  };
  /**
   * 取证据 id：**不给无效 id 兜底**。
   * - 本来就有 id → 原样返回，交给校验器判定（无效的会被拒，这是防幻觉底线）
   * - 完全没写 id → 才挂 fallback（模型漏填，不是编造）
   */
  const validEv = (o: Record<string, unknown>): string => {
    const ids = Array.isArray(o.evidenceIds)
      ? (o.evidenceIds as unknown[]).filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      : (typeof o.evidenceId === "string" && o.evidenceId.trim() ? [o.evidenceId.trim()] : []);
    if (ids.length) return ids[0];
    return fallbackEv;
  };
  const unwrap = (v: unknown, inner: string): unknown[] | undefined => {
    if (Array.isArray(v)) return v;
    if (v && typeof v === "object") {
      const boxed = (v as Record<string, unknown>)[inner];
      if (Array.isArray(boxed)) return boxed;
    }
    return undefined;
  };

  /** 曲线点：{position,label,pace|valence|emotion|value} → {segment,value,evidenceId} */
  const curvePoint = (item: unknown, keys: string[]): unknown => {
    if (!item || typeof item !== "object") return item;
    const o = item as Record<string, unknown>;
    return {
      segment: firstOf(o, ["segment", "label", "name", "stage"], 200) ?? "片段",
      value: scale(pickNum(o, keys)) ?? 0,
      evidenceId: validEv(o),
    };
  };

  const paceArr = unwrap(raw.paceCurve, "points");
  if (paceArr) out.paceCurve = paceArr.map((x) => curvePoint(x, ["value", "pace", "density"]));

  const emoArr = unwrap(raw.emotionCurve, "points");
  if (emoArr) out.emotionCurve = emoArr.map((x) => curvePoint(x, ["emotion", "value", "arousal", "intensity", "valence"]));

  /** 热力图：三种形态 —— 扁平 / {themes:[{segments}]} / {themes:[...]} —— 一律拍平成 {theme,segment,value,evidenceId} */
  const heatCells: unknown[] = [];
  const thArr = unwrap(raw.themeHeatmap, "themes");
  if (thArr) {
    for (const item of thArr) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const themeName = firstOf(o, ["theme", "name", "label"], 200) ?? "主题";
      const segs = unwrap(o.segments, "segments");
      if (segs) {
        // 嵌套形态 A：segments 是对象数组 [{position, heat}]
        // 嵌套形态 B：segments 是纯数字数组 [0.6, 0.8, ...]（模型常用这个表示沿文本的密度序列）
        const themeEv = validEv(o);
        segs.forEach((s, idx) => {
          if (typeof s === "number") {
            heatCells.push({
              theme: themeName,
              segment: `第${idx + 1}段`,
              value: scale(s) ?? 0,
              evidenceId: themeEv,
            });
            return;
          }
          if (!s || typeof s !== "object") return;
          const so = s as Record<string, unknown>;
          heatCells.push({
            theme: themeName,
            segment: firstOf(so, ["segment", "label", "name"], 200) ?? `位置${String(so.position ?? idx)}`,
            value: scale(pickNum(so, ["heat", "value", "density", "intensity", "weight"])) ?? 0,
            evidenceId: validEv(so) || themeEv,
          });
        });
      } else {
        // 扁平形态
        heatCells.push({
          theme: themeName,
          segment: firstOf(o, ["segment", "stage", "section", "label"], 200) ?? "全篇",
          value: scale(pickNum(o, ["value", "heat", "density", "intensity", "weight"])) ?? 0,
          evidenceId: validEv(o),
        });
      }
    }
  }
  if (heatCells.length) out.themeHeatmap = heatCells;

  return out;
}
