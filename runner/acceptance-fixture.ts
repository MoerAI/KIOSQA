import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { TestInfo } from "@playwright/test";
import type { Scenario, StateObservation } from "../src/types.ts";

export interface TrustedRequestEvent extends Record<string, unknown> {
  kind: "kioskproof-event";
  type: string;
  timestamp: string;
}

export interface CheckoutHarness {
  baseUrl: string;
  waitForEvent(type: string): Promise<TrustedRequestEvent>;
  waitForEvents(type: string, count: number): Promise<TrustedRequestEvent[]>;
  completeWithinBarrierDeadline(completion: Promise<unknown>, barrier: Promise<TrustedRequestEvent>): Promise<void>;
  readOrderObservation(): Promise<StateObservation>;
  readPaymentObservation(): Promise<StateObservation>;
  requestEvents(): TrustedRequestEvent[];
  stop(): Promise<void>;
}

export interface CheckoutHarnessOptions {
  workspace: string;
  scenario: Scenario;
  expectedRequests: number;
  outputPath: string;
}

type EventListener = (event: TrustedRequestEvent) => void;

export async function startCheckoutHarness(options: CheckoutHarnessOptions): Promise<CheckoutHarness> {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const stateDirectory = join(options.outputPath, "trusted-state");
  const orderLogPath = join(stateDirectory, "orders.ndjson");
  const paymentLogPath = join(stateDirectory, "provider-ledger.ndjson");
  await mkdir(stateDirectory, { recursive: true });

  const listeners = new Map<string, Set<EventListener>>();
  const events: TrustedRequestEvent[] = [];
  let stderr = "";
  let stopped = false;

  const subscribe = (type: string, listener: EventListener): (() => void) => {
    const typedListeners = listeners.get(type) ?? new Set<EventListener>();
    typedListeners.add(listener);
    listeners.set(type, typedListeners);
    return () => typedListeners.delete(listener);
  };
  const waitForEvent = (type: string): Promise<TrustedRequestEvent> => new Promise((resolveEvent) => {
    const unsubscribe = subscribe(type, (event) => {
      unsubscribe();
      resolveEvent(event);
    });
  });
  const deliver = (event: TrustedRequestEvent): void => {
    events.push(event);
    for (const listener of [...(listeners.get(event.type) ?? [])]) listener(event);
  };
  const ready = waitForEvent("ready");

  const runtime = process.env.KIOSKPROOF_BUN_EXECUTABLE_PATH ?? process.execPath;
  const serverPath = join(root, "runner", "target-server.ts");
  const child = spawn(runtime, [serverPath,
    "--workspace", resolve(options.workspace),
    "--order-log", orderLogPath,
    "--payment-log", paymentLogPath,
    "--delay-ms", String(options.scenario.delayMs),
    "--barrier-expected-requests", String(options.expectedRequests),
  ], {
    cwd: root,
    env: targetEnvironment(),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdoutBuffer = "";
  child.stdout.on("data", (chunk: Buffer) => {
    stdoutBuffer += chunk.toString("utf8");
    const lines = stdoutBuffer.split("\n");
    stdoutBuffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line) continue;
      try {
        const event = JSON.parse(line) as TrustedRequestEvent;
        if (event.kind === "kioskproof-event" && typeof event.type === "string") deliver(event);
      } catch {
        stderr += `unexpected target stdout: ${line}\n`;
      }
    }
  });
  child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString("utf8"); });
  const exited = once(child, "exit").then(([code, signal]) => {
    throw new Error(`target server exited before completion (code ${String(code)}, signal ${String(signal)}): ${stderr}`);
  });

  const readyEvent = await within(Promise.race([ready, exited]), 10_000, "target server readiness").catch(async (error) => {
    await stopChild(child);
    throw error;
  });
  const port = Number(readyEvent.port);
  if (!Number.isInteger(port) || port < 1) {
    await stopChild(child);
    throw new Error("target server emitted an invalid port");
  }
  void exited.catch(() => undefined);

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    waitForEvent,
    waitForEvents(type: string, count: number): Promise<TrustedRequestEvent[]> {
      if (!Number.isInteger(count) || count < 1) throw new Error("event count must be positive");
      const received = events.filter((event) => event.type === type).slice(0, count);
      if (received.length === count) return Promise.resolve(received);
      return new Promise((resolveEvents) => {
        const unsubscribe = subscribe(type, (event) => {
          received.push(event);
          if (received.length === count) {
            unsubscribe();
            resolveEvents(received);
          }
        });
      });
    },
    async completeWithinBarrierDeadline(completion, barrier): Promise<void> {
      await barrier.then(() => within(Promise.resolve(completion), 5_000, "checkout completion after provider barrier release"));
    },
    async readOrderObservation(): Promise<StateObservation> {
      return { source: "trusted runner direct order NDJSON observer", records: await readNdjson(orderLogPath) };
    },
    async readPaymentObservation(): Promise<StateObservation> {
      return { source: "trusted runner direct mock-provider ledger observer", records: await readNdjson(paymentLogPath) };
    },
    requestEvents: () => [...events],
    async stop(): Promise<void> {
      if (stopped) return;
      stopped = true;
      await stopChild(child);
    },
  };
}

export async function attachTrustedEvidence(testInfo: TestInfo, harness: CheckoutHarness): Promise<void> {
  const [orders, payments] = await Promise.all([harness.readOrderObservation(), harness.readPaymentObservation()]);
  const evidence = [
    ["order-observation", orders],
    ["payment-observation", payments],
    ["request-events", harness.requestEvents()],
  ] as const;
  await Promise.all(evidence.map(async ([name, value]) => {
    const path = testInfo.outputPath(`${name}.json`);
    await writeFile(path, JSON.stringify(value, null, 2));
    await testInfo.attach(name, { path, contentType: "application/json" });
  }));
}

export async function readNdjson(path: string): Promise<Record<string, unknown>[]> {
  try {
    const content = await readFile(path, "utf8");
    return content.split("\n").filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

function targetEnvironment(): Record<string, string> {
  const inherited = process.env;
  return {
    PATH: inherited.PATH ?? "",
    TMPDIR: inherited.TMPDIR ?? "/tmp",
    LANG: inherited.LANG ?? "en_US.UTF-8",
    NODE_ENV: "test",
  };
}

async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  try {
    await within(exited.then(() => undefined), 2_000, "target server shutdown");
  } catch {
    child.kill("SIGKILL");
    await once(child, "exit");
  }
}

function within<T>(promise: Promise<T>, milliseconds: number, label: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(`${label} exceeded ${milliseconds}ms`)), milliseconds);
  });
  return Promise.race([promise, expiry]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}
