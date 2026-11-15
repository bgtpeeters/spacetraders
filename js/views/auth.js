import { store, lsGet, lsSet, lsDel } from '../state.js';
import { h, panel, kv, field, select, act, ensure } from '../ui.js';
import * as A from '../actions.js';

const ACCT_KEY = 'stconsole.accountToken';
let issuedToken = null; // shown once after registration, memory only

const mask = (t) => (t ? `${t.slice(0, 12)}…${t.slice(-6)} (${t.length} chars)` : '—');

export function authView() {
  const out = [];
  if (store.notice) out.push(h('div', { class: 'notice warn' }, store.notice));

  out.push(panel('SESSION', [
    store.token
      ? kv([
        ['AGENT TOKEN', mask(store.token)],
        ['AGENT', store.agent?.symbol || '(not loaded)'],
        ['STORAGE', 'localStorage of this browser only — never sent anywhere except api.spacetraders.io'],
      ])
      : h('p', { class: 'dim' }, 'No agent token loaded. Connect with an existing token or register a new agent below.'),
    store.token && h('div', { class: 'row' },
      act('RECONNECT', () => A.connect(store.token), { key: 'connect' }),
      act('FORGET TOKEN', async () => { issuedToken = null; A.logout(); }, {
        cls: 'danger', confirm: 'Remove the agent token from this browser? Make sure you have a copy if you want to keep playing this agent.',
      })),
  ]));

  if (issuedToken) {
    out.push(panel('NEW AGENT TOKEN', [
      h('p', { class: 'warn' }, 'Copy this token somewhere safe. It is the only credential for this agent until the next server reset.'),
      h('textarea', { rows: 4, readonly: true, class: 'mono', onfocus: (e) => e.target.select() }, issuedToken),
      h('div', { class: 'row' },
        act('COPY', () => navigator.clipboard.writeText(issuedToken)),
        h('a', { href: '#/agent' }, '→ continue to agent overview')),
    ]));
  }

  const tok = h('textarea', { name: 'tok', rows: 3, placeholder: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9…', spellcheck: 'false', class: 'mono' });
  out.push(panel('CONNECT // existing agent token', [
    field('AGENT TOKEN', tok, 'Bearer JWT returned by POST /register. Invalidated by every server reset.'),
    h('div', { class: 'row' }, act('CONNECT', async () => {
      const t = tok.value.trim();
      if (!t) throw new Error('agent token required');
      issuedToken = null;
      await A.connect(t);
      location.hash = '#/agent';
    }, { key: 'connect', cls: 'go' })),
  ]));

  // Registration
  if (!store.factions) ensure('factions', A.loadFactions);
  const factions = (store.factions || []).filter((f) => f.isRecruiting);
  const savedAcct = lsGet(ACCT_KEY);
  const acct = h('input', { name: 'acct', type: 'password', class: 'w-wide', placeholder: 'account token', autocomplete: 'off', value: savedAcct || '' });
  const remember = h('input', { name: 'acct-remember', type: 'checkbox', checked: !!savedAcct });
  const sym = h('input', { name: 'reg-sym', class: 'w-wide', maxlength: 14, placeholder: '3–14 chars, e.g. BADGER', autocomplete: 'off',
    oninput: (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''); } });
  const fac = factions.length
    ? select('reg-fac', factions.map((f) => ({ value: f.symbol, label: `${f.symbol} — ${f.name}` })), 'COSMIC', { class: 'w-wide' })
    : select('reg-fac', ['COSMIC'], 'COSMIC', { class: 'w-wide' });
  const email = h('input', { name: 'reg-email', type: 'email', class: 'w-wide', placeholder: 'optional — only for reserved call signs' });

  out.push(panel('REGISTER // new agent', [
    h('p', { class: 'dim' }, 'Create an account at ', h('a', { href: 'https://my.spacetraders.io', target: '_blank', rel: 'noopener' }, 'my.spacetraders.io'),
      ' and generate an account token. It is used only for this request; the API returns a new agent token.'),
    field('ACCOUNT TOKEN', acct),
    h('label', { class: 'row dim' }, remember, ' remember account token in this browser (it survives server resets)'),
    field('AGENT SYMBOL', sym),
    field('FACTION', fac, factions.length ? `${factions.length} recruiting factions` : 'loading factions…'),
    field('EMAIL', email),
    h('div', { class: 'row' }, act('REGISTER', async () => {
      const accountToken = acct.value.trim();
      const symbol = sym.value.trim();
      if (!accountToken) throw new Error('account token required');
      if (symbol.length < 3 || symbol.length > 14) throw new Error('agent symbol must be 3–14 characters');
      if (remember.checked) lsSet(ACCT_KEY, accountToken); else lsDel(ACCT_KEY);
      const d = await A.register({ accountToken, symbol, faction: fac.value, email: email.value.trim() });
      issuedToken = d.token;
    }, { key: 'register', cls: 'go' })),
  ]));

  return out;
}
