import bpy, math
D='D:/tests/short_drama/output/fps/'
bpy.ops.wm.read_factory_settings(use_empty=True)
sc=bpy.context.scene
sc.render.engine='CYCLES'
sc.cycles.samples=96
sc.cycles.use_denoising=True
sc.cycles.device='CPU'
sc.render.resolution_x=720;sc.render.resolution_y=1280
sc.render.resolution_percentage=100
sc.render.image_settings.file_format='PNG'
sc.render.film_transparent=False
sc.view_settings.look='AgX - Medium High Contrast'

def L(c,x,y,z,e,p=1,sz=8,col=None):
    bpy.ops.object.light_add(type='AREA',location=(x,y,z))
    o=bpy.context.object;o.data.energy=e*p;o.data.size=sz
    o.data.color=c;return o

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

# ================= 真实海面 (Displace + 泡沫) =================
bpy.ops.mesh.primitive_plane_add(size=700)
sea=bpy.context.object
sd=sea.modifiers.new('w','DISPLACE');sd.strength=2.4;sd.mid_level=0.5
tx=bpy.data.textures.new('wav','CLOUDS');tx.noise_scale=7;tx.noise_depth=4;sd.texture=tx
# 海面 PBR: 深蓝 + 高反射 + 粗糙度随噪声(波峰光)
seaM=mat('sea',(0.012,0.045,0.10),0.12,0.85)
sea.data.materials.append(seaM)

# ================= 材质 =================
# 木纹(船体/甲板): 程序噪声凹凸
woodM=mat('wood',(0.12,0.07,0.04),0.55,0.05)
woodM.node_tree.nodes.get('Principled BSDF').inputs['Roughness'].default_value=0.5
# 金属(船艏/舷窗框)
metalM=mat('metal',(0.35,0.37,0.40),0.3,0.9)
# 冰(半透灰白, 透射)
iceM=mat('ice',(0.62,0.72,0.82),0.28,0.1,trans=0.25)
# 人物(受光剪影: 深色, 边缘有轮廓)
pMat=mat('ppl',(0.02,0.024,0.03),0.55,0.1)
coatM=mat('coat',(0.03,0.035,0.045),0.65,0.0)

# ================= 高细节人体(头/颈/肩/胸/髋/手臂2段/腿2段/脚) =================
def part(shape,loc,scale=None,rot=None,matm=pMat,s=1):
    if shape=='s':
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.5*s,segments=24,ring_count=18,location=loc)
    elif shape=='c':
        bpy.ops.mesh.primitive_cylinder_add(radius=0.5*s,depth=1,vertices=18,location=loc)
    o=bpy.context.object
    if scale:o.scale=scale
    if rot:o.rotation_euler=rot
    o.data.materials.append(matm)
    o.data.shade_smooth()
    return o

def human(x,y,z,s=1,ry=0,pose='stand',matm=pMat,cloth=None):
    cl=cloth or coatM
    # 头(椭圆+发型)
    part('s',(x,y,z+3.55*s),(0.94*s,0.88*s,1.06*s),matm=pMat,s=s)
    part('s',(x,y,z+3.62*s),(0.96*s,0.9*s,0.95*s),matm=pMat,s=s)  # 发
    # 颈
    part('c',(x,y,z+3.1*s),(0.34*s,0.34*s,0.45*s),matm=pMat,s=s)
    # 肩(宽)
    part('c',(x,y,z+2.92*s),(1.35*s,0.78*s,0.22*s),matm=cl,s=s)
    # 胸(宽→腰)
    part('c',(x,y,z+2.3*s),(1.16*s,0.75*s,1.15*s),matm=cl,s=s)
    # 髋
    part('c',(x,y,z+1.55*s),(1.08*s,0.78*s,0.5*s),matm=cl,s=s)
    # 手臂(上臂+前臂+手): 姿态 via rotZ/rotX
    def arm(side,rz=0.12,ex=0.0):
        ax=x+0.58*side*s; ay=y; az=z+2.9*s
        part('c',(ax,ay,az-0.4*s),(0.28*s,0.28*s,0.75*s),(0,0,rz*side),matm=cl,s=s)
        # 前臂(肘下)
        fx=ax+math.sin(rz*side)*0.7*s; fz=az-0.8*s-math.cos(rz*side)*0.0
        part('c',(fx,ay,fz-0.35*s),(0.24*s,0.24*s,0.68*s),(ex,0,rz*side),matm=cl,s=s)
        part('s',(fx,ay,fz-0.72*s),(0.13*s,0.13*s,0.13*s),matm=pMat,s=s)  # 手
    # 腿(大腿+小腿+脚)
    def leg(side):
        lx=x+0.22*side*s
        part('c',(lx,y,z+1.2*s),(0.4*s,0.4*s,0.85*s),matm=cl,s=s)
        part('c',(lx,y,z+0.42*s),(0.31*s,0.31*s,0.8*s),matm=cl,s=s)
        part('s',(lx,y+0.12*s,z+0.05*s),(0.2*s,0.42*s,0.12*s),matm=pMat,s=s)  # 脚
    if pose=='point':   # 瞭望员: 右臂前伸指向
        arm(-1,0.12,0);arm(1,-1.5,0.3)
    elif pose=='hug':   # 相拥: 双臂前环
        arm(-1,-0.9,-0.9);arm(1,0.9,-0.9)
    elif pose=='hold':  # 抱子: 双臂胸前
        arm(-1,0.9,-1.3);arm(1,-0.9,-1.3)
    else:               # 站立
        arm(-1,0.12,0);arm(1,-0.12,0)
    leg(-1);leg(1)
    return []

# 甲板乘客(镜头1): 夫妻相拥 + 站姿
deck1=human(-14,6.6,18,0.8,pose='hug');deck2=human(-5,6.6,18,0.8)
deck3=human(4,6.6,18,0.8);deck4=human(12,6.6,18,0.8,pose='hug')
# 瞭望员(镜头2): 站船首指向冰山
lookout=human(-26,9,-24,1.0,pose='point')
# 救生艇+人物(镜头5): 母亲抱婴儿
bpy.ops.mesh.primitive_cylinder_add(radius=1.9,depth=6.5,location=(-6,1.2,28),rotation=(0,1.5708,0.2))
lb=bpy.context.object;lb.data.materials.append(mat('lb',(0.05,0.07,0.09),0.5,0.4))
boatP=human(-8,1.4,28,0.85,pose='hold')
human(-5.2,1.4,27.6,0.85)
human(-2.4,1.4,27.2,0.85)

# ================= 影棚布光 =================
L((0.55,0.7,1.0),-60,55,-45,2600,sz=40)   # 月光主光
L((0.35,0.5,0.75),30,25,60,550,sz=25)      # 冷补光
L((1.0,0.65,0.35),0,10,20,900,sz=12)       # 暖主光(船)
L((1.0,0.8,0.5),-20,30,60,400,sz=20)       # 逆光轮廓(人物边缘)
# 窗灯(沿船舷暖点光, 发光方块)
winM=mat('win',(1.0,0.62,0.25),0.6,e=7)
for i in range(12):
    x=-20+i*3.6
    bpy.ops.mesh.primitive_cube_add(size=0.85,location=(x,5.5,5.2))
    w=bpy.context.object;w.data.materials.append(winM)
    bpy.ops.mesh.primitive_cube_add(size=0.85,location=(x,5.5,-5.2))
    w2=bpy.context.object;w2.data.materials.append(winM)
    bpy.ops.object.light_add(type='POINT',location=(x,7,6.5))
    pl=bpy.context.object;pl.data.energy=300;pl.data.color=(1.0,0.6,0.3);pl.data.shadow_soft_size=1.5
# 体积雾
sc.world=bpy.data.worlds.new('w');sc.world.use_nodes=True
bg=sc.world.node_tree.nodes.get('Background');bg.inputs['Color'].default_value=(0.008,0.02,0.045,1);bg.inputs['Strength'].default_value=0.35

# ================= 导入 GLB =================
bpy.ops.import_scene.gltf(filepath=D+'ship.glb')
ship=[o for o in bpy.context.scene.objects if o.type=='MESH']
bpy.ops.import_scene.gltf(filepath=D+'iceberg.glb')
ice=[o for o in bpy.context.scene.objects if o.type=='MESH' and o not in ship]
# 船体材质: 木/金属
for o in ship:
    if o.material_slots:
        mm=o.material_slots[0].material
        if mm:
            nd=mm.node_tree.nodes.get('Principled BSDF')
            if nd:
                nd.inputs['Roughness'].default_value=0.5
                nd.inputs['Metallic'].default_value=0.3
# 冰山: 半透冰
for o in ice:
    o.data.materials.clear();o.data.materials.append(iceM)

# ================= 相机 =================
cam=bpy.data.cameras.new('cam');cam.lens=48
cam_obj=bpy.data.objects.new('cam',cam);sc.collection.objects.link(cam_obj);sc.camera=cam_obj
def aim(o,tgt):
    d=__import__('mathutils').Vector(tgt)-o.location
    o.rotation_euler=d.to_track_quat('-Z','Y').to_euler()

# ================= 6镜头 =================
shots=[
 ((46,14,72),(0,5,4),(0,0,10),(0,0,3.1416),0,0),
 ((30,13,38),(0,2,-40),(0,0,10),(0,0,3.1416),2.8,0),
 ((42,7,28),(28,3,-24),(0,0,10),(0,0,3.0416),2.0,3),
 ((24,5,42),(0,2,6),(0,-1.5,10),(0.35,0,3.0416),2.8,0.3),
 ((-12,4,40),(-5,2,27),(0,-0.6,10),(0.18,0,3.0416),2.8,0),
 ((-22,3.5,48),(0,0,6),(0,-4,10),(-0.5,0,3.0416),0,0),
]
for i,(cp,tg,sp,sr,dof,alm) in enumerate(shots):
    cam_obj.location=cp;aim(cam_obj,tg)
    cam.dof.use_dof=dof>0
    if dof:cam.dof.aperture_fstop=dof
    for o in ship:o.location=sp;o.rotation_euler=sr
    for o in ice:
        if i==1:o.location=(-20,-3,-70);o.scale=(0.7,0.7,0.7)
        elif i==2:o.location=(30,-3,-40);o.scale=(1.2,1.2,1.2)
        else:o.location=(-60,-4,-90);o.scale=(1.0,1.0,1.0)
    if alm>0:
        bpy.ops.object.light_add(type='POINT',location=(0,8,0))
        al=bpy.context.object;al.data.energy=alm*300;al.data.color=(1.0,0.15,0.1)
    sc.render.filepath=D+f'frame_{i+1:02d}.png'
    bpy.ops.render.render(write_still=True)
    print('SHOT',i+1,'DONE')
print('ALL_DONE')
