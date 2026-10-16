import { expect, test } from "bun:test";
import type { TestCase, TestResult } from "@playwright/test/reporter";
import ProgressReporter, { PROGRESS_EVENT_KIND } from "../../runner/progress-reporter";
import { parseProgressEvent } from "../../runner/verify";

const startedAt = new Date("2026-10-16T12:00:00.000Z");
const title = "AT-01 ordinary checkout creates one order and one simulated charge";

test("reports callback-derived running and terminal machine values", () => {
  const lines: string[] = [];
  const reporter = new ProgressReporter({ write: (line) => { lines.push(line); } });
  const testCase = { title } as TestCase;
  reporter.onTestBegin(testCase, { startTime: startedAt } as TestResult);
  reporter.onTestEnd(testCase, {
    startTime: startedAt,
    duration: 321,
    status: "failed",
    error: { message: "machine-error" },
  } as TestResult);

  expect(lines.map((line) => JSON.parse(line))).toEqual([
    { kind: PROGRESS_EVENT_KIND, id: "AT-01", title, status: "running", timestamp: "2026-10-16T12:00:00.000Z" },
    { kind: PROGRESS_EVENT_KIND, id: "AT-01", title, status: "failed", timestamp: "2026-10-16T12:00:00.321Z", durationMs: 321, error: "machine-error" },
  ]);
});

test("parses only bounded protected progress event values", () => {
  const running = JSON.stringify({
    kind: PROGRESS_EVENT_KIND,
    id: "AT-02",
    title: "AT-02 UI repeated submission preserves one checkout side effect",
    status: "running",
    timestamp: "2026-10-16T12:00:00.000Z",
  });
  const terminal = JSON.stringify({
    kind: PROGRESS_EVENT_KIND,
    id: "AT-02",
    title: "AT-02 UI repeated submission preserves one checkout side effect",
    status: "passed",
    timestamp: "2026-10-16T12:00:00.321Z",
    durationMs: 321,
  });

  expect(parseProgressEvent(running)).toMatchObject({ id: "AT-02", status: "running" });
  expect(parseProgressEvent(terminal)).toMatchObject({ id: "AT-02", status: "passed", durationMs: 321 });
  for (const invalid of [
    running.replace("AT-02", "AT-04"),
    running.replace('"running"', '"queued"'),
    terminal.replace('"durationMs":321', '"durationMs":-1'),
    JSON.stringify({ ...JSON.parse(running), title: `AT-02 ${"x".repeat(1_025)}` }),
  ]) expect(parseProgressEvent(invalid)).toBeUndefined();
});
