"""Local-only Phase 1 landmark kits for Miregate and Cinder Hollow."""
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
 wood=m('BogWood',(.11,.065,.025));bog=m('BogStone',(.15,.22,.16));bone=m('Bone',(.55,.48,.32));moss=m('MossGlow',(.14,.58,.30),1.4);ash=m('AshWood',(.10,.07,.055));lava=m('Lava',(.96,.12,.015),2);coal=m('CharredRock',(.11,.095,.09));iron=m('FurnaceIron',(.15,.14,.13))
 gate=[q('PillarA',(-5,-.42,.70),(.18,.18,.75),bog,radians(-7)),q('PillarB',(-5,.42,.64),(.18,.18,.68),bog,radians(8)),q('BrokenLintel',(-5,0,1.38),(.55,.16,.13),bog,radians(12)),q('GlowRune',(-5,-.61,.61),(.25,.02,.18),moss)]
 e(j(gate,'MCP_MireBrokenGate'),'miregate_broken_gate.fbx')
 board=[]
 for x in (-2.8,-1.9,-1.0): board += [q('Plank',(x,0,.24),(.38,.70,.07),wood),c('Post',(x,-.60,.36),.06,.65,wood),c('Post',(x,.60,.36),.06,.65,wood)]
 e(j(board,'MCP_MireBoardwalk'),'miregate_boardwalk.fbx')
 tower=[q('Base',(1.2,0,.14),(.65,.65,.14),bog),q('Tower',(1.2,0,.88),(.35,.35,.75),wood),q('Lookout',(1.2,0,1.62),(.64,.56,.12),wood),q('Roof',(1.2,0,1.95),(.74,.64,.10),wood)]
 e(j(tower,'MCP_MireWatchtower'),'miregate_watchtower.fbx')
 totem=[c('Spine',(3.7,0,.66),.10,1.25,wood),cone('Skull',(3.7,0,1.30),.25,.09,.38,bone),c('BoneA',(3.7,-.29,.75),.055,.66,bone,(radians(90),0,0)),c('BoneB',(3.7,.29,.75),.055,.66,bone,(radians(90),0,0)),c('Glow',(3.7,0,.90),.13,.18,moss)]
 e(j(totem,'MCP_MireBoneTotem'),'miregate_bone_totem.fbx')
 lavaRock=[q('Base',(-4.8,0,.12),(.85,.64,.12),coal),cone('SpireA',(-5.05,0,.55),.32,.08,.88,coal),cone('SpireB',(-4.45,.22,.40),.23,.05,.63,coal),q('LavaVein',(-4.8,-.58,.23),(.45,.03,.07),lava)]
 e(j(lavaRock,'MCP_CinderLavaRock'),'cinder_lava_rock.fbx')
 tree=[c('Trunk',(-2.5,0,.68),.13,1.35,ash),q('BranchA',(-2.5,0,1.14),(.46,.07,.06),ash,radians(22)),q('BranchB',(-2.5,0,1.38),(.36,.07,.06),ash,radians(-30)),q('AshBase',(-2.5,0,.10),(.48,.42,.10),coal)]
 e(j(tree,'MCP_CinderAshTree'),'cinder_ash_tree.fbx')
 barricade=[q('BeamA',(0,0,.55),(.95,.08,.08),ash,radians(24)),q('BeamB',(0,0,.55),(.95,.08,.08),ash,radians(-24)),c('Post',(-.62,0,.48),.08,.95,ash),c('Post',(.62,0,.48),.08,.95,ash),q('Ember',(0,-.12,.75),(.26,.02,.06),lava)]
 e(j(barricade,'MCP_CinderBarricade'),'cinder_barricade.fbx')
 ruin=[q('Foundation',(2.8,0,.10),(.90,.64,.10),coal),q('Furnace',(2.8,0,.72),(.48,.42,.60),iron),q('Chimney',(2.8,0,1.45),(.18,.18,.35),iron),c('Mouth',(2.8,-.44,.62),.20,.05,lava,(radians(90),0,0))]
 e(j(ruin,'MCP_CinderFurnaceRuins'),'cinder_furnace_ruins.fbx')
 bpy.ops.wm.save_as_mainfile(filepath=str(ART/'phase1_mire_cinder_kits.blend'));bpy.ops.mesh.primitive_plane_add(size=18);bpy.context.object.data.materials.append(m('Ground',(.055,.04,.04)));bpy.ops.object.light_add(type='AREA',location=(0,-7,8));bpy.context.object.data.energy=1500;bpy.context.object.data.size=8;bpy.ops.object.camera_add(location=(10,-14,8));cam=bpy.context.object;bpy.context.scene.camera=cam;cam.rotation_euler=(Vector((0,0,.75))-cam.location).to_track_quat('-Z','Y').to_euler();s=bpy.context.scene;s.render.engine='BLENDER_EEVEE';s.render.resolution_x=960;s.render.resolution_y=540;s.render.filepath=str(ART/'phase1_mire_cinder_kits.png');bpy.ops.render.render(write_still=True)
if __name__=='__main__':main()
