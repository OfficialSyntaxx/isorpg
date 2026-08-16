# mistakes.md — running categorized issue log

Convention: append every defect here with a one-line category tag, plus a
details file `//bugreports/<date>_<slug>.md` for anything non-trivial.

## QC sprint 2026-08-16
- **[save] Import sanitizer dropped P6–P8 fields** — `Sanitizer.ts` whitelisted
  only buildings; `player.journal/meta`, `town.labour/market`, and `map` were
  erased on import / load-from-backup. Fixed by extending the sanitizer with
  `strList/numList/numMap/strMap` coercion. Caught by `tests/qc.test.ts`
  ("apply restores the full economy state"). **Lesson: any new persisted field
  needs its sanitizer pass-through in the same change.**

## Open threads (not yet filed as bugs)
- Offline **coin tax** (Town Hall) only accrues online, unlike labour — by
  design vs bug, decide next sprint.
- Market panel shows live prices but no trend arrows yet (cosmetic).