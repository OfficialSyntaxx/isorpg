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
            CopyIfMissing("hero_rigged.glb");
            AssetDatabase.SaveAssets();
            AssetDatabase.Refresh();
        }

        private static void CopyIfMissing(string fileName)
        {
            string destination = RuntimeRoot + fileName;
            if (AssetDatabase.LoadMainAssetAtPath(destination) != null) return;

            if (!AssetDatabase.CopyAsset(SourceRoot + fileName, destination))
                throw new System.InvalidOperationException("Could not copy owned model: " + fileName);
        }

        private static void EnsureFolder(string parent, string child)
        {
            if (!AssetDatabase.IsValidFolder(parent + "/" + child))
                AssetDatabase.CreateFolder(parent, child);
        }
    }
}
