"use client";

import { StoryProvider } from "@/providers/story-provider";
import { AppShell } from "./app-shell";

export default function WorkspaceShell({ children }: { children: React.ReactNode }) {
  return <StoryProvider><AppShell>{children}</AppShell></StoryProvider>;
}
