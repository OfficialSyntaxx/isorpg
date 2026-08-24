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
            AnimationClip gather = Find(clips, "Hero_Gather");
            AnimationClip attack = Find(clips, "Hero_Attack");
            AnimationClip hit = Find(clips, "Hero_Hit");
            if (idle == null || walk == null || gather == null || attack == null || hit == null)
                throw new System.InvalidOperationException("Hero clips were not imported");
            AssetDatabase.DeleteAsset(ControllerPath);
            var controller = AnimatorController.CreateAnimatorControllerAtPath(ControllerPath);
            controller.AddParameter("Speed", AnimatorControllerParameterType.Float);
            controller.AddParameter("Gather", AnimatorControllerParameterType.Trigger);
            controller.AddParameter("Attack", AnimatorControllerParameterType.Trigger);
            controller.AddParameter("Hit", AnimatorControllerParameterType.Trigger);
            var machine = controller.layers[0].stateMachine;
            var idleState = machine.AddState("Idle"); idleState.motion = idle;
            var walkState = machine.AddState("Walk"); walkState.motion = walk;
            var gatherState = machine.AddState("Gather"); gatherState.motion = gather;
            var attackState = machine.AddState("Attack"); attackState.motion = attack;
            var hitState = machine.AddState("Hit"); hitState.motion = hit;
            var toWalk = idleState.AddTransition(walkState); toWalk.hasExitTime = false; toWalk.AddCondition(AnimatorConditionMode.Greater, .05f, "Speed");
            var toIdle = walkState.AddTransition(idleState); toIdle.hasExitTime = false; toIdle.AddCondition(AnimatorConditionMode.Less, .05f, "Speed");
            AddActionTransition(machine, gatherState, "Gather");
            AddActionTransition(machine, attackState, "Attack");
            AddActionTransition(machine, hitState, "Hit");
            AssetDatabase.SaveAssets();
        }

        private static void AddActionTransition(AnimatorStateMachine machine, AnimatorState state, string trigger)
        {
            var enter = machine.AddAnyStateTransition(state);
            enter.hasExitTime = false;
            enter.duration = .04f;
            enter.AddCondition(AnimatorConditionMode.If, 0f, trigger);
            var exit = state.AddTransition(machine.defaultState);
            exit.hasExitTime = true;
            exit.exitTime = .96f;
            exit.duration = .06f;
        }

        private static AnimationClip Find(Object[] assets, string contains)
        {
            foreach (Object asset in assets)
                if (asset is AnimationClip clip && clip.name.Contains(contains)) return clip;
            return null;
        }
    }
}
