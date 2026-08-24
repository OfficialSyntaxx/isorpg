"""Build an original Y-up Wildwood shrine landmark for Unity/WebGL."""
import bpy
import math
import sys


def material(name, color):
    value = bpy.data.materials.new(name)
    value.diffuse_color = color
    return value


def cube(name, location, scale, mat, rotation=(0.0, 0.0, 0.0)):
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    return obj


def stone(name, location, scale, mat):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=.5, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    return obj


def main(output_path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    moss_stone = material("ShrineMossStone", (.18, .25, .20, 1))
    old_stone = material("ShrineOldStone", (.31, .34, .32, 1))
    timber = material("ShrineTimber", (.15, .07, .025, 1))
    rune = material("ShrineRune", (.18, .72, .48, 1))
    pieces = [
        cube("ShrineDais", (0, .13, 0), (1.75, .13, 1.35), moss_stone),
        cube("ShrineAltar", (0, .55, -.10), (.64, .34, .48), old_stone),
        cube("ShrineRuneFace", (0, .58, -.60), (.30, .18, .035), rune),
        cube("ShrinePillarLeft", (-1.28, 1.03, .28), (.28, 1.00, .28), old_stone),
        cube("ShrinePillarRight", (1.28, 1.03, .28), (.28, 1.00, .28), old_stone),
        cube("ShrineLintel", (0, 1.85, .28), (1.47, .22, .34), old_stone),
        cube("ShrineWoodBeam", (0, 2.15, .28), (1.75, .10, .14), timber),
    ]
    for i, (x, z, scale) in enumerate(((-1.55, -1.02, .30), (1.55, -1.04, .34), (-1.62, .92, .26), (1.52, .92, .28))):
        pieces.append(stone("ShrineRootStone_%d" % i, (x, .28, z), (scale, .52, scale), moss_stone))
    for i, angle in enumerate((-.42, .42)):
        pieces.append(cube("ShrineBranch_%d" % i, (0, 2.34, .28), (1.42, .08, .09), timber, rotation=(0, angle, 0)))

    bpy.ops.object.select_all(action="DESELECT")
    for piece in pieces:
        piece.select_set(True)
    bpy.context.view_layer.objects.active = pieces[0]
    bpy.ops.object.join()
    shrine = bpy.context.object
    shrine.name = "IsoperiaWildwoodShrine"
    bpy.ops.export_scene.fbx(filepath=output_path, use_selection=True,
                             add_leaf_bones=False, bake_anim=False,
                             path_mode="COPY", embed_textures=False)


if __name__ == '__main__':
    main(sys.argv[-1])
