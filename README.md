[![make.fun](https://make.fun/badge/token-radar-01.svg)](https://make.fun/c/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/aboybro/velocity-radar/rank.svg)](https://make.fun/c/token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/aboybro/velocity-radar/reward.svg)](https://make.fun/c/token-radar-01)

# Velocity Radar — pre-token protocols ranked by launch velocity

An entry for make.fun's [token-radar-01](https://make.fun/bounty/token-radar-01) bounty: a token launch
radar that reads a frozen DefiLlama snapshot of 758 protocols, ranks the 178 pre-token ones by
**launch velocity** — how fast their TVL is moving right now — and shows a reader how to farm each one.

## How it differs from Pulse Radar

The sibling entry [Pulse Radar](https://github.com/aboybro/pulse-radar) anchors implied value in each
category's live-token market (median mcap/TVL per category). Velocity Radar does the opposite: it
ignores category anchors entirely and prices a protocol on its **velocity** — its 7-day TVL growth —
plus how long it has run with no token recorded (its runway). A protocol surging +25% in a week prices
higher than a bigger one standing still; a cooling protocol is marked down even if its TVL is large.
The farm plans follow the same idea: a SURGE protocol's plan front-loads activity into the first two
weeks, a FADING one's spreads it over two months.

## The model (velocity-1)

Implied value follows only from the snapshot's own figures — TVL, 7-day growth and age — never from
a hand-kept list of names:

```
g            = clamp(change_7d, -50%, +100%)   (a 4,448% week is capped: one wild week must not price a protocol)
velocity     = g / 7                           (per cent of TVL per day — the radar's headline number)
momentum     = 1 + (g / 100) x 1.5             (velocity is the dominant driver: 0.25x at -50%, 2.50x at +100%)
runway       = 0.75 + min(age_days, 1460) / 1460 x 0.45
surge        = 1.15 when g >= +25%, 0.85 when g <= -25%, else 1.00
implied      = TVL x 0.22 x momentum x runway x surge
```

Tiers from the same clamped growth: **SURGE** ≥ +25%, **HOT** +10–25%, **STEADY** ±10%,
**COOLING** −10–25%, **FADING** ≤ −25%.

The board covers all 40 watchlist protocols (the floor, never the ceiling) plus 138 early pre-token
protocols below the floor. Bridges, liquid-staking products and wrapped/staked products of a token
that already trades are excluded — WBTC is Bitcoin on Ethereum, not a launch waiting to happen.
Protocols whose token already trades are kept apart as a live reference set; the board never mixes
the market's own value with a model's claim.

## The dashboard

A static page, no framework and no network — every byte it shows ships with it:

- **Board**: sortable (implied value, TVL, velocity, 7d growth, age), filterable by search, category,
  chain, velocity tier, and watchlist-only; each row carries a tier badge, a WATCHLIST / EARLY badge
  and a value bar.
- **Fastest movers**: the top 5 protocols by velocity (TVL % per day), shown as cards above the board.
- **Detail drawer**: click any row for the model's full breakdown — each multiplier, with the arithmetic
  shown so the reader can check it against board.json — and a six-step farm plan with what each step
  costs and how long it takes, paced by the protocol's velocity tier, plus a risk note that a
  pre-token protocol may never issue a token.
- **Live tokens**: the 12 largest tokens already trading, shown at market value so a reader can see
  what trading tokens are worth next to the radar's claims.
- **Model card**: the formula and the tier legend, stated on the page.

## How to run

Requires Node 22+ (standard library only, no install):

```sh
mkdir -p out
MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|directory>
# then serve out/ and open dashboard/index.html
```

`main.ts` reads the snapshot, writes `board.json`, `data.js` and `dossier.json` to the output
directory, and copies `dashboard/` and `screenshots/` there. The kit's sealed snapshot lives at
`input/snapshot.json` in the competition kit.
