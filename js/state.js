// Global store + tiny pub/sub. No framework: views re-render from `store` on 'change'.

const listeners = {};
export const bus = {
  on(evt, fn) {
    (listeners[evt] ??= []).push(fn);
    return () => { listeners[evt] = listeners[evt].filter((f) => f !== fn); };
  },
  emit(evt, data) {
    for (const fn of listeners[evt] || []) {
      try { fn(data); } catch (e) { console.error(`listener for ${evt} failed`, e); }
    }
  },
};

// localStorage can throw (private mode, blocked storage) — always guard it.
export function lsGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
export function lsSet(key, val) { try { localStorage.setItem(key, val); } catch { /* ignore */ } }
export function lsDel(key) { try { localStorage.removeItem(key); } catch { /* ignore */ } }

const TOKEN_KEY = 'stconsole.agentToken';

export const store = {
  token: lsGet(TOKEN_KEY),
  agent: null,
  ships: {},        // symbol -> Ship
  contracts: {},    // id -> Contract
  status: null,     // GET / payload
  factions: null,   // [Faction]
  waypoints: {},    // systemSymbol -> [Waypoint]
  markets: {},      // waypointSymbol -> { data: Market, ts: Date }
  surveys: {},      // waypointSymbol -> [Survey]
  notice: null,     // persistent banner on the session page
};

export function changed(what) { bus.emit('change', what); }

export function setToken(token) {
  store.token = token || null;
  if (token) lsSet(TOKEN_KEY, token); else lsDel(TOKEN_KEY);
  changed('token');
}

export function resetSession() {
  store.agent = null;
  store.ships = {};
  store.contracts = {};
  store.markets = {};
  store.surveys = {};
  changed('session');
}
