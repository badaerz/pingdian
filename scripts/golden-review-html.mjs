#!/usr/bin/env node
// 生成人工审定用的 HTML 页面（浏览器里直接读、直接标、直接写意见）。
//
//   node scripts/golden-review-html.mjs        # 生成 docs/golden_审定.html
//
// 为什么不是 Markdown：46 条 case、135 条结论，Markdown 里做复选框要手打 `x`，
// 读起来也不像文档像源码。HTML 版能高亮锚点在原文里的位置、能点、能写意见、能导出。

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const GOLDEN = path.join(ROOT, "evals", "golden");
const OUT = path.join(ROOT, "docs", "golden_审定.html");

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** 把锚点在原文里标出来，审定人一眼能看到这条结论指着哪一句 */
function highlight(text, anchors) {
  let html = esc(text);
  for (const anchor of anchors.filter(Boolean)) {
    const safe = esc(anchor);
    if (!safe.trim()) continue;
    html = html.split(safe).join(`<mark>${safe}</mark>`);
  }
  return html;
}

const GENRE_LABEL = {
  "narrative-fic": "小说",
  "narrative-nonfic": "叙事散文 / 史传",
  lyric: "抒情散文",
  poetry: "诗词",
  drama: "戏剧",
  argumentative: "议论",
  expository: "说明文",
};

/** 判据编号 → 维度名与原文，让审定人看得懂「依据判据 S2」到底指什么 */
const CRITERIA = JSON.parse(readFileSync(path.join(ROOT, "src", "lib", "ai", "criteria-data.json"), "utf8"));
const CRITERIA_ROWS = Array.isArray(CRITERIA) ? CRITERIA : CRITERIA.criteria;
const CRITERIA_BY_ID = new Map(CRITERIA_ROWS.map((row) => [row.id, row]));

function criteriaLabel(ids) {
  return (ids ?? []).map((id) => {
    const row = CRITERIA_BY_ID.get(id);
    return row ? `${row.dimension}：${row.statement}` : id;
  }).join("；");
}

const files = readdirSync(GOLDEN).filter((f) => /^GC_\d+\.json$/.test(f)).sort();
const cases = files.map((f) => JSON.parse(readFileSync(path.join(GOLDEN, f), "utf8")));

const sections = cases.map((c, index) => {
  const findings = c.expectedFindings ?? [];
  const anchors = findings.map((f) => f.requiredAnchor);
  return `
<section class="case" id="${c.id}" data-id="${c.id}">
  <header class="case-head">
    <div class="case-no">${index + 1} / ${cases.length}</div>
    <h2>${esc(c.title)}</h2>
    <div class="meta">
      <span class="tag">${esc(GENRE_LABEL[c.source?.genre] ?? c.source?.genre ?? "未标体裁")}</span>
      <span>${esc(c.source?.ref ?? "")}</span>
      <span>${esc(c.source?.locator ?? "")}</span>
      <span>${(c.text ?? "").replace(/\s/g, "").length} 字</span>
    </div>
  </header>

  <details class="source">
    <summary>展开原文（黄色是这条结论要指的位置）</summary>
    <div class="prose">${highlight(c.text ?? "", anchors).replace(/\n/g, "<br>")}</div>
  </details>

  <h3>这段文本应该被诊断出的问题 <small>（${findings.length} 条）</small></h3>
  ${findings.map((f, i) => `
  <div class="finding" data-case="${c.id}" data-idx="${i}">
    <div class="finding-text">${esc(f.claim)}</div>
    <div class="finding-meta">
      <span>依据 <b>${esc(criteriaLabel(f.criteriaIds))}</b></span>
      <span>性质 <b>${f.basis === "positive" ? "做到了" : f.basis === "defect" ? "有问题" : "未标"}</b></span>
      <span>重要度 <b>${esc(f.severity)}</b></span>
    </div>
    <div class="anchor">指着原文：<q>${esc(f.requiredAnchor)}</q></div>
    <div class="vote">
      <button type="button" class="ok" data-vote="ok">成立</button>
      <button type="button" class="no" data-vote="no">不成立</button>
      <button type="button" class="skip" data-vote="">待定</button>
    </div>
    <textarea class="note" rows="1" placeholder="有意见就写在这里（可不填）"></textarea>
  </div>`).join("")}

  ${(c.forbiddenClaims ?? []).length ? `
  <div class="forbidden">
    <h3>模型若这样说，就是编造 <small>（用于检验误报）</small></h3>
    ${(c.forbiddenClaims ?? []).map((f) => `<div class="fc"><span>${esc(f.claim)}</span><small>${esc(f.reason)}</small></div>`).join("")}
  </div>` : ""}
</section>`;
}).join("");

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>评测样本审定 · 故事熔炉</title>
<style>
  :root { color-scheme: light; --ink:#1f1d1a; --muted:#6b665e; --line:#ddd6c9; --paper:#fdfcf8; --panel:#fff; --gold:#a77a2b; --green:#315947; --red:#a33; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--paper); color:var(--ink);
         font:15px/1.75 -apple-system, "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif; }
  .wrap { max-width: 860px; margin: 0 auto; padding: 0 24px 120px; }
  .top { position: sticky; top:0; z-index:10; background:rgba(253,252,248,.96); backdrop-filter:blur(6px);
         border-bottom:1px solid var(--line); padding:14px 24px; margin-bottom:8px; }
  .top-inner { max-width:860px; margin:0 auto; display:flex; align-items:center; gap:16px; flex-wrap:wrap; }
  .top h1 { font-size:16px; margin:0; font-weight:600; }
  .bar { flex:1; min-width:140px; height:6px; background:#e8e2d5; border-radius:3px; overflow:hidden; }
  .bar > i { display:block; height:100%; width:0; background:var(--green); transition:width .2s; }
  .top .stat { font-size:13px; color:var(--muted); font-variant-numeric:tabular-nums; }
  .name { border:1px solid var(--line); border-radius:4px; padding:5px 9px; font-size:13px; width:150px; background:var(--panel); }
  .intro { background:var(--panel); border:1px solid var(--line); border-left:3px solid var(--gold); padding:16px 20px; margin:20px 0 28px; }
  .intro h2 { margin:0 0 8px; font-size:15px; }
  .intro ol { margin:0; padding-left:20px; } .intro li { margin:4px 0; }
  .case { background:var(--panel); border:1px solid var(--line); padding:22px 24px; margin:0 0 24px; border-radius:4px; }
  .case-head { border-bottom:1px solid var(--line); padding-bottom:12px; margin-bottom:16px; }
  .case-no { font-size:12px; color:var(--gold); letter-spacing:.08em; font-variant-numeric:tabular-nums; }
  .case h2 { font-size:18px; margin:4px 0 8px; font-weight:600; }
  .meta { display:flex; gap:14px; flex-wrap:wrap; font-size:12.5px; color:var(--muted); }
  .tag { border:1px solid var(--gold); color:var(--gold); border-radius:3px; padding:0 6px; }
  .source summary { cursor:pointer; font-size:13.5px; color:var(--green); user-select:none; }
  .prose { font-family: "Songti SC", "SimSun", Georgia, serif; font-size:15.5px; line-height:2.1;
           background:#faf8f2; border:1px solid var(--line); padding:16px; margin-top:10px;
           max-height:340px; overflow:auto; border-radius:3px; }
  .prose mark { background:#fde68a; padding:0 1px; }
  h3 { font-size:14px; margin:22px 0 10px; font-weight:600; }
  h3 small { color:var(--muted); font-weight:400; }
  .finding { border:1px solid var(--line); border-radius:4px; padding:14px 16px; margin:0 0 12px; transition:border-color .15s,background .15s; }
  .finding[data-state="ok"] { border-color:var(--green); background:#f4f8f5; }
  .finding[data-state="no"] { border-color:var(--red); background:#fdf5f5; }
  .finding-text { font-size:14.5px; line-height:1.8; }
  .finding-meta { display:flex; gap:14px; flex-wrap:wrap; font-size:12px; color:var(--muted); margin-top:8px; }
  .finding-meta b { color:var(--ink); font-weight:600; }
  .anchor { font-size:12.5px; color:var(--muted); margin-top:6px; }
  .anchor q { color:var(--ink); background:#fdf6e3; padding:1px 4px; border-radius:2px; font-style:normal; }
  .vote { display:flex; gap:8px; margin-top:12px; }
  .vote button { border:1px solid var(--line); background:var(--paper); border-radius:4px;
                 padding:6px 16px; font-size:13px; cursor:pointer; font-family:inherit; }
  .vote button:hover { border-color:var(--muted); }
  .vote .ok[aria-pressed="true"] { background:var(--green); border-color:var(--green); color:#fff; }
  .vote .no[aria-pressed="true"] { background:var(--red); border-color:var(--red); color:#fff; }
  .vote .skip[aria-pressed="true"] { background:#e8e2d5; border-color:#cfc7b8; }
  .note { width:100%; margin-top:10px; border:1px solid var(--line); border-radius:4px; padding:8px 10px;
          font:13px/1.6 inherit; font-family:inherit; resize:vertical; background:var(--paper); }
  .forbidden { margin-top:20px; border-top:1px dashed var(--line); padding-top:4px; }
  .fc { font-size:13px; padding:7px 0; border-bottom:1px dotted #eae4d8; display:flex; gap:12px; justify-content:space-between; }
  .fc small { color:var(--muted); text-align:right; max-width:50%; }
  .export { position:fixed; bottom:0; left:0; right:0; background:rgba(253,252,248,.97);
            border-top:1px solid var(--line); padding:12px 24px; backdrop-filter:blur(6px); }
  .export-inner { max-width:860px; margin:0 auto; display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
  .export button { background:var(--green); color:#fff; border:0; border-radius:4px; padding:9px 20px;
                   font:14px inherit; font-family:inherit; cursor:pointer; }
  .export button.ghost { background:transparent; color:var(--ink); border:1px solid var(--line); }
  .export .hint { font-size:12.5px; color:var(--muted); }
  @media print { .top,.export { display:none; } }
</style>
</head>
<body>

<div class="top"><div class="top-inner">
  <h1>评测样本审定</h1>
  <div class="bar"><i id="bar"></i></div>
  <div class="stat"><span id="done">0</span> / ${cases.reduce((a, c) => a + (c.expectedFindings ?? []).length, 0)} 条已判</div>
  <input class="name" id="reviewer" placeholder="你的名字">
</div></div>

<div class="wrap">
  <div class="intro">
    <h2>怎么审</h2>
    <ol>
      <li>先在最上面填你的名字（审定要留痕）。</li>
      <li>每条结论只判断一件事：<b>这条，真的是这段文本里的问题吗？</b>　　不用管措辞好不好。</li>
      <li>点「成立」或「不成立」。没把握就点「待定」或干脆不点——<b>宁可不判，不要凑数</b>。</li>
      <li>有想说的话，写在该条下面的输入框里。</li>
      <li>全部做完后点右下角「导出结果」，把下载的文件发给我。</li>
    </ol>
    <p style="margin:10px 0 0;font-size:13px;color:var(--muted)">
      进度会自动存在这台浏览器里，关掉再打开还在。共 ${cases.length} 条样本。
    </p>
  </div>

${sections}
</div>

<div class="export"><div class="export-inner">
  <button id="download">导出结果</button>
  <button id="reset" class="ghost">清空重来</button>
  <span class="hint">导出后把文件发给我，我按你的判断回写评测集。</span>
</div></div>

<script>
(function () {
  var KEY = "storyforge-golden-review-v1";
  var state = { reviewer: "", votes: {}, notes: {} };
  try { var raw = localStorage.getItem(KEY); if (raw) state = JSON.parse(raw); } catch (e) {}
  if (!state.votes) state.votes = {};
  if (!state.notes) state.notes = {};

  var reviewerEl = document.getElementById("reviewer");
  reviewerEl.value = state.reviewer || "";

  function save() {
    state.reviewer = reviewerEl.value;
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
    refresh();
  }

  function refresh() {
    var total = 0, done = 0;
    document.querySelectorAll(".finding").forEach(function (el) {
      var key = el.dataset.case + "#" + el.dataset.idx;
      var vote = state.votes[key] || "";
      el.dataset.state = vote === "ok" ? "ok" : vote === "no" ? "no" : "";
      el.querySelectorAll("button").forEach(function (b) {
        b.setAttribute("aria-pressed", String(b.dataset.vote === vote));
      });
      var note = el.querySelector(".note");
      if (note.value !== (state.notes[key] || "")) note.value = state.notes[key] || "";
      total += 1;
      if (vote) done += 1;
    });
    document.getElementById("done").textContent = done;
    document.getElementById("bar").style.width = total ? (done / total * 100) + "%" : "0";
  }

  document.addEventListener("click", function (e) {
    var btn = e.target.closest(".vote button");
    if (!btn) return;
    var box = btn.closest(".finding");
    var key = box.dataset.case + "#" + box.dataset.idx;
    var current = state.votes[key] || "";
    state.votes[key] = current === btn.dataset.vote ? "" : btn.dataset.vote;
    save();
  });

  document.addEventListener("input", function (e) {
    if (e.target.classList.contains("note")) {
      var box = e.target.closest(".finding");
      state.notes[box.dataset.case + "#" + box.dataset.idx] = e.target.value;
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (err) {}
    }
    if (e.target.id === "reviewer") { state.reviewer = e.target.value; try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (err) {} }
  });

  document.getElementById("download").addEventListener("click", function () {
    var payload = { reviewer: reviewerEl.value, reviewedAt: new Date().toISOString().slice(0, 10), votes: state.votes, notes: state.notes };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "golden-审阅结果-" + (reviewerEl.value || "未署名") + ".json";
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  });

  document.getElementById("reset").addEventListener("click", function () {
    if (!confirm("确定清空所有已判结果？这个操作不可撤销。")) return;
    state = { reviewer: reviewerEl.value, votes: {}, notes: {} };
    save();
  });

  refresh();
})();
</script>
</body>
</html>
`;

writeFileSync(OUT, html, "utf8");
console.log(`已生成 ${path.relative(ROOT, OUT)}`);
console.log(`共 ${cases.length} 条样本、${cases.reduce((a, c) => a + (c.expectedFindings ?? []).length, 0)} 条结论`);
console.log("用浏览器打开这个文件就能审（Chrome / Edge 都行）");
