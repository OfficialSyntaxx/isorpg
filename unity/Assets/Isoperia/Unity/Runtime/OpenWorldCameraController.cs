using UnityEngine;
using UnityEngine.InputSystem;

namespace Isoperia.Unity
{
    /// <summary>Hybrid third-person camera: follow by default, orbit and zoom on demand.</summary>
    [RequireComponent(typeof(Camera))]
    public sealed class OpenWorldCameraController : MonoBehaviour
    {
        private Transform target;
        private float yaw = 35f;
        private float pitch = 20f;
        private float distance = 7f;

        private void Start()
        {
            target = GameObject.Find(WorldPlayerAvatarView.AvatarName)?.transform;
            GetComponent<Camera>().orthographic = false;
            GetComponent<Camera>().fieldOfView = 62f;
        }

        private void LateUpdate()
        {
            if (target == null) return;
            if (Mouse.current != null && Mouse.current.rightButton.isPressed)
            {
                Vector2 delta = Mouse.current.delta.ReadValue();
                yaw += delta.x * .18f; pitch = Mathf.Clamp(pitch - delta.y * .12f, 8f, 58f);
            }
            if (Mouse.current != null) distance = Mathf.Clamp(distance - Mouse.current.scroll.ReadValue().y * .004f, 3.5f, 15f);
            if (Gamepad.current != null)
            {
                Vector2 look = Gamepad.current.rightStick.ReadValue();
                yaw += look.x * 110f * Time.deltaTime; pitch = Mathf.Clamp(pitch - look.y * 70f * Time.deltaTime, 8f, 58f);
            }
            Quaternion orbit = Quaternion.Euler(pitch, yaw, 0f);
            Vector3 focus = target.position + Vector3.up * 1.15f;
            transform.position = focus - orbit * Vector3.forward * distance;
            transform.rotation = orbit;
        }
    }
}
