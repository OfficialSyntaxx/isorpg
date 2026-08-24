"""Create compact, rig-native Blender actions for the owned hero.

The original model has a usable armature but no clips.  These motions are
authored directly against that armature's rest pose, avoiding cross-rig matrix
retargeting errors while retaining a deterministic, zero-cost art pipeline.
"""

import bpy
import os
import sys


def key(bone, frame, rotation=(0.0, 0.0, 0.0)):
    pose = bone.rotation_mode
    bone.rotation_mode = "XYZ"
    bone.rotation_euler = rotation
    bone.keyframe_insert(data_path="rotation_euler", frame=frame)
    bone.rotation_mode = pose


def make_action(armature, name, poses, end_frame):
    action = bpy.data.actions.new(name)
    armature.animation_data_create()
    armature.animation_data.action = action
    for frame, values in poses:
        for bone in armature.pose.bones:
            key(bone, frame, values.get(bone.name, (0.0, 0.0, 0.0)))
    action.frame_start = 1
    action.frame_end = end_frame
    return action


def main(source_path, output_path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=source_path)
    armature = next(obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE")
    armature.name = "HeroArmature"

    # Keep only the skinned mesh + armature. Cameras/lights/helpers in the
    # source GLB are not player-art content.
    for obj in list(bpy.context.scene.objects):
        if obj not in (armature,) and obj.type != "MESH":
            bpy.data.objects.remove(obj, do_unlink=True)
    for obj in list(bpy.context.scene.objects):
        if obj.type == "MESH" and obj.name in {"Cube", "Icosphere"}:
            bpy.data.objects.remove(obj, do_unlink=True)

    neutral = {}
    make_action(armature, "Hero_Idle", [
        (1, neutral),
        (24, {"Spine": (0.03, 0.0, -0.025), "Head": (0.0, 0.035, 0.0),
              "LeftArm": (0.02, 0.0, 0.035), "RightArm": (-0.02, 0.0, -0.035)}),
        (48, neutral),
    ], 48)
    make_action(armature, "Hero_Walk", [
        (1, {"LeftUpLeg": (0.42, 0, 0), "LeftLeg": (-0.22, 0, 0),
             "RightUpLeg": (-0.42, 0, 0), "RightLeg": (0.22, 0, 0),
             "LeftArm": (-0.36, 0, 0), "RightArm": (0.36, 0, 0)}),
        (16, {"LeftUpLeg": (-0.42, 0, 0), "LeftLeg": (0.22, 0, 0),
              "RightUpLeg": (0.42, 0, 0), "RightLeg": (-0.22, 0, 0),
              "LeftArm": (0.36, 0, 0), "RightArm": (-0.36, 0, 0)}),
        (32, {"LeftUpLeg": (0.42, 0, 0), "LeftLeg": (-0.22, 0, 0),
              "RightUpLeg": (-0.42, 0, 0), "RightLeg": (0.22, 0, 0),
              "LeftArm": (-0.36, 0, 0), "RightArm": (0.36, 0, 0)}),
    ], 32)
    make_action(armature, "Hero_Gather", [
        (1, neutral),
        (10, {"Spine": (0.22, 0, 0), "LeftArm": (-0.65, 0.0, 0.1),
              "LeftForeArm": (-0.45, 0.0, 0.0), "RightArm": (-0.55, 0.0, -0.1),
              "RightForeArm": (-0.35, 0.0, 0.0)}),
        (22, neutral),
    ], 22)
    make_action(armature, "Hero_Attack", [
        (1, neutral),
        (7, {"Spine": (0.0, -0.30, 0), "RightArm": (-0.95, 0.0, -0.22),
             "RightForeArm": (-0.55, 0.0, 0.0)}),
        (14, {"Spine": (0.0, 0.36, 0), "RightArm": (0.70, 0.0, 0.36),
              "RightForeArm": (0.42, 0.0, 0.0)}),
        (24, neutral),
    ], 24)
    make_action(armature, "Hero_Hit", [
        (1, neutral),
        (6, {"Spine": (-0.28, 0.0, 0), "Head": (-0.12, 0.0, 0),
             "LeftArm": (0.25, 0, 0.3), "RightArm": (-0.25, 0, -0.3)}),
        (16, neutral),
    ], 16)

    bpy.ops.object.select_all(action="DESELECT")
    armature.select_set(True)
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH":
            obj.select_set(True)
    bpy.context.view_layer.objects.active = armature
    bpy.ops.export_scene.fbx(
        filepath=output_path,
        use_selection=True,
        add_leaf_bones=False,
        bake_anim=True,
        bake_anim_use_all_actions=True,
        bake_anim_use_nla_strips=False,
        bake_anim_simplify_factor=0.0,
        path_mode="COPY",
        embed_textures=False,
    )


if __name__ == "__main__":
    main(sys.argv[-2], sys.argv[-1])
