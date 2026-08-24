using System;
using System.Collections.Generic;
using Isoperia.Core.Components;
using Isoperia.Core.Content;
using Isoperia.Core.Save;
using Isoperia.Core.State;

namespace Isoperia.Core.Systems
{
    /// <summary>
    /// Villager labour. Port of <c>src/systems/LabourSystem.ts</c>.
    ///
    /// Assigned villagers steadily fill the village stock, which the player then
    /// claims into their bag. Production continues while the player is away, so
    /// this is also what <c>SaveSystem.ComputeOffline</c> calls — the offline
    /// half was missing entirely until now, which meant villagers silently
    /// stopped working the moment you closed the tab.
    /// </summary>
    public static class Labour
    {
        public const string JobWoodcutting = "woodcutting";
        public const string JobMining = "mining";

        /// <summary>One log per 20 s per lumberjack.</summary>
        public const double WoodIntervalMs = 20000;

        /// <summary>One ore per 30 s per miner.</summary>
        public const double MineIntervalMs = 30000;

        /// <summary>A single online tick never accrues more than a minute.</summary>
        public const double MaxTickMs = 60000;

        public static double IntervalFor(string job) =>
            job == JobWoodcutting ? WoodIntervalMs : MineIntervalMs;

        /// <summary>
        /// Which item a villager produces. Deterministic per villager id, and it
        /// must stay that way: the same villager has to keep mining the same ore
        /// across sessions, and nothing stores the choice.
        ///
        /// The hash is a plain sum of UTF-16 code units, matching the TypeScript's
        /// <c>for (const c of id) h += c.charCodeAt(0)</c>. Iterating a JS string
        /// with for..of yields CODE POINTS, so an id outside the BMP would differ
        /// from a C# char-by-char sum — every villager id is ASCII, and this is
        /// noted rather than defended because a non-ASCII id would be a content
        /// change, not a port bug.
        /// </summary>
        public static string ItemFor(string id, string job)
        {
            if (job == JobWoodcutting) return "normal_log";

            int h = 0;
            foreach (char c in id) h += c;
            return h % 100 < 65 ? "copper_ore" : "tin_ore";
        }

        /// <summary>
        /// Veteran tier for milliseconds worked: returns the yield multiplier and
        /// its label. VETERAN_TIERS is an array of [minMs, label, mult] and the
        /// TypeScript scans the WHOLE list keeping the last match rather than
        /// stopping at the first, so the tiers must stay in ascending order.
        /// </summary>
        public static void TierFor(ContentDatabase content, double workedMs,
                                   out string label, out int mult)
        {
            JsonValue tiers = content.Table("npcs", "VETERAN_TIERS");

            label = tiers[0][1].AsString("");
            mult = (int)tiers[0][2].AsNumber(1);

            for (int i = 0; i < tiers.Count; i++)
            {
                if (workedMs < tiers[i][0].AsNumber(0)) continue;
                label = tiers[i][1].AsString(label);
                mult = (int)tiers[i][2].AsNumber(mult);
            }
        }

        public static string HoursLabel(double ms) =>
            ((long)Math.Floor(ms / 3600000)) + "h";

        /// <summary>
        /// Production while the player was away, capped.
        ///
        /// Three details here are easy to get wrong and all three are load-bearing:
        ///
        /// 1. <c>Worked</c> accrues the FULL elapsed <c>ms</c>, not
        ///    <c>n * interval</c>. A villager banks veteran hours for the whole
        ///    time away, including the remainder that produced nothing.
        /// 2. The multiplier is read AFTER that, so a villager who crosses a
        ///    veteran threshold while away is paid at the NEW rate for the whole
        ///    period.
        /// 3. A specialisation's bonus item is added <c>n</c> times, NOT
        ///    <c>n * mult</c> — the veteran multiplier applies only to the main
        ///    output.
        /// </summary>
        public static List<string> AccrueOffline(GameState state, ContentDatabase content,
                                                 double awayMs, double capMs)
        {
            var lines = new List<string>();
            LabourState l = state.Town.Labour;
            double ms = Math.Min(awayMs, capMs);

            // Assignments is mutated below via Worked/Stock, not itself, but the
            // keys are copied anyway so the iteration cannot be invalidated.
            var assigned = new List<KeyValuePair<string, string>>(l.Assignments);

            foreach (KeyValuePair<string, string> kv in assigned)
            {
                string id = kv.Key;
                string job = kv.Value;

                double need = IntervalFor(job);
                long n = (long)Math.Floor(ms / need);
                if (n <= 0) continue;

                l.Worked.TryGetValue(id, out double worked);
                l.Worked[id] = worked + ms;

                TierFor(content, l.Worked[id], out _, out int mult);

                string item = ItemFor(id, job);
                double total = n * mult;
                Add(l.Stock, item, total);
                lines.Add($"{total} x {content.ItemName(item)}");

                JsonValue spec = content.Table("npcs", "VILLAGER_SPECS")[id];
                if (spec.IsNull) continue;

                string specItem = spec["item"].AsString(null);
                if (specItem != null)
                {
                    Add(l.Stock, specItem, n);
                    lines.Add($"{n} x {content.ItemName(specItem)}");
                }
                else if (!spec["coins"].IsNull)
                {
                    // NOTE: offline pays n coins, while the online tick pays
                    // spec.coins per production. That asymmetry is in the
                    // TypeScript; it is reproduced rather than tidied, because
                    // "fixing" it silently changes the economy.
                    Add(l.Stock, "coins", n);
                    lines.Add($"{n} x Coins");
                }
            }

            return lines;
        }

        private static void Add(Dictionary<string, double> d, string key, double amount)
        {
            d.TryGetValue(key, out double cur);
            d[key] = cur + amount;
        }
    }

    /// <summary>The live half of villager labour: assignment, ticking, claiming.</summary>
    public sealed class LabourSystem
    {
        private readonly GameState _state;
        private readonly ContentDatabase _content;

        /// <summary>-1 until the first tick, which only establishes the baseline.</summary>
        private double _lastTickMs = -1;

        public LabourSystem(GameState state, ContentDatabase content)
        {
            _state = state ?? throw new ArgumentNullException(nameof(state));
            _content = content ?? throw new ArgumentNullException(nameof(content));
        }

        /// <summary>Assign a villager, or pass null/"idle" to unassign.</summary>
        public void Assign(string id, string job)
        {
            LabourState l = _state.Town.Labour;

            if (job == null || job == "idle") l.Assignments.Remove(id);
            else l.Assignments[id] = job;

            // Accrual resets on reassignment, so partial progress toward a log
            // does not carry over into a mining shift.
            l.Acc[id] = 0;
        }

        public string JobOf(string id) =>
            _state.Town.Labour.Assignments.TryGetValue(id, out string j) ? j : null;

        /// <summary>
        /// Accrue production while playing.
        ///
        /// <paramref name="nowMs"/> is wall-clock. The first call only records the
        /// baseline and produces nothing — otherwise the first tick after load
        /// would credit the entire epoch. A single step is capped at
        /// <see cref="Labour.MaxTickMs"/> so a stalled tab does not pay out a
        /// burst that the offline path has already paid for.
        /// </summary>
        public void Tick(double nowMs)
        {
            LabourState l = _state.Town.Labour;

            if (_lastTickMs < 0)
            {
                _lastTickMs = nowMs;
                return;
            }

            double dt = Math.Min(nowMs - _lastTickMs, Labour.MaxTickMs);
            _lastTickMs = nowMs;
            if (dt <= 0 || l.Assignments.Count == 0) return;

            var assigned = new List<KeyValuePair<string, string>>(l.Assignments);

            foreach (KeyValuePair<string, string> kv in assigned)
            {
                string id = kv.Key;
                string job = kv.Value;

                l.Acc.TryGetValue(id, out double acc);
                l.Worked.TryGetValue(id, out double worked);

                l.Acc[id] = acc + dt;
                l.Worked[id] = worked + dt;

                double need = Labour.IntervalFor(job);

                // The multiplier is read ONCE, before the loop, matching the
                // TypeScript: crossing a veteran threshold mid-tick does not
                // upgrade the outputs produced within that same tick.
                Labour.TierFor(_content, l.Worked[id], out _, out int mult);

                JsonValue spec = _content.Table("npcs", "VILLAGER_SPECS")[id];
                string specItem = spec.IsNull ? null : spec["item"].AsString(null);
                double specCoins = spec.IsNull ? 0 : spec["coins"].AsNumber(0);

                while (l.Acc[id] >= need)
                {
                    l.Acc[id] -= need;

                    string item = Labour.ItemFor(id, job);
                    Bump(l.Stock, item, mult);

                    if (specItem != null) Bump(l.Stock, specItem, 1);
                    if (specCoins > 0) Bump(l.Stock, "coins", specCoins);
                }
            }
        }

        /// <summary>
        /// Move the whole village stock into the player's bag.
        ///
        /// WARNING, INHERITED: the stock is cleared unconditionally, but
        /// <see cref="InventoryComponent.Add"/> respects the bulk cap — so
        /// claiming into a full bag DESTROYS the overflow. The TypeScript does
        /// the same. It is reproduced here so behaviour matches, and reported
        /// through <paramref name="lost"/> so a caller can warn the player
        /// instead of silently binning a night's work.
        /// </summary>
        public List<KeyValuePair<string, int>> Claim(InventoryComponent inv,
                                                     out List<KeyValuePair<string, int>> lost)
        {
            LabourState l = _state.Town.Labour;

            var claimed = new List<KeyValuePair<string, int>>();
            lost = new List<KeyValuePair<string, int>>();

            foreach (KeyValuePair<string, double> kv in l.Stock)
            {
                int want = (int)kv.Value;
                if (want <= 0) continue;

                int got = inv.Add(kv.Key, want);
                claimed.Add(new KeyValuePair<string, int>(kv.Key, got));

                if (got < want) lost.Add(new KeyValuePair<string, int>(kv.Key, want - got));
            }

            l.Stock.Clear();
            return claimed;
        }

        private static void Bump(Dictionary<string, double> d, string key, double amount)
        {
            d.TryGetValue(key, out double cur);
            d[key] = cur + amount;
        }
    }
}
