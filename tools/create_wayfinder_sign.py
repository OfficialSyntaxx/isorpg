"""Build the Isoperia-owned low-poly wayfinding sign in Blender.

The asset is intentionally compact: it is a reusable route landmark for the
third-person mainland, not a source of gameplay state or a purchased asset.
"""

import bpy
import sys


def material(name, color):
    value = bpy.data.materials.new(name)
    value.diffuse_color = color
    return value


def cube(name, location, scale, mat, yaw=0.0):
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=(0, 0, yaw))
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    return obj


def main(output_path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    wood = material("WayfinderWood", (0.22, 0.09, 0.035, 1.0))
    trim = material("WayfinderTrim", (0.88, 0.52, 0.10, 1.0))
    parts = []
    parts.append(cube("Post", (0, 1.05, 0), (.10, 1.05, .10), wood))
    parts.append(cube("Foot", (0, .12, 0), (.28, .12, .28), wood))
    # Two opposed arrow boards create a readable silhouette from either route.
    parts.append(cube("EastArrow", (.45, 1.65, 0), (.55, .16, .075), wood))
    parts.append(cube("WestArrow", (-.45, 1.28, 0), (.55, .16, .075), wood))
    for x, y, direction in ((1.02, 1.65, 0), (-1.02, 1.28, 3.14159)):
        bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=.27, radius2=0,
                                        depth=.15, location=(x, y, 0), rotation=(0, 1.5708, direction))
        head = bpy.context.object
        head.name = "ArrowTip"
        head.data.materials.append(wood)
        parts.append(head)
    parts.append(cube("GoldBandTop", (0, 1.88, 0), (.15, .055, .13), trim))
    parts.append(cube("GoldBandMid", (0, 1.47, 0), (.13, .035, .12), trim))
    parts.append(cube("GoldBandLow", (0, 1.12, 0), (.13, .035, .12), trim))
    bpy.ops.object.select_all(action="DESELECT")
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    sign = bpy.context.object
    sign.name = "IsoperiaWayfinderSign"
    bpy.ops.export_scene.fbx(filepath=output_path, use_selection=True,
                             add_leaf_bones=False, bake_anim=False,
                             path_mode="COPY", embed_textures=False)


if __name__ == "__main__":
    main(sys.argv[-1])
