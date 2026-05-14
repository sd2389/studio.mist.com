import { notFound } from "next/navigation";
import { StoneViewer } from "@/components/stones/StoneViewer";
import { getCutById } from "@/lib/stones/cut-geometries";

type StonePageProps = {
  params: Promise<{ id: string }>;
};

export default async function StoneCutPage({ params }: StonePageProps) {
  const { id } = await params;
  const cut = getCutById(id);
  if (!cut) notFound();
  return <StoneViewer cutId={cut.id} />;
}
