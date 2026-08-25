"""Local-only Hearthvale home/interior prop starter kit."""
from pathlib import Path
import bpy
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]; OUT=ROOT/"unity/Assets/Isoperia/Resources/Art/OwnedModels"; ART=ROOT/"art/blender"
def m(n,c):
 o=bpy.data.materials.new(n);o.diffuse_color=(*c,1);o.use_nodes=True;o.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value=(*c,1);return o
def q(n,p,s,a):
 bpy.ops.mesh.primitive_cube_add(location=p);o=bpy.context.object;o.name=n;o.scale=s;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(a);return o
def c(n,p,r,d,a):
 bpy.ops.mesh.primitive_cylinder_add(vertices=10,radius=r,depth=d,location=p);o=bpy.context.object;o.name=n;o.data.materials.append(a);return o
def j(ps,n):
 bpy.ops.object.select_all(action="DESELECT");[x.select_set(True) for x in ps];bpy.context.view_layer.objects.active=ps[0];bpy.ops.object.join();ps[0].name=n;return ps[0]
def x(o,n):
 bpy.ops.object.select_all(action="DESELECT");o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.export_scene.fbx(filepath=str(OUT/n),use_selection=True,apply_unit_scale=True,add_leaf_bones=False)
def main():
 bpy.ops.object.select_all(action="SELECT");bpy.ops.object.delete(use_global=False);OUT.mkdir(parents=True,exist_ok=True);ART.mkdir(parents=True,exist_ok=True)
 wood=m("Home_Wood",(.20,.07,.025)); cloth=m("Home_Cloth",(.10,.25,.36)); stone=m("Home_Stone",(.19,.21,.23)); ember=m("Home_Ember",(.95,.16,.02))
 table=j([q("Top",(-4,0,.72),(.75,.45,.06),wood),q("Leg",(-4.57,-.30,.36),(.05,.05,.36),wood),q("Leg",(-3.43,.30,.36),(.05,.05,.36),wood),q("Leg",(-3.43,-.30,.36),(.05,.05,.36),wood),q("Leg",(-4.57,.30,.36),(.05,.05,.36),wood)],"MCP_Table");x(table,"hearthvale_table.fbx")
 chair=j([q("Seat",(-1.8,0,.43),(.26,.26,.05),wood),q("Back",(-1.8,.22,.75),(.26,.04,.30),wood),q("Leg",(-1.98,-.18,.21),(.035,.035,.21),wood),q("Leg",(-1.62,.18,.21),(.035,.035,.21),wood)],"MCP_Chair");x(chair,"hearthvale_chair.fbx")
 bed=j([q("Frame",(.4,0,.36),(.85,.48,.12),wood),q("Mattress",(.4,0,.55),(.78,.43,.10),cloth),q("Head",(-.38,0,.83),(.06,.48,.32),wood),q("Pillow",(-.10,0,.70),(.18,.30,.06),stone)],"MCP_Bed");x(bed,"hearthvale_bed.fbx")
 shelf=j([q("Side",(2.2,-.42,.90),(.05,.05,.90),wood),q("Side",(2.2,.42,.90),(.05,.05,.90),wood),q("Shelf",(2.2,0,.35),(.05,.46,.045),wood),q("Shelf",(2.2,0,.88),(.05,.46,.045),wood),q("Shelf",(2.2,0,1.40),(.05,.46,.045),wood),c("Jar",(2.2,-.18,1.56),.10,.20,cloth)],"MCP_Shelf");x(shelf,"hearthvale_shelf.fbx")
 fire=j([q("Hearth",(4.2,0,.15),(.60,.45,.15),stone),q("Back",(4.2,.35,.52),(.60,.12,.52),stone),q("Log",(4.2,0,.34),(.35,.12,.08),wood),c("Ember",(4.2,0,.43),.15,.06,ember)],"MCP_Fireplace");x(fire,"hearthvale_fireplace.fbx")
 bpy.ops.wm.save_as_mainfile(filepath=str(ART/"phase1_home_kit.blend"));bpy.ops.mesh.primitive_plane_add(size=14);bpy.context.object.data.materials.append(m("Ground",(.04,.05,.06)));bpy.ops.object.light_add(type="AREA",location=(1,-5,6));bpy.context.object.data.energy=1000;bpy.context.object.data.size=6;bpy.ops.object.camera_add(location=(8,-10,6));cam=bpy.context.object;bpy.context.scene.camera=cam;cam.rotation_euler=(Vector((0,0,.6))-cam.location).to_track_quat("-Z","Y").to_euler();s=bpy.context.scene;s.render.engine="BLENDER_EEVEE";s.render.resolution_x=960;s.render.resolution_y=540;s.render.filepath=str(ART/"phase1_home_kit.png");bpy.ops.render.render(write_still=True)
if __name__=="__main__":main()
