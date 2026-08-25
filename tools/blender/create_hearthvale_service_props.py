"""Create a local-only Phase 1 Hearthvale service-prop starter set."""

from pathlib import Path
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "unity/Assets/Isoperia/Resources/Art/OwnedModels"
ART = ROOT / "art/blender"


def mat(name, color, metallic=0.0, roughness=0.7):
    material = bpy.data.materials.new(name)
    material.diffuse_color = (*color, 1.0)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    return material


def cube(name, loc, scale, material, bevel=0.04):
    bpy.ops.mesh.primitive_cube_add(location=loc)
    obj = bpy.context.object
    obj.name, obj.scale = name, scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    modifier = obj.modifiers.new("SoftEdges", "BEVEL")
    modifier.width, modifier.segments = bevel, 2
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.data.materials.append(material)
    return obj


def cylinder(name, loc, radius, depth, material, vertices=10):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(material)
    return obj


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


def main():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    OUT.mkdir(parents=True, exist_ok=True)
    ART.mkdir(parents=True, exist_ok=True)
    wood = mat("Service_Wood", (0.21, 0.07, 0.022), roughness=0.8)
    iron = mat("Service_Iron", (0.04, 0.05, 0.065), metallic=0.8, roughness=0.32)
    food = mat("Service_Produce", (0.52, 0.17, 0.035), roughness=0.72)
    fish = mat("Service_Fish", (0.20, 0.38, 0.45), metallic=0.12)

    # Forge-side anvil and tool stump.
    anvil = [cube("AnvilBase", (-3.0, 0, .13), (.34, .26, .13), iron),
             cube("AnvilWaist", (-3.0, 0, .36), (.18, .17, .15), iron),
             cube("AnvilFace", (-3.0, 0, .56), (.44, .22, .08), iron),
             cube("AnvilHorn", (-2.56, 0, .56), (.16, .13, .06), iron),
             cylinder("ToolStump", (-3.72, 0, .27), .22, .54, wood),
             cube("HammerHead", (-3.72, -.12, .72), (.15, .05, .05), iron),
             cylinder("HammerHandle", (-3.72, -.12, .58), .026, .29, wood, 8)]
    anvil_obj = join(anvil, "MCP_HearthvaleAnvil")

    # Market fish rack with simple wooden crossbars and catch baskets.
    rack = [cube("FishRackPost", (0, 0, .65), (.055, .055, .65), wood),
            cube("FishRackPost", (1.20, 0, .65), (.055, .055, .65), wood),
            cube("FishRackBeam", (.60, 0, 1.22), (.68, .05, .05), wood),
            cube("FishRackShelf", (.60, 0, .35), (.72, .30, .045), wood)]
    for x in (.22, .52, .82, 1.05):
        rack.append(cube("HangingFish", (x, -.04, .90), (.055, .035, .16), fish, .02))
    rack.append(cylinder("FishBasket", (.60, .18, .52), .18, .25, wood, 10))
    rack_obj = join(rack, "MCP_HearthvaleFishRack")

    # Produce crate with visible apples/roots. Low-poly balls keep it WebGL-cheap.
    produce = [cube("ProduceCrate", (3.0, 0, .25), (.52, .38, .25), wood)]
    for x, y, z in ((2.72, -.16, .56), (2.95, .10, .58), (3.22, -.10, .55), (3.08, .22, .54), (2.80, .18, .55)):
        bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1, radius=.115, location=(x, y, z))
        fruit = bpy.context.object
        fruit.name = "Produce"
        fruit.data.materials.append(food)
        produce.append(fruit)
    produce_obj = join(produce, "MCP_HearthvaleProduceCrate")

    bpy.ops.wm.save_as_mainfile(filepath=str(ART / "hearthvale_service_props.blend"))
    export(anvil_obj, "hearthvale_anvil.fbx")
    export(rack_obj, "hearthvale_fish_rack.fbx")
    export(produce_obj, "hearthvale_produce_crate.fbx")

    bpy.ops.mesh.primitive_plane_add(size=12, location=(0, 0, 0))
    bpy.context.object.data.materials.append(mat("ReviewGround", (.045, .06, .075)))
    bpy.ops.object.light_add(type="AREA", location=(1, -4, 5))
    bpy.context.object.data.energy, bpy.context.object.data.shape, bpy.context.object.data.size = 1100, "DISK", 5
    bpy.ops.object.camera_add(location=(7.5, -9.0, 5.4))
    camera = bpy.context.object
    bpy.context.scene.camera = camera
    camera.rotation_euler = (Vector((0, 0, .55)) - camera.location).to_track_quat("-Z", "Y").to_euler()
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = 960, 540, 100
    scene.render.filepath = str(ART / "hearthvale_service_props.png")
    bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()
