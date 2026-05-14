import { ViewerShell } from "@/components/viewer/ViewerShell";

type EmbedPageProps = {
  params: Promise<{ id: string }>;
};

export default async function EmbedPage({ params }: EmbedPageProps) {
  const { id } = await params;
  return <ViewerShell modelId={id} variant="embed" />;
}
