"""Create an original low-poly Cinder Hound with local idle/walk clips."""
from pathlib import Path
import bpy
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]; OUT=ROOT/"unity/Assets/Isoperia/Resources/Art/OwnedModels"; ART=ROOT/"art/blender"
def mat(n,c,emit=0):
 m=bpy.data.materials.new(n);m.diffuse_color=(*c,1);m.use_nodes=True;b=m.node_tree.nodes["Principled BSDF"];b.inputs["Base Color"].default_value=(*c,1);b.inputs["Roughness"].default_value=.72
 if emit:b.inputs["Emission Color"].default_value=(*c,1);b.inputs["Emission Strength"].default_value=emit
 return m
def ico(n,p,s,a):
 bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1,location=p);o=bpy.context.object;o.name=n;o.scale=s;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(a);return o
def cube(n,p,s,a):
 bpy.ops.mesh.primitive_cube_add(location=p);o=bpy.context.object;o.name=n;o.scale=s;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(a);return o
def parent_bone(o,arm,bone):
 world=o.matrix_world.copy();o.parent=arm;o.parent_type='BONE';o.parent_bone=bone;o.matrix_world=world
def main():
 bpy.ops.object.select_all(action="SELECT");bpy.ops.object.delete(use_global=False);OUT.mkdir(parents=True,exist_ok=True);ART.mkdir(parents=True,exist_ok=True)
 fur=mat("Hound_Charcoal",(.085,.07,.065)); ember=mat("Hound_Ember",(.95,.12,.015),2.0); bone=mat("Hound_Horn",(.38,.25,.14))
 bpy.ops.object.armature_add(enter_editmode=True,location=(0,0,0));arm=bpy.context.object;arm.name="CinderHound_Rig";arm.data.name="CinderHound_Rig"
 root=arm.data.edit_bones[0];root.name="root";root.head=(0,0,0);root.tail=(0,0,1.0)
 def eb(n,h,t,parent=root):
  b=arm.data.edit_bones.new(n);b.head=h;b.tail=t;b.parent=parent;return b
 spine=eb("spine",(0,0,.75),(0,0,1.2));head=eb("head",(0,0,1.15),(.55,0,1.28),spine);tail=eb("tail",(-.20,0,1.0),(-.85,0,1.18),spine)
 legs=[eb("front_l",(.32,.25,.8),(.32,.25,.15)),eb("front_r",(.32,-.25,.8),(.32,-.25,.15)),eb("back_l",(-.35,.25,.8),(-.35,.25,.15)),eb("back_r",(-.35,-.25,.8),(-.35,-.25,.15))]
 bpy.ops.object.mode_set(mode='OBJECT')
 body=ico("Hound_Body",(0,0,1.0),(.70,.32,.36),fur);parent_bone(body,arm,"spine")
 skull=ico("Hound_Head",(.55,0,1.25),(.34,.27,.25),fur);parent_bone(skull,arm,"head")
 for y in (-.13,.13):
  eye=ico("Hound_Eye",(.79,y,1.32),(.04,.035,.04),ember);parent_bone(eye,arm,"head")
  horn=cube("Hound_Ear",(.52,y*1.55,1.53),(.08,.06,.16),bone);parent_bone(horn,arm,"head")
 for n,bone_name,p in zip(("FrontL","FrontR","BackL","BackR"),("front_l","front_r","back_l","back_r"),((.32,.25,.47),(.32,-.25,.47),(-.35,.25,.47),(-.35,-.25,.47))):
  leg=ico("Hound_"+n,p,(.11,.11,.42),fur);parent_bone(leg,arm,bone_name)
 tail_mesh=ico("Hound_Tail",(-.62,0,1.15),(.46,.09,.10),fur);parent_bone(tail_mesh,arm,"tail")
 # Locally authored idle and walk cycles; gameplay remains code-authoritative.
 bpy.context.view_layer.objects.active=arm;bpy.ops.object.mode_set(mode='POSE')
 pose_spine=arm.pose.bones["spine"];pose_tail=arm.pose.bones["tail"];pose_legs=[arm.pose.bones[n] for n in ("front_l","front_r","back_l","back_r")]
 def clip(name,walk):
  arm.animation_data_create();action=bpy.data.actions.new(name);arm.animation_data.action=action
  for frame,phase in ((1,0),(16,1),(31,0)):
   pose_spine.rotation_mode='XYZ';pose_spine.rotation_euler[1]=(.035 if phase else -.025);pose_spine.keyframe_insert('rotation_euler',frame=frame)
   pose_tail.rotation_mode='XYZ';pose_tail.rotation_euler[2]=(.22 if phase else -.22);pose_tail.keyframe_insert('rotation_euler',frame=frame)
   for i,b in enumerate(pose_legs):
    b.rotation_mode='XYZ';amount=(.42 if walk else .08);b.rotation_euler[1]=amount*(1 if (i%2)==phase else -1);b.keyframe_insert('rotation_euler',frame=frame)
  action.frame_range=(1,31)
  if walk: action.name="CinderHound_Walk"
  else: action.name="CinderHound_Idle"
 clip("CinderHound_Idle",False);clip("CinderHound_Walk",True)
 bpy.ops.object.mode_set(mode='OBJECT')
 bpy.ops.wm.save_as_mainfile(filepath=str(ART/"cinder_hound.blend"))
 bpy.ops.object.select_all(action='SELECT');bpy.ops.export_scene.fbx(filepath=str(OUT/"cinder_hound_animated.fbx"),use_selection=True,apply_unit_scale=True,add_leaf_bones=False,bake_anim=True,bake_anim_use_all_actions=True,bake_anim_use_nla_strips=False)
 bpy.ops.mesh.primitive_plane_add(size=10);bpy.context.object.data.materials.append(mat("ReviewGround",(.04,.05,.06)));bpy.ops.object.light_add(type='AREA',location=(3,-4,5));bpy.context.object.data.energy=1000;bpy.context.object.data.size=5;bpy.ops.object.camera_add(location=(4,-6,3));cam=bpy.context.object;bpy.context.scene.camera=cam;cam.rotation_euler=(Vector((0,0,1))-cam.location).to_track_quat('-Z','Y').to_euler();s=bpy.context.scene;s.render.engine='BLENDER_EEVEE';s.render.resolution_x=960;s.render.resolution_y=540;s.render.filepath=str(ART/"cinder_hound.png");bpy.ops.render.render(write_still=True)
if __name__=='__main__':main()
