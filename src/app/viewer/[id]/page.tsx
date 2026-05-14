import { ViewerShell } from "@/components/viewer/ViewerShell";

type ViewerPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ViewerPage({ params }: ViewerPageProps) {
  const { id } = await params;
  return <ViewerShell modelId={id} variant="studio" />;
}
