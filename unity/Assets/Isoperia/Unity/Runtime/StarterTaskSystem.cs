using System;
using Isoperia.Core.Content;
using Isoperia.Core.Save;
using Isoperia.Core.State;

namespace Isoperia.Unity
{
    /// <summary>Completes the small starter task set from existing persisted state.</summary>
    public sealed class StarterTaskSystem
    {
        private readonly GameState state;
        private readonly ContentDatabase content;
        public event Action<string> Completed;

        public StarterTaskSystem(GameState state, ContentDatabase content)
        { this.state = state ?? throw new ArgumentNullException(nameof(state)); this.content = content ?? throw new ArgumentNullException(nameof(content)); }

        public void Tick(long _)
        {
            foreach (JsonValue task in content.Quests.Items)
            {
                string id = task["id"].AsString();
                string type = task["starterType"].AsString();
                if (string.IsNullOrEmpty(type) || state.Player.Journal.Contains(id) || !IsComplete(task, type)) continue;
                state.Player.Journal.Add(id);
                foreach (JsonValue reward in task["rewards"].Items)
                    state.Player.Inventory.Add(reward["itemId"].AsString(), (int)reward["qty"].AsNumber(1));
                Completed?.Invoke(task["title"].AsString("Task complete"));
            }
        }

        private bool IsComplete(JsonValue task, string type)
        {
            string target = task["target"].AsString();
            int count = (int)task["count"].AsNumber(1);
            if (type == "inventory") return state.Player.Inventory.Count(target) >= count;
            if (type == "kills") { state.Player.MetaKills.TryGetValue(target, out double kills); return kills >= count; }
            return false;
        }
    }
}
