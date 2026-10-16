import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type {
  ChargeRecord,
  ChargeRequest,
  CheckoutDependencies,
  CheckoutInput,
  CheckoutResult,
  CreateOrderRequest,
  OrderRecord,
} from "../target/types.ts";

interface ServerConfig {
  workspace: string;
  orderLogPath: string;
  paymentLogPath: string;
  delayMs: number;
  barrierExpectedRequests: number;
}

interface CheckoutModule {
  checkout(input: CheckoutInput, deps: CheckoutDependencies): Promise<CheckoutResult>;
}

const config = readConfig(process.argv.slice(2));
const targetPath = resolve(config.workspace, "target", "checkout.ts");
const target = (await import(`${pathToFileURL(targetPath).href}?run=${Date.now()}`)) as CheckoutModule;
let requestCount = 0;
let orderSequence = 0;
let chargeSequence = 0;
let barrierReleased = false;
const barrierWaiters: Array<() => void> = [];

await Promise.all([
  mkdir(dirname(config.orderLogPath), { recursive: true }),
  mkdir(dirname(config.paymentLogPath), { recursive: true }),
]);
await Promise.all([writeFile(config.orderLogPath, ""), writeFile(config.paymentLogPath, "")]);

const dependencies: CheckoutDependencies = {
  async charge(request: ChargeRequest): Promise<ChargeRecord> {
    await waitForBarrier();
    await delay(config.delayMs);
    const record: ChargeRecord = { id: `charge-${++chargeSequence}`, ...request };
    await appendRecord(config.paymentLogPath, record);
    emit("payment_recorded", { chargeId: record.id, purchaseIntentId: record.purchaseIntentId });
    return record;
  },
  async createOrder(request: CreateOrderRequest): Promise<OrderRecord> {
    const record: OrderRecord = { id: `order-${++orderSequence}`, ...request };
    await appendRecord(config.orderLogPath, record);
    emit("order_recorded", { orderId: record.id, purchaseIntentId: record.purchaseIntentId });
    return record;
  },
};

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1");
  if (request.method === "GET" && url.pathname === "/") {
    sendHtml(response, pageHtml(url.searchParams.get("purchaseIntentId") ?? "intent-ui"));
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/checkout") {
    await handleCheckout(request, response);
    return;
  }
  response.writeHead(404, { "content-type": "application/json" }).end(JSON.stringify({ error: "not found" }));
});

server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("target server did not bind a TCP port");
  emit("ready", { port: address.port });
});

process.on("SIGTERM", close);
process.on("SIGINT", close);

async function handleCheckout(request: IncomingMessage, response: ServerResponse): Promise<void> {
  try {
    const input = await readJson<CheckoutInput>(request);
    requestCount += 1;
    emit("request_arrived", {
      requestCount,
      purchaseIntentId: input.purchaseIntentId,
      idempotencyKey: input.idempotencyKey,
    });
    if (requestCount === config.barrierExpectedRequests) releaseBarrier();
    const result = await target.checkout(input, dependencies);
    sendJson(response, 200, result);
    emit("response_sent", { status: 200, orderId: result.orderId, purchaseIntentId: input.purchaseIntentId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendJson(response, 500, { error: message });
    emit("response_sent", { status: 500, error: message });
  }
}

function releaseBarrier(): void {
  if (barrierReleased) return;
  barrierReleased = true;
  emit("barrier_released", { requestCount, expectedRequestCount: config.barrierExpectedRequests });
  for (const resolveWaiter of barrierWaiters.splice(0)) resolveWaiter();
}

function waitForBarrier(): Promise<void> {
  if (barrierReleased) return Promise.resolve();
  return new Promise((resolveWaiter) => barrierWaiters.push(resolveWaiter));
}

function emit(type: string, data: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify({ kind: "kioskproof-event", type, timestamp: new Date().toISOString(), ...data })}\n`);
}

function readConfig(args: string[]): ServerConfig {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!key?.startsWith("--") || value === undefined) throw new Error("invalid target server arguments");
    values.set(key.slice(2), value);
  }
  const workspace = required(values, "workspace");
  const orderLogPath = required(values, "order-log");
  const paymentLogPath = required(values, "payment-log");
  const delayMs = Number(required(values, "delay-ms"));
  const barrierExpectedRequests = Number(required(values, "barrier-expected-requests"));
  if (!Number.isInteger(delayMs) || delayMs < 0) throw new Error("invalid provider delay");
  if (!Number.isInteger(barrierExpectedRequests) || barrierExpectedRequests < 1) {
    throw new Error("invalid barrier request count");
  }
  return { workspace, orderLogPath, paymentLogPath, delayMs, barrierExpectedRequests };
}

function required(values: Map<string, string>, key: string): string {
  const value = values.get(key);
  if (!value) throw new Error(`missing --${key}`);
  return value;
}

async function readJson<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}

async function appendRecord(path: string, record: object): Promise<void> {
  await appendFile(path, `${JSON.stringify(record)}\n`, "utf8");
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

function sendHtml(response: ServerResponse, body: string): void {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
  response.end(body);
}

function pageHtml(purchaseIntentId: string): string {
  const escapedIntent = escapeHtml(purchaseIntentId);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Synthetic checkout</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f0f3f8;color:#1b2a40;font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}main{width:min(660px,calc(100% - 48px));margin:35px auto}.brand{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;font-size:12px;font-weight:750;letter-spacing:1.4px}.brand small{font-size:9px;font-weight:500;letter-spacing:1px;color:#8394ad}.card{background:#fff;border:1px solid #dfe6f0;border-radius:18px;padding:32px;box-shadow:0 8px 30px #243f6b08}.eyebrow{font-size:9px;letter-spacing:1.8px;color:#7f95b4}h1{font-size:30px;letter-spacing:-1px;line-height:1.25;margin:9px 0 8px}.subtitle{color:#7a8ca5;font-size:12px;margin:0 0 24px}.product{display:flex;align-items:center;gap:16px;background:#f7f9fc;border:1px solid #e8edf5;border-radius:10px;padding:18px}.product-icon{height:53px;width:43px;background:#e5edfb;border:1px solid #c8d9f6;border-radius:5px;display:grid;place-items:center;color:#5985ce;font-weight:700}.product strong{font-size:13px;display:block}.product small{font-size:10px;color:#8899b1}.total{display:flex;align-items:center;justify-content:space-between;padding:20px 0;border-bottom:1px solid #e9edf4;margin-bottom:20px;color:#6b7f9c;font-size:12px}.total strong{font-size:26px;letter-spacing:-1px;color:#203858}.fields{display:grid;grid-template-columns:1fr 1fr;gap:12px}label{font-size:9px;letter-spacing:.5px;color:#8294ae}input{display:block;width:100%;border:1px solid #dce4f0;border-radius:5px;padding:9px 10px;font:10px "SFMono-Regular",monospace;margin:5px 0 17px;color:#6582ad;background:#fcfdff}button{width:100%;background:#1d64e9;color:white;border:0;border-radius:7px;padding:14px;font-size:12px;font-weight:650;cursor:pointer}output{display:block;color:#436f9f;font-size:12px;margin-top:16px;min-height:20px}.responses{font:10px/1.8 "SFMono-Regular",monospace;color:#7e91ae;padding-left:18px;margin:8px 0 0}.disclosure{text-align:center;font-size:9px;color:#8a9bb3;margin-top:16px;letter-spacing:.2px}
</style></head>
<body><main><div class="brand">PAPER + PIXEL <small>SELF-SERVICE PRINT KIOSK</small></div><div class="card">
<span class="eyebrow">YOUR ORDER / SYNTHETIC DEMO</span><h1>Ready when you are.</h1><p class="subtitle">Review your print bundle and complete checkout.</p>
<div class="product"><div class="product-icon">A4</div><div><strong>Print &amp; bind bundle</strong><small>20 monochrome pages + soft binding</small></div></div>
<div class="total"><span>Total / USD</span><strong>14.50</strong></div><div class="fields">
<label>Purchase intent <input data-testid="purchase-intent" value="${escapedIntent}"></label>
<label>Idempotency key <input data-testid="idempotency-key" value="${escapedIntent}"></label></div>
<button data-testid="checkout-submit" type="button">Place order / USD 14.50</button>
<output data-testid="confirmation" aria-live="polite"></output><ol class="responses" data-testid="responses"></ol></div>
<p class="disclosure">KioskProof controlled fixture / Simulated payments only / No real money moves</p></main>
<script>
const button = document.querySelector('[data-testid="checkout-submit"]');
const confirmation = document.querySelector('[data-testid="confirmation"]');
button.addEventListener('click', async () => {
  const input = {
    purchaseIntentId: document.querySelector('[data-testid="purchase-intent"]').value,
    idempotencyKey: document.querySelector('[data-testid="idempotency-key"]').value
  };
  try {
    const response = await fetch('/api/checkout', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'checkout failed');
    confirmation.dataset.orderId = result.orderId;
    confirmation.dataset.totalMinor = String(result.totalMinor);
    confirmation.dataset.currency = result.currency;
    confirmation.textContent = 'Order ' + result.orderId + ' confirmed for USD 14.50';
    const receipt = document.createElement('li');
    receipt.textContent = 'Checkout response: ' + result.orderId + ' / ' + result.chargeId;
    document.querySelector('[data-testid="responses"]').append(receipt);
    document.dispatchEvent(new CustomEvent('kioskproof:checkout-complete', { detail: { ok: true, orderId: result.orderId } }));
  } catch (error) {
    confirmation.textContent = 'Checkout failed';
    document.dispatchEvent(new CustomEvent('kioskproof:checkout-complete', { detail: { ok: false, error: String(error) } }));
  }
});
</script></body></html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character] ?? character);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

function close(): void {
  server.close(() => process.exit(0));
}
