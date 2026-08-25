"""Local-only Phase 1 Wildwood landmark kit."""
from pathlib import Path
from math import radians
import bpy
from mathutils import Vector

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'unity/Assets/Isoperia/Resources/Art/OwnedModels'
ART=ROOT/'art/blender'
def mat(n,c,e=0):
    a=bpy.data.materials.new(n);a.diffuse_color=(*c,1);a.use_nodes=True
    b=a.node_tree.nodes['Principled BSDF'];b.inputs['Base Color'].default_value=(*c,1)
    if e:b.inputs['Emission Color'].default_value=(*c,1);b.inputs['Emission Strength'].default_value=e
    return a
def cube(n,p,s,a,r=0):
    bpy.ops.mesh.primitive_cube_add(location=p,rotation=(0,0,r));o=bpy.context.object;o.name=n;o.scale=s
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);o.data.materials.append(a);return o
def cyl(n,p,r,d,a,rot=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=10,radius=r,depth=d,location=p);o=bpy.context.object;o.name=n;o.data.materials.append(a)
    if rot:o.rotation_euler=rot
    return o
def cone(n,p,r1,r2,d,a):
    bpy.ops.mesh.primitive_cone_add(vertices=8,radius1=r1,radius2=r2,depth=d,location=p);o=bpy.context.object;o.name=n;o.data.materials.append(a);return o
def join(items,n):
    bpy.ops.object.select_all(action='DESELECT')
    for x in items:x.select_set(True)
    bpy.context.view_layer.objects.active=items[0];bpy.ops.object.join();items[0].name=n;return items[0]
def export(o,n):
    bpy.ops.object.select_all(action='DESELECT');o.select_set(True);bpy.context.view_layer.objects.active=o
    bpy.ops.export_scene.fbx(filepath=str(OUT/n),use_selection=True,apply_unit_scale=True,add_leaf_bones=False)
def main():
    bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
    OUT.mkdir(parents=True,exist_ok=True);ART.mkdir(parents=True,exist_ok=True)
    bark=mat('Wildwood_Bark',(.16,.055,.018));cut=mat('Fresh_Cut',(.48,.20,.045));leaf=mat('Wildwood_Leaf',(.045,.18,.065));cloth=mat('Canvas',(.25,.14,.055));rope=mat('Rope',(.42,.25,.08));stone=mat('Moss_Stone',(.17,.22,.16));glow=mat('Rune_Glow',(.12,.8,.36),1.7)
    logs=[]
    for z in (.22,.48):
        for y in (-.28,.28):
            log=cyl('Felled_Log',(-5,y,z),.18,1.75,bark,(0,radians(90),0));logs.append(log)
            logs.append(cyl('Cut_End',(-5.88,y,z),.181,.015,cut,(0,radians(90),0)))
    export(join(logs,'MCP_WildwoodLogStack'),'wildwood_log_stack.fbx')
    saw=[cube('SawBench',(-2.45,0,.44),(.78,.35,.10),bark),cube('LegA',(-2.95,0,.20),(.08,.10,.28),bark,radians(16)),cube('LegB',(-1.95,0,.20),(.08,.10,.28),bark,radians(-16)),cube('SawBlade',(-2.45,0,.70),(.70,.035,.04),rope,radians(10))]
    export(join(saw,'MCP_WildwoodSawhorse'),'wildwood_sawhorse.fbx')
    tent=[cube('TentFloor',(0,0,.08),(1.05,.72,.08),bark),cone('TentBody',(0,0,.90),1.12,0,1.65,cloth),cyl('CenterPole',(0,0,.92),.055,1.75,bark)]
    export(join(tent,'MCP_WildwoodTent'),'wildwood_tent.fbx')
    shrine=[cube('Plinth',(2.8,0,.12),(.78,.62,.12),stone),cube('PillarA',(2.25,-.3,.58),(.18,.18,.55),stone,radians(-8)),cube('PillarB',(3.35,.22,.45),(.16,.16,.43),stone,radians(12)),cube('Rune',(2.8,-.64,.47),(.30,.02,.20),glow)]
    export(join(shrine,'MCP_WildwoodShrineFragments'),'wildwood_shrine_fragments.fbx')
    coils=[]
    for r,z in ((.38,.08),(.31,.14),(.24,.20)):
        bpy.ops.mesh.primitive_torus_add(major_radius=r,minor_radius=.035,major_segments=12,minor_segments=6,location=(5.35,0,z));o=bpy.context.object;o.name='RopeCoil';o.data.materials.append(rope);coils.append(o)
    coils.append(cyl('LooseRope',(5.8,0,.25),.035,.65,rope,(0,radians(72),0)))
    export(join(coils,'MCP_WildwoodRopeCoil'),'wildwood_rope_coil.fbx')
    bpy.ops.wm.save_as_mainfile(filepath=str(ART/'phase1_wildwood_landmarks.blend'))
    bpy.ops.mesh.primitive_plane_add(size=16);bpy.context.object.data.materials.append(mat('Ground',(.025,.055,.035)))
    bpy.ops.object.light_add(type='AREA',location=(0,-6,7));bpy.context.object.data.energy=1300;bpy.context.object.data.size=7
    bpy.ops.object.camera_add(location=(9,-13,7));cam=bpy.context.object;bpy.context.scene.camera=cam;cam.rotation_euler=(Vector((0,0,.7))-cam.location).to_track_quat('-Z','Y').to_euler()
    s=bpy.context.scene;s.render.engine='BLENDER_EEVEE';s.render.resolution_x=960;s.render.resolution_y=540;s.render.filepath=str(ART/'phase1_wildwood_landmarks.png');bpy.ops.render.render(write_still=True)
if __name__=='__main__':main()
