using System;
using System.Collections.Generic;
using Isoperia.Core.Components;
using Isoperia.Core.Content;
using Isoperia.Core.Data;
using Isoperia.Core.Save;
using Isoperia.Core.State;
using Isoperia.Core.World;

namespace Isoperia.Core.Systems
{
    /// <summary>
    /// Achievements. Port of <c>src/data/Achievements.ts</c>'s predicates.
    ///
    /// WHY THESE ARE CODE AND NOT CONTENT. Every other table in the game is
    /// exported to JSON so it cannot be transcribed wrongly. Achievements carry a
    /// <c>test(state)</c> FUNCTION, and the exporter refuses to serialise
    /// functions on purpose — a predicate is behaviour, and behaviour is ported
    /// to C# where a test can pin it. So the ids, names and descriptions come
    /// from content, and only the conditions live here.
    ///
    /// That split has a sharp edge, and it is guarded: an achievement present in
    /// the content with no predicate here would simply never unlock, silently and
    /// forever. <see cref="Evaluate"/> throws instead.
    /// </summary>
    public static class Achievements
    {
        private static double Counter(GameState s, string key) =>
            s.Player.MetaCounters.TryGetValue(key, out double v) ? v : 0;

        private static double Kills(GameState s, string id) =>
            s.Player.MetaKills.TryGetValue(id, out double v) ? v : 0;

        private static double TotalKills(GameState s)
        {
            double n = 0;
            foreach (KeyValuePair<string, double> kv in s.Player.MetaKills) n += kv.Value;
            return n;
        }

        /// <summary>
        /// Every achievement's condition, by id.
        ///
        /// NOTE on "explorer_25": the TypeScript divides explored tiles by
        /// WORLD_SIZE squared. That was 42x42 = 1,764, and is now 126x126 =
        /// 15,876, so "a quarter of the world" went from 441 tiles to 3,969. The
        /// mainland migration made this achievement about nine times harder. That
        /// is a consequence of the world change rather than a port decision, and
        /// it is reproduced rather than rebalanced — but it is written down here
        /// so it is a choice next time somebody looks, not a surprise.
        /// </summary>
        private static readonly Dictionary<string, Func<GameState, bool>> Conditions =
            new Dictionary<string, Func<GameState, bool>>
            {
                ["first_kill"] = s => TotalKills(s) >= 1,
                ["rat_hunter"] = s => Kills(s, "giant_rat") >= 10,
                ["woodsman"] = s => Kills(s, "dire_wolf") >= 5,
                ["boss_slayer"] = s => Kills(s, "forest_ogre") + Kills(s, "cave_brute") >= 1,
                ["skiller_10"] = s => AnySkillAtLeast(s, 10),
                ["collector_10"] = s => s.CollectionLog.Count >= 10,
                ["quest_done"] = s => s.Player.Journal.Count >= 1,
                ["explorer_25"] = s =>
                    (double)s.Player.MapExplored.Count / (Grid.WorldSize * Grid.WorldSize) >= 0.25,
                ["merchant"] = s => Counter(s, "shop_bought") >= 1,
                ["hawker"] = s => Counter(s, "shop_sold") >= 20,
                ["foreman"] = s => Counter(s, "labour_assigns") >= 3,
                ["quartermaster"] = s => Counter(s, "labour_collected") >= 50,
                ["spelunker"] = s => Counter(s, "floors_descended") >= 1,
                ["mogul"] = s => Counter(s, "shop_sold_value") >= 2000,
                ["flooder"] = s => AnyMarketSupplyAtLeast(s, 100),
                ["regular"] = s => Counter(s, "shop_bought") >= 10,
                ["treasure_hunter"] = s => Counter(s, "clues_done") >= 1,
                ["cartographer"] = s => Counter(s, "clues_done") >= 10,
                ["green_thumb"] = s => s.Player.Skills.LevelOf(Skills.Farming) >= 20,
            };

        private static bool AnySkillAtLeast(GameState s, int level)
        {
            foreach (KeyValuePair<string, SkillState> kv in s.Player.Skills.Skills)
                if (XpTable.LevelFromXp(kv.Value.Xp) >= level) return true;
            return false;
        }

        private static bool AnyMarketSupplyAtLeast(GameState s, double n)
        {
            foreach (KeyValuePair<string, double> kv in s.Town.MarketSupply)
                if (kv.Value >= n) return true;
            return false;
        }

        /// <summary>Ids that have a condition. Used by the coverage test.</summary>
        public static IEnumerable<string> KnownIds => Conditions.Keys;

        public static bool IsMet(string id, GameState state)
        {
            if (!Conditions.TryGetValue(id, out Func<GameState, bool> test))
            {
                throw new ContentException(
                    $"achievement \"{id}\" is in the content but has no condition in " +
                    "Achievements.Conditions. It could never unlock. Add the condition, or " +
                    "remove it from src/data/Achievements.ts and re-export.");
            }

            return test(state);
        }
    }

    /// <summary>
    /// The Meta page: kill tallies, collection progress, achievements. Port of
    /// <c>src/systems/MetaSystem.ts</c>.
    /// </summary>
    public sealed class MetaSystem
    {
        private readonly GameState _state;
        private readonly ContentDatabase _content;

        public MetaSystem(GameState state, ContentDatabase content)
        {
            _state = state ?? throw new ArgumentNullException(nameof(state));
            _content = content ?? throw new ArgumentNullException(nameof(content));
        }

        /// <summary>Fired once per achievement, the moment it flips.</summary>
        public event Action<string, string, string> Unlocked;   // id, name, desc

        /// <summary>
        /// Evaluate every LOCKED achievement and unlock the ones that now pass.
        ///
        /// Already-unlocked ids are skipped rather than re-tested, so an
        /// achievement cannot re-fire if the state that earned it later regresses
        /// — coins spent, items sold, a death. Achievements are a record of
        /// having done a thing, not of currently satisfying it.
        /// </summary>
        public void Evaluate()
        {
            JsonValue list = _content.Table("achievements", "ACHIEVEMENTS");

            for (int i = 0; i < list.Count; i++)
            {
                JsonValue a = list[i];
                string id = a["id"].AsString(null);
                if (id == null) continue;

                if (_state.Player.MetaAchievements.Contains(id)) continue;
                if (!Achievements.IsMet(id, _state)) continue;

                _state.Player.MetaAchievements.Add(id);
                Unlocked?.Invoke(id, a["name"].AsString(id), a["desc"].AsString(""));
            }
        }

        /// <summary>Record a counter event: sales, purchases, labour, clues.</summary>
        public void Bump(string counter, double n = 1)
        {
            _state.Player.MetaCounters.TryGetValue(counter, out double cur);
            _state.Player.MetaCounters[counter] = cur + n;
        }

        public int TotalKills()
        {
            double n = 0;
            foreach (KeyValuePair<string, double> kv in _state.Player.MetaKills) n += kv.Value;
            return (int)n;
        }

        public int UnlockedCount => _state.Player.MetaAchievements.Count;

        public int CollectionCount => _state.CollectionLog.Count;
    }
}
