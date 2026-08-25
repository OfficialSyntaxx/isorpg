"""Local-only Phase 1 Sunmere shoreline and fishing kit."""
from pathlib import Path
from math import radians
import bpy
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'unity/Assets/Isoperia/Resources/Art/OwnedModels';ART=ROOT/'art/blender'
def m(n,c,e=0):
 a=bpy.data.materials.new(n);a.diffuse_color=(*c,1);a.use_nodes=True;b=a.node_tree.nodes['Principled BSDF'];b.inputs['Base Color'].default_value=(*c,1)
 if e:b.inputs['Emission Color'].default_value=(*c,1);b.inputs['Emission Strength'].default_value=e
 return a
def q(n,p,s,a,r=0):
 bpy.ops.mesh.primitive_cube_add(location=p,rotation=(0,0,r));o=bpy.context.object;o.name=n;o.scale=s;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(a);return o
def c(n,p,r,d,a,rot=None):
 bpy.ops.mesh.primitive_cylinder_add(vertices=10,radius=r,depth=d,location=p);o=bpy.context.object;o.name=n;o.data.materials.append(a)
 if rot:o.rotation_euler=rot
 return o
def cone(n,p,a,b,d,ma):
 bpy.ops.mesh.primitive_cone_add(vertices=8,radius1=a,radius2=b,depth=d,location=p);o=bpy.context.object;o.name=n;o.data.materials.append(ma);return o
def j(ps,n):
 bpy.ops.object.select_all(action='DESELECT');[x.select_set(True) for x in ps];bpy.context.view_layer.objects.active=ps[0];bpy.ops.object.join();ps[0].name=n;return ps[0]
def e(o,n):
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.export_scene.fbx(filepath=str(OUT/n),use_selection=True,apply_unit_scale=True,add_leaf_bones=False)
def main():
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);OUT.mkdir(parents=True,exist_ok=True);ART.mkdir(parents=True,exist_ok=True)
 wood=m('Sunmere_Wood',(.27,.12,.04));rope=m('Sunmere_Rope',(.55,.34,.12));cloth=m('Sunmere_Cloth',(.04,.28,.40));water=m('Sunmere_Glow',(.06,.58,.75),1.4);stone=m('Sunmere_Stone',(.24,.29,.28))
 dock=[]
 for x in (-5.8,-4.8,-3.8):dock += [q('Deck',(x,0,.38),(.48,.72,.08),wood),c('Post',(x,-.58,.42),.09,.82,wood),c('Post',(x,.58,.42),.09,.82,wood)]
 e(j(dock,'MCP_SunmereFishingDock'),'sunmere_fishing_dock.fbx')
 boat=[q('Hull',(-1.3,0,.34),(1.05,.42,.18),wood),q('Seat',(-1.3,0,.61),(.24,.37,.07),wood),q('Mast',(-1.35,0,1.16),(.045,.045,.75),wood),q('Sail',(-1.05,0,1.24),(.31,.025,.46),cloth)]
 e(j(boat,'MCP_SunmereBoat'),'sunmere_rowboat.fbx')
 net=[q('Frame',(1.05,0,.60),(.74,.06,.06),wood),q('LegA',(.42,0,.31),(.05,.06,.37),wood,radians(14)),q('LegB',(1.68,0,.31),(.05,.06,.37),wood,radians(-14))]
 for x in (.62,.94,1.26,1.58):net.append(c('NetLoop',(x,0,.44),.12,.035,rope,(radians(90),0,0)))
 e(j(net,'MCP_SunmereNetRack'),'sunmere_net_rack.fbx')
 buoy=[c('Float',(3.35,0,.28),.21,.36,cloth),cone('Top',(3.35,0,.62),.16,0,.35,water),c('Anchor',(3.35,0,.06),.05,.20,rope)]
 e(j(buoy,'MCP_SunmereBuoy'),'sunmere_buoy.fbx')
 shrine=[q('Plinth',(5.55,0,.10),(.82,.60,.10),stone),c('Ring',(5.55,0,.63),.47,.11,stone,(radians(90),0,0)),c('WaterCore',(5.55,0,.63),.18,.22,water),q('Marker',(5.55,-.48,.30),(.28,.03,.18),water)]
 e(j(shrine,'MCP_SunmereLakeShrine'),'sunmere_lake_shrine.fbx')
 bpy.ops.wm.save_as_mainfile(filepath=str(ART/'phase1_sunmere_kit.blend'));bpy.ops.mesh.primitive_plane_add(size=16);bpy.context.object.data.materials.append(m('Ground',(.035,.08,.10)));bpy.ops.object.light_add(type='AREA',location=(0,-6,7));bpy.context.object.data.energy=1350;bpy.context.object.data.size=7;bpy.ops.object.camera_add(location=(9,-13,7));cam=bpy.context.object;bpy.context.scene.camera=cam;cam.rotation_euler=(Vector((0,0,.7))-cam.location).to_track_quat('-Z','Y').to_euler();s=bpy.context.scene;s.render.engine='BLENDER_EEVEE';s.render.resolution_x=960;s.render.resolution_y=540;s.render.filepath=str(ART/'phase1_sunmere_kit.png');bpy.ops.render.render(write_still=True)
if __name__=='__main__':main()
