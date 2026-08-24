"""Build an original low-poly ore vein prop for Isoperia's mining nodes."""

import bpy
import math
import sys


def material(name, color):
    value = bpy.data.materials.new(name)
    value.diffuse_color = color
    return value


def rock(name, location, scale, base):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=.55, location=location)
    piece = bpy.context.object
    piece.name = name
    piece.scale = scale
    piece.rotation_euler = (0.0, 0.22, location[0] * 1.9 + location[2] * .7)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    piece.data.materials.append(base)
    return piece


def vein(name, location, scale, ore):
    # Embedded mineral facets rather than long crystals: this stays legible as
    # a seam from gameplay distance and survives the Blender-to-Unity axis
    # conversion without turning into a row of horizontal rods.
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=.22, location=location)
    crystal = bpy.context.object
    crystal.name = name
    crystal.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    crystal.data.materials.append(ore)
    return crystal


def main(output_path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    base = material("OreVeinStone", (.20, .23, .27, 1))
    ore = material("OreVeinMineral", (.76, .31, .08, 1))
    pieces = [
        rock("VeinBoulderCore", (0, .46, 0), (1.05, .85, .90), base),
        rock("VeinBoulderLeft", (-.43, .28, .14), (.62, .52, .64), base),
        rock("VeinBoulderRight", (.43, .25, -.10), (.58, .48, .62), base),
        rock("VeinBoulderBack", (.06, .29, -.40), (.70, .52, .48), base),
    ]
    for index, (loc, scale) in enumerate((
        ((-.19, .73, .37), (1.15, .50, .90)),
        ((.18, .86, .28), (.95, .55, 1.05)),
        ((.39, .57, .03), (1.20, .45, .80)),
        ((-.42, .48, -.05), (.85, .48, 1.15)),
    )):
        pieces.append(vein("MineralSeam_%d" % index, loc, scale, ore))

    bpy.ops.object.select_all(action="DESELECT")
    for piece in pieces:
        piece.select_set(True)
    bpy.context.view_layer.objects.active = pieces[0]
    bpy.ops.object.join()
    result = bpy.context.object
    result.name = "IsoperiaOreVein"
    bpy.ops.export_scene.fbx(filepath=output_path, use_selection=True,
                             add_leaf_bones=False, bake_anim=False,
                             path_mode="COPY", embed_textures=False)


if __name__ == "__main__":
    main(sys.argv[-1])
