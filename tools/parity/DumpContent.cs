// Loads the REAL exported content through ContentDatabase and dumps what it
// sees, for diffing against the same dump taken from the TypeScript source.
//
// The fixture-based unit tests prove the loader handles malformed input. They
// cannot prove the loader and the exporter agree about the actual game — for
// that the two ends have to be compared over the real 71 kB, which is what this
// does. It is the same shape as DumpWorld/DumpCombat: emit a canonical text
// form, byte-diff it against TypeScript's.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using Isoperia.Core.Content;
using Isoperia.Core.Save;

public static class DumpContent
{
    public static void Main(string[] args)
    {
        string dir = args.Length > 0 ? args[0] : "unity/Assets/Isoperia/Resources/Content";

        ContentDatabase db = ContentDatabase.Load(name =>
        {
            string p = Path.Combine(dir, name + ".json");
            return File.Exists(p) ? File.ReadAllText(p) : null;
        });

        var sb = new StringBuilder();

        // Every table, by size — catches a table silently losing entries.
        foreach (string file in ContentDatabase.RequiredFiles)
        {
            JsonValue root = db.File(file);
            var names = new List<string>(root.Members.Keys);
            names.Sort(StringComparer.Ordinal);
            foreach (string table in names)
                sb.Append("table\t").Append(file).Append('.').Append(table)
                  .Append('\t').Append(root[table].Count).Append('\n');
        }

        // Every item, fully — items are what the inventory, shop, crafting and
        // offline-progression systems all key off, and the two bugs this
        // pipeline exists to prevent were both item/building table errors.
        var ids = new List<string>(db.Items.Members.Keys);
        ids.Sort(StringComparer.Ordinal);
        foreach (string id in ids)
        {
            JsonValue it = db.Items[id];
            sb.Append("item\t").Append(id)
              .Append('\t').Append(it["name"].AsString(""))
              .Append('\t').Append(it["type"].AsString(""))
              .Append('\t').Append(Num(it["value"]))
              .Append('\t').Append(it["stack"].AsBool(false) ? "stack" : "-")
              .Append('\t').Append(Reqs(it["levelReq"]))
              .Append('\n');
        }

        // Monster and weapon ids, which Phase 2c's combat port consumes.
        Ids(sb, "monster", db.Monsters);
        Ids(sb, "weapon", db.Weapons);
        Ids(sb, "building", db.Buildings);
        Ids(sb, "recipe", db.Recipes);
        Ids(sb, "seed", db.Seeds);
        Ids(sb, "quest", db.Quests);

        // The XP table, which is ALSO hardcoded in XpTable.cs and parity-tested
        // against TypeScript. Dumping both routes means the JSON and the C#
        // constant are checked against each other, not merely each against TS.
        JsonValue xp = db.Table("xp", "XP_TABLE");
        for (int i = 0; i < xp.Count; i++)
            sb.Append("xp\t").Append(i).Append('\t').Append(Num(xp[i])).Append('\n');

        Console.Out.Write(sb.ToString());
    }

    /// <summary>
    /// Emits a table's ids, sorted.
    ///
    /// The content tables are not all the same shape and assuming they were
    /// cost a debugging round: RECIPES and QUESTS are ARRAYS of objects
    /// carrying an "id" field, while MONSTERS, WEAPONS, BUILDINGS and SEEDS are
    /// maps keyed by id. Reading an array's Members yields nothing, so the C#
    /// side silently emitted no recipes at all.
    /// </summary>
    private static void Ids(StringBuilder sb, string kind, JsonValue table)
    {
        var ids = new List<string>();

        if (table.Kind == JsonKind.Array)
        {
            for (int i = 0; i < table.Count; i++)
            {
                string id = table[i]["id"].AsString(null);
                if (id == null)
                    throw new ContentException($"{kind}[{i}] has no id — cannot compare tables by id.");
                ids.Add(id);
            }
        }
        else
        {
            ids.AddRange(table.Members.Keys);
        }

        ids.Sort(StringComparer.Ordinal);
        foreach (string id in ids) sb.Append(kind).Append('\t').Append(id).Append('\n');
    }

    /// <summary>
    /// levelReq is a per-skill MAP ({"woodcutting":15}), not a number. Rendered
    /// as sorted "skill=level" pairs so both sides agree on a canonical form —
    /// the first version of this dump printed it as a number and produced 147
    /// false differences.
    /// </summary>
    private static string Reqs(JsonValue v)
    {
        if (v.IsNull || v.Kind != JsonKind.Object || v.Count == 0) return "-";

        var keys = new List<string>(v.Members.Keys);
        keys.Sort(StringComparer.Ordinal);

        var parts = new List<string>();
        foreach (string k in keys) parts.Add(k + "=" + Num(v[k]));
        return string.Join(",", parts.ToArray());
    }

    /// <summary>Integers without a decimal point, so the dump matches JS output.</summary>
    private static string Num(JsonValue v)
    {
        if (v.IsNull) return "-";
        double d = v.AsNumber(0);
        return d == Math.Floor(d) && Math.Abs(d) < 1e15
            ? ((long)d).ToString(CultureInfo.InvariantCulture)
            : d.ToString("R", CultureInfo.InvariantCulture);
    }
}
