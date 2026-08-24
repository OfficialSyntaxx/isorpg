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
        private float phase;

        private void Awake()
        {
            basePosition = transform.localPosition;
            phase = (transform.position.x * .73f + transform.position.z * 1.19f) % 6.28f;
        }

        private void Update()
        {
            float time = Time.time + phase;
            transform.localPosition = basePosition + Vector3.up * (Mathf.Sin(time * 1.6f) * .012f);
            transform.localRotation = Quaternion.Euler(0f, Mathf.Sin(time * .42f) * 13f, 0f);
        }
    }
}
