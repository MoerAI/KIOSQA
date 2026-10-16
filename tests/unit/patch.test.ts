import { describe, expect, test } from "bun:test";
import { hash, validatePatch } from "../../src/patch";

const baseline = "export const checkout = async () => {\n  return 1;\n};\n";
const valid = "--- a/target/checkout.ts\n+++ b/target/checkout.ts\n@@ -1,3 +1,4 @@\n export const checkout = async () => {\n-  return 1;\n+  const orders = 1;\n+  return orders;\n };\n";

describe("application-only unified diffs", () => {
  test("applies exact context and records actual changed paths and hash", () => {
    const result = validatePatch(valid, baseline);
    expect(result.source).toBe("export const checkout = async () => {\n  const orders = 1;\n  return orders;\n};\n");
    expect(result.changedPaths).toEqual(["target/checkout.ts"]);
    expect(result.patchHash).toBe(hash(valid));
  });

  test.each([
    "tests/acceptance/suite.spec.ts",
    "playwright.acceptance.config.ts",
    "target/../runner/observer.ts",
    "/tmp/checkout.ts",
    "target/types.ts",
    "package.json",
    "bun.lock",
  ])("rejects protected or escaped path %s", (path) => {
    expect(() => validatePatch(valid.replaceAll("target/checkout.ts", path), baseline)).toThrow();
  });

  test("rejects a second file, creation, binary data, and mode changes", () => {
    for (const diff of [
      valid + "--- a/tests/foo.ts\n+++ b/tests/foo.ts\n",
      valid.replace("--- a/target/checkout.ts", "--- /dev/null"),
      valid + "\0",
      "diff --git a/target/checkout.ts b/target/checkout.ts\nold mode 100644\nnew mode 120000\n" + valid,
    ]) expect(() => validatePatch(diff, baseline)).toThrow();
  });

  test("rejects mismatched context, invalid hunk counts, and empty changes", () => {
    expect(() => validatePatch(valid, baseline.replace("return 1", "return 2"))).toThrow();
    expect(() => validatePatch(valid.replace("+1,4", "+1,99"), baseline)).toThrow();
    expect(() => validatePatch("--- a/target/checkout.ts\n+++ b/target/checkout.ts\n", baseline)).toThrow();
  });
});
