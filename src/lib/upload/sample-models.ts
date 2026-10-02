export type SampleModel = {
  id: string;
  label: string;
  url: string;
  filename: string;
};

export const SAMPLE_MODELS: SampleModel[] = [
  {
    id: "solitaire",
    label: "Solitaire",
    url: "/models/samples/solitaire.glb",
    filename: "Solitaire.glb",
  },
  {
    id: "halo",
    label: "Halo",
    url: "/models/samples/halo.glb",
    filename: "Halo.glb",
  },
];

/** A sample that is not deployed (404) or came back as an HTML error page. */
export class SampleUnavailableError extends Error {
  constructor(sample: SampleModel) {
    super(`The ${sample.label} sample isn't available right now — drop your own file to continue.`);
    this.name = "SampleUnavailableError";
  }
}

export async function fetchSampleModelFile(sample: SampleModel): Promise<File> {
  let res: Response;
  try {
    res = await fetch(sample.url);
  } catch {
    throw new Error(`Could not load the ${sample.label} sample — check your connection.`);
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (res.status === 404 || contentType.includes("text/html")) throw new SampleUnavailableError(sample);
  if (!res.ok) throw new Error(`Could not load the ${sample.label} sample (${res.status}).`);
  const blob = await res.blob();
  return new File([blob], sample.filename, { type: blob.type || "model/gltf-binary" });
}
