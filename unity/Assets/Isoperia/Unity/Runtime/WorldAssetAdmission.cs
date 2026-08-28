namespace Isoperia.Unity
{
    /// <summary>
    /// Explicit runtime gate for presentation assets. Imported source files are
    /// not world-ready merely because Unity can instantiate them: each one must
    /// pass the isolated review scene and be added here before live placement.
    /// </summary>
    public static class WorldAssetAdmission
    {
        public static bool IsApproved(string resourcePath)
        {
            // Phase 0: only the known CC0 town kit is admitted. The locally
            // authored/owned FBX and GLB files are quarantined until their
            // helper geometry, pivots, materials, and proportions are reviewed.
            return !string.IsNullOrEmpty(resourcePath) &&
                resourcePath.StartsWith("Art/KenneyFantasyTown/");
        }
    }
}
