import { IpLabWorkspace } from "@/components/ip-lab/ip-lab-workspace";

export default async function IpLabPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <IpLabWorkspace projectId={id} />;
}
