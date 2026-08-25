"""Local-only Phase 1 travel-route landmark kit."""
from pathlib import Path
import bpy
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/"unity/Assets/Isoperia/Resources/Art/OwnedModels";ART=ROOT/"art/blender"
def m(n,c,e=0):
 a=bpy.data.materials.new(n);a.diffuse_color=(*c,1);a.use_nodes=True;b=a.node_tree.nodes['Principled BSDF'];b.inputs['Base Color'].default_value=(*c,1)
 if e:b.inputs['Emission Color'].default_value=(*c,1);b.inputs['Emission Strength'].default_value=e
 return a
def q(n,p,s,a):
 bpy.ops.mesh.primitive_cube_add(location=p);o=bpy.context.object;o.name=n;o.scale=s;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(a);return o
def c(n,p,r,d,a):
 bpy.ops.mesh.primitive_cylinder_add(vertices=10,radius=r,depth=d,location=p);o=bpy.context.object;o.name=n;o.data.materials.append(a);return o
def j(ps,n):
 bpy.ops.object.select_all(action='DESELECT');[x.select_set(True) for x in ps];bpy.context.view_layer.objects.active=ps[0];bpy.ops.object.join();ps[0].name=n;return ps[0]
def e(o,n):
 bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o;bpy.ops.export_scene.fbx(filepath=str(OUT/n),use_selection=True,apply_unit_scale=True,add_leaf_bones=False)
def main():
 bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False);OUT.mkdir(parents=True,exist_ok=True);ART.mkdir(parents=True,exist_ok=True)
 wood=m('Route_Wood',(.22,.08,.025));stone=m('Route_Stone',(.20,.22,.24));iron=m('Route_Iron',(.04,.05,.065));ember=m('Route_Ember',(.95,.16,.015),2)
 bridge=[q('Deck',(-5,0,.34),(1.4,.65,.10),wood)]
 for x in (-6.15,-4.8,-3.85): bridge+=[q('Rail', (x,-.58,.68),(.055,.055,.42),wood),q('Rail',(x,.58,.68),(.055,.055,.42),wood)]
 bridge_obj=j(bridge,'MCP_WoodBridge');e(bridge_obj,'route_wood_bridge.fbx')
 mile=j([q('Stone',(-1.9,0,.52),(.24,.18,.52),stone),q('Face',(-1.64,0,.62),(.015,.11,.18),ember)],'MCP_Milestone');e(mile,'route_milestone.fbx')
 braz=j([c('Bowl',(1,0,.72),.30,.16,iron),c('Post',(1,0,.35),.10,.65,iron),q('Base',(1,0,.07),(.32,.32,.07),stone),c('Flame',(1,0,.91),.18,.24,ember)],'MCP_RoadBrazier');e(braz,'route_road_brazier.fbx')
 cart=j([q('Bed',(3.5,0,.45),(.68,.40,.10),wood),c('Wheel',(3.1,-.44,.25),.25,.10,wood),c('Wheel',(3.1,.44,.25),.25,.10,wood),q('BrokenHandle',(4.25,0,.40),(.42,.05,.05),wood)],'MCP_RuinedCart');e(cart,'route_ruined_cart.fbx')
 lamp=j([c('Post',(5.8,0,.85),.07,1.7,wood),q('Arm',(6.05,0,1.52),(.32,.04,.04),iron),c('Lamp',(6.31,0,1.28),.14,.28,ember),q('Cap',(6.31,0,1.47),(.20,.20,.05),iron)],'MCP_RoadLantern');e(lamp,'route_road_lantern.fbx')
 bpy.ops.wm.save_as_mainfile(filepath=str(ART/'phase1_route_kit.blend'));bpy.ops.mesh.primitive_plane_add(size=16);bpy.context.object.data.materials.append(m('Ground',(.04,.055,.07)));bpy.ops.object.light_add(type='AREA',location=(1,-6,7));bpy.context.object.data.energy=1200;bpy.context.object.data.size=7;bpy.ops.object.camera_add(location=(10,-13,7));cam=bpy.context.object;bpy.context.scene.camera=cam;cam.rotation_euler=(Vector((0,0,.8))-cam.location).to_track_quat('-Z','Y').to_euler();s=bpy.context.scene;s.render.engine='BLENDER_EEVEE';s.render.resolution_x=960;s.render.resolution_y=540;s.render.filepath=str(ART/'phase1_route_kit.png');bpy.ops.render.render(write_still=True)
if __name__=='__main__':main()
