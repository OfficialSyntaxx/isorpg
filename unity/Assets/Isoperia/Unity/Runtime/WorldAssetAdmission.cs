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
            // The imported CC0 town kit and the locally authored Hearthvale
            // family are the reviewed runtime lane. Keeping this decision in
            // one gate prevents a raw experiment from silently appearing in
            // the playable world while allowing the authored player, NPC,
            // resource, and settlement models to replace primitive fallbacks.
            return !string.IsNullOrEmpty(resourcePath) &&
                (resourcePath.StartsWith("Art/KenneyFantasyTown/") ||
                 resourcePath.StartsWith("Art/OwnedModels/"));
        }
    }
}
