# public/ weight — the split and the ceiling

Audit 2026-07-24, findings **M-28** (deploy split) and **M-29** (size budget with a CI ceiling).

## Two numbers. Say which one you mean.

| | what it is | who pays | does lazy loading change it? |
|---|---|---|---|
| **Deploy size** | bytes under `platform/public/` — repo, git history, VPS tree, CI artifact | us, once | **no** |
| **Session download** | what ONE STUDENT pulls over the wire in one sitting | them, every time, out of a data plan | **yes** |

Until 2026-08-11 this tool measured only the first and was routinely quoted for the second. FR-19
forced the split: thirteen 10–15 s pre-drive clips at the measured ~5–9 MB each are ~117 MB of
deploy **and** ~117 MB of session, if the card fetches them without being asked.

`SESSION_MODELS` in `publicBudget.mjs` states, per feature, which buckets a single session pulls
**upfront** (the card opened — the student cannot decline) and which only **onDemand** (they pressed
play). `sessionCosts()` turns that into three figures, all printed by the gate:

- **idle** — the floor. Posters only. Hard-gated by `maxIdleBytes`.
- **worst case** — every card opened, every clip played once. Reported, not separately gated: it *is*
  the sum of the bucket ceilings.
- **biggest single fetch** — the unskippable lump. Now that loading is on demand this is the number
  that binds, and it is gated by the bucket's `maxFileBytes`.

**The one thing this cannot see.** `onDemand` is a claim about a *component*, not about disk. If a
`<video>` regains `autoPlay`, every onDemand byte silently becomes upfront and no file changes size,
so nothing here would notice. Each model therefore names the source file it depends on and the test
that pins it (`idleRequires`) — for FR-19 that is `hud/__tests__/predrive-clip-lazy.test.ts`, plus
`procedures/__tests__/predrive-clip-weight.test.ts`, which stats each clip so the megabyte figure on
the play button is the megabyte figure on disk.

`platform/public/` was 494 MB, of which **311 MB is never requested by a student** and nothing
stopped it growing. `deploy.sh` puts the live tree on the target commit with `git reset --hard`,
so every tracked byte lands on the VPS.

| file | what it is |
|---|---|
| `publicBudget.mjs` | The declaration: which bucket each path belongs to, whether it ships, what it may weigh, and (`SESSION_MODELS`) what one student pulls. **Every file under `public/` must match a bucket — an undeclared path is a failure, not a default.** |
| `check-asset-budget.mjs` | The gate. Prints the table, exits non-zero on a breach or an undeclared file. `npm run assets:budget` |
| `prune-public.mjs` | The split. Deletes `ship: "dev"` files from a deployed tree. Dry-run unless `--apply`. `npm run assets:prune` |
| `publicBudget.test.mjs` | Runs inside the normal `npx vitest run` gate (see `platform/vitest.config.ts`), so the ceiling is enforced on every push with no bespoke CI step to forget. |

## Measured (2026-07-25, after the M-28 deletions)

```
deployed (prod): 180.9 MB    working copy only (dev): 311.5 MB    total: 492.4 MB
```

The three dev-only buckets are `clips-keyframes` (247 MB of R0 vision evidence — the manifest
points at the WebP posters, not these), `scene-stills` (57.7 MB, consumed only by `/dev/*` routes
that do not exist in production) and `sim-textures-src` (21.7 MB of the PNGs the KTX2 encoder was
fed). `ship: "dev"` means *pruned from the live tree*, never *delete from the repo*.

Deleted outright under M-28 because nothing referenced them at all: `public/sim/city/` (1.8 MB,
superseded by `city-v3`) and the five `create-next-app` scaffold SVGs.

## Wiring the prune into the deploy

`tools/deploy/deploy.sh` resets the live tree to the target commit, then restarts. One line after
that reset does the split:

```sh
node "$APP_ROOT/tools/assets/prune-public.mjs" --public "$LIVE_PLATFORM/public" --apply --quiet
```

It is idempotent and self-healing: the next `git reset --hard` restores the files, and a prune
that gets skipped costs disk, never correctness.
