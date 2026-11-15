// Game operations: call the API and fold results back into the store.
import * as api from './api.js';
import { store, changed, setToken, resetSession } from './state.js';
import { info, enc, sysOf, cr, num, hms } from './ui.js';

// ---------- loaders ----------
export async function loadStatus() {
  const r = await api.get('/', { auth: false });
  store.status = r; changed('status');
  return r;
}
export async function loadFactions() {
  store.factions = await api.getAll('/factions', { auth: false });
  changed('factions');
}
export async function loadAgent() {
  const r = await api.get('/my/agent');
  store.agent = r.data; changed('agent');
  return r.data;
}
export async function loadShips() {
  const list = await api.getAll('/my/ships');
  store.ships = Object.fromEntries(list.map((s) => [s.symbol, s]));
  changed('ships');
}
export async function loadContracts() {
  const list = await api.getAll('/my/contracts');
  store.contracts = Object.fromEntries(list.map((c) => [c.id, c]));
  changed('contracts');
}
export async function refreshShip(sym) {
  const r = await api.get(`/my/ships/${enc(sym)}`);
  store.ships[sym] = r.data; changed('ships');
  return r.data;
}
export async function loadWaypoints(system) {
  store.waypoints[system] = await api.getAll(`/systems/${enc(system)}/waypoints`);
  changed('waypoints');
}
export async function loadMarket(wp) {
  const r = await api.get(`/systems/${enc(sysOf(wp))}/waypoints/${enc(wp)}/market`);
  store.markets[wp] = { data: r.data, ts: new Date() };
  changed('markets');
  return r.data;
}

// ---------- session ----------
export async function connect(token) {
  resetSession();
  setToken(token);
  store.notice = null;
  await loadAgent();
  await Promise.all([loadShips(), loadContracts()]);
  info(`connected as ${store.agent.symbol} — ${Object.keys(store.ships).length} ship(s), ${cr(store.agent.credits)}`, 'ok');
}

export function logout() {
  setToken(null);
  resetSession();
  info('agent token removed from this browser');
}

export async function register({ accountToken, symbol, faction, email }) {
  const body = { symbol, faction };
  if (email) body.email = email;
  const r = await api.post('/register', body, { token: accountToken });
  const d = r.data;
  resetSession();
  setToken(d.token);
  store.notice = null;
  store.agent = d.agent;
  for (const s of d.ships || (d.ship ? [d.ship] : [])) store.ships[s.symbol] = s;
  if (d.contract) store.contracts[d.contract.id] = d.contract;
  changed('session');
  info(`agent ${d.agent.symbol} registered with ${d.faction?.symbol || faction}; HQ ${d.agent.headquarters}`, 'ok');
  // Registration returns a partial view; pull the full lists.
  loadShips().catch(() => {});
  loadContracts().catch(() => {});
  return d;
}

// ---------- ship actions ----------
function apply(sym, d) {
  const s = store.ships[sym];
  if (s) for (const k of ['nav', 'fuel', 'cargo', 'cooldown']) if (d[k]) s[k] = d[k];
  if (d.agent) store.agent = d.agent;
  if (d.contract) store.contracts[d.contract.id] = d.contract;
  changed('ships');
}

function logEvents(sym, events) {
  for (const e of events || []) info(`${sym} event ${e.symbol} on ${e.component}: ${e.description || e.name}`, 'warn');
}

async function shipPost(sym, action, body) {
  const r = await api.post(`/my/ships/${enc(sym)}/${action}`, body);
  apply(sym, r.data || {});
  logEvents(sym, r.data?.events);
  return r.data || {};
}

export async function orbit(sym) {
  await shipPost(sym, 'orbit');
  info(`${sym} → IN_ORBIT at ${store.ships[sym]?.nav.waypointSymbol}`);
}
export async function dock(sym) {
  await shipPost(sym, 'dock');
  info(`${sym} → DOCKED at ${store.ships[sym]?.nav.waypointSymbol}`);
}
export async function navigate(sym, waypointSymbol) {
  const d = await shipPost(sym, 'navigate', { waypointSymbol });
  const used = d.fuel?.consumed?.amount;
  info(`${sym} departing for ${waypointSymbol}${used != null ? `, fuel −${used}` : ''}, ETA ${hms(d.nav.route.arrival)}Z`, 'ok');
}
export async function setFlightMode(sym, flightMode) {
  const r = await api.patch(`/my/ships/${enc(sym)}/nav`, { flightMode });
  const d = r.data || {};
  // Older servers return the nav object itself.
  apply(sym, d.nav ? d : { nav: d });
  info(`${sym} flight mode ${flightMode}`);
}
export async function refuel(sym, { units, fromCargo } = {}) {
  const body = {};
  if (units) body.units = units;
  if (fromCargo) body.fromCargo = true;
  const d = await shipPost(sym, 'refuel', body);
  const t = d.transaction;
  info(`${sym} refueled to ${d.fuel.current}/${d.fuel.capacity}${t ? ` for ${cr(t.totalPrice)}` : ''}`, 'ok');
}
export async function extract(sym, survey) {
  const d = survey ? await shipPost(sym, 'extract/survey', survey) : await shipPost(sym, 'extract');
  const y = d.extraction?.yield;
  if (y) info(`${sym} extracted ${y.units} × ${y.symbol}${survey ? ` (survey ${survey.signature})` : ''}`, 'ok');
  return d;
}
export async function siphon(sym) {
  const d = await shipPost(sym, 'siphon');
  const y = d.siphon?.yield;
  if (y) info(`${sym} siphoned ${y.units} × ${y.symbol}`, 'ok');
}
export async function survey(sym) {
  const d = await shipPost(sym, 'survey');
  const wp = store.ships[sym].nav.waypointSymbol;
  const now = Date.now();
  store.surveys[wp] = [...(store.surveys[wp] || []).filter((s) => Date.parse(s.expiration) > now), ...(d.surveys || [])];
  changed('surveys');
  info(`${sym} surveyed ${wp}: ${d.surveys?.length || 0} result(s)`, 'ok');
}
export async function refine(sym, produce) {
  const d = await shipPost(sym, 'refine', { produce });
  const p = (d.produced || []).map((x) => `${x.units} × ${x.tradeSymbol}`).join(', ');
  const c = (d.consumed || []).map((x) => `${x.units} × ${x.tradeSymbol}`).join(', ');
  info(`${sym} refined ${c} → ${p}`, 'ok');
}
export async function jettison(sym, symbol, units) {
  await shipPost(sym, 'jettison', { symbol, units });
  info(`${sym} jettisoned ${units} × ${symbol}`, 'warn');
}
export async function sell(sym, symbol, units) {
  const d = await shipPost(sym, 'sell', { symbol, units });
  const t = d.transaction;
  info(`${sym} sold ${t.units} × ${t.tradeSymbol} @ ${cr(t.pricePerUnit)} = ${cr(t.totalPrice)}`, 'ok');
  return d;
}
export async function purchase(sym, symbol, units) {
  const d = await shipPost(sym, 'purchase', { symbol, units });
  const t = d.transaction;
  info(`${sym} bought ${t.units} × ${t.tradeSymbol} @ ${cr(t.pricePerUnit)} = ${cr(t.totalPrice)}`, 'ok');
}
export async function transfer(sym, tradeSymbol, units, target) {
  await shipPost(sym, 'transfer', { tradeSymbol, units, shipSymbol: target });
  info(`${sym} transferred ${units} × ${tradeSymbol} → ${target}`, 'ok');
  await refreshShip(target).catch(() => {});
}
export async function negotiateContract(sym) {
  const d = await shipPost(sym, 'negotiate/contract');
  info(`new contract offered: ${d.contract?.id} (${d.contract?.type})`, 'ok');
}

/** Sell a whole stack, split into chunks of the market's per-transaction trade volume. */
export async function sellAll(sym, symbol, units, tradeVolume) {
  let left = units;
  let total = 0;
  while (left > 0) {
    const n = Math.min(left, tradeVolume || left);
    const d = await sell(sym, symbol, n);
    total += d.transaction.totalPrice;
    left -= n;
  }
  if (units > (tradeVolume || units)) info(`${sym} sold ${num(units)} × ${symbol} total ${cr(total)}`, 'ok');
}

// ---------- contracts ----------
export async function acceptContract(id) {
  const r = await api.post(`/my/contracts/${enc(id)}/accept`);
  apply(null, r.data);
  info(`contract ${id} accepted (+${cr(r.data.contract.terms.payment.onAccepted)})`, 'ok');
}
export async function deliverContract(id, shipSymbol, tradeSymbol, units) {
  const r = await api.post(`/my/contracts/${enc(id)}/deliver`, { shipSymbol, tradeSymbol, units });
  apply(shipSymbol, r.data);
  info(`${shipSymbol} delivered ${units} × ${tradeSymbol} to contract ${id}`, 'ok');
}
export async function fulfillContract(id) {
  const r = await api.post(`/my/contracts/${enc(id)}/fulfill`);
  apply(null, r.data);
  info(`contract ${id} fulfilled (+${cr(r.data.contract.terms.payment.onFulfilled)})`, 'ok');
}
