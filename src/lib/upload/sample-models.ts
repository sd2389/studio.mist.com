export type SampleModel = {
  id: string;
  label: string;
  url: string;
  filename: string;
};

export const SAMPLE_MODELS: SampleModel[] = [
  {
    id: "sample-ring-1",
    label: "Sample Ring 1",
    url: "/models/clearcoat/ClearcoatRing.gltf",
    filename: "Sample-Ring-1.gltf",
  },
  {
    id: "sample-ring-2",
    label: "Sample Ring 2",
    url: "/models/clearcoat/ClearcoatRing.gltf",
    filename: "Sample-Ring-2.gltf",
  },
];

export async function fetchSampleModelFile(sample: SampleModel): Promise<File> {
  const res = await fetch(sample.url);
  if (!res.ok) throw new Error(`Could not load ${sample.label}`);
  const blob = await res.blob();
  return new File([blob], sample.filename, { type: blob.type || "model/gltf+json" });
}
