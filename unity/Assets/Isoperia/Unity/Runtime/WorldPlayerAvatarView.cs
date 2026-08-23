using UnityEngine;

namespace Isoperia.Unity
{
    /// <summary>
    /// Small built-in avatar used while the imported hero GLB is prepared for the
    /// Humanoid animation pass. It keeps player movement legible without letting
    /// malformed imported geometry obscure the fixed isometric world.
    /// </summary>
    public sealed class WorldPlayerAvatarView : MonoBehaviour
    {
        public const string AvatarName = "PlayerAvatar";

        private Material tunic;
        private Material skin;

        public static Transform Create()
        {
            var root = new GameObject(AvatarName);
            root.AddComponent<WorldPlayerAvatarView>();
            return root.transform;
        }

        private void Awake()
        {
            tunic = CreateMaterial(new Color(.18f, .33f, .58f, 1f));
            skin = CreateMaterial(new Color(.78f, .52f, .36f, 1f));

            CreatePart(PrimitiveType.Capsule, "Tunic", new Vector3(0f, .47f, 0f),
                new Vector3(.28f, .45f, .28f), tunic);
            CreatePart(PrimitiveType.Sphere, "Head", new Vector3(0f, .97f, 0f),
                new Vector3(.30f, .30f, .30f), skin);
        }

        private void CreatePart(PrimitiveType type, string partName, Vector3 localPosition,
            Vector3 localScale, Material material)
        {
            GameObject part = GameObject.CreatePrimitive(type);
            part.name = partName;
            part.transform.SetParent(transform, false);
            part.transform.localPosition = localPosition;
            part.transform.localScale = localScale;
            part.GetComponent<Renderer>().sharedMaterial = material;
            Destroy(part.GetComponent<Collider>());
        }

        private static Material CreateMaterial(Color color)
        {
            Shader shader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
            return new Material(shader) { color = color };
        }

        private void OnDestroy()
        {
            if (tunic != null) Destroy(tunic);
            if (skin != null) Destroy(skin);
        }
    }
}
