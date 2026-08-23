using UnityEngine;

namespace Isoperia.Unity
{
    /// <summary>
    /// Presentation bridge from the saved Core clock to the Bootstrap sun, sky,
    /// and ambient light. The clock advances on the simulation tick elsewhere;
    /// this component only reads it and updates visuals when its minute changes.
    /// </summary>
    public sealed class WorldLightingController : MonoBehaviour
    {
        private static readonly Color NightSun = new Color(0.56f, 0.64f, 0.77f, 1f);
        private static readonly Color DaySun = new Color(1f, 0.95f, 0.87f, 1f);
        private static readonly Color NightSky = new Color(0.05f, 0.09f, 0.15f, 1f);
        private static readonly Color DaySky = new Color(0.50f, 0.66f, 0.76f, 1f);
        private static readonly Color NightAmbient = new Color(0.08f, 0.10f, 0.16f, 1f);
        private static readonly Color DayAmbient = new Color(0.46f, 0.43f, 0.35f, 1f);

        private Light sun;
        private Camera mainCamera;
        private int lastMinute = -1;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void CreateController()
        {
            if (Object.FindAnyObjectByType<WorldLightingController>() != null) return;

            var controller = new GameObject(nameof(WorldLightingController));
            controller.AddComponent<WorldLightingController>();
        }

        private void Start()
        {
            sun = GameObject.Find("Sun")?.GetComponent<Light>();
            mainCamera = Camera.main;
            ApplyLighting();
        }

        private void Update()
        {
            int minute = SaveDriver.Instance?.State?.ClockMinute ?? -1;
            if (minute == lastMinute) return;

            ApplyLighting();
        }

        private void ApplyLighting()
        {
            int minute = SaveDriver.Instance?.State?.ClockMinute ?? 0;
            lastMinute = minute;
            float daylight = DaylightFactor(minute);
            float hour = minute / 60f;

            if (sun != null)
            {
                sun.intensity = 0.2f + 0.8f * daylight;
                sun.color = Color.Lerp(NightSun, DaySun, daylight);
                float sunAngle = Mathf.Lerp(18f, 162f, Mathf.Clamp01((hour - 6.5f) / 13f));
                sun.transform.rotation = Quaternion.Euler(sunAngle, -35f, 0f);
            }

            RenderSettings.ambientLight = Color.Lerp(NightAmbient, DayAmbient, daylight);
            if (mainCamera != null) mainCamera.backgroundColor = Color.Lerp(NightSky, DaySky, daylight);
        }

        /// <summary>Port of the web dayFactor helper: dawn 06:30, dusk 19:30.</summary>
        public static float DaylightFactor(int minute)
        {
            float hour = Mathf.Clamp(minute, 0, 1439) / 60f;
            if (hour < 6.5f || hour > 19.5f) return 0f;
            float factor = hour <= 12.5f
                ? (hour - 6.5f) / 6f
                : (19.5f - hour) / 6f;
            return Mathf.Clamp01(factor);
        }
    }
}
