using UnityEditor;
using UnityEditor.Animations;
using UnityEngine;

namespace Isoperia.EditorTools
{
    /// <summary>Builds presentation-only controllers from the locally owned FBX clips.</summary>
    public static class OwnedAnimationSetup
    {
        [MenuItem("Isoperia/Build Owned Asset Animation Controllers")]
        public static void Build()
        {
            CreateLocomotionController(
                "Assets/Isoperia/Resources/Art/OwnedModels/cinder_hound_animated.fbx",
                "Assets/Isoperia/Resources/Art/CinderHoundController.controller",
                "CinderHound_Idle", "CinderHound_Walk");
            CreateLocomotionController(
                "Assets/Isoperia/Resources/Art/OwnedModels/actor_animation_baseline.fbx",
                "Assets/Isoperia/Resources/Art/ActorAnimationBaselineController.controller",
                "Actor_Idle", "Actor_Walk");
            AssetDatabase.SaveAssets();
        }

        private static void CreateLocomotionController(string modelPath, string controllerPath, string idleName, string walkName)
        {
            Object[] clips = AssetDatabase.LoadAllAssetsAtPath(modelPath);
            AnimationClip idle = Find(clips, idleName);
            AnimationClip walk = Find(clips, walkName);
            if (idle == null || walk == null)
                throw new System.InvalidOperationException("Expected clips were not imported from " + modelPath);

            AssetDatabase.DeleteAsset(controllerPath);
            AnimatorController controller = AnimatorController.CreateAnimatorControllerAtPath(controllerPath);
            controller.AddParameter("Speed", AnimatorControllerParameterType.Float);
            AnimatorStateMachine machine = controller.layers[0].stateMachine;
            AnimatorState idleState = machine.AddState("Idle"); idleState.motion = idle;
            AnimatorState walkState = machine.AddState("Walk"); walkState.motion = walk;
            AnimatorStateTransition toWalk = idleState.AddTransition(walkState); toWalk.hasExitTime = false; toWalk.duration = .08f; toWalk.AddCondition(AnimatorConditionMode.Greater, .05f, "Speed");
            AnimatorStateTransition toIdle = walkState.AddTransition(idleState); toIdle.hasExitTime = false; toIdle.duration = .08f; toIdle.AddCondition(AnimatorConditionMode.Less, .05f, "Speed");
        }

        private static AnimationClip Find(Object[] assets, string name)
        {
            foreach (Object asset in assets)
                if (asset is AnimationClip clip && clip.name.Contains(name)) return clip;
            return null;
        }
    }
}
