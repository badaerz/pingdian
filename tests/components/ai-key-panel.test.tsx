import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { AiKeyPanel } from "@/components/settings/ai-key-panel";
import { USER_AI_KEY_STORAGE } from "@/lib/ai/user-key";

const KEY = "sk-abcdefghijklmnopqrstuvwxyz012345";

beforeEach(() => {
  window.localStorage.clear();
});

describe("设置页的自带密钥面板", () => {
  it("没填密钥时明确说明会退回演示结果", () => {
    render(<AiKeyPanel />);
    expect(screen.getByText("尚未填写密钥")).toBeVisible();
    expect(screen.getByText(/密钥只保存在当前浏览器/)).toBeVisible();
    expect(screen.getByText(/不填则使用演示结果/)).toBeVisible();
  });

  it("保存后只显示打码形态，浏览器里存的是完整密钥", async () => {
    const user = userEvent.setup();
    render(<AiKeyPanel />);

    await user.type(screen.getByLabelText("DeepSeek API Key"), KEY);
    await user.click(screen.getByRole("button", { name: "保存密钥" }));

    expect(await screen.findByText(/当前使用：sk-ab…/)).toBeVisible();
    expect(screen.queryByText(KEY)).toBeNull();
    expect(window.localStorage.getItem(USER_AI_KEY_STORAGE)).toBe(KEY);
    // 保存后输入框清空，避免密钥明文留在页面上
    expect((screen.getByLabelText("DeepSeek API Key") as HTMLInputElement).value).toBe("");
  });

  it("格式不对时拒绝保存并说明原因", async () => {
    const user = userEvent.setup();
    render(<AiKeyPanel />);

    await user.type(screen.getByLabelText("DeepSeek API Key"), "abc123");
    await user.click(screen.getByRole("button", { name: "保存密钥" }));

    expect(await screen.findByText(/密钥格式不对/)).toBeVisible();
    expect(window.localStorage.getItem(USER_AI_KEY_STORAGE)).toBeNull();
  });

  it("清除后回到未填写状态", async () => {
    const user = userEvent.setup();
    render(<AiKeyPanel />);

    await user.type(screen.getByLabelText("DeepSeek API Key"), KEY);
    await user.click(screen.getByRole("button", { name: "保存密钥" }));
    await screen.findByRole("button", { name: /清除密钥/ });
    await user.click(screen.getByRole("button", { name: /清除密钥/ }));

    await waitFor(() => expect(screen.getByText("尚未填写密钥")).toBeVisible());
    expect(window.localStorage.getItem(USER_AI_KEY_STORAGE)).toBeNull();
  });

  it("页面加载时读回已保存的密钥并打码显示", () => {
    window.localStorage.setItem(USER_AI_KEY_STORAGE, KEY);
    render(<AiKeyPanel />);
    expect(screen.getByText(/当前使用：sk-ab…/)).toBeVisible();
  });
});
