// Shell: header, nav tree, router, re-render loop, boot.
import { store, bus, lsGet, lsSet, setToken, resetSession } from './state.js';
import { rl } from './api.js';
import { h, cr, countdown, statusTag, info, reportError, ensure } from './ui.js';
import * as A from './actions.js';
import { initLog } from './log.js';
import { startTimers } from './timers.js';
import { statusView } from './views/status.js';
import { authView } from './views/auth.js';
import { agentView } from './views/agent.js';
import { contractsView } from './views/contracts.js';
import { fleetView } from './views/fleet.js';
import { shipView } from './views/ship.js';

const $ = (id) => document.getElementById(id);
const views = { status: statusView, auth: authView, agent: agentView, contracts: contractsView, fleet: fleetView, ship: shipView };
const titles = { status: 'server status', auth: 'session', agent: 'agent overview', contracts: 'contracts', fleet: 'fleet', ship: 'ship' };

function route() {
  const [name, ...rest] = location.hash.replace(/^#\/?/, '').split('/');
  const arg = rest.length ? decodeURIComponent(rest.join('/')) : undefined;
  if (views[name]) return { name, arg };
  return { name: store.token ? 'agent' : 'auth', arg: undefined };
}

// ---------- theme / inspector ----------
function applyTheme() {
  const t = lsGet('stconsole.theme');
  if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
}
function toggleTheme() {
  const cur = document.documentElement.dataset.theme
    || (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  lsSet('stconsole.theme', cur === 'dark' ? 'light' : 'dark');
  applyTheme();
}
function toggleInspector() {
  const app = $('app');
  if (innerWidth <= 1150) app.classList.toggle('insp-mobile');
  else { app.classList.toggle('no-insp'); lsSet('stconsole.insp', app.classList.contains('no-insp') ? '0' : '1'); }
}

// ---------- header ----------
function rlText() {
  const rem = rl.remaining ?? '—';
  return `${rem}/${rl.burst ?? '—'}${rl.queued ? ` q${rl.queued}` : ''}`;
}

function renderHeader() {
  const a = store.agent;
  const s = store.status;
  const seg = (k, v, attrs) => h('span', { class: 'seg', ...attrs }, h('span', { class: 'k' }, k), v);
  $('hdr').replaceChildren(...[
    h('span', { class: 'brand' }, 'ST-CONSOLE ', h('small', null, 'v0.1 // spacetraders v2')),
    seg('SRV', s ? h('b', { class: 'ok' }, `UP ${s.version}`) : h('b', { class: 'dim' }, '…')),
    seg('AGENT', h('b', null, a?.symbol || (store.token ? '…' : 'none'))),
    a && seg('CREDITS', h('b', { class: 'ok' }, cr(a.credits))),
    a && seg('HQ', a.headquarters),
    seg('RATE', h('b', { id: 'rl' }, rlText()), { title: 'x-ratelimit-remaining / burst (server allows 2 req/s)' }),
    s?.serverResets && seg('RESET T−', countdown(s.serverResets.next, 'NOW')),
    seg('UTC', h('b', { id: 'clock' }, new Date().toISOString().slice(11, 19) + 'Z')),
    h('span', { class: 'hdr-tools' },
      h('button', { class: 'btn sm', type: 'button', onclick: toggleTheme }, 'THEME'),
      h('button', { class: 'btn sm', type: 'button', onclick: toggleInspector }, 'INSPECTOR')),
  ].filter(Boolean));
}

// ---------- nav tree ----------
function renderNav() {
  const r = route();
  const link = (href, label, active, tag) => h('a', { href, class: active ? 'active' : '' }, h('span', { class: 'pre' }, '├─'), label, tag && h('span', { class: 'tag' }, tag));
  const ships = Object.values(store.ships).sort((a, b) => a.symbol.localeCompare(b.symbol, 'en', { numeric: true }));
  const open = Object.values(store.contracts).filter((c) => !c.fulfilled).length;
  $('nav').replaceChildren(h('div', { class: 'tree' },
    h('h4', null, 'SYSTEM'),
    link('#/status', 'server status', r.name === 'status'),
    link('#/auth', 'session', r.name === 'auth', store.token ? h('span', { class: 'ok' }, '●') : h('span', { class: 'err' }, '○')),
    store.token && [
      h('h4', null, 'AGENT'),
      link('#/agent', 'overview', r.name === 'agent'),
      link('#/contracts', 'contracts', r.name === 'contracts', open ? String(open) : null),
      h('h4', null, `FLEET [${ships.length}]`),
      link('#/fleet', 'all ships', r.name === 'fleet'),
      ships.map((s) => link(`#/ship/${encodeURIComponent(s.symbol)}`, s.symbol.replace(`${store.agent?.symbol}-`, '#'),
        r.name === 'ship' && r.arg === s.symbol, statusTag(s))),
    ]));
}

// ---------- main ----------
let flash = null;
let lastRouteKey = '';

function captureInputs(root) {
  const saved = {};
  for (const el of root.querySelectorAll('input[name],select[name],textarea[name]')) {
    saved[el.name] = el.type === 'checkbox' ? { checked: el.checked } : { value: el.value };
  }
  const a = document.activeElement;
  const focus = a && root.contains(a) && a.name ? { name: a.name, start: a.selectionStart, end: a.selectionEnd } : null;
  return { saved, focus };
}

function restoreInputs(root, { saved, focus }) {
  for (const el of root.querySelectorAll('input[name],select[name],textarea[name]')) {
    const v = saved[el.name];
    if (!v) continue;
    if ('checked' in v && el.type === 'checkbox') el.checked = v.checked;
    else if (el.tagName === 'SELECT') { if ([...el.options].some((o) => o.value === v.value)) el.value = v.value; }
    else if (!el.readOnly) el.value = v.value;
  }
  if (focus) {
    const el = root.querySelector(`[name="${CSS.escape(focus.name)}"]`);
    if (el) { el.focus(); try { if (focus.start != null) el.setSelectionRange(focus.start, focus.end); } catch { /* not a text input */ } }
  }
}

function renderMain() {
  const main = $('main');
  const r = route();
  const key = `${r.name}/${r.arg ?? ''}`;
  const same = key === lastRouteKey;
  const state = same ? captureInputs(main) : null;
  const scroll = main.scrollTop;
  let body;
  try { body = views[r.name](r.arg); } catch (e) { console.error(e); body = h('div', { class: 'notice err' }, `render error: ${e.message}`); }
  const fl = flash && Date.now() - flash.ts < 10000
    ? h('div', { class: `notice flash ${flash.level}` }, h('span', { class: 't' }, new Date(flash.ts).toISOString().slice(11, 19)), h('span', null, flash.msg))
    : null;
  main.replaceChildren(h('div', { class: 'view' },
    h('div', { class: 'crumbs' }, '~/spacetraders/', h('b', null, titles[r.name] || r.name), r.arg ? ` :: ${r.arg}` : ''),
    fl, body));
  if (state) { restoreInputs(main, state); main.scrollTop = scroll; } else main.scrollTop = 0;
  lastRouteKey = key;
  document.title = `ST-Console · ${r.arg || titles[r.name]}`;
}

let raf = 0;
function schedule() {
  if (!raf) raf = requestAnimationFrame(() => { raf = 0; renderHeader(); renderNav(); renderMain(); });
}

// ---------- boot ----------
function boot() {
  applyTheme();
  if (lsGet('stconsole.insp') === '0') $('app').classList.add('no-insp');
  initLog();
  bus.on('change', schedule);
  bus.on('toggle-inspector', toggleInspector);
  bus.on('ratelimit', () => { const el = $('rl'); if (el) el.textContent = rlText(); });
  bus.on('flash', (f) => {
    flash = { ...f, ts: Date.now() };
    schedule();
    setTimeout(schedule, 10100);
  });
  bus.on('unauthorized', ({ token }) => {
    if (token !== store.token) return;
    store.notice = 'The server rejected the agent token (401). Servers reset weekly and invalidate all agent tokens — register a new agent.';
    setToken(null);
    resetSession();
    info('agent token rejected — session cleared', 'err');
    location.hash = '#/auth';
  });
  window.addEventListener('hashchange', schedule);

  startTimers();
  ensure('status', A.loadStatus);
  if (store.token) A.connect(store.token).catch(reportError);
  info('ST-Console ready. All requests go directly from this browser to api.spacetraders.io.');
  schedule();
}

boot();
