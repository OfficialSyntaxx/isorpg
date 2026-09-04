"""Generate original, atlas-mapped M0 Shorelands source meshes in Blender."""

import bpy
import math
import os

ROOT = "/Users/syntaxx/isorpg-m0"
OUT = os.path.join(ROOT, "unity/Assets/Isoperia/Art/M0/Generated")
ATLAS = os.path.join(ROOT, "unity/Assets/Isoperia/Art/Textures/shorelands_atlas.png")
os.makedirs(OUT, exist_ok=True)

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)

source = bpy.data.collections.get("M0_SHORELANDS_SOURCE")
if source is None:
    source = bpy.data.collections.new("M0_SHORELANDS_SOURCE")
    bpy.context.scene.collection.children.link(source)

mat = bpy.data.materials.get("M_Shorelands_Atlas") or bpy.data.materials.new("M_Shorelands_Atlas")
mat.use_nodes = True
nodes = mat.node_tree.nodes
links = mat.node_tree.links
nodes.clear()
out = nodes.new("ShaderNodeOutputMaterial")
bsdf = nodes.new("ShaderNodeBsdfPrincipled")
tex = nodes.new("ShaderNodeTexImage")
if os.path.exists(ATLAS):
    tex.image = bpy.data.images.load(ATLAS, check_existing=True)
bsdf.inputs["Roughness"].default_value = 0.92
links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

report = {}


def deselect():
    bpy.ops.object.select_all(action="DESELECT")


def link_source(obj):
    for collection in list(obj.users_collection):
        collection.objects.unlink(obj)
    source.objects.link(obj)


def ico(loc, scale, sub=4):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub, radius=1, location=loc)
    obj = bpy.context.object
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    link_source(obj)
    return obj


def cone(loc, radius_1, radius_2, depth, verts=12, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(
        vertices=verts,
        radius1=radius_1,
        radius2=radius_2,
        depth=depth,
        location=loc,
        rotation=rot,
    )
    obj = bpy.context.object
    link_source(obj)
    return obj


def torus(loc, major, minor, major_segments=56, minor_segments=24):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major,
        minor_radius=minor,
        major_segments=major_segments,
        minor_segments=minor_segments,
        location=loc,
        rotation=(math.pi / 2, 0, 0),
    )
    obj = bpy.context.object
    link_source(obj)
    return obj


def triangles(obj):
    return sum(max(0, len(poly.vertices) - 2) for poly in obj.data.polygons)


def triangulate_and_uv(obj):
    deselect()
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.quads_convert_to_tris(quad_method="FIXED", ngon_method="BEAUTY")
    bpy.ops.uv.smart_project(island_margin=0.025)
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.data.materials.append(mat)


def set_atlas_band_uv(obj, channel):
    """Keep each mesh on one atlas band while retaining U variation."""
    bands = {"sand": 0, "timber": 1, "grass": 2, "sea": 3, "slate": 4}
    v = (bands[channel] + 0.5) / 5.0
    uv_layer = obj.data.uv_layers.active
    if uv_layer is None:
        raise RuntimeError(f"{obj.name} has no UV layer after smart projection")
    for loop in obj.data.loops:
        uv = uv_layer.data[loop.index].uv
        uv_layer.data[loop.index].uv = (min(max(uv.x, 0.5 / 256.0), 255.5 / 256.0), v)


def assign_palette_weights(obj, channel):
    """Write normalized atlas-family weights for ShorelandsAtlasSurface."""
    weights = {
        "sand": (1.0, 0.0, 0.0, 0.0),
        "timber": (0.0, 1.0, 0.0, 0.0),
        "grass": (0.0, 0.0, 1.0, 0.0),
        "slate": (0.0, 0.0, 0.0, 1.0),
    }
    rgba = weights[channel]
    colors = obj.data.color_attributes.get("ShorelandsPaletteWeights")
    if colors is None:
        colors = obj.data.color_attributes.new(
            name="ShorelandsPaletteWeights", type="FLOAT_COLOR", domain="CORNER"
        )
    for item in colors.data:
        item.color = rgba


def export_selected(obj, filename):
    deselect()
    obj.hide_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.export_scene.fbx(
        filepath=os.path.join(OUT, filename + ".fbx"),
        use_selection=True,
        # Unity's FBX importer applies the centimetre conversion to Blender FBX
        # payloads. Export centimetres here so imported geometry remains 1 Unity
        # unit = 1 authored metre rather than arriving at 0.01 scale.
        global_scale=100.0,
        apply_unit_scale=True,
        axis_forward="-Z",
        axis_up="Y",
        add_leaf_bones=False,
        bake_anim=False,
        mesh_smooth_type="FACE",
    )
    deselect()


def finalize(parts, name, palette_channel="slate", make_lod=False):
    deselect()
    for part in parts:
        part.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name
    obj.location = (0, 0, 0)
    triangulate_and_uv(obj)
    set_atlas_band_uv(obj, palette_channel)
    assign_palette_weights(obj, palette_channel)
    min_z = min(vertex.co.z for vertex in obj.data.vertices)
    for vertex in obj.data.vertices:
        vertex.co.z -= min_z
    obj.data.update()
    report[name] = triangles(obj)
    export_selected(obj, name.lower())
    if make_lod:
        lod = obj.copy()
        lod.data = obj.data.copy()
        source.objects.link(lod)
        lod.name = name + "_LOD1"
        deselect()
        lod.select_set(True)
        bpy.context.view_layer.objects.active = lod
        modifier = lod.modifiers.new("LOD1_Decimate", "DECIMATE")
        modifier.ratio = 0.38
        bpy.ops.object.modifier_apply(modifier=modifier.name)
        export_selected(lod, name.lower() + "_lod1")
        bpy.data.objects.remove(lod, do_unlink=True)
    obj.hide_set(True)
    return obj


# Hero landforms: 2,000–5,000 triangles each, original and atlas-mapped.
finalize([
    ico((-3.2, 0, 4.5), (2.8, 2.1, 4.5)),
    ico((0, 0.2, 4.1), (2.5, 2.3, 4.1)),
    ico((2.8, -0.3, 3.5), (2.1, 1.8, 3.5)),
], "shorelands_cliff_wall", "slate")
finalize([torus((0, 0, 5.2), 5.0, 1.15)], "shorelands_sea_arch", "slate")
finalize([
    ico((-3.0, 0, 3.1), (3.6, 2.6, 2.6)),
    ico((0, 0, 4.2), (3.8, 2.1, 1.8)),
    ico((3.0, 0, 3.0), (2.5, 2.0, 2.6)),
], "shorelands_plateau_overhang", "slate")
finalize([
    ico((-2.0, 0, 2.0), (3.3, 2.4, 2.0)),
    ico((2.2, 0, 1.6), (2.8, 2.1, 1.6)),
], "shorelands_wreck_rock_shelf", "slate")
finalize([torus((0, 0, 4.2), 4.0, 1.25)], "shorelands_cave_mouth", "slate")

# Original scatter: two tree species, four rocks, grass and beach debris, each with LOD1.
finalize([
    cone((0, 0, 1.6), 0.26, 0.16, 3.2, 12),
    cone((0, 0, 3.1), 1.45, 0.15, 2.8, 12),
    cone((0, 0, 4.4), 1.05, 0.10, 2.4, 12),
    ico((0.15, 0, 5.1), (0.85, 0.85, 0.65), 2),
], "shorelands_tree_pine_a", "grass", True)
finalize([
    cone((0, 0, 1.4), 0.34, 0.22, 2.8, 12),
    ico((-0.9, 0, 3.6), (1.3, 1.0, 1.25), 2),
    ico((0.9, 0.1, 3.8), (1.2, 1.0, 1.2), 2),
    ico((0, 0.45, 4.7), (1.1, 1.0, 1.0), 2),
], "shorelands_tree_broadleaf_b", "grass", True)
for rock, sx, sy, sz in [
    ("shorelands_rock_a", 1.8, 1.3, 1.1),
    ("shorelands_rock_b", 1.3, 1.9, 0.9),
    ("shorelands_rock_c", 2.2, 1.1, 0.75),
    ("shorelands_rock_d", 1.05, 1.05, 1.65),
]:
    finalize([ico((0, 0, sz), (sx, sy, sz), 3)], rock, "slate", True)
finalize([
    cone((-0.38, 0, 0.65), 0.16, 0.02, 1.3, 32, (0.12, 0, 0)),
    cone((0.38, 0, 0.62), 0.16, 0.02, 1.24, 32, (-0.13, 0.08, 0)),
    cone((0, 0.26, 0.78), 0.15, 0.02, 1.55, 32, (0, 0.12, 0)),
], "shorelands_grass_tuft", "grass", True)
finalize([
    ico((-0.75, 0, 0.45), (1.15, 0.55, 0.45), 2),
    ico((0.72, 0.15, 0.36), (0.85, 0.42, 0.36), 2),
    cone((0, -0.25, 0.32), 0.32, 0.22, 1.3, 12, (0, math.pi / 2, 0)),
], "shorelands_beach_debris", "timber", True)

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, "art/blender/m0_shorelands_landforms.blend"))
print("M0_EXPORT_REPORT", report)
