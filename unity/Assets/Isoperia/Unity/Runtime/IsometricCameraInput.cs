using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.Controls;

namespace Isoperia.Unity
{
    /// <summary>
    /// Mobile/desktop camera gestures for the fixed isometric world.
    /// Panning is computed on the ground plane so it remains stable at any zoom.
    /// </summary>
    public sealed class IsometricCameraInput : MonoBehaviour
    {
        [SerializeField] private IsometricCamera worldCamera;
        [SerializeField] private Vector2 worldBounds = new Vector2(42f, 42f);
        [SerializeField] private float pinchSensitivity = 0.004f;

        private Vector2 previousPointer;
        private bool mousePanning;
        private float previousPinchDistance;

        private void Awake()
        {
            worldCamera = worldCamera != null ? worldCamera : GetComponent<IsometricCamera>();
        }

        private void Update()
        {
            if (worldCamera == null) return;

            if (TryHandleTouchGesture()) return;
            HandleMouseGesture();
            HandleZoomWheel();
        }

        private bool TryHandleTouchGesture()
        {
            Touchscreen touchscreen = Touchscreen.current;
            if (touchscreen == null) return false;

            TouchControl first = touchscreen.touches[0];
            TouchControl second = touchscreen.touches[1];
            bool firstActive = first.press.isPressed;
            bool secondActive = second.press.isPressed;

            if (firstActive && secondActive)
            {
                Vector2 firstPosition = first.position.ReadValue();
                Vector2 secondPosition = second.position.ReadValue();
                float distance = Vector2.Distance(firstPosition, secondPosition);

                if (previousPinchDistance > 0f)
                {
                    worldCamera.Zoom = Mathf.Clamp(
                        worldCamera.Zoom + (distance - previousPinchDistance) * pinchSensitivity,
                        0.5f,
                        2.5f);
                }

                previousPinchDistance = distance;
                return true;
            }

            previousPinchDistance = 0f;
            if (!firstActive) return false;

            Vector2 current = first.position.ReadValue();
            if (first.phase.ReadValue() == UnityEngine.InputSystem.TouchPhase.Began)
            {
                previousPointer = current;
                return true;
            }

            PanBetween(previousPointer, current);
            previousPointer = current;
            return true;
        }

        private void HandleMouseGesture()
        {
            if (Mouse.current == null) return;

            Vector2 current = Mouse.current.position.ReadValue();
            if (Mouse.current.middleButton.wasPressedThisFrame)
            {
                mousePanning = true;
                previousPointer = current;
            }

            if (Mouse.current.middleButton.wasReleasedThisFrame)
            {
                mousePanning = false;
            }

            if (mousePanning)
            {
                PanBetween(previousPointer, current);
                previousPointer = current;
            }
        }

        private void HandleZoomWheel()
        {
            if (Mouse.current == null) return;

            float wheel = Mouse.current.scroll.ReadValue().y;
            if (Mathf.Abs(wheel) < 0.01f) return;

            worldCamera.Zoom = Mathf.Clamp(worldCamera.Zoom + wheel * 0.0015f, 0.5f, 2.5f);
        }

        private void PanBetween(Vector2 from, Vector2 to)
        {
            if (!worldCamera.ScreenToGround(from, out Vector3 fromWorld)) return;
            if (!worldCamera.ScreenToGround(to, out Vector3 toWorld)) return;

            Vector3 delta = fromWorld - toWorld;
            Vector3 target = worldCamera.Target + new Vector3(delta.x, 0f, delta.z);
            worldCamera.Target = new Vector3(
                Mathf.Clamp(target.x, 0f, worldBounds.x),
                0f,
                Mathf.Clamp(target.z, 0f, worldBounds.y));
        }
    }
}
