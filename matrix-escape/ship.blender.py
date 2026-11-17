# Blender 建模: 泰坦尼克号船体 + 冰山 (写实) → 导出 GLB
import bpy, math, random

# 清空场景
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete()

def make_mat(name, color, rough, metal, emit=None, ei=0):
    m = bpy.data.materials.new(name); m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if emit:
        for nm in ('Emission Color','Emission'):
            if nm in bsdf.inputs:
                bsdf.inputs[nm].default_value = (*emit,1); break
        if 'Emission Strength' in bsdf.inputs: bsdf.inputs['Emission Strength'].default_value = ei
    return m

hull_m  = make_mat('hull',  (0.12,0.14,0.17), 0.35, 0.8)
deck_m  = make_mat('deck',  (0.16,0.18,0.22), 0.4,  0.7)
smoke_m = make_mat('smoke', (0.18,0.10,0.08), 0.6,  0.3)

# ==== 船体(细分流线) ====
bpy.ops.mesh.primitive_cube_add(size=1)
hull = bpy.context.object; hull.name='hull'
hull.scale=(52,9,7); hull.location=(0,0.5,0)
bpy.ops.object.transform_apply(scale=True)
me=hull.data
# 船头(z>18 收窄流线) + 船尾(z<-18 微收)
for v in me.vertices:
    z=v.co.z
    if z>18:
        t=(z-18)/8.0
        v.co.x *= max(0.25, 1-t*0.85); v.co.y *= max(0.4, 1-t*0.6); v.co.y -= t*0.6
    elif z<-18:
        t=(-z-18)/8.0
        v.co.x *= max(0.5, 1-t*0.5); v.co.y *= max(0.6, 1-t*0.4)
sub=hull.modifiers.new('s','SUBSURF'); sub.levels=2; sub.render_levels=2
hull.data.materials.append(hull_m)

# ==== 上层建筑(两层) ====
for (sx,sy,sz,lx,ly,lz) in [(30,7,4,-2,6,0),(18,5,3,-8,10,0)]:
    bpy.ops.mesh.primitive_cube_add(size=1, location=(lx,ly,lz))
    d=bpy.context.object; d.scale=(sx,sy,sz); bpy.ops.object.transform_apply(scale=True)
    ds=d.modifiers.new('s','SUBSURF'); ds.levels=1; ds.render_levels=1
    d.data.materials.append(deck_m)

# ==== 烟囱(4根, 微倾, 深红黑+环带) ====
for i in range(4):
    x=-18+i*7
    bpy.ops.mesh.primitive_cylinder_add(radius=1.3, depth=5, location=(x,13,0), rotation=(0,0.1,0))
    s=bpy.context.object; s.data.materials.append(smoke_m)
    bpy.ops.mesh.primitive_cylinder_add(radius=1.34, depth=0.9, location=(x,14.7,0), rotation=(0,0.1,0))
    band=bpy.context.object; band.data.materials.append(make_mat('band',(0.45,0.15,0.1),0.5,0.4))

# ==== 桅杆(前后) ====
for (x,y) in [(24,6),(20,13)]:
    bpy.ops.mesh.primitive_cylinder_add(radius=0.22, depth=y, location=(x,6+y/2-1.5,0))
    m=bpy.context.object; m.data.materials.append(hull_m)

# 导出 ship.glb
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath='D:/tests/short_drama/output/fps/ship.glb', export_format='GLB')

# ==== 冰山(顶点扰动高模, 单独导出) ====
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete()
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=9, location=(0,0,0))
ice=bpy.context.object; ice.name='iceberg'
me2=ice.data
random.seed(7)
for v in me2.vertices:
    n=1+(random.random()-0.5)*0.4
    v.co.x*=n; v.co.y*=n*1.3; v.co.z*=n*1.1
# 冰面压平底部(浮冰)
for v in me2.vertices:
    if v.co.z < -7: v.co.z = -7-(random.random()*0.5)
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.object.mode_set(mode='OBJECT')
ice_m=make_mat('ice',(0.82,0.9,0.98),0.88,0.05)
ice.data.materials.append(ice_m)
bpy.ops.export_scene.gltf(filepath='D:/tests/short_drama/output/fps/iceberg.glb', export_format='GLB')
print('BLENDER_DONE')
