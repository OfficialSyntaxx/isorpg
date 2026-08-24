using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.Controls;
using CoreGrid = Isoperia.Core.World.Grid;

namespace Isoperia.Unity
{
    /// <summary>Camera-relative third-person locomotion; Core position remains a coarse save marker.</summary>
    [RequireComponent(typeof(CharacterController))]
    public sealed class OpenWorldPlayerController : MonoBehaviour
    {
        private Transform cameraTransform;
        private bool spawned;

        // The lower-left portion of a touch screen is a direct virtual stick.
        // Keeping the gesture in the controller makes the actual gameplay input
        // owner explicit instead of relying on the disabled isometric prototype.
        private const float TouchMoveArea = .48f;
        private const float TouchMoveRadius = 92f;
        private const float WalkSpeed = 4.35f;
        private const float SprintSpeed = 6.1f;
        private const float MaxTerrainRise = .52f;

        public bool IsMoving { get; private set; }
        public bool IsSprinting { get; private set; }

        private void Awake()
        {
            CharacterController collider = GetComponent<CharacterController>();
            // The mainland uses a procedurally rebuilt mesh collider. On some
            // reloads Unity resolves its initial overlap by ejecting a
            // CharacterController far outside the mesh. Locomotion already has
            // deterministic water and slope checks below, so ground directly on
            // the authoritative terrain sampler and keep this legacy collider
            // disabled rather than letting physics own player position.
            if (collider != null) collider.enabled = false;
            cameraTransform = Camera.main != null ? Camera.main.transform : null;
        }

        private void Update()
        {
            if (cameraTransform == null) cameraTransform = Camera.main != null ? Camera.main.transform : null;
            if (cameraTransform == null) return;
            Vector2 input = Keyboard.current == null ? Vector2.zero : new Vector2(
                (Keyboard.current.dKey.isPressed ? 1 : 0) - (Keyboard.current.aKey.isPressed ? 1 : 0),
                (Keyboard.current.wKey.isPressed ? 1 : 0) - (Keyboard.current.sKey.isPressed ? 1 : 0));
            if (Gamepad.current != null) input += Gamepad.current.leftStick.ReadValue();
            input += ReadTouchMove();
            input = Vector2.ClampMagnitude(input, 1f);
            Vector3 forward = Vector3.ProjectOnPlane(cameraTransform.forward, Vector3.up).normalized;
            Vector3 right = Vector3.ProjectOnPlane(cameraTransform.right, Vector3.up).normalized;
            Vector3 moveDirection = forward * input.y + right * input.x;
            IsSprinting = WantsSprint(input);
            float speed = IsSprinting ? SprintSpeed : WalkSpeed;
            Vector3 move = moveDirection * speed;
            Vector3 candidate = transform.position + move * Time.deltaTime;
            if (!CanStepTo(transform.position, candidate))
            {
                move = Vector3.zero;
                IsSprinting = false;
            }
            IsMoving = move.sqrMagnitude > .01f;
            if (IsMoving) transform.rotation = Quaternion.Slerp(transform.rotation, Quaternion.LookRotation(move), 14f * Time.deltaTime);
            if (IsMoving)
            {
                candidate = transform.position + move * Time.deltaTime;
                CoreGrid grid = WorldRuntime.Instance == null ? new CoreGrid() : WorldRuntime.Instance.Grid;
                int x = Mathf.FloorToInt(candidate.x);
                int z = Mathf.FloorToInt(candidate.z);
                candidate.y = OpenWorldTerrainView.SurfaceHeight(grid.At(x, z), candidate.x, candidate.z) + .03f;
                transform.position = candidate;
            }
            SyncStatePosition();
        }

        private static Vector2 ReadTouchMove()
        {
            Touchscreen touchscreen = Touchscreen.current;
            if (touchscreen == null) return Vector2.zero;

            TouchControl touch = touchscreen.primaryTouch;
            if (!touch.press.isPressed) return Vector2.zero;

            Vector2 start = touch.startPosition.ReadValue();
            if (start.x > Screen.width * TouchMoveArea) return Vector2.zero;

            Vector2 delta = touch.position.ReadValue() - start;
            return Vector2.ClampMagnitude(delta / TouchMoveRadius, 1f);
        }

        private static bool WantsSprint(Vector2 input)
        {
            if (input.sqrMagnitude < .01f) return false;
            if (Keyboard.current != null && (Keyboard.current.leftShiftKey.isPressed || Keyboard.current.rightShiftKey.isPressed))
                return true;
            return Gamepad.current != null && Gamepad.current.leftStickButton.isPressed;
        }

        private static bool CanStepTo(Vector3 sourcePosition, Vector3 candidate)
        {
            CoreGrid grid = WorldRuntime.Instance == null ? new CoreGrid() : WorldRuntime.Instance.Grid;
            int currentX = Mathf.FloorToInt(candidate.x);
            int currentZ = Mathf.FloorToInt(candidate.z);
            if (currentX < 0 || currentZ < 0 || currentX >= grid.Width || currentZ >= grid.Height) return false;
            var destination = grid.At(currentX, currentZ);
            if (destination == null || destination.TerrainType == Isoperia.Core.World.TerrainType.Water) return false;

            int sourceX = Mathf.FloorToInt(sourcePosition.x);
            int sourceZ = Mathf.FloorToInt(sourcePosition.z);
            if (sourceX < 0 || sourceZ < 0 || sourceX >= grid.Width || sourceZ >= grid.Height) return false;
            var source = grid.At(sourceX, sourceZ);
            if (source == null) return false;
            float sourceHeight = OpenWorldTerrainView.SurfaceHeight(source, sourceX + .5f, sourceZ + .5f);
            float destinationHeight = OpenWorldTerrainView.SurfaceHeight(destination, candidate.x, candidate.z);
            return Mathf.Abs(destinationHeight - sourceHeight) <= MaxTerrainRise;
        }

        private void Start()
        {
            if (spawned) return;
            if (cameraTransform == null) cameraTransform = Camera.main != null ? Camera.main.transform : null;
            int x = SaveDriver.Instance?.State?.Player?.Pos?.Gx ?? CoreGrid.TownCenter;
            int z = SaveDriver.Instance?.State?.Player?.Pos?.Gy ?? CoreGrid.TownCenter;
            CoreGrid grid = WorldRuntime.Instance == null ? new CoreGrid() : WorldRuntime.Instance.Grid;
            if (x < 0 || z < 0 || x >= grid.Width || z >= grid.Height || !grid.IsWalkable(x, z))
            {
                x = CoreGrid.TownCenter;
                z = CoreGrid.TownCenter;
            }
            var tile = grid.At(x, z);
            transform.position = new Vector3(x + .5f, OpenWorldTerrainView.SurfaceHeight(tile, x + .5f, z + .5f) + .03f, z + .5f);
            SyncStatePosition();
            spawned = true;
        }

        private void SyncStatePosition()
        {
            if (SaveDriver.Instance?.State?.Player?.Pos == null) return;
            var pos = SaveDriver.Instance.State.Player.Pos;
            float x = Mathf.Clamp(transform.position.x, .001f, CoreGrid.WorldSize - .001f);
            float z = Mathf.Clamp(transform.position.z, .001f, CoreGrid.WorldSize - .001f);
            pos.Gx = Mathf.FloorToInt(x);
            pos.Gy = Mathf.FloorToInt(z);
            pos.Wx = x;
            pos.Wz = z;
        }

        /// <summary>
        /// Presentation bridge for an already-authoritative map destination.
        /// It never invents a target: the caller supplies a validated mainland
        /// coordinate, then this controller places the CharacterController on
        /// its terrain surface and immediately updates the saved coarse marker.
        /// </summary>
        public bool TryTeleportTo(int x, int z)
        {
            CoreGrid grid = WorldRuntime.Instance == null ? new CoreGrid() : WorldRuntime.Instance.Grid;
            if (x < 0 || z < 0 || x >= grid.Width || z >= grid.Height || !grid.IsWalkable(x, z)) return false;

            var tile = grid.At(x, z);
            transform.position = new Vector3(x + .5f, OpenWorldTerrainView.SurfaceHeight(tile, x + .5f, z + .5f) + .03f, z + .5f);
            SyncStatePosition();
            return true;
        }

        private void OnDisable()
        {
            IsMoving = false;
            IsSprinting = false;
        }
    }
}
