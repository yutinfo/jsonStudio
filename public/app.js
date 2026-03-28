const DEFAULT_JSON = {
  workspace: {
    name: "Customer Sync",
    active: true,
    version: 3,
    lastUpdated: "2026-03-25T10:15:00Z",
    tags: ["production", "europe", "priority"],
    owner: {
      id: 42,
      name: "Nadia Patel",
      email: "nadia@example.com",
      password: "remove-me"
    }
  },
  customers: [
    {
      id: 1001,
      name: "Acme Labs",
      tier: "enterprise",
      enabled: true,
      password: "secret-1",
      metrics: {
        users: 128,
        uptime: 99.97,
        regions: ["eu-west-1", "us-east-1"]
      }
    },
    {
      id: 1002,
      name: "Northwind Retail",
      tier: "growth",
      enabled: false,
      password: "secret-2",
      metrics: {
        users: 54,
        uptime: 98.4,
        regions: ["ap-southeast-1"]
      }
    }
  ],
  integrations: [
    {
      name: "stripe",
      status: "healthy",
      config: {
        apiVersion: "2024-04-10",
        retryLimit: 5
      }
    },
    {
      name: "warehouse",
      status: "warning",
      config: {
        endpoint: "https://warehouse.internal/api",
        retryLimit: 2
      }
    }
  ]
};

const LARGE_FILE_THRESHOLD = 200_000;
const TREE_CHILD_LIMIT = 200;
const SESSION_KEY = "json-studio-session";
let _validateTimer, _searchTimer, _lineRaf, _persistTimer;

const state = {
  data: structuredClone(DEFAULT_JSON),
  rawText: "",
  rawDirty: false,
  currentMode: "table",
  expandedPaths: new Set(["root", "root.workspace", "root.customers", "root.integrations"]),
  searchQuery: "",
  tablePath: [],
  history: [],
  lastAppliedRaw: "",
  wrapLines: true,
  pendingConfirm: null,
  lineCount: 0,
  hiddenColumns: new Map(),
  tablePage: 0,
  tablePageSize: 50
};

function colStateKey() { return JSON.stringify(state.tablePath); }
function getHiddenCols() {
  const key = colStateKey();
  if (!state.hiddenColumns.has(key)) state.hiddenColumns.set(key, new Set());
  return state.hiddenColumns.get(key);
}

const els = {};

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  bindEvents();
  initializeTheme();
  initResizer();
  const resumed = loadSession();
  syncRawTextFromData();
  renderAll();
  showToast(resumed ? "Session restored." : "Welcome to JSON Studio.", "info");
});

function initResizer() {
  const resizer = document.getElementById("panelResizer");
  const leftPanel = document.getElementById("leftPanel");
  const container = document.getElementById("workspaceContainer");
  if (!resizer || !leftPanel || !container) return;

  const STORAGE_KEY = "json-studio-panel-width";
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) leftPanel.style.width = saved + "px";

  let dragging = false;
  let startX = 0;
  let startW = 0;

  resizer.addEventListener("mousedown", (e) => {
    e.preventDefault();
    dragging = true;
    startX = e.clientX;
    startW = leftPanel.offsetWidth;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    resizer.classList.add("is-dragging");
  });

  document.addEventListener("mousemove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    const totalW = container.offsetWidth;
    const newW = Math.max(220, Math.min(totalW * 0.68, startW + dx));
    leftPanel.style.width = newW + "px";
  });

  document.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    resizer.classList.remove("is-dragging");
    localStorage.setItem(STORAGE_KEY, leftPanel.offsetWidth);
  });
}

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return false;
    const { data, history } = JSON.parse(raw);
    if (data === undefined) return false;
    state.data = data;
    state.history = Array.isArray(history) ? history : [];
    return true;
  } catch {
    return false;
  }
}

function persistSession() {
  clearTimeout(_persistTimer);
  _persistTimer = setTimeout(() => {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify({
        data: state.data,
        history: state.history
      }));
    } catch {} // ignore QuotaExceededError
  }, 400);
}

function cacheElements() {
  els.modeSummary = document.getElementById("modeSummary");
  els.jsonStats = document.getElementById("jsonStats");
  els.jsonInput = document.getElementById("jsonInput");
  els.rawStatus = document.getElementById("rawStatus");
  els.searchInput = document.getElementById("searchInput");
  els.fileInput = document.getElementById("fileInput");
  els.deleteKeySelect = document.getElementById("deleteKeySelect");
  els.deleteKeyTrigger = document.getElementById("deleteKeyTrigger");
  els.deleteKeyLabel = document.getElementById("deleteKeyLabel");
  els.deleteKeyPanel = document.getElementById("deleteKeyPanel");
  els.deleteKeyOptions = document.getElementById("deleteKeyOptions");
  els.deleteKeySearch = document.getElementById("deleteKeySearch");
  els.deleteKeySelectAll = document.getElementById("deleteKeySelectAll");
  els.deleteKeySelectNone = document.getElementById("deleteKeySelectNone");
  els.deleteKeyCount = document.getElementById("deleteKeyCount");
  els.deleteKeyEmpty = document.getElementById("deleteKeyEmpty");
  els.wrapToggle = document.getElementById("wrapToggle");
  els.treeView = document.getElementById("treeView");
  els.tableView = document.getElementById("tableView");
  els.tableToolbar = document.getElementById("tableToolbar");
  els.breadcrumb = document.getElementById("breadcrumb");
  els.tableHint = document.getElementById("tableHint");
  els.structuredStatus = document.getElementById("structuredStatus");
  els.toastContainer = document.getElementById("toastContainer");
  els.themeToggle = document.getElementById("themeToggle");
  els.confirmModal = document.getElementById("confirmModal");
  els.confirmTitle = document.getElementById("confirmTitle");
  els.confirmMessage = document.getElementById("confirmMessage");
  els.confirmCancel = document.getElementById("confirmCancel");
  els.confirmAccept = document.getElementById("confirmAccept");
  els.prettifyBtn = document.getElementById("prettifyBtn");
  els.applyRawBtn = document.getElementById("applyRawBtn");
  els.lineNumbers = document.getElementById("lineNumbers");
  els.searchCount = document.getElementById("searchCount");
  els.extractModal = document.getElementById("extractModal");
  els.extractKey = document.getElementById("extractKey");
  els.extractIdKey = document.getElementById("extractIdKey");
  els.extractResults = document.getElementById("extractResults");
  els.extractOutput = document.getElementById("extractOutput");
  els.extractCount = document.getElementById("extractCount");
  els.exportModal = document.getElementById("exportModal");
  els.exportModalOutput = document.getElementById("exportModalOutput");
  els.exportModalDesc = document.getElementById("exportModalDesc");
  els.exportModalCopy = document.getElementById("exportModalCopy");
  els.exportModalDownload = document.getElementById("exportModalDownload");
  els.exportModalClose = document.getElementById("exportModalClose");
}

function bindEvents() {
  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => handleAction(button.dataset.action));
  });

  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => setMode(button.dataset.mode));
  });

  els.searchInput.addEventListener("input", (event) => {
    clearTimeout(_searchTimer);
    const query = event.target.value.trim().toLowerCase();
    const delay = state.rawText.length > LARGE_FILE_THRESHOLD ? 400 : 150;
    _searchTimer = setTimeout(() => {
      state.searchQuery = query;
      state.tablePage = 0;
      if (!query) {
        clearSearchCount();
      }
      renderStructuredView();
    }, delay);
  });

  els.jsonInput.addEventListener("input", () => {
    state.rawText = els.jsonInput.value;
    state.rawDirty = state.rawText !== state.lastAppliedRaw;
    scheduleLineNumbers();
    clearTimeout(_validateTimer);
    const delay = state.rawText.length > LARGE_FILE_THRESHOLD ? 800 : 200;
    _validateTimer = setTimeout(() => validateRawText(false), delay);
  });

  els.jsonInput.addEventListener("scroll", () => {
    if (els.lineNumbers) els.lineNumbers.scrollTop = els.jsonInput.scrollTop;
  });

  els.jsonInput.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      applyRawUpdates();
    }
  });

  els.wrapToggle.addEventListener("change", (event) => {
    state.wrapLines = event.target.checked;
    scheduleLineNumbers();
    els.jsonInput.classList.toggle("is-wrapped", state.wrapLines);
  });

  if (els.extractKey) {
    els.extractKey.addEventListener("keydown", (event) => {
      if (event.key === "Enter") runExtract();
    });
  }

  if (els.extractIdKey) {
    els.extractIdKey.addEventListener("keydown", (event) => {
      if (event.key === "Enter") runExtract();
    });
  }

  if (els.extractModal) {
    els.extractModal.addEventListener("click", (event) => {
      if (event.target === els.extractModal) {
        els.extractModal.classList.add("hidden");
        els.extractModal.classList.remove("flex");
      }
    });
  }

  if (els.exportModalCopy) {
    els.exportModalCopy.addEventListener("click", () => {
      navigator.clipboard.writeText(els.exportModalOutput.value).then(() => showToast("Copied.", "success"));
    });
  }

  if (els.exportModalDownload) {
    els.exportModalDownload.addEventListener("click", () => {
      downloadTextFile(els.exportModalOutput.value, `filtered-${Date.now()}.json`);
      showToast("Download started.", "success");
    });
  }

  if (els.exportModalClose) {
    els.exportModalClose.addEventListener("click", closeExportModal);
  }

  els.fileInput.addEventListener("change", handleUpload);
  els.themeToggle.addEventListener("click", toggleTheme);

  if (els.deleteKeyTrigger) {
    els.deleteKeyTrigger.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleDeleteKeyPanel();
    });
  }
  if (els.deleteKeySelectAll) {
    els.deleteKeySelectAll.addEventListener("click", () => setAllDeleteKeys(true));
  }
  if (els.deleteKeySelectNone) {
    els.deleteKeySelectNone.addEventListener("click", () => setAllDeleteKeys(false));
  }
  if (els.deleteKeySearch) {
    els.deleteKeySearch.addEventListener("input", () => filterDeleteKeyOptions(els.deleteKeySearch.value.toLowerCase()));
  }
  if (els.deleteKeyOptions) {
    els.deleteKeyOptions.addEventListener("change", (e) => {
      if (e.target.matches("input[type=checkbox]")) updateDeleteKeyLabel();
    });
  }

  els.confirmCancel.addEventListener("click", closeConfirm);
  els.confirmAccept.addEventListener("click", () => {
    const action = state.pendingConfirm;
    closeConfirm();
    if (typeof action === "function") {
      action();
    }
  });

  document.addEventListener("click", handleDocumentClick);
  document.addEventListener("change", handleDocumentChange);
  document.addEventListener("submit", handleDocumentSubmit);
}

function initializeTheme() {
  const savedTheme = localStorage.getItem("json-studio-theme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const useDark = savedTheme ? savedTheme === "dark" : prefersDark;
  document.documentElement.classList.toggle("dark", useDark);
}

function toggleTheme() {
  const nowDark = !document.documentElement.classList.contains("dark");
  document.documentElement.classList.toggle("dark", nowDark);
  localStorage.setItem("json-studio-theme", nowDark ? "dark" : "light");
}

function handleAction(action) {
  switch (action) {
    case "sample":
      pushHistory("load sample");
      state.data = structuredClone(DEFAULT_JSON);
      state.tablePath = [];
      syncRawTextFromData();
      expandAll();
      renderAll();
      showToast("Sample JSON loaded.", "success");
      break;
    case "prettify":
      if (!validateRawText(false)) {
        showToast("Fix invalid JSON before prettifying.", "error");
        return;
      }
      pushHistory("prettify json");
      state.data = JSON.parse(state.rawText || "null");
      syncRawTextFromData();
      updatePrettifyHint(false, true);
      renderAll();
      showToast("JSON formatted.", "success");
      break;
    case "apply-text":
      applyRawUpdates();
      break;
    case "copy":
      copyJson();
      break;
    case "download":
      downloadJson();
      break;
    case "upload":
      els.fileInput.click();
      break;
    case "undo":
      undoLastAction();
      break;
    case "reset":
      openConfirm(
        "Reset current JSON?",
        "This will replace the current document with the default sample JSON.",
        () => {
          pushHistory("reset");
          state.data = structuredClone(DEFAULT_JSON);
          state.tablePath = [];
          syncRawTextFromData();
          expandAll();
          renderAll();
          showToast("JSON reset to the default sample.", "success");
        }
      );
      break;
    case "expand-all":
      expandAll();
      renderStructuredView();
      break;
    case "collapse-all":
      state.expandedPaths = new Set(["root"]);
      renderStructuredView();
      break;
    case "delete-by-key":
      confirmDeleteByKey();
      break;
    case "open-extract":
      if (els.extractModal) {
        els.extractModal.classList.remove("hidden");
        els.extractModal.classList.add("flex");
        requestAnimationFrame(() => els.extractKey?.focus());
      }
      break;
    case "close-extract":
      if (els.extractModal) {
        els.extractModal.classList.add("hidden");
        els.extractModal.classList.remove("flex");
      }
      break;
    case "run-extract":
      runExtract();
      break;
    case "copy-extract":
      if (els.extractOutput) {
        navigator.clipboard.writeText(els.extractOutput.value).then(() => showToast("Copied.", "success"));
      }
      break;
    default:
      break;
  }
}

function updatePrettifyHint(dirty, valid) {
  if (!els.prettifyBtn) return;
  if (dirty && valid) {
    els.prettifyBtn.classList.add("btn-hint");
    if (els.applyRawBtn) els.applyRawBtn.classList.add("btn-hint-secondary");
  } else {
    els.prettifyBtn.classList.remove("btn-hint");
    if (els.applyRawBtn) els.applyRawBtn.classList.remove("btn-hint-secondary");
  }
}

function validateRawText(showSuccess) {
  try {
    JSON.parse(state.rawText || "null");
    setRawStatus(
      state.rawDirty ? "Valid JSON. Apply updates to sync the structured views." : "JSON is synchronized.",
      "success"
    );
    updatePrettifyHint(state.rawDirty, true);
    if (showSuccess) {
      showToast("Raw JSON is valid.", "success");
    }
    return true;
  } catch (error) {
    setRawStatus(error.message, "error");
    updatePrettifyHint(state.rawDirty, false);
    return false;
  }
}

function applyRawUpdates() {
  if (!validateRawText(false)) {
    showToast("Cannot apply changes while the raw JSON is invalid.", "error");
    return;
  }

  try {
    const parsed = JSON.parse(state.rawText || "null");
    pushHistory("apply raw updates");
    state.data = parsed;
    state.tablePath = normalizeTablePath(state.tablePath);
    state.lastAppliedRaw = state.rawText;
    state.rawDirty = false;
    state.tablePage = 0;
    expandPathForSearchHits();
    renderAll();
    showToast("Structured views updated from the raw editor.", "success");
  } catch (error) {
    setRawStatus(error.message, "error");
    showToast("Failed to parse JSON.", "error");
  }
}

function copyJson() {
  navigator.clipboard
    .writeText(state.rawText)
    .then(() => showToast("JSON copied to the clipboard.", "success"))
    .catch(() => showToast("Clipboard access failed.", "error"));
}

function downloadJson() {
  downloadTextFile(state.rawText, "edited-json.json");
  showToast("Download started.", "success");
}

function downloadTextFile(text, filename) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function handleUpload(event) {
  const [file] = event.target.files || [];
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result || "");
    try {
      const parsed = JSON.parse(text);
      pushHistory("upload file");
      state.data = parsed;
      state.tablePath = [];
      state.tablePage = 0;
      syncRawTextFromData();
      expandAll();
      renderAll();
      showToast(`Loaded ${file.name}.`, "success");
    } catch (error) {
      setRawStatus(error.message, "error");
      showToast(`Invalid JSON file: ${file.name}.`, "error");
    } finally {
      els.fileInput.value = "";
    }
  };
  reader.readAsText(file);
}

function undoLastAction() {
  const previous = state.history.pop();
  if (!previous) {
    showToast("Nothing to undo.", "info");
    return;
  }

  state.data = previous.data;
  state.tablePath = previous.tablePath;
  state.expandedPaths = new Set(previous.expandedPaths);
  state.tablePage = 0;
  syncRawTextFromData();
  renderAll();
  showToast(`Undid ${previous.label}.`, "success");
}

function pushHistory(label) {
  state.history.push({
    label,
    data: structuredClone(state.data),
    tablePath: [...state.tablePath],
    expandedPaths: [...state.expandedPaths]
  });

  if (state.history.length > 100) {
    state.history.shift();
  }
}

function confirmDeleteByKey() {
  const keys = getSelectedDeleteKeys();
  if (!keys.length) {
    showToast("Select at least one column to delete.", "error");
    return;
  }

  const totalMatches = keys.reduce((sum, key) => sum + countMatchingKeys(state.data, key), 0);
  if (!totalMatches) {
    showToast(`No matching keys found in the document.`, "info");
    return;
  }

  const keyList = keys.length === 1
    ? `"${keys[0]}"`
    : `${keys.length} keys (${keys.map((k) => `"${k}"`).join(", ")})`;

  openConfirm(
    `Delete ${keyList} everywhere?`,
    `This will recursively remove ${totalMatches} matching node${totalMatches === 1 ? "" : "s"} across the entire JSON document.`,
    () => {
      pushHistory(`delete keys: ${keys.join(", ")}`);
      keys.forEach((key) => deleteKeysRecursive(state.data, key));
      syncRawTextFromData();
      renderAll();
      showToast(`Removed ${totalMatches} node${totalMatches === 1 ? "" : "s"} (${keyList}).`, "success");
      closeDeleteKeyPanel();
      setAllDeleteKeys(false);
    }
  );
}

function toggleDeleteKeyPanel() {
  if (!els.deleteKeyPanel) return;
  if (els.deleteKeyPanel.classList.contains("hidden")) {
    openDeleteKeyPanel();
  } else {
    closeDeleteKeyPanel();
  }
}

function openDeleteKeyPanel() {
  if (!els.deleteKeyPanel || !els.deleteKeyTrigger) return;
  populateDeleteKeyOptions();

  // Move panel to document.body so position:fixed is relative to viewport,
  // not broken by ancestor backdrop-filter / transform containing blocks.
  if (els.deleteKeyPanel.parentElement !== document.body) {
    document.body.appendChild(els.deleteKeyPanel);
  }

  const rect = els.deleteKeyTrigger.getBoundingClientRect();
  const panelLeft = rect.left;
  const panelTop = rect.bottom + 4;

  // Ensure panel doesn't overflow viewport right edge
  const maxLeft = window.innerWidth - 310; // 300 max-width + 10 margin
  els.deleteKeyPanel.style.top = panelTop + "px";
  els.deleteKeyPanel.style.left = Math.max(4, Math.min(panelLeft, maxLeft)) + "px";

  els.deleteKeyPanel.classList.remove("hidden");
  if (els.deleteKeySelect) els.deleteKeySelect.classList.add("is-open");
  if (els.deleteKeySearch) {
    els.deleteKeySearch.value = "";
    filterDeleteKeyOptions("");
    requestAnimationFrame(() => els.deleteKeySearch.focus());
  }
}

function closeDeleteKeyPanel() {
  if (els.deleteKeyPanel) els.deleteKeyPanel.classList.add("hidden");
  if (els.deleteKeySelect) els.deleteKeySelect.classList.remove("is-open");
}

function populateDeleteKeyOptions() {
  if (!els.deleteKeyOptions) return;
  const keys = getAvailableDeleteKeys();

  if (!keys.length) {
    els.deleteKeyOptions.innerHTML = "";
    if (els.deleteKeyEmpty) els.deleteKeyEmpty.classList.remove("hidden");
    updateDeleteKeyLabel();
    return;
  }
  if (els.deleteKeyEmpty) els.deleteKeyEmpty.classList.add("hidden");

  // Preserve existing checked state
  const checkedKeys = new Set(getSelectedDeleteKeys());

  els.deleteKeyOptions.innerHTML = "";
  keys.forEach((key) => {
    const label = document.createElement("label");
    label.className = "key-ms-item";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.className = "key-ms-checkbox";
    cb.value = String(key);
    cb.checked = checkedKeys.has(String(key));
    const span = document.createElement("span");
    span.className = "key-ms-key";
    span.textContent = String(key);
    label.append(cb, span);
    els.deleteKeyOptions.appendChild(label);
  });

  updateDeleteKeyLabel();
}

function getAvailableDeleteKeys() {
  const node = getValueAtPath(state.data, state.tablePath);
  const suitability = getTableSuitability(node);
  if (suitability.isTable) {
    if (suitability.mode === "array") return suitability.columns;
    if (suitability.mode === "object") return suitability.entries.map(([k]) => k);
  }
  // Fallback: collect all unique keys from root
  const keys = new Set();
  function collect(val) {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      Object.keys(val).forEach((k) => { keys.add(k); collect(val[k]); });
    } else if (Array.isArray(val)) {
      val.forEach(collect);
    }
  }
  collect(state.data);
  return [...keys].sort();
}

function getSelectedDeleteKeys() {
  if (!els.deleteKeyOptions) return [];
  return [...els.deleteKeyOptions.querySelectorAll("input[type=checkbox]:checked")].map((cb) => cb.value);
}

function updateDeleteKeyLabel() {
  if (!els.deleteKeyLabel) return;
  const selected = getSelectedDeleteKeys();
  if (!selected.length) {
    els.deleteKeyLabel.textContent = "Select columns…";
  } else if (selected.length === 1) {
    els.deleteKeyLabel.textContent = selected[0];
  } else {
    els.deleteKeyLabel.textContent = `${selected.length} columns`;
  }
  if (els.deleteKeyCount) {
    els.deleteKeyCount.textContent = selected.length ? `${selected.length} selected` : "";
  }
}

function setAllDeleteKeys(checked) {
  if (!els.deleteKeyOptions) return;
  els.deleteKeyOptions.querySelectorAll(".key-ms-item:not(.hidden) input[type=checkbox]").forEach((cb) => {
    cb.checked = checked;
  });
  updateDeleteKeyLabel();
}

function filterDeleteKeyOptions(query) {
  if (!els.deleteKeyOptions) return;
  els.deleteKeyOptions.querySelectorAll(".key-ms-item").forEach((item) => {
    const keyText = item.querySelector(".key-ms-key")?.textContent?.toLowerCase() ?? "";
    item.classList.toggle("hidden", !!query && !keyText.includes(query));
  });
}

function runExtract() {
  if (!els.extractKey || !els.extractOutput) return;
  const keyName = els.extractKey.value.trim();
  if (!keyName) {
    showToast("Enter a key name.", "error");
    return;
  }
  const idKey = (els.extractIdKey?.value.trim()) || "id";

  function prune(node) {
    if (Array.isArray(node)) {
      const results = node.map(prune).filter((result) => result.found);
      return { found: results.length > 0, pruned: results.map((result) => result.pruned) };
    }
    if (node && typeof node === "object") {
      const hasKey = keyName in node;
      const children = {};
      let anyChildFound = false;
      for (const [k, v] of Object.entries(node)) {
        if (k === idKey || k === keyName) continue;
        const result = prune(v);
        if (result.found) {
          children[k] = result.pruned;
          anyChildFound = true;
        }
      }
      if (!hasKey && !anyChildFound) return { found: false, pruned: null };
      const out = {};
      if (idKey in node) out[idKey] = node[idKey];
      if (hasKey) out[keyName] = node[keyName];
      Object.assign(out, children);
      return { found: true, pruned: out };
    }
    return { found: false, pruned: null };
  }

  const result = prune(state.data);
  const output = result.found ? result.pruned : null;

  if (!output || (Array.isArray(output) && !output.length)) {
    showToast(`No matches for "${keyName}".`, "info");
    return;
  }

  if (els.extractOutput) els.extractOutput.value = JSON.stringify(output, null, 2);
  if (els.extractCount) {
    const count = Array.isArray(output) ? output.length : 1;
    els.extractCount.textContent = `${count} result${count === 1 ? "" : "s"}`;
  }
  if (els.extractResults) els.extractResults.classList.remove("hidden");
}

function closeExportModal() {
  if (els.exportModal) {
    els.exportModal.classList.add("hidden");
    els.exportModal.classList.remove("flex");
  }
}

function openConfirm(title, message, onAccept) {
  state.pendingConfirm = onAccept;
  els.confirmTitle.textContent = title;
  els.confirmMessage.textContent = message;
  els.confirmModal.classList.remove("hidden");
  els.confirmModal.classList.add("flex");
}

function closeConfirm() {
  state.pendingConfirm = null;
  els.confirmModal.classList.add("hidden");
  els.confirmModal.classList.remove("flex");
}

function countMatchingKeys(value, target) {
  if (!value || typeof value !== "object") {
    return 0;
  }

  if (Array.isArray(value)) {
    return value.reduce((sum, item) => sum + countMatchingKeys(item, target), 0);
  }

  return Object.entries(value).reduce((sum, [key, nestedValue]) => {
    const own = key === target ? 1 : 0;
    return sum + own + countMatchingKeys(nestedValue, target);
  }, 0);
}

function deleteKeysRecursive(value, target) {
  if (!value || typeof value !== "object") {
    return 0;
  }

  let removed = 0;

  if (Array.isArray(value)) {
    value.forEach((item) => {
      removed += deleteKeysRecursive(item, target);
    });
    return removed;
  }

  Object.keys(value).forEach((key) => {
    if (key === target) {
      delete value[key];
      removed += 1;
      return;
    }
    removed += deleteKeysRecursive(value[key], target);
  });

  return removed;
}

function scheduleLineNumbers() {
  if (_lineRaf) return;
  _lineRaf = requestAnimationFrame(() => {
    _lineRaf = null;
    updateLineNumbers();
  });
}

function updateLineNumbers() {
  if (!els.lineNumbers) return;
  const text = els.jsonInput.value;
  const count = (text.match(/\n/g) || []).length + 1;
  const isHidden = els.lineNumbers.classList.contains("ln-hidden");
  if (count === state.lineCount && ((state.wrapLines && isHidden) || (!state.wrapLines && !isHidden))) return;
  state.lineCount = count;
  if (state.wrapLines) {
    els.lineNumbers.classList.add("ln-hidden");
  } else {
    els.lineNumbers.classList.remove("ln-hidden");
    els.lineNumbers.textContent = Array.from({ length: count }, (_, index) => index + 1).join("\n");
    els.lineNumbers.scrollTop = els.jsonInput.scrollTop;
  }
}

function clearSearchCount() {
  if (els.searchCount) els.searchCount.textContent = "";
}

function syncRawTextFromData() {
  state.rawText = JSON.stringify(state.data, null, 2);
  state.lastAppliedRaw = state.rawText;
  state.rawDirty = false;
  els.jsonInput.value = state.rawText;
  els.jsonInput.classList.toggle("is-wrapped", state.wrapLines);
  els.wrapToggle.checked = state.wrapLines;
  setRawStatus("JSON is synchronized.", "success");
  if (els.lineNumbers) scheduleLineNumbers();
  updatePrettifyHint(false, true);
  persistSession();
}

function renderAll() {
  renderStats();
  renderModeTabs();
  renderStructuredView();
}

function renderStats() {
  const stats = collectStats(state.data);
  els.jsonStats.textContent = `${stats.keys} keys • ${stats.nodes} nodes • ${stats.depth} levels`;
}

function renderModeTabs() {
  els.modeSummary.textContent = state.currentMode === "tree" ? "Tree View" : "Table View";
  document.querySelectorAll("[data-mode]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.mode === state.currentMode);
  });
}

function renderStructuredView() {
  els.treeView.classList.toggle("hidden", state.currentMode !== "tree");
  els.tableView.classList.toggle("hidden", state.currentMode !== "table");
  els.tableToolbar.classList.toggle("hidden", state.currentMode !== "table");

  if (state.currentMode === "tree") {
    renderTreeView();
    setStructuredStatus("");
  } else {
    renderTableView();
  }
}

function setMode(mode) {
  state.currentMode = mode;
  if (mode === "table") {
    state.tablePath = normalizeTablePath(state.tablePath);
  }
  state.tablePage = 0;
  renderAll();
}

function renderTreeView() {
  els.treeView.innerHTML = "";
  if (state.searchQuery) {
    renderSearchResults();
    return;
  }
  clearSearchCount();
  const wrapper = document.createElement("div");
  wrapper.className = "space-y-3";
  wrapper.appendChild(renderNodeRow({ keyLabel: "root", value: state.data, path: [], parentType: "root" }));
  els.treeView.appendChild(wrapper);
}

function collectSearchResults() {
  const results = [];
  function traverse(value, path) {
    if (results.length >= 500) return;
    const type = getValueType(value);
    const key = path[path.length - 1] ?? "root";
    if (isNodeMatch(key, value)) {
      results.push({ path: [...path], key, value });
    }
    if (type === "object") {
      for (const [k, v] of Object.entries(value)) {
        if (results.length >= 500) break;
        traverse(v, [...path, k]);
      }
    } else if (type === "array") {
      value.forEach((item, index) => {
        if (results.length >= 500) return;
        traverse(item, [...path, index]);
      });
    }
  }
  traverse(state.data, []);
  return results;
}

function renderSearchResults() {
  const results = collectSearchResults();
  if (els.searchCount) els.searchCount.textContent = `${results.length}${results.length >= 500 ? "+" : ""} matches`;

  if (!results.length) {
    els.treeView.innerHTML = `<div class="empty-state">No matches for "<strong>${escapeHtml(state.searchQuery)}</strong>".</div>`;
    return;
  }

  const container = document.createElement("div");
  container.className = "search-results";

  results.forEach(({ path, key, value }) => {
    const item = document.createElement("div");
    item.className = "search-result-item";
    const pathStr = path.length ? path.join(" › ") : "root";
    const type = getValueType(value);
    const valStr = type === "object" || type === "array" ? `{${type}}` : escapeHtml(formatPrimitive(value, type));
    item.innerHTML = `
      <span class="search-result-path">${escapeHtml(pathStr)}</span>
      <span class="search-result-key">${escapeHtml(String(key))}</span>
      <span class="search-result-val">${valStr}</span>
    `;
    container.appendChild(item);
  });

  if (results.length >= 500) {
    const note = document.createElement("p");
    note.className = "text-xs text-slate-400 mt-3 text-center";
    note.textContent = "Showing first 500 results.";
    container.appendChild(note);
  }

  els.treeView.appendChild(container);
}

function renderNodeRow({ keyLabel, value, path, parentType }) {
  const pathKey = pathToKey(path);
  const type = getValueType(value);
  const isComplex = type === "object" || type === "array";
  const expanded = state.expandedPaths.has(pathKey) || path.length === 0;
  const match = isNodeMatch(keyLabel, value);

  const container = document.createElement("div");
  container.className = path.length ? "tree-node" : "";

  const row = document.createElement("div");
  row.className = `tree-row ${match ? "is-match" : ""}`;

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = `tree-toggle ${isComplex ? "" : "is-leaf"}`;
  toggle.textContent = expanded ? "−" : "+";
  if (isComplex) {
    toggle.dataset.role = "toggle";
    toggle.dataset.path = pathKey;
  }

  const body = document.createElement("div");
  body.className = "space-y-3";

  const header = document.createElement("div");
  header.className = "flex flex-wrap items-center gap-3";
  header.innerHTML = `
    <div class="tree-key">
      <span>${escapeHtml(renderKeyLabel(keyLabel, parentType))}</span>
      <span class="value-chip type-${type}">${formatTypeLabel(type, value)}</span>
    </div>
    <span class="tree-meta">${getNodeSummary(value)}</span>
  `;
  body.appendChild(header);

  if (isComplex && expanded) {
    const children = document.createElement("div");
    children.className = "space-y-3";

    if (type === "object") {
      const entries = Object.entries(value);
      if (!entries.length) {
        children.innerHTML = `<div class="empty-state">This object is empty.</div>`;
      } else if (entries.length > TREE_CHILD_LIMIT) {
        entries.slice(0, TREE_CHILD_LIMIT).forEach(([childKey, childValue]) => {
          children.appendChild(
            renderNodeRow({
              keyLabel: childKey,
              value: childValue,
              path: [...path, childKey],
              parentType: "object"
            })
          );
        });
        const note = document.createElement("div");
        note.className = "text-xs text-slate-400 p-2";
        note.textContent = `… ${entries.length - TREE_CHILD_LIMIT} more items hidden (use search or table view)`;
        children.appendChild(note);
      } else {
        entries.forEach(([childKey, childValue]) => {
          children.appendChild(
            renderNodeRow({
              keyLabel: childKey,
              value: childValue,
              path: [...path, childKey],
              parentType: "object"
            })
          );
        });
      }
    } else {
      if (!value.length) {
        children.innerHTML = `<div class="empty-state">This array is empty.</div>`;
      } else if (value.length > TREE_CHILD_LIMIT) {
        value.slice(0, TREE_CHILD_LIMIT).forEach((childValue, index) => {
          children.appendChild(
            renderNodeRow({
              keyLabel: index,
              value: childValue,
              path: [...path, index],
              parentType: "array"
            })
          );
        });
        const note = document.createElement("div");
        note.className = "text-xs text-slate-400 p-2";
        note.textContent = `… ${value.length - TREE_CHILD_LIMIT} more items hidden (use search or table view)`;
        children.appendChild(note);
      } else {
        value.forEach((childValue, index) => {
          children.appendChild(
            renderNodeRow({
              keyLabel: index,
              value: childValue,
              path: [...path, index],
              parentType: "array"
            })
          );
        });
      }
    }

    body.appendChild(children);
  } else if (!isComplex) {
    body.appendChild(renderPrimitiveEditor(path, value));
  }

  const actions = document.createElement("div");
  actions.className = "tree-actions";

  if (path.length > 0) {
    actions.appendChild(makeActionButton("Delete", "delete-node", pathKey));
  }

  if (type === "object") {
    actions.appendChild(makeActionButton("+ Key", "add-object-key", pathKey));
  }

  if (type === "array") {
    actions.appendChild(makeActionButton("+ Item", "add-array-item", pathKey));
  }

  row.append(toggle, body, actions);
  container.appendChild(row);
  return container;
}

function makeActionButton(label, role, pathKey) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "icon-btn";
  button.textContent = label;
  button.dataset.role = role;
  button.dataset.path = pathKey;
  return button;
}

function renderPrimitiveEditor(path, value) {
  const type = getValueType(value);
  const wrapper = document.createElement("form");
  wrapper.className = "node-editor";
  wrapper.dataset.role = "primitive-editor";
  wrapper.dataset.path = pathToKey(path);

  const valueMarkup =
    type === "boolean"
      ? `
        <select name="value" class="mini-select">
          <option value="true" ${value === true ? "selected" : ""}>true</option>
          <option value="false" ${value === false ? "selected" : ""}>false</option>
        </select>
      `
      : `
        <input
          name="value"
          class="mini-input"
          ${type === "null" ? "disabled" : ""}
          value="${type === "null" ? "" : escapeAttribute(formatPrimitive(value, type))}"
          placeholder="${type === "string" ? "Enter text" : "Enter value"}"
        />
      `;

  wrapper.innerHTML = `
    <div class="node-editor-grid">
      <select name="type" class="mini-select">
        <option value="string" ${type === "string" ? "selected" : ""}>string</option>
        <option value="number" ${type === "number" ? "selected" : ""}>number</option>
        <option value="boolean" ${type === "boolean" ? "selected" : ""}>boolean</option>
        <option value="null" ${type === "null" ? "selected" : ""}>null</option>
      </select>
      <div data-role="primitive-input">${valueMarkup}</div>
      <button class="btn-secondary" type="submit">Apply</button>
    </div>
  `;

  return wrapper;
}

function renderTableView() {
  const node = getValueAtPath(state.data, state.tablePath);
  const suitability = getTableSuitability(node);
  renderBreadcrumbs();

  if (!suitability.isTable) {
    clearSearchCount();
    els.tableView.innerHTML = `
      <div class="empty-state">
        <h3 class="text-lg font-bold text-slate-900 dark:text-white">Current selection is not tabular.</h3>
        <p class="mt-2 text-sm leading-7">Table mode works best with objects or arrays of objects. Open a nested array from the tree, or continue from an existing table cell that contains structured data.</p>
        <button id="openTreeFallback" class="btn-secondary mt-5">Open Tree View</button>
      </div>
    `;
    setStructuredStatus("Showing fallback content because the selected node cannot be rendered cleanly as a table.", "info");
    const fallbackButton = document.getElementById("openTreeFallback");
    if (fallbackButton) {
      fallbackButton.addEventListener("click", () => setMode("tree"));
    }
    return;
  }

  const hidden = getHiddenCols();
  els.tableView.innerHTML = "";

  if (suitability.mode === "object") {
    const allKeys = suitability.entries.map(([key]) => key);
    const visibleEntries = suitability.entries.filter(([key]) => !hidden.has(key));
    const displayEntries = state.searchQuery
      ? visibleEntries.filter(([key, value]) => tableSearchMatches(key, value))
      : visibleEntries;

    if (els.searchCount) {
      els.searchCount.textContent = state.searchQuery ? `${displayEntries.length} matches` : "";
    }

    setStructuredStatus(
      `Viewing ${displayEntries.length} of ${suitability.entries.length} keys at ${formatBreadcrumbLabel(state.tablePath)}.`,
      "success"
    );

    const filterBar = document.createElement("div");
    filterBar.className = "col-filter-bar";
    filterBar.innerHTML = `<span class="col-filter-label">Columns:</span>`;
    filterBar.appendChild(makeColumnPill("All / None", "col-show-all", "col-pill col-pill-all"));

    allKeys.forEach((key) => {
      filterBar.appendChild(makeColumnPill(key, "toggle-col", `col-pill${hidden.has(key) ? " col-pill-off" : ""}`, {
        column: key
      }));
    });

    filterBar.appendChild(makeColumnPill("Export", "col-export", "col-pill col-pill-export"));

    const tableShell = document.createElement("div");
    tableShell.className = "table-shell";

    const table = document.createElement("table");
    table.className = "data-table";

    const thead = document.createElement("thead");
    thead.innerHTML = `<tr><th>Key</th><th>Value</th></tr>`;

    const tbody = document.createElement("tbody");
    displayEntries.forEach(([key, value]) => {
      const row = document.createElement("tr");

      const keyCell = document.createElement("td");
      keyCell.innerHTML = `<span class="cell-key">${escapeHtml(key)}</span>`;

      const valueCell = document.createElement("td");
      if (state.searchQuery && tableSearchMatches(key, value)) {
        valueCell.classList.add("td-match");
      }
      valueCell.appendChild(renderTableCell(value, [...state.tablePath, key]));

      row.append(keyCell, valueCell);
      tbody.appendChild(row);
    });

    if (!displayEntries.length) {
      const row = document.createElement("tr");
      row.innerHTML = `<td colspan="2"><div class="empty-state">No keys match the current search or visible column set.</div></td>`;
      tbody.appendChild(row);
    }

    table.append(thead, tbody);
    tableShell.appendChild(table);

    els.tableView.appendChild(filterBar);
    els.tableView.appendChild(tableShell);
    return;
  }

  const filterBar = document.createElement("div");
  filterBar.className = "col-filter-bar";
  filterBar.innerHTML = `<span class="col-filter-label">Columns:</span>`;
  filterBar.appendChild(makeColumnPill("All / None", "col-show-all", "col-pill col-pill-all"));

  suitability.columns.forEach((column) => {
    filterBar.appendChild(
      makeColumnPill(column, "toggle-col", `col-pill${hidden.has(column) ? " col-pill-off" : ""}`, { column })
    );
  });

  filterBar.appendChild(makeColumnPill("Export", "col-export", "col-pill col-pill-export"));

  const visibleColumns = suitability.columns.filter((column) => !hidden.has(column));
  const displayRows = state.searchQuery
    ? suitability.rows
        .map((rowValue, index) => ({ rowValue, origIndex: index }))
        .filter(({ rowValue }) => suitability.columns.some((column) => tableSearchMatches(column, rowValue?.[column])))
    : suitability.rows.map((rowValue, index) => ({ rowValue, origIndex: index }));

  const totalRows = displayRows.length;
  const pageSize = state.tablePageSize;
  const totalPages = pageSize === 0 ? 1 : Math.ceil(totalRows / pageSize || 1);
  if (state.tablePage >= totalPages) state.tablePage = Math.max(0, totalPages - 1);
  const pageStart = pageSize === 0 ? 0 : state.tablePage * pageSize;
  const pageEnd = pageSize === 0 ? totalRows : Math.min(pageStart + pageSize, totalRows);
  const pageRows = displayRows.slice(pageStart, pageEnd);

  if (els.searchCount) {
    els.searchCount.textContent = state.searchQuery ? `${displayRows.length} rows` : "";
  }

  setStructuredStatus(
    `Viewing ${pageRows.length} of ${displayRows.length} filtered rows at ${formatBreadcrumbLabel(state.tablePath)}.`,
    "success"
  );

  const tableShell = document.createElement("div");
  tableShell.className = "table-shell";

  const table = document.createElement("table");
  table.className = "data-table";

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");

  const firstHead = document.createElement("th");
  firstHead.textContent = "#";
  headRow.appendChild(firstHead);

  visibleColumns.forEach((column) => {
    const th = document.createElement("th");
    const headerWrap = document.createElement("div");
    headerWrap.className = "flex items-center justify-between gap-2";
    const label = document.createElement("span");
    label.textContent = column;
    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "col-delete-btn";
    deleteBtn.dataset.role = "table-delete-col";
    deleteBtn.dataset.column = column;
    deleteBtn.title = `Delete column ${column}`;
    deleteBtn.textContent = "×";
    headerWrap.append(label, deleteBtn);
    th.appendChild(headerWrap);
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);

  const tbody = document.createElement("tbody");

  if (!pageRows.length) {
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="${Math.max(2, visibleColumns.length + 1)}"><div class="empty-state">No rows match the current search.</div></td>`;
    tbody.appendChild(row);
  } else {
    pageRows.forEach(({ rowValue, origIndex }) => {
      const row = document.createElement("tr");

      const indexCell = document.createElement("td");
      indexCell.innerHTML = `
        <button class="value-chip type-number" style="cursor:pointer" data-role="table-open" data-path="${pathToKey([...state.tablePath, origIndex])}" title="Open row">[${origIndex}]</button>
      `;
      row.appendChild(indexCell);

      visibleColumns.forEach((column) => {
        const cellValue = rowValue?.[column];
        const td = document.createElement("td");
        if (state.searchQuery && tableSearchMatches(column, cellValue)) {
          td.classList.add("td-match");
        }
        td.appendChild(renderTableCell(cellValue, [...state.tablePath, origIndex, column]));
        row.appendChild(td);
      });

      tbody.appendChild(row);
    });
  }

  table.append(thead, tbody);
  tableShell.appendChild(table);

  const pagebar = document.createElement("div");
  pagebar.className = "pagebar";
  pagebar.innerHTML = `
    <div class="pagebar-sizes">
      ${[20, 50, 100, 0]
        .map((size) => {
          const label = size === 0 ? "All" : String(size);
          return `<button class="pagebar-size-btn${state.tablePageSize === size ? " is-active" : ""}" data-role="page-size" data-size="${size}">${label}</button>`;
        })
        .join("")}
    </div>
    <span class="pagebar-info">${totalRows} rows${pageSize === 0 ? "" : ` • ${pageStart + 1}-${pageEnd || 0}`}</span>
    <div class="pagebar-nav">
      <button class="pagebar-nav-btn${state.tablePage <= 0 ? " is-disabled" : ""}" data-role="page-prev">Prev</button>
      <span class="pagebar-page">${totalRows ? state.tablePage + 1 : 0} / ${totalPages}</span>
      <button class="pagebar-nav-btn${state.tablePage >= totalPages - 1 ? " is-disabled" : ""}" data-role="page-next">Next</button>
    </div>
  `;

  els.tableView.innerHTML = "";
  els.tableView.appendChild(filterBar);
  els.tableView.appendChild(tableShell);
  els.tableView.appendChild(pagebar);
}

function makeColumnPill(label, role, className, extra = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.dataset.role = role;
  button.textContent = label;
  Object.entries(extra).forEach(([key, value]) => {
    button.dataset[key] = value;
  });
  return button;
}

function tableSearchMatches(key, value) {
  if (!state.searchQuery) return false;
  const keyText = String(key).toLowerCase();
  if (keyText.includes(state.searchQuery)) return true;
  if (typeof value === "undefined") return false;
  const type = getValueType(value);
  if (type === "object") {
    return Object.keys(value).some((nestedKey) => nestedKey.toLowerCase().includes(state.searchQuery));
  }
  if (type === "array") {
    return value.some((item) => String(formatPrimitive(item, getValueType(item))).toLowerCase().includes(state.searchQuery));
  }
  return String(formatPrimitive(value, type)).toLowerCase().includes(state.searchQuery);
}

function renderTableCell(value, path) {
  const type = getValueType(value);
  const wrapper = document.createElement("div");

  if (type === "undefined" || type === "null") {
    wrapper.innerHTML = `<span class="cell-empty">—</span>`;
    return wrapper;
  }

  if (type === "boolean") {
    wrapper.innerHTML = `<span class="cell-bool ${value ? "cell-bool-true" : "cell-bool-false"}">${value}</span>`;
    markEditable(wrapper, path, type);
    return wrapper;
  }

  if (type === "object" || type === "array") {
    const isEmpty = type === "object" ? Object.keys(value).length === 0 : value.length === 0;
    if (isEmpty) {
      wrapper.innerHTML = `<span class="cell-empty">${type === "array" ? "[ ]" : "{ }"}</span>`;
      return wrapper;
    }

    const btn = document.createElement("button");
    btn.className = "cell-nav-btn";
    btn.dataset.role = "table-open";
    btn.dataset.path = pathToKey(path);

    if (type === "array") {
      const objCount = value.filter((item) => item && typeof item === "object" && !Array.isArray(item)).length;
      if (objCount > 0) {
        btn.textContent = `[ ${value.length} rows ]`;
      } else {
        const preview = value.slice(0, 4).map((item) => escapeHtml(String(item))).join(", ");
        const more = value.length > 4 ? ` +${value.length - 4}` : "";
        wrapper.innerHTML = `<span class="cell-primitive">${preview}${more}</span>`;
        return wrapper;
      }
    } else {
      const keys = Object.keys(value);
      const preview = keys
        .slice(0, 2)
        .map((key) => {
          const nestedValue = value[key];
          const nestedType = getValueType(nestedValue);
          const display =
            nestedType === "object" || nestedType === "array"
              ? "{…}"
              : escapeHtml(String(formatPrimitive(nestedValue, nestedType)));
          return `${escapeHtml(key)}: ${display}`;
        })
        .join(", ");
      const more = keys.length > 2 ? ` +${keys.length - 2}` : "";
      btn.innerHTML = `{ ${preview}${more} }`;
    }

    wrapper.appendChild(btn);
    return wrapper;
  }

  if (type === "number") {
    wrapper.innerHTML = `<span class="cell-number">${escapeHtml(formatPrimitive(value, type))}</span>`;
    markEditable(wrapper, path, type);
    return wrapper;
  }

  wrapper.innerHTML = `<span class="cell-primitive">${escapeHtml(formatPrimitive(value, type))}</span>`;
  markEditable(wrapper, path, type);
  return wrapper;
}

function markEditable(wrapper, path, type) {
  if (!path || !path.length) return;
  wrapper.dataset.role = "cell-edit";
  wrapper.dataset.path = pathToKey(path);
  wrapper.dataset.type = type;
  wrapper.classList.add("cell-editable");
}

function activateCellInlineEditor(wrapper, path) {
  if (wrapper.querySelector(".cell-inline-input, .cell-inline-select")) return;
  const value = getValueAtPath(state.data, path);
  const type = getValueType(value);
  if (type === "object" || type === "array" || type === "undefined" || type === "null") return;

  const originalContent = wrapper.innerHTML;
  let done = false;
  let input;

  if (type === "boolean") {
    input = document.createElement("select");
    input.className = "cell-inline-select";
    input.innerHTML = `<option value="true"${value === true ? " selected" : ""}>true</option><option value="false"${value === false ? " selected" : ""}>false</option>`;
  } else {
    input = document.createElement("input");
    input.className = "cell-inline-input";
    input.type = type === "number" ? "number" : "text";
    input.value = String(value);
    input.style.width = Math.max(60, Math.min(320, String(value).length * 8 + 32)) + "px";
  }

  function restore() {
    wrapper.innerHTML = originalContent;
    wrapper.classList.remove("is-editing");
  }

  function commit() {
    if (done) return;
    done = true;
    let nextValue;
    try {
      if (type === "boolean") {
        nextValue = input.value === "true";
      } else if (type === "number") {
        nextValue = Number(input.value);
        if (!Number.isFinite(nextValue)) throw new Error("Enter a valid number.");
      } else {
        nextValue = String(input.value);
      }
    } catch (error) {
      showToast(error.message, "error");
      restore();
      return;
    }
    const current = getValueAtPath(state.data, path);
    if (current === nextValue) {
      restore();
      return;
    }
    pushHistory(`edit ${formatBreadcrumbLabel(path)}`);
    updateAtPath(path, nextValue);
    syncRawTextFromData();
    renderAll();
    showToast("Saved.", "success");
  }

  function cancel() {
    if (done) return;
    done = true;
    restore();
  }

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    }
  });

  if (type === "boolean") {
    input.addEventListener("change", () => commit());
  } else {
    input.addEventListener("blur", () => {
      if (!done) commit();
    });
  }

  wrapper.innerHTML = "";
  wrapper.classList.add("is-editing");
  wrapper.appendChild(input);
  input.focus();
  if (type === "string" && input instanceof HTMLInputElement) input.select();
}

function renderBreadcrumbs() {
  els.breadcrumb.innerHTML = "";
  const crumbs = [["root", []]];
  let current = [];
  state.tablePath.forEach((segment) => {
    current = [...current, segment];
    crumbs.push([formatSegment(segment), [...current]]);
  });

  crumbs.forEach(([label, path], index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "breadcrumb-btn";
    button.textContent = label;
    button.dataset.role = "breadcrumb";
    button.dataset.path = pathToKey(path);
    els.breadcrumb.appendChild(button);

    if (index < crumbs.length - 1) {
      const divider = document.createElement("span");
      divider.className = "text-slate-300 dark:text-slate-600 text-[10px] select-none";
      divider.textContent = "›";
      els.breadcrumb.appendChild(divider);
    }
  });
}

function handleDocumentClick(event) {
  // Close delete key panel when clicking outside
  if (els.deleteKeyPanel && !els.deleteKeyPanel.classList.contains("hidden")) {
    if (!event.target.closest("#deleteKeySelect") && !event.target.closest("#deleteKeyPanel")) {
      closeDeleteKeyPanel();
    }
  }

  const toggle = event.target.closest('[data-role="toggle"]');
  if (toggle) {
    togglePath(keyToPath(toggle.dataset.path));
    return;
  }

  const actionButton = event.target.closest("[data-role]");
  if (!actionButton) {
    return;
  }

  const { role } = actionButton.dataset;
  if (!role) {
    return;
  }

  if (role === "page-size") {
    state.tablePageSize = Number(actionButton.dataset.size);
    state.tablePage = 0;
    renderStructuredView();
    return;
  }

  if (role === "page-prev") {
    if (state.tablePage > 0) {
      state.tablePage -= 1;
      renderStructuredView();
    }
    return;
  }

  if (role === "page-next") {
    state.tablePage += 1;
    renderStructuredView();
    return;
  }

  if (role === "toggle-col") {
    const hidden = getHiddenCols();
    const column = actionButton.dataset.column;
    if (!column) return;
    if (hidden.has(column)) hidden.delete(column);
    else hidden.add(column);
    state.tablePage = 0;
    renderStructuredView();
    return;
  }

  if (role === "col-show-all") {
    const node = getValueAtPath(state.data, state.tablePath);
    const suitability = getTableSuitability(node);
    if (!suitability.isTable) return;
    const hidden = getHiddenCols();
    const columns =
      suitability.mode === "object"
        ? suitability.entries.map(([key]) => key)
        : suitability.columns;
    const allVisible = columns.every((column) => !hidden.has(column));
    if (allVisible) {
      columns.forEach((column) => hidden.add(column));
    } else {
      hidden.clear();
    }
    state.tablePage = 0;
    renderStructuredView();
    return;
  }

  if (role === "col-export") {
    const node = getValueAtPath(state.data, state.tablePath);
    const suitability = getTableSuitability(node);
    if (!suitability.isTable) return;
    const hidden = getHiddenCols();
    let exportData;
    let desc;
    if (suitability.mode === "object") {
      const visibleEntries = suitability.entries.filter(([key]) => !hidden.has(key));
      exportData = Object.fromEntries(visibleEntries);
      desc = `${visibleEntries.length} of ${suitability.entries.length} keys`;
    } else {
      const visibleColumns = suitability.columns.filter((column) => !hidden.has(column));
      exportData = suitability.rows.map((row) => {
        const object = {};
        visibleColumns.forEach((column) => {
          object[column] = row[column];
        });
        return object;
      });
      desc = `${suitability.rows.length} rows · ${visibleColumns.length}/${suitability.columns.length} columns`;
    }
    if (els.exportModalOutput) els.exportModalOutput.value = JSON.stringify(exportData, null, 2);
    if (els.exportModalDesc) els.exportModalDesc.textContent = desc;
    if (els.exportModal) {
      els.exportModal.classList.remove("hidden");
      els.exportModal.classList.add("flex");
    }
    return;
  }

  if (role === "table-delete-col") {
    const column = actionButton.dataset.column;
    if (!column) return;
    openConfirm(
      `Delete column "${column}"?`,
      "This will remove the column from all visible rows in the current array.",
      () => {
        pushHistory(`delete column ${column}`);
        const node = getValueAtPath(state.data, state.tablePath);
        if (Array.isArray(node)) {
          node.forEach((row) => {
            if (row && typeof row === "object" && !Array.isArray(row)) {
              delete row[column];
            }
          });
        }
        getHiddenCols().delete(column);
        syncRawTextFromData();
        renderAll();
        showToast(`Deleted column "${column}".`, "success");
      }
    );
    return;
  }

  const { path } = actionButton.dataset;
  if (!path) {
    return;
  }

  const parsedPath = keyToPath(path);

  if (role === "cell-edit") {
    activateCellInlineEditor(actionButton, parsedPath);
    return;
  }

  switch (role) {
    case "delete-node":
      openConfirm(
        `Delete ${formatBreadcrumbLabel(parsedPath)}?`,
        "This node will be removed from the JSON document.",
        () => {
          pushHistory(`delete node ${formatBreadcrumbLabel(parsedPath)}`);
          deleteAtPath(parsedPath);
          state.tablePath = normalizeTablePath(state.tablePath);
          syncRawTextFromData();
          renderAll();
          showToast("Node deleted.", "success");
        }
      );
      break;
    case "add-object-key":
      promptAddObjectKey(parsedPath);
      break;
    case "add-array-item":
      promptAddArrayItem(parsedPath);
      break;
    case "table-open":
    case "breadcrumb":
      state.tablePath = parsedPath;
      state.tablePage = 0;
      if (state.currentMode !== "table") {
        state.currentMode = "table";
      }
      renderAll();
      break;
    default:
      break;
  }
}

function handleDocumentChange(event) {
  if (event.target.matches('form[data-role="primitive-editor"] select[name="type"]')) {
    const form = event.target.closest('form[data-role="primitive-editor"]');
    if (!form) {
      return;
    }
    const holder = form.querySelector('[data-role="primitive-input"]');
    const selectedType = event.target.value;
    holder.innerHTML =
      selectedType === "boolean"
        ? `
          <select name="value" class="mini-select">
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        `
        : `
          <input
            name="value"
            class="mini-input"
            ${selectedType === "null" ? "disabled" : ""}
            value=""
            placeholder="${selectedType === "string" ? "Enter text" : "Enter value"}"
          />
        `;
  }
}

function handleDocumentSubmit(event) {
  const form = event.target.closest('form[data-role="primitive-editor"]');
  if (!form) {
    return;
  }

  event.preventDefault();
  const path = keyToPath(form.dataset.path);
  const formData = new FormData(form);
  const selectedType = String(formData.get("type"));
  const rawValue = formData.get("value");

  try {
    const nextValue = coerceValue(selectedType, rawValue);
    pushHistory(`edit ${formatBreadcrumbLabel(path)}`);
    updateAtPath(path, nextValue);
    syncRawTextFromData();
    renderAll();
    showToast(`Updated ${formatBreadcrumbLabel(path)}.`, "success");
  } catch (error) {
    showToast(error.message, "error");
  }
}

function togglePath(path) {
  const pathKey = pathToKey(path);
  if (state.expandedPaths.has(pathKey)) {
    state.expandedPaths.delete(pathKey);
  } else {
    state.expandedPaths.add(pathKey);
  }
  renderStructuredView();
}

function expandAll() {
  if (state.rawText.length > LARGE_FILE_THRESHOLD) {
    showToast("File too large to expand all nodes.", "info");
    return;
  }
  const next = new Set(["root"]);
  collectComplexPaths(state.data, [], next);
  state.expandedPaths = next;
}

function collectComplexPaths(value, path, set) {
  const type = getValueType(value);
  if (type !== "object" && type !== "array") {
    return;
  }

  set.add(pathToKey(path));

  if (type === "object") {
    Object.entries(value).forEach(([key, nestedValue]) => collectComplexPaths(nestedValue, [...path, key], set));
    return;
  }

  value.forEach((nestedValue, index) => collectComplexPaths(nestedValue, [...path, index], set));
}

function expandPathForSearchHits() {
  if (!state.searchQuery) {
    return;
  }

  const next = new Set(state.expandedPaths);
  collectMatchingPaths(state.data, [], next);
  state.expandedPaths = next;
}

function collectMatchingPaths(value, path, set) {
  if (isNodeMatch(path[path.length - 1] ?? "root", value)) {
    let current = [];
    set.add("root");
    path.forEach((segment) => {
      current = [...current, segment];
      set.add(pathToKey(current));
    });
  }

  const type = getValueType(value);
  if (type === "object") {
    Object.entries(value).forEach(([key, nestedValue]) => collectMatchingPaths(nestedValue, [...path, key], set));
  }
  if (type === "array") {
    value.forEach((nestedValue, index) => collectMatchingPaths(nestedValue, [...path, index], set));
  }
}

function promptAddObjectKey(path) {
  const keyName = window.prompt("Enter a new key name:");
  if (!keyName) {
    return;
  }
  const rawValue = window.prompt('Enter a JSON value for this key (example: "text", 42, true, null, {"a":1}):', '""');
  if (rawValue === null) {
    return;
  }

  try {
    const parent = getValueAtPath(state.data, path);
    if (Object.prototype.hasOwnProperty.call(parent, keyName)) {
      showToast(`"${keyName}" already exists at this level.`, "error");
      return;
    }

    pushHistory(`add key ${keyName}`);
    parent[keyName] = JSON.parse(rawValue);
    state.expandedPaths.add(pathToKey(path));
    syncRawTextFromData();
    renderAll();
    showToast(`Added "${keyName}".`, "success");
  } catch (error) {
    showToast(`Invalid JSON value. ${error.message}`, "error");
  }
}

function promptAddArrayItem(path) {
  const rawValue = window.prompt('Enter a JSON value to append (example: "text", 42, true, null, {"a":1}):', "null");
  if (rawValue === null) {
    return;
  }

  try {
    pushHistory(`add array item ${formatBreadcrumbLabel(path)}`);
    const parent = getValueAtPath(state.data, path);
    parent.push(JSON.parse(rawValue));
    state.expandedPaths.add(pathToKey(path));
    syncRawTextFromData();
    renderAll();
    showToast("Array item added.", "success");
  } catch (error) {
    showToast(`Invalid JSON value. ${error.message}`, "error");
  }
}

function updateAtPath(path, nextValue) {
  if (!path.length) {
    state.data = nextValue;
    return;
  }

  const parent = getValueAtPath(state.data, path.slice(0, -1));
  const key = path[path.length - 1];
  parent[key] = nextValue;
}

function deleteAtPath(path) {
  if (!path.length) {
    state.data = null;
    return;
  }

  const parent = getValueAtPath(state.data, path.slice(0, -1));
  const key = path[path.length - 1];
  if (Array.isArray(parent)) {
    parent.splice(Number(key), 1);
  } else {
    delete parent[key];
  }
}

function getValueAtPath(root, path) {
  return path.reduce((current, segment) => current?.[segment], root);
}

function normalizeTablePath(path) {
  let current = state.data;
  const validPath = [];
  for (const segment of path) {
    if (current == null || typeof current !== "object" || !(segment in current)) {
      break;
    }
    validPath.push(segment);
    current = current[segment];
  }
  return validPath;
}

function getTableSuitability(node) {
  if (node && typeof node === "object" && !Array.isArray(node)) {
    const entries = Object.entries(node);
    if (!entries.length) return { isTable: false };
    return { isTable: true, mode: "object", entries };
  }

  if (Array.isArray(node) && node.length > 0) {
    const rows = node.filter((item) => item && typeof item === "object" && !Array.isArray(item));
    if (!rows.length) return { isTable: false };
    const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    if (!columns.length) return { isTable: false };
    return { isTable: true, mode: "array", rows, columns };
  }

  return { isTable: false };
}

function getValueType(value) {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  if (typeof value === "undefined") {
    return "undefined";
  }
  return typeof value;
}

function formatTypeLabel(type, value) {
  switch (type) {
    case "object":
      return "object";
    case "array":
      return `array(${value.length})`;
    case "string":
      return "string";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "null":
      return "null";
    default:
      return type;
  }
}

function getNodeSummary(value) {
  const type = getValueType(value);
  switch (type) {
    case "object":
      return `${Object.keys(value).length} field${Object.keys(value).length === 1 ? "" : "s"}`;
    case "array":
      return `${value.length} item${value.length === 1 ? "" : "s"}`;
    case "string":
      return `${value.length} char${value.length === 1 ? "" : "s"}`;
    case "number":
      return "numeric value";
    case "boolean":
      return "boolean value";
    case "null":
      return "empty value";
    default:
      return type;
  }
}

function collectStats(value, depth = 1) {
  const type = getValueType(value);
  if (type !== "object" && type !== "array") {
    return { keys: 0, nodes: 1, depth };
  }

  const entries = type === "object" ? Object.entries(value) : value.map((item, index) => [index, item]);
  return entries.reduce(
    (summary, [, nestedValue]) => {
      const child = collectStats(nestedValue, depth + 1);
      summary.keys += child.keys + (type === "object" ? 1 : 0);
      summary.nodes += child.nodes;
      summary.depth = Math.max(summary.depth, child.depth);
      return summary;
    },
    { keys: 0, nodes: 1, depth }
  );
}

function coerceValue(type, rawValue) {
  switch (type) {
    case "string":
      return String(rawValue ?? "");
    case "number": {
      const next = Number(rawValue);
      if (!Number.isFinite(next)) {
        throw new Error("Enter a valid number.");
      }
      return next;
    }
    case "boolean":
      return String(rawValue) === "true";
    case "null":
      return null;
    default:
      throw new Error("Unsupported value type.");
  }
}

function formatPrimitive(value, type = getValueType(value)) {
  if (type === "string") {
    return value;
  }
  if (type === "null") {
    return "null";
  }
  return String(value);
}

function setRawStatus(message, type) {
  els.rawStatus.textContent = message;
  els.rawStatus.className =
    type === "error"
      ? "text-sm font-medium text-rose-600 dark:text-rose-400"
      : "text-sm text-emerald-600 dark:text-emerald-400";
}

function setStructuredStatus(message, type) {
  if (!message) {
    els.structuredStatus.className = "mb-2 hidden shrink-0 rounded-xl border px-3 py-1.5 text-xs font-medium";
    els.structuredStatus.textContent = "";
    return;
  }

  const themeMap = {
    success:
      "mb-2 shrink-0 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-200",
    info:
      "mb-2 shrink-0 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200"
  };

  els.structuredStatus.className = themeMap[type] || themeMap.info;
  els.structuredStatus.textContent = message;
}

function showToast(message, type = "info") {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  els.toastContainer.appendChild(toast);
  window.setTimeout(() => {
    toast.remove();
  }, 3200);
}

function isNodeMatch(keyLabel, value) {
  if (!state.searchQuery) {
    return false;
  }

  const keyText = String(keyLabel).toLowerCase();
  const valueType = getValueType(value);
  const primitiveValue =
    valueType === "object" || valueType === "array" ? "" : String(formatPrimitive(value, valueType)).toLowerCase();

  return keyText.includes(state.searchQuery) || primitiveValue.includes(state.searchQuery);
}

function renderKeyLabel(keyLabel, parentType) {
  if (parentType === "array") {
    return `[${keyLabel}]`;
  }
  return String(keyLabel);
}

function formatSegment(segment) {
  return typeof segment === "number" ? `[${segment}]` : String(segment);
}

function formatBreadcrumbLabel(path) {
  if (!path.length) {
    return "root";
  }
  return `root.${path.map((segment) => (typeof segment === "number" ? `[${segment}]` : segment)).join(".")}`.replace(
    /\.?\[(\d+)\]/g,
    "[$1]"
  );
}

function pathToKey(path) {
  return ["root", ...path.map((segment) => String(segment).replaceAll(".", "\\u002e"))].join(".");
}

function keyToPath(key) {
  return key
    .split(".")
    .slice(1)
    .map((segment) => segment.replaceAll("\\u002e", "."))
    .map((segment) => {
      const num = Number(segment);
      return Number.isInteger(num) && String(num) === segment ? num : segment;
    });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#96;");
}
