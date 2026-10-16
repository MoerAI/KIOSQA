import { access, lstat, realpath } from "node:fs/promises";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { ControlPlane } from "./control";
import { containedPath } from "./artifacts";
import { InputError } from "./input";
import { probeAgentRuntime } from "./model";
import { renderPage, renderRun } from "./ui";
import type { Run } from "./types";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

export async function startServer(options: { port?: number; dataRoot?: string } = {}) {
  const control = new ControlPlane(ROOT, options.dataRoot);
  await control.initialize();
  const python = process.env.ANTIGRAVITY_PYTHON ?? join(ROOT, ".venv/bin/python");
  let pythonAvailable = true;
  try { await access(python); } catch { pythonAvailable = false; }
  const agent = pythonAvailable ? await probeAgentRuntime().catch(() => undefined) : undefined;
  const config = {
    modelId: process.env.GEMINI_MODEL ?? "gemini-4-argon",
    cloudProject: process.env.GOOGLE_CLOUD_PROJECT ?? "",
    cloudRegion: process.env.GOOGLE_CLOUD_REGION ?? "asia-northeast3",
    storageMode: control.cloud.bucket ? "gcs" : "local",
    agentAvailable: Boolean(process.env.GEMINI_API_KEY && agent?.apiKeyAvailable),
    deployed: Boolean(process.env.K_SERVICE),
  };
  const json = (value: unknown, status = 200) =>
    Response.json(value, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  const result = (run: Run) => json({ run, html: renderRun(run) });
  const server = Bun.serve({
    hostname: "0.0.0.0",
    port: options.port ?? Number(process.env.PORT ?? 8080),
    maxRequestBodySize: 16_384,
    idleTimeout: 30,
    async fetch(request) {
      try {
        const url = new URL(request.url);
        if (request.method === "GET" && url.pathname === "/health") {
          return json({ status: "ready", product: "KioskProof", runtime: "google-antigravity", modelId: config.modelId, sdkVersion: agent?.sdkVersion, toolsDenied: agent?.toolsDenied, agentConfigured: config.agentAvailable });
        }
        if (request.method === "GET" && url.pathname === "/") {
          const id = url.searchParams.get("run");
          const run = id ? control.get(id) : control.list()[0];
          return new Response(renderPage(run, control.list(), config), {
            headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'" },
          });
        }
        if (request.method === "GET" && ["/style.css", "/client.js"].includes(url.pathname)) {
          return new Response(Bun.file(join(ROOT, "public", url.pathname.slice(1))), {
            headers: { "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff" },
          });
        }
        const artifact = /^\/artifacts\/([a-f0-9-]{36})\/(.+)$/.exec(url.pathname);
        if (request.method === "GET" && artifact) {
          const run = control.get(artifact[1]);
          const directory = control.directory(run);
          const path = containedPath(directory, decodeURIComponent(artifact[2]));
          const canonical = await realpath(path);
          const canonicalRoot = await realpath(directory);
          if (!canonical.startsWith(canonicalRoot + sep) || !(await lstat(path)).isFile()) throw new InputError("Artifact not found.", 404);
          const file = Bun.file(path);
          if (!await file.exists()) throw new InputError("Artifact not found.", 404);
          return new Response(file, { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
        }
        if (request.method === "GET" && url.pathname === "/api/runs") return json({ runs: control.list() });
        const runRoute = /^\/api\/runs\/([a-f0-9-]{36})(?:\/(approve-contract|repair|approve-patch))?$/.exec(url.pathname);
        const eventRoute = /^\/api\/runs\/([a-f0-9-]{36})\/events$/.exec(url.pathname);
        if (request.method === "GET" && eventRoute) {
          const run = control.get(eventRoute[1]);
          let unsubscribe: (() => void) | undefined;
          let heartbeat: ReturnType<typeof setInterval> | undefined;
          const cleanup = () => { unsubscribe?.(); clearInterval(heartbeat); };
          const stream = new ReadableStream<Uint8Array>({
            start(streamController) {
              const encoder = new TextEncoder();
              const send = (updated: Run) => streamController.enqueue(encoder.encode(`event: run\ndata: ${JSON.stringify(updated)}\n\n`));
              unsubscribe = control.subscribe(run.id, send);
              send(run);
              heartbeat = setInterval(() => streamController.enqueue(encoder.encode(": keep-alive\n\n")), 15000);
              request.signal.addEventListener("abort", () => { cleanup(); try { streamController.close(); } catch { /* Already closed. */ } }, { once: true });
            },
            cancel: cleanup,
          });
          return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
        }
        if (request.method === "GET" && runRoute && !runRoute[2]) return result(control.get(runRoute[1]));
        if (request.method === "POST" && (url.pathname === "/api/runs" || runRoute?.[2])) {
          const origin = request.headers.get("origin");
          if (origin && new URL(origin).host !== request.headers.get("host")) throw new InputError("Cross-origin actions are not allowed.", 403);
          if (!request.headers.get("content-type")?.startsWith("application/json")) throw new InputError("Content-Type must be application/json.", 415);
          let body: Record<string, unknown>;
          try {
            body = await request.json();
          } catch {
            throw new InputError("Request body must be valid JSON.");
          }
          if (!body || typeof body !== "object" || Array.isArray(body)) throw new InputError("Expected a JSON object.");
          if (url.pathname === "/api/runs") {
            if (!config.agentAvailable) throw new InputError("Configure the event Gemini key and Antigravity Python runtime first.", 503);
            return result(await control.create(body));
          }
          const actor = body.reviewer === "qa_driver" ? "qa_driver" : "operator";
          if (runRoute![2] === "approve-contract") return result(control.approveContract(runRoute![1], String(body.decision), String(body.contractHash), actor));
          if (runRoute![2] === "approve-patch") return result(control.approvePatch(runRoute![1], String(body.decision), String(body.patchHash), actor));
          if (Object.keys(body).length) throw new InputError("Repair does not accept commands or additional input.");
          return result(control.requestRepair(runRoute![1]));
        }
        return json({ error: "Not found." }, 404);
      } catch (error) {
        if (error instanceof InputError) return json({ error: error.message }, error.status);
        if (error instanceof URIError || (error instanceof Error && /outside the artifact|Invalid artifact/.test(error.message))) return json({ error: "Invalid artifact path." }, 400);
        if (error instanceof Error && "code" in error && error.code === "ENOENT") return json({ error: "Artifact not found." }, 404);
        console.error(error instanceof Error ? error.name : "Request error");
        return json({ error: "The operation failed. Inspect the run evidence for execution details." }, 500);
      }
    },
  });
  console.info(`KIOSKPROOF_READY ${server.url}`);
  return { server, control };
}

if (import.meta.main) await startServer();
