using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.Controls;

namespace Isoperia.Unity
{
    /// <summary>Hybrid third-person camera: follow by default, orbit and zoom on demand.</summary>
    [RequireComponent(typeof(Camera))]
    public sealed class OpenWorldCameraController : MonoBehaviour
    {
        private Transform target;
        private float yaw = 38f;
        private float pitch = 30f;
        private float distance = 9.2f;
        private float previousPinchDistance;
        private float shakeAmplitude;

        private void Start()
        {
            target = GameObject.Find(WorldPlayerAvatarView.AvatarName)?.transform;
            GetComponent<Camera>().orthographic = false;
            GetComponent<Camera>().fieldOfView = 56f;
        }

        private void LateUpdate()
        {
            if (target == null) return;
            if (Mouse.current != null && Mouse.current.rightButton.isPressed)
            {
                Vector2 delta = Mouse.current.delta.ReadValue();
                yaw += delta.x * .18f; pitch = Mathf.Clamp(pitch - delta.y * .12f, 12f, 52f);
            }
            if (Mouse.current != null) distance = Mathf.Clamp(distance - Mouse.current.scroll.ReadValue().y * .004f, 3.9f, 11f);
            HandleTouchCamera();
            if (Gamepad.current != null)
            {
                Vector2 look = Gamepad.current.rightStick.ReadValue();
                yaw += look.x * 110f * Time.deltaTime; pitch = Mathf.Clamp(pitch - look.y * 70f * Time.deltaTime, 8f, 58f);
            }
            Quaternion orbit = Quaternion.Euler(pitch, yaw, 0f);
            Vector3 focus = target.position + Vector3.up * .95f;
            Vector3 desiredOffset = -(orbit * Vector3.forward) * distance;
            float resolvedDistance = ResolveObstructionDistance(focus, desiredOffset, distance);
            Vector3 position = focus + desiredOffset.normalized * resolvedDistance;
            if (shakeAmplitude > 0f)
            {
                float time = Time.unscaledTime * 46f;
                position += new Vector3(Mathf.Sin(time * 1.31f), Mathf.Cos(time), 0f) * shakeAmplitude;
                shakeAmplitude = Mathf.Max(0f, shakeAmplitude - Time.unscaledDeltaTime * .46f);
            }
            transform.position = position;
            transform.rotation = orbit;
        }

        /// <summary>Presentation-only impact response; it never changes camera orbit state.</summary>
        public void AddShake(float amount)
        {
            shakeAmplitude = Mathf.Clamp(shakeAmplitude + amount, 0f, .12f);
        }

        private float ResolveObstructionDistance(Vector3 focus, Vector3 desiredOffset, float desiredDistance)
        {
            if (Physics.SphereCast(focus, .18f, desiredOffset.normalized, out RaycastHit hit, desiredDistance,
                Physics.DefaultRaycastLayers, QueryTriggerInteraction.Ignore) &&
                (target == null || !hit.collider.transform.IsChildOf(target)))
            {
                return Mathf.Clamp(hit.distance - .14f, 2.6f, desiredDistance);
            }
            return desiredDistance;
        }

        private void HandleTouchCamera()
        {
            Touchscreen touchscreen = Touchscreen.current;
            if (touchscreen == null) return;

            TouchControl first = touchscreen.touches[0];
            TouchControl second = touchscreen.touches[1];
            if (first.press.isPressed && second.press.isPressed)
            {
                float pinchDistance = Vector2.Distance(first.position.ReadValue(), second.position.ReadValue());
                if (previousPinchDistance > 0f)
                    distance = Mathf.Clamp(distance - (pinchDistance - previousPinchDistance) * .012f, 3.9f, 11f);
                previousPinchDistance = pinchDistance;
                return;
            }

            previousPinchDistance = 0f;
            TouchControl touch = touchscreen.primaryTouch;
            if (!touch.press.isPressed) return;

            // The right half is reserved for looking, leaving the left half for
            // movement. A tap on either half still reaches interaction handling.
            if (touch.startPosition.ReadValue().x < Screen.width * .48f) return;
            Vector2 delta = touch.delta.ReadValue();
            yaw += delta.x * .18f;
            pitch = Mathf.Clamp(pitch - delta.y * .12f, 12f, 52f);
        }
    }
}
