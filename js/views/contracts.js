import { store } from '../state.js';
import { h, panel, kv, cr, num, act, table, countdown, bar, select, isoShort, future, statusTag } from '../ui.js';
import * as A from '../actions.js';
import { needToken } from './agent.js';

const held = (ship, trade) => ship?.cargo?.inventory.find((i) => i.symbol === trade)?.units || 0;

function deliverForm(c, d) {
  const ships = Object.values(store.ships);
  const remaining = d.unitsRequired - d.unitsFulfilled;
  // Prefer a ship carrying the good, then one docked at the destination.
  const best = [...ships].sort((a, b) =>
    (held(b, d.tradeSymbol) - held(a, d.tradeSymbol))
    || ((b.nav.waypointSymbol === d.destinationSymbol) - (a.nav.waypointSymbol === d.destinationSymbol)))[0];
  const key = `${c.id}-${d.tradeSymbol}`;
  const shipSel = select(`dl-ship-${key}`, ships.map((s) => ({
    value: s.symbol,
    label: `${s.symbol}  [${s.nav.status}@${s.nav.waypointSymbol}]  holds ${held(s, d.tradeSymbol)}`,
  })), best?.symbol);
  const units = h('input', { name: `dl-units-${key}`, type: 'number', min: 1, value: Math.max(1, Math.min(remaining, held(best, d.tradeSymbol) || remaining)) });
  return h('div', { class: 'row' },
    shipSel, units,
    act('DELIVER', async () => {
      const sym = shipSel.value;
      const ship = store.ships[sym];
      if (ship?.nav.status === 'IN_ORBIT') await A.dock(sym);
      await A.deliverContract(c.id, sym, d.tradeSymbol, parseInt(units.value, 10));
    }, { key: `deliver-${key}`, disabled: remaining <= 0 }));
}

function contractPanel(c) {
  const t = c.terms;
  const done = t.deliver.every((d) => d.unitsFulfilled >= d.unitsRequired);
  const state = c.fulfilled ? h('span', { class: 'ok' }, 'FULFILLED')
    : c.accepted ? h('span', { class: 'accent' }, 'ACCEPTED')
      : future(c.deadlineToAccept ?? c.expiration) ? h('span', { class: 'warn' }, 'OFFERED') : h('span', { class: 'err' }, 'EXPIRED');
  const tools = h('span', { class: 'inline' },
    !c.accepted && act('ACCEPT', () => A.acceptContract(c.id), { key: `accept-${c.id}`, cls: 'go' }),
    c.accepted && !c.fulfilled && act('FULFILL', () => A.fulfillContract(c.id), { key: `fulfill-${c.id}`, cls: 'go', disabled: !done, title: done ? '' : 'deliver all goods first' }));

  return panel(`CONTRACT // ${c.id}`, [
    h('div', { class: 'grid2' },
      kv([
        ['STATE', state],
        ['FACTION', c.factionSymbol],
        ['TYPE', c.type],
      ]),
      kv([
        ['PAYMENT', `${cr(t.payment.onAccepted)} on accept + ${cr(t.payment.onFulfilled)} on fulfil`],
        !c.accepted && ['ACCEPT BY', [isoShort(c.deadlineToAccept ?? c.expiration), '  T−', countdown(c.deadlineToAccept ?? c.expiration, 'EXPIRED')]],
        ['DEADLINE', [isoShort(t.deadline), '  T−', countdown(t.deadline, 'PAST DUE')]],
      ])),
    h('br'),
    table([
      { t: 'GOOD', f: (d) => h('b', null, d.tradeSymbol) },
      { t: 'DESTINATION', f: (d) => d.destinationSymbol },
      { t: 'PROGRESS', f: (d) => bar(d.unitsFulfilled, d.unitsRequired, 16) },
      { t: 'FLEET HOLDS', f: (d) => num(Object.values(store.ships).reduce((n, s) => n + held(s, d.tradeSymbol), 0)), cls: 'num' },
      ...(c.accepted && !c.fulfilled ? [{ t: 'DELIVER', f: (d) => deliverForm(c, d) }] : []),
    ], t.deliver),
  ], tools);
}

export function contractsView() {
  if (!store.token) return needToken();
  const list = Object.values(store.contracts).sort((a, b) => (a.fulfilled - b.fulfilled) || (b.accepted - a.accepted));
  const ships = Object.values(store.ships);
  const docked = ships.filter((s) => s.nav.status === 'DOCKED');
  const negShip = select('neg-ship', ships.map((s) => ({ value: s.symbol, label: `${s.symbol} [${s.nav.status}@${s.nav.waypointSymbol}]` })), docked[0]?.symbol);

  return [
    h('div', { class: 'row' },
      act('REFRESH', A.loadContracts, { key: 'contracts' }),
      h('span', { class: 'dim' }, `${list.length} contract(s)`)),
    list.length ? list.map(contractPanel) : panel('CONTRACTS', h('div', { class: 'dim' }, 'no contracts — negotiate one below')),
    panel('NEGOTIATE // new contract', [
      h('p', { class: 'dim' }, 'Requires a ship docked at a waypoint with a faction presence (e.g. your HQ). One open contract at a time.'),
      h('div', { class: 'row' }, negShip,
        act('NEGOTIATE', async () => {
          const sym = negShip.value;
          if (!sym) throw new Error('no ship selected');
          if (store.ships[sym].nav.status === 'IN_ORBIT') await A.dock(sym);
          await A.negotiateContract(sym);
        }, { key: 'negotiate' }),
        negShip.value && store.ships[negShip.value] ? statusTag(store.ships[negShip.value]) : null),
    ]),
  ];
}
