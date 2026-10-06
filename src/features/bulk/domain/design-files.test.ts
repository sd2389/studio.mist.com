import { describe, expect, it } from "vitest";
import {
  cleanDropPath,
  filesOfEntries,
  filesOfInput,
  isSystemFile,
  withoutSharedFolder,
  type DroppedFile,
} from "@/lib/upload/dropped-files";
import { groupModelFiles } from "@/lib/upload/model-files";
import { designBytes, groupDesignFiles, mergeDrops, uploadedFilesOf } from "./design-files";

function dropped(path: string, size = 10): DroppedFile {
  return { path, file: new File([new Uint8Array(size)], path.split("/").at(-1)!) };
}

function paths(files: DroppedFile[]): string[] {
  return files.map((file) => file.path);
}

describe("groupDesignFiles", () => {
  it("makes a design of each CAD file, with the companions beside it, in path order", () => {
    const { designs, leftOut } = groupDesignFiles([
      dropped("rings/R-2.3dm"),
      dropped("rings/R-10.obj"),
      dropped("rings/R-10.mtl"),
      dropped("pendants/P-1.gltf"),
      dropped("pendants/P-1.bin"),
      dropped("rings/R-1.stl"),
    ]);

    expect(designs.map(({ source, companions }) => [source.path, paths(companions)])).toEqual([
      ["pendants/P-1.gltf", ["pendants/P-1.bin"]],
      ["rings/R-1.stl", []],
      ["rings/R-2.3dm", []],
      ["rings/R-10.obj", ["rings/R-10.mtl"]],
    ]);
    expect(leftOut).toEqual([]);
  });

  it("groups an OBJ's MTL and textures as groupModelFiles does a single upload's, and keeps the textures back", () => {
    const files = [dropped("R-1.obj"), dropped("R-1.mtl"), dropped("metal.png"), dropped("textures/gem.jpg")];
    const single = groupModelFiles(files.map(({ file }) => file));
    const [design] = groupDesignFiles(files).designs;

    expect(single?.primary.name).toBe("R-1.obj");
    expect(paths(design.companions)).toEqual(["R-1.mtl"]);
    expect(paths(design.textures)).toEqual(["metal.png", "textures/gem.jpg"]);
    expect(paths(uploadedFilesOf(design))).toEqual(["R-1.obj", "R-1.mtl"]);
    expect(designBytes(design)).toBe(20);
  });

  it("matches companions by name among several models in a folder, and leaves out those it can't place", () => {
    const { designs, leftOut } = groupDesignFiles([
      dropped("set/A.obj"),
      dropped("set/B.obj"),
      dropped("set/a.MTL"),
      dropped("set/shared.mtl"),
      dropped("set/scene.bin"),
      dropped("other/lonely.mtl"),
    ]);

    expect(designs.map(({ source, companions }) => [source.path, paths(companions)])).toEqual([
      ["set/A.obj", ["set/a.MTL"]],
      ["set/B.obj", []],
    ]);
    expect(leftOut.map(({ file, reason }) => [file.path, reason])).toEqual([
      ["set/shared.mtl", "No one OBJ file beside it to go with"],
      ["set/scene.bin", "No one GLTF file beside it to go with"],
      ["other/lonely.mtl", "No one OBJ file beside it to go with"],
    ]);
  });

  it("takes a glTF's buffer whatever its name when the glTF is alone in its folder", () => {
    const [design] = groupDesignFiles([dropped("P-1/scene.gltf"), dropped("P-1/buffer0.bin")]).designs;

    expect(paths(design.companions)).toEqual(["P-1/buffer0.bin"]);
  });

  it("sets CSV files aside as manifests and leaves out what isn't a CAD file", () => {
    const grouped = groupDesignFiles([dropped("R-1.stl"), dropped("manifest.csv"), dropped("notes.pdf")]);

    expect(paths(grouped.manifests)).toEqual(["manifest.csv"]);
    expect(grouped.leftOut.map(({ file, reason }) => [file.path, reason])).toEqual([["notes.pdf", "Not a CAD file"]]);
  });
});

describe("mergeDrops", () => {
  it("adds a later drop's files, one at a path already dropped (in any case) replacing it", () => {
    const first = [dropped("rings/R-1.stl", 10), dropped("rings/R-2.stl", 10)];
    const merged = mergeDrops(first, [dropped("RINGS/r-1.STL", 99), dropped("rings/R-3.stl")]);

    expect(merged.map(({ path, file }) => [path, file.size])).toEqual([
      ["RINGS/r-1.STL", 99],
      ["rings/R-2.stl", 10],
      ["rings/R-3.stl", 10],
    ]);
  });
});

describe("dropped paths", () => {
  it("writes paths with forward slashes and no leading or empty folders", () => {
    expect(cleanDropPath("\\catalog\\rings\\R-1.3dm")).toBe("catalog/rings/R-1.3dm");
    expect(cleanDropPath("./rings//R-1.3dm")).toBe("rings/R-1.3dm");
    expect(cleanDropPath("/R-1.3dm")).toBe("R-1.3dm");
  });

  it("knows what operating systems leave beside files", () => {
    expect(["__MACOSX/rings/._R-1.3dm", "rings/.DS_Store", "._R-1.3dm", "Thumbs.db", "a/desktop.ini"].every(isSystemFile)).toBe(true);
    expect(isSystemFile("rings/R-1.3dm")).toBe(false);
  });

  it("leaves off the one folder every file of a drop is in", () => {
    const shared = withoutSharedFolder([dropped("catalog/rings/R-1.3dm"), dropped("catalog/P-1.stp")]);
    const unshared = [dropped("rings/R-1.3dm"), dropped("pendants/P-1.stp")];

    expect(paths(shared)).toEqual(["rings/R-1.3dm", "P-1.stp"]);
    expect(withoutSharedFolder(unshared)).toBe(unshared);
    expect(paths(withoutSharedFolder([dropped("R-1.3dm")]))).toEqual(["R-1.3dm"]);
  });

  it("takes a picked folder's files with their folders", () => {
    const file = new File(["x"], "R-1.3dm");
    Object.defineProperty(file, "webkitRelativePath", { value: "catalog/rings/R-1.3dm" });

    expect(paths(filesOfInput([file, new File(["y"], "P-1.stp")]))).toEqual(["catalog/rings/R-1.3dm", "P-1.stp"]);
  });

  it("walks a dropped folder, reading each of its batches of entries", async () => {
    const fileEntry = (fullPath: string) =>
      ({
        isFile: true,
        isDirectory: false,
        name: fullPath.split("/").at(-1),
        fullPath,
        file: (resolve: (file: File) => void) => resolve(new File(["x"], fullPath.split("/").at(-1)!)),
      }) as unknown as FileSystemEntry;
    const folderEntry = (fullPath: string, batches: FileSystemEntry[][]) =>
      ({
        isFile: false,
        isDirectory: true,
        name: fullPath.split("/").at(-1),
        fullPath,
        createReader: () => {
          const left = [...batches, []];
          return { readEntries: (resolve: (entries: FileSystemEntry[]) => void) => resolve(left.shift() ?? []) };
        },
      }) as unknown as FileSystemEntry;
    const rings = folderEntry("/catalog/rings", [[fileEntry("/catalog/rings/R-1.3dm")], [fileEntry("/catalog/rings/R-2.3dm")]]);
    const catalog = folderEntry("/catalog", [[rings, fileEntry("/catalog/manifest.csv")]]);

    expect(paths(await filesOfEntries([catalog, fileEntry("/P-1.stp")]))).toEqual([
      "catalog/rings/R-1.3dm",
      "catalog/rings/R-2.3dm",
      "catalog/manifest.csv",
      "P-1.stp",
    ]);
  });
});
