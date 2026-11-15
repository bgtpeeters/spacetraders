import { store } from '../state.js';
import { h, panel, act, table, statusTag, bar, countdown, future } from '../ui.js';
import * as A from '../actions.js';
import { needToken } from './agent.js';

export function fleetView() {
  if (!store.token) return needToken();
  const ships = Object.values(store.ships).sort((a, b) => a.symbol.localeCompare(b.symbol, 'en', { numeric: true }));
  return panel(`FLEET // ${ships.length} ship(s)`, table([
    { t: 'SHIP', f: (s) => h('a', { href: `#/ship/${encodeURIComponent(s.symbol)}` }, s.symbol) },
    { t: 'ROLE', f: (s) => s.registration.role },
    { t: 'FRAME', f: (s) => s.frame?.symbol?.replace('FRAME_', '') },
    { t: 'STATUS', f: statusTag },
    { t: 'LOCATION', f: (s) => s.nav.waypointSymbol },
    { t: 'ROUTE / ETA', f: (s) => (s.nav.status === 'IN_TRANSIT' && future(s.nav.route.arrival)
      ? [`${s.nav.route.origin.symbol} → ${s.nav.route.destination.symbol} `, countdown(s.nav.route.arrival, 'ARRIVED')]
      : h('span', { class: 'dim' }, '—')) },
    { t: 'MODE', f: (s) => s.nav.flightMode },
    { t: 'FUEL', f: (s) => bar(s.fuel.current, s.fuel.capacity, 10) },
    { t: 'CARGO', f: (s) => bar(s.cargo.units, s.cargo.capacity, 10, { invert: true }) },
    { t: 'COOLDOWN', f: (s) => (future(s.cooldown?.expiration) ? countdown(s.cooldown.expiration) : h('span', { class: 'dim' }, 'ready')) },
  ], ships, { empty: 'no ships loaded', onRow: (s) => { location.hash = `#/ship/${encodeURIComponent(s.symbol)}`; } }),
  act('REFRESH', A.loadShips, { key: 'ships' }));
}
