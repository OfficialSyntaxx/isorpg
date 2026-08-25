"""Local-only Phase 1 farm and wilderness scatter kit."""
from pathlib import Path
from math import radians
import bpy
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'unity/Assets/Isoperia/Resources/Art/OwnedModels';ART=ROOT/'art/blender'
def m(n,c):
 a=bpy.data.materials.new(n);a.diffuse_color=(*c,1);a.use_nodes=True;a.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(*c,1);return a
def q(n,p,s,a,r=0):
 bpy.ops.mesh.primitive_cube_add(location=p,rotation=(0,0,r));o=bpy.context.object;o.name=n;o.scale=s;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(a);return o
def c(n,p,r,d,a,rot=None):
 bpy.ops.mesh.primitive_cylinder_add(vertices=8,radius=r,depth=d,location=p);o=bpy.context.object;o.name=n;o.data.materials.append(a)
 if rot:o.rotation_euler=rot
 return o
def cone(n,p,a,b,d,ma):
 bpy.ops.mesh.primitive_cone_add(vertices=7,radius1=a,radius2=b,depth=d,location=p);o=bpy.context.object;o.name=n;o.data.materials.append(ma);return o
def j(ps,n):
 bpy.ops.object.select_all(action='DESELECT');[x.select_set(True) for x in ps];bpy.context.view_layer.objects.active=ps[0];bpy.ops.object.join();ps[0].name=n;return ps[0]
def e(o,n):
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.export_scene.fbx(filepath=str(OUT/n),use_selection=True,apply_unit_scale=True,add_leaf_bones=False)
def main():
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);OUT.mkdir(parents=True,exist_ok=True);ART.mkdir(parents=True,exist_ok=True)
 wood=m('Wood',(.25,.10,.035));soil=m('Soil',(.18,.07,.025));green=m('Plant',(.07,.34,.09));stone=m('Stone',(.23,.26,.24));fern=m('Fern',(.04,.30,.12));sand=m('Shore',(.37,.25,.10));shell=m('Shell',(.62,.58,.44))
 fence=[]
 for x in (-5.8,-5.1,-4.4):fence += [c('Post',(x,0,.45),.06,.90,wood),q('Rail',(x+.35,0,.38),(.35,.05,.05),wood),q('Rail',(x+.35,0,.62),(.35,.05,.05),wood)]
 e(j(fence,'MCP_FarmFence'),'farm_fence_segment.fbx')
 crops=[q('Bed',(-2.7,0,.07),(1.1,.65,.07),soil)]
 for x in (-3.45,-3.0,-2.55,-2.1):
  for y in (-.34,0,.34):crops.append(cone('Crop',(x,y,.28),.10,.025,.43,green))
 e(j(crops,'MCP_CropRows'),'farm_crop_rows.fbx')
 trough=[q('Trough',(-.2,0,.32),(.68,.32,.20),wood),q('Water',(-.2,0,.54),(.55,.22,.02),sand),q('LegA',(-.65,0,.12),(.06,.20,.15),wood),q('LegB',(.25,0,.12),(.06,.20,.15),wood)]
 e(j(trough,'MCP_FarmTrough'),'farm_water_trough.fbx')
 coop=[q('Body',(2.1,0,.43),(.62,.50,.35),wood),cone('Roof',(2.1,0,1.00),.78,0,.65,soil),q('Door',(2.1,-.52,.39),(.16,.02,.18),green),q('Ramp',(2.1,-.82,.15),(.22,.38,.06),wood)]
 e(j(coop,'MCP_ChickenCoop'),'farm_chicken_coop.fbx')
 bould=[cone('BoulderA',(4.6,0,.28),.58,.30,.56,stone),cone('BoulderB',(5.15,.30,.17),.32,.14,.34,stone),cone('BoulderC',(4.10,-.32,.15),.27,.12,.30,stone)]
 e(j(bould,'MCP_BoulderCluster'),'wild_boulder_cluster.fbx')
 ferns=[]
 for r in range(6):ferns.append(q('Frond',(7.2,0,.22),(.10,.52,.025),fern,radians(r*30)))
 e(j(ferns,'MCP_FernCluster'),'wild_fern_cluster.fbx')
 debris=[q('Driftwood',(9.4,0,.18),(.86,.12,.10),wood,radians(12)),cone('ShellA',(9.0,.38,.09),.14,.04,.16,shell),cone('ShellB',(9.85,-.32,.07),.11,.03,.12,shell),c('Reed',(10.15,.28,.35),.025,.65,green)]
 e(j(debris,'MCP_ShorelineDebris'),'wild_shoreline_debris.fbx')
 bpy.ops.wm.save_as_mainfile(filepath=str(ART/'phase1_scatter_kit.blend'));bpy.ops.mesh.primitive_plane_add(size=18);bpy.context.object.data.materials.append(m('Ground',(.045,.065,.04)));bpy.ops.object.light_add(type='AREA',location=(1,-7,8));bpy.context.object.data.energy=1500;bpy.context.object.data.size=8;bpy.ops.object.camera_add(location=(11,-14,8));cam=bpy.context.object;bpy.context.scene.camera=cam;cam.rotation_euler=(Vector((1.5,0,.5))-cam.location).to_track_quat('-Z','Y').to_euler();s=bpy.context.scene;s.render.engine='BLENDER_EEVEE';s.render.resolution_x=960;s.render.resolution_y=540;s.render.filepath=str(ART/'phase1_scatter_kit.png');bpy.ops.render.render(write_still=True)
if __name__=='__main__':main()
