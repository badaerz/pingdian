#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
离线校验器 v3 —— 用真实 raw 响应离线复算，扫出全部失败点（不花钱、不限次数）。
用法: python3 -I scripts/offline-validate.py "evals/runs/raw-GC_*-<时间戳>.json"
"""
import json, glob, re, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

STD = {"sentenceLength","dialogueRatio","sensoryDensity","rhetoric","narrativeDistance","rhythm"}
ALIAS = {"句子长度":"sentenceLength","对话比例":"dialogueRatio","对话占比":"dialogueRatio",
         "感官密度":"sensoryDensity","修辞手法":"rhetoric","修辞":"rhetoric",
         "叙事距离":"narrativeDistance","节奏":"rhythm"}

# ---- 语义归一化：模型用各种名字表达同样意思 ----
LABEL_KEYS   = ("label","character","event","setup","payoff","point","name","pair","stage")
DESC_KEYS    = ("description","goal","action","change","significance","reason","summary","content")


META_KEYS = {"id", "evidenceIds", "evidenceQuotes", "degraded"}

def has_content(item):
    """对象里是否有任何有意义的文本内容（排除元数据字段）"""
    for k, v in item.items():
        if k in META_KEYS: continue
        if isinstance(v, str) and v.strip(): return True
        if isinstance(v, list) and any(isinstance(x, str) and x.strip() for x in v): return True
    return False

def pick(d, keys):
    for k in keys:
        v = d.get(k)
        if isinstance(v, str) and v.strip(): return v
    return None

def nz(s): return re.sub(r"[\s>#*_`\-]+", "", s or "")

def ns(e):
    s = e.get("source")
    if isinstance(s, str) and s.lower() not in ("source","sourcetext"): return s
    t = e.get("type")
    return t if isinstance(t, str) else None

def nq(e):
    for k in ("quote","text"):
        v = e.get(k)
        if isinstance(v, str) and v.strip(): return v
    return None

def quote_ok(q, text):
    if not q: return False
    if nz(q) in nz(text): return True
    q2 = re.sub(r"…+|\.\.\.+", "", q)
    if q2 and nz(q2) in nz(text): return True
    for sep in ("…","..."):
        if sep in q:
            parts = [p for p in q.split(sep) if len(p.strip()) >= 6]
            if parts and all(nz(p) in nz(text) for p in parts): return True
    return False

def as_list(v, key=None):
    if isinstance(v, list): return v
    if isinstance(v, dict):
        for k in ([key] if key else []) + ["points","themes","items","list"]:
            if isinstance(v.get(k), list): return v[k]
    return []

def check(path, text):
    f = []
    d = json.load(open(path, encoding="utf-8"))
    sk = d.get("sourceKind")
    if sk not in ("narrative","argumentative"): f.append(f"sourceKind 非法 {sk!r}")

    # evidence
    ev = d.get("evidence") or []
    eids = set()
    if not isinstance(ev, list) or not ev: f.append("evidence 不是非空数组")
    for i, e in enumerate(ev):
        if not isinstance(e, dict): f.append(f"evidence[{i}] 非对象"); continue
        if e.get("id"): eids.add(e["id"])
        src, q = ns(e), nq(e)
        if src is None and q: src = "observation"
        if src in ("observation","user"):
            if not quote_ok(q, text): f.append(f"evidence[{i}] 引文不在原文")
        elif src == "knowledge":
            if not q: f.append(f"evidence[{i}] knowledge 缺 quote")
        elif src == "inference":
            if not e.get("claim"): f.append(f"evidence[{i}] inference 缺 claim")
        else:
            f.append(f"evidence[{i}] source/type 非法 {src!r}")

    # domainAnalysis —— v3 标准：只要求有内容 + 有证据，不要求固定字段名
    da = d.get("domainAnalysis")
    if not isinstance(da, dict): f.append("domainAnalysis 缺失")
    else:
        th = da.get("themes")
        if not isinstance(th, dict): f.append("themes 缺失")
        else:
            st = as_list(th.get("stages"), "stages")
            if not st: f.append("themes.stages 空")
            for i, s in enumerate(st):
                if not isinstance(s, dict): f.append(f"stages[{i}] 非对象"); continue
                if not has_content(s): f.append(f"stages[{i}] 空壳（无任何文本内容）")
        if sk == "narrative":
            ch = da.get("characters")
            if not isinstance(ch, dict): f.append("characters 缺失")
            else:
                for br in ("goals","actions","relationshipChanges"):
                    items = as_list(ch.get(br), br)
                    if not items: f.append(f"characters.{br} 空")
                    for i, it in enumerate(items):
                        if not isinstance(it, dict): f.append(f"characters.{br}[{i}] 非对象"); continue
                        if not has_content(it): f.append(f"characters.{br}[{i}] 空壳")
            pl = da.get("plot")
            if not isinstance(pl, dict): f.append("plot 缺失")
            else:
                for br in ("turningPoints","setups","payoffs"):
                    items = as_list(pl.get(br), br)
                    if not items: f.append(f"plot.{br} 空")
                    for i, it in enumerate(items):
                        if not isinstance(it, dict): f.append(f"plot.{br}[{i}] 非对象"); continue
                        if not has_content(it): f.append(f"plot.{br}[{i}] 空壳")

    # analysis
    an = d.get("analysis") or []
    if not an: f.append("analysis 空")
    for i, a in enumerate(an):
        for k in ("id","name","summary","impact","suggestion"):
            if not (isinstance(a.get(k), str) and a[k].strip()): f.append(f"analysis[{i}].{k}")

    # graph / curves / heatmap
    rg = d.get("relationGraph") or {}
    if not (rg.get("edges") or []): f.append("relationGraph.edges 空")
    for c, k in (("paceCurve","points"),("emotionCurve","points"),("themeHeatmap","themes")):
        if not as_list(d.get(c), k): f.append(f"{c} 空")

    # styleProfile
    got = set()
    for m in (d.get("styleProfile") or {}).get("metrics") or []:
        kk = (m.get("key") or m.get("dimension") or "").strip()
        got.add(ALIAS.get(kk, kk))
    if not STD.issubset(got): f.append(f"六项指标缺 {sorted(STD-got)}")

    # diagnostics
    dg = d.get("diagnostics") or []
    if not dg: f.append("diagnostics 空")
    for i, x in enumerate(dg):
        if not quote_ok(x.get("quote"), text): f.append(f"diagnostics[{i}] 引文不在原文")
        for k in ("id","location","effect","action"):
            if not (isinstance(x.get(k), str) and x[k].strip()): f.append(f"diagnostics[{i}].{k}")
        c2 = x.get("confidence")
        if not (isinstance(c2,(int,float)) and 0 <= c2 <= 1): f.append(f"diagnostics[{i}].confidence")
        for eid in (x.get("evidenceIds") or []):
            if eid not in eids: f.append(f"diagnostics[{i}] 引用未知 {eid}")
    return f

if __name__ == "__main__":
    pat = sys.argv[1] if len(sys.argv) > 1 else "evals/runs/raw-GC_*-2026-11-18T15-27-00-940Z.json"
    files = sorted(glob.glob(pat))
    from collections import Counter
    agg = Counter(); ok = 0
    print(f"=== 校验 {len(files)} 份 raw ===\n")
    for p in files:
        gid = re.search(r"(GC_\d+)", p).group(1)
        text = json.load(open(f"evals/golden/{gid}.json", encoding="utf-8"))["text"]
        fs = check(p, text)
        if not fs: ok += 1
        print(f"{gid}: {'✅' if not fs else '❌ ' + str(len(fs)) + ' 点'}")
        for x in fs[:5]:
            print(f"    - {x}")
            agg[re.sub(r"\[\d+\]", "[i]", x)[:58]] += 1
        if len(fs) > 5: print(f"    ...另有 {len(fs)-5} 点")
    print(f"\n=== {ok}/{len(files)} 通过 ===")
    if agg:
        print("\n高频失败:")
        for k, v in agg.most_common(10): print(f"  {v:3d}× {k}")
