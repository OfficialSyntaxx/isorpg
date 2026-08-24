"""Render a review image of the owned hero in Blender.

This is intentionally a small, reproducible art-review utility. It uses the
retargeted FBX that Unity imports, so the screenshot represents the game-ready
asset rather than a separate source-only model.
"""

import math
import os
import sys

import bpy
from mathutils import Vector


def look_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def main(asset_path, output_path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=asset_path)

    if "hero" in os.path.basename(asset_path).lower():
        preview_material = bpy.data.materials.new("HeroPreviewPalette")
        preview_material.diffuse_color = (0.14, 0.24, 0.48, 1.0)
        preview_material.use_nodes = True
        principled = preview_material.node_tree.nodes.get("Principled BSDF")
        if principled:
            principled.inputs["Base Color"].default_value = (0.14, 0.24, 0.48, 1.0)
            principled.inputs["Roughness"].default_value = 0.72
        for obj in bpy.context.scene.objects:
            if obj.type != "MESH":
                continue
            obj.data.materials.clear()
            obj.data.materials.append(preview_material)

    # The FBX exporter includes an unskinned helper cube from the source scene.
    helper = bpy.data.objects.get("Cube")
    if helper:
        bpy.data.objects.remove(helper, do_unlink=True)

    armature = next((obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"), None)
    if armature:
        armature.animation_data_create()
        action = next((candidate for candidate in bpy.data.actions
                       if "Hero_Attack" in candidate.name), None)
        if action:
            armature.animation_data.action = action
            bpy.context.scene.frame_set(15)

    # Neutral studio floor and three-light setup for readable silhouette.
    bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, 0))
    floor = bpy.context.object
    floor.name = "PreviewFloor"
    material = bpy.data.materials.new("PreviewFloorMaterial")
    material.diffuse_color = (0.035, 0.065, 0.09, 1.0)
    floor.data.materials.append(material)

    for location, energy, size, color in [
        ((4, -4, 6), 1100, 4.0, (0.65, 0.82, 1.0)),
        ((-4, -2, 4), 850, 3.0, (1.0, 0.52, 0.32)),
        ((0, 4, 5), 700, 3.0, (0.55, 0.75, 1.0)),
    ]:
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.data.energy = energy
        light.data.shape = "DISK"
        light.data.size = size
        light.data.color = color
        look_at(light, (0, 0, 1))

    bpy.ops.object.camera_add(location=(3.4, -6.0, 2.4))
    camera = bpy.context.object
    camera.data.lens = 55
    look_at(camera, (0, 0, 0.95))
    bpy.context.scene.camera = camera

    scene = bpy.context.scene
    # Blender 5.2 exposes the Eevee renderer as BLENDER_EEVEE.
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 900
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = output_path
    scene.world = bpy.data.worlds.new("PreviewWorld")
    scene.world.color = (0.008, 0.014, 0.026)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.splitext(output_path)[0] + ".blend")
    bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main(sys.argv[-2], sys.argv[-1])
