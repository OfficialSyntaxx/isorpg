using UnityEngine;
using UnityEngine.InputSystem;

namespace Isoperia.Unity
{
    /// <summary>Minimal mobile control affordance tied directly to the locomotion owner.</summary>
    [RequireComponent(typeof(OpenWorldPlayerController))]
    public sealed class WorldMobileControlHint : MonoBehaviour
    {
        private OpenWorldPlayerController controller;
        private GUIStyle labelStyle;
        private GUIStyle stickStyle;

        private void Awake()
        {
            controller = GetComponent<OpenWorldPlayerController>();
        }

        private void OnGUI()
        {
            if (Touchscreen.current == null) return;
            if (labelStyle == null) CreateStyles();

            float scale = Mathf.Clamp(Screen.height / 820f, .75f, 1.25f);
            float size = 116f * scale;
            Rect stick = new Rect(24f * scale, Screen.height - size - 30f * scale, size, size);
            GUI.Box(stick, "MOVE", stickStyle);
            GUI.Label(new Rect(stick.x, stick.y - 25f * scale, size + 180f * scale, 24f * scale),
                "Drag left to move · drag right to look", labelStyle);

            if (controller != null && controller.IsTouchMoving)
            {
                Vector2 direction = controller.TouchMove;
                float nub = size * .22f;
                Rect thumb = new Rect(stick.center.x + direction.x * size * .28f - nub * .5f,
                    stick.center.y - direction.y * size * .28f - nub * .5f, nub, nub);
                GUI.Box(thumb, string.Empty, stickStyle);
            }
        }

        private void CreateStyles()
        {
            labelStyle = new GUIStyle(GUI.skin.label)
            {
                fontSize = 14,
                alignment = TextAnchor.MiddleLeft,
                normal = { textColor = new Color(.92f, .86f, .72f, .9f) }
            };
            stickStyle = new GUIStyle(GUI.skin.box)
            {
                fontSize = 13,
                alignment = TextAnchor.MiddleCenter,
                normal = { textColor = new Color(.92f, .86f, .72f, .9f) }
            };
        }
    }
}
