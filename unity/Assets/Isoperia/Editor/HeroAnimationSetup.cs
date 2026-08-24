using UnityEditor;
using UnityEditor.Animations;
using UnityEngine;

namespace Isoperia.EditorTools
{
    public static class HeroAnimationSetup
    {
        private const string ModelPath = "Assets/Isoperia/Resources/Art/OwnedModels/hero_animated.fbx";
        private const string ControllerPath = "Assets/Isoperia/Resources/Art/HeroController.controller";

        public static void CreateController()
        {
            var clips = AssetDatabase.LoadAllAssetsAtPath(ModelPath);
            AnimationClip idle = Find(clips, "Hero_Idle");
            AnimationClip walk = Find(clips, "Hero_Walk");
            if (idle == null || walk == null) throw new System.InvalidOperationException("Hero clips were not imported");
            AssetDatabase.DeleteAsset(ControllerPath);
            var controller = AnimatorController.CreateAnimatorControllerAtPath(ControllerPath);
            controller.AddParameter("Speed", AnimatorControllerParameterType.Float);
            controller.AddParameter("Gather", AnimatorControllerParameterType.Trigger);
            controller.AddParameter("Attack", AnimatorControllerParameterType.Trigger);
            controller.AddParameter("Hit", AnimatorControllerParameterType.Trigger);
            var machine = controller.layers[0].stateMachine;
            var idleState = machine.AddState("Idle"); idleState.motion = idle;
            var walkState = machine.AddState("Walk"); walkState.motion = walk;
            var toWalk = idleState.AddTransition(walkState); toWalk.hasExitTime = false; toWalk.AddCondition(AnimatorConditionMode.Greater, .05f, "Speed");
            var toIdle = walkState.AddTransition(idleState); toIdle.hasExitTime = false; toIdle.AddCondition(AnimatorConditionMode.Less, .05f, "Speed");
            AssetDatabase.SaveAssets();
        }

        private static AnimationClip Find(Object[] assets, string contains)
        {
            foreach (Object asset in assets)
                if (asset is AnimationClip clip && clip.name.Contains(contains)) return clip;
            return null;
        }
    }
}
