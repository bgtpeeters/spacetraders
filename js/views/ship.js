import { store, lsGet, lsSet } from '../state.js';
import {
  h, panel, kv, cr, num, act, table, countdown, bar, select, pill, ensure, future,
  shipStatus, hasMount, hasModule, isoShort,
} from '../ui.js';
import * as A from '../actions.js';
import { needToken } from './agent.js';

const AUTO_KEY = 'stconsole.autoDock';
const autoOn = () => lsGet(AUTO_KEY) !== '0';
const FLIGHT_MODES = ['CRUISE', 'BURN', 'DRIFT', 'STEALTH'];
const REFINE_TARGETS = ['IRON', 'COPPER', 'SILVER', 'GOLD', 'ALUMINUM', 'PLATINUM', 'URANIUM', 'MERITIUM', 'FUEL'];
const TRAIT_TAGS = { MARKETPLACE: 'MKT', SHIPYARD: 'YARD', COMMON_METAL_DEPOSITS: 'METAL', PRECIOUS_METAL_DEPOSITS: 'PRECIOUS', RARE_METAL_DEPOSITS: 'RARE', MINERAL_DEPOSITS: 'MINERAL', ICE_CRYSTALS: 'ICE', EXPLOSIVE_GASES: 'GAS', STRIPPED: 'STRIPPED', UNCHARTED: 'UNCHARTED' };
let wpTableOpen = false;

// Automatic state transitions so a single click does what the player means.
async function wantDock(sym) { if (autoOn() && store.ships[sym].nav.status === 'IN_ORBIT') await A.dock(sym); }
async function wantOrbit(sym) { if (autoOn() && store.ships[sym].nav.status === 'DOCKED') await A.orbit(sym); }

function fuelCost(dist, mode) {
  const d = Math.round(dist);
  if (mode === 'DRIFT') return 1;
  if (mode === 'BURN') return Math.max(2, 2 * d);
  return Math.max(1, d);
}

function here(s) {
  const wps = store.waypoints[s.nav.systemSymbol];
  return wps?.find((w) => w.symbol === s.nav.waypointSymbol) || s.nav.route?.destination;
}

function traitTags(w) {
  return (w.traits || []).filter((t) => TRAIT_TAGS[t.symbol]).map((t) => pill(TRAIT_TAGS[t.symbol], t.symbol === 'MARKETPLACE' || t.symbol === 'SHIPYARD'));
}

export function shipView(sym) {
  if (!store.token) return needToken();
  const s = store.ships[sym];
  if (!s) {
    return panel('SHIP', [h('div', { class: 'dim' }, Object.keys(store.ships).length ? `unknown ship ${sym}` : 'loading fleet …'), h('a', { href: '#/fleet' }, '→ fleet')]);
  }
  const nav = s.nav;
  const system = nav.systemSymbol;
  if (!store.waypoints[system]) ensure(`wps-${system}`, () => A.loadWaypoints(system));
  const wps = store.waypoints[system] || [];
  const loc = here(s);
  const st = shipStatus(s);
  const transit = nav.status === 'IN_TRANSIT' && future(nav.route.arrival);
  const docked = nav.status === 'DOCKED';
  const orbiting = nav.status === 'IN_ORBIT';
  const cooling = future(s.cooldown?.expiration);
  const k = (a) => `${sym}:${a}`;
  const atMarket = (loc?.traits || []).some((t) => t.symbol === 'MARKETPLACE');
  const market = store.markets[nav.waypointSymbol];

  // ---------- overview ----------
  const overview = panel(`SHIP // ${s.symbol}`, h('div', { class: 'grid2' },
    kv([
      ['NAME', `${s.registration.name} · ${s.registration.role}`],
      ['FRAME', `${s.frame?.name || '—'} (${Math.round((s.frame?.condition ?? 1) * 100)}% cond.)`],
      ['STATUS', h('span', { class: `st ${st.cls}` }, st.label)],
      ['LOCATION', [h('b', null, nav.waypointSymbol), loc?.type ? `  ${loc.type}` : '', ' ', loc ? traitTags(loc) : null]],
      transit && ['ROUTE', `${nav.route.origin.symbol} → ${nav.route.destination.symbol}`],
      transit && ['ETA', [countdown(nav.route.arrival, 'ARRIVED'), h('span', { class: 'dim' }, `  (${isoShort(nav.route.arrival)})`)]],
    ]),
    kv([
      ['FUEL', bar(s.fuel.current, s.fuel.capacity, 16)],
      ['CARGO', bar(s.cargo.units, s.cargo.capacity, 16, { invert: true })],
      ['COOLDOWN', cooling ? countdown(s.cooldown.expiration) : h('span', { class: 'dim' }, 'ready')],
      ['FLIGHT MODE', nav.flightMode],
      ['ENGINE', `${s.engine?.name || '—'} · speed ${s.engine?.speed ?? '—'}`],
      ['CREW', s.crew ? `${s.crew.current}/${s.crew.capacity} · morale ${s.crew.morale}` : '—'],
    ])),
  act('REFRESH', () => A.refreshShip(sym), { key: k('refresh') }));

  // ---------- controls ----------
  const auto = h('input', { type: 'checkbox', name: 'auto-dock', checked: autoOn(), onchange: (e) => lsSet(AUTO_KEY, e.target.checked ? '1' : '0') });
  const fm = select('flight-mode', FLIGHT_MODES, nav.flightMode);
  const canMine = hasMount(s, 'MOUNT_MINING_LASER');
  const canSurvey = hasMount(s, 'MOUNT_SURVEYOR');
  const canSiphon = hasMount(s, 'MOUNT_GAS_SIPHON');
  const fuelFromCargo = s.cargo.inventory.some((i) => i.symbol === 'FUEL');

  const controls = panel('CONTROLS', [
    h('div', { class: 'row' },
      act('ORBIT', () => A.orbit(sym), { key: k('orbit'), disabled: !docked }),
      act('DOCK', () => A.dock(sym), { key: k('dock'), disabled: !orbiting }),
      act('REFUEL', async () => { await wantDock(sym); await A.refuel(sym); }, { key: k('refuel'), disabled: transit || !s.fuel.capacity, title: 'requires dock at a market selling FUEL' }),
      fuelFromCargo && act('REFUEL FROM CARGO', async () => { await wantDock(sym); await A.refuel(sym, { fromCargo: true }); }, { key: k('refuel-c'), disabled: transit }),
      canMine && act('EXTRACT', async () => { await wantOrbit(sym); await A.extract(sym); }, { key: k('extract'), cls: 'go', disabled: transit || cooling }),
      canSurvey && act('SURVEY', async () => { await wantOrbit(sym); await A.survey(sym); }, { key: k('survey'), disabled: transit || cooling }),
      canSiphon && act('SIPHON', async () => { await wantOrbit(sym); await A.siphon(sym); }, { key: k('siphon'), cls: 'go', disabled: transit || cooling })),
    h('div', { class: 'row' },
      h('span', { class: 'dim' }, 'FLIGHT MODE'), fm,
      act('SET', () => A.setFlightMode(sym, fm.value), { key: k('fm') }),
      h('span', { class: 'spacer' }),
      h('label', { class: 'dim' }, auto, ' auto dock/orbit before actions')),
  ]);

  // ---------- navigation ----------
  const x0 = loc?.x ?? 0, y0 = loc?.y ?? 0;
  const withDist = wps.map((w) => ({ ...w, dist: Math.hypot(w.x - x0, w.y - y0) })).sort((a, b) => a.dist - b.dist);
  const dest = h('input', { name: 'nav-dest', list: `wp-list-${system}`, class: 'w-wide', placeholder: `${system}-XX` , autocomplete: 'off' });
  const datalist = h('datalist', { id: `wp-list-${system}` },
    withDist.filter((w) => w.symbol !== nav.waypointSymbol).map((w) => h('option', { value: w.symbol }, `${w.type} d=${w.dist.toFixed(0)} ≈${fuelCost(w.dist, nav.flightMode)} fuel`)));
  const goTo = async (wp) => {
    if (!wp) throw new Error('destination waypoint required');
    await wantOrbit(sym);
    await A.navigate(sym, wp.trim().toUpperCase());
  };
  const wpTable = h('details', { open: wpTableOpen, ontoggle: (e) => { wpTableOpen = e.target.open; } },
    h('summary', null, `SYSTEM ${system} — ${wps.length} waypoint(s)`),
    table([
      { t: 'WAYPOINT', f: (w) => h('b', null, w.symbol) },
      { t: 'TYPE', f: (w) => w.type },
      { t: 'DIST', f: (w) => w.dist.toFixed(1), cls: 'num' },
      { t: `FUEL (${nav.flightMode})`, f: (w) => (w.symbol === nav.waypointSymbol ? '—' : fuelCost(w.dist, nav.flightMode)), cls: 'num' },
      { t: 'TRAITS', f: traitTags },
      { t: '', f: (w) => (w.symbol === nav.waypointSymbol ? h('span', { class: 'dim' }, 'here')
        : act('GO', () => goTo(w.symbol), { key: k('nav'), disabled: transit })) },
    ], withDist, { empty: 'loading waypoints …', rowClass: (w) => (w.symbol === nav.waypointSymbol ? 'here' : ''), onRow: (w) => { dest.value = w.symbol; } }));

  const navigation = panel('NAVIGATE', [
    h('div', { class: 'row' },
      dest, datalist,
      act('NAVIGATE', () => goTo(dest.value), { key: k('nav'), cls: 'go', disabled: transit }),
      h('span', { class: 'dim' }, `fuel ${s.fuel.current}/${s.fuel.capacity} · mode ${nav.flightMode}`)),
    wpTable,
  ]);

  // ---------- cargo ----------
  const inv = s.cargo.inventory;
  const others = Object.values(store.ships).filter((o) => o.symbol !== sym);
  const goodsNames = inv.map((i) => i.symbol);
  const cgSym = select('cg-sym', goodsNames.length ? goodsNames : ['—'], goodsNames[0]);
  const cgUnits = h('input', { name: 'cg-units', type: 'number', min: 1, value: inv[0]?.units || 1 });
  const cgTarget = select('cg-target', others.length ? others.map((o) => ({ value: o.symbol, label: `${o.symbol} @${o.nav.waypointSymbol}` })) : [{ value: '', label: '(no other ship)' }],
    others.find((o) => o.nav.waypointSymbol === nav.waypointSymbol)?.symbol);
  const units = () => { const n = parseInt(cgUnits.value, 10); if (!(n > 0)) throw new Error('units must be > 0'); return n; };
  const mGood = (sy) => market?.data.tradeGoods?.find((g) => g.symbol === sy);

  const cargo = panel(`CARGO // ${s.cargo.units}/${s.cargo.capacity}`, [
    table([
      { t: 'GOOD', f: (i) => h('b', null, i.symbol) },
      { t: 'NAME', f: (i) => i.name },
      { t: 'UNITS', f: (i) => num(i.units), cls: 'num' },
      { t: 'BID HERE', f: (i) => { const g = mGood(i.symbol); return g ? cr(g.sellPrice) : h('span', { class: 'dim' }, '—'); }, cls: 'num' },
      { t: '', f: (i) => h('span', { class: 'inline' },
        act('SELL ALL', async () => { await wantDock(sym); await A.sellAll(sym, i.symbol, i.units, mGood(i.symbol)?.tradeVolume); }, { key: k(`sell-${i.symbol}`), disabled: transit }),
        act('JETTISON', () => A.jettison(sym, i.symbol, i.units), { key: k(`jet-${i.symbol}`), cls: 'danger', disabled: transit, confirm: `Jettison ${i.units} × ${i.symbol}? This destroys the cargo.` })) },
    ], inv, { empty: 'cargo hold empty' }),
    inv.length > 0 && h('div', { class: 'row' },
      cgSym, cgUnits,
      act('SELL', async () => { await wantDock(sym); await A.sell(sym, cgSym.value, units()); }, { key: k('sell'), disabled: transit }),
      act('JETTISON', () => A.jettison(sym, cgSym.value, units()), { key: k('jet'), cls: 'danger', disabled: transit }),
      h('span', { class: 'dim' }, '→'), cgTarget,
      act('TRANSFER', () => { if (!cgTarget.value) throw new Error('no target ship'); return A.transfer(sym, cgSym.value, units(), cgTarget.value); }, { key: k('xfer'), disabled: transit || !others.length })),
  ]);

  // ---------- market at current waypoint ----------
  let marketPanel = null;
  if (atMarket && !transit) {
    const goods = market?.data.tradeGoods;
    const buySym = h('input', { name: 'buy-sym', list: `buy-list-${sym}`, placeholder: 'TRADE_SYMBOL', autocomplete: 'off' });
    const buyUnits = h('input', { name: 'buy-units', type: 'number', min: 1, value: 1 });
    marketPanel = panel(`MARKET // ${nav.waypointSymbol}`, [
      !market && h('p', { class: 'dim' }, 'Marketplace here. Query it to see live prices (prices are visible while a ship is present).'),
      market && !goods && h('p', { class: 'dim' }, 'No ship present — only the list of imports/exports is visible.'),
      market && goods && [
        table([
          { t: 'GOOD', f: (g) => h('b', null, g.symbol) },
          { t: 'TYPE', f: (g) => g.type },
          { t: 'SUPPLY', f: (g) => g.supply },
          { t: 'ACTIVITY', f: (g) => g.activity || '—' },
          { t: 'VOL', f: (g) => num(g.tradeVolume), cls: 'num' },
          { t: 'ASK (buy)', f: (g) => cr(g.purchasePrice), cls: 'num' },
          { t: 'BID (sell)', f: (g) => cr(g.sellPrice), cls: 'num' },
          { t: 'HELD', f: (g) => num(inv.find((i) => i.symbol === g.symbol)?.units || 0), cls: 'num' },
        ], goods, { onRow: (g) => { buySym.value = g.symbol; } }),
        h('datalist', { id: `buy-list-${sym}` }, goods.map((g) => h('option', { value: g.symbol }))),
        h('div', { class: 'row' }, h('span', { class: 'dim' }, 'BUY'), buySym, buyUnits,
          act('PURCHASE', async () => {
            const n = parseInt(buyUnits.value, 10);
            if (!buySym.value || !(n > 0)) throw new Error('good and units required');
            await wantDock(sym);
            await A.purchase(sym, buySym.value.trim().toUpperCase(), n);
          }, { key: k('buy'), disabled: !goods.length }),
          h('span', { class: 'dim' }, `credits ${cr(store.agent?.credits)} · free ${s.cargo.capacity - s.cargo.units}`)),
        h('div', { class: 'dim' }, `snapshot ${isoShort(market.ts)}`),
      ],
    ], act(market ? 'REQUERY' : 'QUERY MARKET', () => A.loadMarket(nav.waypointSymbol), { key: k('market') }));
  }

  // ---------- surveys ----------
  const surveys = (store.surveys[nav.waypointSymbol] || []).filter((sv) => future(sv.expiration));
  const surveyPanel = (canSurvey || surveys.length) && panel(`SURVEYS // ${nav.waypointSymbol}`, table([
    { t: 'SIGNATURE', f: (sv) => sv.signature },
    { t: 'SIZE', f: (sv) => sv.size },
    { t: 'DEPOSITS', f: (sv) => {
      const c = {}; for (const d of sv.deposits) c[d.symbol] = (c[d.symbol] || 0) + 1;
      return Object.entries(c).map(([n, x]) => pill(`${n}×${x}`, true));
    } },
    { t: 'EXPIRES', f: (sv) => countdown(sv.expiration, 'EXPIRED') },
    { t: '', f: (sv) => canMine && act('EXTRACT', async () => { await wantOrbit(sym); await A.extract(sym, sv); }, { key: k('extract'), cls: 'go', disabled: transit || cooling }) },
  ], surveys, { empty: 'no active surveys for this waypoint' }));

  // ---------- refinery ----------
  const canRefine = hasModule(s, 'MODULE_ORE_REFINERY') || hasModule(s, 'MODULE_FUEL_REFINERY');
  const ref = select('refine', REFINE_TARGETS, 'IRON');
  const refinePanel = canRefine && panel('REFINERY', h('div', { class: 'row' }, ref,
    act('REFINE', () => A.refine(sym, ref.value), { key: k('refine'), disabled: transit || cooling })));

  // ---------- fittings ----------
  const fittings = panel('FITTINGS', h('div', { class: 'grid2' },
    h('div', null, h('div', { class: 'dim' }, 'MOUNTS'), (s.mounts || []).length ? s.mounts.map((m) => h('div', null, `· ${m.name}`, m.strength ? h('span', { class: 'dim' }, ` (str ${m.strength})`) : null)) : h('div', { class: 'dim' }, 'none')),
    h('div', null, h('div', { class: 'dim' }, 'MODULES'), (s.modules || []).length ? s.modules.map((m) => h('div', null, `· ${m.name}`)) : h('div', { class: 'dim' }, 'none'))));

  return [
    h('div', { class: 'crumbs' }, h('a', { href: '#/fleet' }, 'fleet'), ' / ', h('b', null, s.symbol)),
    overview, controls, navigation, cargo, marketPanel, surveyPanel, refinePanel, fittings,
  ];
}
