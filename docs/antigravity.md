# Google Antigravity adapter

KioskProof calls the official `google-antigravity` Python SDK through the trusted
`agents/antigravity_bridge.py` process. The adapter pins
`google-antigravity==0.1.22` and `pydantic==2.12.5` in `requirements-agent.txt`.
Install it with the existing setup command:

```sh
bun run agent:setup
```

That creates `.venv` with Python 3.12. Production may set
`ANTIGRAVITY_PYTHON` to a different trusted Python executable. The TypeScript
service invokes the bridge with bounded JSON on stdin; it never passes an API
key in that JSON. `GEMINI_API_KEY` remains only in the trusted service
environment and is inherited by the SDK bridge, never by the repair target.

## Runtime behavior

Both `interpretPolicy()` and `proposePatch()` select exactly
`gemini-4-argon`. There is no alternate model or REST-provider fallback. Every
agent is created with `policies=[policy.deny("*")]`; no shell, file, browser,
or custom tools are granted to the model.

The bridge requests a Pydantic `response_schema` from the SDK and validates the
returned payload with the same strict Pydantic model before it crosses the
Python boundary. The event Argon runtime used during implementation returned
schema-shaped JSON text while leaving the SDK `structured_output()` accessor
empty, so the bridge explicitly parses only a complete JSON value (optionally a
single `json` fence) and Pydantic-validates it. It does not substitute a
hardcoded contract or patch, nor select another model.

The repair action uses `Image.from_file()` for each runner-supplied screenshot.
It accepts at most four absolute, non-symlink PNG/JPEG/WebP files, each at most
5 MiB. Policy, source, supporting source, evidence, IDs, attempt number, and
screenshot paths are all bounded and schema-checked at the bridge boundary.
The model sees the exact supplied `target/checkout.ts` source and may propose
only a plain unified diff for that one path. The bridge rejects an unmatched
baseline, third attempt, uncited/unknown evidence ID, malformed diff, or any
second path.

The supported policy response is limited to `POL-001` version 1. The prompt
requires `NEEDS_REVIEW` when the policy is ambiguous or outside the
single-intent duplicate-checkout semantics. The trusted runner remains
responsible for enforcing its fixed acceptance oracle and approvals.

## Audit metadata

Successful model calls return `ModelMeta` with:

- runtime: `google-antigravity`
- installed SDK version as observed with `importlib.metadata`
- selected model ID: `gemini-4-argon`
- elapsed wall-clock milliseconds for the SDK call
- actual numeric token usage fields when the SDK exposes them
- runtime conversation ID when the SDK exposes one
- API version, or `unknown` when the SDK does not expose it

No model thoughts are read, logged, or returned. The result surface is limited
to the contract or patch fields: observations, labelled hypotheses, rationale,
evidence citations, and (for repair) the unified diff.

`probeAgentRuntime()` checks that the pinned SDK is importable and reports the
selected runtime, whether a key is available to the trusted bridge, and that
tools are denied. It does not make a model request. In the event environment on
2026-10-16, `google-antigravity 0.1.22` successfully invoked
`gemini-4-argon` and returned real token usage; the SDK did not expose an API
version or conversation ID for that call, so both remain honestly unavailable
in the corresponding metadata.
