"""Build the original Cinder Hollow entrance in Isoperia's Y-up FBX convention."""

import bpy
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
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=.52, location=location)
    piece = bpy.context.object
    piece.name = name
    piece.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    piece.data.materials.append(mat)
    return piece


def main(output_path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    basalt = material("CinderGateBasalt", (.16, .10, .15, 1))
    rune = material("CinderGateRune", (1.0, .24, .035, 1))
    darkness = material("CinderGateDarkness", (.012, .010, .018, 1))
    # Existing Isoperia FBX assets use Y as their game-facing vertical axis.
    pieces = [
        stone("BasaltPillarLeft", (-.78, .86, 0), (.75, 1.70, .75), basalt),
        stone("BasaltPillarRight", (.78, .86, 0), (.75, 1.70, .75), basalt),
        cube("BasaltLintel", (0, 1.72, 0), (1.18, .27, .32), basalt),
        stone("BasaltCrown", (0, 2.08, 0), (.72, .42, .50), basalt),
        cube("Threshold", (0, .11, 0), (1.03, .12, .48), basalt),
        cube("GateDarkness", (0, .88, .035), (.54, .68, .07), darkness),
    ]
    for index, (x, y, z, size) in enumerate(((-.25, 1.76, -.30, .14), (0, 1.92, -.31, .17), (.27, 1.76, -.30, .14))):
        pieces.append(stone("EmberRune_%d" % index, (x, y, z), (size, size * 1.25, .10), rune))

    bpy.ops.object.select_all(action="DESELECT")
    for piece in pieces:
        piece.select_set(True)
    bpy.context.view_layer.objects.active = pieces[0]
    bpy.ops.object.join()
    gate = bpy.context.object
    gate.name = "IsoperiaCinderGate"
    bpy.ops.export_scene.fbx(filepath=output_path, use_selection=True,
                             add_leaf_bones=False, bake_anim=False,
                             path_mode="COPY", embed_textures=False)


if __name__ == "__main__":
    main(sys.argv[-1])
