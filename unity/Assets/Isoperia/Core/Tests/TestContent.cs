using Isoperia.Core.Content;

namespace Isoperia.Core.Tests
{
    /// <summary>
    /// Loads the REAL exported content for tests that need it.
    ///
    /// Some behaviour is only worth testing against the actual tables — which
    /// resource a level-1 miner idles on, what a villager's specialisation pays,
    /// which veteran tier a worked time falls into. A fixture would just restate
    /// the assumption under test.
    ///
    /// Deliberately THROWS when content cannot be found rather than skipping. A
    /// test that quietly passes when its subject is missing is worse than no
    /// test: it reports green in CI while proving nothing, which is a failure
    /// mode this project has already paid for more than once.
    /// </summary>
    public static class TestContent
    {
        public static ContentDatabase Real()
        {
            // Runs from the repo root outside Unity and from the Unity project
            // root inside it, so try both shapes while walking upward.
            string dir = System.IO.Directory.GetCurrentDirectory();

            for (int i = 0; i < 8 && dir != null; i++)
            {
                foreach (string rel in new[]
                {
                    "unity/Assets/Isoperia/Resources/Content",
                    "Assets/Isoperia/Resources/Content",
                })
                {
                    string candidate = System.IO.Path.Combine(dir, rel);
                    if (!System.IO.Directory.Exists(candidate)) continue;

                    return ContentDatabase.Load(name =>
                    {
                        string p = System.IO.Path.Combine(candidate, name + ".json");
                        return System.IO.File.Exists(p) ? System.IO.File.ReadAllText(p) : null;
                    });
                }

                dir = System.IO.Path.GetDirectoryName(dir);
            }

            throw new ContentException(
                "could not find Assets/Isoperia/Resources/Content from " +
                System.IO.Directory.GetCurrentDirectory() +
                ". Run `npm run export:content`.");
        }
    }
}
