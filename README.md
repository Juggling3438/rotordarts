# Rotordarts

A darts scorer that runs entirely in the browser (HTML, CSS, vanilla JS, ES modules). There's no backend, and it can be hosted on GitHub Pages.

## Structure

```
index.html                 # the app
src/
  app.js                   # wires engine, storage and UI together
  engine/darts-engine.js   # pure game logic (no DOM, no storage)
  storage/players.js       # player + running game persistence (localStorage)
  ui/dartboard.js|.css     # clickable SVG dartboard
  ui/player-manager.js|.css# add / rename / remove / reorder / select players
  ui/rules-menu.js         # 301/501, double/straight out
  ui/scoreboard.js         # active players, scores, current darts, average
  ui/app.css               # layout
demo/
  dartboard.html           # standalone dartboard playground
  players.html             # standalone player management playground
tests/
  index.html               # browser test runner
  harness.js               # minimal test harness
  darts-engine.test.js     # engine unit tests
  players.test.js          # storage unit tests
  dartboard.test.js        # hit detection + DOM tests
```

## Run locally

ES modules need an HTTP server (not `file://`):

```sh
python3 -m http.server 8000
```

- App: http://localhost:8000/
- Tests: http://localhost:8000/tests/
- Dartboard demo: http://localhost:8000/demo/dartboard.html
