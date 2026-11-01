import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8"));
}

describe("plugin manifest", () => {
  const manifest = readJson("manifest.json");
  const versions = readJson("versions.json");
  const pkg = readJson("package.json");

  it("uses the agreed plugin id, which must not be bare 'graphite'", () => {
    expect(manifest.id).toBe("graphite-vault-chat");
  });

  it("requires Obsidian 1.11.4, the first version with SecretStorage", () => {
    expect(manifest.minAppVersion).toBe("1.11.4");
  });

  it("is desktop only for v0.1", () => {
    expect(manifest.isDesktopOnly).toBe(true);
  });

  it("keeps the version in step across manifest, package and versions files", () => {
    expect(manifest.version).toBe(pkg.version);
    expect(versions[manifest.version as string]).toBe(manifest.minAppVersion);
  });
});
