/** GLTFExporter reads its Blob output through FileReader, which Node does not ship. */
class NodeFileReader {
  result: ArrayBuffer | null = null;
  onloadend: (() => void) | null = null;
  readAsArrayBuffer(blob: Blob) {
    void blob.arrayBuffer().then((buffer) => {
      this.result = buffer;
      this.onloadend?.();
    });
  }
}

export function installNodeFileReader(): void {
  if (typeof globalThis.FileReader === "undefined") {
    (globalThis as unknown as { FileReader: unknown }).FileReader = NodeFileReader;
  }
}
