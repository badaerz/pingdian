import type { Metadata } from "next";
import "./globals.css";
import "./workspaces.css";
import "./pingdian-workspaces.css";
import { RouteShell } from "@/components/layout/route-shell";

export const metadata: Metadata = {
  title: "评点",
  description: "以叙事智能，淬炼文学匠心——面向中文创作者的数字人文写作工作台",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body><RouteShell>{children}</RouteShell></body>
    </html>
  );
}
