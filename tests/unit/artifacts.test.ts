import { expect, test } from "bun:test";
import { mkdtemp, mkdir, symlink, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { containedPath, listFiles, protectedSnapshot, readableArtifact } from "../../src/artifacts";

test("artifact paths stay inside their run directory", () => {
  expect(containedPath("/tmp/run", "before/report.html")).toBe("/tmp/run/before/report.html");
  for (const path of ["../secret", "/etc/passwd", "before\\secret", "\0", "."]) {
    expect(() => containedPath("/tmp/run", path)).toThrow();
  }
});

test("the frozen manifest protects the agent and runtime while excluding only the repair target", async () => {
  const root = await mkdtemp(join(tmpdir(), "kioskproof-freeze-"));
  try {
    for (const directory of ["src", "runner", "tests/acceptance", "target", "agents"]) await mkdir(join(root, directory), { recursive: true });
    for (const name of ["package.json", "bun.lock", "tsconfig.json", "playwright.acceptance.config.ts", "requirements-agent.txt", "Dockerfile", "agents/bridge.py", "target/checkout.ts", "target/types.ts"]) {
      await writeFile(join(root, name), "baseline\n");
    }
    const before = await protectedSnapshot(root);
    expect(before.files["agents/bridge.py"]).toBeDefined();
    expect(before.files["requirements-agent.txt"]).toBeDefined();
    expect(before.files["Dockerfile"]).toBeDefined();
    expect(before.files["target/checkout.ts"]).toBeUndefined();
    await writeFile(join(root, "target/checkout.ts"), "candidate\n");
    expect((await protectedSnapshot(root)).hash).toBe(before.hash);
    await writeFile(join(root, "agents/bridge.py"), "changed agent\n");
    expect((await protectedSnapshot(root)).hash).not.toBe(before.hash);
  } finally {
    await rm(root, { recursive: true, force: true });
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
