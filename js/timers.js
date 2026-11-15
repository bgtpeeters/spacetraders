// 1 Hz tick: live countdowns, UTC clock, auto-refresh ships on arrival, re-render when cooldowns expire.
import { store, changed } from './state.js';
import { refreshShip } from './actions.js';
import { dur, info, future } from './ui.js';

const nextTry = {};
let lastSig = '';

export function startTimers() {
  setInterval(tick, 1000);
  tick();
}

function tick() {
  const now = Date.now();
  for (const el of document.querySelectorAll('[data-until]')) {
    const left = (Date.parse(el.dataset.until) - now) / 1000;
    if (left > 0) { el.textContent = dur(left); el.classList.remove('done'); } else { el.textContent = el.dataset.done || 'READY'; el.classList.add('done'); }
  }
  const clock = document.getElementById('clock');
  if (clock) clock.textContent = new Date(now).toISOString().slice(11, 19) + 'Z';

  let sig = '';
  for (const s of Object.values(store.ships)) {
    const transit = s.nav.status === 'IN_TRANSIT';
    const arrived = transit && !future(s.nav.route.arrival);
    sig += `${s.symbol}:${transit && !arrived ? 1 : 0}${future(s.cooldown?.expiration) ? 1 : 0};`;
    if (arrived && (nextTry[s.symbol] || 0) <= now) {
      nextTry[s.symbol] = now + 5000;
      const sym = s.symbol;
      refreshShip(sym).then((ship) => {
        if (ship.nav.status !== 'IN_TRANSIT') info(`${sym} arrived at ${ship.nav.waypointSymbol} (${ship.nav.status})`, 'ok');
      }).catch(() => {});
    }
  }
  // A transit or cooldown just ended: re-render so buttons re-enable.
  if (sig !== lastSig) { if (lastSig) changed('timers'); lastSig = sig; }
}
