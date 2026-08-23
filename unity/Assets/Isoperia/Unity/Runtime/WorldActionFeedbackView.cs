using UnityEngine;

namespace Isoperia.Unity
{
    /// <summary>
    /// Presentation-only feedback for a successful world interaction. Core systems
    /// still own action success, damage, rewards, and all saved state.
    /// </summary>
    public sealed class WorldActionFeedbackView : MonoBehaviour
    {
        private const float FeedbackSeconds = .85f;

        private WorldInteractionTarget target;
        private Transform ring;
        private Material material;
        private float remaining;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void Create()
        {
            if (Object.FindAnyObjectByType<WorldActionFeedbackView>() != null) return;
            new GameObject(nameof(WorldActionFeedbackView)).AddComponent<WorldActionFeedbackView>();
        }

        private void OnEnable()
        {
            WorldInteractionTarget.InteractionStarted += Show;
        }

        private void OnDisable()
        {
            WorldInteractionTarget.InteractionStarted -= Show;
        }

        private void Update()
        {
            if (remaining <= 0f || target == null)
            {
                if (ring != null) ring.gameObject.SetActive(false);
                return;
            }

            remaining -= Time.deltaTime;
            float normalized = 1f - Mathf.Clamp01(remaining / FeedbackSeconds);
            ring.position = target.transform.position + Vector3.up * .04f;
            ring.localScale = Vector3.one * Mathf.Lerp(.45f, 1.2f, normalized);
            material.color = ColorFor(target, 1f - normalized);
        }

        private void Show(WorldInteractionTarget newTarget)
        {
            target = newTarget;
            remaining = FeedbackSeconds;
            EnsureRing();
            ring.gameObject.SetActive(true);
        }

        private void EnsureRing()
        {
            if (ring != null) return;
            GameObject indicator = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            indicator.name = "WorldInteractionFeedback";
            indicator.transform.SetParent(transform, false);
            indicator.transform.localScale = new Vector3(1f, .015f, 1f);
            Destroy(indicator.GetComponent<Collider>());
            Shader shader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
            material = new Material(shader);
            material.EnableKeyword("_EMISSION");
            indicator.GetComponent<Renderer>().sharedMaterial = material;
            ring = indicator.transform;
            indicator.SetActive(false);
        }

        private Color ColorFor(WorldInteractionTarget interaction, float alpha)
        {
            Color color = interaction.IsEnemy ? new Color(1f, .26f, .12f) :
                interaction.IsNpc ? new Color(.96f, .74f, .22f) : new Color(.24f, .88f, .52f);
            material.SetColor("_EmissionColor", color * (1.25f + alpha));
            return color;
        }

        private void OnDestroy()
        {
            if (material != null) Destroy(material);
        }
    }
}
