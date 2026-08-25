"""Local-only low-poly regional creature silhouettes for Isoperia."""
from pathlib import Path
import bpy
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/"unity/Assets/Isoperia/Resources/Art/OwnedModels";ART=ROOT/"art/blender"
def m(n,c,e=0):
 a=bpy.data.materials.new(n);a.diffuse_color=(*c,1);a.use_nodes=True;b=a.node_tree.nodes['Principled BSDF'];b.inputs['Base Color'].default_value=(*c,1)
 if e:b.inputs['Emission Color'].default_value=(*c,1);b.inputs['Emission Strength'].default_value=e
 return a
def i(n,p,s,a):
 bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1,location=p);o=bpy.context.object;o.name=n;o.scale=s;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(a);return o
def q(n,p,s,a):
 bpy.ops.mesh.primitive_cube_add(location=p);o=bpy.context.object;o.name=n;o.scale=s;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(a);return o
def j(ps,n):
 bpy.ops.object.select_all(action='DESELECT');[x.select_set(True) for x in ps];bpy.context.view_layer.objects.active=ps[0];bpy.ops.object.join();ps[0].name=n;return ps[0]
def e(o,n):
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.export_scene.fbx(filepath=str(OUT/n),use_selection=True,apply_unit_scale=True,add_leaf_bones=False)
def main():
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);OUT.mkdir(parents=True,exist_ok=True);ART.mkdir(parents=True,exist_ok=True)
 fur=m('Boar_Fur',(.16,.09,.045));tusk=m('Boar_Tusk',(.62,.48,.27));moss=m('Wisp_Moss',(.08,.24,.16));glow=m('Wisp_Glow',(.12,.82,.46),2.5)
 boar=[i('BoarBody',(-2.8,0,.75),(.76,.35,.38),fur),i('BoarHead',(-2.10,0,.82),(.35,.28,.27),fur),q('Snout',(-1.80,0,.75),(.17,.17,.10),fur)]
 for y in (-.22,.22):
  boar += [i('BoarLeg',(-3.12,y,.32),(.10,.10,.32),fur),i('BoarLeg',(-2.48,y,.32),(.10,.10,.32),fur),q('Tusk',(-1.78,y,.66),(.14,.025,.06),tusk)]
 boar_obj=j(boar,'MCP_WildwoodBoar');e(boar_obj,'wildwood_boar.fbx')
 wisp=[i('WispCore',(2.4,0,1.2),(.35,.35,.48),moss),i('WispGlow',(2.4,0,1.2),(.18,.18,.24),glow)]
 for x,y,z in ((2.9,.10,1.0),(1.95,-.15,1.35),(2.55,.38,.78),(2.18,-.35,.80)):
  wisp.append(i('WispShard',(x,y,z),(.15,.12,.25),moss))
 wisp_obj=j(wisp,'MCP_MireWisp');e(wisp_obj,'mire_wisp.fbx')
 bpy.ops.wm.save_as_mainfile(filepath=str(ART/'phase1_creature_silhouettes.blend'));bpy.ops.mesh.primitive_plane_add(size=12);bpy.context.object.data.materials.append(m('Ground',(.04,.055,.07)));bpy.ops.object.light_add(type='AREA',location=(1,-4,5));bpy.context.object.data.energy=1000;bpy.context.object.data.size=5;bpy.ops.object.camera_add(location=(5,-7,3));cam=bpy.context.object;bpy.context.scene.camera=cam;cam.rotation_euler=(Vector((0,0,.8))-cam.location).to_track_quat('-Z','Y').to_euler();s=bpy.context.scene;s.render.engine='BLENDER_EEVEE';s.render.resolution_x=960;s.render.resolution_y=540;s.render.filepath=str(ART/'phase1_creature_silhouettes.png');bpy.ops.render.render(write_still=True)
if __name__=='__main__':main()
