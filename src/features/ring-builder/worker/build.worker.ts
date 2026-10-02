import { buildJewelry, exportAllSizesZip } from "@/lib/jewelry-cad";
import { serializeParts, type BuildRequest, type BuildResponse } from "@/features/ring-builder/domain/build-protocol";

/**
 * Geometry worker: builds designs and size packs off the main thread so sliders stay at
 * frame rate while the CAD kernel sweeps shanks and cuts stones.
 */

type WorkerScope = {
  onmessage: ((event: MessageEvent<BuildRequest>) => void) | null;
  postMessage(message: BuildResponse, transfer?: Transferable[]): void;
};

const scope = self as unknown as WorkerScope;

function handle(request: BuildRequest): void {
  if (request.type === "build") {
    const built = buildJewelry(request.design);
    const { parts, transfer } = serializeParts(built.parts);
    scope.postMessage({ type: "built", id: request.id, parts, specs: built.specs }, transfer);
    return;
  }
  const bytes = exportAllSizesZip(request.design, {
    name: request.name,
    onProgress: (done, total) => scope.postMessage({ type: "progress", id: request.id, done, total }),
  });
  scope.postMessage({ type: "zip", id: request.id, bytes }, [bytes.buffer as ArrayBuffer]);
}

scope.onmessage = (event) => {
  try {
    handle(event.data);
  } catch (error) {
    scope.postMessage({ type: "error", id: event.data.id, message: error instanceof Error ? error.message : String(error) });
  }
};
