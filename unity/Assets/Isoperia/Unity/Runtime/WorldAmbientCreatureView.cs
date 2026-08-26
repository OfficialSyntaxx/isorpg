using UnityEngine;

namespace Isoperia.Unity
{
    /// <summary>
    /// A tiny presentation-only idle wander for friendly creatures. It does not
    /// participate in Core navigation, collision, combat, or saving.
    /// </summary>
    public sealed class WorldAmbientCreatureView : MonoBehaviour
    {
        private Vector3 homePosition;
        private Quaternion homeRotation;
        private float phase;

        private void Awake()
        {
            homePosition = transform.localPosition;
            homeRotation = transform.localRotation;
            phase = Mathf.Repeat(transform.position.x * .83f + transform.position.z * 1.37f, Mathf.PI * 2f);
        }

        private void Update()
        {
            float time = Time.time + phase;
            Vector3 offset = new Vector3(Mathf.Sin(time * .62f) * .16f, Mathf.Sin(time * 2.1f) * .012f, Mathf.Cos(time * .48f) * .11f);
            transform.localPosition = homePosition + offset;

            Vector3 heading = new Vector3(Mathf.Cos(time * .62f), 0f, -Mathf.Sin(time * .48f));
            if (heading.sqrMagnitude > .001f)
            {
                Quaternion target = homeRotation * Quaternion.LookRotation(heading.normalized, Vector3.up);
                transform.localRotation = Quaternion.Slerp(transform.localRotation, target, Time.deltaTime * 1.6f);
            }
        }
    }
}
