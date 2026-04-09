import { KORA_DAEMON_HOST, KORA_DAEMON_PORT } from './config.js'
import type { KairosLoopController } from './kairosLoop.js'
import type { JustBidWatcherController } from './justbidWatcher.js'
import {
  normalizeJustBidWatchConfig,
  readJustBidWatchConfig,
  writeJustBidWatchConfig,
} from './justbidWatchConfig.js'
import {
  readLatestJustBidWatchRunLog,
  readRecentJustBidWatchRunLogs,
} from './justbidWatchRunLog.js'
import { readJustBidWatchState } from './justbidWatchState.js'
import {
  attachSession,
  closeSession,
  createSession,
  getSession,
  listSessions,
} from './sessions.js'

type StartDaemonHttpServerOptions = {
  host?: string
  port?: number
  loopController?: KairosLoopController
  justBidWatcher?: JustBidWatcherController
}

type DaemonHttpServerHandle = {
  host: string
  port: number
  stop: () => void
}

function json(body: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function html(body: string, status: number = 200): Response {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  })
}

function badRequest(message: string): Response {
  return json({ error: message }, 400)
}

function notFound(): Response {
  return json({ error: 'Not found' }, 404)
}

async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json()
    if (!body || typeof body !== 'object') {
      return {}
    }
    return body as Record<string, unknown>
  } catch {
    return {}
  }
}

type JustBidStatusPayload = {
  configSummary: {
    enabled: boolean
    pollIntervalMs: number
    pagesToScan: number
    searchEnabled: boolean
    searchPagesToScan: number
    warmStartPending: boolean
    defaultLocationsCount: number
    watchlists: number
  }
  stateSummary: {
    lastRunAt: string | null
    lastSuccessAt: string | null
    lastError: string | null
    consecutiveFailures: number
    backoffUntil: string | null
    seenCount: number
    notifiedCount: number
    lastScannedCount: number
    lastMatchedCount: number
    lastNotifiedCount: number
  }
  latestRun: Awaited<ReturnType<typeof readLatestJustBidWatchRunLog>>
}

async function buildJustBidStatusPayload(): Promise<JustBidStatusPayload> {
  const [config, state, latestRun] = await Promise.all([
    readJustBidWatchConfig(),
    readJustBidWatchState(),
    readLatestJustBidWatchRunLog(),
  ])
  const seenCount = Object.keys(state.seen ?? {}).length
  const notifiedCount = Object.keys(state.notified ?? {}).length
  return {
    configSummary: {
      enabled: config.enabled,
      pollIntervalMs: config.pollIntervalMs,
      pagesToScan: config.pagesToScan,
      searchEnabled: config.searchEnabled,
      searchPagesToScan: config.searchPagesToScan,
      warmStartPending: config.warmStartPending,
      defaultLocationsCount: config.defaultLocations.length,
      watchlists: config.watchlists.length,
    },
    stateSummary: {
      lastRunAt: state.lastRunAt,
      lastSuccessAt: state.lastSuccessAt,
      lastError: state.lastError,
      consecutiveFailures: state.consecutiveFailures,
      backoffUntil: state.backoffUntil,
      seenCount,
      notifiedCount,
      lastScannedCount: state.lastScannedCount,
      lastMatchedCount: state.lastMatchedCount,
      lastNotifiedCount: state.lastNotifiedCount,
    },
    latestRun,
  }
}

export function startDaemonHttpServer(
  options: StartDaemonHttpServerOptions = {},
): DaemonHttpServerHandle {
  const host = options.host ?? KORA_DAEMON_HOST
  const port = options.port ?? KORA_DAEMON_PORT
  const startedAt = new Date().toISOString()
  const loopController = options.loopController
  const justBidWatcher = options.justBidWatcher

  const server = Bun.serve({
    hostname: host,
    port,
    fetch: async req => {
      const url = new URL(req.url)
      const pathSegments = url.pathname.split('/').filter(Boolean)

      if (req.method === 'GET' && url.pathname === '/daemon/justbid/runs-ui') {
        return html(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>JustBid Run History</title>
  <style>
    :root {
      --bg: #050506;
      --bg-grad-a: rgba(255, 255, 255, 0.04);
      --bg-grad-b: rgba(255, 255, 255, 0.03);
      --card: rgba(18, 18, 20, 0.86);
      --line: rgba(255, 255, 255, 0.14);
      --text: #f4f4f5;
      --muted: #a1a1aa;
      --good: #4ade80;
      --bad: #fb7185;
      --warn: #fbbf24;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "IBM Plex Sans", "Segoe UI", system-ui, sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at 10% 0%, var(--bg-grad-b), transparent 28%),
        radial-gradient(circle at 90% 0%, var(--bg-grad-a), transparent 30%),
        linear-gradient(145deg, var(--bg), #0d0d10);
      min-height: 100vh;
      padding: 18px;
    }
    .wrap { max-width: 1140px; margin: 0 auto; display: grid; gap: 12px; }
    .card {
      background: var(--card);
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 14px;
      backdrop-filter: blur(8px);
      box-shadow: 0 16px 36px rgba(0,0,0,0.35);
    }
    h1 { margin: 0; font-size: 24px; }
    p { margin: 6px 0 0; color: var(--muted); font-size: 13px; }
    .row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
    button, a {
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 8px 12px;
      background: rgba(28, 28, 31, 0.92);
      font: inherit;
      color: inherit;
      text-decoration: none;
      cursor: pointer;
    }
    button:hover, a:hover {
      transform: translateY(-1px);
      box-shadow: 0 10px 20px rgba(0, 0, 0, 0.26);
    }
    button.primary {
      background: linear-gradient(140deg, #2a2b30, #3d3f46);
      color: #fff;
      border-color: transparent;
    }
    .message { min-height: 20px; font-size: 13px; }
    .table-wrap { overflow: auto; }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      border-radius: 12px;
      overflow: hidden;
      background: rgba(13, 13, 16, 0.74);
    }
    th, td { padding: 8px 7px; border-bottom: 1px solid var(--line); text-align: left; white-space: nowrap; }
    th { color: var(--muted); font-weight: 600; }
    .status-success { color: var(--good); font-weight: 700; }
    .status-failure { color: var(--bad); font-weight: 700; }
    .status-backoff_skip, .status-disabled, .status-no_rules { color: var(--warn); font-weight: 700; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  </style>
</head>
<body>
  <div class="wrap">
    <section class="card">
      <h1>JustBid Run History</h1>
      <p>Last 10 watcher runs with key metrics.</p>
    </section>
    <section class="card">
      <div class="row">
        <a href="/daemon/justbid/ui">← Back To Watch Manager</a>
        <button id="refreshBtn" class="primary">Refresh</button>
      </div>
      <p id="message" class="message"></p>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Finished</th>
              <th>Status</th>
              <th>Duration</th>
              <th>Scanned</th>
              <th>Unseen</th>
              <th>Matched</th>
              <th>Notified</th>
              <th>Queries</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody id="rows"></tbody>
        </table>
      </div>
    </section>
  </div>
  <script>
    const rowsEl = document.getElementById('rows');
    const messageEl = document.getElementById('message');
    const refreshBtn = document.getElementById('refreshBtn');

    function setMessage(text, ok) {
      messageEl.textContent = text;
      messageEl.style.color = ok ? '#0f7a4b' : '#a52a3e';
    }

    async function loadRuns() {
      const res = await fetch('/daemon/justbid/runs?limit=10', { headers: { 'content-type': 'application/json' } });
      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch {}
      if (!res.ok) {
        throw new Error((data && data.error) || text || ('HTTP ' + res.status));
      }
      const runs = Array.isArray(data.runs) ? data.runs : [];
      rowsEl.innerHTML = '';
      if (runs.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 9;
        td.textContent = 'No run logs yet.';
        tr.appendChild(td);
        rowsEl.appendChild(tr);
        return;
      }

      for (const run of runs) {
        const tr = document.createElement('tr');
        const cells = [
          new Date(run.runFinishedAt || run.timestamp || '').toLocaleString(),
          run.status || 'unknown',
          (run.durationMs ?? 0) + ' ms',
          String(run.scannedCount ?? 0),
          String(run.unseenCount ?? 0),
          String(run.matchedCount ?? 0),
          String(run.notifiedCount ?? 0),
          String(run.searchQueriesRun ?? 0),
          run.error || '',
        ];
        cells.forEach((value, idx) => {
          const td = document.createElement('td');
          td.textContent = value;
          if (idx === 1) td.className = 'status-' + String(run.status || '');
          if (idx === 2) td.classList.add('mono');
          tr.appendChild(td);
        });
        rowsEl.appendChild(tr);
      }
    }

    refreshBtn.onclick = async () => {
      try {
        await loadRuns();
        setMessage('Refreshed.', true);
      } catch (error) {
        setMessage(String(error), false);
      }
    };

    (async () => {
      try {
        await loadRuns();
        setMessage('Ready.', true);
      } catch (error) {
        setMessage(String(error), false);
      }
    })();
  </script>
</body>
</html>`)
      }

      if (req.method === 'GET' && url.pathname === '/daemon/justbid/ui') {
        return html(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>JustBid Watch Manager</title>
  <style>
    :root {
      --bg-a: #050506;
      --bg-b: #0d0d10;
      --card: rgba(18, 18, 20, 0.84);
      --text: #f4f4f5;
      --muted: #a1a1aa;
      --line: rgba(255, 255, 255, 0.14);
      --brand: #2b2c31;
      --brand-2: #3d3f46;
      --danger: #fb7185;
      --ok: #4ade80;
      --shadow: 0 18px 38px rgba(0, 0, 0, 0.38);
      --radius: 14px;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--text);
      font-family: "IBM Plex Sans", "Segoe UI", "Avenir Next", system-ui, sans-serif;
      background:
        radial-gradient(circle at 8% 10%, rgba(255, 255, 255, 0.04), transparent 24%),
        radial-gradient(circle at 100% 0%, rgba(255, 255, 255, 0.03), transparent 28%),
        linear-gradient(130deg, var(--bg-a), var(--bg-b));
      min-height: 100vh;
      padding: 18px;
    }
    .shell { max-width: 1180px; margin: 0 auto; display: grid; gap: 14px; }
    .hero {
      border: 1px solid var(--line);
      border-radius: calc(var(--radius) + 4px);
      box-shadow: var(--shadow);
      padding: 18px;
      background: linear-gradient(118deg, rgba(23, 23, 26, 0.92), rgba(12, 12, 14, 0.88));
    }
    .hero h1 { margin: 0; font-size: 26px; letter-spacing: 0.01em; }
    .hero p { margin: 6px 0 0; color: var(--muted); font-size: 14px; }
    .panel {
      border: 1px solid var(--line);
      border-radius: var(--radius);
      box-shadow: var(--shadow);
      background: var(--card);
      backdrop-filter: blur(8px);
      padding: 14px;
    }
    .panel h2 {
      margin: 0 0 10px;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.07em;
      color: var(--muted);
    }
    .grid { display: grid; gap: 14px; grid-template-columns: 1fr; }
    @media (min-width: 900px) {
      .grid { grid-template-columns: 340px 1fr; align-items: start; }
    }
    .row { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 10px; }
    .field { display: grid; gap: 6px; margin-bottom: 10px; }
    .field label { font-size: 12px; font-weight: 650; color: var(--muted); }
    input, textarea, select {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 10px;
      font: inherit;
      color: inherit;
      padding: 9px 10px;
      background: rgba(13, 13, 16, 0.74);
    }
    textarea { min-height: 80px; resize: vertical; }
    .checkbox { display: flex; align-items: center; gap: 8px; font-size: 13px; margin-bottom: 10px; }
    .checkbox input { width: auto; }
    button {
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 8px 12px;
      font: inherit;
      font-size: 13px;
      background: rgba(28, 28, 31, 0.92);
      color: inherit;
      cursor: pointer;
      transition: transform .12s ease, box-shadow .16s ease, background .16s ease;
    }
    button:hover { transform: translateY(-1px); box-shadow: 0 8px 20px rgba(0,0,0,0.07); }
    button.primary {
      background: linear-gradient(145deg, var(--brand), var(--brand-2));
      color: #fff;
      border-color: transparent;
    }
    button.warn {
      background: rgba(251, 113, 133, 0.12);
      color: var(--danger);
      border-color: rgba(251, 113, 133, 0.35);
    }
    a.link-btn {
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 8px 12px;
      font: inherit;
      font-size: 13px;
      background: rgba(28, 28, 31, 0.92);
      color: inherit;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
    }
    a.link-btn:hover { transform: translateY(-1px); box-shadow: 0 8px 20px rgba(0,0,0,0.07); }
    .pill-wrap { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 6px; }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border-radius: 999px;
      border: 1px solid rgba(255, 255, 255, 0.18);
      background: rgba(255, 255, 255, 0.08);
      padding: 5px 9px;
      font-size: 12px;
    }
    .pill button {
      border: none;
      background: transparent;
      padding: 0;
      color: #d4d4d8;
      font-size: 14px;
      line-height: 1;
    }
    .rule-list { display: grid; gap: 12px; }
    .rule-card {
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 0;
      background: rgba(13, 13, 16, 0.74);
    }
    .rule-summary {
      padding: 10px;
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px;
      align-items: center;
      cursor: pointer;
      list-style: none;
    }
    .rule-summary::-webkit-details-marker { display: none; }
    .rule-meta {
      color: var(--muted);
      font-size: 12px;
    }
    .rule-body {
      padding: 0 10px 10px;
      border-top: 1px solid var(--line);
    }
    .rule-head {
      display: grid;
      grid-template-columns: 1fr auto auto;
      gap: 8px;
      align-items: center;
      margin-bottom: 8px;
    }
    .status {
      white-space: pre-wrap;
      word-break: break-word;
      border-radius: 10px;
      border: 1px solid var(--line);
      background: rgba(13, 13, 16, 0.74);
      padding: 10px;
      margin: 0;
      font-size: 12px;
      max-height: 260px;
      overflow: auto;
    }
    .message { min-height: 22px; margin: 0; font-size: 13px; }
    .message.ok { color: var(--ok); }
    .message.err { color: var(--danger); }
    .small { color: var(--muted); font-size: 12px; }
  </style>
</head>
<body>
  <div class="shell">
    <section class="hero">
      <h1>JustBid Watch Manager</h1>
      <p>Add and manage tracked items from one screen. Locations are global defaults for all items.</p>
    </section>

    <section class="grid">
      <div class="panel">
        <h2>Controls</h2>
        <div class="row">
          <button id="refreshBtn">Refresh</button>
          <button id="tickBtn">Run Tick</button>
          <button id="warmBtn">Warm Start</button>
          <button class="primary" id="saveBtn">Save</button>
          <a class="link-btn" href="/daemon/justbid/runs-ui">Run History</a>
        </div>
        <p id="message" class="message"></p>

        <h2>Watch Settings</h2>
        <label class="checkbox"><input id="enabled" type="checkbox" /> Watcher enabled</label>
        <label class="checkbox"><input id="searchEnabled" type="checkbox" /> Search enabled</label>
        <label class="checkbox"><input id="deepProbeEnabled" type="checkbox" /> Deep probe enabled</label>

        <div class="field">
          <label for="pollMins">Poll interval (minutes)</label>
          <input id="pollMins" type="number" min="1" step="1" />
        </div>
        <div class="field">
          <label for="pagesToScan">Daily pages scan count</label>
          <input id="pagesToScan" type="number" min="0" step="1" />
        </div>
        <div class="field">
          <label for="searchPagesToScan">Search pages per query</label>
          <input id="searchPagesToScan" type="number" min="1" step="1" />
        </div>

        <h2>Default Locations</h2>
        <div class="row">
          <input id="locationInput" type="text" placeholder="Add location and tap + (e.g. 320 Commerce Cir Sacramento, CA)" />
          <button id="addLocationBtn">+ Add</button>
        </div>
        <div id="locationPills" class="pill-wrap"></div>
        <p class="small">These locations are applied to every tracked item.</p>
      </div>

      <div class="panel">
        <h2>Add Item</h2>
        <div class="field">
          <label for="newRuleName">Item name</label>
          <input id="newRuleName" type="text" placeholder="Bose QuietComfort Ultra Headphones" />
        </div>
        <div class="field">
          <label for="newRuleKeywords">Keywords (comma or newline separated)</label>
          <textarea id="newRuleKeywords" placeholder="bose quietcomfort ultra headphones, quietcomfort ultra"></textarea>
        </div>
        <div class="row">
          <button class="primary" id="addRuleBtn">Add Tracked Item</button>
        </div>

        <h2>Tracked Items</h2>
        <div id="ruleList" class="rule-list"></div>
      </div>
    </section>

    <section class="panel">
      <h2>Status</h2>
      <pre id="status" class="status">Loading...</pre>
    </section>
  </div>

  <script>
    const els = {
      message: document.getElementById('message'),
      status: document.getElementById('status'),
      enabled: document.getElementById('enabled'),
      searchEnabled: document.getElementById('searchEnabled'),
      deepProbeEnabled: document.getElementById('deepProbeEnabled'),
      pollMins: document.getElementById('pollMins'),
      pagesToScan: document.getElementById('pagesToScan'),
      searchPagesToScan: document.getElementById('searchPagesToScan'),
      locationInput: document.getElementById('locationInput'),
      locationPills: document.getElementById('locationPills'),
      newRuleName: document.getElementById('newRuleName'),
      newRuleKeywords: document.getElementById('newRuleKeywords'),
      ruleList: document.getElementById('ruleList'),
      refreshBtn: document.getElementById('refreshBtn'),
      tickBtn: document.getElementById('tickBtn'),
      warmBtn: document.getElementById('warmBtn'),
      saveBtn: document.getElementById('saveBtn'),
      addLocationBtn: document.getElementById('addLocationBtn'),
      addRuleBtn: document.getElementById('addRuleBtn'),
    };

    let config = null;

    async function api(path, options) {
      const res = await fetch(path, {
        headers: { 'content-type': 'application/json' },
        ...(options || {}),
      });
      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch {}
      if (!res.ok) throw new Error((data && data.error) || text || ('HTTP ' + res.status));
      return data;
    }

    function setMessage(text, ok) {
      els.message.textContent = text;
      els.message.className = ok ? 'message ok' : 'message err';
    }

    function parseList(input) {
      if (!input) return [];
      const lines = input.split(/\\r?\\n|,/g).map(v => v.trim()).filter(Boolean);
      return Array.from(new Set(lines));
    }

    function toNullableNumber(input) {
      const raw = String(input || '').trim();
      if (!raw) return null;
      const value = Number(raw);
      return Number.isFinite(value) && value >= 0 ? value : null;
    }

    function slugify(input) {
      return input
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
    }

    function dedupeRuleId(baseId) {
      const taken = new Set((config.watchlists || []).map(rule => rule.id));
      if (!taken.has(baseId)) return baseId;
      let i = 2;
      while (taken.has(baseId + '-' + i)) i += 1;
      return baseId + '-' + i;
    }

    function maybeCommitDraftRule() {
      const name = String(els.newRuleName.value || '').trim();
      const rawKeywords = String(els.newRuleKeywords.value || '');
      const enteredKeywords = parseList(rawKeywords);
      if (!name && enteredKeywords.length === 0) {
        return false;
      }
      if (!name) {
        throw new Error('Item name is required for the draft item.');
      }
      const keywords = enteredKeywords.length > 0
        ? enteredKeywords.map(v => v.toLowerCase())
        : [name.toLowerCase()];
      const id = dedupeRuleId(slugify(name) || 'item');
      config.watchlists.unshift({
        id,
        name,
        enabled: true,
        keywords,
        excludeKeywords: [],
        requiredCondition: ['Appears New'],
        maxCurrentBid: null,
        maxAllInCost: null,
        minRetail: null,
      });
      els.newRuleName.value = '';
      els.newRuleKeywords.value = '';
      renderRules();
      return true;
    }

    function sanitizeRule(rule) {
      const name = String(rule.name || '').trim();
      const idRaw = String(rule.id || '').trim() || slugify(name) || 'item';
      const keywords = Array.from(new Set((Array.isArray(rule.keywords) ? rule.keywords : [])
        .map(v => String(v || '').trim().toLowerCase())
        .filter(Boolean)));
      return {
        id: idRaw,
        name: name || idRaw,
        enabled: rule.enabled !== false,
        keywords: keywords.length > 0 ? keywords : [String(name || idRaw).toLowerCase()],
        excludeKeywords: parseList((Array.isArray(rule.excludeKeywords) ? rule.excludeKeywords : []).join('\\n')),
        requiredCondition: parseList((Array.isArray(rule.requiredCondition) ? rule.requiredCondition : []).join('\\n')),
        maxCurrentBid: typeof rule.maxCurrentBid === 'number' && Number.isFinite(rule.maxCurrentBid) && rule.maxCurrentBid >= 0 ? rule.maxCurrentBid : null,
        maxAllInCost: typeof rule.maxAllInCost === 'number' && Number.isFinite(rule.maxAllInCost) && rule.maxAllInCost >= 0 ? rule.maxAllInCost : null,
        minRetail: typeof rule.minRetail === 'number' && Number.isFinite(rule.minRetail) && rule.minRetail >= 0 ? rule.minRetail : null,
      };
    }

    function sanitizeConfig(raw) {
      const watchlists = Array.isArray(raw.watchlists) ? raw.watchlists.map(sanitizeRule) : [];
      const defaultLocations = Array.from(new Set((Array.isArray(raw.defaultLocations) ? raw.defaultLocations : [])
        .map(v => String(v || '').trim())
        .filter(Boolean)));
      return {
        ...raw,
        enabled: raw.enabled !== false,
        searchEnabled: raw.searchEnabled !== false,
        deepProbeEnabled: raw.deepProbeEnabled !== false,
        pollIntervalMs: Number.isFinite(raw.pollIntervalMs) && raw.pollIntervalMs >= 5000 ? raw.pollIntervalMs : 300000,
        pagesToScan: Number.isInteger(raw.pagesToScan) && raw.pagesToScan >= 0 ? raw.pagesToScan : 0,
        searchPagesToScan: Number.isInteger(raw.searchPagesToScan) && raw.searchPagesToScan >= 1 ? raw.searchPagesToScan : 3,
        defaultLocations,
        watchlists,
      };
    }

    function renderLocationPills() {
      els.locationPills.innerHTML = '';
      if (!config.defaultLocations.length) {
        const empty = document.createElement('span');
        empty.className = 'small';
        empty.textContent = 'No location filter configured.';
        els.locationPills.appendChild(empty);
        return;
      }
      config.defaultLocations.forEach((loc, index) => {
        const pill = document.createElement('span');
        pill.className = 'pill';
        const text = document.createElement('span');
        text.textContent = loc;
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.textContent = '×';
        remove.title = 'Remove location';
        remove.onclick = () => {
          config.defaultLocations.splice(index, 1);
          renderLocationPills();
        };
        pill.appendChild(text);
        pill.appendChild(remove);
        els.locationPills.appendChild(pill);
      });
    }

    function makeRuleCard(rule, index) {
      const card = document.createElement('details');
      card.className = 'rule-card';
      card.open = false;

      const summary = document.createElement('summary');
      summary.className = 'rule-summary';
      const summaryLeft = document.createElement('div');
      const summaryTitle = document.createElement('strong');
      const summaryMeta = document.createElement('div');
      summaryMeta.className = 'rule-meta';
      const summaryHint = document.createElement('span');
      summaryHint.className = 'rule-meta';
      summaryHint.textContent = 'Tap to edit';
      summaryLeft.appendChild(summaryTitle);
      summaryLeft.appendChild(summaryMeta);
      summary.appendChild(summaryLeft);
      summary.appendChild(summaryHint);
      card.appendChild(summary);

      const body = document.createElement('div');
      body.className = 'rule-body';

      function refreshSummary() {
        summaryTitle.textContent = rule.name || '(untitled item)';
        const keywordCount = Array.isArray(rule.keywords) ? rule.keywords.length : 0;
        const statusText = rule.enabled === false ? 'disabled' : 'enabled';
        summaryMeta.textContent = 'keywords: ' + keywordCount + ' · ' + statusText;
      }

      const head = document.createElement('div');
      head.className = 'rule-head';

      const name = document.createElement('input');
      name.type = 'text';
      name.value = rule.name;
      name.placeholder = 'Item name';
      name.oninput = () => {
        rule.name = name.value;
        refreshSummary();
      };

      const enabledWrap = document.createElement('label');
      enabledWrap.className = 'checkbox';
      const enabled = document.createElement('input');
      enabled.type = 'checkbox';
      enabled.checked = rule.enabled !== false;
      enabled.onchange = () => {
        rule.enabled = enabled.checked;
        refreshSummary();
      };
      enabledWrap.appendChild(enabled);
      enabledWrap.appendChild(document.createTextNode('Enabled'));

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'warn';
      remove.textContent = 'Remove';
      remove.onclick = () => {
        config.watchlists.splice(index, 1);
        renderRules();
      };

      head.appendChild(name);
      head.appendChild(enabledWrap);
      head.appendChild(remove);
      body.appendChild(head);

      const fields = [
        ['Keywords', (rule.keywords || []).join('\\n'), value => {
          rule.keywords = parseList(value).map(v => v.toLowerCase());
          refreshSummary();
        }],
        ['Exclude Keywords', (rule.excludeKeywords || []).join('\\n'), value => rule.excludeKeywords = parseList(value).map(v => v.toLowerCase())],
        ['Required Conditions', (rule.requiredCondition || []).join('\\n'), value => rule.requiredCondition = parseList(value)],
      ];
      fields.forEach(field => {
        const wrap = document.createElement('div');
        wrap.className = 'field';
        const label = document.createElement('label');
        label.textContent = field[0] + ' (comma or newline separated)';
        const input = document.createElement('textarea');
        input.value = field[1];
        input.oninput = () => field[2](input.value);
        wrap.appendChild(label);
        wrap.appendChild(input);
        body.appendChild(wrap);
      });

      const budgets = document.createElement('div');
      budgets.className = 'row';
      [
        ['Max Bid', 'maxCurrentBid'],
        ['Max All-In', 'maxAllInCost'],
        ['Min Retail', 'minRetail'],
      ].forEach(entry => {
        const wrap = document.createElement('div');
        wrap.style.flex = '1 1 140px';
        wrap.className = 'field';
        const label = document.createElement('label');
        label.textContent = entry[0];
        const input = document.createElement('input');
        input.type = 'number';
        input.min = '0';
        input.step = '0.01';
        input.value = rule[entry[1]] == null ? '' : String(rule[entry[1]]);
        input.oninput = () => { rule[entry[1]] = toNullableNumber(input.value); };
        wrap.appendChild(label);
        wrap.appendChild(input);
        budgets.appendChild(wrap);
      });
      body.appendChild(budgets);

      const idLine = document.createElement('div');
      idLine.className = 'small';
      idLine.textContent = 'ID: ' + rule.id;
      body.appendChild(idLine);
      card.appendChild(body);
      refreshSummary();

      return card;
    }

    function renderRules() {
      els.ruleList.innerHTML = '';
      const watchlists = config.watchlists || [];
      if (watchlists.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'small';
        empty.textContent = 'No tracked items yet.';
        els.ruleList.appendChild(empty);
        return;
      }
      watchlists.forEach((rule, index) => {
        els.ruleList.appendChild(makeRuleCard(rule, index));
      });
    }

    function renderControls() {
      els.enabled.checked = config.enabled !== false;
      els.searchEnabled.checked = config.searchEnabled !== false;
      els.deepProbeEnabled.checked = config.deepProbeEnabled !== false;
      els.pollMins.value = String(Math.max(1, Math.round((config.pollIntervalMs || 300000) / 60000)));
      els.pagesToScan.value = String(config.pagesToScan || 0);
      els.searchPagesToScan.value = String(config.searchPagesToScan || 3);
      renderLocationPills();
      renderRules();
    }

    function collectFormChanges() {
      config.enabled = els.enabled.checked;
      config.searchEnabled = els.searchEnabled.checked;
      config.deepProbeEnabled = els.deepProbeEnabled.checked;
      config.pollIntervalMs = Math.max(5000, Math.round(Math.max(1, Number(els.pollMins.value) || 5) * 60000));
      config.pagesToScan = Math.max(0, Math.floor(Number(els.pagesToScan.value) || 0));
      config.searchPagesToScan = Math.max(1, Math.floor(Number(els.searchPagesToScan.value) || 1));
      config.defaultLocations = Array.from(new Set((config.defaultLocations || []).map(v => String(v || '').trim()).filter(Boolean)));
      config.watchlists = (config.watchlists || []).map(rule => sanitizeRule(rule)).filter(rule => rule.name && rule.keywords.length > 0);
    }

    async function loadConfig() {
      const data = await api('/daemon/justbid/config');
      config = sanitizeConfig(data.config || {});
      renderControls();
    }

    async function refreshStatus() {
      const data = await api('/daemon/justbid/status');
      els.status.textContent = JSON.stringify(data, null, 2);
    }

    async function saveConfig() {
      collectFormChanges();
      const payload = sanitizeConfig(config);
      const data = await api('/daemon/justbid/config', {
        method: 'PUT',
        body: JSON.stringify(payload),
      });
      config = sanitizeConfig(data.config || payload);
      renderControls();
    }

    els.addLocationBtn.onclick = () => {
      if (!config) return;
      const location = String(els.locationInput.value || '').trim();
      if (!location) return;
      if (!config.defaultLocations.includes(location)) {
        config.defaultLocations.push(location);
      }
      els.locationInput.value = '';
      renderLocationPills();
    };

    els.addRuleBtn.onclick = () => {
      if (!config) return;
      try {
        const added = maybeCommitDraftRule();
        if (!added) {
          setMessage('Enter an item name first.', false);
          return;
        }
        setMessage('Added tracked item. Save to persist.', true);
      } catch (error) {
        setMessage(String(error), false);
      }
    };

    els.refreshBtn.onclick = async () => {
      try {
        await Promise.all([loadConfig(), refreshStatus()]);
        setMessage('Loaded latest config and status.', true);
      } catch (error) {
        setMessage(String(error), false);
      }
    };

    els.saveBtn.onclick = async () => {
      try {
        const addedFromDraft = maybeCommitDraftRule();
        await saveConfig();
        await refreshStatus();
        setMessage(
          addedFromDraft
            ? 'Configuration saved. Draft item was added and saved.'
            : 'Configuration saved.',
          true,
        );
      } catch (error) {
        setMessage(String(error), false);
      }
    };

    els.tickBtn.onclick = async () => {
      try {
        await api('/daemon/justbid/tick', { method: 'POST', body: '{}' });
        await refreshStatus();
        setMessage('Tick finished.', true);
      } catch (error) {
        setMessage(String(error), false);
      }
    };

    els.warmBtn.onclick = async () => {
      try {
        await api('/daemon/justbid/warm-start', { method: 'POST', body: '{}' });
        await refreshStatus();
        setMessage('Warm start enabled for next run.', true);
      } catch (error) {
        setMessage(String(error), false);
      }
    };

    (async () => {
      try {
        await Promise.all([loadConfig(), refreshStatus()]);
        setMessage('Ready.', true);
      } catch (error) {
        setMessage(String(error), false);
      }
    })();
  </script>
</body>
</html>`)
      }

      if (url.pathname === '/daemon/justbid/config') {
        if (req.method === 'GET') {
          const config = await readJustBidWatchConfig()
          return json({ config })
        }
        if (req.method === 'PUT') {
          const rawBody = await req.text()
          if (rawBody.trim().length === 0) {
            return badRequest('JSON body is required')
          }
          let parsedBody: unknown
          try {
            parsedBody = JSON.parse(rawBody)
          } catch {
            return badRequest('Invalid JSON body')
          }
          if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) {
            return badRequest('JSON body must be an object')
          }
          const config = normalizeJustBidWatchConfig(parsedBody)
          await writeJustBidWatchConfig(config)
          return json({ config })
        }
        return json({ error: 'Method not allowed' }, 405)
      }

      if (url.pathname === '/daemon/justbid/status') {
        if (req.method !== 'GET') {
          return json({ error: 'Method not allowed' }, 405)
        }
        return json(await buildJustBidStatusPayload())
      }

      if (url.pathname === '/daemon/justbid/runs') {
        if (req.method !== 'GET') {
          return json({ error: 'Method not allowed' }, 405)
        }
        const limitRaw = url.searchParams.get('limit')
        const parsedLimit = limitRaw ? Number.parseInt(limitRaw, 10) : 10
        const limit = Number.isFinite(parsedLimit)
          ? Math.min(100, Math.max(1, parsedLimit))
          : 10
        const runs = await readRecentJustBidWatchRunLogs(limit)
        return json({ runs })
      }

      if (url.pathname === '/daemon/justbid/warm-start') {
        if (req.method !== 'POST') {
          return json({ error: 'Method not allowed' }, 405)
        }
        const config = await readJustBidWatchConfig()
        config.warmStartPending = true
        await writeJustBidWatchConfig(config)
        return json({ ok: true, warmStartPending: true })
      }

      if (url.pathname === '/daemon/justbid/tick') {
        if (req.method !== 'POST') {
          return json({ error: 'Method not allowed' }, 405)
        }
        if (!justBidWatcher) {
          return json({ error: 'JustBid watcher unavailable' }, 503)
        }
        await justBidWatcher.tick()
        const status = await buildJustBidStatusPayload()
        return json({ ok: true, ...status })
      }

      if (req.method === 'GET' && url.pathname === '/health') {
        return json({
          status: 'ok',
          pid: process.pid,
          startedAt,
          host,
          port,
        })
      }

      if (url.pathname === '/daemon/loop-status') {
        if (!loopController) {
          return json({ error: 'Loop controller unavailable' }, 503)
        }
        if (req.method !== 'GET') {
          return json({ error: 'Method not allowed' }, 405)
        }
        return json({ loop: loopController.getStatus() })
      }

      if (url.pathname === '/daemon/loop-tick') {
        if (!loopController) {
          return json({ error: 'Loop controller unavailable' }, 503)
        }
        if (req.method !== 'POST') {
          return json({ error: 'Method not allowed' }, 405)
        }
        const body = await readJson(req)
        const result = await loopController.tick({
          manual: true,
          sessionId:
            typeof body.sessionId === 'string' ? body.sessionId : undefined,
          simulateMalformed: body.simulateMalformed === true,
        })
        return json({ result, loop: loopController.getStatus() })
      }

      if (url.pathname === '/daemon/loop-pause') {
        if (!loopController) {
          return json({ error: 'Loop controller unavailable' }, 503)
        }
        if (req.method !== 'POST') {
          return json({ error: 'Method not allowed' }, 405)
        }
        const loop = await loopController.pause()
        return json({ loop })
      }

      if (url.pathname === '/daemon/loop-resume') {
        if (!loopController) {
          return json({ error: 'Loop controller unavailable' }, 503)
        }
        if (req.method !== 'POST') {
          return json({ error: 'Method not allowed' }, 405)
        }
        const loop = await loopController.resume()
        return json({ loop })
      }

      if (pathSegments.length === 1 && pathSegments[0] === 'sessions') {
        if (req.method === 'GET') {
          const projectPath = url.searchParams.get('projectPath') ?? undefined
          const sessions = await listSessions(projectPath)
          return json({ sessions })
        }
        if (req.method === 'POST') {
          const body = await readJson(req)
          const session = await createSession({
            projectPath:
              typeof body.projectPath === 'string' ? body.projectPath : process.cwd(),
            sessionId:
              typeof body.sessionId === 'string' ? body.sessionId : undefined,
            transcriptPath:
              typeof body.transcriptPath === 'string'
                ? body.transcriptPath
                : undefined,
          })
          return json({ session }, 201)
        }
      }

      if (pathSegments.length === 2 && pathSegments[0] === 'sessions') {
        const sessionId = decodeURIComponent(pathSegments[1])
        if (req.method === 'GET') {
          const session = await getSession(sessionId)
          if (!session) {
            return notFound()
          }
          return json({ session })
        }
      }

      if (
        pathSegments.length === 3 &&
        pathSegments[0] === 'sessions' &&
        pathSegments[2] === 'attach'
      ) {
        if (req.method !== 'POST') {
          return json({ error: 'Method not allowed' }, 405)
        }
        const sessionId = decodeURIComponent(pathSegments[1])
        const body = await readJson(req)
        if (typeof body.ownerPid !== 'number' || !Number.isInteger(body.ownerPid)) {
          return badRequest('ownerPid is required')
        }
        if (typeof body.ownerClientId !== 'string' || !body.ownerClientId) {
          return badRequest('ownerClientId is required')
        }
        const attached = await attachSession({
          sessionId,
          ownerPid: body.ownerPid,
          ownerClientId: body.ownerClientId,
          projectPath:
            typeof body.projectPath === 'string' ? body.projectPath : undefined,
          transcriptPath:
            typeof body.transcriptPath === 'string'
              ? body.transcriptPath
              : undefined,
        })
        return json(attached)
      }

      if (
        pathSegments.length === 3 &&
        pathSegments[0] === 'sessions' &&
        pathSegments[2] === 'close'
      ) {
        if (req.method !== 'POST') {
          return json({ error: 'Method not allowed' }, 405)
        }
        const sessionId = decodeURIComponent(pathSegments[1])
        const body = await readJson(req)
        const session = await closeSession({
          sessionId,
          ownerClientId:
            typeof body.ownerClientId === 'string'
              ? body.ownerClientId
              : undefined,
        })
        if (!session) {
          return notFound()
        }
        return json({ session })
      }

      return notFound()
    },
  })

  return {
    host,
    port: server.port ?? port,
    stop: () => server.stop(true),
  }
}
