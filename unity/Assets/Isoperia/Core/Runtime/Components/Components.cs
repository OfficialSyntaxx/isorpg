using System;
using System.Collections.Generic;

namespace Isoperia.Core.Components
{
    /// <summary>Grid and interpolated world position. Pure data, no logic.</summary>
    public sealed class PositionComponent
    {
        /// <summary>Tile coordinates. Authoritative — the simulation reads these.</summary>
        public int Gx;
        public int Gy;

        /// <summary>Interpolated world coordinates, stepped per FRAME for rendering
        /// only. Never read by gameplay.</summary>
        public double Wx;
        public double Wz;

        /// <summary>Tiles per second.</summary>
        public double Speed = 4.0;

        /// <summary>Heading, radians.</summary>
        public double Facing;

        public static PositionComponent Create(int gx, int gy, double speed = 4.0) =>
            new PositionComponent { Gx = gx, Gy = gy, Wx = gx, Wz = gy, Speed = speed, Facing = 0 };
    }

    public sealed class HealthComponent
    {
        public int Hp;
        public int MaxHp;

        public static HealthComponent Create(int maxHp = 100) =>
            new HealthComponent { Hp = maxHp, MaxHp = maxHp };
    }

    /// <summary>XP in one skill, plus per-item mastery within it.</summary>
    public sealed class SkillState
    {
        public double Xp;

        /// <summary>Mastery XP keyed by item id. See <c>MasteryTable</c>.</summary>
        public Dictionary<string, double> Mastery = new Dictionary<string, double>();
    }

    /// <summary>All twelve skills.</summary>
    public sealed class SkillComponent
    {
        public readonly Dictionary<string, SkillState> Skills = new Dictionary<string, SkillState>();

        public static SkillComponent Create()
        {
            var c = new SkillComponent();
            foreach (string id in Data.Skills.All) c.Skills[id] = new SkillState();
            return c;
        }

        public SkillState Get(string id)
        {
            if (!Skills.TryGetValue(id, out SkillState s))
            {
                s = new SkillState();
                Skills[id] = s;
            }
            return s;
        }

        public int LevelOf(string id) => Data.XpTable.LevelFromXp(Get(id).Xp);

        public void AddXp(string id, double xp)
        {
            if (xp <= 0) return;
            Get(id).Xp += xp;
        }

        public void AddMasteryXp(string skillId, string itemKey, double xp)
        {
            if (xp <= 0) return;
            var m = Get(skillId).Mastery;
            m.TryGetValue(itemKey, out double cur);
            m[itemKey] = cur + xp;
        }
    }

    public sealed class ItemStack
    {
        public string Id;
        public int Amount;

        public ItemStack() { }
        public ItemStack(string id, int amount) { Id = id; Amount = amount; }
    }

    /// <summary>
    /// What the inventory needs to know about an item, without Core owning the
    /// item table. The real catalog is loaded from JSON in Phase 2d; tests supply
    /// a fake. This keeps the storage-cap rules testable before the content data
    /// exists.
    /// </summary>
    public interface IItemCatalog
    {
        /// <summary>
        /// Does this item count against the bulk storage cap?
        ///
        /// The cap and the Storehouse upgrade are scoped to bulk resources — logs,
        /// ore, bars, fish, planks. Currency, keys, quest tokens, pets, gear and
        /// tools are carried regardless, so a full bag never blocks coin income, a
        /// quest reward or a rare drop.
        ///
        /// Unknown ids MUST be treated as bulk, so a newly added resource is
        /// capped by default rather than silently uncapped.
        /// </summary>
        bool IsBulk(string itemId);
    }

    /// <summary>
    /// The fallback catalog, used before the content data is loaded in Phase 2d.
    ///
    /// Everything is bulk EXCEPT the currency. Unknown ids being bulk is the
    /// deliberate default — a newly added resource should be capped rather than
    /// silently uncapped — but coins are not an unknown resource, they are the
    /// currency, and in the TypeScript they are MISC and therefore never counted
    /// against the cap.
    ///
    /// Leaving coins bulk here is not a harmless stub: <c>SaveSystem</c> pays the
    /// offline Town Hall tax in coins, so a player returning to a full bag would
    /// have their gold silently clamped at the storage cap. That was caught by
    /// <c>SaveSystemTests.ATownHallPaysTaxIntoTheBagWhileAway</c>, which expected
    /// 2,400 coins and got 500.
    /// </summary>
    public sealed class AllBulkCatalog : IItemCatalog
    {
        public static readonly AllBulkCatalog Instance = new AllBulkCatalog();

        /// <summary>The currency id. Core already names it when paying offline tax.</summary>
        public const string Coins = "coins";

        public bool IsBulk(string itemId) => itemId != Coins;
    }

    public sealed class InventoryComponent
    {
        public const int DefaultStorageCap = 500;

        /// <summary>Fraction of each carried bulk stack lost on death.</summary>
        public const double DeathLossPct = 0.15;

        public List<ItemStack> Items = new List<ItemStack>();

        /// <summary>Bulk resource cap, raised by the Storehouse.</summary>
        public int StorageCap = DefaultStorageCap;

        private IItemCatalog _catalog = AllBulkCatalog.Instance;

        public static InventoryComponent Create(IItemCatalog catalog = null)
        {
            var inv = new InventoryComponent();
            inv._catalog = catalog ?? AllBulkCatalog.Instance;
            return inv;
        }

        public void SetCatalog(IItemCatalog catalog) =>
            _catalog = catalog ?? AllBulkCatalog.Instance;

        public int Count(string id)
        {
            foreach (var s in Items) if (s.Id == id) return s.Amount;
            return 0;
        }

        /// <summary>Total stored bulk resources — the figure the cap applies to.</summary>
        public int StoredAmount()
        {
            int n = 0;
            foreach (var s in Items) if (_catalog.IsBulk(s.Id)) n += s.Amount;
            return n;
        }

        public bool IsFull() => StoredAmount() >= StorageCap;

        /// <summary>
        /// Add up to <paramref name="amount"/>, respecting the cap.
        /// </summary>
        /// <returns>
        /// The amount ACTUALLY stored, which may be less than requested (0 when
        /// full). Enforcing the cap here rather than at call sites is deliberate:
        /// when it was advisory, some callers checked it and some did not, so
        /// combat drops and offline progression could blow past it — offline
        /// capped each skill independently, letting three gathering skills each
        /// fill the whole cap. A short return lets callers react.
        /// </returns>
        public int Add(string id, int amount)
        {
            if (amount <= 0) return 0;

            int put = amount;
            if (_catalog.IsBulk(id))
            {
                int room = Math.Max(0, StorageCap - StoredAmount());
                put = Math.Min(amount, room);
                if (put <= 0) return 0;
            }

            foreach (var s in Items)
            {
                if (s.Id != id) continue;
                s.Amount += put;
                return put;
            }

            Items.Add(new ItemStack(id, put));
            return put;
        }

        public bool Remove(string id, int amount)
        {
            for (int i = 0; i < Items.Count; i++)
            {
                if (Items[i].Id != id) continue;
                if (Items[i].Amount < amount) return false;

                Items[i].Amount -= amount;
                if (Items[i].Amount <= 0) Items.RemoveAt(i);
                return true;
            }
            return false;
        }

        /// <summary>
        /// Death has stakes: lose a slice of what is unbanked. "Unbanked" reuses
        /// the bulk split the cap already draws, so coins, gear, tools and quest
        /// items are never at risk — exactly what a Storehouse run does not need
        /// to protect.
        ///
        /// Floored per stack, which keeps it forgiving: a stack under 7 loses
        /// nothing, and losses only bite once a haul is worth banking.
        /// </summary>
        public List<ItemStack> ApplyDeathPenalty()
        {
            var lost = new List<ItemStack>();

            foreach (var item in Items)
            {
                if (!_catalog.IsBulk(item.Id)) continue;

                int amount = (int)Math.Floor(item.Amount * DeathLossPct);
                if (amount <= 0) continue;

                item.Amount -= amount;
                lost.Add(new ItemStack(item.Id, amount));
            }

            Items.RemoveAll(i => i.Amount <= 0);
            return lost;
        }
    }

    /// <summary>Aggregate bonuses from worn equipment.</summary>
    public struct StatBonuses
    {
        public int Attack;
        public int Strength;
        public int Defense;
        public int MaxHp;
    }

    public static class EquipSlots
    {
        public const string Weapon = "weapon";
        public const string Offhand = "offhand";
        public const string Head = "head";
        public const string Body = "body";
        public const string Legs = "legs";

        public static readonly string[] All = { Weapon, Offhand, Head, Body, Legs };

        public static bool IsSlot(string s) => Array.IndexOf(All, s) >= 0;
    }
}
