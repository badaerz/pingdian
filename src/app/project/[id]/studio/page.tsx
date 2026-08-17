import { StudioWorkspace } from "@/components/studio/studio-workspace";

export default async function StudioPage({ params }: PageProps<"/project/[id]/studio">) {
  const { id } = await params;
  return <StudioWorkspace projectId={id} />;
}
