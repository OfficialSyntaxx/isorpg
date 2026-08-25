"""Local-only Phase 1 Frostwatch mining and cold-region kit."""
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
 bpy.ops.mesh.primitive_cone_add(vertices=7,radius1=a,radius2=b,depth=d,location=p);o=bpy.context.object;o.name=n;o.data.materials.append(ma);return o
def j(ps,n):
 bpy.ops.object.select_all(action='DESELECT');[x.select_set(True) for x in ps];bpy.context.view_layer.objects.active=ps[0];bpy.ops.object.join();ps[0].name=n;return ps[0]
def e(o,n):
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.export_scene.fbx(filepath=str(OUT/n),use_selection=True,apply_unit_scale=True,add_leaf_bones=False)
def main():
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);OUT.mkdir(parents=True,exist_ok=True);ART.mkdir(parents=True,exist_ok=True)
 wood=m('Frost_Pine',(.13,.07,.035));iron=m('Frost_Iron',(.10,.13,.16));snow=m('SnowCanvas',(.62,.72,.75));ore=m('BlueOre',(.06,.42,.65),1.1);stone=m('ColdStone',(.21,.25,.28));rope=m('Rope',(.36,.22,.08))
 support=[q('BeamA',(-5,-.42,.85),(.10,.10,.95),wood,radians(-8)),q('BeamB',(-5,.42,.85),(.10,.10,.95),wood,radians(8)),q('Crossbeam',(-5,0,1.56),(.85,.12,.11),wood),q('StoneFoot',(-5,0,.12),(.90,.62,.12),stone)]
 e(j(support,'MCP_FrostMineSupport'),'frostwatch_mine_support.fbx')
 cart=[q('Bed',(-2.5,0,.47),(.75,.43,.13),iron),c('Wheel',(-3.06,-.44,.25),.24,.10,iron),c('Wheel',(-3.06,.44,.25),.24,.10,iron),c('Wheel',(-1.95,-.44,.25),.24,.10,iron),c('Wheel',(-1.95,.44,.25),.24,.10,iron),cone('OreA',(-2.5,0,.78),.36,.08,.42,ore)]
 e(j(cart,'MCP_FrostOreCart'),'frostwatch_ore_cart.fbx')
 winch=[q('Base',(0,0,.12),(.75,.48,.12),stone),c('PostA',(-.48,0,.68),.08,1.15,wood),c('PostB',(.48,0,.68),.08,1.15,wood),c('Spindle',(0,0,.86),.10,1.08,iron,(radians(90),0,0)),c('Crank',(0,-.56,.86),.06,.55,iron,(radians(90),0,0))]
 e(j(winch,'MCP_FrostWinch'),'frostwatch_winch.fbx')
 tent=[q('Floor',(2.55,0,.08),(1,.7,.08),wood),cone('Shelter',(2.55,0,.82),1.06,0,1.48,snow),c('Pole',(2.55,0,.82),.045,1.55,wood),q('SupplyChest',(3.35,-.42,.26),(.31,.22,.22),wood)]
 e(j(tent,'MCP_FrostSupplyTent'),'frostwatch_supply_tent.fbx')
 crystal=[q('Rock',(5.1,0,.12),(.74,.58,.12),stone),cone('CrystalA',(5,0,.62),.24,.05,1.05,ore),cone('CrystalB',(5.46,.18,.43),.16,.04,.66,ore),cone('CrystalC',(4.64,-.2,.34),.14,.04,.49,ore)]
 e(j(crystal,'MCP_FrostCrystalCluster'),'frostwatch_crystal_cluster.fbx')
 bpy.ops.wm.save_as_mainfile(filepath=str(ART/'phase1_frostwatch_kit.blend'));bpy.ops.mesh.primitive_plane_add(size=16);bpy.context.object.data.materials.append(m('Ground',(.05,.08,.10)));bpy.ops.object.light_add(type='AREA',location=(0,-6,7));bpy.context.object.data.energy=1400;bpy.context.object.data.size=7;bpy.ops.object.camera_add(location=(9,-13,7));cam=bpy.context.object;bpy.context.scene.camera=cam;cam.rotation_euler=(Vector((0,0,.7))-cam.location).to_track_quat('-Z','Y').to_euler();s=bpy.context.scene;s.render.engine='BLENDER_EEVEE';s.render.resolution_x=960;s.render.resolution_y=540;s.render.filepath=str(ART/'phase1_frostwatch_kit.png');bpy.ops.render.render(write_still=True)
if __name__=='__main__':main()
