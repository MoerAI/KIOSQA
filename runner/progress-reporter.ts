import type { Reporter, TestCase, TestResult } from "@playwright/test/reporter";
import { TEST_IDS, type TestProgress } from "../src/types.ts";

export const PROGRESS_EVENT_KIND = "kioskproof-test-progress";

export interface TestProgressEvent extends TestProgress {
  kind: typeof PROGRESS_EVENT_KIND;
}

interface ProgressReporterOptions {
  write?: (line: string) => void;
}

const expectedIds = new Set<string>(TEST_IDS);

export default class ProgressReporter implements Reporter {
  private readonly write: (line: string) => void;

  constructor(options: ProgressReporterOptions = {}) {
    this.write = options.write ?? ((line) => { process.stdout.write(line); });
  }

  onTestBegin(test: TestCase, result: TestResult): void {
    const progress = testProgress(test);
    if (!progress) return;
    this.emit({
      ...progress,
      status: "running",
      timestamp: result.startTime.toISOString(),
    });
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const progress = testProgress(test);
    if (!progress) return;
    this.emit({
      ...progress,
      status: result.status,
      timestamp: new Date(result.startTime.getTime() + result.duration).toISOString(),
      durationMs: result.duration,
      error: result.error?.message,
    });
  }

  private emit(progress: TestProgress): void {
    const event: TestProgressEvent = { kind: PROGRESS_EVENT_KIND, ...progress };
    this.write(`${JSON.stringify(event)}\n`);
  }
}

function testProgress(test: TestCase): Pick<TestProgress, "id" | "title"> | undefined {
  const id = /^AT-\d{2}\b/.exec(test.title)?.[0];
  return id && expectedIds.has(id) ? { id, title: test.title } : undefined;
}
