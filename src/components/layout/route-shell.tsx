"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { ViewTransition } from "react";
import "./route-transition.css";

const WorkspaceShell = dynamic(() => import("./workspace-shell"));

export function RouteShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const page = <ViewTransition key={pathname} name="reading-page" share="reading-navigation" default="none"><div>{children}</div></ViewTransition>;
  return pathname === "/" ? page : <WorkspaceShell>{page}</WorkspaceShell>;
}
