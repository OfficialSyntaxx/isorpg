using UnityEngine;
using UnityEngine.InputSystem;

namespace Isoperia.Unity
{
    /// <summary>Perspective-world click bridge; Core systems remain authoritative for outcomes.</summary>
    public sealed class WorldInteractionController : MonoBehaviour
    {
        private void Update()
        {
            if (Mouse.current == null || !Mouse.current.leftButton.wasPressedThisFrame) return;
            Camera camera = Camera.main;
            if (camera == null || SaveDriver.Instance?.State?.Player?.Pos == null) return;

            Ray ray = camera.ScreenPointToRay(Mouse.current.position.ReadValue());
            if (!Physics.Raycast(ray, out RaycastHit hit, 300f)) return;
            WorldInteractionTarget target = hit.collider.GetComponentInParent<WorldInteractionTarget>();
            if (target == null) return;

            target.TryInteract(SaveDriver.Instance.State.Player.Pos);
        }
    }
}
