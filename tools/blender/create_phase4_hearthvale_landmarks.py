"""Original local Blender Phase 4 landmarks for Hearthvale's central plaza."""
from pathlib import Path
from math import radians
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "unity/Assets/Isoperia/Resources/Art/OwnedModels"
ART = ROOT / "art/blender"


def material(name, color, metallic=0.0, roughness=0.65):
    result = bpy.data.materials.new(name)
    result.diffuse_color = (*color, 1.0)
    result.use_nodes = True
    principled = result.node_tree.nodes["Principled BSDF"]
    principled.inputs["Base Color"].default_value = (*color, 1.0)
    principled.inputs["Metallic"].default_value = metallic
    principled.inputs["Roughness"].default_value = roughness
    return result


def cube(name, position, scale, mat, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(location=position)
    result = bpy.context.object
    result.name = name
    result.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    result.data.materials.append(mat)
    if bevel > 0.0:
        modifier = result.modifiers.new("SoftEdges", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
        bpy.context.view_layer.objects.active = result
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    return result


def cylinder(name, position, radius, depth, mat, vertices=16):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=position)
    result = bpy.context.object
    result.name = name
    result.data.materials.append(mat)
    bevel = result.modifiers.new("RimSoftness", "BEVEL")
    bevel.width = min(radius * .08, .035)
    bevel.segments = 2
    bpy.context.view_layer.objects.active = result
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    return result


def cone(name, position, radius1, radius2, depth, mat, vertices=16):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius1, radius2=radius2, depth=depth, location=position)
    result = bpy.context.object
    result.name = name
    result.data.materials.append(mat)
    return result


def join(parts, name):
    bpy.ops.object.select_all(action="DESELECT")
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    parts[0].name = name
    return parts[0]


def export(obj, filename):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.fbx(
        filepath=str(OUT / filename),
        use_selection=True,
        apply_unit_scale=True,
        add_leaf_bones=False,
    )


def create_fountain(stone, trim, water, rune):
    parts = [
        cylinder("Foundation", (-3.8, 0, .10), 1.36, .20, stone, 20),
        cylinder("LowerRim", (-3.8, 0, .27), 1.17, .18, trim, 20),
        cylinder("WaterBasin", (-3.8, 0, .36), .98, .06, water, 20),
        cylinder("BasinWall", (-3.8, 0, .48), 1.02, .20, stone, 20),
        cylinder("InnerWater", (-3.8, 0, .59), .78, .055, water, 20),
        cone("Pedestal", (-3.8, 0, .87), .46, .28, .55, trim, 12),
        cylinder("Spire", (-3.8, 0, 1.27), .14, .48, stone, 12),
        cone("Crystal", (-3.8, 0, 1.68), .18, .045, .50, rune, 8),
    ]
    for index in range(8):
        angle = radians(index * 45)
        x = -3.8 + .92 * __import__("math").cos(angle)
        y = .92 * __import__("math").sin(angle)
        gem = cube("RuneInset", (x, y, .55), (.085, .045, .11), rune, .015)
        gem.rotation_euler[2] = angle
        parts.append(gem)
    return join(parts, "MCP_HearthvalePlazaFountain")


def create_canopy(wood, cloth, trim, lantern):
    parts = []
    for x in (-.68, .68):
        for y in (-.48, .48):
            parts.append(cylinder("TimberPost", (2.9 + x, y, .72), .055, 1.44, wood, 10))
            parts.append(cylinder("Foot", (2.9 + x, y, .08), .105, .12, trim, 10))
    parts.extend([
        cube("Counter", (2.9, 0, .46), (.86, .56, .10), wood, .035),
        cube("BackShelves", (3.58, 0, .88), (.06, .50, .44), wood, .025),
        cube("ShelfOne", (3.50, 0, .78), (.09, .47, .04), trim, .015),
        cube("ShelfTwo", (3.50, 0, 1.05), (.09, .47, .04), trim, .015),
        cube("RoofFrame", (2.9, 0, 1.46), (.92, .70, .07), wood, .035),
        cube("Canopy", (2.9, 0, 1.55), (.98, .76, .09), cloth, .055),
        cube("StripeOne", (2.9, -.77, 1.55), (.94, .025, .06), trim, .01),
        cube("StripeTwo", (2.9, .77, 1.55), (.94, .025, .06), trim, .01),
        cylinder("Lantern", (2.9, -.72, 1.23), .095, .20, lantern, 10),
        cylinder("Lantern", (2.9, .72, 1.23), .095, .20, lantern, 10),
    ])
    for y in (-.28, 0, .28):
        parts.append(cylinder("Bottle", (2.22, y, .68), .055, .22, lantern if y == 0 else trim, 8))
    return join(parts, "MCP_HearthvaleMarketCanopy")


def render_review():
    bpy.ops.mesh.primitive_plane_add(size=18, location=(0, 0, -.02))
    bpy.context.object.data.materials.append(material("ReviewGround", (.035, .05, .07)))
    bpy.ops.object.light_add(type="AREA", location=(1, -5, 6))
    bpy.context.object.data.energy = 1300
    bpy.context.object.data.shape = "DISK"
    bpy.context.object.data.size = 5
    bpy.ops.object.light_add(type="AREA", location=(-5, 3, 4))
    bpy.context.object.data.energy = 800
    bpy.context.object.data.color = (.35, .55, 1.0)
    bpy.context.object.data.size = 4
    bpy.ops.object.camera_add(location=(9, -11, 6.8))
    camera = bpy.context.object
    bpy.context.scene.camera = camera
    camera.rotation_euler = (Vector((0, 0, .8)) - camera.location).to_track_quat("-Z", "Y").to_euler()
    scene = bpy.context.scene
    # Blender 5.2 keeps the Eevee identifier as BLENDER_EEVEE.
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 960
    scene.render.resolution_y = 540
    scene.render.resolution_percentage = 100
    scene.render.filepath = str(ART / "phase4_hearthvale_landmarks.png")
    bpy.ops.render.render(write_still=True)


def main():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    OUT.mkdir(parents=True, exist_ok=True)
    ART.mkdir(parents=True, exist_ok=True)
    stone = material("Plaza_Stone", (.18, .22, .26), 0.0, .82)
    trim = material("Plaza_Trim", (.38, .25, .11), .12, .48)
    water = material("Water", (.04, .30, .48), .28, .24)
    rune = material("RuneGlow", (.10, .72, .92), .05, .18)
    wood = material("Canopy_Wood", (.19, .07, .025), 0.0, .75)
    cloth = material("Canopy_Cloth", (.15, .30, .48), 0.0, .58)
    lantern = material("LanternGlow", (1.0, .40, .08), 0.0, .18)
    fountain = create_fountain(stone, trim, water, rune)
    canopy = create_canopy(wood, cloth, trim, lantern)
    export(fountain, "hearthvale_plaza_fountain.fbx")
    export(canopy, "hearthvale_market_canopy.fbx")
    bpy.ops.wm.save_as_mainfile(filepath=str(ART / "phase4_hearthvale_landmarks.blend"))
    render_review()


if __name__ == "__main__":
    main()
