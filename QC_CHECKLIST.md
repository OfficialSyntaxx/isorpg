# QC Checklist — manual gameplay sweep

Automated coverage lives in `tests/qc.test.ts` (`npm test`) and
`scripts/audit-ui.cjs`. This checklist is the **human pass** against the live
build — do it in your logged-in browser at `https://isoperia-rpg.higgsfield.app`.

---

## 1. World & onboarding
- [ ] Fresh save: spawn in the town centre; day chip, quests/map/village buttons present.
- [ ] Walk out to the deep wilds (NE snow band, NW forest band, SW swamp band) — terrain colours differ per biome; monsters match region (frost imps in snow, bog husks in swamp, wolves/undead in woods).
- [ ] Tap **Eldric** beside the dungeon door → quest dialog; Quests panel shows "The Caves of the Deep" active with an objective.

## 2. Dungeon depth
- [ ] Enter the deep-wilds door. Floor 1: find the Iron Key (gold marker), unlock the door, fight the Cave Brute (dodge the red telegraph rings).
- [ ] Take the amber **stairs down** → Floor 2 (6 cave slashers + 2 brutes, door/key reset, chest pays coal). Check the blue **stairs up** retreat works back to Floor 1.
- [ ] Teal portal on Floor 2 returns you to the surface; death inside re-spawns you in town (and leaves the dungeon).
- [ ] Re-enter after leaving: starts fresh on Floor 1.

## 3. Labour pipeline
- [ ] **Village** panel: assign Bram (woodcutting) and Tobias (mining). Worker rows show spec + tier + hours ("🎣 Fresh Catch · ⭐ New hand · 0h").
- [ ] Wait ~30s → stock accrues logs/coal; **Collect** moves it to the bag.
- [ ] Let it run ~2h (or cheat via a long away session) → tier becomes Veteran ×2; panel line updates.
- [ ] **Offline**: assign villagers, leave the tab/close, return after a while → return screen lists "N × Logs" and the stockpile is bigger.

## 4. Town Hall & market
- [ ] **Build** panel: place a Town Hall; card shows Level 1/3 + Upgrade ⬆; active tax starts (+2 coins/cycle).
- [ ] Upgrade to Lv2/Lv3 (costs scale) → offline cap line in the return screen says 16h/20h.
- [ ] **Market**: sell junk multiple times → price sags visibly in the panel; buying food costs more as you buy more; big coin hoards inflate sticker prices.
- [ ] Dungeon floors descended → "Spelunker" achievement pops (gold banner), Progress panel shows it unlocked.

## 5. Save integrity
- [ ] Menu → Export; import the .json into a fresh profile → labour assignments, market counters, journal completions, achievements, map coverage ALL survive (this was a QC-caught bug — pinned).
- [ ] Reload from autosave (tab close) preserves the same.

## 6. Mobile feel
- [ ] Tap-walk, drag-pan, pinch-zoom all smooth; all 10 HUD panels open and close; no toast/panel dead ends.

---

### Defect report convention
File bugs under `//bugreports` as `bugreports/<date>_<title>.md` (timestamped,
categorized), and append a line to `bugreports/mistakes.md` keeping the running
picture of what tends to regress.