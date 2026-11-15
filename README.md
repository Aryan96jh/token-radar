[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/Aryan96jh/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/Aryan96jh/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

# Token Radar

A token launch radar: it ranks protocols that record no token yet by an
implied value, and gives each one a concrete eight-step farm plan. Built for
the [make.fun `token-radar-01` bounty](https://make.fun/bounty/token-radar-01).

## Run

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

`main.ts` reads the snapshot (default `/input/snapshot.json`), writes
`board.json` and `data.js` to the output directory, copies `dashboard/` and
`screenshots/` there, and writes `dossier.json` from them. Two runs write
identical bytes.

## Model (radar-2)

```
implied = TVL × base multiple × growth × maturity × breadth
```

- **Base multiple** by category: derivatives/perpetuals 0.40, lending 0.35,
  DEXs 0.30, yield 0.25, RWA 0.20, everything else 0.25. (Bridge and
  liquid-staking categories carry no board row: wrapped, staked and bridged
  products of tokens that already trade are excluded from the board.)
- **Growth**: 1 + clamped 7-day TVL change × 0.8 (clamped to −60%…+120%).
- **Maturity**: 0.5 + up to 0.5 for up to four years tracked.
- **Breadth**: 1 + 0.05 per extra chain, up to 1.20.
- Implied value is capped at twice TVL and rounded to whole dollars.

The board holds every rankable pre-token protocol in the snapshot (no token
recorded, not a CEX, not a versioned fork) — the watchlist is a floor, not
a ceiling. Protocols whose token already trades are shown apart, on the Live
tokens tab, with their market values.

## Layout

- `main.ts` — entrypoint
- `lib/model.ts` — value model, ranking, farm plans
- `dashboard/` — the static page (`index.html`, `app.css`, `app.js`)
- `screenshots/` — board, detail and filtered views of the dashboard
- `vendor/makefun-board.ts` — make.fun's dossier library (house code)

Snapshot: DefiLlama protocols, fetched 2026-11-14. Not financial advice.
