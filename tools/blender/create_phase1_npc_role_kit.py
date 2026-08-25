"""Local-only role identity props for the existing animated villager base."""
from pathlib import Path
import bpy
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/"unity/Assets/Isoperia/Resources/Art/OwnedModels";ART=ROOT/"art/blender"
def m(n,c):
 a=bpy.data.materials.new(n);a.diffuse_color=(*c,1);a.use_nodes=True;a.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value=(*c,1);return a
def q(n,p,s,a):
 bpy.ops.mesh.primitive_cube_add(location=p);o=bpy.context.object;o.name=n;o.scale=s;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(a);return o
def c(n,p,r,d,a):
 bpy.ops.mesh.primitive_cylinder_add(vertices=10,radius=r,depth=d,location=p);o=bpy.context.object;o.name=n;o.data.materials.append(a);return o
def j(ps,n):
 bpy.ops.object.select_all(action="DESELECT");[z.select_set(True) for z in ps];bpy.context.view_layer.objects.active=ps[0];bpy.ops.object.join();ps[0].name=n;return ps[0]
def e(o,n):
 bpy.ops.object.select_all(action="DESELECT");o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.export_scene.fbx(filepath=str(OUT/n),use_selection=True,apply_unit_scale=True,add_leaf_bones=False)
def main():
 bpy.ops.object.select_all(action="SELECT");bpy.ops.object.delete(use_global=False);OUT.mkdir(parents=True,exist_ok=True);ART.mkdir(parents=True,exist_ok=True)
 wood=m("Role_Wood",(.23,.08,.025));iron=m("Role_Iron",(.045,.055,.07));cloth=m("Role_Cloth",(.12,.28,.36));leather=m("Role_Leather",(.20,.09,.03));gold=m("Role_Gold",(.70,.45,.08))
 merchant=j([q("Pack",(-4,0,.72),(.28,.15,.35),leather),q("Strap",(-4,-.16,.72),(.06,.025,.42),gold),c("Pouch",(-4.36,0,.55),.12,.20,leather),c("Pouch",(-3.65,0,.55),.12,.20,leather)],"MCP_MerchantPack");e(merchant,"npc_merchant_pack.fbx")
 smith=j([q("Apron",(-2,0,.73),(.26,.035,.42),leather),q("HammerHead",(-2.4,0,.98),(.14,.05,.05),iron),c("Handle",(-2.4,0,.76),.025,.38,wood),q("Tongs",(-1.62,0,.92),(.03,.05,.20),iron)],"MCP_BlacksmithKit");e(smith,"npc_blacksmith_kit.fbx")
 farmer=j([c("HatBrim",(0,0,1.12),.34,.06,straw:=m("Role_Straw",(.65,.48,.16))),c("HatCrown",(0,0,1.28),.20,.28,straw),q("HoeHead",(.42,0,.78),(.12,.04,.05),iron),c("HoeHandle",(.42,0,.48),.025,.55,wood)],"MCP_FarmerKit");e(farmer,"npc_farmer_kit.fbx")
 guard=j([q("Shield",(2.0,0,.75),(.30,.05,.42),iron),q("ShieldMark",(2.0,-.06,.75),(.13,.01,.15),gold),q("SwordBlade",(2.42,0,.92),(.03,.04,.38),iron),q("SwordHilt",(2.42,0,.55),(.12,.05,.03),gold)],"MCP_GuardKit");e(guard,"npc_guard_kit.fbx")
 ranger=j([q("Quiver",(4,0,.75),(.14,.10,.38),leather),c("Arrow",(4.0,-.04,1.18),.015,.38,wood),c("Arrow",(4.09,.04,1.18),.015,.38,wood),q("Bow",(4.42,0,.82),(.025,.035,.42),wood),q("Cloak",(3.65,0,.75),(.06,.25,.42),cloth)],"MCP_RangerKit");e(ranger,"npc_ranger_kit.fbx")
 bpy.ops.wm.save_as_mainfile(filepath=str(ART/"phase1_npc_role_kit.blend"));bpy.ops.mesh.primitive_plane_add(size=14);bpy.context.object.data.materials.append(m("Ground",(.04,.055,.07)));bpy.ops.object.light_add(type="AREA",location=(1,-5,6));bpy.context.object.data.energy=1100;bpy.context.object.data.size=6;bpy.ops.object.camera_add(location=(8,-10,6));cam=bpy.context.object;bpy.context.scene.camera=cam;cam.rotation_euler=(Vector((0,0,.8))-cam.location).to_track_quat("-Z","Y").to_euler();s=bpy.context.scene;s.render.engine="BLENDER_EEVEE";s.render.resolution_x=960;s.render.resolution_y=540;s.render.filepath=str(ART/"phase1_npc_role_kit.png");bpy.ops.render.render(write_still=True)
if __name__=="__main__":main()
