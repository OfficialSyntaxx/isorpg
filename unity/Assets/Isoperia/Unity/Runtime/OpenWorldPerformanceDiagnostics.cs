using UnityEngine;

namespace Isoperia.Unity
{
    /// <summary>
    /// Collects one lightweight development-only Play Mode baseline without relying on
    /// the Editor Profiler window. It removes itself after reporting so it cannot become
    /// a recurring gameplay cost.
    /// </summary>
    public sealed class OpenWorldPerformanceDiagnostics : MonoBehaviour
    {
#if UNITY_EDITOR || DEVELOPMENT_BUILD
        private const float WarmupSeconds = 1f;
        private const float SampleSeconds = 5f;

        private float elapsed;
        private float accumulatedMilliseconds;
        private float worstMilliseconds;
        private int frameCount;
        private bool sampling;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        private static void Create()
        {
            if (Object.FindAnyObjectByType<OpenWorldPerformanceDiagnostics>() != null)
            {
                return;
            }

            var probe = new GameObject(nameof(OpenWorldPerformanceDiagnostics));
            DontDestroyOnLoad(probe);
            probe.AddComponent<OpenWorldPerformanceDiagnostics>();
        }

        private void Update()
        {
            elapsed += Time.unscaledDeltaTime;
            if (!sampling)
            {
                if (elapsed < WarmupSeconds)
                {
                    return;
                }

                sampling = true;
                elapsed = 0f;
                return;
            }

            float milliseconds = Time.unscaledDeltaTime * 1000f;
            accumulatedMilliseconds += milliseconds;
            worstMilliseconds = Mathf.Max(worstMilliseconds, milliseconds);
            frameCount++;

            if (elapsed >= SampleSeconds)
            {
                Report();
                Destroy(gameObject);
            }
        }

        private void Report()
        {
            float averageMilliseconds = frameCount == 0 ? 0f : accumulatedMilliseconds / frameCount;
            float framesPerSecond = averageMilliseconds <= 0f ? 0f : 1000f / averageMilliseconds;
            int rendererCount = Object.FindObjectsByType<Renderer>().Length;
            int lightCount = Object.FindObjectsByType<Light>().Length;
            int colliderCount = Object.FindObjectsByType<Collider>().Length;

            Debug.Log($"[Isoperia Performance] 5 s baseline: avg {averageMilliseconds:F2} ms " +
                      $"({framesPerSecond:F1} fps), worst {worstMilliseconds:F2} ms, " +
                      $"renderers {rendererCount}, lights {lightCount}, colliders {colliderCount}.");
        }
#endif
    }
}
