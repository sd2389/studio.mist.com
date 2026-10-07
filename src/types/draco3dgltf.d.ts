declare module "draco3dgltf" {
  /** The Emscripten module's options: `locateFile` says where its WASM is. */
  type DracoModuleOptions = { locateFile?: (path: string, prefix: string) => string };
  export function createDecoderModule(options?: DracoModuleOptions): Promise<unknown>;
  export function createEncoderModule(options?: DracoModuleOptions): Promise<unknown>;
}
