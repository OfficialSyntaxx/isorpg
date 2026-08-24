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
        private CharacterController controller;
        private Transform cameraTransform;
        private float verticalSpeed;
        private bool spawned;

        // The lower-left portion of a touch screen is a direct virtual stick.
        // Keeping the gesture in the controller makes the actual gameplay input
        // owner explicit instead of relying on the disabled isometric prototype.
        private const float TouchMoveArea = .48f;
        private const float TouchMoveRadius = 92f;

        public bool IsMoving { get; private set; }

        private void Awake()
        {
            controller = GetComponent<CharacterController>();
            controller.height = 1.4f;
            controller.radius = .28f;
            controller.center = new Vector3(0f, .7f, 0f);
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
            Vector3 move = (forward * input.y + right * input.x) * 5f;
            IsMoving = move.sqrMagnitude > .01f;
            if (IsMoving) transform.rotation = Quaternion.Slerp(transform.rotation, Quaternion.LookRotation(move), 14f * Time.deltaTime);
            verticalSpeed = controller.isGrounded ? -.5f : verticalSpeed + Physics.gravity.y * Time.deltaTime;
            controller.Move((move + Vector3.up * verticalSpeed) * Time.deltaTime);
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

        private void Start()
        {
            if (spawned) return;
            if (cameraTransform == null) cameraTransform = Camera.main != null ? Camera.main.transform : null;
            int x = SaveDriver.Instance?.State?.Player?.Pos?.Gx ?? CoreGrid.TownCenter;
            int z = SaveDriver.Instance?.State?.Player?.Pos?.Gy ?? CoreGrid.TownCenter;
            transform.position = new Vector3(x + .5f, 1f, z + .5f);
            SyncStatePosition();
            spawned = true;
        }

        private void SyncStatePosition()
        {
            if (SaveDriver.Instance?.State?.Player?.Pos == null) return;
            var pos = SaveDriver.Instance.State.Player.Pos;
            pos.Gx = Mathf.Clamp(Mathf.FloorToInt(transform.position.x), 0, CoreGrid.WorldSize - 1);
            pos.Gy = Mathf.Clamp(Mathf.FloorToInt(transform.position.z), 0, CoreGrid.WorldSize - 1);
            pos.Wx = transform.position.x;
            pos.Wz = transform.position.z;
        }

        private void OnDisable()
        {
            IsMoving = false;
        }
    }
}
