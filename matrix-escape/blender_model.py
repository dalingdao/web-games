import bpy, math
D='D:/tests/short_drama/output/fps/'
bpy.ops.wm.read_factory_settings(use_empty=True)
sc=bpy.context.scene

def mat(n,c,r,m=0,e=0,trans=0):
    m2=bpy.data.materials.new(n);m2.use_nodes=True
    b=m2.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value=(*c,1)
    b.inputs['Roughness'].default_value=r
    b.inputs['Metallic'].default_value=m
    if e:
        ec=b.inputs.get('Emission Color') or b.inputs.get('Emission')
        es=b.inputs.get('Emission Strength')
        if ec:ec.default_value=(*c,1)
        if es:es.default_value=e
    if trans:
        b.inputs['Transmission Weight'].default_value=trans
    return m2

def smooth(o,levels=1):
    sd=o.modifiers.new('s','SUBSURF');sd.levels=levels;sd.render_levels=levels

def box(loc,scale,matm,rot=(0,0,0)):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc,rotation=rot)
    o=bpy.context.object;o.scale=scale;o.data.materials.append(matm);smooth(o,1);return o

# ---- 海面 ----
bpy.ops.mesh.primitive_plane_add(size=700)
sea=bpy.context.object
sd=sea.modifiers.new('w','DISPLACE');sd.strength=2.4;sd.mid_level=0.5
tx=bpy.data.textures.new('wav','CLOUDS');tx.noise_scale=7;tx.noise_depth=4;sd.texture=tx
sea.data.materials.append(mat('sea',(0.012,0.045,0.10),0.12,0.85))
smooth(sea,2)

# ---- 真实泰坦尼克船体 ----
hullM=mat('hull',(0.015,0.02,0.03),0.5,0.3)
deckM=mat('deck',(0.03,0.045,0.06),0.6,0.1)
winM=mat('win',(1.0,0.62,0.22),0.3,0,e=4.5)
metalM=mat('metal',(0.05,0.06,0.08),0.35,0.8)
# 船体: 尖船头(+Z) 宽船体 圆船尾(-Z)
bpy.ops.mesh.primitive_cube_add(size=1,location=(0,-1.5,3.2))
ship=bpy.context.object;ship.scale=(14,52,3.6);ship.data.materials.append(hullM);smooth(ship,2)
# 船头尖(楔形)
bpy.ops.mesh.primitive_cone_add(vertices=6,radius1=8,radius2=1,depth=16,location=(0,25,3.4),rotation=(math.radians(90),0,0))
bow=bpy.context.object;bow.scale=(1.0,1.0,0.8);bow.data.materials.append(hullM);smooth(bow,2)
# 甲板层
box((0,-1.5,5.2),(13,50,0.6),deckM)
box((0,-1.5,6.6),(10,42,0.5),deckM)
box((0,-1.5,8.0),(8,34,0.5),deckM)
# 上层建筑(驾驶台/客舱)
box((0,8,9.5),(8,10,2.2),deckM)
box((0,-8,9.0),(7,16,1.6),deckM)
# 4 烟囱(前3大后1小, 微后倾)
for i,zc in enumerate((16,7,-2,-11)):
    s=1.6 if i<3 else 1.1
    box((0,zc,12.2),(2.2*s,2.6*s,3.4*s),metalM,rot=(math.radians(-4),0,0))
    box((0,zc,14.2),(2.6*s,3.0*s,0.7*s),mat('funnel',(0.12,0.05,0.03),0.5,0.2))
# 桅杆×2
for zc in (20,-14):
    bpy.ops.mesh.primitive_cylinder_add(radius=0.35,depth=10,location=(0,zc,10))
    m=bpy.context.object;m.data.materials.append(metalM);smooth(m,1)
# 舷窗排(发光, 两侧)
for side in (-1,1):
    for i in range(18):
        box((side*12.5,10-i*2.6,5.6),(0.5,0.9,0.7),winM)
# 船侧灯光

# ---- 真实冰山(不规则峰) ----
iceM=mat('ice',(0.62,0.72,0.82),0.25,0.1,trans=0.3)
bpy.ops.mesh.primitive_ico_sphere_add(radius=16,subdivisions=3,location=(40,-3,-40))
ice=bpy.context.object;ice.scale=(1.0,1.4,2.2);ice.data.materials.append(iceM);smooth(ice,1)
# 尖锐峰
bpy.ops.mesh.primitive_cone_add(vertices=7,radius1=7,radius2=0.6,depth=26,location=(46,4,-14),rotation=(math.radians(8),math.radians(12),0))
peak=bpy.context.object;peak.data.materials.append(iceM);smooth(peak,1)
bpy.ops.mesh.primitive_cone_add(vertices=6,radius1=4,radius2=0.4,depth=14,location=(30,0,-26),rotation=(math.radians(-10),math.radians(-8),0))
p2=bpy.context.object;p2.data.materials.append(iceM);smooth(p2,1)

# ---- 高细节人体 ----
pMat=mat('ppl',(0.02,0.024,0.03),0.55,0.1)
coatM=mat('coat',(0.035,0.04,0.05),0.65,0.0)
def part(shape,loc,scale=None,rot=None,matm=pMat,s=1):
    if shape=='s':
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.5*s,segments=24,ring_count=18,location=loc)
    else:
        bpy.ops.mesh.primitive_cylinder_add(radius=0.5*s,depth=1,vertices=18,location=loc)
    o=bpy.context.object
    if scale:o.scale=scale
    if rot:o.rotation_euler=rot
    o.data.materials.append(matm)
    smooth(o,1)
    return o

def human(x,y,z,s=1,pose='stand',cloth=None):
    cl=cloth or coatM
    part('s',(x,y,z+3.55*s),(0.94*s,0.88*s,1.06*s),matm=pMat,s=s)
    part('s',(x,y,z+3.62*s),(0.96*s,0.9*s,0.95*s),matm=pMat,s=s)
    part('s',(x,y+0.42*s,z+3.45*s),(0.12*s,0.22*s,0.16*s),matm=pMat,s=s)
    part('s',(x,y+0.16*s,z+3.15*s),(0.42*s,0.42*s,0.28*s),matm=pMat,s=s)
    part('c',(x,y,z+3.1*s),(0.34*s,0.34*s,0.45*s),matm=pMat,s=s)
    part('c',(x,y,z+2.92*s),(1.35*s,0.78*s,0.22*s),matm=cl,s=s)
    part('c',(x,y,z+2.3*s),(1.16*s,0.75*s,1.15*s),matm=cl,s=s)
    part('c',(x,y,z+1.55*s),(1.08*s,0.78*s,0.5*s),matm=cl,s=s)
    def arm(side,rz=0.12,ex=0.0):
        ax=x+0.58*side*s; az=z+2.9*s
        part('c',(ax,y,az-0.4*s),(0.28*s,0.28*s,0.75*s),(0,0,rz*side),matm=cl,s=s)
        fx=ax+math.sin(rz*side)*0.7*s; fz=az-0.8*s
        part('c',(fx,y,fz-0.35*s),(0.24*s,0.24*s,0.68*s),(ex,0,rz*side),matm=cl,s=s)
        part('s',(fx,y,fz-0.72*s),(0.13*s,0.13*s,0.13*s),matm=pMat,s=s)
        for fi in (-1,1):
            part('s',(fx+fi*0.06*s,y,fz-0.86*s),(0.05*s,0.05*s,0.14*s),matm=pMat,s=s)
    def leg(side):
        lx=x+0.22*side*s
        part('c',(lx,y,z+1.2*s),(0.4*s,0.4*s,0.85*s),matm=cl,s=s)
        part('c',(lx,y,z+0.42*s),(0.31*s,0.31*s,0.8*s),matm=cl,s=s)
        part('s',(lx,y+0.12*s,z+0.05*s),(0.2*s,0.42*s,0.12*s),matm=pMat,s=s)
    if pose=='point': arm(-1,0.12,0);arm(1,-1.5,0.3)
    elif pose=='hug': arm(-1,-0.9,-0.9);arm(1,0.9,-0.9)
    elif pose=='hold': arm(-1,0.9,-1.3);arm(1,-0.9,-1.3)
    elif pose=='armsout': arm(-1,1.4,0);arm(1,-1.4,0)
    else: arm(-1,0.12,0);arm(1,-0.12,0)
    leg(-1);leg(1)

# 经典桥段人物(船头 Jack&Rose 张臂 / 瞭望指向 / 相拥 / 抱子)
human(-1.5,24,6.8,0.85,pose='armsout')   # Jack 船头张臂
human(1.5,24,6.8,0.8,pose='armsout')     # Rose 船头张臂
human(0,20,6.8,1.0,pose='point')         # 瞭望员指向
human(-3,0,6.8,0.8,pose='hug')           # 甲板相拥
human(3,0,6.8,0.8)
# 救生艇
bpy.ops.mesh.primitive_cylinder_add(radius=4,depth=3,location=(-18,3,4))
lb=bpy.context.object;lb.scale=(1.0,2.0,1.0);lb.data.materials.append(mat('lb',(0.05,0.07,0.09),0.5,0.4));smooth(lb,1)
human(-19,3,5.2,0.8,pose='hold')         # 母亲抱子
human(-15,3,5.2,0.8)
human(-11,3,5.2,0.8)

# ---- 导出 GLB ----
bpy.ops.export_scene.gltf(
    filepath=D+'titanic_stage.glb',
    export_format='GLB',export_apply=True,export_yup=True,export_lights=False)
print('MODEL_EXPORT_DONE')
