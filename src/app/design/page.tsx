import type { Metadata } from "next";
import { DesignerPage, designFromParams, isPreviewView } from "@/features/ring-builder";

export const metadata: Metadata = {
  title: "Design a ring · MIST Studio",
  description:
    "Configure a ring, studs or pendant in the browser — cut, carat, metal, band and size — with a live 3D preview and print-ready STL, OBJ and GLB files in every size.",
};

type DesignPageProps = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

function first(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export default async function DesignPage({ searchParams }: DesignPageProps) {
  const params = await searchParams;
  const { presetId } = designFromParams({ preset: first(params.preset) });
  const view = first(params.view);
  return <DesignerPage key={presetId} initialPreset={presetId} initialView={isPreviewView(view) ? view : "perspective"} />;
}
