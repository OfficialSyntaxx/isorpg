using Isoperia.Core.Content;
using UnityEngine;

namespace Isoperia.Unity
{
    /// <summary>
    /// Unity's Resources-backed adapter for the Core content loader.
    /// Core deliberately accepts a reader delegate so its rules stay testable
    /// without Unity; this is the one Unity-specific boundary it needs.
    /// </summary>
    public static class UnityContentDatabase
    {
        private const string ResourcePrefix = "Content/";

        public static ContentDatabase Load()
        {
            return ContentDatabase.Load(name =>
            {
                TextAsset asset = Resources.Load<TextAsset>(ResourcePrefix + name);
                return asset == null ? null : asset.text;
            });
        }
    }
}
