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
        private WorldResourceNode pendingNode;
        private WorldEnemyNode pendingEnemy;
        private Vector2 pointerDown;

        private void Awake()
        {
            grid = WorldRuntime.Instance == null
                ? new CoreGrid()
                : WorldRuntime.Instance.Grid;
            player = player != null ? player : FindPlayer();
            worldCamera = worldCamera != null ? worldCamera : Camera.main?.GetComponent<IsometricCamera>();

            if (player == null || worldCamera == null)
            {
                Debug.LogError("WorldPlayerController requires a player Transform and IsometricCamera.", this);
                enabled = false;
                return;
            }

            PositionComponent savedPosition = SaveDriver.Instance?.State?.Player?.Pos;
            int startX = savedPosition == null
                ? Mathf.Clamp(Mathf.FloorToInt(player.position.x), 0, grid.Width - 1)
                : Mathf.Clamp(savedPosition.Gx, 0, grid.Width - 1);
            int startY = savedPosition == null
                ? Mathf.Clamp(Mathf.FloorToInt(player.position.z), 0, grid.Height - 1)
                : Mathf.Clamp(savedPosition.Gy, 0, grid.Height - 1);
            if (!grid.IsWalkable(startX, startY))
            {
                startX = grid.Width / 2;
                startY = grid.Height / 2;
            }

            position = savedPosition ?? PositionComponent.Create(startX, startY);
            position.Gx = startX;
            position.Gy = startY;
            position.Wx = startX;
            position.Wz = startY;
            movement = new MovementSystem(position);
            movement.Arrived += OnArrived;
            worldCamera.Target = new Vector3((float)position.Wx + 0.5f, 0f, (float)position.Wz + 0.5f);
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

            if (SaveDriver.Instance != null && !string.IsNullOrEmpty(SaveDriver.Instance.PendingBuildingType))
            {
                SaveDriver.Instance.TryPlaceBuilding(goalX, goalY);
                return;
            }

            SaveDriver.Instance?.Gathering?.Interrupt();
            WorldEnemyNode enemy = SaveDriver.Instance?.Combat?.EnemyAt(goalX, goalY);
            if (enemy != null)
            {
                pendingNode = null;
                pendingEnemy = enemy;
                int enemyDistance = Mathf.Max(Mathf.Abs(position.Gx - goalX), Mathf.Abs(position.Gy - goalY));
                if (enemyDistance <= 1)
                {
                    SaveDriver.Instance.Combat.TryTarget(enemy, position);
                    pendingEnemy = null;
                    return;
                }

                var enemyPath = AStar.FindPath(grid, position.Gx, position.Gy, goalX, goalY, true);
                if (enemyPath != null) movement.SetPath(enemyPath);
                else pendingEnemy = null;
                return;
            }

            pendingNode = SaveDriver.Instance?.Resources?.NodeAt(goalX, goalY);
            if (pendingNode != null && !pendingNode.Depleted)
            {
                int distance = Mathf.Max(Mathf.Abs(position.Gx - goalX), Mathf.Abs(position.Gy - goalY));
                if (distance <= 1)
                {
                    BeginGathering(pendingNode);
                    return;
                }

                var nodePath = AStar.FindPath(grid, position.Gx, position.Gy, goalX, goalY, true);
                if (nodePath != null) movement.SetPath(nodePath);
                else pendingNode = null;
                return;
            }

            pendingNode = null;
            var path = AStar.FindPath(grid, position.Gx, position.Gy, goalX, goalY);
            if (path != null) movement.SetPath(path);
        }

        private void ApplyPlayerTransform()
        {
            if (player == null || position == null) return;

            Tile tile = grid.At(position.Gx, position.Gy);
            float elevation = OpenWorldTerrainView.SurfaceHeight(tile, (float)position.Wx + .5f, (float)position.Wz + .5f);
            player.position = new Vector3((float)position.Wx + 0.5f, elevation, (float)position.Wz + 0.5f);
            if (movement != null && movement.IsMoving)
            {
                player.rotation = Quaternion.Euler(0f, (float)(position.Facing * Mathf.Rad2Deg), 0f);
            }
        }

        private void OnArrived(int x, int y)
        {
            if (pendingEnemy != null)
            {
                WorldEnemyNode enemy = pendingEnemy;
                pendingEnemy = null;
                if (enemy.Alive) SaveDriver.Instance?.Combat?.TryTarget(enemy, position);
                return;
            }

            if (pendingNode == null) return;

            WorldResourceNode node = pendingNode;
            pendingNode = null;
            if (!node.Depleted) BeginGathering(node);
        }

        private void BeginGathering(WorldResourceNode node)
        {
            pendingNode = null;
            SaveDriver.Instance?.Gathering?.StartGathering(node);
        }

        private Transform FindPlayer()
        {
            Transform child = transform.Find("Hero_Prototype");
            if (child != null && child.gameObject.activeInHierarchy) return child;

            GameObject existing = GameObject.Find(WorldPlayerAvatarView.AvatarName);
            return existing != null ? existing.transform : WorldPlayerAvatarView.Create();
        }

        private void OnDestroy()
        {
            if (movement != null) movement.Arrived -= OnArrived;
        }
    }
}
