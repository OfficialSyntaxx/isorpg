"""Render a Blender review image for an Isoperia Y-up FBX asset."""
import bpy
import math
import sys
from mathutils import Vector


def aim(obj, target):
    obj.rotation_euler = (target - obj.location).to_track_quat('-Z', 'Y').to_euler()


def main(fbx_path, image_path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.fbx(filepath=fbx_path)
    imported = list(bpy.context.selected_objects)
    bpy.ops.object.empty_add(type='PLAIN_AXES')
    root = bpy.context.object
    root.name = 'PreviewRoot'
    for obj in imported:
        obj.parent = root
    root.rotation_euler = (math.pi * .5, 0, 0)

    bpy.ops.object.light_add(type='AREA', location=(4, -5, 6))
    bpy.context.object.data.energy = 850
    bpy.context.object.data.shape = 'DISK'
    bpy.context.object.data.size = 5
    aim(bpy.context.object, root.location + Vector((0, 0, 1)))
    bpy.ops.object.light_add(type='AREA', location=(-4, -2, 3))
    bpy.context.object.data.energy = 450
    bpy.context.object.data.size = 4
    aim(bpy.context.object, root.location + Vector((0, 0, 1)))
    bpy.ops.object.camera_add(location=(6.5, 8.5, 4.8))
    camera = bpy.context.object
    aim(camera, root.location + Vector((0, 0, .9)))
    bpy.context.scene.camera = camera
    bpy.context.scene.render.engine = 'BLENDER_EEVEE'
    bpy.context.scene.render.resolution_x = 900
    bpy.context.scene.render.resolution_y = 700
    bpy.context.scene.render.resolution_percentage = 100
    world = bpy.data.worlds.new('PreviewWorld')
    bpy.context.scene.world = world
    world.color = (.035, .045, .065)
    bpy.context.scene.render.filepath = image_path
    bpy.ops.wm.save_as_mainfile(filepath=image_path.rsplit('.', 1)[0] + '.blend')
    bpy.ops.render.render(write_still=True)


if __name__ == '__main__':
    main(sys.argv[-2], sys.argv[-1])
