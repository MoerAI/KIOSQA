import { createHash } from "node:crypto";

const APPLICATION_PATH = "target/checkout.ts";

export function hash(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function validatePatch(
  diff: string,
  baselineSource: string,
): { source: string; changedPaths: string[]; patchHash: string } {
  if (typeof diff !== "string" || Buffer.byteLength(diff) > 32_768 || /[\0\r]/.test(diff)) {
    throw new Error("Patch must be a bounded UTF-8 unified diff.");
  }
  const lines = diff.split("\n");
  if (lines.at(-1) === "") lines.pop();
  let position = 0;
  if (lines[position]?.startsWith("diff --git ")) {
    if (lines[position++] !== `diff --git a/${APPLICATION_PATH} b/${APPLICATION_PATH}`) {
      throw new Error("Only target/checkout.ts may be changed.");
    }
    if (/^index [a-f0-9]+\.\.[a-f0-9]+(?: 100644)?$/.test(lines[position] ?? "")) position++;
  }
  if (
    lines[position++] !== `--- a/${APPLICATION_PATH}` ||
    lines[position++] !== `+++ b/${APPLICATION_PATH}`
  ) {
    throw new Error("Only an existing, allowlisted application file may be changed.");
  }
  if (!baselineSource.endsWith("\n")) throw new Error("Baseline source must end with a newline.");
  const original = baselineSource.slice(0, -1).split("\n");
  const output: string[] = [];
  let cursor = 0;
  let changes = 0;
  let hunks = 0;
  while (position < lines.length) {
    const header = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?: .*)?$/.exec(lines[position++]);
    if (!header) throw new Error("Invalid hunk header or forbidden patch metadata.");
    const oldCount = Number(header[2] ?? 1);
    const newCount = Number(header[4] ?? 1);
    const start = Number(header[1]) - (Number(header[1]) === 0 ? 0 : 1);
    if (start < cursor || start > original.length) throw new Error("Overlapping or out-of-range hunk.");
    output.push(...original.slice(cursor, start));
    cursor = start;
    if (Number(header[3]) !== (newCount === 0 && output.length === 0 ? 0 : output.length + 1)) {
      throw new Error("Incorrect candidate hunk position.");
    }
    let consumed = 0;
    let produced = 0;
    while (position < lines.length && !lines[position].startsWith("@@ ")) {
      const line = lines[position++];
      const operation = line[0];
      const text = line.slice(1);
      if (operation !== " " && operation !== "+" && operation !== "-") {
        throw new Error("Unexpected content in unified diff.");
      }
      if (operation !== "+") {
        if (original[cursor] !== text) throw new Error("Patch context does not match the recorded baseline.");
        cursor++;
        consumed++;
      }
      if (operation !== "-") {
        output.push(text);
        produced++;
      }
      if (operation !== " ") changes++;
    }
    if (consumed !== oldCount || produced !== newCount) throw new Error("Hunk line counts do not match.");
    hunks++;
  }
  output.push(...original.slice(cursor));
  const source = output.join("\n") + "\n";
  if (!hunks || !changes || source === baselineSource || Buffer.byteLength(source) > 24_576) {
    throw new Error("Patch must make a bounded application-source change.");
  }
  return { source, changedPaths: [APPLICATION_PATH], patchHash: hash(diff) };
}
