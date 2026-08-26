using UnityEngine;

namespace Isoperia.Unity
{
    /// <summary>
    /// Lightweight ambient presentation for stationary settlement contacts.
    /// The NPC remains at its authored interaction position; this only gives the
    /// mesh a readable idle presence in the hybrid third-person view.
    /// </summary>
    public sealed class WorldNpcAmbientView : MonoBehaviour
    {
        private Vector3 basePosition;
        private Quaternion baseRotation;
        private float phase;
        private float greetingUntil;

        private void Awake()
        {
            basePosition = transform.localPosition;
            baseRotation = transform.localRotation;
            phase = (transform.position.x * .73f + transform.position.z * 1.19f) % 6.28f;
        }

        private void OnEnable()
        {
            WorldInteractionTarget.InteractionStarted += OnInteractionStarted;
        }

        private void OnDisable()
        {
            WorldInteractionTarget.InteractionStarted -= OnInteractionStarted;
        }

        private void Update()
        {
            float time = Time.time + phase;
            transform.localPosition = basePosition + Vector3.up * (Mathf.Sin(time * 1.6f) * .012f);
            float idleYaw = Mathf.Sin(time * .42f) * 13f;
            if (Time.time < greetingUntil)
            {
                float progress = 1f - (greetingUntil - Time.time) / .42f;
                idleYaw += Mathf.Sin(progress * Mathf.PI) * 38f;
            }
            transform.localRotation = baseRotation * Quaternion.Euler(0f, idleYaw, 0f);
        }

        private void OnInteractionStarted(WorldInteractionTarget target)
        {
            if (target == null) return;
            Transform targetTransform = target.transform;
            if (targetTransform == transform || targetTransform.IsChildOf(transform))
                greetingUntil = Time.time + .42f;
        }
    }
}
