(function () {
  const logEl = document.getElementById("log");

  const haUrlEl = document.getElementById("haUrl");
  const haTokenEl = document.getElementById("haToken");
  const saveBtn = document.getElementById("saveBtn");
  const testBtn = document.getElementById("testBtn");

  const entityIdEl = document.getElementById("entityId");
  const toggleBtn = document.getElementById("toggleBtn");
  const filterEl = document.getElementById("filter");
  const refreshBtn = document.getElementById("refreshBtn");
  const entitiesEl = document.getElementById("entities");

  const dashPathEl = document.getElementById("dashPath");
  const saveDashBtn = document.getElementById("saveDashBtn");
  const openDashBtn = document.getElementById("openDashBtn");
  const openHaRootBtn = document.getElementById("openHaRoot");
  const openLovelaceBtn = document.getElementById("openLovelace");

  const startScanBtn = document.getElementById("startScanBtn");
  const stopScanBtn = document.getElementById("stopScanBtn");
  const videoEl = document.getElementById("video");

  // Tabs
  const tabs = Array.from(document.querySelectorAll(".tab"));
  function setTab(name) {
    tabs.forEach(t => t.classList.toggle("active", t.dataset.tab === name));
    document.getElementById("tab-setup").classList.toggle("hidden", name !== "setup");
    document.getElementById("tab-control").classList.toggle("hidden", name !== "control");
    document.getElementById("tab-dash").classList.toggle("hidden", name !== "dash");
    document.getElementById("tab-scan").classList.toggle("hidden", name !== "scan");
  }
  tabs.forEach(t => t.addEventListener("click", () => setTab(t.dataset.tab)));

  function log(msg) {
    const ts = new Date().toLocaleTimeString();
    logEl.textContent = `[${ts}] ${msg}\n` + logEl.textContent;
  }

  function normalizeUrl(u) {
    let s = (u || "").trim();
    if (!s) return "";
    if (!/^https?:\/\//i.test(s)) s = "http://" + s;
    s = s.replace(/\/$/, "");
    return s;
  }

  function normalizePath(p) {
    let s = (p || "").trim();
    if (!s) return "/";
    if (!s.startsWith("/")) s = "/" + s;
    return s;
  }

  function getSettings() {
    return {
      haUrl: normalizeUrl(localStorage.getItem("ha_url") || haUrlEl.value),
      token: (localStorage.getItem("ha_token") || haTokenEl.value || "").trim(),
      lastEntity: localStorage.getItem("ha_last_entity") || "",
      lastFilter: localStorage.getItem("ha_last_filter") || "",
      dashPath: localStorage.getItem("ha_dash_path") || "/lovelace",
    };
  }

  function setSettings({ haUrl, token, lastEntity, lastFilter, dashPath }) {
    if (haUrl !== undefined) localStorage.setItem("ha_url", normalizeUrl(haUrl));
    if (token !== undefined) localStorage.setItem("ha_token", token.trim());
    if (lastEntity !== undefined) localStorage.setItem("ha_last_entity", lastEntity.trim());
    if (lastFilter !== undefined) localStorage.setItem("ha_last_filter", lastFilter.trim());
    if (dashPath !== undefined) localStorage.setItem("ha_dash_path", normalizePath(dashPath));
  }

  function applySettingsToUI() {
    const s = getSettings();
    haUrlEl.value = s.haUrl;
    haTokenEl.value = s.token ? "••••••••••••••••" : "";
    entityIdEl.value = s.lastEntity;
    filterEl.value = s.lastFilter;
    dashPathEl.value = s.dashPath;
  }

  function authHeaders(token) {
    return {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  }

  async function haFetch(path, opts = {}) {
    const { haUrl, token } = getSettings();
    if (!haUrl) throw new Error("Missing HA URL");
    if (!token) throw new Error("Missing token (scan QR or paste token)");

    const url = `${haUrl}${path}`;
    const res = await fetch(url, {
      ...opts,
      headers: {
        ...(opts.headers || {}),
        ...authHeaders(token),
      },
    });

    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    if (!res.ok) {
      throw new Error(`HA ${res.status}: ${typeof data === "string" ? data : JSON.stringify(data)}`);
    }
    return data;
  }

  async function testConnection() {
    const { haUrl, token } = getSettings();
    if (!haUrl) return log("Enter HA URL first (ex: http://192.168.4.55:8123)");
    if (!token) return log("No token saved. Go to QR Scan tab or paste token.");

    log(`Testing ${haUrl} ...`);
    const cfg = await haFetch("/api/config", { method: "GET" });
    log(`OK: ${cfg.location_name || "Home Assistant"} (version ${cfg.version || "?"})`);
  }

  function domainFromEntity(entityId) {
    return (entityId || "").split(".")[0] || "";
  }

  async function toggleEntity(entityId) {
    const domain = domainFromEntity(entityId);
    const allowed = new Set(["light", "switch", "fan", "input_boolean"]);
    if (!allowed.has(domain)) {
      throw new Error(`Unsupported domain "${domain}". Try light./switch./fan./input_boolean`);
    }
    await haFetch(`/api/services/${domain}/toggle`, {
      method: "POST",
      body: JSON.stringify({ entity_id: entityId }),
    });
  }

  async function refreshEntities() {
    const filter = (filterEl.value || "").trim().toLowerCase();
    setSettings({ lastFilter: filterEl.value });

    log("Loading entities...");
    const states = await haFetch("/api/states", { method: "GET" });

    const allowed = new Set(["light", "switch", "fan", "input_boolean"]);
    const filtered = states
      .filter(s => allowed.has(domainFromEntity(s.entity_id)))
      .filter(s => {
        if (!filter) return true;
        const name = (s.attributes?.friendly_name || "").toLowerCase();
        return s.entity_id.toLowerCase().includes(filter) || name.includes(filter);
      })
      .slice(0, 60);

    entitiesEl.innerHTML = "";
    for (const s of filtered) {
      const friendly = s.attributes?.friendly_name || s.entity_id;
      const state = String(s.state ?? "");
      const div = document.createElement("div");
      div.className = "item";
      div.innerHTML = `
        <div class="itemTop">
          <div>${escapeHtml(friendly)}</div>
          <div class="badge">${escapeHtml(state)}</div>
        </div>
        <div class="itemSub">${escapeHtml(s.entity_id)}</div>
      `;
      div.addEventListener("click", async () => {
        try {
          entityIdEl.value = s.entity_id;
          setSettings({ lastEntity: s.entity_id });
          log(`Toggling ${s.entity_id}...`);
          await toggleEntity(s.entity_id);
          log(`Toggled ${s.entity_id}`);
          await refreshEntities();
        } catch (e) {
          log(String(e));
        }
      });
      entitiesEl.appendChild(div);
    }

    log(`Loaded ${filtered.length} entities.`);
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, m => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
    }[m]));
  }

  function openHaPath(path) {
    const { haUrl } = getSettings();
    if (!haUrl) return log("Set HA URL first in Setup.");
    const p = normalizePath(path);
    log(`Opening: ${haUrl}${p}`);
    window.location.href = `${haUrl}${p}`;
  }

  // Save / Test
  saveBtn.addEventListener("click", () => {
    const haUrl = normalizeUrl(haUrlEl.value);
    const tokenTyped = haTokenEl.value.trim();
    const looksLikeDots = tokenTyped.includes("•");
    setSettings({
      haUrl,
      token: looksLikeDots ? (localStorage.getItem("ha_token") || "") : tokenTyped,
      lastEntity: entityIdEl.value,
      lastFilter: filterEl.value,
    });
    applySettingsToUI();
    log("Saved.");
  });

  testBtn.addEventListener("click", async () => {
    try {
      const haUrl = normalizeUrl(haUrlEl.value);
      const tokenTyped = haTokenEl.value.trim();
      const looksLikeDots = tokenTyped.includes("•");
      setSettings({
        haUrl,
        token: looksLikeDots ? (localStorage.getItem("ha_token") || "") : tokenTyped,
      });
      applySettingsToUI();
      await testConnection();
      setTab("control");
    } catch (e) {
      log(String(e));
    }
  });

  // Control
  toggleBtn.addEventListener("click", async () => {
    try {
      const id = entityIdEl.value.trim();
      if (!id) return log("Enter an entity_id first.");
      setSettings({ lastEntity: id });
      log(`Toggling ${id}...`);
      await toggleEntity(id);
      log(`Toggled ${id}`);
      await refreshEntities();
    } catch (e) {
      log(String(e));
    }
  });

  refreshBtn.addEventListener("click", async () => {
    try { await refreshEntities(); }
    catch (e) { log(String(e)); }
  });

  // Dash
  openHaRootBtn.addEventListener("click", () => openHaPath("/"));
  openLovelaceBtn.addEventListener("click", () => openHaPath("/lovelace"));

  saveDashBtn.addEventListener("click", () => {
    setSettings({ dashPath: dashPathEl.value });
    applySettingsToUI();
    log("Saved dashboard path.");
  });

  openDashBtn.addEventListener("click", () => {
    setSettings({ dashPath: dashPathEl.value });
    applySettingsToUI();
    openHaPath(dashPathEl.value);
  });

  // -------- QR scanning --------
  let codeReader = null;
  let scanControlsStop = null;

  function parseTokenFromQr(text) {
    const raw = (text || "").trim();
    if (!raw) return null;

    if (raw.startsWith("{") && raw.endsWith("}")) {
      try {
        const obj = JSON.parse(raw);
        const t = (obj.token || obj.ha_token || obj.HA_TOKEN || "").toString().trim();
        if (t) return t;
      } catch {}
    }

    if (raw.length > 20) return raw;
    return null;
  }

  async function startScan() {
    try {
      if (!codeReader) codeReader = new ZXingBrowser.BrowserQRCodeReader();

      const devices = await ZXingBrowser.BrowserCodeReader.listVideoInputDevices();
      let chosenId = null;

      for (const d of devices) {
        if ((d.label || "").toLowerCase().includes("back")) {
          chosenId = d.deviceId;
          break;
        }
      }
      if (!chosenId && devices.length) chosenId = devices[devices.length - 1].deviceId;

      log(`Starting scanner (${devices.length} cams detected)...`);

      const controls = await codeReader.decodeFromVideoDevice(
        chosenId,
        videoEl,
        async (result) => {
          if (!result) return;

          const token = parseTokenFromQr(result.getText());
          if (!token) {
            log("QR scanned but not recognized as a token.");
            return;
          }

          setSettings({ token });
          applySettingsToUI();

          log("Token saved from QR.");
          try { controls.stop(); } catch {}
          scanControlsStop = null;

          try {
            await testConnection();
            setTab("control");
            await refreshEntities();
          } catch (e) {
            log(String(e));
            setTab("setup");
          }
        }
      );

      scanControlsStop = () => {
        try { controls.stop(); } catch {}
        scanControlsStop = null;
      };
    } catch (e) {
      log(`Scan error: ${e}`);
      log("If it says camera blocked: allow camera permission for this page, then reload.");
    }
  }

  function stopScan() {
    if (scanControlsStop) {
      scanControlsStop();
      log("Scanner stopped.");
    }
    try { videoEl.srcObject = null; } catch {}
  }

  startScanBtn.addEventListener("click", () => {
    stopScan();
    startScan();
  });
  stopScanBtn.addEventListener("click", stopScan);

  // Boot
  applySettingsToUI();
  setTab("setup");
  log("Ready. Enter HA URL, then scan token QR in the QR Scan tab.");
})();
