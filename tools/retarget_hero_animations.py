"""Retarget a minimal CC0 action set onto Isoperia's owned hero in Blender.

Usage:
  Blender --background --factory-startup --python tools/retarget_hero_animations.py -- \
    <hero.glb> <animations.fbx> <output.fbx>

The source pack is Quaternius Universal Animation Library (CC0). This script
copies pose-space transforms only. It deliberately excludes root motion:
OpenWorldPlayerController remains the sole owner of player movement.
"""

import bpy
import sys


def arguments_after_separator():
    args = sys.argv
    return args[args.index("--") + 1:] if "--" in args else []


def first_armature():
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if not armatures:
        raise RuntimeError("Expected an armature after import")
    return armatures[0]


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)


def copy_action(source_armature, target_armature, source_action, target_name, mapping):
    target_action = bpy.data.actions.new(target_name)
    if target_armature.animation_data is None:
        target_armature.animation_data_create()
    target_armature.animation_data.action = target_action
    source_armature.animation_data.action = source_action

    start = int(source_action.frame_range[0])
    end = int(source_action.frame_range[1])
    scene = bpy.context.scene

    for frame in range(start, end + 1):
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        for source_name, target_name in mapping.items():
            source_bone = source_armature.pose.bones.get(source_name)
            target_bone = target_armature.pose.bones.get(target_name)
            if source_bone is None or target_bone is None:
                continue

            # matrix_basis is the transform relative to the rest pose. Copying
            # it keeps the target mesh in its own proportions while applying
            # source motion, rather than translating the target into the donor.
            target_bone.matrix_basis = source_bone.matrix_basis.copy()
            target_bone.keyframe_insert(data_path="location", frame=frame)
            target_bone.keyframe_insert(data_path="rotation_quaternion", frame=frame)
            target_bone.keyframe_insert(data_path="scale", frame=frame)

def main():
    args = arguments_after_separator()
    if len(args) != 3:
        raise RuntimeError("Expected hero GLB, source FBX, and output FBX paths")
    hero_path, source_path, output_path = args

    clear_scene()
    bpy.ops.import_scene.gltf(filepath=hero_path)
    hero_armature = first_armature()
    hero_armature.name = "HeroArmature"
    for obj in list(bpy.context.scene.objects):
        is_hero_mesh = obj.type == "MESH" and any(
            modifier.type == "ARMATURE" and modifier.object == hero_armature
            for modifier in obj.modifiers
        )
        if obj != hero_armature and not is_hero_mesh:
            bpy.data.objects.remove(obj, do_unlink=True)

    bpy.ops.import_scene.fbx(filepath=source_path)
    armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    source_armature = next(obj for obj in armatures if obj != hero_armature)
    source_armature.name = "AnimationSourceArmature"

    mapping = {
        "pelvis": "Hips",
        "thigh_l": "LeftUpLeg", "calf_l": "LeftLeg", "foot_l": "LeftFoot", "ball_l": "LeftToeBase",
        "thigh_r": "RightUpLeg", "calf_r": "RightLeg", "foot_r": "RightFoot", "ball_r": "RightToeBase",
        "spine_01": "Spine", "spine_02": "Spine01", "spine_03": "Spine02",
        "clavicle_l": "LeftShoulder", "upperarm_l": "LeftArm", "lowerarm_l": "LeftForeArm", "hand_l": "LeftHand",
        "clavicle_r": "RightShoulder", "upperarm_r": "RightArm", "lowerarm_r": "RightForeArm", "hand_r": "RightHand",
        "neck_01": "neck", "Head": "Head",
    }
    selected = {
        "Idle_Loop": "Hero_Idle",
        "Walk_Loop": "Hero_Walk",
        "Interact": "Hero_Gather",
        "Sword_Attack": "Hero_Attack",
        "Hit_Chest": "Hero_Hit",
    }
    source_actions = {action.name.rsplit("|", 1)[-1]: action for action in bpy.data.actions}
    for source_name, target_name in selected.items():
        if source_name not in source_actions:
            raise RuntimeError("Missing source action: " + source_name)
        copy_action(source_armature, hero_armature, source_actions[source_name], target_name, mapping)

    # Export only the owned hero and its retargeted actions; the CC0 donor mesh
    # is not part of Isoperia's player model or runtime payload.
    bpy.data.objects.remove(source_armature, do_unlink=True)
    hero_meshes = []
    for obj in list(bpy.context.scene.objects):
        skinned_to_hero = obj.type == "MESH" and any(
            modifier.type == "ARMATURE" and modifier.object == hero_armature
            for modifier in obj.modifiers
        )
        if skinned_to_hero:
            hero_meshes.append(obj)
        elif obj != hero_armature:
            bpy.data.objects.remove(obj, do_unlink=True)

    bpy.ops.object.select_all(action="DESELECT")
    # The original GLB contains an unskinned scene cube. Blender's FBX exporter
    # can retain that stale object even when exporting a selection, so remove it
    # by name at the final boundary as well.
    helper_cube = bpy.data.objects.get("Cube")
    if helper_cube is not None:
        bpy.data.objects.remove(helper_cube, do_unlink=True)
    hero_armature.select_set(True)
    for obj in hero_meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = hero_armature
    bpy.ops.export_scene.fbx(
        filepath=output_path,
        use_selection=True,
        add_leaf_bones=False,
        bake_anim=True,
        bake_anim_use_all_actions=True,
        bake_anim_force_startend_keying=True,
        bake_anim_use_nla_strips=False,
        bake_anim_step=1.0,
        axis_forward="-Z",
        axis_up="Y",
    )
    print("RETARGETED_ACTIONS", list(selected.values()))


main()
