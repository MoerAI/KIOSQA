(() => {
  const panel = document.querySelector("#run-panel");
  const form = document.querySelector("#run-form");
  const error = document.querySelector("#action-error");
  const terminal = new Set(["complete", "failed", "needs_review"]);
  let busy = false;
  let stream;
  let streamId;
  let refreshing = false;
  let refreshPending = false;
  let revision;
  let selectedTab = "overview";

  function showError(message) {
    error.textContent = message;
    error.hidden = false;
  }

  function selectTab(name) {
    const tabs = [...panel.querySelectorAll("[data-tab]")];
    if (!tabs.some((tab) => tab.dataset.tab === name)) name = "overview";
    selectedTab = name;
    for (const tab of tabs) {
      const active = tab.dataset.tab === name;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    }
    for (const section of panel.querySelectorAll("[data-tab-panel]")) {
      section.hidden = section.dataset.tabPanel !== name;
    }
  }

  function connect(id) {
    if (streamId === id && stream) return;
    stream?.close();
    streamId = id;
    revision = undefined;
    stream = new EventSource(`/api/runs/${encodeURIComponent(id)}/events`);
    stream.addEventListener("run", (event) => {
      let run;
      try { run = JSON.parse(event.data); } catch { return; }
      if (run.id !== streamId) return;
      const next = `${run.phase}:${run.updatedAt}:${run.liveSuite?.updatedAt || ""}`;
      if (next === revision) return;
      revision = next;
      if (busy || refreshing) {
        refreshPending = true;
      } else {
        void refresh(id);
      }
    });
    stream.addEventListener("error", () => {
      if (!terminal.has(panel.querySelector("[data-run-id]")?.dataset.runPhase)) {
        showError("Live connection interrupted. Reconnecting to the run...");
      }
    });
    stream.addEventListener("open", () => {
      if (error.textContent.startsWith("Live connection interrupted")) error.hidden = true;
    });
  }

  async function refresh(id) {
    if (refreshing) { refreshPending = true; return; }
    refreshing = true;
    try {
      const data = await request(`/api/runs/${encodeURIComponent(id)}`);
      if (streamId === id && !busy) update(data);
      else refreshPending = true;
    } catch (cause) {
      showError(`Unable to refresh the run: ${cause.message}. Reload to reconnect.`);
    } finally {
      refreshing = false;
      if (refreshPending && !busy) {
        refreshPending = false;
        void refresh(streamId);
      }
    }
  }

  function update(data) {
    const previous = panel.querySelector("[data-run-id]");
    const phaseChanged = previous?.dataset.runPhase !== data.run.phase;
    if (!previous || previous.dataset.runId !== data.run.id || phaseChanged) {
      selectedTab = data.run.phase === "awaiting_patch_approval" ? "patch" : "overview";
    }
    const expanded = [...panel.querySelectorAll("details[data-detail-id][open]")].map((item) => item.dataset.detailId);
    panel.innerHTML = data.html;
    selectTab(selectedTab);
    for (const item of panel.querySelectorAll("details[data-detail-id]")) {
      if (expanded.includes(item.dataset.detailId)) item.open = true;
    }
    const active = !terminal.has(data.run.phase);
    for (const field of form.elements) field.disabled = active || (field.type === "submit" && form.dataset.agentAvailable !== "true");
    history.replaceState(null, "", `/?run=${encodeURIComponent(data.run.id)}`);
    connect(data.run.id);
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
    error.hidden = true;
    const buttons = [...document.querySelectorAll("button")];
    for (const button of buttons) button.disabled = true;
    try { update(await work()); } catch (cause) { showError(cause.message); }
    finally {
      busy = false;
      for (const button of buttons) if (button.isConnected) button.disabled = false;
      const current = panel.querySelector("[data-run-id]");
      if (current && !terminal.has(current.dataset.runPhase)) {
        for (const field of form.elements) field.disabled = true;
      } else if (form.dataset.agentAvailable !== "true") {
        form.querySelector('button[type="submit"]').disabled = true;
      }
      if (refreshPending && streamId) {
        refreshPending = false;
        void refresh(streamId);
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
    const tab = event.target.closest("[data-tab], [data-open-tab]");
    if (tab) {
      selectTab(tab.dataset.tab || tab.dataset.openTab);
      if (tab.dataset.openTab) panel.querySelector('[role="tablist"]')?.scrollIntoView({ block: "nearest" });
      return;
    }
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

  const current = panel.querySelector("[data-run-id]");
  if (current) {
    selectTab(current.dataset.runPhase === "awaiting_patch_approval" ? "patch" : "overview");
    connect(current.dataset.runId);
  }
})();
