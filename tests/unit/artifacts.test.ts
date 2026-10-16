import { expect, test } from "bun:test";
import { mkdtemp, mkdir, symlink, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { containedPath, listFiles, readableArtifact } from "../../src/artifacts";

test("artifact paths stay inside their run directory", () => {
  expect(containedPath("/tmp/run", "before/report.html")).toBe("/tmp/run/before/report.html");
  for (const path of ["../secret", "/etc/passwd", "before\\secret", "\0", "."]) {
    expect(() => containedPath("/tmp/run", path)).toThrow();
  }
});

test("evidence must be nonempty and readable without symbolic-link escapes", async () => {
  const root = await mkdtemp(join(tmpdir(), "kioskproof-evidence-"));
  try {
    const run = join(root, "run");
    await mkdir(run);
    await writeFile(join(run, "result.json"), "{}");
    await writeFile(join(run, "empty.json"), "");
    await writeFile(join(root, "external.json"), "{}");
    await symlink(root, join(run, "escaped"));
    expect(await readableArtifact(run, "result.json")).toBe(true);
    expect(await readableArtifact(run, "empty.json")).toBe(false);
    expect(await readableArtifact(run, "missing.json")).toBe(false);
    expect(await readableArtifact(run, "escaped/external.json")).toBe(false);
    await expect(listFiles(run)).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
