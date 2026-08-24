"""Build an original low-poly campfire prop for Isoperia's settlement layer."""

import bpy
import math
import sys


def make_material(name, color):
    material = bpy.data.materials.new(name)
    material.diffuse_color = color
    return material


def add_cube(name, location, scale, material, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    return obj


def add_rock(index, angle, material):
    radius = .43
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=.18,
                                          location=(math.cos(angle) * radius, .14, math.sin(angle) * radius))
    rock = bpy.context.object
    rock.name = "HearthStone_%d" % index
    rock.scale = (1.15, .62, .92)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    rock.data.materials.append(material)
    return rock


def main(output_path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    wood = make_material("CampfireWood", (.20, .07, .02, 1))
    stone = make_material("CampfireStone", (.20, .22, .24, 1))
    ember = make_material("CampfireEmber", (.88, .18, .025, 1))
    flame = make_material("CampfireFlame", (1.0, .46, .04, 1))
    pieces = []
    for index in range(7):
        pieces.append(add_rock(index, index * math.tau / 7, stone))
    pieces.append(add_cube("LogA", (0, .16, 0), (.48, .075, .075), wood, rotation=(0, .38, .48)))
    pieces.append(add_cube("LogB", (0, .17, 0), (.48, .075, .075), wood, rotation=(0, -.38, -.48)))
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=.19, location=(0, .29, 0))
    coal = bpy.context.object
    coal.name = "Embers"
    coal.scale = (1.2, .55, 1.0)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    coal.data.materials.append(ember)
    pieces.append(coal)
    for index, (radius, height) in enumerate(((.24, .56), (.17, .72), (.10, .84))):
        bpy.ops.mesh.primitive_cone_add(vertices=5, radius1=radius, radius2=0,
                                        depth=height, location=(0, .36 + height * .5, 0))
        tongue = bpy.context.object
        tongue.name = "FlameTongue_%d" % index
        tongue.rotation_euler = (index * .18, 0, index * 1.6)
        tongue.data.materials.append(flame)
        pieces.append(tongue)
    bpy.ops.object.select_all(action="DESELECT")
    for piece in pieces:
        piece.select_set(True)
    bpy.context.view_layer.objects.active = pieces[0]
    bpy.ops.object.join()
    fire = bpy.context.object
    fire.name = "IsoperiaCampfire"
    bpy.ops.export_scene.fbx(filepath=output_path, use_selection=True,
                             add_leaf_bones=False, bake_anim=False,
                             path_mode="COPY", embed_textures=False)


if __name__ == "__main__":
    main(sys.argv[-1])
