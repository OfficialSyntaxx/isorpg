using Isoperia.Core.AI;
using Isoperia.Core.Components;
using Isoperia.Core.Systems;
using Isoperia.Core.World;
using UnityEngine;
using UnityEngine.InputSystem;
using CoreGrid = Isoperia.Core.World.Grid;

namespace Isoperia.Unity
{
    /// <summary>
    /// Touch/mouse bridge for the Bootstrap player prototype.
    /// Input selects a tile; Core owns pathfinding and movement; this component
    /// only presents the interpolated position on the imported hero model.
    /// </summary>
    public sealed class WorldPlayerController : MonoBehaviour
    {
        [SerializeField] private Transform player;
        [SerializeField] private IsometricCamera worldCamera;
        [SerializeField] private float tapMoveThreshold = 12f;

        private CoreGrid grid;
        private PositionComponent position;
        private MovementSystem movement;
        private Vector2 pointerDown;

        private void Awake()
        {
            grid = new CoreGrid();
            player = player != null ? player : FindPlayer();
            worldCamera = worldCamera != null ? worldCamera : Camera.main?.GetComponent<IsometricCamera>();

            if (player == null || worldCamera == null)
            {
                Debug.LogError("WorldPlayerController requires a player Transform and IsometricCamera.", this);
                enabled = false;
                return;
            }

            int startX = Mathf.Clamp(Mathf.RoundToInt(player.position.x), 0, grid.Width - 1);
            int startY = Mathf.Clamp(Mathf.RoundToInt(player.position.z), 0, grid.Height - 1);
            if (!grid.IsWalkable(startX, startY))
            {
                startX = grid.Width / 2;
                startY = grid.Height / 2;
            }

            position = PositionComponent.Create(startX, startY);
            movement = new MovementSystem(position);
            movement.Arrived += OnArrived;
            ApplyPlayerTransform();
        }

        private void Update()
        {
            if (TryGetTap(out Vector2 screenPosition))
            {
                MoveToScreenPosition(screenPosition);
            }

            movement?.Update(Time.deltaTime);
            ApplyPlayerTransform();
        }

        private bool TryGetTap(out Vector2 screenPosition)
        {
            screenPosition = new Vector2();

            if (Touchscreen.current != null && Touchscreen.current.primaryTouch.press.wasPressedThisFrame)
            {
                pointerDown = Touchscreen.current.primaryTouch.position.ReadValue();
            }

            if (Touchscreen.current != null && Touchscreen.current.primaryTouch.press.wasReleasedThisFrame)
            {
                Vector2 released = Touchscreen.current.primaryTouch.position.ReadValue();
                if (Vector2.Distance(pointerDown, released) <= tapMoveThreshold)
                {
                    screenPosition = released;
                    return true;
                }
            }

            if (Mouse.current == null) return false;

            if (Mouse.current.leftButton.wasPressedThisFrame)
            {
                pointerDown = Mouse.current.position.ReadValue();
            }

            if (Mouse.current.leftButton.wasReleasedThisFrame)
            {
                Vector2 released = Mouse.current.position.ReadValue();
                if (Vector2.Distance(pointerDown, released) <= tapMoveThreshold)
                {
                    screenPosition = released;
                    return true;
                }
            }

            return false;
        }

        private void MoveToScreenPosition(Vector2 screenPosition)
        {
            if (!worldCamera.ScreenToGround(screenPosition, out Vector3 world)) return;

            int goalX = Mathf.FloorToInt(world.x);
            int goalY = Mathf.FloorToInt(world.z);
            if (goalX < 0 || goalY < 0 || goalX >= grid.Width || goalY >= grid.Height) return;

            var path = AStar.FindPath(grid, position.Gx, position.Gy, goalX, goalY);
            if (path != null) movement.SetPath(path);
        }

        private void ApplyPlayerTransform()
        {
            if (player == null || position == null) return;

            Tile tile = grid.At(position.Gx, position.Gy);
            float elevation = tile == null ? 0.04f : (float)tile.Elevation + 0.04f;
            player.position = new Vector3((float)position.Wx + 0.5f, elevation, (float)position.Wz + 0.5f);
            if (movement != null && movement.IsMoving)
            {
                player.rotation = Quaternion.Euler(0f, (float)(position.Facing * Mathf.Rad2Deg), 0f);
            }
        }

        private void OnArrived(int x, int y)
        {
            // Keep the camera framing stable for now; the Phase 3 pan gesture
            // will make camera-follow behavior an explicit player choice.
        }

        private Transform FindPlayer()
        {
            Transform child = transform.Find("Hero_Prototype");
            return child != null ? child : GameObject.Find("Hero_Prototype")?.transform;
        }

        private void OnDestroy()
        {
            if (movement != null) movement.Arrived -= OnArrived;
        }
    }
}
