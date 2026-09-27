# bangkok cluster & friends 👀

your 42 intra, but actually usable.

live cluster map + friend tracking + leaderboard, right inside intra. no new tabs, no refresh spam.

> needs [**Better Intra**](https://betterintra.com/) ([source](https://github.com/nicopasla/better-intra)) to work — firefox / chrome / brave all good.

## what's inside

- 🗺️ **bangkok th** — live zone/table/chair map, who's online, friend seats lit up, `seen 2h ago`, batch tags (`login #9`)
- 👥 **friends** — stalk your people across every campus. online host or last-seen time, zero effort
- 🏆 **leaderboard** — per-batch rankings, level or last-30-days grind. filter by campus (bangkok default, or all like peerfinder), pick your batch, cap the load
- ⚡ **fast by default** — renders instantly from cache, loads details only when you ask. stop button included for when intra is being intra

## install (2 min)

1. get [tampermonkey](https://www.tampermonkey.net/)
2. get [better intra](https://betterintra.com/)
3. open [`Bangkok-Finder.user.js`](./Bangkok-Finder.user.js) → **raw → install**
4. go to [clusters](https://meta.intra.42.fr/clusters) — new tabs just appear. on profiles, hit the floating `TH` button

auto-updates itself. touch grass, not settings.

## pro tips

- friends → **manage list**: dump logins in, separated however. it figures it out
- leaderboard → **save roster**: paste your whole promo once, rank everybody including the ghosts
- everything lives in your `localStorage`. nothing leaves your browser 🤙

## wanna contribute?

forks > issues. fr.

```bash
git clone <your-fork>
# edit Bangkok-Finder.user.js
node --check Bangkok-Finder.user.js   # must pass
```

open a PR against `main` and say what you tested on intra. one file, plain js, no bundler, no new `@connect` hosts unless you really need them.
