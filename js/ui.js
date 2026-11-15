// DOM helpers and formatting. All API-sourced text goes through textContent (never innerHTML).
import { bus } from './state.js';

export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  let value;
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'value') value = v;
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false || c === '') continue;
    el.append(c instanceof Node ? c : String(c));
  }
  if (value !== undefined) el.value = value;
  return el;
}

// ---------- formatting ----------
export const num = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US'));
export const cr = (n) => (n == null ? '—' : `₡${num(n)}`);
export function dur(sec) {
  sec = Math.max(0, Math.ceil(sec));
  const d = Math.floor(sec / 86400), hh = Math.floor((sec % 86400) / 3600), mm = Math.floor((sec % 3600) / 60), ss = sec % 60;
  const p = (x) => String(x).padStart(2, '0');
  return (d ? `${d}d ` : '') + `${p(hh)}:${p(mm)}:${p(ss)}`;
}
export const hms = (d) => new Date(d).toISOString().slice(11, 19);
export const isoShort = (d) => (d ? new Date(d).toISOString().replace('T', ' ').slice(0, 16) + 'Z' : '—');
export const sysOf = (wp) => (wp ? wp.split('-').slice(0, 2).join('-') : '');
export const enc = encodeURIComponent;
export const future = (iso) => !!iso && Date.parse(iso) > Date.now();

/** Live countdown span; timers.js updates every [data-until] element each second. */
export function countdown(iso, doneText = 'READY') {
  const left = (Date.parse(iso) - Date.now()) / 1000;
  return h('span', { dataset: { until: iso, done: doneText }, class: left > 0 ? '' : 'done' }, left > 0 ? dur(left) : doneText);
}

/** Text progress bar: [#########.......] 9/16 */
export function bar(cur, max, width = 16, { invert = false } = {}) {
  if (!max) return h('span', { class: 'dim' }, 'n/a');
  const ratio = Math.max(0, Math.min(1, cur / max));
  const filled = Math.round(ratio * width);
  const level = invert ? 1 - ratio : ratio;
  const cls = 'bar' + (level < 0.15 ? ' crit' : level < 0.35 ? ' low' : '');
  return h('span', { class: cls },
    '[', h('span', { class: 'fill' }, '#'.repeat(filled)), h('span', { class: 'rest' }, '.'.repeat(width - filled)), `] ${num(cur)}/${num(max)}`);
}

// ---------- building blocks ----------
export function panel(title, body, tools) {
  return h('section', { class: 'panel' },
    h('div', { class: 'panel-h' }, h('span', { class: 'panel-t' }, title), h('span', { class: 'spacer' }), tools),
    h('div', { class: 'panel-b' }, body));
}

export function kv(pairs) {
  return h('dl', { class: 'kv' }, pairs.filter(Boolean).flatMap(([k, v]) => [h('dt', null, k), h('dd', null, v ?? '—')]));
}

/**
 * cols: [{ t: 'HEADER', f: row => node|string, cls?: 'num' }]
 * opts: { onRow(row), rowClass(row), empty }
 */
export function table(cols, rows, opts = {}) {
  const head = h('tr', null, cols.map((c) => h('th', { class: c.cls }, c.t)));
  const body = rows.length
    ? rows.map((r) => h('tr', {
      class: [opts.onRow ? 'click' : '', opts.rowClass?.(r) || ''].join(' ').trim() || null,
      onclick: opts.onRow ? (ev) => { if (!ev.target.closest('button,input,select,a')) opts.onRow(r); } : null,
    }, cols.map((c) => h('td', { class: c.cls }, c.f(r)))))
    : [h('tr', null, h('td', { class: 'empty', colspan: cols.length }, opts.empty || 'no rows'))];
  return h('div', { class: 'tbl-wrap' }, h('table', { class: 'tbl' }, h('thead', null, head), h('tbody', null, body)));
}

export function field(label, input, hint) {
  return h('label', { class: 'field' }, h('span', null, label), input, hint && h('span', { class: 'hint' }, hint));
}

export function select(name, options, value, attrs = {}) {
  return h('select', { name, ...attrs, value },
    options.map((o) => (typeof o === 'string' ? h('option', { value: o }, o) : h('option', { value: o.value }, o.label ?? o.value))));
}

export function pill(text, hi) { return h('span', { class: 'pill' + (hi ? ' hi' : '') }, text); }

// ---------- actions ----------
const busy = new Set();

export function info(msg, level = 'info') {
  bus.emit('log', { kind: 'sys', ts: new Date(), msg, level });
  if (level !== 'info') bus.emit('flash', { msg, level });
}

export function reportError(err) {
  console.warn(err);
  info(err?.message || String(err), 'err');
}

/**
 * Button that runs an async action with busy state + error reporting.
 * opts.key keeps the busy state across re-renders (e.g. "SHIP-1:extract").
 */
export function act(label, fn, opts = {}) {
  const key = opts.key;
  const isBusy = key && busy.has(key);
  const b = h('button', {
    type: 'button', class: ['btn', opts.cls, isBusy ? 'busy' : ''].filter(Boolean).join(' '),
    title: opts.title, disabled: opts.disabled || isBusy,
  }, label);
  b.addEventListener('click', async (ev) => {
    ev.preventDefault();
    if (b.disabled) return;
    if (opts.confirm && !window.confirm(opts.confirm)) return;
    b.disabled = true; b.classList.add('busy');
    if (key) busy.add(key);
    try { await fn(ev); } catch (e) { reportError(e); } finally {
      if (key) busy.delete(key);
      b.disabled = false; b.classList.remove('busy');
      if (key) bus.emit('change', 'busy');
    }
  });
  return b;
}

// Loader that de-duplicates in-flight requests and backs off after failures,
// so views can call ensure() freely from render.
const inflight = new Set();
const failedAt = {};
export function ensure(key, fn) {
  if (inflight.has(key) || Date.now() - (failedAt[key] || 0) < 15000) return;
  inflight.add(key);
  Promise.resolve().then(fn)
    .catch((e) => { failedAt[key] = Date.now(); reportError(e); })
    .finally(() => inflight.delete(key));
}
export const loading = (key) => inflight.has(key);

// ---------- ship helpers ----------
export function shipStatus(s) {
  const n = s.nav;
  if (n.status === 'IN_TRANSIT') return { label: future(n.route.arrival) ? 'IN_TRANSIT' : 'ARRIVING', cls: 'st-transit' };
  if (n.status === 'DOCKED') return { label: 'DOCKED', cls: 'st-docked' };
  return { label: 'IN_ORBIT', cls: 'st-orbit' };
}
export const statusTag = (s) => { const st = shipStatus(s); return h('span', { class: 'st ' + st.cls }, st.label); };
export const hasMount = (s, prefix) => (s.mounts || []).some((m) => m.symbol.startsWith(prefix));
export const hasModule = (s, prefix) => (s.modules || []).some((m) => m.symbol.startsWith(prefix));
