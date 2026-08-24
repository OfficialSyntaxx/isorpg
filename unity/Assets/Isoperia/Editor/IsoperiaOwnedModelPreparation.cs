using UnityEditor;

namespace Isoperia.EditorTools
{
    /// <summary>
    /// Keeps the small, reviewed subset of owned GLB actors available to runtime
    /// Resources consumers without hand-copying Unity metadata.
    /// </summary>
    public static class IsoperiaOwnedModelPreparation
    {
        private const string SourceRoot = "Assets/Isoperia/Art/Models/";
        private const string RuntimeRoot = "Assets/Isoperia/Resources/Art/OwnedModels/";

        public static void SyncHero()
        {
            EnsureFolder("Assets/Isoperia/Resources", "Art");
            EnsureFolder("Assets/Isoperia/Resources/Art", "OwnedModels");
            CopyIfStale("hero_rigged.glb");
            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
        }

        public static void SyncEncounterActors()
        {
            EnsureFolder("Assets/Isoperia/Resources", "Art");
            EnsureFolder("Assets/Isoperia/Resources/Art", "OwnedModels");
            CopyIfStale("forest_ogre.glb");
            CopyIfStale("dire_wolf.glb");
            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
        }

        /// <summary>
        /// Mirrors a source model into Resources, REFRESHING it when the source
        /// has changed.
        ///
        /// This was CopyIfMissing: it returned early whenever the destination
        /// existed, so the mirror was written once and never again. That is a
        /// silent staleness trap. Optimising a source model from 3.07 MB to
        /// 321 kB would have changed nothing in the build, because the copy
        /// under Resources — which is what actually ships — would have kept the
        /// old bytes forever, with no warning and nothing to notice.
        ///
        /// Compared by length rather than blindly overwritten, so a no-op sync
        /// does not churn the asset database or the .meta guid.
        /// </summary>
        private static void CopyIfStale(string fileName)
        {
            string source = SourceRoot + fileName;
            string destination = RuntimeRoot + fileName;

            if (AssetDatabase.LoadMainAssetAtPath(destination) != null)
            {
                var src = new System.IO.FileInfo(source);
                var dst = new System.IO.FileInfo(destination);

                if (src.Exists && dst.Exists && src.Length == dst.Length) return;

                UnityEngine.Debug.Log(
                    $"[Isoperia] owned model {fileName} is stale " +
                    $"({dst.Length} bytes vs source {src.Length}); refreshing.");

                if (!AssetDatabase.DeleteAsset(destination))
                    throw new System.InvalidOperationException("Could not replace owned model: " + fileName);
            }

            if (!AssetDatabase.CopyAsset(source, destination))
                throw new System.InvalidOperationException("Could not copy owned model: " + fileName);
        }

        private static void EnsureFolder(string parent, string child)
        {
            if (!AssetDatabase.IsValidFolder(parent + "/" + child))
                AssetDatabase.CreateFolder(parent, child);
        }
    }
}
