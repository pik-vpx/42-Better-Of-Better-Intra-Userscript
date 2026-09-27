# 42 Bangkok Cluster & Friends — Userscript

A Tampermonkey userscript that adds a live **Bangkok TH cluster map**, a cross-campus **Friends presence** panel, and a per-batch **leaderboard** to the 42 intranet (meta, old profile, and profile-v3 pages).

> Requires the **[Better Intra](https://betterintra.com/)** extension ([source](https://github.com/nicopasla/better-intra), Firefox / Chrome / Brave) — this script builds on top of it.

## Features

- **Bangkok TH tab** — live Zone/Table/Chair map of campus 33, total online counter, friend seats highlighted, relative login time (`2h 14m`), batch badges (`login #9`)
- **Friends tab** — track any 42 logins across all campuses, online host + offline `seen X ago`, avatars, per-card level
- **Top tab** — per-batch leaderboard (online + offline), sorted **Level** or **Active 30d** high → low, `All | Online | Offline` filter, paste-a-promo roster import
- **profile-v3 support** — floating `TH` button + modal that survives SPA navigation, `Esc` to close

## Install

1. Install a userscript manager: [Tampermonkey](https://www.tampermonkey.net/) (Chrome / Firefox / Brave).
2. Install [Better Intra](https://betterintra.com/).
3. Click the script file below and hit **Raw → Install**:
   - [`Bangkok-Finder.user.js`](./Bangkok-Finder.user.js)
4. Open https://meta.intra.42.fr/clusters — new `Bangkok TH`, `Friends`, and `Top` tabs appear. On profile pages use the floating `TH` button.

Updates are automatic via `@updateURL` — Tampermonkey checks the raw file on GitHub.

## Usage tips

- **Friends → Manage list**: paste logins separated by spaces, commas, or new lines, then Save.
- **Top → Save roster**: paste a full promo list once to rank offline students too (stored locally, nothing leaves your browser).
- All caches (levels, batches, seen-times) live in `localStorage`; UI paints instantly and enriches in the background.

## Fork & contribute

Contributions welcome — especially new campuses, stats, and profile-v3 fixes.

1. Fork this repo (top-right **Fork** button).
2. Clone your fork, edit `Bangkok-Finder.user.js`, verify syntax:
   ```bash
   node --check Bangkok-Finder.user.js
   ```
3. Commit on a branch and open a **Pull Request** against `main` describing what you tested on intra.

Please keep changes to the single userscript file, avoid new `@connect` hosts unless needed, and don't break the no-build-step setup (plain JS, no bundler).
