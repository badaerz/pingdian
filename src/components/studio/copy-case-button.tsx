"use client";

import { Copy } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useStory } from "@/providers/story-provider";

export function CopyCaseButton() {
  const { state, createProject } = useStory();
  const router = useRouter();
  const project = state.projects.find((item) => item.id === state.activeProjectId);
  if (!project) return null;

  const copyCase = () => {
    const id = createProject(
      { title: `${project.title}（副本）`, genre: project.genre, logline: project.logline },
      { chapters: state.chapters, characters: state.characters, worldEntries: state.worldEntries, blueprint: state.blueprint, workflowStage: state.workflowStage },
    );
    router.push(`/project/${id}/studio`);
  };
  return <Button onClick={copyCase}><Copy size={16} />复制案例并编辑</Button>;
}
