using UnityEngine;

namespace Isoperia.Unity
{
    /// <summary>Normalizes imported GLB actors to a gameplay-scale height.</summary>
    public static class OwnedModelPresentation
    {
        public static void FitToHeight(GameObject model, float targetHeight)
        {
            if (model == null || targetHeight <= 0f) return;

            Renderer[] renderers = model.GetComponentsInChildren<Renderer>(true);
            if (renderers.Length == 0) return;

            Bounds bounds = renderers[0].bounds;
            for (int i = 1; i < renderers.Length; i++) bounds.Encapsulate(renderers[i].bounds);
            if (bounds.size.y < .0001f) return;

            model.transform.localScale *= targetHeight / bounds.size.y;
        }

        /// <summary>Fits an imported model, then puts its visible base on the supplied terrain height.</summary>
        public static void FitToHeight(GameObject model, float targetHeight, float groundHeight)
        {
            FitToHeight(model, targetHeight);
            if (model == null) return;

            Renderer[] renderers = model.GetComponentsInChildren<Renderer>(true);
            if (renderers.Length == 0) return;
            Bounds bounds = renderers[0].bounds;
            for (int i = 1; i < renderers.Length; i++) bounds.Encapsulate(renderers[i].bounds);
            model.transform.position += Vector3.up * (groundHeight - bounds.min.y);
        }
    }
}
