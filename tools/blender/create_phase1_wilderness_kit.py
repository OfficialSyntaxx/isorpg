"""Local-only wilderness dressing kit for Phase 1 routes."""
from pathlib import Path
import bpy
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/"unity/Assets/Isoperia/Resources/Art/OwnedModels";ART=ROOT/"art/blender"
def m(n,c):
 a=bpy.data.materials.new(n);a.diffuse_color=(*c,1);a.use_nodes=True;a.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=(*c,1);return a
def q(n,p,s,a):
 bpy.ops.mesh.primitive_cube_add(location=p);o=bpy.context.object;o.name=n;o.scale=s;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(a);return o
def c(n,p,r,d,a):
 bpy.ops.mesh.primitive_cone_add(vertices=8,radius1=r,radius2=0,depth=d,location=p);o=bpy.context.object;o.name=n;o.data.materials.append(a);return o
def j(ps,n):
 bpy.ops.object.select_all(action='DESELECT');[x.select_set(True) for x in ps];bpy.context.view_layer.objects.active=ps[0];bpy.ops.object.join();ps[0].name=n;return ps[0]
def e(o,n):
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.export_scene.fbx(filepath=str(OUT/n),use_selection=True,apply_unit_scale=True,add_leaf_bones=False)
def tree(x,scale,fol,trunk,name,file):
 ps=[q('Trunk',(x,0,scale*.65),(scale*.13,scale*.13,scale*.65),trunk)]
 for z,r in ((scale*1.2,scale*.55),(scale*1.65,scale*.44),(scale*2.05,scale*.31)):ps.append(c('Foliage',(x,0,z),r,scale*.75,fol))
 e(j(ps,name),file)
def main():
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);OUT.mkdir(parents=True,exist_ok=True);ART.mkdir(parents=True,exist_ok=True)
 trunk=m('Wild_Trunk',(.20,.09,.03));pine=m('Wild_Pine',(.055,.25,.16));broad=m('Wild_Broadleaf',(.12,.34,.12));autumn=m('Wild_Autumn',(.48,.18,.04));mush=m('Wild_Mushroom',(.72,.12,.04));reed=m('Wild_Reed',(.26,.42,.14))
 tree(-5,1.0,pine,trunk,'MCP_PineTree','wild_pine_tree.fbx');tree(-2,1.05,broad,trunk,'MCP_BroadleafTree','wild_broadleaf_tree.fbx');tree(1,1.0,autumn,trunk,'MCP_AutumnTree','wild_autumn_tree.fbx')
 log=j([q('Log',(3.7,0,.25),(.82,.16,.16),trunk),c('CutEnd',(4.55,0,.25),.17,.05,reed)],'MCP_FallenLog');e(log,'wild_fallen_log.fbx')
 stump=j([q('Stump',(5.6,0,.22),(.24,.24,.22),trunk),c('Rings',(5.6,0,.46),.21,.04,reed)],'MCP_Stump');e(stump,'wild_stump.fbx')
 fungi=j([c('Mushroom',(-.8,.18,.16),.16,.22,mush),c('Mushroom',(-.45,-.10,.11),.10,.16,mush),q('Stem',(-.8,.18,.07),(.035,.035,.08),reed),q('Stem',(-.45,-.10,.05),(.025,.025,.06),reed)],'MCP_MushroomCluster');e(fungi,'wild_mushroom_cluster.fbx')
 reeds=j([q('Reed',(7.2,-.16,.42),(.025,.025,.42),reed),q('Reed',(7.2,.12,.34),(.025,.025,.34),reed),q('Reed',(7.45,.02,.48),(.025,.025,.48),reed)],'MCP_ReedCluster');e(reeds,'wild_reed_cluster.fbx')
 bpy.ops.wm.save_as_mainfile(filepath=str(ART/'phase1_wilderness_kit.blend'));bpy.ops.mesh.primitive_plane_add(size=18);bpy.context.object.data.materials.append(m('Ground',(.04,.055,.07)));bpy.ops.object.light_add(type='AREA',location=(1,-6,7));bpy.context.object.data.energy=1200;bpy.context.object.data.size=7;bpy.ops.object.camera_add(location=(11,-14,8));cam=bpy.context.object;bpy.context.scene.camera=cam;cam.rotation_euler=(Vector((1,0,1.1))-cam.location).to_track_quat('-Z','Y').to_euler();s=bpy.context.scene;s.render.engine='BLENDER_EEVEE';s.render.resolution_x=960;s.render.resolution_y=540;s.render.filepath=str(ART/'phase1_wilderness_kit.png');bpy.ops.render.render(write_still=True)
if __name__=='__main__':main()
