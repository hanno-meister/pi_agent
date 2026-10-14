import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

test("the extension loader resolves its colocated extension after relocation", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "voice loader portability-"));

  try {
    const loaderSource = await readFile(
      new URL("../extension-loader.js", import.meta.url),
      "utf8",
    );
    const loaderPath = join(fixture, "extension-loader.js");
    await writeFile(join(fixture, "package.json"), '{"type":"module"}\n');
    await writeFile(loaderPath, loaderSource);
    await writeFile(
      join(fixture, "extension.js"),
      [
        "export function createVoiceExtension() {",
        "  return (pi) => { pi.loadedFromSiblingFixture = true; };",
        "}",
        "",
      ].join("\n"),
    );

    const { default: loader } = await import(pathToFileURL(loaderPath).href);
    const pi = {
      on() {},
      registerCommand() {},
      registerShortcut() {},
    };

    loader(pi);
    assert.equal(pi.loadedFromSiblingFixture, true);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
