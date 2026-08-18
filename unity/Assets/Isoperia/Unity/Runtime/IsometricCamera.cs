using UnityEngine;

namespace Isoperia.Unity
{
    /// <summary>
    /// The fixed isometric camera. Port of the camera half of
    /// <c>src/core/Engine.ts</c>; the numbers are pinned in
    /// <c>docs/PORTING_SPEC.md</c> §2 and are not free parameters — the whole art
    /// pipeline is built around models only ever being seen from this angle.
    /// </summary>
    [RequireComponent(typeof(Camera))]
    public sealed class IsometricCamera : MonoBehaviour
    {
        /// <summary>
        /// 35.264389682…°, i.e. asin(tan(30°)). This is what makes a unit cube
        /// project to a true 2:1 diamond — the defining property of game
        /// isometric, and the reason a "close enough" 35° or 30° looks subtly
        /// wrong against tile art authored for it.
        /// </summary>
        public const float PitchDegrees = 35.264389682f;

        /// <summary>Camera sits to the south-west looking north-east.</summary>
        public const float YawDegrees = 45f;

        /// <summary>
        /// The TS orthographic frustum is 30 units tall. Unity's
        /// <c>orthographicSize</c> is the HALF-height, hence 15.
        /// </summary>
        public const float FrustumHeight = 30f;
        public const float OrthographicSize = FrustumHeight / 2f;

        /// <summary>Distance along the view axis. Only affects clipping, not scale.</summary>
        public const float Radius = 55f;

        [Header("Follow")]
        [Tooltip("World-space point the camera frames.")]
        public Vector3 Target = Vector3.zero;

        [Tooltip("Higher is snappier. Ignored while SnapPan is set.")]
        public float SmoothSpeed = 10f;

        [Tooltip("Set while the player is dragging or pinching: the camera then " +
                 "tracks the finger 1:1. Smoothing during a drag feels like lag.")]
        public bool SnapPan;

        [Header("Zoom")]
        [Range(0.5f, 2.5f)] public float Zoom = 1f;

        private Camera _cam;
        private Vector3 _smoothTarget;

        // Screen shake, ported from Engine.addShake.
        private float _shakeAmp;
        private const float ShakeCap = 1.1f;
        private const float ShakeDecay = 4f;

        private void Awake()
        {
            _cam = GetComponent<Camera>();
            _cam.orthographic = true;
            _cam.orthographicSize = OrthographicSize;
            _cam.nearClipPlane = 0.1f;
            _cam.farClipPlane = 1000f;

            _smoothTarget = Target;
            ApplyTransform(Vector3.zero);
        }

        /// <summary>Jar the camera — hits, kills. Accumulates, capped.</summary>
        public void AddShake(float amount)
        {
            _shakeAmp = Mathf.Min(ShakeCap, _shakeAmp + amount);
        }

        private void LateUpdate()
        {
            _smoothTarget = SnapPan
                ? Target
                : Vector3.Lerp(_smoothTarget, Target, 1f - Mathf.Exp(-SmoothSpeed * Time.deltaTime));

            Vector3 offset = Vector3.zero;
            if (_shakeAmp > 0.0001f)
            {
                offset = new Vector3(Random.Range(-1f, 1f), Random.Range(-1f, 1f), 0f) * (_shakeAmp * 0.3f);
                _shakeAmp = Mathf.Max(0f, _shakeAmp - ShakeDecay * Time.deltaTime);
            }

            _cam.orthographicSize = OrthographicSize / Mathf.Max(0.01f, Zoom);
            ApplyTransform(offset);
        }

        private void ApplyTransform(Vector3 shakeOffset)
        {
            // Rotation first, then step back along the view axis. Deriving the
            // position from the rotation (rather than from sin/cos by hand as the
            // TS does) keeps the two guaranteed consistent, and Unity's
            // left-handed Y-up basis makes hand-rolled trig easy to get subtly
            // wrong here.
            transform.rotation = Quaternion.Euler(PitchDegrees, YawDegrees + 180f, 0f);
            transform.position = _smoothTarget - transform.forward * Radius + shakeOffset;
        }

        /// <summary>
        /// Screen point to a point on the ground plane (y = 0). This is the basis
        /// of tap-to-move, so it belongs with the camera that defines the
        /// projection rather than in the input code.
        /// </summary>
        public bool ScreenToGround(Vector2 screenPos, out Vector3 world)
        {
            Ray ray = _cam.ScreenPointToRay(screenPos);
            var ground = new Plane(Vector3.up, Vector3.zero);

            if (ground.Raycast(ray, out float enter))
            {
                world = ray.GetPoint(enter);
                return true;
            }

            world = default;
            return false;
        }
    }
}
