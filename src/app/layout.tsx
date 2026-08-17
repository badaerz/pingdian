import type { Metadata } from "next";
import "./globals.css";
import { AppShell } from "@/components/layout/app-shell";
import { StoryProvider } from "@/providers/story-provider";

export const metadata: Metadata = {
  title: "故事熔炉",
  description: "面向中文创作者的数字人文写作工作台",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body><StoryProvider><AppShell>{children}</AppShell></StoryProvider></body>
    </html>
  );
}
