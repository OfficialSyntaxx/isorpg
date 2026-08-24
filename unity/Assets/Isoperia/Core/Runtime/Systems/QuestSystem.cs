using System;
using System.Collections.Generic;
using Isoperia.Core.Components;
using Isoperia.Core.Content;
using Isoperia.Core.Save;
using Isoperia.Core.Sim;
using Isoperia.Core.State;

namespace Isoperia.Core.Systems
{
    /// <summary>Stages of the Caves quest, in order.</summary>
    public static class QuestStage
    {
        public const string Intro = "INTRO";
        public const string FindKey = "FIND_KEY";
        public const string OpenDoor = "OPEN_DOOR";
        public const string DefeatBrute = "DEFEAT_BRUTE";
        public const string Done = "DONE";
    }

    /// <summary>
    /// Quests. Merges two things the game had kept apart:
    ///
    /// 1. DATA-DRIVEN TASKS. A quest with a <c>starterType</c> completes the
    ///    moment its condition holds — carry N of an item, kill N of a monster,
    ///    or finish another quest. This logic already existed as
    ///    <c>Isoperia.Unity.StarterTaskSystem</c>, which used no UnityEngine type
    ///    at all: pure simulation sitting in the engine assembly, where it could
    ///    not be tested. It moved here; the Unity class is now a thin delegate so
    ///    no call site changed.
    ///
    /// 2. THE CAVES STAGE MACHINE. `caves` and `ogre` have no starterType,
    ///    because they advance through story beats rather than a counter. That
    ///    half was never ported, which meant NEITHER QUEST COULD EVER COMPLETE in
    ///    the Unity build — the data was there, the objectives rendered, and
    ///    nothing advanced them.
    ///
    /// The stage lives in <c>MetaCounters</c> rather than a new save field.
    /// Counters are already persisted and already sanitized, so a stage survives
    /// a reload without changing the save schema or needing another migration.
    /// </summary>
    public sealed class QuestSystem
    {
        /// <summary>Counter key holding the Caves stage index.</summary>
        public const string CavesStageKey = "quest_caves_stage";

        public const string CavesId = "caves";
        public const string OgreId = "ogre";

        private static readonly string[] Stages =
        {
            QuestStage.Intro, QuestStage.FindKey, QuestStage.OpenDoor,
            QuestStage.DefeatBrute, QuestStage.Done,
        };

        private readonly GameState _state;
        private readonly ContentDatabase _content;
        private readonly IRandom _rng;

        public QuestSystem(GameState state, ContentDatabase content, IRandom rng)
        {
            _state = state ?? throw new ArgumentNullException(nameof(state));
            _content = content ?? throw new ArgumentNullException(nameof(content));
            _rng = rng ?? throw new ArgumentNullException(nameof(rng));
        }

        /// <summary>Fired once per quest completed, with its id and title.</summary>
        public event Action<string, string> Completed;

        // -- the Caves stage machine ---------------------------------------

        public string Stage
        {
            get
            {
                if (_state.Player.Journal.Contains(CavesId)) return QuestStage.Done;

                _state.Player.MetaCounters.TryGetValue(CavesStageKey, out double i);
                int idx = (int)i;
                return idx >= 0 && idx < Stages.Length ? Stages[idx] : QuestStage.Intro;
            }
        }

        public bool CavesDone => _state.Player.Journal.Contains(CavesId);

        /// <summary>
        /// Advance the Caves quest, but ONLY from the stage that precedes the
        /// step being reported.
        ///
        /// That guard is the whole point. Each notification arrives from a
        /// different part of the world — picking up a key, opening a door,
        /// killing the brute — and any of them can fire more than once or out of
        /// order. Requiring the exact predecessor means a player who finds the
        /// key twice, or kills the brute before opening the door, cannot skip a
        /// step or re-collect the reward.
        /// </summary>
        private bool Advance(string from, string to)
        {
            if (Stage != from) return false;

            _state.Player.MetaCounters[CavesStageKey] = Array.IndexOf(Stages, to);
            return true;
        }

        /// <summary>Talking to the guide starts the hunt. Later talks just repeat the hint.</summary>
        public bool TalkToGuide() => Advance(QuestStage.Intro, QuestStage.FindKey);

        public bool NotifyKeyFound() => Advance(QuestStage.FindKey, QuestStage.OpenDoor);

        public bool NotifyDoorOpened() => Advance(QuestStage.OpenDoor, QuestStage.DefeatBrute);

        /// <summary>The brute falls: the Caves quest completes and pays out once.</summary>
        public bool NotifyBruteDown(InventoryComponent inv)
        {
            if (!Advance(QuestStage.DefeatBrute, QuestStage.Done)) return false;

            Complete(CavesId, inv);
            return true;
        }

        /// <summary>The Forest Ogre falls: the surveyor's errand ends. Once only.</summary>
        public bool NotifyOgreSlain(InventoryComponent inv)
        {
            if (_state.Player.Journal.Contains(OgreId)) return false;

            Complete(OgreId, inv);
            return true;
        }

        /// <summary>The objective line to show for a quest right now.</summary>
        public string ObjectiveFor(string questId)
        {
            JsonValue q = QuestById(questId);
            if (q == null) return "";

            if (_state.Player.Journal.Contains(questId)) return q["doneText"].AsString("");

            JsonValue objectives = q["objectives"];
            if (objectives.IsNull) return q["summary"].AsString("");

            // Stage-driven quests name their objective per stage.
            JsonValue line = objectives[questId == CavesId ? Stage : QuestStage.Intro];
            return line.IsNull ? q["summary"].AsString("") : line.AsString("");
        }

        // -- data-driven tasks ----------------------------------------------

        /// <summary>
        /// Complete any quest whose <c>starterType</c> condition now holds.
        ///
        /// Safe to call every tick: a quest already in the journal is skipped, so
        /// rewards are paid exactly once.
        /// </summary>
        public void Tick()
        {
            JsonValue quests = _content.Quests;

            for (int i = 0; i < quests.Count; i++)
            {
                JsonValue q = quests[i];

                string id = q["id"].AsString(null);
                string type = q["starterType"].AsString(null);

                if (id == null || string.IsNullOrEmpty(type)) continue;
                if (_state.Player.Journal.Contains(id)) continue;
                if (!IsConditionMet(q, type)) continue;

                Complete(id, _state.Player.Inventory);
            }
        }

        private bool IsConditionMet(JsonValue q, string type)
        {
            string target = q["target"].AsString(null);
            int count = (int)q["count"].AsNumber(1);

            switch (type)
            {
                case "inventory":
                    return target != null && _state.Player.Inventory.Count(target) >= count;

                case "kills":
                    if (target == null) return false;
                    _state.Player.MetaKills.TryGetValue(target, out double kills);
                    return kills >= count;

                case "journal":
                    return target != null && _state.Player.Journal.Contains(target);

                default:
                    // An unrecognised starterType would otherwise mean a quest
                    // that quietly never completes.
                    throw new ContentException(
                        $"quest \"{q["id"].AsString("?")}\" has starterType \"{type}\", which " +
                        "nothing implements. It could never complete.");
            }
        }

        // -- shared -----------------------------------------------------------

        public JsonValue QuestById(string id)
        {
            JsonValue quests = _content.Quests;
            for (int i = 0; i < quests.Count; i++)
                if (quests[i]["id"].AsString(null) == id) return quests[i];
            return null;
        }

        /// <summary>
        /// Mark a quest done and pay its rewards.
        ///
        /// A reward row may be a fixed <c>qty</c> or a <c>min</c>/<c>max</c>
        /// range — the starter tasks use the first, the story quests the second.
        /// A range takes exactly one draw, so callers sharing an IRandom get a
        /// predictable stream.
        /// </summary>
        private void Complete(string id, InventoryComponent inv)
        {
            if (!_state.Player.Journal.Contains(id)) _state.Player.Journal.Add(id);

            JsonValue q = QuestById(id);
            if (q != null)
            {
                JsonValue rewards = q["rewards"];
                for (int i = 0; i < rewards.Count; i++)
                {
                    JsonValue r = rewards[i];
                    string itemId = r["itemId"].AsString(null);
                    if (itemId == null) continue;

                    int amount;
                    if (!r["qty"].IsNull)
                    {
                        amount = (int)r["qty"].AsNumber(1);
                    }
                    else
                    {
                        int min = (int)r["min"].AsNumber(1);
                        int max = (int)r["max"].AsNumber(min);
                        amount = min + (int)Math.Floor(_rng.Next() * (max - min + 1));
                    }

                    if (amount > 0) inv.Add(itemId, amount);
                }
            }

            Completed?.Invoke(id, q == null ? id : q["title"].AsString(id));
        }
    }
}
