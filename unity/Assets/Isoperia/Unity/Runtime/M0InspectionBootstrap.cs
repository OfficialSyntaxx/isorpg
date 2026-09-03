using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.UI;

namespace Isoperia.Unity.M0
{
    /// <summary>Scene-local M0 controls. Legacy startup is prevented at its source, never culled after startup.</summary>
    [DefaultExecutionOrder(-10000)]
    public sealed class M0InspectionBootstrap : MonoBehaviour
    {
        [SerializeField] private Transform inspectionPlayer;
        [SerializeField] private Camera inspectionCamera;

        private void Awake()
        {
            M0InspectionTouchControls touch = null;
            if (inspectionPlayer != null && inspectionPlayer.GetComponent<M0InspectionMotor>() == null)
                inspectionPlayer.gameObject.AddComponent<M0InspectionMotor>();
            if (inspectionCamera != null && inspectionCamera.GetComponent<M0InspectionCamera>() == null)
            {
                var orbit = inspectionCamera.gameObject.AddComponent<M0InspectionCamera>();
                orbit.Target = inspectionPlayer;
            }

            if (inspectionCamera != null)
            {
                touch = inspectionCamera.GetComponent<M0InspectionTouchControls>() ??
                    inspectionCamera.gameObject.AddComponent<M0InspectionTouchControls>();
                touch.Player = inspectionPlayer;
            }
        }

    }

    public sealed class M0InspectionMotor : MonoBehaviour
    {
        private CharacterController controller;
        private M0InspectionTouchControls touch;
        private float verticalVelocity;

        private void Awake()
        {
            controller = GetComponent<CharacterController>() ?? gameObject.AddComponent<CharacterController>();
            controller.height = 1.7f;
            controller.radius = .35f;
            controller.center = new Vector3(0f, .85f, 0f);
        }

        private void Update()
        {
            touch ??= Object.FindAnyObjectByType<M0InspectionTouchControls>();
            Vector2 mobile = touch == null ? Vector2.zero : touch.Movement;
            Vector3 input = new Vector3(Input.GetAxisRaw("Horizontal") + mobile.x, 0,
                Input.GetAxisRaw("Vertical") + mobile.y);
            if (input.sqrMagnitude > 1) input.Normalize();
            if (controller.isGrounded && verticalVelocity < 0f) verticalVelocity = -2f;
            verticalVelocity += Physics.gravity.y * Time.deltaTime;
            controller.Move(transform.TransformDirection(input) * 5f * Time.deltaTime +
                Vector3.up * verticalVelocity * Time.deltaTime);
        }
    }

    public sealed class M0InspectionCamera : MonoBehaviour
    {
        public Transform Target { get; set; }
        private float yaw=35, pitch=18, distance=6;

        private void LateUpdate()
        {
            if (Target == null) return;
            if (Input.GetMouseButton(1)) { yaw += Input.GetAxis("Mouse X")*120f*Time.deltaTime; pitch=Mathf.Clamp(pitch-Input.GetAxis("Mouse Y")*90f*Time.deltaTime,8,55); }
            distance=Mathf.Clamp(distance-Input.mouseScrollDelta.y,3,9);
            var touch = GetComponent<M0InspectionTouchControls>();
            if (touch != null)
            {
                Vector2 look = touch.LookDelta;
                yaw += look.x * .14f;
                pitch = Mathf.Clamp(pitch - look.y * .1f, 8f, 55f);
                distance = Mathf.Clamp(distance - touch.ZoomDelta * .012f, 3f, 9f);
            }
            Quaternion rotation=Quaternion.Euler(pitch,yaw,0); Vector3 desired=Target.position-rotation*Vector3.forward*distance+Vector3.up*1.25f;
            Vector3 origin = Target.position + Vector3.up * 1.25f;
            RaycastHit[] hits = Physics.RaycastAll(origin, desired - origin, distance, ~0,
                QueryTriggerInteraction.Ignore);
            float closest = distance;
            RaycastHit closestHit = default;
            bool hasHit = false;
            foreach (RaycastHit hit in hits)
            {
                if (hit.collider.transform.IsChildOf(Target)) continue;
                if (hit.distance >= closest) continue;
                closest = hit.distance;
                closestHit = hit;
                hasHit = true;
            }
            if (hasHit) desired=closestHit.point+closestHit.normal*.12f;
            transform.position=Vector3.Lerp(transform.position,desired,1-Mathf.Exp(-10f*Time.deltaTime)); transform.rotation=rotation;
        }
    }

    /// <summary>Inspection-only mobile input. It owns neither commands nor persistent state.</summary>
    public sealed class M0InspectionTouchControls : MonoBehaviour
    {
        private const float JoystickRadius = 105f;
        private int movementFinger = -1;
        private int lookFinger = -1;
        private Vector2 movementOrigin;
        private Vector2 movement;
        private Vector2 lookDelta;
        private float zoomDelta;
        private float previousPinchDistance = -1f;
        private Image knob;
        private RectTransform joystickRoot;
        private GameObject canvasObject;

        public Transform Player { get; set; }
        public Vector2 Movement => movement;
        public Vector2 LookDelta => lookDelta;
        public float ZoomDelta => zoomDelta;

        private void Awake() => CreateJoystick();

        private void Update()
        {
            lookDelta = Vector2.zero;
            zoomDelta = 0f;
            if (Touchscreen.current == null) return;

            int activeTouches = 0;
            foreach (var control in Touchscreen.current.touches)
            {
                if (!control.press.isPressed) continue;
                var state = control.ReadValue();
                int id = state.touchId;
                Vector2 position = state.position;
                activeTouches++;

                if (state.phase == UnityEngine.InputSystem.TouchPhase.Began)
                {
                    if (position.x <= Screen.width * .5f && movementFinger < 0)
                    {
                        movementFinger = id;
                        movementOrigin = position;
                    }
                    else if (lookFinger < 0)
                    {
                        lookFinger = id;
                    }
                }

                if (id == movementFinger)
                {
                    Vector2 delta = position - movementOrigin;
                    movement = Vector2.ClampMagnitude(delta / JoystickRadius, 1f);
                    if (knob != null) knob.rectTransform.anchoredPosition = movement * JoystickRadius;
                }
                else if (id == lookFinger)
                {
                    lookDelta += state.delta;
                }
            }

            if (activeTouches >= 2 && lookFinger >= 0)
            {
                Vector2 first = Vector2.zero;
                Vector2 second = Vector2.zero;
                int pinchCount = 0;
                foreach (var control in Touchscreen.current.touches)
                {
                    if (!control.press.isPressed || control.ReadValue().touchId == movementFinger) continue;
                    if (pinchCount++ == 0) first = control.ReadValue().position;
                    else if (pinchCount == 2) second = control.ReadValue().position;
                }
                if (pinchCount >= 2)
                {
                    float pinchDistance = Vector2.Distance(first, second);
                    if (previousPinchDistance >= 0f) zoomDelta = pinchDistance - previousPinchDistance;
                    previousPinchDistance = pinchDistance;
                }
                else previousPinchDistance = -1f;
            }
            else previousPinchDistance = -1f;

            ReleaseEndedTouches();
        }

        private void ReleaseEndedTouches()
        {
            bool movementPresent = false;
            bool lookPresent = false;
            if (Touchscreen.current != null)
            {
                foreach (var control in Touchscreen.current.touches)
                {
                    if (!control.press.isPressed) continue;
                    int id = control.ReadValue().touchId;
                    movementPresent |= id == movementFinger;
                    lookPresent |= id == lookFinger;
                }
            }
            if (!movementPresent) ResetMovement();
            if (!lookPresent) lookFinger = -1;
        }

        private void OnApplicationFocus(bool focus) { if (!focus) ResetAll(); }
        private void OnApplicationPause(bool pause) { if (pause) ResetAll(); }
        private void OnDisable() => ResetAll();

        private void ResetMovement()
        {
            movementFinger = -1;
            movement = Vector2.zero;
            if (knob != null) knob.rectTransform.anchoredPosition = Vector2.zero;
        }

        private void ResetAll()
        {
            ResetMovement();
            lookFinger = -1;
            lookDelta = Vector2.zero;
            zoomDelta = 0f;
        }

        private void CreateJoystick()
        {
            canvasObject = new GameObject("M0 Inspection Joystick", typeof(Canvas), typeof(CanvasScaler));
            var canvas = canvasObject.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 100;
            var root = canvasObject.GetComponent<RectTransform>();
            root.anchorMin = Vector2.zero;
            root.anchorMax = Vector2.one;
            root.offsetMin = root.offsetMax = Vector2.zero;

            joystickRoot = CreateCircle(canvasObject.transform, "Movement Zone", 230f,
                new Vector2(140f, 140f), new Color(.7f, .82f, .95f, .16f));
            knob = CreateCircle(joystickRoot, "Thumb", 92f, Vector2.zero,
                new Color(.85f, .93f, 1f, .38f)).GetComponent<Image>();
        }

        private void OnDestroy()
        {
            if (canvasObject != null) Destroy(canvasObject);
        }

        private static RectTransform CreateCircle(Transform parent, string name, float size,
            Vector2 anchoredPosition, Color colour)
        {
            var go = new GameObject(name, typeof(RectTransform), typeof(Image));
            go.transform.SetParent(parent, false);
            var rect = go.GetComponent<RectTransform>();
            rect.anchorMin = rect.anchorMax = Vector2.zero;
            rect.pivot = new Vector2(.5f, .5f);
            rect.sizeDelta = Vector2.one * size;
            rect.anchoredPosition = anchoredPosition;
            go.GetComponent<Image>().color = colour;
            return rect;
        }
    }
}
