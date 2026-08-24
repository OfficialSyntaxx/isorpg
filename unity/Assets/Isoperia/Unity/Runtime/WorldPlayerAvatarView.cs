using UnityEngine;
using Isoperia.Core.Systems;

namespace Isoperia.Unity
{
    /// <summary>
    /// Presents the owned hero model while keeping the controller and Core state
    /// authoritative. A compact primitive avatar remains available if an asset is
    /// missing from a constrained build.
    /// </summary>
    public sealed class WorldPlayerAvatarView : MonoBehaviour
    {
        public const string AvatarName = "PlayerAvatar";
        private const string HeroAsset = "Art/OwnedModels/hero_animated";
        private const string HeroControllerAsset = "Art/HeroController";

        private Material tunic;
        private Material skin;
        private Transform tunicTransform;
        private Transform headTransform;
        private Transform leftArmTransform;
        private Transform rightArmTransform;
        private Transform leftLegTransform;
        private Transform rightLegTransform;
        private Transform heroTransform;
        private Animator heroAnimator;
        private OpenWorldPlayerController playerController;
        private SkillSystem gathering;
        private WorldCombatRegistry combat;
        private float harvestUntil;
        private float attackUntil;
        private float hitUntil;
        private LineRenderer actionTrail;
        private Material actionTrailMaterial;

        // Conventional controller contract for the owned hero and every future
        // Humanoid actor. They are queried once at startup so an asset can omit
        // an optional action without per-frame warnings or parameter spam.
        private static readonly int SpeedParameter = Animator.StringToHash("Speed");
        private static readonly int MovingParameter = Animator.StringToHash("IsMoving");
        private static readonly int GatherTrigger = Animator.StringToHash("Gather");
        private static readonly int AttackTrigger = Animator.StringToHash("Attack");
        private static readonly int HitTrigger = Animator.StringToHash("Hit");
        private bool hasSpeedParameter;
        private bool hasMovingParameter;
        private bool hasGatherTrigger;
        private bool hasAttackTrigger;
        private bool hasHitTrigger;

        public static Transform Create()
        {
            var root = new GameObject(AvatarName);
            root.AddComponent<WorldPlayerAvatarView>();
            return root.transform;
        }

        private void Awake()
        {
            playerController = GetComponent<OpenWorldPlayerController>();
            GameObject heroPrefab = Resources.Load<GameObject>(HeroAsset);
            if (heroPrefab != null)
            {
                GameObject hero = Instantiate(heroPrefab, transform);
                hero.name = "HeroModel";
                hero.transform.localPosition = Vector3.zero;
                hero.transform.localRotation = Quaternion.identity;
                hero.transform.localScale = Vector3.one;
                Transform helperCube = FindChild(hero.transform, "Cube");
                if (helperCube != null) Destroy(helperCube.gameObject);
                OwnedModelPresentation.FitToHeight(hero, 1.45f);
                Animator animator = hero.GetComponentInChildren<Animator>(true);
                if (animator == null) animator = hero.AddComponent<Animator>();
                if (animator.runtimeAnimatorController == null)
                    animator.runtimeAnimatorController = Resources.Load<RuntimeAnimatorController>(HeroControllerAsset);
                if (animator != null && animator.runtimeAnimatorController != null)
                {
                    heroTransform = hero.transform;
                    heroAnimator = animator;
                    heroAnimator.applyRootMotion = false;
                    CacheAnimatorParameters();
                    return;
                }

                // The owned source has a rig but no baked clips. Do not ship its
                // bind pose as the playable character; retain the usable source
                // only when it can actually animate.
                hero.SetActive(false);
                Destroy(hero);
            }

            CreateAnimatedFallback();
        }

        private void CreateAnimatedFallback()
        {
            tunic = CreateMaterial(new Color(.18f, .33f, .58f, 1f));
            skin = CreateMaterial(new Color(.78f, .52f, .36f, 1f));
            tunicTransform = CreatePart(PrimitiveType.Capsule, "Tunic", new Vector3(0f, .47f, 0f),
                new Vector3(.28f, .45f, .28f), tunic);
            headTransform = CreatePart(PrimitiveType.Sphere, "Head", new Vector3(0f, .97f, 0f),
                new Vector3(.30f, .30f, .30f), skin);
            leftArmTransform = CreatePart(PrimitiveType.Capsule, "LeftArm", new Vector3(-.29f, .58f, 0f),
                new Vector3(.105f, .27f, .105f), skin);
            rightArmTransform = CreatePart(PrimitiveType.Capsule, "RightArm", new Vector3(.29f, .58f, 0f),
                new Vector3(.105f, .27f, .105f), skin);
            leftLegTransform = CreatePart(PrimitiveType.Capsule, "LeftLeg", new Vector3(-.12f, .13f, 0f),
                new Vector3(.12f, .30f, .12f), tunic);
            rightLegTransform = CreatePart(PrimitiveType.Capsule, "RightLeg", new Vector3(.12f, .13f, 0f),
                new Vector3(.12f, .30f, .12f), tunic);
        }

        private static Transform FindChild(Transform root, string childName)
        {
            foreach (Transform child in root)
            {
                if (child.name == childName) return child;
                Transform match = FindChild(child, childName);
                if (match != null) return match;
            }
            return null;
        }

        private void Update()
        {
            if (playerController == null) playerController = GetComponent<OpenWorldPlayerController>();
            bool moving = playerController != null && playerController.IsMoving;
            float cycle = Time.time * (moving ? 11f : 2f);
            float bob = Mathf.Sin(cycle) * (moving ? .035f : .006f);
            if (heroTransform != null)
            {
                DriveHeroAnimator(moving);
                UpdateActionTrail();
                return;
            }
            if (tunicTransform != null)
            {
                tunicTransform.localPosition = new Vector3(0f, .47f + bob, 0f);
                tunicTransform.localRotation = Quaternion.Euler(moving ? Mathf.Sin(cycle) * 5f : 0f, 0f, 0f);
            }
            if (headTransform != null) headTransform.localPosition = new Vector3(0f, .97f + bob, 0f);
            float stride = moving ? Mathf.Sin(cycle) * 28f : 0f;
            if (leftArmTransform != null) leftArmTransform.localRotation = Quaternion.Euler(stride, 0f, 12f);
            if (rightArmTransform != null) rightArmTransform.localRotation = Quaternion.Euler(-stride, 0f, -12f);
            if (leftLegTransform != null) leftLegTransform.localRotation = Quaternion.Euler(-stride, 0f, 0f);
            if (rightLegTransform != null) rightLegTransform.localRotation = Quaternion.Euler(stride, 0f, 0f);
        }

        private Transform CreatePart(PrimitiveType type, string partName, Vector3 localPosition,
            Vector3 localScale, Material material)
        {
            GameObject part = GameObject.CreatePrimitive(type);
            part.name = partName;
            part.transform.SetParent(transform, false);
            part.transform.localPosition = localPosition;
            part.transform.localScale = localScale;
            part.GetComponent<Renderer>().sharedMaterial = material;
            Destroy(part.GetComponent<Collider>());
            return part.transform;
        }

        private static Material CreateMaterial(Color color)
        {
            Shader shader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Standard");
            return new Material(shader) { color = color };
        }

        private void Start()
        {
            SaveDriver driver = SaveDriver.Instance;
            gathering = driver?.Gathering;
            combat = driver?.Combat;
            if (gathering != null) gathering.ActionStarted += OnHarvestStarted;
            if (combat != null)
            {
                combat.PlayerAttacked += OnPlayerAttacked;
                combat.PlayerHit += OnPlayerHit;
            }
        }

        private void OnHarvestStarted(IResourceNode _)
        {
            harvestUntil = Time.time + .7f;
            if (hasGatherTrigger) heroAnimator.SetTrigger(GatherTrigger);
            ShowActionTrail(new Color(.38f, 1f, .54f, 1f));
        }

        private void OnPlayerAttacked(WorldEnemyNode _)
        {
            attackUntil = Time.time + .24f;
            if (hasAttackTrigger) heroAnimator.SetTrigger(AttackTrigger);
            ShowActionTrail(new Color(1f, .62f, .22f, 1f));
        }

        private void OnPlayerHit(WorldEnemyNode _)
        {
            hitUntil = Time.time + .22f;
            if (hasHitTrigger) heroAnimator.SetTrigger(HitTrigger);
            Camera.main?.GetComponent<OpenWorldCameraController>()?.AddShake(.035f);
        }

        private void ShowActionTrail(Color color)
        {
            if (heroTransform == null) return;
            if (actionTrail == null)
            {
                GameObject trail = new GameObject("HeroActionTrail");
                trail.transform.SetParent(heroTransform, false);
                actionTrail = trail.AddComponent<LineRenderer>();
                actionTrail.useWorldSpace = true;
                actionTrail.positionCount = 7;
                actionTrail.widthCurve = AnimationCurve.EaseInOut(0f, .02f, 1f, .10f);
                actionTrail.numCapVertices = 3;
                Shader shader = Shader.Find("Universal Render Pipeline/Unlit") ?? Shader.Find("Sprites/Default");
                actionTrailMaterial = new Material(shader);
                actionTrail.sharedMaterial = actionTrailMaterial;
            }
            actionTrailMaterial.color = color;
            actionTrail.startColor = color;
            actionTrail.endColor = new Color(color.r, color.g, color.b, 0f);
            actionTrail.gameObject.SetActive(true);
        }

        private void UpdateActionTrail()
        {
            if (actionTrail == null) return;
            float until = Mathf.Max(harvestUntil, attackUntil);
            if (Time.time >= until)
            {
                actionTrail.gameObject.SetActive(false);
                return;
            }
            float duration = attackUntil > harvestUntil ? .24f : .7f;
            float progress = 1f - Mathf.Clamp01((until - Time.time) / duration);
            Vector3 origin = heroTransform.position + Vector3.up * .78f;
            Vector3 forward = heroTransform.forward;
            for (int i = 0; i < actionTrail.positionCount; i++)
            {
                float t = i / (float)(actionTrail.positionCount - 1);
                float angle = Mathf.Lerp(-62f, 62f, t) * Mathf.Deg2Rad;
                Vector3 direction = Quaternion.AngleAxis(angle, Vector3.up) * forward;
                actionTrail.SetPosition(i, origin + direction * Mathf.Lerp(.28f, .9f, progress));
            }
        }

        private void CacheAnimatorParameters()
        {
            if (heroAnimator == null) return;
            foreach (AnimatorControllerParameter parameter in heroAnimator.parameters)
            {
                if (parameter.nameHash == SpeedParameter && parameter.type == AnimatorControllerParameterType.Float)
                    hasSpeedParameter = true;
                else if (parameter.nameHash == MovingParameter && parameter.type == AnimatorControllerParameterType.Bool)
                    hasMovingParameter = true;
                else if (parameter.nameHash == GatherTrigger && parameter.type == AnimatorControllerParameterType.Trigger)
                    hasGatherTrigger = true;
                else if (parameter.nameHash == AttackTrigger && parameter.type == AnimatorControllerParameterType.Trigger)
                    hasAttackTrigger = true;
                else if (parameter.nameHash == HitTrigger && parameter.type == AnimatorControllerParameterType.Trigger)
                    hasHitTrigger = true;
            }
        }

        private void DriveHeroAnimator(bool moving)
        {
            if (heroAnimator == null) return;
            float speed = moving ? 1f : 0f;
            if (hasSpeedParameter) heroAnimator.SetFloat(SpeedParameter, speed, .12f, Time.deltaTime);
            if (hasMovingParameter) heroAnimator.SetBool(MovingParameter, moving);
        }

        private void OnDestroy()
        {
            if (gathering != null) gathering.ActionStarted -= OnHarvestStarted;
            if (combat != null)
            {
                combat.PlayerAttacked -= OnPlayerAttacked;
                combat.PlayerHit -= OnPlayerHit;
            }
            if (tunic != null) Destroy(tunic);
            if (skin != null) Destroy(skin);
            if (actionTrailMaterial != null) Destroy(actionTrailMaterial);
        }
    }
}
