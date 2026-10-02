import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StoneViewer } from "@/components/stones/StoneViewer";
import { getCutById } from "@/lib/stones/cut-geometries";

type StonePageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: StonePageProps): Promise<Metadata> {
  const cut = getCutById((await params).id);
  return { title: cut ? `${cut.label} · MIST Studio` : "Stone · MIST Studio" };
}

export default async function StoneCutPage({ params }: StonePageProps) {
  const { id } = await params;
  const cut = getCutById(id);
  if (!cut) notFound();
  return <StoneViewer cutId={cut.id} />;
}
