import type { Metadata } from "next";
import "./globals.css";
import "./marketing.css";
import "./workspaces.css";
import { AppShell } from "@/components/layout/app-shell";
import { StoryProvider } from "@/providers/story-provider";

export const metadata: Metadata = {
  title: "Story Forge（故事熔炉）",
  description: "以叙事智能，淬炼文学匠心——面向中文创作者的数字人文写作工作台",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body><StoryProvider><AppShell>{children}</AppShell></StoryProvider></body>
    </html>
  );
}
