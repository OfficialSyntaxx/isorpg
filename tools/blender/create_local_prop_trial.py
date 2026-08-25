"""Create two original, local-only Blender props for Isoperia.

No model or texture service is called. The output is a Unity-importable FBX
containing a trail lantern and a travel crate, plus a review render.
"""

from pathlib import Path
import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "unity/Assets/Isoperia/Resources/Art/OwnedModels/local_prop_trial.fbx"
SOURCE = ROOT / "art/blender/local_prop_trial.blend"
RENDER = ROOT / "art/blender/local_prop_trial.png"


def material(name, color, metallic=0.0, roughness=0.65):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    return mat


WOOD = None
IRON = None
GLOW = None


def cube(name, location, scale, mat, bevel=0.06):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        modifier = obj.modifiers.new("Soft edges", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.data.materials.append(mat)
    return obj


def cylinder(name, location, radius, depth, mat, vertices=12):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    return obj


def join(parts, name):
    bpy.ops.object.select_all(action="DESELECT")
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    parts[0].name = name
    return parts[0]


def make_lantern():
    parts = []
    for z, radius in ((0.10, 0.23), (1.55, 0.16)):
        parts.append(cylinder("Lantern_Iron", (-1.45, 0, z), radius, 0.10, IRON))
    parts.append(cylinder("Lantern_Post", (-1.45, 0, 0.80), 0.08, 1.40, WOOD))
    for dx, dy in ((0.16, 0.16), (-0.16, 0.16), (0.16, -0.16), (-0.16, -0.16)):
        parts.append(cylinder("Lantern_Frame", (-1.45 + dx, dy, 1.31), 0.025, 0.40, IRON, 8))
    parts.append(cylinder("Lantern_Glass", (-1.45, 0, 1.31), 0.145, 0.34, GLOW, 16))
    roof = bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=0.29, radius2=0.04, depth=0.22, location=(-1.45, 0, 1.60))
    roof = bpy.context.object
    roof.name = "Lantern_Roof"
    roof.rotation_euler[2] = 0.785
    roof.data.materials.append(IRON)
    parts.append(roof)
    return join(parts, "MCP_TrailLantern")


def make_crate():
    parts = [cube("Crate_Core", (1.20, 0, 0.36), (0.48, 0.38, 0.36), WOOD, 0.035)]
    for z in (0.10, 0.62):
        parts.append(cube("Crate_Band", (1.20, 0, z), (0.51, 0.035, 0.035), IRON, 0.01))
    for x in (0.78, 1.62):
        parts.append(cube("Crate_Edge", (x, 0, 0.36), (0.035, 0.42, 0.40), IRON, 0.01))
    parts.append(cube("Crate_Strapping", (1.20, 0, 0.72), (0.15, 0.42, 0.025), IRON, 0.01))
    return join(parts, "MCP_TravelersCrate")


def main():
    global WOOD, IRON, GLOW
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    WOOD = material("Local_WarmWood", (0.22, 0.075, 0.025), roughness=0.82)
    IRON = material("Local_DarkIron", (0.035, 0.045, 0.055), metallic=0.75, roughness=0.35)
    GLOW = material("Local_AmberGlass", (1.0, 0.18, 0.015), roughness=0.25)
    GLOW.node_tree.nodes["Principled BSDF"].inputs["Emission Color"].default_value = (1.0, 0.06, 0.0, 1.0)
    GLOW.node_tree.nodes["Principled BSDF"].inputs["Emission Strength"].default_value = 2.5
    lantern = make_lantern()
    crate = make_crate()
    for obj in (lantern, crate):
        obj.select_set(True)
    SOURCE.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
    bpy.ops.export_scene.fbx(filepath=str(OUTPUT), use_selection=True, apply_unit_scale=True, add_leaf_bones=False)
    bpy.ops.mesh.primitive_plane_add(size=8, location=(0, 0, 0))
    floor = bpy.context.object
    floor.data.materials.append(material("ReviewGround", (0.04, 0.055, 0.07)))
    bpy.ops.object.light_add(type="AREA", location=(0, -3.5, 4))
    bpy.context.object.data.energy = 900
    bpy.context.object.data.shape = "DISK"
    bpy.context.object.data.size = 5
    bpy.ops.object.camera_add(location=(4.6, -6.0, 3.7))
    camera = bpy.context.object
    bpy.context.scene.camera = camera
    direction = Vector((0, 0, 0.75)) - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 960
    scene.render.resolution_y = 540
    scene.render.resolution_percentage = 100
    scene.render.filepath = str(RENDER)
    scene.world.color = (0.015, 0.02, 0.035)
    bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()
