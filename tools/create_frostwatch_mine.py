"""Build an original Y-up Frostwatch mine entrance for Unity/WebGL."""
import bpy
import sys


def mat(name, color):
    value = bpy.data.materials.new(name)
    value.diffuse_color = color
    return value


def cube(name, loc, scale, material):
    bpy.ops.mesh.primitive_cube_add(location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    return obj


def stone(name, loc, scale, material):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=.52, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    return obj


def main(path):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    rock = mat('MineRock', (.23, .28, .33, 1))
    timber = mat('MineTimber', (.19, .09, .03, 1))
    dark = mat('MineDarkness', (.015, .02, .03, 1))
    lantern = mat('MineLantern', (.92, .62, .16, 1))
    pieces = [
        stone('MineCliff', (0, 1.02, .28), (2.35, 2.05, .90), rock),
        cube('MineDarkOpening', (0, .83, -.50), (1.00, .74, .06), dark),
        cube('MinePostLeft', (-1.08, .90, -.70), (.14, .90, .15), timber),
        cube('MinePostRight', (1.08, .90, -.70), (.14, .90, .15), timber),
        cube('MineHeader', (0, 1.67, -.70), (1.24, .15, .16), timber),
        cube('MineThreshold', (0, .10, -.66), (1.20, .10, .72), rock),
        cube('MineRailLeft', (-.53, .16, -1.36), (.045, .045, .70), timber),
        cube('MineRailRight', (.53, .16, -1.36), (.045, .045, .70), timber),
        cube('MineLanternA', (-1.37, 1.17, -.72), (.08, .13, .08), lantern),
        cube('MineLanternB', (1.37, 1.17, -.72), (.08, .13, .08), lantern),
    ]
    for i, (x, y, z, sx, sy) in enumerate(((-1.75,.35,-.48,.75,.64),(1.72,.38,-.45,.80,.70),(-1.50,1.48,.08,.70,.84),(1.48,1.42,.05,.64,.80))):
        pieces.append(stone('MineRubble_%d' % i, (x,y,z), (sx,sy,.62), rock))
    bpy.ops.object.select_all(action='DESELECT')
    for piece in pieces: piece.select_set(True)
    bpy.context.view_layer.objects.active = pieces[0]
    bpy.ops.object.join()
    bpy.context.object.name = 'IsoperiaFrostwatchMine'
    bpy.ops.export_scene.fbx(filepath=path, use_selection=True, add_leaf_bones=False, bake_anim=False, path_mode='COPY', embed_textures=False)


if __name__ == '__main__': main(sys.argv[-1])
