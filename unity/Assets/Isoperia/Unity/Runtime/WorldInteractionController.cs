using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.Controls;

namespace Isoperia.Unity
{
    /// <summary>Perspective-world click bridge; Core systems remain authoritative for outcomes.</summary>
    public sealed class WorldInteractionController : MonoBehaviour
    {
        private const float TapSlop = 18f;

        private void Update()
        {
            if (!TryGetTap(out Vector2 screenPosition)) return;
            Camera camera = Camera.main;
            if (camera == null || SaveDriver.Instance?.State?.Player?.Pos == null) return;

            Ray ray = camera.ScreenPointToRay(screenPosition);
            if (!Physics.Raycast(ray, out RaycastHit hit, 300f)) return;
            WorldInteractionTarget target = hit.collider.GetComponentInParent<WorldInteractionTarget>();
            if (target == null) return;

            target.TryInteract(SaveDriver.Instance.State.Player.Pos);
        }

        private static bool TryGetTap(out Vector2 screenPosition)
        {
            screenPosition = Vector2.zero;
            Touchscreen touchscreen = Touchscreen.current;
            if (touchscreen != null && touchscreen.primaryTouch.press.wasReleasedThisFrame)
            {
                TouchControl touch = touchscreen.primaryTouch;
                Vector2 released = touch.position.ReadValue();
                if (Vector2.Distance(touch.startPosition.ReadValue(), released) <= TapSlop)
                {
                    screenPosition = released;
                    return true;
                }
            }

            if (Mouse.current == null || !Mouse.current.leftButton.wasPressedThisFrame) return false;
            screenPosition = Mouse.current.position.ReadValue();
            return true;
        }
    }
}
