"use client";

import { KeyRound, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  clearStoredUserAiKey,
  isValidUserAiKey,
  maskUserAiKey,
  storeUserAiKey,
  USER_AI_KEY_STORAGE,
} from "@/lib/ai/user-key";

/**
 * 自带 AI 密钥（BYOK）。
 *
 * 用户用自己的 DeepSeek 密钥，费用自己承担；本站不提供、不代付。
 * 密钥只存当前浏览器，请求时随 header 上行，服务端当次用完即弃。
 *
 * 这里刻意不把密钥回填到输入框——只在保存后显示打码形态，
 * 避免一次肩窥就把整把密钥看走。
 */
export function AiKeyPanel() {
  const [draft, setDraft] = useState("");
  // 惰性初始化直接读本地存储：这个组件只在浏览器里渲染，
  // 用 useEffect 再回填会多一帧「未填写」的闪烁，也会触发 set-state-in-effect 规则。
  const [saved, setSaved] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(USER_AI_KEY_STORAGE);
      return raw && isValidUserAiKey(raw) ? raw : null;
    } catch {
      return null;
    }
  });
  const [feedback, setFeedback] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const save = () => {
    if (storeUserAiKey(draft)) {
      const raw = window.localStorage.getItem(USER_AI_KEY_STORAGE);
      setSaved(raw);
      setDraft("");
      setFeedback({ kind: "ok", text: "已保存到本浏览器，之后的分析会用你的密钥调用" });
    } else {
      setFeedback({ kind: "error", text: "密钥格式不对：DeepSeek 密钥以 sk- 开头，且不含空格" });
    }
  };

  const clear = () => {
    clearStoredUserAiKey();
    setSaved(null);
    setDraft("");
    setFeedback({ kind: "ok", text: "已清除。之后不再使用你的密钥，需要时会退回演示结果" });
  };

  return (
    <section id="ai-key" aria-labelledby="ai-key-title">
      <div className="settings-heading">
        <div><KeyRound /><h2 id="ai-key-title">自带 AI 密钥</h2></div>
        <p>填你自己的 DeepSeek 密钥，调用费用由你的账号承担。不填则使用演示结果。</p>
      </div>

      <div className="privacy-row">
        <ShieldCheck />
        <div>
          <strong>{saved ? `当前使用：${maskUserAiKey(saved)}` : "尚未填写密钥"}</strong>
          <p>
            密钥只保存在当前浏览器，不会上传到本站数据库，也不会写进任何日志。
            每次请求由你的浏览器带到本站接口，接口当次用完即弃。
          </p>
        </div>
        {saved && <StatusBadge kind="success">已启用</StatusBadge>}
      </div>

      <label className="field">
        <span>DeepSeek API Key</span>
        <input
          type="password"
          className="input"
          aria-label="DeepSeek API Key"
          placeholder="sk-..."
          autoComplete="off"
          spellCheck={false}
          value={draft}
          onChange={(event) => { setDraft(event.target.value); setFeedback(null); }}
        />
      </label>

      <div className="dialog-actions">
        <Button onClick={save} disabled={!draft.trim()}>保存密钥</Button>
        {saved && <Button variant="secondary" onClick={clear}><Trash2 size={16} />清除密钥</Button>}
      </div>

      {feedback && (
        <div className={feedback.kind === "ok" ? "settings-alert" : "settings-alert danger"} role="status">
          <ShieldCheck size={18} />
          <div><strong>{feedback.text}</strong></div>
        </div>
      )}

      <p className="muted">
        需要知道的一点：密钥会经过本站服务端一次（用于转发给你选的供应商），
        但本站不存储、不记录。如果你不接受这一点，请不要填写。
      </p>
    </section>
  );
}
