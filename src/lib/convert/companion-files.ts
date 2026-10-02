import * as THREE from "three";

/**
 * Files picked or dropped together with a model (an OBJ's .mtl and textures, a .gltf's .bin).
 * Loaders resolve references by basename through a LoadingManager, so nothing hits the network.
 */
export type CompanionFiles = {
  files: File[];
  /** The companion a model references (by basename, case-insensitive), if it was provided. */
  find: (reference: string) => File | null;
  manager: THREE.LoadingManager;
  /** Revokes blob URLs once every load the manager started (e.g. textures) has finished. */
  dispose: () => void;
};

/** 1×1 transparent PNG: stands in for textures the user did not provide. */
const MISSING_IMAGE_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|bmp|tga|tiff?|dds|ktx2?)$/i;
/** Give up waiting for stray texture loads after this long before revoking URLs. */
const DISPOSE_TIMEOUT_MS = 30_000;

export function referenceBasename(reference: string): string {
  const path = reference.split(/[?#]/)[0] ?? "";
  let decoded = path;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    // Keep the raw reference when it is not valid percent-encoding.
  }
  return (decoded.split(/[\\/]/).pop() ?? "").toLowerCase();
}

export function createCompanionFiles(files: File[]): CompanionFiles {
  const byName = new Map(files.map((file) => [file.name.toLowerCase(), file]));
  const urls = new Map<File, string>();
  const find = (reference: string) => byName.get(referenceBasename(reference)) ?? null;
  let loading = false;
  let onIdle: (() => void) | null = null;

  const manager = new THREE.LoadingManager(
    () => {
      loading = false;
      onIdle?.();
    },
    undefined,
    () => undefined,
  );
  manager.onStart = () => {
    loading = true;
  };
  manager.setURLModifier((url) => {
    if (url.startsWith("data:")) return url;
    const file = find(url);
    if (!file) return IMAGE_EXT_RE.test(referenceBasename(url)) ? MISSING_IMAGE_URL : url;
    let blobUrl = urls.get(file);
    if (!blobUrl) {
      blobUrl = URL.createObjectURL(file);
      urls.set(file, blobUrl);
    }
    return blobUrl;
  });

  const revokeAll = () => {
    for (const url of urls.values()) URL.revokeObjectURL(url);
    urls.clear();
  };
  const dispose = () => {
    if (!loading) return revokeAll();
    const timer = setTimeout(revokeAll, DISPOSE_TIMEOUT_MS);
    onIdle = () => {
      clearTimeout(timer);
      revokeAll();
    };
  };
  return { files, find, manager, dispose };
}
