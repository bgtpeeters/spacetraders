import { store } from '../state.js';
import { h, panel, kv, table, num, cr, countdown, act, ensure, isoShort } from '../ui.js';
import { loadStatus } from '../actions.js';

export function statusView() {
  const s = store.status;
  if (!s) {
    ensure('status', loadStatus);
    return panel('SERVER STATUS', h('div', { class: 'dim' }, 'querying GET / …'));
  }
  const lb = s.leaderboards || {};
  return [
    panel('SERVER STATUS', h('div', { class: 'grid2' },
      kv([
        ['STATUS', h('span', { class: 'ok' }, s.status)],
        ['VERSION', s.version],
        ['LAST RESET', s.resetDate],
        ['NEXT RESET', s.serverResets ? [isoShort(s.serverResets.next), '  T−', countdown(s.serverResets.next, 'NOW')] : '—'],
        ['FREQUENCY', s.serverResets?.frequency],
        ['MARKET TICK', isoShort(s.health?.lastMarketUpdate)],
      ]),
      kv([
        ['AGENTS', num(s.stats?.agents)],
        ['ACCOUNTS', num(s.stats?.accounts)],
        ['SHIPS', num(s.stats?.ships)],
        ['SYSTEMS', num(s.stats?.systems)],
        ['WAYPOINTS', num(s.stats?.waypoints)],
      ])), act('REFRESH', loadStatus, { key: 'status' })),
    h('div', { class: 'grid2' },
      panel('LEADERBOARD // CREDITS', table([
        { t: '#', f: (r) => r.i, cls: 'num' },
        { t: 'AGENT', f: (r) => r.agentSymbol },
        { t: 'CREDITS', f: (r) => cr(r.credits), cls: 'num' },
      ], (lb.mostCredits || []).map((r, i) => ({ ...r, i: i + 1 })))),
      panel('LEADERBOARD // CHARTS', table([
        { t: '#', f: (r) => r.i, cls: 'num' },
        { t: 'AGENT', f: (r) => r.agentSymbol },
        { t: 'CHARTS', f: (r) => num(r.chartCount), cls: 'num' },
      ], (lb.mostSubmittedCharts || []).map((r, i) => ({ ...r, i: i + 1 }))))),
    panel('ANNOUNCEMENTS', (s.announcements || []).map((a) =>
      h('div', { class: 'notice' }, h('b', null, a.title), h('div', { class: 'dim' }, a.body)))),
  ];
}
