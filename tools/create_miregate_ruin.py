"""Build an original Y-up Miregate bog-ruin landmark for Unity/WebGL."""
import bpy, sys

def m(name, color):
    v=bpy.data.materials.new(name); v.diffuse_color=color; return v
def cube(name, p, s, mat):
    bpy.ops.mesh.primitive_cube_add(location=p); o=bpy.context.object; o.name=name; o.scale=s; bpy.ops.object.transform_apply(location=False, rotation=False, scale=True); o.data.materials.append(mat); return o
def rock(name, p, s, mat):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=.5,location=p); o=bpy.context.object; o.name=name; o.scale=s; bpy.ops.object.transform_apply(location=False, rotation=False, scale=True); o.data.materials.append(mat); return o
def main(path):
    bpy.ops.wm.read_factory_settings(use_empty=True); stone=m('FenStone',(.20,.27,.24,1)); moss=m('FenMoss',(.14,.34,.20,1)); glow=m('FenRune',(.20,.68,.54,1))
    ps=[cube('RuinDais',(0,.12,0),(1.7,.12,1.25),stone),cube('RuinAltar',(0,.46,-.12),(.58,.28,.42),stone),cube('RuinRune',(0,.48,-.56),(.28,.13,.03),glow),cube('RuinPostL',(-1.1,.78,.34),(.22,.78,.22),stone),cube('RuinPostR',(1.1,.78,.34),(.22,.78,.22),stone),cube('RuinLintel',(0,1.45,.34),(1.3,.18,.25),stone)]
    for i,(x,z) in enumerate(((-1.5,-.85),(1.5,-.9),(-1.55,.85),(1.5,.86))): ps.append(rock('FenRubble%d'%i,(x,.23,z),(.34,.45,.32),moss))
    bpy.ops.object.select_all(action='DESELECT'); [o.select_set(True) for o in ps]; bpy.context.view_layer.objects.active=ps[0]; bpy.ops.object.join(); bpy.context.object.name='IsoperiaMiregateRuin'; bpy.ops.export_scene.fbx(filepath=path,use_selection=True,add_leaf_bones=False,bake_anim=False,path_mode='COPY',embed_textures=False)
if __name__=='__main__': main(sys.argv[-1])
