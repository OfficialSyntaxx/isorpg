"""Original local Blender Phase 4 route landmarks for Wildwood and Frostwatch."""
from pathlib import Path
from math import radians, sin, cos
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "unity/Assets/Isoperia/Resources/Art/OwnedModels"
ART = ROOT / "art/blender"


def material(name, color, metallic=0.0, roughness=0.68):
    value = bpy.data.materials.new(name)
    value.diffuse_color = (*color, 1.0)
    value.use_nodes = True
    shader = value.node_tree.nodes["Principled BSDF"]
    shader.inputs["Base Color"].default_value = (*color, 1.0)
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    return value


def cube(name, position, scale, mat, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(location=position)
    value = bpy.context.object
    value.name = name
    value.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    value.data.materials.append(mat)
    if bevel:
        modifier = value.modifiers.new("WeatheredEdges", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
        bpy.context.view_layer.objects.active = value
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    return value


def cylinder(name, position, radius, depth, mat, vertices=12):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=position)
    value = bpy.context.object
    value.name = name
    value.data.materials.append(mat)
    return value


def cone(name, position, radius1, radius2, depth, mat, vertices=12):
    bpy.ops.mesh.primitive_cone_add(vertices=vertices, radius1=radius1, radius2=radius2, depth=depth, location=position)
    value = bpy.context.object
    value.name = name
    value.data.materials.append(mat)
    return value


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
    bpy.ops.export_scene.fbx(filepath=str(OUT / filename), use_selection=True, apply_unit_scale=True, add_leaf_bones=False)


def wildwood_gate(wood, stone, leaf, rune, rope):
    parts = []
    for y in (-.88, .88):
        parts.extend([
            cylinder("GateTimber", (-3.8, y, 1.05), .115, 2.10, wood, 10),
            cone("StoneFoot", (-3.8, y, .16), .26, .16, .30, stone, 8),
            cylinder("RopeBinding", (-3.8, y, 1.46), .14, .10, rope, 10),
        ])
    parts.extend([
        cube("GateLintel", (-3.8, 0, 1.86), (.14, 1.18, .13), wood, .04),
        cube("LeafCanopy", (-3.8, 0, 2.04), (.19, 1.35, .18), leaf, .08),
        cube("RunePanel", (-3.63, 0, 1.70), (.025, .28, .24), rune, .02),
        cone("HangingRune", (-3.56, 0, 1.28), .15, .045, .38, rune, 8),
    ])
    for index in range(7):
        y = -.98 + index * .32
        parts.append(cone("LeafCluster", (-3.8, y, 2.24 + .06 * sin(index)), .16, .025, .34, leaf, 7))
    return join(parts, "MCP_WildwoodWaygate")


def frostwatch_mine_gate(stone, iron, crystal, snow, rope):
    parts = [
        cube("MineFoundation", (3.2, 0, .16), (.38, 1.48, .16), stone, .04),
        cube("MineLintel", (3.2, 0, 2.00), (.30, 1.58, .18), stone, .045),
        cube("MineShadow", (3.13, 0, 1.05), (.025, 1.05, .78), iron, .01),
    ]
    for y in (-1.10, 1.10):
        parts.extend([
            cube("MinePillar", (3.2, y, 1.03), (.28, .19, .86), stone, .04),
            cylinder("IronBolt", (3.02, y, 1.28), .075, .10, iron, 8),
            cone("SnowCap", (3.2, y, 1.92), .31, .16, .18, snow, 8),
        ])
    for index in range(5):
        y = -.76 + index * .38
        height = .24 + .07 * (index % 2)
        parts.append(cone("CrystalShard", (2.84, y, height), .11, .03, height * 2.0, crystal, 6))
    for angle in (20, -20):
        brace = cube("WoodBrace", (3.0, 1.35 if angle > 0 else -1.35, 1.28), (.09, .08, .90), rope, .025)
        brace.rotation_euler[1] = radians(angle)
        parts.append(brace)
    return join(parts, "MCP_FrostwatchMineGate")


def review_render():
    bpy.ops.mesh.primitive_plane_add(size=18, location=(0, 0, -.02))
    bpy.context.object.data.materials.append(material("ReviewGround", (.035, .05, .07)))
    bpy.ops.object.light_add(type="AREA", location=(0, -5, 6))
    bpy.context.object.data.energy = 1350
    bpy.context.object.data.size = 5
    bpy.ops.object.light_add(type="AREA", location=(-5, 2, 4))
    bpy.context.object.data.energy = 700
    bpy.context.object.data.color = (.30, .55, 1.0)
    bpy.context.object.data.size = 4
    bpy.ops.object.camera_add(location=(9, -11, 6.8))
    camera = bpy.context.object
    bpy.context.scene.camera = camera
    camera.rotation_euler = (Vector((0, 0, 1.0)) - camera.location).to_track_quat("-Z", "Y").to_euler()
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 960
    scene.render.resolution_y = 540
    scene.render.filepath = str(ART / "phase4_route_landmarks.png")
    bpy.ops.render.render(write_still=True)


def main():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    OUT.mkdir(parents=True, exist_ok=True)
    ART.mkdir(parents=True, exist_ok=True)
    wood = material("GateWood", (.17, .06, .02))
    stone = material("Stone", (.20, .25, .29), 0.0, .85)
    leaf = material("Leaf", (.10, .32, .13))
    rune = material("RuneGlow", (.12, .75, .82), .05, .18)
    rope = material("Rope", (.46, .29, .10))
    iron = material("Iron", (.08, .12, .16), .55, .38)
    crystal = material("CrystalGlow", (.34, .75, 1.0), .10, .14)
    snow = material("Ice", (.65, .78, .88), .0, .35)
    gate = wildwood_gate(wood, stone, leaf, rune, rope)
    mine = frostwatch_mine_gate(stone, iron, crystal, snow, rope)
    export(gate, "wildwood_waygate.fbx")
    export(mine, "frostwatch_mine_gate.fbx")
    bpy.ops.wm.save_as_mainfile(filepath=str(ART / "phase4_route_landmarks.blend"))
    review_render()


if __name__ == "__main__":
    main()
