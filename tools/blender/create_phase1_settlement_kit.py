"""Local-only Phase 1 settlement kit: market, farm, and furniture props."""
from pathlib import Path
import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "unity/Assets/Isoperia/Resources/Art/OwnedModels"
ART = ROOT / "art/blender"

def material(name, color):
    m = bpy.data.materials.new(name); m.diffuse_color = (*color, 1); m.use_nodes = True
    m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*color, 1); return m
def cube(n,p,s,m):
    bpy.ops.mesh.primitive_cube_add(location=p); o=bpy.context.object; o.name=n; o.scale=s; bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); o.data.materials.append(m); return o
def cyl(n,p,r,d,m):
    bpy.ops.mesh.primitive_cylinder_add(vertices=10,radius=r,depth=d,location=p); o=bpy.context.object; o.name=n; o.data.materials.append(m); return o
def join(parts,n):
    bpy.ops.object.select_all(action="DESELECT")
    for p in parts:p.select_set(True)
    bpy.context.view_layer.objects.active=parts[0]; bpy.ops.object.join(); parts[0].name=n; return parts[0]
def export(o,n):
    bpy.ops.object.select_all(action="DESELECT"); o.select_set(True); bpy.context.view_layer.objects.active=o
    bpy.ops.export_scene.fbx(filepath=str(OUT/n),use_selection=True,apply_unit_scale=True,add_leaf_bones=False)
def main():
    bpy.ops.object.select_all(action="SELECT"); bpy.ops.object.delete(use_global=False); OUT.mkdir(parents=True,exist_ok=True); ART.mkdir(parents=True,exist_ok=True)
    wood=material("Kit_Wood",(.23,.085,.028)); rope=material("Kit_Rope",(.52,.36,.16)); cloth=material("Kit_Cloth",(.54,.08,.06)); straw=material("Kit_Straw",(.68,.52,.18));
    barrel=join([cyl("Barrel",(-4,0,.35),.28,.7,wood),cyl("Band",(-4,0,.17),.295,.035,rope),cyl("Band",(-4,0,.53),.295,.035,rope)],"MCP_Barrel"); export(barrel,"hearthvale_barrel.fbx")
    sacks=join([cube("Sack",(-2.3,0,.22),(.30,.24,.22),rope),cube("Sack",(-1.8,.12,.18),(.26,.22,.18),rope),cube("SackTie",(-2.3,0,.47),(.08,.08,.025),wood)],"MCP_Sacks"); export(sacks,"hearthvale_sacks.fbx")
    bench=join([cube("Seat",(0,0,.45),(.85,.22,.06),wood),cube("Back",(0,.18,.72),(.85,.045,.28),wood),cube("Leg",(-.62,0,.22),(.055,.16,.24),wood),cube("Leg",(.62,0,.22),(.055,.16,.24),wood)],"MCP_Bench"); export(bench,"hearthvale_bench.fbx")
    cart=join([cube("CartBed",(2.5,0,.48),(.66,.40,.10),wood),cube("CartHandle",(3.45,0,.37),(.50,.055,.055),wood),cyl("Wheel",(2.05,-.45,.28),.28,.10,wood),cyl("Wheel",(2.05,.45,.28),.28,.10,wood)],"MCP_Handcart"); export(cart,"hearthvale_handcart.fbx")
    bale=join([cube("HayBale",(4.6,0,.32),(.48,.34,.32),straw),cube("BaleRope",(4.6,-.35,.32),(.045,.02,.34),rope),cube("BaleRope",(4.6,.35,.32),(.045,.02,.34),rope)],"MCP_HayBale"); export(bale,"hearthvale_hay_bale.fbx")
    scare=join([cyl("ScarePost",(6.5,0,.85),.055,1.7,wood),cube("Arms",(6.5,0,1.20),(.62,.05,.05),wood),cube("Hat",(6.5,0,1.77),(.25,.25,.07),straw),cube("Cloth",(6.5,0,1.02),(.30,.05,.32),cloth)],"MCP_Scarecrow"); export(scare,"hearthvale_scarecrow.fbx")
    bpy.ops.wm.save_as_mainfile(filepath=str(ART/"phase1_settlement_kit.blend"))
    bpy.ops.mesh.primitive_plane_add(size=16); bpy.context.object.data.materials.append(material("ReviewGround",(.04,.055,.07)))
    bpy.ops.object.light_add(type="AREA",location=(1,-5,6)); bpy.context.object.data.energy=1200; bpy.context.object.data.size=6
    bpy.ops.object.camera_add(location=(10,-12,7)); cam=bpy.context.object; bpy.context.scene.camera=cam; cam.rotation_euler=(Vector((1,0,.6))-cam.location).to_track_quat("-Z","Y").to_euler()
    s=bpy.context.scene; s.render.engine="BLENDER_EEVEE"; s.render.resolution_x=960; s.render.resolution_y=540; s.render.filepath=str(ART/"phase1_settlement_kit.png"); bpy.ops.render.render(write_still=True)
if __name__=="__main__":main()
