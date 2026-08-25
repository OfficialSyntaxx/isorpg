"""Local-only Phase 1 outer-route boss silhouette roster."""
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
 bpy.ops.mesh.primitive_cylinder_add(vertices=9,radius=r,depth=d,location=p);o=bpy.context.object;o.name=n;o.data.materials.append(a)
 if rot:o.rotation_euler=rot
 return o
def sph(n,p,s,a):
 bpy.ops.mesh.primitive_uv_sphere_add(segments=10,ring_count=6,location=p);o=bpy.context.object;o.name=n;o.scale=s;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(a);return o
def cone(n,p,a,b,d,ma):
 bpy.ops.mesh.primitive_cone_add(vertices=7,radius1=a,radius2=b,depth=d,location=p);o=bpy.context.object;o.name=n;o.data.materials.append(ma);return o
def j(ps,n):
 bpy.ops.object.select_all(action='DESELECT');[x.select_set(True) for x in ps];bpy.context.view_layer.objects.active=ps[0];bpy.ops.object.join();ps[0].name=n;return ps[0]
def e(o,n):
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.export_scene.fbx(filepath=str(OUT/n),use_selection=True,apply_unit_scale=True,add_leaf_bones=False)
def beast(x,n,col,glow,kind):
 ps=[sph('Body',(x,0,.82),(.70,.38,.50),col),sph('Head',(x+.66,0,1.10),(.35,.29,.33),col)]
 for dx in (-.38,.38):
  for y in (-.24,.24):ps.append(c('Leg',(x+dx,y,.34),.11,.62,col))
 if kind=='tree':ps += [cone('Crown',(x,0,1.82),.85,.12,1.25,col),c('Rune',(x+.66,-.30,1.10),.12,.05,glow,(radians(90),0,0))]
 if kind=='frost':ps += [cone('HornA',(x+.55,-.19,1.52),.16,0,.45,glow),cone('HornB',(x+.55,.19,1.52),.16,0,.45,glow)]
 if kind=='siren':ps += [cone('FinA',(x-.40,-.44,.95),.32,.03,.75,glow),cone('FinB',(x-.40,.44,.95),.32,.03,.75,glow)]
 if kind=='bog':ps += [q('Tail',(x-.84,0,.72),(.48,.10,.10),col,radians(-14)),cone('Spine',(x,0,1.50),.18,.02,.45,glow)]
 return j(ps,'MCP_'+n)
def main():
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);OUT.mkdir(parents=True,exist_ok=True);ART.mkdir(parents=True,exist_ok=True)
 leaf=m('Leaf',(.06,.27,.08));ice=m('Ice',(.15,.50,.78),1);water=m('Water',(.05,.45,.65),1);bog=m('Bog',(.12,.24,.12));rune=m('Rune',(.16,.85,.42),1.7)
 for x,n,col,g,k in [(-6,'boss_wildwood_ancient',leaf,rune,'tree'),(-2,'boss_frostwatch_yeti',ice,ice,'frost'),(2,'boss_sunmere_siren',water,water,'siren'),(6,'boss_miregate_gator',bog,rune,'bog')]:e(beast(x,n,col,g,k),n+'.fbx')
 bpy.ops.wm.save_as_mainfile(filepath=str(ART/'phase1_route_bosses.blend'));bpy.ops.mesh.primitive_plane_add(size=18);bpy.context.object.data.materials.append(m('Ground',(.03,.045,.04)));bpy.ops.object.light_add(type='AREA',location=(0,-7,8));bpy.context.object.data.energy=1600;bpy.context.object.data.size=8;bpy.ops.object.camera_add(location=(9,-14,7));cam=bpy.context.object;bpy.context.scene.camera=cam;cam.rotation_euler=(Vector((0,0,.8))-cam.location).to_track_quat('-Z','Y').to_euler();s=bpy.context.scene;s.render.engine='BLENDER_EEVEE';s.render.resolution_x=960;s.render.resolution_y=540;s.render.filepath=str(ART/'phase1_route_bosses.png');bpy.ops.render.render(write_still=True)
if __name__=='__main__':main()
