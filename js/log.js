// Bottom request log + right-hand JSON inspector.
import { bus } from './state.js';
import { BASE } from './api.js';
import { h, hms } from './ui.js';

const MAX = 300;
const entries = [];
let selected = null;
let follow = true; // inspector shows the latest HTTP entry until the user picks one

const $ = (id) => document.getElementById(id);

export function initLog() {
  const lines = $('log-lines');
  const hideGet = $('log-hide-get');
  $('log-clear').addEventListener('click', () => {
    entries.length = 0; lines.replaceChildren(); selected = null; follow = true; renderInspector(); count();
  });
  hideGet.addEventListener('change', () => {
    for (const el of lines.children) el.hidden = hideGet.checked && el.dataset.method === 'GET';
  });

  bus.on('log', (e) => {
    entries.push(e);
    if (entries.length > MAX) { entries.shift(); lines.firstElementChild?.remove(); }
    const atBottom = lines.scrollHeight - lines.scrollTop - lines.clientHeight < 24;
    const el = line(e);
    if (hideGet.checked && e.method === 'GET') el.hidden = true;
    lines.append(el);
    if (atBottom) lines.scrollTop = lines.scrollHeight;
    count();
    if (e.kind === 'http' && follow) { selected = e; renderInspector(); markSel(); }
  });
  renderInspector();
}

function count() { $('log-count').textContent = `${entries.length} entries`; }

function line(e) {
  const t = h('span', { class: 'dim' }, hms(e.ts));
  if (e.kind === 'sys') {
    return h('div', { class: `ll sys ${e.level}` }, t, h('span', { class: 'msg' }, `» ${e.msg}`));
  }
  const s = String(e.status)[0];
  const el = h('div', { class: 'll', dataset: { method: e.method, id: String(e.id) + ':' + e.ts.getTime() } },
    t,
    h('span', { class: `m-${e.method}` }, e.method),
    h('span', null, e.path, e.note ? h('span', { class: 'note' }, `  — ${e.note}`) : null),
    h('span', { class: `s${s}` }, e.status || 'ERR'),
    h('span', { class: 'dim' }, `${e.ms}ms`));
  el.addEventListener('click', () => { selected = e; follow = false; renderInspector(); markSel(); });
  el._entry = e;
  return el;
}

function markSel() {
  for (const el of $('log-lines').children) el.classList.toggle('sel', el._entry === selected);
}

function highlight(json) {
  const esc = json.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc.replace(/("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/g,
    (m, str, colon, kw) => {
      if (str) return colon ? `<span class="j-k">${str}</span>${colon}` : `<span class="j-s">${str}</span>`;
      if (kw) return `<span class="j-b">${m}</span>`;
      return `<span class="j-n">${m}</span>`;
    });
}

function jsonBlock(obj) {
  const pre = h('pre', { class: 'code' });
  pre.innerHTML = highlight(JSON.stringify(obj, null, 2)); // escaped above
  return pre;
}

export function renderInspector() {
  const box = $('insp');
  const e = selected;
  const tools = h('span', { class: 'inline' },
    !follow ? h('button', { class: 'btn sm', type: 'button', onclick: () => { follow = true; selected = [...entries].reverse().find((x) => x.kind === 'http') || null; renderInspector(); markSel(); } }, 'FOLLOW') : h('span', { class: 'dim' }, 'following'),
    e?.res ? h('button', { class: 'btn sm', type: 'button', onclick: () => navigator.clipboard?.writeText(JSON.stringify(e.res, null, 2)) }, 'COPY') : null,
    h('button', { class: 'btn sm', type: 'button', onclick: () => bus.emit('toggle-inspector') }, 'X'));
  const head = h('div', { class: 'panel-h' }, h('span', { class: 'panel-t' }, 'INSPECTOR'), h('span', { class: 'spacer' }), tools);
  if (!e) {
    box.replaceChildren(head, h('div', { class: 'insp-b dim' }, 'No request selected. Click a log line to inspect its raw JSON.'));
    return;
  }
  box.replaceChildren(head, h('div', { class: 'insp-b' },
    h('div', null, h('b', { class: `m-${e.method}` }, e.method), ' ', h('span', { class: 'dim' }, BASE), e.path),
    h('div', { class: 'dim' }, `status ${e.status || 'ERR'} · ${e.ms}ms · ${e.ts.toISOString()}`),
    e.req !== undefined ? [h('h5', null, 'REQUEST BODY'), jsonBlock(e.req)] : null,
    h('h5', null, 'RESPONSE'),
    e.res ? jsonBlock(e.res) : h('div', { class: 'dim' }, '(empty body)')));
}
