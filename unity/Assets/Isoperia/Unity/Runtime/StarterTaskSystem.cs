using System;
using Isoperia.Core.Content;
using Isoperia.Core.Sim;
using Isoperia.Core.State;
using Isoperia.Core.Systems;

namespace Isoperia.Unity
{
    /// <summary>
    /// Thin delegate to <see cref="Isoperia.Core.Systems.QuestSystem"/>.
    ///
    /// The logic that used to live here referenced no UnityEngine type at all —
    /// it was pure simulation sitting in the engine assembly, where the
    /// noEngineReferences harness could not reach it and so it had no tests. It
    /// moved to Core, where it is now covered along with the Caves stage machine
    /// that had never been ported.
    ///
    /// This wrapper keeps the exact public surface SaveDriver already uses
    /// (constructor, Tick, Completed), so no call site changed. Prefer the Core
    /// type directly in new code; this exists so the move needed no edits in
    /// files that cannot be compile-checked outside the Editor.
    /// </summary>
    public sealed class StarterTaskSystem
    {
        private readonly QuestSystem _quests;

        /// <summary>Fires with the completed quest's TITLE, as before.</summary>
        public event Action<string> Completed;

        public StarterTaskSystem(GameState state, ContentDatabase content)
        {
            // Reward rows for the starter tasks are fixed quantities, so the
            // random source is only reached by the story quests' min/max ranges.
            _quests = new QuestSystem(state, content, new Mulberry32Random(unchecked((int)DateTime.UtcNow.Ticks)));
            _quests.Completed += (id, title) => Completed?.Invoke(title);
        }

        /// <summary>Exposed so callers can reach the stage machine and rewards.</summary>
        public QuestSystem Quests => _quests;

        public void Tick(long _) => _quests.Tick();
    }
}
