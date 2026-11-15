import { store } from '../state.js';
import { h, panel, kv, cr, num, act, table, statusTag, bar, countdown, future } from '../ui.js';
import * as A from '../actions.js';

export function needToken() {
  return panel('NO SESSION', [
    h('p', null, 'No agent token loaded.'),
    h('a', { href: '#/auth' }, '→ open session / register'),
  ]);
}

export function agentView() {
  if (!store.token) return needToken();
  const a = store.agent;
  if (!a) return panel('AGENT', h('div', { class: 'dim' }, 'loading agent …'));
  const ships = Object.values(store.ships);
  const contracts = Object.values(store.contracts);
  const active = contracts.filter((c) => c.accepted && !c.fulfilled);
  const anyMined = ships.some((s) => s.cargo?.units > 0);

  const steps = [
    ['Read your starting contract on the Contracts page and ACCEPT it (upfront payment).', contracts.some((c) => c.accepted)],
    ['Open your command ship, find an ENGINEERED_ASTEROID / ASTEROID waypoint in the navigation table.', ships.some((s) => /ASTEROID/.test(s.nav.route?.destination?.type || ''))],
    ['NAVIGATE there (auto-orbit undocks for you), then EXTRACT repeatedly — respect the cooldown.', anyMined],
    ['Fly to a MARKETPLACE: SELL what the contract does not need, DELIVER the rest at the contract destination.', contracts.some((c) => c.terms.deliver.some((d) => d.unitsFulfilled > 0))],
    ['FULFILL the contract, NEGOTIATE a new one at a faction waypoint, repeat. Buy more ships later (shipyard support is milestone 5).', contracts.some((c) => c.fulfilled)],
  ];

  return [
    panel(`AGENT // ${a.symbol}`, h('div', { class: 'grid2' },
      kv([
        ['SYMBOL', h('b', null, a.symbol)],
        ['CREDITS', h('b', { class: 'ok' }, cr(a.credits))],
        ['HEADQUARTERS', a.headquarters],
        ['FACTION', a.startingFaction],
      ]),
      kv([
        ['ACCOUNT', a.accountId || '—'],
        ['SHIPS', num(a.shipCount)],
        ['CONTRACTS', `${active.length} active / ${contracts.length} total`],
      ])),
    h('span', { class: 'inline' },
      act('REFRESH ALL', () => Promise.all([A.loadAgent(), A.loadShips(), A.loadContracts()]), { key: 'refresh-all' }))),
    panel('MISSION BRIEF', h('ol', { class: 'brief' }, steps.map(([t, done]) => h('li', { class: done ? 'done' : '' }, t)))),
    panel('FLEET SUMMARY', table([
      { t: 'SHIP', f: (s) => h('a', { href: `#/ship/${encodeURIComponent(s.symbol)}` }, s.symbol) },
      { t: 'ROLE', f: (s) => s.registration.role },
      { t: 'STATUS', f: statusTag },
      { t: 'AT', f: (s) => s.nav.waypointSymbol },
      { t: 'ETA/CD', f: (s) => (s.nav.status === 'IN_TRANSIT' && future(s.nav.route.arrival) ? countdown(s.nav.route.arrival, 'ARRIVED')
        : future(s.cooldown?.expiration) ? countdown(s.cooldown.expiration) : h('span', { class: 'dim' }, '—')) },
      { t: 'CARGO', f: (s) => bar(s.cargo.units, s.cargo.capacity, 10, { invert: true }) },
    ], ships, { empty: 'loading ships …', onRow: (s) => { location.hash = `#/ship/${encodeURIComponent(s.symbol)}`; } })),
  ];
}
