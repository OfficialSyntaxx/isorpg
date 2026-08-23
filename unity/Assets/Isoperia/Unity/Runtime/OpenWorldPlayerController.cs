using UnityEngine;
using UnityEngine.InputSystem;
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
            if (cameraTransform == null) return;
            Vector2 input = Keyboard.current == null ? Vector2.zero : new Vector2(
                (Keyboard.current.dKey.isPressed ? 1 : 0) - (Keyboard.current.aKey.isPressed ? 1 : 0),
                (Keyboard.current.wKey.isPressed ? 1 : 0) - (Keyboard.current.sKey.isPressed ? 1 : 0));
            if (Gamepad.current != null) input += Gamepad.current.leftStick.ReadValue();
            input = Vector2.ClampMagnitude(input, 1f);
            Vector3 forward = Vector3.ProjectOnPlane(cameraTransform.forward, Vector3.up).normalized;
            Vector3 right = Vector3.ProjectOnPlane(cameraTransform.right, Vector3.up).normalized;
            Vector3 move = (forward * input.y + right * input.x) * 5f;
            IsMoving = move.sqrMagnitude > .01f;
            if (IsMoving) transform.rotation = Quaternion.Slerp(transform.rotation, Quaternion.LookRotation(move), 14f * Time.deltaTime);
            verticalSpeed = controller.isGrounded ? -.5f : verticalSpeed + Physics.gravity.y * Time.deltaTime;
            controller.Move((move + Vector3.up * verticalSpeed) * Time.deltaTime);
            if (SaveDriver.Instance?.State?.Player?.Pos != null)
            {
                var pos = SaveDriver.Instance.State.Player.Pos;
                pos.Gx = Mathf.Clamp(Mathf.FloorToInt(transform.position.x), 0, 41);
                pos.Gy = Mathf.Clamp(Mathf.FloorToInt(transform.position.z), 0, 41);
                pos.Wx = transform.position.x; pos.Wz = transform.position.z;
            }
        }

        private void Start()
        {
            if (spawned) return;
            int x = SaveDriver.Instance?.State?.Player?.Pos?.Gx ?? CoreGrid.TownCenter;
            int z = SaveDriver.Instance?.State?.Player?.Pos?.Gy ?? CoreGrid.TownCenter;
            transform.position = new Vector3(x + .5f, 1f, z + .5f);
            spawned = true;
        }

        private void OnDisable()
        {
            IsMoving = false;
        }
    }
}
