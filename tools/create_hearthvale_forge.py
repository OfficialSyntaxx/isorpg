"""Build an original Y-up Hearthvale forge landmark for Unity/WebGL."""

import bpy
import math
import sys


def material(name, color):
    value = bpy.data.materials.new(name)
    value.diffuse_color = color
    return value


def cube(name, location, scale, mat, rotation=(0.0, 0.0, 0.0)):
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    piece = bpy.context.object
    piece.name = name
    piece.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    piece.data.materials.append(mat)
    return piece


def stone(name, location, scale, mat):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=.5, location=location)
    piece = bpy.context.object
    piece.name = name
    piece.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    piece.data.materials.append(mat)
    return piece


def main(output_path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    timber = material("ForgeTimber", (.16, .065, .022, 1))
    plaster = material("ForgePlaster", (.56, .44, .28, 1))
    stone_mat = material("ForgeStone", (.20, .22, .25, 1))
    roof = material("ForgeRoof", (.12, .16, .20, 1))
    iron = material("ForgeIron", (.12, .15, .18, 1))
    ember = material("ForgeEmber", (1.0, .20, .025, 1))

    # These FBX assets intentionally use game-facing Y as vertical, matching
    # the accepted Cinder gate and campfire import convention in this project.
    pieces = [
        cube("ForgeFloor", (0, .10, 0), (2.25, .10, 1.70), stone_mat),
        cube("ForgeWall", (0, .92, .55), (2.10, .82, .13), plaster),
        cube("ForgeFrameLeft", (-1.90, 1.04, .36), (.12, 1.05, .14), timber),
        cube("ForgeFrameRight", (1.90, 1.04, .36), (.12, 1.05, .14), timber),
        cube("ForgeBeam", (0, 1.82, .36), (2.08, .12, .15), timber),
        cube("ForgeAwning", (0, 1.92, -.28), (2.28, .12, 1.12), roof, rotation=(0, 0, math.radians(-7))),
        cube("HearthBody", (-1.10, .68, -.55), (.62, .58, .50), stone_mat),
        cube("HearthMouth", (-1.10, .72, -1.07), (.34, .31, .05), iron),
        cube("HearthEmber", (-1.10, .57, -1.14), (.25, .14, .035), ember),
        cube("Chimney", (-1.10, 1.73, -.56), (.30, .70, .30), stone_mat),
        cube("ChimneyCap", (-1.10, 2.42, -.56), (.42, .10, .42), stone_mat),
        cube("AnvilBase", (.66, .42, -.60), (.22, .32, .22), iron),
        cube("AnvilFace", (.66, .75, -.60), (.52, .10, .23), iron),
        cube("AnvilHorn", (1.12, .75, -.60), (.24, .07, .15), iron),
        cube("WorkBench", (.82, .42, .38), (.82, .10, .30), timber),
        cube("BenchLegA", (.28, .23, .38), (.07, .25, .07), timber),
        cube("BenchLegB", (1.36, .23, .38), (.07, .25, .07), timber),
    ]
    for i, (x, z, scale) in enumerate(((-1.9, -1.10, .33), (-.18, -1.30, .22), (1.72, -1.18, .28), (1.82, .96, .24))):
        pieces.append(stone("ForgeFoundation_%d" % i, (x, .23, z), (scale, .42, scale), stone_mat))

    bpy.ops.object.select_all(action="DESELECT")
    for piece in pieces:
        piece.select_set(True)
    bpy.context.view_layer.objects.active = pieces[0]
    bpy.ops.object.join()
    forge = bpy.context.object
    forge.name = "IsoperiaHearthvaleForge"
    bpy.ops.export_scene.fbx(filepath=output_path, use_selection=True,
                             add_leaf_bones=False, bake_anim=False,
                             path_mode="COPY", embed_textures=False)


if __name__ == "__main__":
    main(sys.argv[-1])
