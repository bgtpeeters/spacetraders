# ST-Console

A browser client for the [SpaceTraders](https://spacetraders.io) API (v2), styled like an engineering
workbench. It is plain HTML/CSS/ES modules with no build step and no backend: the browser calls
`https://api.spacetraders.io/v2` directly (the API allows CORS from any origin).

## Run

ES modules don't load from `file://`, so serve the folder:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Play

1. **Session**: paste an existing agent token, or register a new agent with an account token from
   [my.spacetraders.io](https://my.spacetraders.io). The agent token is stored in `localStorage`.
   Servers reset weekly. After a reset the token gets a 401 and the client sends you back to registration.
2. **Contracts**: accept the starting contract.
3. **Ship**: navigate to an asteroid (`GO` in the waypoint table), `EXTRACT`/`SURVEY`, query the market,
   `SELL ALL` (split automatically into chunks of the market's trade volume), fly back, then deliver and fulfill.
   "auto dock/orbit" docks or undocks the ship as each action needs.

Every request appears in the bottom log. Click a line to see its raw JSON in the inspector.

## Layout

| File | Role |
|---|---|
| `js/api.js` | fetch wrapper: bearer auth, token-bucket limiter (2 req/s, burst 10 client-side), 429 retry using `Retry-After`, log events |
| `js/state.js` | store + pub/sub, guarded localStorage |
| `js/actions.js` | game operations; fold API responses back into the store |
| `js/timers.js` | 1 Hz tick: countdowns, auto-refresh on arrival, re-render when cooldowns expire |
| `js/log.js` | request log + JSON inspector |
| `js/views/*` | status, session, agent, contracts, fleet, ship panels |
| `js/main.js` | header, nav tree, hash router, re-render (keeps typed input values) |

## Roadmap

- M5: system/waypoint browser, markets across the system, shipyards and ship purchase, jump gates, jump/warp, scans, charts
- M6: command line (`nav SHIP WP`), keyboard shortcuts, mounts/modules install, repair/scrap, construction supply
