(() => {
  const panel = document.querySelector("#run-panel");
  const form = document.querySelector("#run-form");
  const error = document.querySelector("#action-error");
  let timer;
  let busy = false;
  const waiting = new Set(["awaiting_contract_approval", "awaiting_patch_approval", "baseline_ready", "needs_review", "failed", "complete"]);

  function showError(message) {
    error.textContent = message;
    error.hidden = false;
  }

  function schedule() {
    clearTimeout(timer);
    const current = panel.querySelector("[data-run-id]");
    if (!current || waiting.has(current.dataset.runPhase)) return;
    timer = setTimeout(async () => {
      try {
        const data = await request(`/api/runs/${current.dataset.runId}`);
        update(data);
      } catch (cause) {
        showError(`Status refresh stopped: ${cause.message}. Reload to reconnect.`);
      }
    }, 1000);
  }

  function update(data) {
    panel.innerHTML = data.html;
    const active = !["complete", "failed", "needs_review"].includes(data.run.phase);
    for (const field of form.elements) field.disabled = active;
    history.replaceState(null, "", `/?run=${encodeURIComponent(data.run.id)}`);
    schedule();
  }

  async function request(path, body) {
    const response = await fetch(path, body === undefined ? {} : {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const text = await response.text();
    let result;
    try { result = JSON.parse(text); } catch { throw new Error(`Server returned HTTP ${response.status} without a JSON result.`); }
    if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
    return result;
  }

  async function action(work) {
    if (busy) return;
    busy = true;
    clearTimeout(timer);
    error.hidden = true;
    const buttons = [...document.querySelectorAll("button")];
    for (const button of buttons) button.disabled = true;
    try { update(await work()); } catch (cause) { showError(cause.message); }
    finally {
      busy = false;
      for (const button of buttons) if (button.isConnected) button.disabled = false;
      const current = panel.querySelector("[data-run-id]");
      if (current && !["complete", "failed", "needs_review"].includes(current.dataset.runPhase)) {
        for (const field of form.elements) field.disabled = true;
      }
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const fields = new FormData(form);
    action(() => request("/api/runs", {
      targetId: "synthetic-checkout",
      scenarioId: "duplicate-checkout",
      policyText: fields.get("policyText"),
      scenarioParameters: { delayMs: Number(fields.get("delayMs")), repeatCount: Number(fields.get("repeatCount")) },
    }));
  });

  panel.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;
    const current = panel.querySelector("[data-run-id]");
    action(async () => {
      const body = button.dataset.action === "repair" ? {} : {
        decision: button.dataset.decision,
        ...(button.dataset.action === "approve-contract" ? { contractHash: current.dataset.contractHash } : { patchHash: current.dataset.patchHash }),
      };
      return request(`/api/runs/${current.dataset.runId}/${button.dataset.action}`, body);
    });
  });
  schedule();
})();
