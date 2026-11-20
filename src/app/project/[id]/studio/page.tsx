import { StudioWorkspace } from "@/components/studio/studio-workspace";
import { CopyCaseButton } from "@/components/studio/copy-case-button";

export default async function StudioPage({ params }: PageProps<"/project/[id]/studio">) {
  const { id } = await params;
  return <StudioWorkspace projectId={id} copyCaseAction={<CopyCaseButton />} />;
}
