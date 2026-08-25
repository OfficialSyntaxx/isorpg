"""Local-only Phase 1 NPC, creature, monster, and animation-baseline assets."""
from pathlib import Path
from math import radians
import bpy
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'unity/Assets/Isoperia/Resources/Art/OwnedModels';ART=ROOT/'art/blender'
def m(n,c):
 a=bpy.data.materials.new(n);a.diffuse_color=(*c,1);a.use_nodes=True;a.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(*c,1);return a
def q(n,p,s,a,r=0):
 bpy.ops.mesh.primitive_cube_add(location=p,rotation=(0,0,r));o=bpy.context.object;o.name=n;o.scale=s;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(a);return o
def c(n,p,r,d,a,rot=None):
 bpy.ops.mesh.primitive_cylinder_add(vertices=8,radius=r,depth=d,location=p);o=bpy.context.object;o.name=n;o.data.materials.append(a)
 if rot:o.rotation_euler=rot
 return o
def sph(n,p,s,a):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=10,ring_count=6,location=p);o=bpy.context.object;o.name=n;o.scale=s;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(a);return o
def cone(n,p,a,b,d,ma):
 bpy.ops.mesh.primitive_cone_add(vertices=7,radius1=a,radius2=b,depth=d,location=p);o=bpy.context.object;o.name=n;o.data.materials.append(ma);return o
def j(ps,n):
 bpy.ops.object.select_all(action='DESELECT');[x.select_set(True) for x in ps];bpy.context.view_layer.objects.active=ps[0];bpy.ops.object.join();ps[0].name=n;return ps[0]
def e(o,n):
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.export_scene.fbx(filepath=str(OUT/n),use_selection=True,apply_unit_scale=True,add_leaf_bones=False,bake_anim=True)
def humanoid(x,name,cloth,scale=1,extra=None):
 skin=m(name+'Skin',(.58,.31,.17));boot=m(name+'Boot',(.08,.05,.03));ps=[c('Torso',(x,0,1.08*scale),.25*scale,.62*scale,cloth),sph('Head',(x,0,1.55*scale),(.22*scale,.20*scale,.24*scale),skin),c('LegA',(x,-.13*scale,.43*scale),.09*scale,.55*scale,boot),c('LegB',(x,.13*scale,.43*scale),.09*scale,.55*scale,boot),c('ArmA',(x,-.30*scale,1.13*scale),.07*scale,.48*scale,skin,(0,radians(22),0)),c('ArmB',(x,.30*scale,1.13*scale),.07*scale,.48*scale,skin,(0,radians(-22),0))]
 if extra:ps += extra(x,scale)
 return j(ps,'MCP_'+name)
def animal(x,name,body,accent,kind):
 ps=[sph('Body',(x,0,.55),(.48,.25,.28),body),sph('Head',(x+.45,0,.70),(.22,.18,.20),body)]
 for y in (-.15,.15):
  for dx in (-.25,.25):ps.append(c('Leg',(x+dx,y,.25),.055,.42,accent))
 if kind=='bird':ps += [cone('Wing',(x,-.26,.59),.26,.03,.26,accent),cone('Beak',(x+.67,0,.70),.09,0,.15,accent)]
 elif kind=='chicken':ps += [cone('Beak',(x+.68,0,.71),.08,0,.12,accent),cone('Comb',(x+.43,0,.94),.07,0,.16,accent)]
 elif kind=='wolf':ps += [cone('Ear',(x+.43,-.11,.95),.09,0,.20,accent),cone('Ear',(x+.43,.11,.95),.09,0,.20,accent),q('Tail',(x-.58,0,.65),(.30,.05,.05),accent,radians(25))]
 elif kind=='rat':ps += [q('Tail',(x-.62,0,.47),(.35,.035,.035),accent,radians(-15))]
 return j(ps,'MCP_'+name)
def main():
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);OUT.mkdir(parents=True,exist_ok=True);ART.mkdir(parents=True,exist_ok=True)
 brown=m('Brown',(.24,.10,.03));blue=m('Blue',(.05,.19,.39));red=m('Red',(.48,.07,.04));green=m('Green',(.08,.27,.10));white=m('White',(.68,.67,.58));gray=m('Gray',(.20,.23,.24));purple=m('Purple',(.25,.06,.40));ice=m('Ice',(.20,.60,.86));
 def hat(x,s):return [cone('Hat',(x,0,1.86*s),.28*s,0,.36*s,blue)]
 def pack(x,s):return [q('Pack',(x,-.27*s,1.06*s),(.17*s,.08*s,.23*s),brown)]
 def staff(x,s):return [c('Staff',(x+.38*s,0,.91*s),.035*s,1.3*s,brown,(0,radians(15),0))]
 roster=[('npc_villager',humanoid(-7,'Villager',green)),('npc_guard',humanoid(-5,'Guard',blue,1,staff)),('npc_merchant',humanoid(-3,'Merchant',red,1,pack)),('npc_child',humanoid(-1,'Child',green,.68)),('npc_elder',humanoid(1,'Elder',white,.92,staff)),('npc_questgiver',humanoid(3,'QuestGiver',purple,1,hat)),('friendly_mule',animal(5,'Mule',brown,gray,'mule')),('friendly_chicken',animal(7,'Chicken',white,red,'chicken')),('friendly_sheep',animal(9,'Sheep',white,gray,'mule')),('friendly_fishing_bird',animal(11,'FishingBird',white,blue,'bird')),('monster_rat',animal(13,'Rat',gray,purple,'rat')),('monster_wolf',animal(15,'Wolf',gray,white,'wolf'))]
 for n,o in roster:e(o,n+'.fbx')
 husk=humanoid(17,'BogHusk',green,1.05,staff);e(husk,'monster_bog_husk.fbx')
 slash=humanoid(19,'CaveSlasher',gray,1.12,staff);e(slash,'monster_cave_slasher.fbx')
 imp=humanoid(21,'FrostImp',ice,.75,hat);e(imp,'monster_frost_imp.fbx')
 ogre=humanoid(23,'ForestOgre',green,1.55,pack);e(ogre,'monster_forest_ogre.fbx')
 # Minimal original armature, whose named clips are a presentation baseline only.
 bpy.ops.object.select_all(action='DESELECT');bpy.ops.object.armature_add(enter_editmode=True,location=(0,-4,0));arm=bpy.context.object;arm.name='MCP_ActorAnimationBaseline';bone=arm.data.edit_bones[0];bone.name='Root';bone.head=(0,0,0);bone.tail=(0,0,1.3);bpy.ops.object.mode_set(mode='OBJECT');mesh=q('AnimatedMarker',(0,-4,1.25),(.20,.20,.20),red);world=mesh.matrix_world.copy();mesh.parent=arm;mesh.parent_type='BONE';mesh.parent_bone='Root';mesh.matrix_world=world
 arm.animation_data_create();pose=arm.pose.bones['Root'];pose.rotation_mode='XYZ'
 for i,n in enumerate(['Idle','Walk','Run','Turn','Gather','Talk','Emote','LightAttack','HeavyAttack','Block','Hit','Defeat','Spawn','ResourceInteract']):
  act=bpy.data.actions.new('Actor_'+n);arm.animation_data.action=act;pose.rotation_euler[1]=0;pose.keyframe_insert(data_path='rotation_euler',index=1,frame=1);pose.rotation_euler[1]=0.18 if i%2 else -0.18;pose.keyframe_insert(data_path='rotation_euler',index=1,frame=18)
 bpy.ops.object.select_all(action='DESELECT');arm.select_set(True);mesh.select_set(True);bpy.context.view_layer.objects.active=arm;bpy.ops.export_scene.fbx(filepath=str(OUT/'actor_animation_baseline.fbx'),use_selection=True,apply_unit_scale=True,add_leaf_bones=False,bake_anim=True,bake_anim_use_all_actions=True)
 bpy.ops.wm.save_as_mainfile(filepath=str(ART/'phase1_actor_roster.blend'))
 bpy.ops.mesh.primitive_plane_add(size=34,location=(8,0,0));bpy.context.object.data.materials.append(m('Ground',(.03,.045,.05)));bpy.ops.object.light_add(type='AREA',location=(5,-10,12));bpy.context.object.data.energy=2400;bpy.context.object.data.size=12;bpy.ops.object.camera_add(location=(11,-22,11));cam=bpy.context.object;bpy.context.scene.camera=cam;cam.rotation_euler=(__import__('mathutils').Vector((8,0,.8))-cam.location).to_track_quat('-Z','Y').to_euler();s=bpy.context.scene;s.render.engine='BLENDER_EEVEE';s.render.resolution_x=960;s.render.resolution_y=540;s.render.filepath=str(ART/'phase1_actor_roster.png');bpy.ops.render.render(write_still=True)
if __name__=='__main__':main()
