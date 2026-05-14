import { notFound } from "next/navigation";
import { JewelryViewer } from "@/components/gallery/JewelryViewer";
import { getJewelryById } from "@/lib/jewelry/assembly";

type GalleryItemPageProps = {
  params: Promise<{ id: string }>;
};

export default async function GalleryItemPage({ params }: GalleryItemPageProps) {
  const { id } = await params;
  const piece = getJewelryById(id);
  if (!piece) notFound();
  return <JewelryViewer pieceId={piece.id} />;
}
