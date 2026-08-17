# Item icon atlas — generation notes

Phase H.1. Four 4×4 grid sheets cover all 61 unique item icons (62 items minus
`shrimp_food`, a legacy duplicate of `cooked_shrimp` that shares its icon).
Each manifest here is the exact row-major cell → item id mapping used when the
sheets were generated, for `scripts/slice-atlas.cjs`.

## Status

The sheets were generated (model `nano_banana_pro`, resolved to `nano_banana_2`,
`aspect_ratio: "1:1"`, `resolution: "2k"`, ~2 credits each, ~8 total) and the
slicing math was verified working end-to-end against a synthetic test sheet —
`scripts/slice-atlas.cjs` correctly crops each named cell and skips `null`
ones. **The actual generated sheet images are not checked in.** This session's
environment has no reliable path to move them from the Higgsfield sandbox that
rendered them into this repo: direct download is blocked by egress policy,
routing through a presigned upload also failed, and relaying the bytes as
base64 through chat text produced silently corrupted files (caught by
checksum, not shipped). See `bugreports/mistakes.md` for the full account.

To finish this: regenerate the 4 sheets from the prompts below (or reuse them
if the job URLs are still live — they expire), get the 4 PNGs onto disk
wherever this repo is checked out, then run, once per sheet:

```
node scripts/slice-atlas.cjs <sheet.png> assets/icon-atlas/manifest-1-resources.json public/icons --size 64
node scripts/slice-atlas.cjs <sheet.png> assets/icon-atlas/manifest-2-farming-food.json public/icons --size 64
node scripts/slice-atlas.cjs <sheet.png> assets/icon-atlas/manifest-3-weapons-armor.json public/icons --size 64
node scripts/slice-atlas.cjs <sheet.png> assets/icon-atlas/manifest-4-misc-keys-pets.json public/icons --size 64
```

That populates `public/icons/*.png`, one file per item id. Nothing else needs
to change — `itemIconHtml()` in `src/data/Items.ts` already prefers a real
icon file over the emoji fallback the instant one exists on disk *and* is
registered in `ITEM_ICON_IMAGES`; add the new ids to that map as they land.

## Prompt style (shared across all 4 sheets)

> Flat-shaded low-poly fantasy RPG inventory icon sheet. A 4x4 grid of 16
> equal square cells separated by thin dark grid lines, one item centered per
> cell with a small soft drop shadow, warm parchment-tan cell background,
> muted earthy color palette, soft bevel highlights, consistent lighting from
> the upper-left, semi-isometric perspective, clean simple silhouettes.
> Absolutely NO text, NO numbers, NO labels, NO letters anywhere in the
> image. Read the 16 cells left-to-right then top-to-bottom, row by row: …

Each sheet's prompt then enumerates its 16 (or, for the last sheet, 13 real +
3 explicitly "empty blank parchment-tan panel") cells in that reading order,
matching the manifest's `cells` array 1:1. The full per-sheet item
descriptions used are recorded in `UPDATES.md`'s H.1 entry.

## Why a grid image at all, and why this shape

- One image per group of ~16 items, not one image for all 61 — fewer items
  per sheet means the model follows the reading-order instruction more
  reliably, and still costs a fraction of generating each icon separately.
- Always 1:1 square canvas, always a 4×4 grid, even when a group has fewer
  than 16 real items (the last sheet lists 3 cells as explicitly blank) — one
  fixed shape keeps the slicing math trivial and avoids per-sheet aspect
  ratios that Higgsfield's model list didn't cleanly support anyway (a 4×2
  grid wants a 2:1 canvas, which isn't an offered aspect ratio).
- Grouped thematically (resources / farming & food / weapons & armor /
  misc-keys-pets) rather than by the game's `ItemType` field, because that
  field conflates gathering tools, weapons, and armor under `TOOL` — no use
  for visual grouping.
