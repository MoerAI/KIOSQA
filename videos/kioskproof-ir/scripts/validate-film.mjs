import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const probe = promisify(execFile);
const read = (relativePath) => readFile(path.join(root, relativePath));
const check = (condition, message) => {
  if (!condition) throw new Error(`Film integrity: ${message}`);
};
const attr = (tag, name) => tag.match(new RegExp(`\\b${name}="([^"]+)"`))?.[1];

const manifest = JSON.parse(await read("assets/manifest.json"));
const config = JSON.parse(await read("hyperframes.json"));
const html = (await read("index.html")).toString();
const duration = Number(attr(html.match(/<div id="root"[^>]*>/s)?.[0] ?? "", "data-duration"));
const sceneDurations = [8, 10, 11, 12, 11, 8];
const sceneHosts = [...html.matchAll(/<div id="scene-\d{2}"[^>]*>/gs)].map(([tag]) => tag);
check(sceneHosts.length === 6, "six intro scene hosts required");
check(config.timelinePlan?.intro?.durationSeconds === 60, "intro plan must last 60 seconds");

let start = 0;
for (let index = 0; index < sceneHosts.length; index += 1) {
  const host = sceneHosts[index];
  const id = `frame-${String(index + 1).padStart(2, "0")}`;
  const source = attr(host, "data-composition-src");
  check(attr(host, "data-composition-id") === id, `${id} host ID mismatch`);
  check(Number(attr(host, "data-start")) === start, `${id} starts at the wrong time`);
  check(Number(attr(host, "data-duration")) === sceneDurations[index], `${id} duration mismatch`);
  const frame = (await read(source)).toString();
  check(frame.includes(`data-composition-id="${id}"`), `${id} composition mismatch`);
  check(frame.includes(`data-duration="${sceneDurations[index]}"`), `${id} source duration mismatch`);
  const visibleMarkup = frame.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>|<!--[\s\S]*?-->/g, "");
  check(!/[가-힣]/.test(visibleMarkup), `${id} still contains non-English frame copy`);
  start += sceneDurations[index];
}
check(start === 60, "intro is not exactly 60 seconds");

const video = html.match(/<video\b[^>]*>/s)?.[0] ?? "";
const recording = manifest.finalRecording;
check(attr(video, "id") === "real-browser-demo", "demo media ID missing");
check(/\bmuted\b/.test(video), "the silent source must not request a nonexistent audio track");
check(attr(video, "src") === recording.path, "demo source does not match the final recording");
check(Number(attr(video, "data-start")) === start, "demo does not start at 60 seconds");
check(Number(attr(video, "data-duration")) === recording.durationSeconds, "demo clip duration mismatch");
check(duration === start + recording.durationSeconds, "root duration does not equal both complete parts");
check(manifest.finalRunId, "final Cloud run ID missing");
check(manifest.finalUiCommit, "final deployed commit missing");

for (const asset of [recording, ...manifest.finalPlates]) {
  const digest = createHash("sha256").update(await read(asset.path)).digest("hex");
  check(digest === asset.sha256, `SHA-256 mismatch: ${asset.path}`);
}
await read("assets/gsap.min.js");
await read("assets/NanumSquareRoundB.woff2");

const { stdout } = await probe(
  "ffprobe",
  ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", path.join(root, recording.path)],
  { timeout: 10_000 }
);
check(Math.abs(Number(stdout.trim()) - recording.durationSeconds) < 1 / 30, "full source video duration differs from the mounted clip");
console.log(`Film integrity passed: ${start}s English intro + ${recording.durationSeconds}s genuine GCP browser demo = ${duration}s`);
