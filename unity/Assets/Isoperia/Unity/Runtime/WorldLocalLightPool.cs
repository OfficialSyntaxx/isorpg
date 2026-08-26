using UnityEngine;

namespace Isoperia.Unity
{
    /// <summary>Fades an authored local light against the Core-driven day/night cycle.</summary>
    [RequireComponent(typeof(Light))]
    public sealed class WorldLocalLightPool : MonoBehaviour
    {
        [SerializeField] private float nightIntensity = 1.4f;
        private Light source;
        private int lastMinute = -1;

        private void Awake()
        {
            source = GetComponent<Light>();
        }

        private void Update()
        {
            int minute = SaveDriver.Instance?.State?.ClockMinute ?? 0;
            if (minute == lastMinute) return;
            lastMinute = minute;
            float darkness = 1f - WorldLightingController.DaylightFactor(minute);
            source.intensity = nightIntensity * Mathf.Lerp(.18f, 1f, darkness);
        }
    }
}
