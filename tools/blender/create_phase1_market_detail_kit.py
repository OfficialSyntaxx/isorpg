"""Local-only Phase 1 Hearthvale market/service dressing kit."""
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
 wood=m("Detail_Wood",(.22,.075,.025));iron=m("Detail_Iron",(.04,.05,.065));cloth=m("Detail_Cloth",(.08,.26,.38));paper=m("Detail_Paper",(.70,.58,.34));ember=m("Detail_Ember",(.92,.18,.02))
 sign=j([c("Post",(-5,0,.8),.055,1.6,wood),q("Board",(-5,0,1.35),(.38,.055,.24),wood),q("Rune",(-5,-.06,1.35),(.18,.01,.10),paper)],"MCP_HangingSign");e(sign,"hearthvale_hanging_sign.fbx")
 board=j([q("Post",(-3.2,-.32,.9),(.05,.05,.9),wood),q("Post",(-3.2,.32,.9),(.05,.05,.9),wood),q("Board",(-3.2,0,1.15),(.05,.40,.42),wood),q("Notice",(-3.15,0,1.20),(.01,.27,.27),paper)],"MCP_Noticeboard");e(board,"hearthvale_noticeboard.fbx")
 cook=j([c("Pot",(-1,0,.54),.32,.30,iron),c("Rim",(-1,0,.69),.34,.04,iron),q("Tripod",(-1,-.22,.34),(.025,.025,.34),iron),q("Tripod",(-1,.22,.34),(.025,.025,.34),iron),c("Fire",(-1,0,.18),.16,.06,ember)],"MCP_CookingPot");e(cook,"hearthvale_cooking_pot.fbx")
 tools=j([q("Rack",(1.2,0,.95),(.05,.42,.65),wood),q("Shelf",(1.2,0,.42),(.10,.46,.04),wood),q("AxeHead",(1.15,-.2,1.18),(.03,.05,.13),iron),c("AxeHandle",(1.15,-.2,.93),.025,.35,wood),q("Hammer",(1.15,.2,1.12),(.03,.12,.05),iron),c("Handle",(1.15,.2,.88),.025,.32,wood)],"MCP_ToolRack");e(tools,"hearthvale_tool_rack.fbx")
 banner=j([c("Pole",(3.3,0,1.0),.045,2.0,wood),q("Crossbar",(3.3,0,1.82),(.045,.48,.045),wood),q("Banner",(3.3,.28,1.42),(.035,.23,.36),cloth)],"MCP_Banner");e(banner,"hearthvale_banner.fbx")
 awning=j([q("Post",(5.2,-.42,.75),(.04,.04,.75),wood),q("Post",(5.2,.42,.75),(.04,.04,.75),wood),q("Roof",(5.2,0,1.46),(.45,.58,.06),cloth)],"MCP_Awning");e(awning,"hearthvale_awning.fbx")
 bpy.ops.wm.save_as_mainfile(filepath=str(ART/"phase1_market_detail_kit.blend"));bpy.ops.mesh.primitive_plane_add(size=16);bpy.context.object.data.materials.append(m("Ground",(.04,.055,.07)));bpy.ops.object.light_add(type="AREA",location=(1,-5,6));bpy.context.object.data.energy=1100;bpy.context.object.data.size=6;bpy.ops.object.camera_add(location=(9,-11,6));cam=bpy.context.object;bpy.context.scene.camera=cam;cam.rotation_euler=(Vector((0,0,.7))-cam.location).to_track_quat("-Z","Y").to_euler();s=bpy.context.scene;s.render.engine="BLENDER_EEVEE";s.render.resolution_x=960;s.render.resolution_y=540;s.render.filepath=str(ART/"phase1_market_detail_kit.png");bpy.ops.render.render(write_still=True)
if __name__=="__main__":main()
