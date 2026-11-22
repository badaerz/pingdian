import { IpConcept } from "@/components/ip-lab/ip-concept";

export default async function IpLabPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <IpConcept projectId={id} />;
}
