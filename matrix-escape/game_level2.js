
/* FPS Demo — three.js + Blender glb + SVG贴图 */
(function(){'use strict';
var renderer,scene,camera,clock,raycaster;
var models={},texCache={};
var player={x:0,z:15,y:1.7,ry:0,pitch:0,vx:0,vz:0,hp:100,sprint:1};
var keys={},mouseDown=false,locked=false;
/* 移动端触屏状态 */
var joy={active:false,dx:0,dy:0,id:null,cx:0,cy:0}; // 左摇杆(移动)
var look={id:null,lx:0,ly:0}; // 右侧滑动(瞄准)
var touchFire=false;
var weapons={},curWeapon='rifle',muzzle=null;
var enemies=[],bullets=[],props=[];
var score=0,kills=0,wave=1,waveTimer=8,gameOver=false;
var elHp,elAmmo,elWN,elScore,elWave,elHit;
var AMMO={rifle:{mag:9999,magMax:9999,reserve:9999,dmg:120,rate:0.1,spread:0.01,auto:true}, // 无限子弹(不消耗,不换弹)
          pistol:{mag:9999,magMax:9999,reserve:9999,dmg:120,rate:1.5,spread:0.0015,auto:false},
          dagger:{melee:true,mag:0,magMax:0,reserve:0,dmg:10,rate:0.5,spread:0,auto:true}};

var IS_MOBILE=/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)||('ontouchstart' in window);
/* 敌人类型表: 矩阵走廊主题(保安/特勤/特工史密斯) */
var ETYPES={
  grunt:{hp:150,speed:2.2,dmg:10,r:0.9,color:0x5a7a9a,scale:1,shoot:1,shootRate:2.2,shootDmg:8},    // 保安 Guard(手枪, 低血)
  gunner:{hp:480,speed:1.9,dmg:10,r:1.0,color:0x3a3a4a,scale:1,shoot:1,shootRate:1.6,shootDmg:10},   // 特勤 SWAT(步枪, 中血, 推进)
  brute:{hp:2400,speed:1.5,dmg:15,r:1.2,color:0x1a1a1a,scale:1.5,shoot:1,shootRate:1.4,shootDmg:12}, // 特工史密斯 Boss(黑西装, 高血)
  runner:{hp:120,speed:3.6,dmg:10,r:0.8,color:0x8a8a9a,scale:0.9,shoot:1,shootRate:2.4,shootDmg:6},  // 备用(未用)
  tank:{hp:3200,speed:1.1,dmg:18,r:1.8,color:0x3a4a3a,scale:1.6,shoot:1,shootRate:3.0,shootDmg:16,heavy:1}, // 坦克(重甲地面单位, 慢速炮击)
  drone:{hp:220,speed:2.6,dmg:12,r:0.9,color:0x2a4a3a,scale:1,shoot:1,shootRate:1.8,shootDmg:8,fly:1,flyH:3.4} // 无人机(空中单位, 悬停高度3.4)
};
var eBullets=[],combo=0,comboT=0,pickups=[],grenades=[],grenadeCd=0,crates=[],shakeT=0,shakeA=0,waveHealed=false,upgLv=0,ads=false,fxTracers=[],muzzleT=0,playerBullets=[],floaters=[];
function init(){
  var canvas=document.getElementById('game');
  if(IS_MOBILE){document.body.classList.add('mobile');
    var st=document.getElementById('start');if(st)st.textContent='点击开始';}
  renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:false,preserveDrawingBuffer:true});
  renderer.setSize(innerWidth,innerHeight);renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.25)); // 高DPI清晰度(最高1.25x): 平衡性能(1.5x太耗GPU)
  
// HUD canvas 2D overlay
var hudc=document.getElementById('hudc');var hctx=null;
if(hudc){hudc.width=innerWidth;hudc.height=innerHeight;hctx=hudc.getContext('2d');}
function drawHud(){
  if(!hctx||!hudc)return;
  if((window._hudF=(window._hudF||0)+1)%10!==0)return;
  hctx.clearRect(0,0,hudc.width,hudc.height);
  hctx.fillStyle='rgba(0,0,0,0.55)';hctx.fillRect(0,hudc.height-70,hudc.width,70);
  hctx.fillStyle='#fff';hctx.font='bold 22px sans-serif';
  hctx.fillText('得分 '+score,20,hudc.height-40);
  hctx.fillText('生命 '+Math.max(0,Math.floor(player.hp)),20,hudc.height-12);
  // 玩家血条
  hctx.fillStyle='rgba(0,0,0,0.6)';hctx.fillRect(20,hudc.height-62,140,10);
  var hpPct=Math.max(0,player.hp/100);
  hctx.fillStyle=hpPct>0.5?'#7dff9a':(hpPct>0.3?'#ffd54f':'#ff4455');
  hctx.fillRect(20,hudc.height-62,140*hpPct,10);
  hctx.fillStyle='#fff';hctx.font='bold 11px sans-serif'; // 血条内数字
  hctx.fillText(Math.max(0,Math.ceil(player.hp))+'/100',24,hudc.height-53);
  hctx.fillStyle='#ffd54f';hctx.font='bold 22px sans-serif';
  hctx.fillText(ammo.mag+' / '+ammo.reserve,hudc.width-220,hudc.height-40);
  hctx.fillText('波次 '+wave,hudc.width-220,hudc.height-12);
  hctx.fillStyle='#8f8';hctx.font='bold 16px sans-serif';
  hctx.fillText('击杀 '+kills,hudc.width-160,20);
  // 任务倒计时(60秒内全灭敌人+夺旗)
  hctx.fillStyle=taskTime<=15?'#ff4455':'#ffd54f';hctx.font='bold 22px sans-serif';
  hctx.textAlign='center';hctx.fillText('⏱ '+Math.max(0,Math.ceil(taskTime))+'s',hudc.width/2,30);hctx.textAlign='left';
  // Boss血条(屏幕顶部)
  var boss=null;for(var bi=0;bi<enemies.length;bi++){if(enemies[bi].type==='brute'&&enemies[bi].scale&&enemies[bi].scale>1&&enemies[bi].hp>0){boss=enemies[bi];break;}}
  var bb=document.getElementById('bossbar'),bh=document.getElementById('bosshp');
  if(bb&&bh){if(boss){bb.style.display='block';bh.style.width=(Math.max(0,boss.hp/boss.max*100))+'%';}else bb.style.display='none';}
  // 手雷冷却提示
  var gnd=document.getElementById('gnd');
  if(gnd)gnd.textContent=grenadeCd>0?('冷却 '+grenadeCd.toFixed(1)+'s'):'待发';
  // 敌人血条(投影到屏幕, 受击反馈) — 按类型加宽/调高(坦克重甲醒目大血条)
  for(var ei=0;ei<enemies.length;ei++){var e=enemies[ei];if(e.hp<=0||!e.obj)continue;
    var barY=e.type==='tank'?3.2:(e.type==='drone'?4.2:2.4); // 坦克头顶上方/无人机悬停高度, 其余躯体
    var v=new THREE.Vector3(e.x,barY,e.z).project(camera);
    if(v.z>1||v.z<-1)continue;
    var sx=(v.x*0.5+0.5)*hudc.width,sy=(-v.y*0.5+0.5)*hudc.height;
    if(sx<-60||sx>hudc.width+60||sy<0||sy>hudc.height)continue;
    var w=e.type==='tank'?70:(e.type==='drone'?50:44),h=e.type==='tank'?7:5;
    hctx.fillStyle='rgba(0,0,0,0.65)';hctx.fillRect(sx-w/2,sy,w,h);
    var pct=Math.max(0,e.hp/e.max);
    hctx.fillStyle=e.type==='tank'?'#f93':(e.type==='brute'?'#5f5':(e.type==='runner'?'#fd5':(e.type==='gunner'?'#c7f':'#f55')));
    hctx.fillRect(sx-w/2,sy,w*pct,h);
    hctx.strokeStyle='rgba(255,255,255,0.35)';hctx.strokeRect(sx-w/2,sy,w,h);
  }
  // 连杀提示
  if(combo>=2&&comboT>0){hctx.fillStyle='#ffd54f';hctx.font='bold 26px sans-serif';
    hctx.fillText('连杀 x'+combo,hudc.width/2-70,hudc.height-150);
    hctx.fillStyle='rgba(0,0,0,0.6)';hctx.fillRect(hudc.width/2-70,hudc.height-140,140,6); // 连杀时间条
    hctx.fillStyle='#ffd54f';hctx.fillRect(hudc.width/2-70,hudc.height-140,140*(comboT/3),6);}
  // 击杀飘字(命中点 +pts 上浮淡出)
  for(var fi=0;fi<floaters.length;fi++){var f=floaters[fi];
    var v=new THREE.Vector3(f.x,f.y+f.lift*0.8,f.z).project(camera);
    if(v.z>1||v.z<-1)continue;
    var fx2=(v.x*0.5+0.5)*hudc.width,fy2=(-v.y*0.5+0.5)*hudc.height-f.lift;
    hctx.globalAlpha=Math.max(0,1-f.lift/60);
    hctx.fillStyle=f.c;hctx.font='bold '+(16+f.lift*0.25)+'px sans-serif';
    hctx.fillText(f.txt,fx2-24,fy2);hctx.globalAlpha=1;}
  // 低血量红边警示(hp<30脉动)
  if(player.hp<30&&player.hp>0){var rp=0.25+0.15*Math.sin(performance.now()*0.008);
    hctx.fillStyle='rgba(255,30,30,'+rp+')';hctx.fillRect(0,0,hudc.width,10);
    hctx.fillRect(0,hudc.height-10,hudc.width,10);hctx.fillRect(0,0,10,hudc.height);hctx.fillRect(hudc.width-10,0,10,hudc.height);}
}
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap; // PCFSoft阴影(柔化边缘, 暖色电影感)
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=0.98; // 电影感: 暖色战区提亮(微提, 电影通透)
  // WebGL上下文丢失恢复(否则context lost后永久黑屏)
  canvas.addEventListener('webglcontextlost',function(e){e.preventDefault();
    console.warn('WebGL上下文丢失, 尝试恢复');});
  canvas.addEventListener('webglcontextrestored',function(){console.log('WebGL上下文已恢复');});
  scene=new THREE.Scene();scene.background=new THREE.Color(0x8fb0d2); // 白天天空(微深蓝, 与暖雾冷暖对比)
  var grid=new THREE.GridHelper(56,28,0x6a7a8a,0x3a4a5a);grid.position.y=0.02;scene.add(grid);grid.visible=false; // 移除蓝灰编辑器网格(暖色战区)
  scene.fog=new THREE.Fog(0xc2b09a,20,72); // 暖尘薄雾(近暖偏尘 + 冷天空背景 → 近暖远冷, 电影空气透视)
  camera=new THREE.PerspectiveCamera(75,innerWidth/innerHeight,0.05,200);
  clock=new THREE.Clock();raycaster=new THREE.Raycaster();
  // 灯光(矩阵风: 深暗环境+强烈绿光源, 高对比电影感)
  scene.add(new THREE.AmbientLight(0xb0c0d0,0.42)); // 白天环境光(压暗, 提升对比)
  scene.add(new THREE.HemisphereLight(0xbcd2e6,0x8a7a5a,0.6)); // 白天半球光(天空蓝/暖沙土地面反照)
  var sun=new THREE.DirectionalLight(0xffe2b8,2.4);sun.position.set(22,20,-18); // 白天烈日(暖色斜射长投影)
  sun.castShadow=true;sun.shadow.mapSize.set(1024,1024); // 阴影贴图1024(柔化, 电影质感)
  sun.shadow.bias=-0.0004;
  Object.assign(sun.shadow.camera,{left:-28,right:28,top:28,bottom:-28});scene.add(sun); // 阴影范围随地图扩大52×52(±16→±28)
  var p1=new THREE.PointLight(0xffc080,0.7,40);p1.position.set(0,5,-12);scene.add(p1); // 白天暖补光(弱化)
  var p2=new THREE.PointLight(0x9fb8d8,0.5,40);p2.position.set(0,5,10);scene.add(p2); // 白天冷补光(弱化)
  // HUD
  elHp=document.getElementById('hp');elAmmo=document.getElementById('ammo');
  elWN=document.getElementById('wn');elScore=document.getElementById('score');elWave=document.getElementById('wave');
  elHit=document.getElementById('hit');
  bindInput();
  // 加载超时兜底: 6秒内没加载完也强制开始(用程序化几何体), 杜绝黑屏
  var started=false;
  function begin(){if(started)return;started=true;buildMap();buildFlag();setupWeapons();initParticles();animate();msg('撤离! 击败守卫, 抵达撤离点直升机!');startGame();}
  loadAssets(function(){begin();});
  setTimeout(begin,6000);
}

/* ===== SVG贴图 → three.js纹理 ===== */
function svgTex(name,rep){
  if(texCache[name])return texCache[name];
  var img=new Image(),tex=new THREE.Texture();
  img.onload=function(){tex.image=img;tex.needsUpdate=true;};
  img.src='textures/'+name+'.svg';
  tex.wrapS=tex.wrapT=THREE.RepeatWrapping;
  if(rep)tex.repeat.set(rep,rep);
  texCache[name]=tex;return tex;
}
/* ===== 资产加载(glb) ===== */
function loadAssets(cb){
  var loader=new THREE.GLTFLoader();
  var names=['rifle','pistol','enemy','crate','barrel','wall','cover','ground','muzzle'];
  var done=0;
  names.forEach(function(n){
    loader.load('models/'+n+'.glb',function(gl){
      // 法线/切线修复: 确保法线归一化, 切线由three重算(glTF导出的TANGENT可能未归一化)
      gl.scene.traverse(function(m){if(m.isMesh){
        var geo=m.geometry;
        if(geo.attributes.normal){var na=geo.attributes.normal;
          for(var k=0;k<na.count;k++){var v=new THREE.Vector3().fromBufferAttribute(na,k).normalize();
            na.setXYZ(k,v.x,v.y,v.z);}
          na.needsUpdate=true;}
        if(geo.attributes.tangent)delete geo.attributes.tangent; // 删旧的, 用three重算
      }});
      models[n]=gl.scene;done++;if(done===names.length)cb();},
      undefined,function(){console.warn('模型加载失败:'+n);done++;if(done===names.length)cb();});
  });
}
/* 实例化 */
/* 统一原点: 地面模型原点=底部中心(放置点=地面位置), ground旋转成水平 */
var GROUND_SET={crate:1,wall:1,barrel:1,cover:1,ground:1};
function place(name,x,y,z,scale,ry){
  var src=models[name];if(!src)return null;
  var o=src.clone(true);
  if(name==='ground')o.rotation.x=-Math.PI/2; /* glTF竖直→水平地面 */
  o.position.set(x,y,z);
  if(scale)o.scale.set(scale,scale,scale);
  if(ry)o.rotation.y=ry;
  if(GROUND_SET[name]){ /* 底部中心对齐放置点: 模型不沉地/不偏移 */
    o.updateMatrixWorld(true);
    var b=new THREE.Box3().setFromObject(o);
    var cx=(b.min.x+b.max.x)/2,cz=(b.min.z+b.max.z)/2;
    o.position.x+=x-cx;o.position.z+=z-cz;o.position.y+=y-b.min.y;
  }
  o.traverse(function(m){if(m.isMesh){m.castShadow=false;m.receiveShadow=true;}}); // 墙/地面/静态GLB不投影(性能: 阴影pass只渲染关键物体)
  scene.add(o);return o;
}
/* 贴图到模型所有mesh */
function texAll(obj,name,rep){
  var t=svgTex(name,rep);
  obj.traverse(function(m){if(m.isMesh){m.material=m.material.clone();m.material.map=t;
    m.material.color=new THREE.Color(name==='ground'?0xd0bfa0:0x8a8a8a); // 地面暖尘土反照(乘在贴图上), 其他压暗
    m.material.roughness=name==='ground'?0.35:0.7; // 地面更光滑(反光), 墙粗糙
    m.material.metalness=name==='ground'?0.55:0.15; // 地面金属反光
    m.material.needsUpdate=true;}});
}

/* ===== 地图搭建(自定义关卡) ===== */

/* ===== 高端场景辅助: 程序化建筑/霓虹/灯光(电影氛围, 通用设计语言, 不复制受版权元素) ===== */
function addBox(x,y,z,w,h,d,color,opts){
  opts=opts||{};
  var m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),
    new THREE.MeshStandardMaterial({color:color,roughness:opts.rough!==undefined?opts.rough:0.75,
      metalness:opts.metal!==undefined?opts.metal:0.25}));
  m.position.set(x,y,z);
  if(opts.ry)m.rotation.y=opts.ry;
  m.castShadow=true;m.receiveShadow=true;scene.add(m);
  if(opts.collide)props.push({x:x,z:z,type:'wall',rotY:opts.ry||0,hw:opts.hw!==undefined?opts.hw:w/2,hd:opts.hd!==undefined?opts.hd:d/2,h:h});
  return m;
}
function addNeon(x,y,z,w,h,d,color,opts){ /* 霓虹发光体 */
  opts=opts||{};
  var m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),
    new THREE.MeshStandardMaterial({color:color,emissive:color,
      emissiveIntensity:opts.ei!==undefined?opts.ei:1.4,metalness:0.1,roughness:0.4}));
  m.position.set(x,y,z);
  if(opts.ry)m.rotation.y=opts.ry;
  scene.add(m);return m;
}
function addLamp(x,y,z,color,intensity,dist){ /* 霓虹点光源 */
  var l=new THREE.PointLight(color,intensity||1.2,dist||18);
  l.position.set(x,y,z);scene.add(l);return l;
}
function addCyl(x,y,z,r,h,color,opts){ /* 圆柱(塔柱/管线) */
  opts=opts||{};
  var m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,opts.seg||14),
    new THREE.MeshStandardMaterial({color:color,roughness:opts.rough!==undefined?opts.rough:0.6,
      metalness:opts.metal!==undefined?opts.metal:0.5,
      emissive:opts.emissive||0x000000,emissiveIntensity:opts.ei||1}));
  m.position.set(x,y,z);
  if(opts.rotX)m.rotation.x=opts.rotX;
  if(opts.rotZ)m.rotation.z=opts.rotZ;
  m.castShadow=true;m.receiveShadow=true;scene.add(m);return m;
}
/* 走廊尽头绿色出口门: 击败头目(特工史密斯)后开启, 抵达出口获胜 */
var flag={x:0,z:-16,taken:false,won:false,ready:false,mesh:null,cloth:null,glow:null};
var taskTime=60,taskOver=false; // 任务限时60秒(击败头目+抵达出口)
function buildFlag(){
  var g=new THREE.Group();
  // 门框(深色金属)
  var frame=new THREE.Mesh(new THREE.BoxGeometry(3.0,3.0,0.3),
    new THREE.MeshStandardMaterial({color:0x1a2a20,metalness:0.6,roughness:0.4}));
  frame.position.y=1.5;g.add(frame);
  // 门面板(绿色发光, 头目死后高亮)
  var panel=new THREE.Mesh(new THREE.BoxGeometry(2.3,2.5,0.12),
    new THREE.MeshStandardMaterial({color:0x0a3a22,emissive:0x00ff88,emissiveIntensity:0.25,roughness:0.3,metalness:0.2}));
  panel.position.set(0,1.45,0.1);g.add(panel);
  // 门上"EXIT"绿字(发光)
  var exitMat=new THREE.MeshBasicMaterial({color:0x66ffaa});
  var exitTxt=new THREE.Mesh(new THREE.BoxGeometry(1.7,0.32,0.05),exitMat);
  exitTxt.position.set(0,2.5,0.14);g.add(exitTxt);
  // 侧边绿色霓虹条
  var barL=new THREE.Mesh(new THREE.BoxGeometry(0.12,3.0,0.16),
    new THREE.MeshStandardMaterial({color:0x00ff88,emissive:0x00ff88,emissiveIntensity:1.4}));
  barL.position.set(-1.45,1.5,0.12);g.add(barL);
  var barR=barL.clone();barR.position.x=1.45;g.add(barR);
  g.position.set(0,0,-16.3);scene.add(g);
  flag.mesh=g;flag.glow=panel;
  // 出口触发光圈(地面, 抵达提示)
  var ring=new THREE.Mesh(new THREE.RingGeometry(1.1,1.35,28),
    new THREE.MeshBasicMaterial({color:0x00ff88,transparent:true,opacity:0.35,side:THREE.DoubleSide}));
  ring.rotation.x=-Math.PI/2;ring.position.y=0.05;ring.position.z=-16;scene.add(ring);flag.ring=ring;
}
function updateFlag(dt){
  if(gameOver)return; // 防同帧 doLose 后仍触发 doWin(矛盾文案)
  if(flag.ring){flag.ring.material.opacity=(flag.ready?0.5:0.2)+Math.sin(performance.now()*0.004)*0.12; // 光圈呼吸(开启后更亮)
    flag.ring.rotation.z+=dt*0.5;}
  if(flag.glow){flag.glow.material.emissiveIntensity=flag.ready?1.6:0.25; // 头目死后门点亮
    flag.glow.material.color.set(flag.ready?0x1aff9a:0x0a3a22);}
  if(flag.won||flag.taken)return;
  if(flag.ready&&enemies.length===0){ // 头目已死+无残留 → 抵达出口获胜
    var dd=Math.sqrt((player.x-flag.x)*(player.x-flag.x)+(player.z-flag.z)*(player.z-flag.z));
    if(dd<1.7){flag.taken=true;flag.won=true;doWin();}
  }
}
function doWin(){
  if(gameOver&&!flag.won)return; // 防同帧 doLose 已触发: 不覆盖失败
  gameOver=true;mouseDown=false;
  if(flag.mesh)flag.mesh.visible=false;if(flag.ring)flag.ring.visible=false;
  sfx('boss');sfx('win');shake(0.08,0.3); // 胜利: 保留Boss低音+上行胜利琶音
  if(elHit){elHit.textContent='✅ 撤离成功! 击杀 '+kills+' · 用时 '+Math.max(0,Math.ceil(60-taskTime))+'s';elHit.classList.add('on');elHit.classList.add('kill');
    setTimeout(function(){elHit.classList.remove('on');elHit.classList.remove('kill');},2500);}
  setTimeout(function(){location.reload();},2500); // 胜利后自动重开(可重玩)
}
function doLose(){ // 60秒未抵达出口: 任务失败
  if(gameOver)return; // 防同帧重复触发
  gameOver=true;mouseDown=false;sfx('crate');sfx('lose');shake(0.1,0.35); // 失败: 保留木箱音+下行低音
  if(elHit){elHit.textContent='⏰ 任务失败! 未在60秒内撤离';elHit.classList.add('on');elHit.classList.add('kill');
    setTimeout(function(){elHit.classList.remove('on');elHit.classList.remove('kill');},2500);}
  setTimeout(function(){location.reload();},2500); // 失败后自动重开
}
/* ===== 程序化贴图工厂(Canvas生成, 零付费): 去纯色塑料感 ===== */
function cssColor(c){return '#'+('000000'+c.toString(16)).slice(-6);}
function makeTex(w,h,draw,rep){
  var cv=document.createElement('canvas');cv.width=w;cv.height=h;
  var ctx=cv.getContext('2d');draw(ctx,w,h);
  var t=new THREE.CanvasTexture(cv);
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  if(rep)t.repeat.set(rep,rep);
  t.anisotropy=4;return t;
}
function speckle(ctx,w,h,base,n,amp){ // 噪点颗粒(基色+随机明暗)
  ctx.fillStyle=base;ctx.fillRect(0,0,w,h);
  for(var i=0;i<n;i++){var g=Math.floor(Math.random()*amp);
    ctx.fillStyle='rgba('+g+','+g+','+g+',0.28)';
    ctx.fillRect(Math.random()*w,Math.random()*h,Math.random()*2+1,Math.random()*2+1);}
}
function texContainer(base){ // 波纹金属板(集装箱: 铆钉+多层锈斑+锈水垂痕)
  return makeTex(128,128,function(ctx,w,h){
    speckle(ctx,w,h,cssColor(base),150,100);
    for(var x=0;x<w;x+=16){var g=ctx.createLinearGradient(x,0,x+16,0);
      g.addColorStop(0,'rgba(0,0,0,0.42)');g.addColorStop(0.5,'rgba(255,255,255,0.22)');g.addColorStop(1,'rgba(0,0,0,0.42)');
      ctx.fillStyle=g;ctx.fillRect(x,0,16,h);}
    // 顶部锈水垂痕(上浓下淡)
    for(var s=0;s<7;s++){var sx=Math.random()*w;
      var sg=ctx.createLinearGradient(0,0,0,h*0.6);
      sg.addColorStop(0,'rgba(90,45,20,0.5)');sg.addColorStop(1,'rgba(90,45,20,0)');
      ctx.fillStyle=sg;ctx.fillRect(sx,0,Math.random()*4+1.5,h*0.6);}
    // 多层锈斑(暗红褐/橙褐随机分布)
    for(var r=0;r<22;r++){var rx=Math.random()*w,ry=Math.random()*h,rr=Math.random()*7+2;
      var rg2=ctx.createRadialGradient(rx,ry,0,rx,ry,rr);
      rg2.addColorStop(0,'rgba('+(130+(Math.random()*40|0))+','+(55+(Math.random()*25|0))+',25,0.55)');
      rg2.addColorStop(1,'rgba(90,45,20,0)');
      ctx.fillStyle=rg2;ctx.beginPath();ctx.arc(rx,ry,rr,0,6.28);ctx.fill();}
    // 铆钉(沿板缝, 带高光点)
    for(var ry2=8;ry2<h;ry2+=24)for(var rx2=8;rx2<w;rx2+=16){
      ctx.fillStyle='rgba(20,20,20,0.5)';ctx.beginPath();ctx.arc(rx2,ry2,1.7,0,6.28);ctx.fill();
      ctx.fillStyle='rgba(255,255,255,0.18)';ctx.beginPath();ctx.arc(rx2-0.4,ry2-0.4,0.7,0,6.28);ctx.fill();}
  },1);
}
function texConcrete(base){ // 混凝土掩体(颗粒+多条裂纹+霉斑青苔)
  return makeTex(128,128,function(ctx,w,h){
    speckle(ctx,w,h,cssColor(base),210,120);
    ctx.strokeStyle='rgba(0,0,0,0.4)';ctx.lineWidth=1;
    for(var c=0;c<3;c++){var cx=Math.random()*w,cy=Math.random()*h;
      ctx.beginPath();ctx.moveTo(cx,cy);
      for(var k=0;k<4;k++){cx+=Math.random()*40-20;cy+=Math.random()*30-15;ctx.lineTo(cx,cy);}
      ctx.stroke();}
    for(var m=0;m<12;m++){var mx=Math.random()*w,my=Math.random()*h,mr=Math.random()*6+2;
      var mg=ctx.createRadialGradient(mx,my,0,mx,my,mr);
      mg.addColorStop(0,'rgba(40,62,42,0.4)');mg.addColorStop(1,'rgba(40,62,42,0)');
      ctx.fillStyle=mg;ctx.beginPath();ctx.arc(mx,my,mr,0,6.28);ctx.fill();}
  },1);
}
function texSandbag(){ // 麻布沙袋(布料起伏: 经纬编织+斜向明暗+缝线)
  return makeTex(128,128,function(ctx,w,h){
    speckle(ctx,w,h,'#7a6b4d',250,130);
    ctx.strokeStyle='rgba(60,45,25,0.32)';ctx.lineWidth=1;
    for(var y=4;y<h;y+=6){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
    for(var x=4;x<w;x+=6){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();}
    for(var b=0;b<5;b++){var bx=Math.random()*w;
      var bg=ctx.createLinearGradient(bx,0,bx+24,h);
      bg.addColorStop(0,'rgba(255,255,255,0.10)');bg.addColorStop(0.5,'rgba(0,0,0,0.14)');bg.addColorStop(1,'rgba(255,255,255,0.06)');
      ctx.fillStyle=bg;ctx.fillRect(bx,0,24,h);}
    ctx.strokeStyle='rgba(45,32,18,0.6)';ctx.lineWidth=2;
    for(var y2=16;y2<h;y2+=24){ctx.beginPath();ctx.moveTo(0,y2);ctx.lineTo(w,y2);ctx.stroke();}
  },1);
}
function texHull(base){ // 战车金属(装甲板高光+烧焦渐变+划痕+铆钉)
  return makeTex(128,128,function(ctx,w,h){
    speckle(ctx,w,h,cssColor(base),180,110);
    // 装甲板高光(横向反光带)
    var hg=ctx.createLinearGradient(0,h*0.2,0,h*0.5);
    hg.addColorStop(0,'rgba(255,255,255,0.16)');hg.addColorStop(0.5,'rgba(255,255,255,0.02)');hg.addColorStop(1,'rgba(0,0,0,0.1)');
    ctx.fillStyle=hg;ctx.fillRect(0,h*0.2,w,h*0.3);
    ctx.fillStyle='rgba(255,255,255,0.14)'; // 划痕
    for(var i=0;i<7;i++)ctx.fillRect(Math.random()*w,Math.random()*h,Math.random()*18+4,1);
    // 烧焦渐变(底部黑烟)
    var sg=ctx.createLinearGradient(0,h*0.55,0,h);
    sg.addColorStop(0,'rgba(0,0,0,0)');sg.addColorStop(1,'rgba(10,8,6,0.55)');
    ctx.fillStyle=sg;ctx.fillRect(0,0,w,h);
    ctx.fillStyle='rgba(0,0,0,0.45)'; // 铆钉
    for(var y=10;y<h;y+=24)for(var x=10;x<w;x+=24){ctx.beginPath();ctx.arc(x,y,1.6,0,6.28);ctx.fill();}
  },1);
}
function texRoad(){ // 水泥路面(颗粒+车辙)
  return makeTex(128,128,function(ctx,w,h){
    speckle(ctx,w,h,'#c8c4b4',200,90);
    ctx.fillStyle='rgba(0,0,0,0.15)'; // 车辙
    ctx.fillRect(w*0.3,0,w*0.1,h);ctx.fillRect(w*0.6,0,w*0.1,h);
  },1);
}
function texDebris(){ // 碎砖瓦砾(破裂混凝土)
  return makeTex(64,64,function(ctx,w,h){
    speckle(ctx,w,h,'#7a7a70',140,100);
    ctx.strokeStyle='rgba(0,0,0,0.4)';ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(0,h*0.5);ctx.lineTo(w*0.5,h*0.3);ctx.lineTo(w,h*0.6);ctx.stroke();
  },1);
}
function buildMap(){
  var g=place('ground',0,0,0);if(g){g.scale.set(1.4,1.4,1.4);texAll(g,'ground',16);} // 地面随地图扩大52×52: scale×1.4, 平铺12→16
  // ===== 室外战区 · 撤离战术区 =====
  // 外围混凝土墙(战区边界, 4面, 保留碰撞)
  for(var i=-24;i<=24;i+=8){addWall(-26,i,1);addWall(26,i,1);} // 外围混凝土墙: 边界扩大 x±19→±26
  addWall(-4,26,0);addWall(4,26,0);   // 南端(两段重叠覆盖中央, 无隐形缝) 边界 z±20→±26
  addWall(-4,-26,0);addWall(4,-26,0); // 北端(撤离点, 两段重叠覆盖中央) 边界 z±20→±26
  // 集装箱群(锈橙/军绿, 掩体通道) — 程序化Box, 加入碰撞
  [[-12,4,0.15],[ -4,-2,-0.1],[5,6,0.3],[12,-3,0.2],[-6,14,0.4],[9,16,-0.25]].forEach(function(c,i){
    var ct=texContainer(i%2?0x3a5a4a:0x8a5a2a);
    var mat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:0.55,metalness:0.45});mat.map=ct;mat.bumpMap=ct;mat.bumpScale=0.03;mat.needsUpdate=true; // 波纹金属板+铆钉/锈斑(凹凸感)
    var m=new THREE.Mesh(new THREE.BoxGeometry(6,4.8,3),mat);
    m.position.set(c[0],2.4,c[1]);m.rotation.y=c[2];m.castShadow=true;m.receiveShadow=true;
    scene.add(m);
    props.push({x:c[0],z:c[1],r:2.2,type:'container',h:4.8});
  });
  // 堆叠二层集装箱(视觉层次, 不碰撞)
  [[-12,4.6,0.15],[5,6.5,0.3]].forEach(function(c,i){
    var ct=texContainer(0x3a5a4a);
    var mat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:0.55,metalness:0.45});mat.map=ct;mat.bumpMap=ct;mat.bumpScale=0.03;mat.needsUpdate=true; // 波纹金属板+铆钉/锈斑(凹凸感)
    var m=new THREE.Mesh(new THREE.BoxGeometry(6,4.4,3),mat);
    m.position.set(c[0],7.0,c[1]);m.rotation.y=c[2];m.castShadow=true;scene.add(m);
  });
  // 混凝土掩体(推进路线, 碰撞)
  [[-8,0,0.2],[8,10,0.5],[-8,12,-0.3],[8,22,0.4],[0,18,0.1],[-6,26,0.6],[6,30,-0.2]].forEach(function(c,i){
    var ct=texConcrete(i%2?0x55554f:0x3a3a36);
    var mat=new THREE.MeshStandardMaterial({color:0xffffff,roughness:0.85,metalness:0.05});mat.map=ct;mat.bumpMap=ct;mat.bumpScale=0.04;mat.needsUpdate=true; // 混凝土颗粒+裂纹/霉斑(凹凸感)
    var m=new THREE.Mesh(new THREE.BoxGeometry(2.4,1.2,1.0),mat);
    m.position.set(c[0],0.6,c[1]);m.rotation.y=c[2];m.castShadow=true;m.receiveShadow=true;
    scene.add(m);
    props.push({x:c[0],z:c[1],r:0.85,type:'cover',h:1.2});
  });
  // 沙袋堆(低掩体, 不挡射线)
  [[-2,4],[4,14],[-3,22]].forEach(function(c){
    var st=texSandbag();
    var sm=new THREE.MeshStandardMaterial({color:0xffffff,roughness:0.92,metalness:0.02});sm.map=st;sm.bumpMap=st;sm.bumpScale=0.05;sm.needsUpdate=true; // 麻布沙袋(布料起伏, 凹凸感)
    var m=new THREE.Mesh(new THREE.BoxGeometry(1.8,0.9,0.9),sm);
    m.position.set(c[0],0.45,c[1]);m.rotation.y=c[0]*0.1;m.castShadow=true;scene.add(m);
    props.push({x:c[0],z:c[1],r:0.7,type:'cover',h:0.9});
  });
  // 废弃战车残骸(碰撞)
  [[-14,10,0.5],[12,26,-0.4],[0,-6,1.2]].forEach(function(w,i){
    var g2=new THREE.Group();
    var th=texHull(0x3a3a36);
    var tb=new THREE.MeshStandardMaterial({color:0xffffff,roughness:0.55,metalness:0.5});tb.map=th;tb.bumpMap=th;tb.bumpScale=0.03;tb.needsUpdate=true; // 战车装甲板高光+烧焦(凹凸感)
    var body=new THREE.Mesh(new THREE.BoxGeometry(2.2,1.0,4.4),tb);body.position.y=0.8;body.castShadow=true;g2.add(body);
    var th2=texHull(0x565650);
    var tc=new THREE.MeshStandardMaterial({color:0xffffff,roughness:0.5,metalness:0.5});tc.map=th2;tc.bumpMap=th2;tc.bumpScale=0.03;tc.needsUpdate=true; // 战车装甲板高光+烧焦(凹凸感)
    var cab=new THREE.Mesh(new THREE.BoxGeometry(1.8,0.9,1.6),tc);cab.position.set(0,1.5,-0.6);cab.castShadow=true;g2.add(cab);
    g2.position.set(w[0],0,w[1]);if(w[2])g2.rotation.y=w[2];scene.add(g2);
    props.push({x:w[0],z:w[1],r:1.9,type:'cover',h:2.4});
  });
  // 红色信号弹(撤离点视觉, 撤离点在北端 flag 附近)
  [[0,-14]].forEach(function(f){
    var pole=new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.06,3.0,8),
      new THREE.MeshStandardMaterial({color:0x2a2a2a}));
    pole.position.set(f[0],1.5,f[1]);scene.add(pole);
    var flare=new THREE.Mesh(new THREE.SphereGeometry(0.18,10,8),
      new THREE.MeshStandardMaterial({color:0xff3020,emissive:0xff3020,emissiveIntensity:3.6}));
    flare.position.set(f[0],3.2,f[1]);scene.add(flare);
    var fl=new THREE.PointLight(0xff5028,1.6,45);fl.position.set(f[0],3.2,f[1]);scene.add(fl); // 白天信号弹暖光
  });
  // 铁丝网围栏柱(战区边界视觉)
  [[-19,-8],[-19,8],[19,-8],[19,8],[-8,20],[8,20]].forEach(function(w){
    var post=new THREE.Mesh(new THREE.CylinderGeometry(0.08,0.08,3,6),
      new THREE.MeshStandardMaterial({color:0x3a3a38,metalness:0.6}));
    post.position.set(w[0],1.5,w[1]);scene.add(post);
  });
  // 地面道路(浅色水泥, 引导视线到撤离点)
  var road=new THREE.Mesh(new THREE.BoxGeometry(3,0.04,36),
    new THREE.MeshStandardMaterial({color:0x9a9a8a,roughness:0.6,metalness:0.1,map:texRoad()})); // 水泥路面贴图
  road.position.set(0,0.02,0);road.receiveShadow=true;scene.add(road);
  // 地面碎砖瓦砾(装饰)
  [[-4,8],[4,-4],[-8,-8],[8,10],[-2,-12]].forEach(function(c){
    var m=new THREE.Mesh(new THREE.BoxGeometry(0.6,0.08,0.5),
      new THREE.MeshStandardMaterial({color:0x3a3a34,roughness:0.9,map:texDebris(),metalness:0.05})); // 碎砖瓦砾贴图
    m.position.set(c[0],0.04,c[1]);m.rotation.y=c[0]*0.5;scene.add(m);
  });
  // ===== 扩展战区: 侧翼废弃营地/撤离直升机/边界路灯 (纯程序化, 不引外部文件) =====
  buildExtras();
  buildTechProps();
}
/* ===== 扩展战区辅助: 侧翼营地/撤离直升机/路灯 (程序化Box/Cylinder/Cone组合, 不引外部文件, 风格统一) ===== */
function mkM(geo,mat,x,y,z,ry,rz){ // 网格创建+入场景(金属/布料/木风格)
  var m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);
  if(ry)m.rotation.y=ry;if(rz)m.rotation.z=rz;
  m.castShadow=true;m.receiveShadow=true;scene.add(m);return m;
}
function buildExtras(){
  // 统一材质工厂(金属0.1-0.5金属性, 布料/木低金属)
  var matMetal=function(c){return new THREE.MeshStandardMaterial({color:c,roughness:0.6,metalness:0.5});};
  var matCloth=function(c){return new THREE.MeshStandardMaterial({color:c,roughness:0.9,metalness:0.05});};
  var matWood=function(c){return new THREE.MeshStandardMaterial({color:c,roughness:0.85,metalness:0.1});};
  var matBarrel=function(c){return new THREE.MeshStandardMaterial({color:c,roughness:0.7,metalness:0.4});};
  function tent(x,z){ // 低多边形锥体帐篷(高掩体, 仅侧翼)
    mkM(new THREE.ConeGeometry(2.6,2.6,6),matCloth(0x6a5a3a),x,1.3,z,Math.random()*0.4);
    props.push({x:x,z:z,r:2.0,type:'cover',h:2.6}); // 高掩体(侧翼, 不挡中央走廊射线)
  }
  function ammoStack(x,z){ // 弹药箱堆(高掩体)
    mkM(new THREE.BoxGeometry(1.2,0.8,0.9),matMetal(0x4a5a3a),x,0.4,z,0.2);
    mkM(new THREE.BoxGeometry(0.9,0.8,0.7),matMetal(0x4a5a3a),x+0.9,1.15,z+0.2,-0.3);
    props.push({x:x,z:z,r:0.9,type:'cover',h:1.6});
  }
  function oilbarrels(x,z){ // 油桶群(低矮0.9, 不挡射线)
    [[0,0],[0.9,0.5]].forEach(function(o,i){
      mkM(new THREE.CylinderGeometry(0.35,0.4,0.9,10),matBarrel(0x5a4a2a),x+o[0],0.45,z+o[1],i*0.4);
    });
    props.push({x:x+0.45,z:z+0.25,r:0.9,type:'cover',h:0.9}); // 低矮(<1.4): 视线可越过, 不挡射线
  }
  function roadblock(x,z){ // 黄黑路障(低矮1.0, 不挡射线)
    mkM(new THREE.BoxGeometry(1.8,0.35,0.2),new THREE.MeshStandardMaterial({color:0xe8c020,roughness:0.6,metalness:0.3}),x,0.8,z,0.2);
    mkM(new THREE.CylinderGeometry(0.06,0.06,0.8,6),matMetal(0x2a2a2a),x+0.7,0.4,z,0,-0.2);
    props.push({x:x,z:z,r:0.9,type:'cover',h:1.0});
  }
  function junkcar(x,z,ry){ // 废弃车辆(Box组合, 战车风格)
    var g4=new THREE.Group();
    var body=new THREE.Mesh(new THREE.BoxGeometry(2.2,1.0,4.4),matMetal(0x30302e));body.position.y=0.8;body.castShadow=true;g4.add(body);
    var cab=new THREE.Mesh(new THREE.BoxGeometry(1.8,0.9,1.6),matMetal(0x4a4a48));cab.position.set(0,1.5,-0.6);cab.castShadow=true;g4.add(cab);
    g4.position.set(x,0,z);g4.rotation.y=ry||0;scene.add(g4);
    props.push({x:x,z:z,r:1.9,type:'cover',h:2.4});
  }
  function sigtower(x,z){ // 信号塔(细高柱+横臂, 纯视觉)
    mkM(new THREE.CylinderGeometry(0.12,0.18,6,8),matMetal(0x3a3a38),x,3,z);
    mkM(new THREE.BoxGeometry(2.4,0.12,0.14),matMetal(0x3a3a38),x,5.2,z);
    mkM(new THREE.BoxGeometry(0.35,0.35,0.35),new THREE.MeshStandardMaterial({color:0xff4030,emissive:0xff4030,emissiveIntensity:1.2}),x-0.9,5.2,z);
  }
  function sandbags(x,z){ // 低矮沙袋防线(不挡射线)
    mkM(new THREE.BoxGeometry(1.8,0.9,0.9),matCloth(0x3a352c),x,0.45,z,x*0.05);
    props.push({x:x,z:z,r:0.7,type:'cover',h:0.9});
  }
  function cargo(x,z){ // 散落货物(低矮, 无碰撞)
    mkM(new THREE.BoxGeometry(1.0,0.7,0.8),matWood(0x4a5a3a),x,0.35,z,0.4);
  }
  // —— 西翼废弃营地 (x<-6, 避开中央走廊 x∈[-4,4]) ——
  tent(-17,14);ammoStack(-15,6);oilbarrels(-20,18);roadblock(-13,-8);
  junkcar(-16,-4,0.5);sigtower(-20,8);sandbags(-12,0);cargo(-19,20);
  // —— 东翼废弃营地 (x>6, 避开中央走廊 x∈[-4,4]) ——
  tent(17,14);ammoStack(15,6);oilbarrels(20,18);roadblock(13,-8);
  junkcar(16,-4,-0.4);sigtower(20,8);sandbags(12,0);cargo(19,20);
  // —— 撤离点(北端 z≈-16 侧方, 不挡出口/走廊) ——
  // 直升机轮廓(机舱+尾梁+主旋翼+滑橇, 深灰0x3a3a3a, 纯视觉装饰, 不挡出口)
  var heli=matMetal(0x3a3a3a);
  var hz=new THREE.Group();
  var fus=new THREE.Mesh(new THREE.CylinderGeometry(0.7,0.9,3.6,10),heli);fus.rotation.z=Math.PI/2;fus.position.y=1.4;fus.castShadow=true;hz.add(fus); // 机舱
  var tail=new THREE.Mesh(new THREE.BoxGeometry(2.6,0.35,0.35),heli);tail.position.set(-2.8,1.9,0);tail.castShadow=true;hz.add(tail); // 尾梁
  var rotor=new THREE.Mesh(new THREE.BoxGeometry(0.12,0.06,7.2),heli);rotor.position.set(0.6,2.9,0);rotor.castShadow=true;hz.add(rotor); // 主旋翼
  var skid=new THREE.Mesh(new THREE.BoxGeometry(3.2,0.12,1.8),heli);skid.position.set(0.4,0.1,0);hz.add(skid); // 滑橇
  hz.position.set(10,0,-19);hz.rotation.y=-0.6;scene.add(hz);
  // 停机坪标识(地面圆环, 纯视觉)
  var padRing=new THREE.Mesh(new THREE.RingGeometry(3.0,3.4,24),new THREE.MeshBasicMaterial({color:0x88ccff,transparent:true,opacity:0.4,side:THREE.DoubleSide}));
  padRing.rotation.x=-Math.PI/2;padRing.position.set(10,0.04,-19);scene.add(padRing);
  // 地勤灯光(撤离点侧翼, 照亮停机坪)
  addLamp(7,4,-17,0x88ccff,0.9,22);addLamp(13,4,-21,0xffaa44,0.9,22);
  // —— 边界路灯(沿墙内侧, 纯视觉) ——
  [[-21,-16],[-21,4],[21,-10],[21,12]].forEach(function(p2){
    mkM(new THREE.CylinderGeometry(0.08,0.12,5,6),matMetal(0x3a3a38),p2[0],2.5,p2[1]);
    mkM(new THREE.BoxGeometry(0.8,0.2,0.5),new THREE.MeshStandardMaterial({color:0xffe0a0,emissive:0xffc060,emissiveIntensity:0.8}),p2[0],5.1,p2[1]);
  });
}
/* ===== 科技感细节道具: 警示灯带/管线/配电柜/探照灯/新集装箱/补给箱/警戒线/发光光晕 (纯视觉, 低矮不挡走廊, ≤25网格) ===== */
var glowSpriteTex=null;
function makeGlowSprite(color,size,op){ // Additive圆形渐变光斑(电影光晕)
  if(!glowSpriteTex){
    var cv=document.createElement('canvas');cv.width=cv.height=64;
    var cx=cv.getContext('2d');var g=cx.createRadialGradient(32,32,0,32,32,32);
    g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(0.3,'rgba(255,255,255,0.5)');g.addColorStop(1,'rgba(255,255,255,0)');
    cx.fillStyle=g;cx.fillRect(0,0,64,64);
    glowSpriteTex=new THREE.CanvasTexture(cv);}
  var sm=new THREE.SpriteMaterial({map:glowSpriteTex,color:color,transparent:true,opacity:op||0.8,blending:THREE.AdditiveBlending,depthWrite:false});
  var sp=new THREE.Sprite(sm);sp.scale.set(size,size,1);return sp;
}
function buildTechProps(){
  var warmA=0xffa040,cyan=0x40c8ff,green=0x40ff88;
  var matMetal=function(c){return new THREE.MeshStandardMaterial({color:c,roughness:0.55,metalness:0.5});}; // 金属道具(0.5/0.55)
  var matWood=function(c){return new THREE.MeshStandardMaterial({color:c,roughness:0.85,metalness:0.1});}; // 木箱(非金属)
  // —— 警示灯带(沿墙内侧, 低矮纯视觉, 不挡射线) ——
  addNeon(0,0.45,22.8,10,0.14,0.16,warmA,{ei:1.2});   // 南墙内(暖橙)
  addNeon(0,0.45,-22.8,10,0.14,0.16,cyan,{ei:1.2});   // 北墙内(青蓝, 撤离点侧)
  // —— 管线/电缆(沿墙内侧, 金属圆柱) ——
  addCyl(22.8,2.1,-2,0.09,10,0x5a5a58,{metal:0.6,rough:0.45,rotX:Math.PI/2});
  addCyl(22.8,1.4,-2,0.06,10,0x3a3a38,{metal:0.5,rough:0.6,rotX:Math.PI/2});
  addCyl(-22.8,2.1,6,0.09,10,0x5a5a58,{metal:0.6,rough:0.45,rotX:Math.PI/2});
  // —— 控制箱/配电柜(Box+发光面板) ——
  function cabinet(x,z,ry){
    mkM(new THREE.BoxGeometry(1.1,1.6,0.5),matMetal(0x3a4048),x,0.8,z,ry);
    addNeon(x,1.1,z,0.7,0.4,0.06,cyan,{ei:1.0,ry:ry}); // 发光面板
  }
  cabinet(-22.2,10,0.3);cabinet(22.2,-10,-0.3);
  // —— 探照灯(细柱+灯头+半透明聚光锥, 照亮撤离点) ——
  mkM(new THREE.CylinderGeometry(0.07,0.1,4.6,8),matMetal(0x2a2a2a),5.2,2.3,-13); // 细柱(侧翼, 不挡走廊)
  mkM(new THREE.BoxGeometry(0.5,0.5,0.5),matMetal(0x3a3a3a),5.2,4.7,-13);          // 灯头
  (function(){var cone=new THREE.Mesh(new THREE.ConeGeometry(1.7,3.6,12,1,true),
    new THREE.MeshBasicMaterial({color:0x9fd8ff,transparent:true,opacity:0.12,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide}));
    cone.position.set(5.2,2.6,-13);cone.rotation.x=-0.4;cone.rotation.z=0.5;scene.add(cone);})(); // 半透明聚光锥
  // —— 新集装箱变体(不同色/侧翼, 高掩体 |x|≥12 推碰撞) ——
  function container(x,z,ry,color){
    var ct=texContainer(color);
    var m=new THREE.Mesh(new THREE.BoxGeometry(6,4.6,3),
      new THREE.MeshStandardMaterial({color:0xffffff,roughness:0.55,metalness:0.45}));
    m.material.map=ct;m.material.bumpMap=ct;m.material.bumpScale=0.03;m.material.needsUpdate=true;
    m.position.set(x,2.3,z);m.rotation.y=ry;m.castShadow=true;m.receiveShadow=true;scene.add(m);
    props.push({x:x,z:z,r:2.2,type:'cover',h:4.6}); // 高掩体(真实半边长, |x|≥12)
  }
  container(-18,0,0.4,0x2a4a5a);container(18,-10,-0.35,0x6a2a2a);
  // —— 散落补给箱/弹药箱堆(低矮, 纯视觉) ——
  mkM(new THREE.BoxGeometry(1.1,0.7,0.9),matWood(0x6a6a3a),-10,0.35,-18,0.3);
  mkM(new THREE.BoxGeometry(0.9,0.6,0.8),matMetal(0x4a5a3a),-9.2,0.95,-17.8,-0.2);
  mkM(new THREE.BoxGeometry(1.0,0.7,0.9),matWood(0x6a6a3a),10,0.35,-4,0.2);
  mkM(new THREE.BoxGeometry(0.9,0.6,0.8),matMetal(0x4a5a3a),14,0.35,10,-0.3);
  // —— 地面警戒线/标线(黄色细条, 低平) ——
  var lineMat=function(){return new THREE.MeshStandardMaterial({color:0xe8c020,roughness:0.5,metalness:0.1,emissive:0x604000,emissiveIntensity:0.4});};
  mkM(new THREE.BoxGeometry(0.12,0.03,7),lineMat(),-1.4,0.025,6,0);
  mkM(new THREE.BoxGeometry(0.12,0.03,7),lineMat(),1.4,0.025,-4,0);
  mkM(new THREE.BoxGeometry(0.12,0.03,6),lineMat(),0,0.025,12,0.2);
  // —— 发光光晕(信号弹/撤离点, Additive圆形渐变, 电影光晕) ——
  var flGlow=makeGlowSprite(0xff5030,2.6,0.85);flGlow.position.set(0,3.2,-14);scene.add(flGlow);   // 红色信号弹光晕
  var flagGlow=makeGlowSprite(green,3.2,0.9);flagGlow.position.set(0,1.8,-16);scene.add(flagGlow); // 撤离点绿光光晕
}
/* 绿色数字雨+尘埃粒子(Matrix标志性视觉: 绿色光点垂直下落, 通用科幻效果) */
var rainPoints=null,dustPoints=null;
function initParticles(){
  try{
    // 数字雨: 绿色光点从天花板(约4m)落到地面, 循环
    var rc=280,rp=new Float32Array(rc*3),rs=[];
    for(var i=0;i<rc;i++){rp[i*3]=Math.random()*16-8;rp[i*3+1]=Math.random()*4.5;rp[i*3+2]=Math.random()*44-22;rs.push(2.2+Math.random()*4.2);}
    var rg=new THREE.BufferGeometry();rg.setAttribute('position',new THREE.BufferAttribute(rp,3));
    rainPoints=new THREE.Points(rg,new THREE.PointsMaterial({color:0x00ff88,size:0.055,transparent:true,opacity:0.15,blending:THREE.AdditiveBlending,depthWrite:false}));
    rainPoints.userData.speed=rs;rainPoints.frustumCulled=false;scene.add(rainPoints);
    // 环境尘埃: 绿色微光悬浮(近处可感, 电影空气质感)
    var dc=150,dp=new Float32Array(dc*3),ds=[];
    for(var j=0;j<dc;j++){dp[j*3]=Math.random()*16-8;dp[j*3+1]=Math.random()*3.6;dp[j*3+2]=Math.random()*42-20;ds.push(0.04+Math.random()*0.12);}
    var dg=new THREE.BufferGeometry();dg.setAttribute('position',new THREE.BufferAttribute(dp,3));
    dustPoints=new THREE.Points(dg,new THREE.PointsMaterial({color:0xc8a878,size:0.032,transparent:true,opacity:0.28,depthWrite:false}));
    dustPoints.userData.speed=ds;dustPoints.frustumCulled=false;scene.add(dustPoints);
  }catch(e){}
}
function updateParticles(dt){
  try{
    if(rainPoints){var p=rainPoints.geometry.attributes.position.array,s=rainPoints.userData.speed;
      for(var i=0;i<s.length;i++){p[i*3+1]-=s[i]*dt;if(p[i*3+1]<0)p[i*3+1]=4.2+Math.random()*0.6;}
      rainPoints.geometry.attributes.position.needsUpdate=true;}
    if(dustPoints){var q=dustPoints.geometry.attributes.position.array,d=dustPoints.userData.speed;
      for(var j=0;j<d.length;j++){q[j*3+1]+=d[j]*dt;if(q[j*3+1]>3.6)q[j*3+1]=0.1;} // 暖尘土上浮
      dustPoints.geometry.attributes.position.needsUpdate=true;}
  }catch(e){}
}
/* 加墙体(贴wall SVG) */
function addWall(x,z,rotY){
  var w=place('wall',x,0,z,1,rotY?Math.PI/2:0);
  if(w){texAll(w,'wall',1);
    // 矩形碰撞: 墙模型8.2×6(统一原点后底部中心), 半宽4.1×3.0, 旋转90°交换
    props.push({x:x,z:z,type:'wall',rotY:rotY,hw:rotY?3.0:4.1,hd:rotY?4.1:3.0,h:3.6});}
}

function msg(t){var m=document.getElementById('wave');if(m){m.textContent=t;m.style.color='#ffd257';
  setTimeout(function(){m.style.color='';},2500);}}
/* ===== 武器系统 ===== */
var weaponObjs={};
function setupWeapons(){
  // 武器视图模型(挂在相机上, 第一人称)
  ['rifle','pistol'].forEach(function(n){
    var o=place(n,0,0,0);
    if(o){
      // 保留GLB金属分件材质(枪身/枪管/握把不同色), 只增强金属高光质感
      o.traverse(function(m){if(m.isMesh){
        if(m.material&&m.material.isMeshStandardMaterial){
          m.material.metalness=Math.min(0.8,(m.material.metalness||0.4)+0.15);
          m.material.roughness=Math.max(0.25,Math.min(0.6,(m.material.roughness||0.4)));
          m.material.needsUpdate=true;}
        m.castShadow=false;}});
      // 缩小+下移到右下角, 不遮挡中心视野
      o.position.set(0.22,-0.28,-0.5);o.rotation.y=Math.PI;
      o.scale.set(0.85,0.85,0.85);
      // 枪口本地偏移(枪管末端, 用于子弹发射点): 从对象原点沿枪管前端
      o.muzzleLocal=(n==='rifle')?new THREE.Vector3(0,-0.10,-0.72):new THREE.Vector3(0,-0.05,-0.23);
      camera.add(o);o.visible=false;weaponObjs[n]=o;
    }
  });
  // 匕首(近战武器): 刀身+刀尖+刀柄
  var dag=new THREE.Group();
  var dblade=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.4,0.1),
    new THREE.MeshStandardMaterial({color:0xcccccc,metalness:0.8,roughness:0.2}));
  dblade.position.set(0,0.25,0);
  var dtip=new THREE.Mesh(new THREE.ConeGeometry(0.05,0.12,4),
    new THREE.MeshStandardMaterial({color:0xd8d8d8,metalness:0.8,roughness:0.2}));
  dtip.position.set(0,0.5,0);
  var dgrip=new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.045,0.16,8),
    new THREE.MeshStandardMaterial({color:0x3a2a1a,roughness:0.8}));
  dgrip.position.set(0,-0.06,0);
  dag.add(dblade);dag.add(dtip);dag.add(dgrip);
  dag.position.set(0.22,-0.28,-0.5);dag.rotation.z=0.3;
  dag.visible=false;camera.add(dag);weaponObjs.dagger=dag;
  scene.add(camera);
  // 枪口火光
  if(models.muzzle){
    muzzle=place('muzzle',0,0,0);
    muzzle.traverse(function(m){if(m.isMesh){m.material=m.material.clone();m.material.emissive=new THREE.Color(0xffaa33);m.material.transparent=true;m.raycast=function(){};}}); // raycast禁用, 避免挡子弹
    muzzle.visible=false;scene.add(muzzle);
  }
  switchWeapon('rifle');
}
function switchWeapon(n){
  if(n!=='rifle'&&n!=='pistol'&&n!=='dagger')n='rifle'; // 仅步枪/手枪/匕首
  curWeapon=n;
  Object.keys(weaponObjs).forEach(function(k){weaponObjs[k].visible=(k===n);});
  if(elWN)elWN.textContent=n==='rifle'?'突击步枪':(n==='pistol'?'手枪':'匕首');
  updateAmmoHUD();
}
var fireCount=0;
function rayWallDist(ox,oz,dx,dz){ // 2D射线-障碍物最近距离(墙矩形+圆), 返回距离或-1
  var best=-1;
  for(var wpi=0;wpi<props.length;wpi++){var wp=props[wpi];
    if(wp.h!==undefined&&wp.h<1.4)continue; // 低矮掩体(油桶0.5/矮墙1.0): 视线可越过, 不挡射线/子弹
    if(wp.type==='wall'){ // 射线-AABB(slab法)
      var minX=wp.x-wp.hw,maxX=wp.x+wp.hw,minZ=wp.z-wp.hd,maxZ=wp.z+wp.hd;
      var tmin=0,tmax=1e9;
      if(Math.abs(dx)<1e-9){if(ox<minX||ox>maxX)continue;}
      else{var t1=(minX-ox)/dx,t2=(maxX-ox)/dx;if(t1>t2){var tmp=t1;t1=t2;t2=tmp;}
        tmin=tmin>t1?tmin:t1;tmax=tmax<t2?tmax:t2;}
      if(Math.abs(dz)<1e-9){if(oz<minZ||oz>maxZ)continue;}
      else{var t3=(minZ-oz)/dz,t4=(maxZ-oz)/dz;if(t3>t4){var tmp=t3;t3=t4;t4=tmp;}
        tmin=tmin>t3?tmin:t3;tmax=tmax<t4?tmax:t4;}
      if(tmin<=tmax&&tmax>0&&(best<0||tmin<best))best=tmin;
    }else if(wp.r){ // 圆形障碍物(箱/掩体/桶): 射线-圆
      var fx=ox-wp.x,fz=oz-wp.z;
      var a=dx*dx+dz*dz,b=2*(fx*dx+fz*dz),c=fx*fx+fz*fz-wp.r*wp.r;
      var disc=b*b-4*a*c;if(disc<0)continue;
      var sq=Math.sqrt(disc),t=(-b-sq)/(2*a);
      if(t>0&&(best<0||t<best))best=t;}}
  return best;
}
function shoot(){
  fireCount++;hitStats.shots++;
  var a=AMMO[curWeapon];
  // 匕首近战: 前方2范围敌人, 每刀10伤害
  if(a.melee){
    var best=null,bd=4;
    for(var mi=0;mi<enemies.length;mi++){var me=enemies[mi];if(me.hp<=0)continue;
      var mdx=me.x-player.x,mdz=me.z-player.z,md=mdx*mdx+mdz*mdz;if(md<bd){bd=md;best=me;}}
    if(best){best.hp-=a.dmg;best.hitT=0.15;
      if(elHit){elHit.textContent='匕首!';elHit.classList.add('on');setTimeout(function(){elHit.classList.remove('on');},200);}
      if(best.hp<=0)killEnemy(best);}
    weaponKick=0.08;sfx('hit');updateAmmoHUD();return;
  }
  if(reloading)return; // 换弹中不能射击
  if(a.mag<=0){ // 弹药耗尽: 无备弹切匕首, 有备弹换弹
    if(a.reserve<=0){switchWeapon('dagger');
      if(elHit){elHit.textContent='⚠ 弹药耗尽! 切匕首';elHit.classList.add('on');elHit.classList.add('kill');
        setTimeout(function(){elHit.classList.remove('on');elHit.classList.remove('kill');},800);}return;}
    reload();
    if(elHit){elHit.textContent='弹夹空! 按 R 换弹';elHit.classList.add('on');elHit.classList.add('kill');
      setTimeout(function(){elHit.classList.remove('on');elHit.classList.remove('kill');},600);}return;}
  a.mag--;
  scene.updateMatrixWorld(); // 确保敌人/道具世界矩阵最新(否则射线检测可能落空)
  // 弹道=准星中心(三角洲式: 准星即子弹落点, 无随机散布)
  raycaster.setFromCamera({x:0,y:0},camera);
  var hits=raycaster.intersectObjects(scene.children,true);
  var hitPoint=null,hitEnemy=null,hitCrate=null;
  for(var i=0;i<hits.length;i++){
    var h=hits[i];
    if(h.distance<0.3)continue; // 跳过极近(枪身)
    if(h.object.isLine||h.object.isPoints||h.object.isSprite)continue; // 跳过曳光/粒子/贴花(不挡子弹)
    if(h.object.userData&&h.object.userData.noRay)continue; // 跳过子弹/火花/榴弹等特效(不挡子弹)
    // 跳过武器视图模型(挂在camera下)
    var isWeapon=false,pp=h.object;
    while(pp){if(pp===camera){isWeapon=true;break;}pp=pp.parent;}
    if(isWeapon)continue;
    hitPoint=h.point;
    var en=findEnemy(h.object);
    if(en){hitEnemy=en;break;} // 命中敌人
    var cr=findCrate(h.object);
    if(cr){hitCrate=cr;break;} // 命中木箱
    break; // 打到墙/道具
  }
  // 严格物理: 子弹沿准星中心射线, 2D射线-障碍物相交验证(墙/箱无高度限制, 不可隔障碍物打人)
  // 锁定不再强制吞命中: 准星命中谁就打谁(修复"打中了但对方不掉血"—锁定后打另一人被吞)
  if(hitEnemy){
    var wdx2=hitEnemy.x-camera.position.x,wdz2=hitEnemy.z-camera.position.z;
    var wlen2=Math.sqrt(wdx2*wdx2+wdz2*wdz2);
    if(wlen2>0.001){var wux=wdx2/wlen2,wuz=wdz2/wlen2;
      // 空中单位(无人机): 2D地面掩体射线验证会误判"低矮/高掩体挡住空中目标", 跳过遮挡验证(直接放行命中)
      if(!hitEnemy.fly){
        var wd=rayWallDist(camera.position.x,camera.position.z,wux,wuz);
        if(wd>=0&&wd<wlen2-0.2){ // 障碍物在敌人前: 子弹打障碍物, 不可隔墙打人
          hitPoint=new THREE.Vector3(camera.position.x+wux*wd,1.0,camera.position.z+wuz*wd);
          hitEnemy=null;hitCrate=null;}}}
  }
  if(hitEnemy){
    hitStats.hits++; // 命中敌人: 计入命中率
    var hs=false; // 打头无奖励: 一律躯体伤害(不爆头, 不打头加分)
    var pd=camera.position.distanceTo(hitPoint);
    var dmg=a.dmg; // 固定伤害120(无衰减, 打中对方掉血120)
    hitEnemy.hp-=dmg;hitEnemy.hitT=0.15;
    if(hitEnemy.type==='tank')sfx('tankhit'); // 坦克金属受击声(高频金属咔哒, 打击感)
    // 受击击退: 沿子弹方向推开敌人(小位移, 打击感)
    var kb=0.12;hitEnemy.x+=raycaster.ray.direction.x*kb;hitEnemy.z+=raycaster.ray.direction.z*kb;
    shakeT=Math.max(shakeT,0.16);shakeA=Math.max(shakeA,0.06); // 命中屏幕震动(更有打击感)
    if(hitEnemy.hp>0)floaters.push({x:hitEnemy.x,y:2.4,z:hitEnemy.z,txt:''+Math.round(dmg),c:hs?'#ff5544':'#fff',lift:0}); // 命中伤害飘字
    if(hitPoint)spawnSpark(hitPoint); // 命中特效: 敌人中弹火花
    // 命中反馈: 敌人闪红
    if(elHit){elHit.textContent=hs?'爆头!':'命中!';elHit.classList.add('on');setTimeout(function(){elHit.classList.remove('on');},200);}
    lockTarget=hitEnemy; // 锁定当前目标(打死才能打另一人)
    hitPulse=8; // 命中准星收缩反馈(更清晰的命中反馈)
    var chl=document.getElementById('crosshair'); // 命中准星闪红1秒
    if(chl){chl.style.color='#ff4455';setTimeout(function(){chl.style.color='';},1000);}
    if(hitEnemy.hp<=0)killEnemy(hitEnemy,hs);
  }else if(hitCrate){ // 木箱: 破坏掉补给(打障碍物扣分)
    hitCrate.hp-=a.dmg;spawnSpark(hitPoint);score-=5;if(elScore)elScore.textContent='得分 '+score;
    if(hitCrate.hp<=0)breakCrate(hitCrate);
  }else if(hitPoint){spawnSpark(hitPoint);score-=5;if(elScore)elScore.textContent='得分 '+score;} // 打墙/障碍物扣分
  else{score-=5;if(elScore)elScore.textContent='得分 '+score;} // 完全放空枪扣分
  // 曳光弹道(枪口→准星方向) + 枪口火光
  var fwd=new THREE.Vector3(0,0,-1).applyQuaternion(camera.quaternion);
  var gunObj=weaponObjs[curWeapon]; // 枪口世界位置(子弹出枪口)
  var from;
  if(gunObj){ // 真实枪口: 用武器本地枪口偏移转世界(枪管末端), 而非对象原点
    from=(gunObj.muzzleLocal?gunObj.localToWorld(gunObj.muzzleLocal.clone()):gunObj.getWorldPosition(new THREE.Vector3()));
  }else{from=camera.position.clone().add(fwd.clone().multiplyScalar(0.6));}
  // 弹道起点=枪口, 终点=实际命中点(准星落点): 子弹枪口出, 落点=准星命中处
  // 未命中时: 终点=相机中心射线上30m点(屏幕中央远点), 保证子弹方向朝向屏幕中心, 而非从枪口平行飞出偏出准星
  var centerFar=camera.position.clone().add(fwd.clone().multiplyScalar(30));
  var to=hitPoint?hitPoint.clone():centerFar;
  tracer(from,to);muzzleT=0.06;
  spawnPBullet(from.x,from.y,from.z,to.x,to.y,to.z); // 子弹投射物(运动可见)
  firePulse=10; // 开火脉冲(准星瞬间扩张, 动态收拢)
  recoil+=0.010;weaponKick=0.08; // 后坐力(略强, 准星与子弹基本一致)
  shakeT=Math.max(shakeT,0.10);shakeA=Math.max(shakeA,0.025); // 开火轻微屏幕震动
  sfx(curWeapon==='rifle'?'rifle':'pistol');
  updateAmmoHUD();
}
var weaponKick=0,recoil=0,reloading=false,firePulse=0,hitPulse=0,lockTarget=null; // firePulse: 动态准星开火脉冲; hitPulse: 命中收缩; lockTarget: 命中锁定目标(打死才能打另一人)
var hitStats={shots:0,hits:0,get accuracy(){return this.shots>0?this.hits/this.shots:0;}}; // 命中率统计
function reload(){
  var a=AMMO[curWeapon];var need=a.magMax-a.mag;
  if(need<=0||a.reserve<=0||reloading)return;
  reloading=true;sfx('crate'); // 换弹咔哒音
  if(elHit){elHit.textContent='⟳ 换弹中...';elHit.classList.add('on');elHit.classList.add('kill');}
  setTimeout(function(){ // 换弹3秒后完成
    var take=Math.min(need,a.reserve);a.mag+=take;a.reserve-=take;
    reloading=false;updateAmmoHUD();sfx('pickup'); // 换弹完成音
    if(elHit){elHit.textContent='✓ 换弹完成';elHit.classList.add('on');elHit.classList.add('kill');}
    setTimeout(function(){elHit.classList.remove('on');elHit.classList.remove('kill');},400);},3000);
}
function updateAmmoHUD(){
  var a=AMMO[curWeapon];
  if(elAmmo)elAmmo.innerHTML=a.mag+' <small>/ '+a.reserve+'</small>';
}
function spawnSpark(p){
  var s=new THREE.Mesh(new THREE.SphereGeometry(0.05,6,6),new THREE.MeshBasicMaterial({color:0xffcc44}));
  s.userData.noRay=true;s.position.copy(p);scene.add(s);
  setTimeout(function(){scene.remove(s);},80);
}

/* ===== 敌人AI ===== */
/* 程序化坦克模型(不依赖GLB): 履带×2 + 车体 + 炮塔 + 炮管 + 舱盖, 深军绿/暗色金属 */
function buildTankModel(scale){
  var g=new THREE.Group();
  var trackMat=new THREE.MeshStandardMaterial({color:0x1a1f1a,roughness:0.75,metalness:0.4});
  var lt=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.5,3.0),trackMat);
  lt.position.set(-0.72,0.25,0);lt.castShadow=true;g.add(lt);
  var rt=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.5,3.0),trackMat);
  rt.position.set(0.72,0.25,0);rt.castShadow=true;g.add(rt);
  var body=new THREE.Mesh(new THREE.BoxGeometry(1.9,0.65,2.9),
    new THREE.MeshStandardMaterial({color:0x3a4a3a,roughness:0.55,metalness:0.5}));
  body.position.y=0.72;body.castShadow=true;g.add(body);
  var turret=new THREE.Mesh(new THREE.BoxGeometry(1.2,0.5,1.3),
    new THREE.MeshStandardMaterial({color:0x445844,roughness:0.5,metalness:0.5}));
  turret.position.set(0,1.22,0.1);turret.castShadow=true;g.add(turret);
  var barrel=new THREE.Mesh(new THREE.CylinderGeometry(0.09,0.09,1.7,10),
    new THREE.MeshStandardMaterial({color:0x2a2f2a,roughness:0.4,metalness:0.7}));
  barrel.rotation.x=Math.PI/2;barrel.position.set(0,1.28,1.35);barrel.castShadow=true;g.add(barrel); // 炮管朝前(+z=面向玩家)
  var hatch=new THREE.Mesh(new THREE.CylinderGeometry(0.26,0.26,0.16,12),
    new THREE.MeshStandardMaterial({color:0x2f3a2f,roughness:0.6,metalness:0.4}));
  hatch.position.set(0.3,1.52,-0.2);hatch.castShadow=true;g.add(hatch);
  if(scale)g.scale.set(scale,scale,scale);
  return g;
}
/* 程序化无人机模型(不依赖GLB): 机身 + 四旋翼(旋转盘) + 发光灯(前青后红) */
function buildDroneModel(){
  var g=new THREE.Group();
  var body=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.2,0.5),
    new THREE.MeshStandardMaterial({color:0x2a4a3a,roughness:0.4,metalness:0.5}));
  body.position.y=0;body.castShadow=true;g.add(body);
  var armMat=new THREE.MeshStandardMaterial({color:0x1a2a20,roughness:0.5,metalness:0.6});
  var rotorMat=new THREE.MeshStandardMaterial({color:0x3a5a4a,roughness:0.5,metalness:0.5,transparent:true,opacity:0.7});
  var rotors=[];
  [[0.35,0.35],[-0.35,0.35],[0.35,-0.35],[-0.35,-0.35]].forEach(function(o){
    var arm=new THREE.Mesh(new THREE.BoxGeometry(0.34,0.06,0.08),armMat);
    arm.position.set(o[0]*0.7,0,o[1]*0.7);arm.rotation.y=Math.atan2(o[1],o[0]);arm.castShadow=true;g.add(arm);
    var rotor=new THREE.Mesh(new THREE.CylinderGeometry(0.22,0.22,0.02,10),rotorMat);
    rotor.position.set(o[0],0.08,o[1]);rotor.castShadow=true;g.add(rotor);rotors.push(rotor);
  });
  // 发光灯: 前青(+z朝向玩家) / 后红(-z), noTint防止被统一染色压暗
  var front=new THREE.Mesh(new THREE.BoxGeometry(0.08,0.06,0.08),
    new THREE.MeshStandardMaterial({color:0x40c8ff,emissive:0x40c8ff,emissiveIntensity:1.6}));
  front.position.set(0,0,0.28);front.userData.noTint=true;g.add(front);
  var rear=new THREE.Mesh(new THREE.BoxGeometry(0.08,0.06,0.08),
    new THREE.MeshStandardMaterial({color:0xff4030,emissive:0xff4030,emissiveIntensity:1.6}));
  rear.position.set(0,0,-0.28);rear.userData.noTint=true;g.add(rear);
  g.userData.rotors=rotors;
  return g;
}
function spawnEnemy(x,z,type,hpMul){
  type=type||'grunt';
  var t=ETYPES[type]||ETYPES.grunt;
  var nc;
  if(type==='drone'){nc=[x,z];} // 无人机: 空中出生, 不参与地面碰撞推离(飞越)
  else{nc=collide(x,z,0.6);} // 出生点推离障碍物(不刷在墙内)
  x=nc[0];z=nc[1];
  var o=null,eg=null;
  if(type==='tank'){ // 坦克: 程序化重甲模型(不依赖GLB, 避免模型缺失)
    o=buildTankModel(t.scale||1);
    o.position.set(x,0,z);scene.add(o);
  }else if(type==='drone'){ // 无人机: 程序化空中模型(不依赖GLB)
    o=buildDroneModel();
    o.position.set(x,0,z);scene.add(o);
  }else{
    o=place('enemy',x,0,z,t.scale||1,Math.random()*6.28);
    if(!o){ // 模型加载失败回退: 程序化占位体(仍可命中/击杀, 不卡波次)
      o=new THREE.Group();
      var bodyM=new THREE.Mesh(new THREE.BoxGeometry(0.8,1.8,0.5),
        new THREE.MeshStandardMaterial({color:t.color,roughness:0.6,metalness:0.2}));
      bodyM.position.y=0.9;bodyM.castShadow=true;o.add(bodyM);
      o.position.set(x,0,z);
      scene.add(o);
    }
  }
  if(o){ // 保留GLB多材质细节(西装/制服分件), 只增强质感, 不统一染色
    o.traverse(function(m){if(m.isMesh){
      if(m.userData&&m.userData.noTint)return; // 亮灯/特效件不染色(无人机指示灯)
      m.castShadow=true; // 敌人投影(视觉关键, 地面受影)
      if(m.material&&m.material.isMeshStandardMaterial){
        // 金属高光增强 + 布料粗糙度(按类型微调)
        m.material.metalness=Math.min(0.6,(m.material.metalness||0)+0.15);
        m.material.roughness=Math.max(0.35,Math.min(0.75,(m.material.roughness||0.5)));
        // 敌人类型微调色相(保安蓝/特勤深灰/特工黑, 保留分件层次)
        var c=new THREE.Color(t.color);
        m.material.color.lerp(c,0.45);
        m.material.emissive=new THREE.Color(t.color).multiplyScalar(0.12);
        m.material.emissiveIntensity=0.45; // 敌人从冷背景浮出(纯视觉)
        m.material.needsUpdate=true;
      }}});
    // 暂存受击闪白的基准emissive(染色调质完成后), 命中闪白恢复时回到此状态(每材质一次, 共享材质也安全)
    o.traverse(function(m){if(m.isMesh&&m.material&&m.material.isMeshStandardMaterial&&!m.material.userData._baseEm){
      m.material.userData._baseEm=m.material.emissive?m.material.emissive.clone():new THREE.Color(0,0,0);
      m.material.userData._baseEmI=(m.material.emissiveIntensity!==undefined)?m.material.emissiveIntensity:1;
    }});
    // 敌人武器(枪模型, 金属质感) — 坦克/无人机用自身模型, 不挂枪
    if(type!=='tank'&&type!=='drone'){
      eg=new THREE.Mesh(new THREE.BoxGeometry(0.1,0.1,0.6),new THREE.MeshStandardMaterial({color:0x22252c,metalness:0.7,roughness:0.3}));
      eg.position.set(0,1.1,-0.4);o.add(eg);}
  }
  var hp=t.hp*(hpMul||1);
  var spMul=1+(wave-1)*0.015; // 难度曲线: 每波+1.5%速度
  var e={obj:o,x:x,z:z,hp:hp,max:hp,speed:t.speed*spMul,dmg:t.dmg,cool:0,state:'chase',hitT:0,type:type,gun:eg,scale:t.scale||1,
    shoot:t.shoot||0,shootRate:t.shootRate||0,shootDmg:t.shootDmg||0,shootCd:1};
  if(t.fly){e.y=t.flyH||3.4;e.fly=1;} // 无人机: 空中单位, 悬停高度
  if(t.heavy)e.heavy=1; // 坦克: 重甲标记
  enemies.push(e);return e;
}
function findEnemy(mesh){
  for(var i=0;i<enemies.length;i++){var e=enemies[i];
    if(e.obj&&(e.obj===mesh||isChild(e.obj,mesh)))return e;}
  return null;
}
function isChild(root,obj){var p=obj;while(p){if(p===root)return true;p=p.parent;}return false;}
/* 击杀掉落补给: 弹药包(+30备弹)/血量包(+20血), 靠近拾取 */
function spawnPickup(x,z,type){
  var c=type==='ammo'?0x44aaff:0x44ff88;
  var m=new THREE.Mesh(new THREE.BoxGeometry(0.4,0.4,0.4),
    new THREE.MeshStandardMaterial({color:c,emissive:c,emissiveIntensity:0.7,roughness:0.3,metalness:0.3}));
  m.position.set(x,0.5,z);scene.add(m);
  pickups.push({x:x,z:z,type:type,obj:m,life:12});
}
function updatePickups(dt){
  for(var i=pickups.length-1;i>=0;i--){var p=pickups[i];
    p.obj.rotation.y+=dt*2.5;p.obj.position.y=0.5+Math.sin(performance.now()*0.004)*0.08;
    p.life-=dt;
    var dx=p.x-player.x,dz=p.z-player.z;
    var d2=dx*dx+dz*dz;
    if(d2<3.5&&d2>=1.2){ // 磁吸: 靠近自动飞向玩家(爽快拾取)
      p.x-=dx*dt*4;p.z-=dz*dt*4;p.obj.position.set(p.x,0.5+Math.sin(performance.now()*0.004)*0.08,p.z);}
    if(d2<1.2){ // 拾取
      if(p.type==='ammo'){var a=AMMO[curWeapon];if(a&&!a.melee){a.reserve+=30;updateAmmoHUD();sfx('pickup');
        if(elHit){elHit.textContent='弹药 +30';elHit.classList.add('on');elHit.classList.add('kill');
          setTimeout(function(){elHit.classList.remove('on');elHit.classList.remove('kill');},700);}}}
      else{var a2=AMMO[curWeapon];if(a2&&!a2.melee){a2.reserve+=30;updateAmmoHUD();sfx('pickup'); // 生命拾取改弹药(不可回血)
        if(elHit){elHit.textContent='弹药 +30';elHit.classList.add('on');elHit.classList.add('kill');
          setTimeout(function(){elHit.classList.remove('on');elHit.classList.remove('kill');},700);}}}
      scene.remove(p.obj);pickups.splice(i,1);continue;
    }
    if(p.life<=0){scene.remove(p.obj);pickups.splice(i,1);}
  }
}
/* 手雷: G投掷, 抛物线飞行, 落地AOE范围伤害 */
function throwGrenade(){
  if(grenadeCd>0)return;
  grenadeCd=5; // 冷却5秒
  var dx=-Math.sin(player.ry),dz=-Math.cos(player.ry);
  var g={x:player.x,y:1.6,z:player.z,vx:dx*5.5,vz:dz*5.5,vy:4.5,t:0,life:3};
  var m=new THREE.Mesh(new THREE.SphereGeometry(0.13,8,6),
    new THREE.MeshStandardMaterial({color:0x3a5a2a,metalness:0.4,roughness:0.5}));
  m.userData.noRay=true;m.position.set(g.x,g.y,g.z);scene.add(m);g.obj=m;grenades.push(g);
  sfx('grenade');
}
function updateGrenades(dt){
  grenadeCd=Math.max(0,grenadeCd-dt);
  for(var i=grenades.length-1;i>=0;i--){var g=grenades[i];
    g.t+=dt;g.x+=g.vx*dt;g.z+=g.vz*dt;
    g.vy-=9.8*dt;g.y+=g.vy*dt; // 欧拉积分(与x/z同源, 轨迹不畸变)
    if(g.obj)g.obj.position.set(g.x,Math.max(0.13,g.y),g.z);
    if(g.y<=0.13||g.life<=0||g.t>2.5){ // 落地爆炸(球心触地)
      if(window.boomFx)window.boomFx(g.x,1,g.z);
      for(var j=enemies.length-1;j>=0;j--){var e=enemies[j];if(e.hp<=0)continue;
        var dx=e.x-g.x,dz=e.z-g.z,d=Math.sqrt(dx*dx+dz*dz);
        if(d<3){e.hp-=60;e.hitT=0.15;if(e.hp<=0)killEnemy(e);} // 范围伤害60
      }
      sfx('grenade');
      sfx('explosion'); // 榴弹爆炸(范围音效, 不改伤害)
      if(g.obj)scene.remove(g.obj);grenades.splice(i,1);
    }
  }
}
/* 可破坏木箱: 射击/手雷破坏, 掉补给 */
function spawnCrate(x,z){
  var m=new THREE.Mesh(new THREE.BoxGeometry(0.9,0.9,0.9),
    new THREE.MeshStandardMaterial({color:0x8a6a3a,roughness:0.85,metalness:0.05}));
  m.position.set(x,0.45,z);m.castShadow=true;scene.add(m);
  crates.push({x:x,z:z,obj:m,hp:80}); // 木箱80血(2发破坏)
}
function breakCrate(c){
  if(window.boomFx)window.boomFx(c.x,0.8,c.z);
  scene.remove(c.obj);
  var idx=crates.indexOf(c);if(idx>=0)crates.splice(idx,1);
  for(var pi=props.length-1;pi>=0;pi--){var ppp=props[pi]; // 被破坏箱不再挡子弹
    if(ppp.type==='crate'&&Math.abs(ppp.x-c.x)<0.1&&Math.abs(ppp.z-c.z)<0.1)props.splice(pi,1);}
  spawnPickup(c.x,c.z,Math.random()<0.5?'ammo':'health'); // 掉补给
  sfx('crate');sfx('explosion'); // 木箱破坏爆炸(叠加, 不改掉落)
}
function updateCrates(){
  crates.forEach(function(c){if(c.obj&&c.obj.visible){c.obj.rotation.x=0;c.obj.rotation.z=0;}});
}
function findCrate(o){for(var i=0;i<crates.length;i++){if(crates[i].obj===o)return crates[i];}return null;}
/* 屏幕震动(受击/爆炸反馈) */
function shake(a,t){shakeA=Math.max(shakeA,a);shakeT=Math.max(shakeT,t);}
/* 击杀粒子特效(彩色爆炸) */
function burstFx(x,y,z,color){
  for(var i=0;i<16;i++){
    var s=new THREE.Mesh(new THREE.SphereGeometry(0.06,5,4),
      new THREE.MeshBasicMaterial({color:color||0xff8844,transparent:true}));
    s.userData.noRay=true;s.position.set(x,y,z);
    s.userData.vx=(Math.random()-0.5)*4.5;s.userData.vy=Math.random()*3.8;s.userData.vz=(Math.random()-0.5)*4.5;
    scene.add(s);fxParts.push(s);
  }
  // 中心闪光球(更亮)
  var c=new THREE.Mesh(new THREE.SphereGeometry(0.22,6,5),
    new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:0.9}));
  c.userData.noRay=true;c.position.set(x,y,z);c.userData.vx=0;c.userData.vy=0.4;c.userData.vz=0;
  scene.add(c);fxParts.push(c);
}
var fxParts=[];
function tracer(from,to){
  try{var geo=new THREE.BufferGeometry().setFromPoints([from,to]);
  var line=new THREE.Line(geo,new THREE.LineBasicMaterial({color:0xffdd88,transparent:true,opacity:0.9}));
  scene.add(line);fxTracers.push({l:line,t:0.06});}catch(e){}
}
/* 玩家子弹: 投射物(球从枪口飞向命中点, 运动可见) */
var pbGeo=new THREE.SphereGeometry(0.045,6,6);
var pbMat=new THREE.MeshBasicMaterial({color:0xffe680});
function spawnPBullet(fx,fy,fz,tx,ty,tz){
  try{var m=new THREE.Mesh(pbGeo,pbMat);m.userData.noRay=true;m.position.set(fx,fy,fz);scene.add(m);
  playerBullets.push({m:m,fx:fx,fy:fy,fz:fz,tx:tx,ty:ty,tz:tz,t:0});}catch(e){}
}
function updatePlayerBullets(dt){
  for(var i=playerBullets.length-1;i>=0;i--){var b=playerBullets[i];b.t+=dt/0.06; // 子弹飞行0.06s(≈667m/s等效场景速度, 接近AK-47初速715m/s)
    if(b.t>=1){scene.remove(b.m);playerBullets.splice(i,1);continue;}
    b.m.position.set(b.fx+(b.tx-b.fx)*b.t,b.fy+(b.ty-b.fy)*b.t,b.fz+(b.tz-b.fz)*b.t);
    // 子弹撞障碍物: 墙/箱/掩体/桶阻挡, 打中命中特效
    var bx=b.m.position.x,bz=b.m.position.z,hitW=false;
    for(var wpi=0;wpi<props.length;wpi++){var wp=props[wpi];
      if(wp.h!==undefined&&wp.h<1.4)continue; // 低矮掩体(混凝土1.2/沙袋0.9): 子弹可越过, 不挡(与rayWallDist一致)
      if(wp.type==='wall'){var wox=Math.abs(bx-wp.x)-wp.hw,woz=Math.abs(bz-wp.z)-wp.hd;
        if(wox<0&&woz<0){hitW=true;break;}}
      else if(wp.r){var wdx=bx-wp.x,wdz=bz-wp.z;
        if(wdx*wdx+wdz*wdz<wp.r*wp.r){hitW=true;break;}}}
    if(hitW){spawnSpark(new THREE.Vector3(bx,b.m.position.y,bz)); // 打中障碍物特效
      scene.remove(b.m);playerBullets.splice(i,1);}}
}
function updateCrosshair(dt){ // 动态准星: 收拢/开火脉冲/移动扩散/命中收缩
  var ch=document.getElementById('crosshair');if(!ch)return;
  firePulse=Math.max(0,firePulse-dt*40);hitPulse=Math.max(0,hitPulse-dt*30);
  var spd=Math.sqrt((player.vx||0)*(player.vx||0)+(player.vz||0)*(player.vz||0));
  var s=(ads?18:26)+Math.min(10,spd*4)+firePulse-hitPulse; // ADS收拢, 移动/开火扩散, 命中收缩
  s=Math.max(14,s);
  ch.style.fontSize=s.toFixed(1)+'px';
}
function updateFx(dt){
  for(var i=fxParts.length-1;i>=0;i--){var s=fxParts[i];
    s.position.x+=s.userData.vx*dt;s.position.y+=s.userData.vy*dt;s.position.z+=s.userData.vz*dt;
    s.userData.vy-=9.8*dt;s.material.opacity=Math.max(0,(s.material.opacity||1)-dt*2.5);
    if(s.material.opacity<=0){scene.remove(s);fxParts.splice(i,1);}
  }
  // 曳光弹道淡出
  for(var ti=fxTracers.length-1;ti>=0;ti--){var tr=fxTracers[ti];tr.t-=dt;
    if(tr.l.material)tr.l.material.opacity=Math.max(0,tr.t/0.06*0.9);
    if(tr.t<=0){scene.remove(tr.l);fxTracers.splice(ti,1);}}
  muzzleT=Math.max(0,muzzleT-dt);
  for(var fl=floaters.length-1;fl>=0;fl--){floaters[fl].lift+=dt*55; // 飘字上浮
    if(floaters[fl].lift>55)floaters.splice(fl,1);}
}
function killEnemy(e,headshot){
  if(lockTarget===e)lockTarget=null; // 击杀解锁(可打另一人)
  if(window.boomFx){var pp=e.obj.position;window.boomFx(pp.x,pp.y+1,pp.z);}
  var fy=(e.fly&&e.obj)?e.obj.position.y:1.2; // 无人机: 爆炸发生在空中(机身高度)
  burstFx(e.x,fy,e.z,headshot?0xff5544:0xffaa44); // 击杀彩色粒子
  shake(0.015,0.1); // 击杀轻微震动(很轻, 防晃屏)
  e.hp=0;kills++;
  if(e.obj){e.obj.rotation.z+=Math.PI/2;e.obj.position.y-=0.5; // 倒地: 倒下90°+下沉
    setTimeout(function(){if(e.obj&&e.obj.parent)scene.remove(e.obj);},500);} // 0.5s后移除
  var pts=(headshot?150:100)+combo*25;score+=pts; // 爆头加分+连杀奖励递增(2连杀起+25/连)
  if(e.type==='brute'&&e.scale&&e.scale>1){score+=500;spawnPickup(e.x,e.z,'ammo');spawnPickup(e.x+1,e.z,'ammo'); // Boss大奖励(弹药,不回血, 仅头目)
    if(elHit){elHit.textContent='⚑ BOSS 击杀! +500';elHit.classList.add('on');elHit.classList.add('kill');
      setTimeout(function(){elHit.classList.remove('on');elHit.classList.remove('kill');},1200);}}
  if(e.type==='tank'){score+=800; // 坦克大奖励(重甲单位)
    if(elHit){elHit.textContent='🛡 坦克击毁! +800';elHit.classList.add('on');elHit.classList.add('kill');
      setTimeout(function(){elHit.classList.remove('on');elHit.classList.remove('kill');},1200);}}
  if(e.type==='brute'&&e.scale>1&&!flag.ready){ // 头目(特工史密斯)死亡 → 出口开启
    flag.ready=true;if(window.DIR)window.DIR.stage='exit';
    if(elHit){elHit.textContent='🚪 出口开启! 前往走廊尽头';elHit.classList.add('on');elHit.classList.add('kill');
      setTimeout(function(){elHit.classList.remove('on');elHit.classList.remove('kill');},1800);}
  }
  combo++;comboT=3; // 连杀
  // 爆头回血已移除(不可回血)
  if(enemies.length===0&&waveTimer>1)waveTimer=Math.max(1,waveTimer-0.5); // 清波后击杀加速下波
  if(kills>=50&&upgLv===2){upgLv=3;AMMO.pistol.rate=1.3;sfx('pickup'); // 三级: 手枪射速提升(步枪AK射速固定)
    if(elHit){elHit.textContent='★ 武器升级! 射速提升';elHit.classList.add('on');elHit.classList.add('kill');
      setTimeout(function(){elHit.classList.remove('on');elHit.classList.remove('kill');},1200);}}
  else if(kills>=30&&upgLv===1){upgLv=2;AMMO.rifle.dmg+=5;AMMO.pistol.dmg+=5;sfx('pickup'); // 二级: 伤害再+5
    if(elHit){elHit.textContent='★ 武器升级! 伤害+5';elHit.classList.add('on');elHit.classList.add('kill');
      setTimeout(function(){elHit.classList.remove('on');elHit.classList.remove('kill');},1200);}}
  else if(kills>=15&&upgLv===0){upgLv=1;AMMO.rifle.dmg+=5;AMMO.pistol.dmg+=5;sfx('pickup'); // 一级: 伤害+5
    if(elHit){elHit.textContent='★ 武器升级! 伤害+5';elHit.classList.add('on');elHit.classList.add('kill');
      setTimeout(function(){elHit.classList.remove('on');elHit.classList.remove('kill');},1200);}}
  if(elScore)elScore.textContent='得分 '+score;
  if(elHit){elHit.textContent=combo>=2?('连杀 x'+combo+'! +'+pts):(headshot?'爆头击杀! +150':'击杀! +100');elHit.classList.add('on');elHit.classList.add('kill');
    setTimeout(function(){elHit.classList.remove('on');elHit.classList.remove('kill');},400);}
  if(e.obj&&e.obj.position)spawnSpark(e.obj.position.clone());
  floaters.push({x:e.x,y:2.4,z:e.z,txt:'+'+pts,c:headshot?'#ff5544':'#ffd54f',lift:0}); // 击杀飘字
  sfx('kill');
  if(headshot)sfx('pickup'); // 爆头额外高音
  if(combo>=3)sfx('combo'); // 连杀音效(3连杀以上高音)
  if(e.type==='brute'&&e.scale&&e.scale>1)sfx('boss'); // Boss击杀低音(仅头目)
  // 击杀掉落补给(25%概率: 弹药包/血量包)
  if(Math.random()<0.3)spawnPickup(e.x,e.z,Math.random()<0.5?'ammo':'health'); // 击杀掉落补给30%
}
function updateEnemies(dt){
  enemies.forEach(function(e){
    if(e.hp<=0||!e.obj)return; // 跳过死亡或无模型的敌人
    e.hitT=Math.max(0,e.hitT-dt);
    // 受击闪白: hitT>0时模型全部材质emissive变白提亮, 归零恢复原色(打击感视觉反馈)
    var flashOn=e.hitT>0;
    if(flashOn!==e._flashOn){ // 只在状态变化帧更新材质(性能: 避免每帧traverse所有敌人材质)
      e._flashOn=flashOn;
      e.obj.traverse(function(m){if(m.isMesh&&m.material&&m.material.isMeshStandardMaterial){
        var mat=m.material;
        if(flashOn){mat.emissive.setRGB(1,1,1);mat.emissiveIntensity=1.2;}
        else{var be=mat.userData._baseEm;mat.emissive.copy(be||new THREE.Color(0,0,0));
          mat.emissiveIntensity=(mat.userData._baseEmI!==undefined)?mat.userData._baseEmI:1;}
        mat.needsUpdate=true;
      }});
    }
    // 追踪玩家(仅当玩家进入警戒距离才进攻, 远离则待命)
    var dx=player.x-e.x,dz=player.z-e.z,d=Math.sqrt(dx*dx+dz*dz)||1;
    var stopDist=e.shoot?10:2; // 远程敌人留距射击(稍远更安全)
    var alertRange=45; // 全场警戒: 敌人出生即发现玩家, 立即进攻(不再待命)
    if(d<alertRange&&d>stopDist){
      // 敌人走位: runner包抄(侧翼), gunner环绕(射击走位), grunt/brute直线
      var tx=-dz/d,tz=dx/d; // 切线方向(垂直)
      var strafe=(e.type==='runner')?Math.sin(performance.now()*0.002+e.x)*0.7:
        (e.type==='gunner'?Math.sin(performance.now()*0.0015+e.z)*0.9:0);
      var rage=(e.type==='brute'&&e.scale&&e.scale>1&&e.hp<e.max*0.4)?1.5:1; // Boss狂暴: 血<40%速度+50%(仅头目)
      if(rage>1&&!e.rage){e.rage=true;sfx('boss');} // 狂暴触发音效(一次)
      var sprint=(e.type==='brute'&&e.scale&&e.scale>1&&d<9)?2.2:1; // Boss冲刺突进(仅头目)
      var stun=e.hitT>0?0.45:1; // 受击僵直(短暂减速45%, 打击感更强)
      var vx,vz;
      if(e.fly){ // 无人机: 空中直线飞越(不受地面掩体水平遮挡/不绕障, 直接朝玩家)
        e.avT=0;e.av=0;
        vx=(dx/d*e.speed*sprint*rage+tx*e.speed*strafe)*stun;
        vz=(dz/d*e.speed*sprint*rage+tz*e.speed*strafe)*stun;
      }else{
        // 寻路绕过障碍物: 前方<5m有障碍 → 垂直绕行; 10m内自我检测(感知障碍,提前预判)
        var ux=dx/d,uz=dz/d,obst=rayWallDist(e.x,e.z,ux,uz);
        e.aware=(obst>=0&&obst<10); // 10m内障碍自我检测(感知标记)
        if(obst>=0&&obst<5){
          if(!e.av||e.avT>1.4){e.av=Math.random()<0.5?1:-1;e.avT=0;} // 换绕行侧
          e.avT=(e.avT||0)+dt;
          vx=(-uz*e.av*e.speed*sprint*rage+tx*e.speed*strafe)*stun; // 垂直绕障碍
          vz=(ux*e.av*e.speed*sprint*rage+tz*e.speed*strafe)*stun;
        }else{e.avT=0;e.av=0;
          vx=(dx/d*e.speed*sprint*rage+tx*e.speed*strafe)*stun;
          vz=(dz/d*e.speed*sprint*rage+tz*e.speed*strafe)*stun;}
      }
      var maxv=e.speed*sprint*rage,vs=Math.sqrt(vx*vx+vz*vz); // 合成速度限最大(绕障+strafe不超速)
      if(vs>maxv){vx*=maxv/vs;vz*=maxv/vs;}
      var enx=e.x+vx*dt,enz=e.z+vz*dt;
      if(e.fly){ // 无人机: 空中不参与地面碰撞(飞越掩体上方), 仅边界clamp
        e.x=Math.max(-25.3,Math.min(25.3,enx));e.z=Math.max(-25.3,Math.min(25.3,enz));
      }else{var enc=collide(enx,enz,0.6);e.x=enc[0];e.z=enc[1];} // 敌人碰撞(不穿障碍物)
    }
    var ey=e.y||0; // 无人机: 悬停高度(固定) + 上下浮动; 地面敌人 y=0 不变
    if(e.fly&&e.y!==undefined)ey=e.y+Math.sin(performance.now()*0.002)*0.3;
    var hitShake=(e.hitT>0)?(Math.random()-0.5)*0.1:0; // 受击微抖(命中瞬间模型横向抖动, 打击感)
    e.obj.position.set(e.x+hitShake,ey,e.z);
    e.obj.rotation.y=Math.atan2(dx,dz);
    if(e.fly&&e.obj.userData&&e.obj.userData.rotors){ // 无人机旋翼旋转动画
      for(var ri=0;ri<e.obj.userData.rotors.length;ri++)e.obj.userData.rotors[ri].rotation.y+=dt*18;
    }
    // 远程射击(仅警戒内)
    if(e.shoot){e.shootCd-=dt;
      if(e.shootCd<=0&&d<alertRange){e.shootCd=e.shootRate;fireEnemyBullet(e);}}
    // 近战攻击
    e.cool-=dt;
    if(e.type==='brute'&&e.scale&&e.scale>1){ // Boss震击(AOE, 冷却3秒, 仅头目不适用坦克)
      e.shockCd=(e.shockCd||0)-dt;
      if(d<2.5&&e.shockCd<=0){e.shockCd=3;
        if(player.invulnT<=0){player.hp-=15;hitFlash();if(window.hurtCine)window.hurtCine();}
        shake(0.12,0.4);if(window.boomFx)window.boomFx(player.x,1,player.z);}
      // 头目特工史密斯不召唤小兵(1v1, 击败后出口开启, 胜利条件干净)
    }
    if(d<1.5&&e.cool<=0&&player.invulnT<=0){e.cool=1.2;player.hp-=e.dmg;hitFlash();sfx('crate');if(window.hurtCine)window.hurtCine();
      if(player.hp<=0)doGameOver();}
  });
  // 清理死亡
  enemies=enemies.filter(function(e){return e.hp>0;});
  updateEnemyBullets(dt);
}
/* 敌人远程子弹 */
function fireEnemyBullet(e){
  var dx=player.x-e.x,dz=player.z-e.z,d=Math.sqrt(dx*dx+dz*dz)||1;
  var ang=Math.atan2(dz,dx)+(Math.random()-0.5)*0.14; // 敌弹散布(±4°准度低)
  // 弹种: 无人机从空中射击(y=3.0, 速度稍快); 坦克炮弹(更大/更慢/伤高); 普通敌弹(y=1.2)
  var bY=e.fly?3.0:(e.type==='tank'?1.6:1.2);
  var bSpd=e.fly?9:(e.type==='tank'?5.5:8);
  var bR=e.type==='tank'?0.3:(e.fly?0.14:0.16);
  var bCol=e.type==='tank'?0xff8820:0xff4040;
  var b={x:e.x,y:bY,z:e.z,vx:Math.cos(ang)*bSpd,vz:Math.sin(ang)*bSpd,dmg:e.shootDmg||6,life:3.2};
  b.type=e.type; // 子弹携带敌型(供爆炸/落地音效判定, 不改弹道/伤害)
  var mesh=new THREE.Mesh(new THREE.SphereGeometry(bR,8,6),
    new THREE.MeshBasicMaterial({color:bCol,transparent:true,opacity:1}));
  mesh.userData.noRay=true;mesh.position.set(b.x,b.y,b.z);scene.add(mesh);b.obj=mesh;eBullets.push(b);
  if(e.gun&&e.gun.material){e.gun.material.emissive=new THREE.Color(0xffaa44); // 枪口闪光预警
    setTimeout(function(){if(e.gun&&e.gun.material)e.gun.material.emissive=new THREE.Color(0x000000);},60);}
  window.__sfxPan=Math.max(-1,Math.min(1,(e.x-player.x)/14)); // 3D分级pan(敌人相对玩家左右)
  sfx('hit'); // 敌人开火音效(听觉预警)
  if(e.type==='tank')sfx('tank'); // 坦克炮击专属重音
  else if(e.type==='drone')sfx('drone'); // 无人机旋翼/射击音
}
function updateEnemyBullets(dt){
  for(var i=eBullets.length-1;i>=0;i--){var b=eBullets[i];
    b.x+=b.vx*dt;b.z+=b.vz*dt;b.life-=dt;
    b.travel=(b.travel||0)+Math.sqrt(b.vx*b.vx+b.vz*b.vz)*dt; // 飞行距离
    if(b.travel>18)b.dmg=1; // 敌人子弹衰减: 超18米威力降到1
    if(b.obj)b.obj.position.set(b.x,b.y,b.z);
    // 墙/箱/掩体/桶碰撞(NPC子弹被障碍物挡, 不穿墙打人)
    var hitWall=false;
    for(var wpi=0;wpi<props.length;wpi++){var wp=props[wpi];
      if(b.y>1.5&&wp.h!==undefined&&wp.h<b.y-0.1)continue; // 空中弹(无人机): 越过低矮掩体(高度低于弹道)
      if(wp.type==='wall'){var wox=Math.abs(b.x-wp.x)-wp.hw,woz=Math.abs(b.z-wp.z)-wp.hd;
        if(wox<0&&woz<0){hitWall=true;break;}}
      else if(wp.r){var wdx=b.x-wp.x,wdz=b.z-wp.z;
        if(wdx*wdx+wdz*wdz<wp.r*wp.r){hitWall=true;break;}}}
    if(hitWall){if(b.type==='tank')sfx('explosion'); // 坦克炮弹命中障碍爆炸
      if(b.obj)scene.remove(b.obj);eBullets.splice(i,1);continue;}
    var dx=b.x-player.x,dz=b.z-player.z;
    if(dx*dx+dz*dz<0.6&&player.invulnT<=0){player.hp-=b.dmg;hitFlash();if(window.hurtCine)window.hurtCine();
      if(player.hp<=0)doGameOver();
      if(b.obj)scene.remove(b.obj);eBullets.splice(i,1);continue;}
    if(b.life<=0){if(b.type==='tank')sfx('explosion'); // 坦克炮弹落地爆炸
      if(b.obj)scene.remove(b.obj);eBullets.splice(i,1);}
  }
}
function hitFlash(){
  player.invulnT=Math.max(player.invulnT||0,0.4); // 被击后0.4s无敌(防连击秒杀)
  spawnSpark(new THREE.Vector3(player.x,1.5,player.z)); // 被击火花
  var chc=document.getElementById('crosshair');if(chc){chc.style.color='#ff4455'; // 被击准星闪红
    setTimeout(function(){chc.style.color='';},150);}
  document.body.style.background='rgba(255,0,0,0.15)';
  setTimeout(function(){document.body.style.background='';},80);
  shake(0.02,0.12); // 受击震动(轻微, 防长时间晃屏)
  if(elHp){elHp.textContent=Math.max(0,Math.floor(player.hp));elHp.style.color=player.hp<30?'#ff4455':'#7dff9a';}
}
function doGameOver(){
  gameOver=true;
  if(document.pointerLockElement)document.exitPointerLock();
  // 无菜单: 阵亡后自动重新开始
  setTimeout(function(){location.reload();},800);
}

/* ===== 输入绑定 ===== */
function bindInput(){
  addEventListener('keydown',function(e){keys[e.code]=true;window.__autoPlay=false;
    if(e.code==='KeyR')reload();
    if(e.code==='Digit1')switchWeapon('rifle');
    if(e.code==='Digit2')switchWeapon('pistol');
    if(e.code==='KeyG')throwGrenade(); // 手雷
  });
  addEventListener('keyup',function(e){keys[e.code]=false;});
  var canvas=document.getElementById('game');
  canvas.addEventListener('click',function(){if(gameOver)return;if(!locked){startGame();}else{var c=document.getElementById('game');try{if(c.requestPointerLock&&!document.pointerLockElement)c.requestPointerLock();}catch(e){}}});
  document.addEventListener('pointerlockchange',function(){locked=!!document.pointerLockElement;});
  addEventListener('mousemove',function(e){
    mpx=e.clientX;mpy=e.clientY; // 记录光标位置(虚拟摇杆兜底)
    if(!locked)return;
    // 仅当指针锁定真正生效时, 才用movement自由转视角(真实FPS手感)
    // 指针锁定被拒(iframe/浏览器拒绝)时: 用虚拟摇杆兜底(主循环基于光标位置), 不用movement
    // 避免鼠标滑到UI按钮途中视角狂转("人飞了")
    if(document.pointerLockElement&&!window.__uiHold){
      player.ry-=e.movementX*0.0022;
      player.pitch-=e.movementY*0.0022;
      player.pitch=Math.max(-1.5,Math.min(1.5,player.pitch));
    }
  });
  addEventListener('mousedown',function(e){if(e.button===0){window.__autoPlay=false;mouseDown=true;if(!locked&&!gameOver)startGame();}if(e.button===2)ads=true;});
  addEventListener('mouseup',function(e){if(e.button===2)ads=false;});
  addEventListener('contextmenu',function(e){e.preventDefault();}); // 右键ADS(阻止菜单)
  addEventListener('mouseup',function(e){if(e.button===0)mouseDown=false;});
  addEventListener('resize',function(){camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);});
  if(IS_MOBILE)bindTouch();
}
/* ===== 移动端触屏控制 ===== */
function bindTouch(){
  var joyEl=document.getElementById('joy'),joyKnob=document.getElementById('joyKnob');
  var lookEl=document.getElementById('lookZone');
  var R=50; // 摇杆半径
  // 左摇杆: 移动
  joyEl.addEventListener('touchstart',function(e){e.preventDefault();if(!locked&&!gameOver)startGame();
    var t=e.changedTouches[0];joy.active=true;joy.id=t.identifier;
    var r=joyEl.getBoundingClientRect();joy.cx=r.left+r.width/2;joy.cy=r.top+r.height/2;},{passive:false});
  addEventListener('touchmove',function(e){
    for(var i=0;i<e.changedTouches.length;i++){var t=e.changedTouches[i];
      if(t.identifier===joy.id){ // 摇杆
        var dx=t.clientX-joy.cx,dy=t.clientY-joy.cy;
        var len=Math.sqrt(dx*dx+dy*dy),cl=Math.min(len,R);
        joy.dx=len?(dx/len)*(cl/R):0;joy.dy=len?(dy/len)*(cl/R):0;
        joyKnob.style.transform='translate('+(len?dx/len*cl:0)+'px,'+(len?dy/len*cl:0)+'px)';
      }else if(t.identifier===look.id){ // 右侧滑动瞄准
        player.ry-=(t.clientX-look.lx)*0.005;
        player.pitch-=(t.clientY-look.ly)*0.005;
        player.pitch=Math.max(-1.5,Math.min(1.5,player.pitch));
        look.lx=t.clientX;look.ly=t.clientY;
      }}
  },{passive:false});
  function endTouch(e){for(var i=0;i<e.changedTouches.length;i++){var t=e.changedTouches[i];
    if(t.identifier===joy.id){joy.active=false;joy.dx=joy.dy=0;joy.id=null;joyKnob.style.transform='translate(0,0)';}
    if(t.identifier===look.id)look.id=null;}}
  addEventListener('touchend',endTouch);addEventListener('touchcancel',endTouch);
  // 右侧瞄准区(除摇杆和按钮外的触摸)
  lookEl.addEventListener('touchstart',function(e){e.preventDefault();if(!locked&&!gameOver)startGame();
    var t=e.changedTouches[0];look.id=t.identifier;look.lx=t.clientX;look.ly=t.clientY;},{passive:false});
  // 开火按钮: 按住=开火, 同时该手指移动也转视角(开火键=开火+自由移动视角)
  var fire=document.getElementById('btnFire');
  fire.addEventListener('touchstart',function(e){e.preventDefault();if(!locked&&!gameOver)startGame();mouseDown=true;
    var t=e.changedTouches[0];if(look.id===null){look.id=t.identifier;look.lx=t.clientX;look.ly=t.clientY;}},{passive:false});
  fire.addEventListener('touchmove',function(e){e.preventDefault();
    for(var i=0;i<e.changedTouches.length;i++){var t=e.changedTouches[i];
      if(t.identifier===look.id){player.ry-=(t.clientX-look.lx)*0.005;
        player.pitch-=(t.clientY-look.ly)*0.005;
        player.pitch=Math.max(-1.5,Math.min(1.5,player.pitch));
        look.lx=t.clientX;look.ly=t.clientY;}}},{passive:false});
  fire.addEventListener('touchend',function(e){e.preventDefault();mouseDown=false;},{passive:false});
  // 换弹/切枪/冲刺
  document.getElementById('btnReload').addEventListener('touchstart',function(e){e.preventDefault();reload();},{passive:false});
  document.getElementById('btnSwap').addEventListener('touchstart',function(e){e.preventDefault();
    switchWeapon(curWeapon==='rifle'?'pistol':'rifle');},{passive:false});
  document.getElementById('btnSprint').addEventListener('touchstart',function(e){e.preventDefault();keys.ShiftLeft=true;},{passive:false});
  document.getElementById('btnSprint').addEventListener('touchend',function(e){keys.ShiftLeft=false;});
}
var dragging=false,mpx=innerWidth/2,mpy=innerHeight/2;
function startGame(){
  locked=true; // 立即开始(不阻塞在pointer lock)
  var c=document.getElementById('game');
  try{if(c.requestPointerLock)c.requestPointerLock();}catch(e){}
  if(gameOver)location.reload();
  startBgm(); // 背景音乐(用户交互后解锁)
  taskTime=60; // 60秒限时从头计(波次由剧本导演updateWave生成)
}
// pointer lock失败时用鼠标拖动瞄准兜底
document.addEventListener('pointerlockerror',function(){locked=true;});
var canvas=document.getElementById('game');
canvas.addEventListener('mousedown',function(e){if(locked)dragging=true;});
addEventListener('mouseup',function(){dragging=false;});
/* ===== 碰撞检测(圆形) ===== */
/* NPC逐个生成: 队列+边缘诞生地(地图边缘随机) */
var spawnQueue=[],spawnCd=0;
function edgePos(){var s=Math.random()<0.5?1:-1; // 地图边缘随机点(±14-17)
  if(Math.random()<0.5)return {x:s*(14+Math.random()*3),z:(Math.random()-0.5)*26};
  return {x:(Math.random()-0.5)*26,z:s*(14+Math.random()*3)};}
function collide(nx,nz,pad){
  if(pad===undefined)pad=0.25;  for(var i=0;i<props.length;i++){var p=props[i];
    if(p.type==='wall'){ // 矩形墙碰撞(AABB) — 稳健推离: 在墙扩边内则推到最近边外
      var wpx=p.hw+pad,wpz=p.hd+pad;
      var ox=Math.abs(nx-p.x),oz=Math.abs(nz-p.z);
      if(ox<wpx&&oz<wpz){ // 在扩边矩形内(含墙)
        var pxd=wpx-ox,pzd=wpz-oz; // 到x边/z边的穿透深度
        // 推到穿透较浅的那条边外(保持玩家在接近前的一侧)
        if(pxd<pzd)nx=p.x+Math.sign(nx-p.x||1)*wpx;
        else nz=p.z+Math.sign(nz-p.z||1)*wpz;
      }
    }else{ // 圆形道具
      var dx=nx-p.x,dz=nz-p.z,d=Math.sqrt(dx*dx+dz*dz);
      if(d<p.r+0.3&&d>0.001){var push=(p.r+0.3-d);nx+=dx/d*push;nz+=dz/d*push;}
    }
  }
  // 可破坏木箱(圆形碰撞, 破坏后可通行)
  for(var ci=0;ci<crates.length;ci++){var cr2=crates[ci];
    var cdx=nx-cr2.x,cdz=nz-cr2.z,cd2=Math.sqrt(cdx*cdx+cdz*cdz);
    if(cd2<0.85&&cd2>0.001){var cpush=(0.85-cd2);nx+=cdx/cd2*cpush;nz+=cdz/cd2*cpush;}
  }
  // 边界
  nx=Math.max(-25.3,Math.min(25.3,nx));nz=Math.max(-25.3,Math.min(25.3,nz)); // 边界clamp随地图扩大 ±19.3→±25.3
  return [nx,nz];
}
/* ===== 玩家移动 ===== */
/* ===== 自动玩演示模式(AI控制玩家: 走位/瞄准/射击/跳跃) ===== */
window.__autoPlay=false; // 自动玩已关闭: 纯手动操控(玩家自己玩)
var __auto={jump:0},_rayBox=new THREE.Box3(),_rayHit=new THREE.Vector3();
function autoPlay(dt){
  keys.KeyW=keys.KeyS=keys.KeyD=keys.KeyA=false;keys.ShiftLeft=false;
  // 记录敌人速度(预判瞄准用)
  for(var i=0;i<enemies.length;i++){var e0=enemies[i];
    if(e0.px!==undefined&&dt>0.001){e0.vx=(e0.x-e0.px)/dt;e0.vz=(e0.z-e0.pz)/dt;}
    e0.px=e0.x;e0.pz=e0.z;}
  // 优先瞄锁定目标(打死才能打另一人), 否则最近敌人
  // 锁定敌被墙遮挡 → 解锁换目标(防卡墙后无法切换)
  if(lockTarget&&lockTarget.hp>0){
    var ldx=lockTarget.x-player.x,ldz=lockTarget.z-player.z,ld=Math.sqrt(ldx*ldx+ldz*ldz);
    if(ld>0.001){var lux=ldx/ld,luz=ldz/ld;
      if(!lockTarget.fly){var lwd=rayWallDist(player.x,player.z,lux,luz);
        if(lwd>=0&&lwd<ld-0.5){lockTarget=null;}}} // 墙在敌前: 解锁(空中无人机不受地面遮挡)
  }
  var pref=lockTarget&&lockTarget.hp>0?lockTarget:null,best=pref,bd=1e9;
  var fwx=-Math.sin(player.ry),fwz=-Math.cos(player.ry); // 准星方向
  var nearE=null,nearD=1e9,alignE=null,alignDot=-2;
  for(var j=0;j<enemies.length;j++){var e=enemies[j];if(e.hp<=0||!e.obj)continue;
    var dx=e.x-player.x,dz=e.z-player.z,d=dx*dx+dz*dz;
    var vd=Math.sqrt(d),vux2=0,vuz2=0;
    if(vd>0.001){vux2=dx/vd;vuz2=dz/vd;
      if(!e.fly){var vwd=rayWallDist(player.x,player.z,vux2,vuz2);
        if(vwd>=0&&vwd<vd-0.5)continue;}} // 墙在敌前: 跳过(不可见; 空中无人机不受地面遮挡)
    if(vd<nearD){nearD=vd;nearE=e;} // 最近可见敌(回退用)
    var vl=vd||1;var dot=(vux2/vl)*fwx+(vuz2/vl)*fwz; // 敌方向·准星方向(1=正对准星)
    if(dot>alignDot){alignDot=dot;alignE=e;} // 与准星最对齐的可见敌
  }
  if(!pref){ // 无锁定: 优先与准星最对齐的可见敌(瞄准目标=准星命中目标), 否则最近可见敌
    if(alignDot>0.5){best=alignE;bd=nearE&&alignE?(alignE.x-player.x)*(alignE.x-player.x)+(alignE.z-player.z)*(alignE.z-player.z):1e9;}
    else if(nearE){best=nearE;bd=nearD*nearD;}
  } else { best=pref; bd=(pref.x-player.x)*(pref.x-player.x)+(pref.z-player.z)*(pref.z-player.z); }
  if(!best){mouseDown=false;
    // 头目已死(出口开启): 跑到走廊尽头出口门(胜利目标)
    if(flag.ready&&!flag.taken){var fdx=flag.x-player.x,fdz=flag.z-player.z;
      var ft=Math.atan2(-fdx,-fdz);var fdiff=ft-player.ry;
      while(fdiff>Math.PI)fdiff-=2*Math.PI;while(fdiff<-Math.PI)fdiff+=2*Math.PI;
      player.ry+=Math.max(-0.08,Math.min(0.08,fdiff*0.3));player.pitch=-0.2;
      if(Math.sqrt(fdx*fdx+fdz*fdz)>1.2){keys.KeyW=true;if(Math.sqrt(fdx*fdx+fdz*fdz)>7)keys.ShiftLeft=true;}}
    else if(enemies.length){ // 无可见敌(掩体后): 向最近敌人推进找射击角度(防卡死)
      var ne=null,nd=1e9;
      for(var q=0;q<enemies.length;q++){var qe=enemies[q];if(qe.hp<=0)continue;
        var qx=qe.x-player.x,qz=qe.z-player.z,qd=qx*qx+qz*qz;if(qd<nd){nd=qd;ne=qe;}}
      if(ne){var nfdx=ne.x-player.x,nfdz=ne.z-player.z;
        var nft=Math.atan2(-nfdx,-nfdz);var nfd=nft-player.ry;
        while(nfd>Math.PI)nfd-=2*Math.PI;while(nfd<-Math.PI)nfd+=2*Math.PI;
        player.ry+=Math.max(-0.08,Math.min(0.08,nfd*0.3));player.pitch=-0.2;
        keys.KeyW=true;if(Math.sqrt(nd)>6)keys.ShiftLeft=true;}}
    return;}
  // 瞄准: 甩枪咬准敌人当前位置(hitscan无飞行时间不需预测; 预测在13fps下噪声大反而打空)
  var cp=camera?camera.position:{x:player.x,y:1.7,z:player.z};
  var eddx=best.x-cp.x,eddz=best.z-cp.z,edd=Math.sqrt(eddx*eddx+eddz*eddz)||1;
  var tgt=Math.atan2(-(best.x-cp.x),-(best.z-cp.z));
  var diff=tgt-player.ry;while(diff>Math.PI)diff-=2*Math.PI;while(diff<-Math.PI)diff+=2*Math.PI;
  var aimSpeed=Math.min(0.22,dt*22); // 平滑转头(原1.0/帧≈57°剧晃→0.22/帧≈12.6°平滑, 根治镜头晃动)
  player.ry+=Math.max(-aimSpeed,Math.min(aimSpeed,diff));
  // 垂直瞄准: 瞄敌人躯体中心(碰撞体1.8m高→中心约脚+0.9m), 计算真实pitch(含后坐力补偿)
  var eyeH=1.7, targetY=best.y!==undefined?best.y+0.9:0.9; // best.y为脚部高度(眼高1.7=player.y)
  if(best.obj&&best.obj.position)targetY=best.obj.position.y+0.9*(best.scale||1); // 按体型缩放瞄躯干中心(头目更大→瞄更高)
  player.pitch=Math.atan2(targetY-eyeH,edd); // 真实几何pitch瞄中心(无补偿; 补偿方向不确定时先求稳)
  var tol=Math.atan2(0.45*(best.scale||1),edd)*1.0+0.01; // 容差≈敌人半径张角(按体型放大, 配合几何门控, 双重保证开火必命中)
  tol=Math.max(0.03,Math.min(0.2,tol));
  mouseDown=Math.abs(diff)<tol; // 瞄准才射
  // 清除与当前目标不匹配的锁定(shoot会作废非锁定目标的命中, 导致命中率崩)
  if(lockTarget&&lockTarget.hp>0&&best!==lockTarget){lockTarget=null;}
  // 几何门控(中等盒0.6×2.0): 准星穿敌人才射(命中保障)+一定射速(交火密集, 观赏性平衡)
  if(best.obj&&camera){
    camera.rotation.set(player.pitch+recoil,player.ry,0,'YXZ');
    camera.updateMatrixWorld(true);scene.updateMatrixWorld();
    raycaster.setFromCamera({x:0,y:0},camera);
    var _ep=best.obj.position,_es=best.obj.scale?best.obj.scale.x:1;
    _rayBox.min.set(_ep.x-0.35*_es,_ep.y,_ep.z-0.35*_es);
    _rayBox.max.set(_ep.x+0.35*_es,_ep.y+1.95*_es,_ep.z+0.35*_es);
    if(!raycaster.ray.intersectBox(_rayBox,_rayHit)){mouseDown=false;}
  }
  var dd=Math.sqrt(bd);
  keys.ShiftLeft=true; // 走位时冲刺(0.25s无敌保命)
  // 低血量保命: hp<25且敌贴近 → 撤退拉开(保命, 不主动送)
  if(player.hp<25&&dd<7){keys.KeyW=false;keys.KeyS=true;keys.KeyD=Math.random()<0.5;}
  // 距离战术: 走廊直线推进: 远冲刺接近, 极近稍微拉开, 其余持续压上
  if(curWeapon==='dagger'){if(dd>1.0)keys.KeyW=true;}
  else if(dd<2.2)keys.KeyS=true;                  // 敌人极近(<2.2米)拉开
  else{keys.KeyW=true;if(dd>7)keys.ShiftLeft=true;} // 走廊: 持续朝敌压上(>7m冲刺), 不侧移绕圈
  // 换弹中: 主动侧移+撤退走位(人类换弹习惯, 避免原地挨打)
  if(reloading){keys.KeyW=false;keys.KeyS=false;keys.KeyD=true;keys.ShiftLeft=false;} // 换弹中: 纯侧移绕行
  // 走位避障: 前进/后退方向<1.6m有障碍 → 侧移绕行(防卡墙)
  var fmx=-Math.sin(player.ry),fmz=-Math.cos(player.ry);
  if(keys.KeyW){var fw=rayWallDist(player.x,player.z,fmx,fmz);
    if(fw>=0&&fw<1.6){keys.KeyW=false;keys.KeyD=true;}}
  if(keys.KeyS){var bw=rayWallDist(player.x,player.z,-fmx,-fmz);
    if(bw>=0&&bw<1.6){keys.KeyS=false;keys.KeyD=true;}}
  // 周期轻跳(4s)
  __auto.jump+=dt;
  if(__auto.jump>4){keys.Space=true;__auto.jump=0;}
  else if(__auto.jump>0.12)keys.Space=false;
}
function updatePlayer(dt){
  if(player.vy===undefined){player.vy=0;player.grounded=true;}
  var sp=(keys.ShiftLeft||keys.ShiftRight)?4.6:2.8;
  player.stepCd=(player.stepCd||0)-dt; // 冲刺脚步音效冷却
  if((keys.ShiftLeft||keys.ShiftRight)&&player.stepCd<=0){sfx('step');player.stepCd=0.28;}
  // 冲刺无敌帧: 冲刺期间0.25秒免伤
  player.invulnT=Math.max(0,(player.invulnT||0)-dt);
  if(keys.ShiftLeft||keys.ShiftRight)player.invulnT=0.25;
  var fx=-Math.sin(player.ry),fz=-Math.cos(player.ry);
  var rx=Math.cos(player.ry),rz=-Math.sin(player.ry);
  var mx=0,mz=0;
  if(keys.KeyW){mx+=fx;mz+=fz;}if(keys.KeyS){mx-=fx;mz-=fz;}
  if(keys.KeyD){mx+=rx;mz+=rz;}if(keys.KeyA){mx-=rx;mz-=rz;}
  // 移动端摇杆输入(向量直接映射到前后左右)
  if(joy.active){mx+=fx*(-joy.dy)+rx*joy.dx;mz+=fz*(-joy.dy)+rz*joy.dx;}
  var len=Math.sqrt(mx*mx+mz*mz);
  if(len>0){mx=mx/len*sp*dt;mz=mz/len*sp*dt;
    var nc=collide(player.x+mx,player.z+mz);player.x=nc[0];player.z=nc[1];}
  // 跳跃/下蹲(玩家动作)
  var baseY=(keys.KeyC)?1.0:1.7;
  if(keys.Space&&player.grounded){player.vy=2.4;player.grounded=false;sfx('crate');} // 跳跃音效
  player.vy-=9.8*dt;player.y+=player.vy*dt;
  if(player.y<=baseY){player.y=baseY;player.vy=0;player.grounded=true;}
  // 相机(含武器后坐力恢复)
  camera.position.set(player.x,player.y,player.z);
  camera.rotation.set(player.pitch+recoil,player.ry,0,'YXZ');
  recoil=Math.max(0,recoil-dt*0.10); // 后坐力回弹(每秒恢复0.10)
  weaponKick=Math.max(0,weaponKick-dt*0.4);
  var bob=Math.sin(performance.now()*0.008)*(len>0?0.002:0);
  camera.position.y=player.y+bob;
  // 屏幕震动(受击/爆炸反馈, 轻微)
  if(shakeT>0){shakeT-=dt;camera.position.x+=(Math.random()-0.5)*shakeA*0.4;camera.position.y+=(Math.random()-0.5)*shakeA;shakeA*=0.92;}
  // 射击(自动/半自动)
  var a=AMMO[curWeapon];
  var now=performance.now();
  window.__fireDbg={md:mouseDown,lk:locked,mdType:typeof mouseDown,now:now,last:lastShot,willFire:(mouseDown&&locked&&(a.auto||!shotHeld)&&(now-lastShot)>=a.rate*1000)};
  if(mouseDown&&locked){
    if((a.auto||!shotHeld)&&(now-lastShot)>=a.rate*1000){shoot();lastShot=now;}
    shotHeld=true;
  }else shotHeld=false;
  // 武器摇摆(走路)
  if(weaponObjs[curWeapon]){
    var w=weaponObjs[curWeapon];
    w.position.set(0.22,-0.28+weaponKick*-0.4+bob,-0.5);
  }
}
var shootCool=0,shotHeld=false,lastShot=0;
/* ===== 波次系统 ===== */
/* ===== 剧本导演(矩阵走廊: 波次1保安 → 波次2特勤 → 头目特工史密斯 → 出口) ===== */
var DIR={stage:'wait',t:0,boss:null}; // stage: wait/wave1/fight1/wave2/fight2/boss/bossfight/exit
window.DIR=DIR; // 供killEnemy设置exit阶段
function spawnWave(list){
  for(var i=0;i<list.length;i++){var p=list[i];spawnEnemy(p[0],p[1],p[2],1);}
  sfx('wave');
}
function updateWave(dt){
  if(flag.won||flag.taken||gameOver)return;
  if(DIR.stage==='wait'){ // 开场运镜结束+玩家开始后启动波次1
    if(locked&&(!window.CINE||!window.CINE.intro)){DIR.stage='wave1';DIR.t=0.8;
      if(elHit){elHit.textContent='⚔ 波次1: 营地守卫!';elHit.classList.add('on');elHit.classList.add('kill');
        setTimeout(function(){elHit.classList.remove('on');elHit.classList.remove('kill');},1400);}}
  }else if(DIR.stage==='wave1'){DIR.t-=dt;
    if(DIR.t<=0){DIR.stage='fight1';
      spawnWave([[-0.5,9,'grunt'],[0.5,8,'grunt'],[-1,6.5,'grunt'],[0.5,4.5,'grunt'],[-0.7,3,'grunt'],[0.7,1.2,'grunt'],[0,-2.5,'grunt'],[-0.6,-5,'grunt']]);}
  }else if(DIR.stage==='fight1'){ // 波次1全灭 → 波次2
    if(enemies.length===0){DIR.stage='wave2';DIR.t=1.2;
      if(elHit){elHit.textContent='⚔ 波次2: 增援部队!';elHit.classList.add('on');elHit.classList.add('kill');
        setTimeout(function(){elHit.classList.remove('on');elHit.classList.remove('kill');},1400);}}
  }else if(DIR.stage==='wave2'){DIR.t-=dt;
    if(DIR.t<=0){DIR.stage='fight2';
      spawnWave([[-0.5,-3,'gunner'],[0.5,-5,'gunner'],[-1,-7,'gunner'],[0.5,-8,'gunner'],[-0.7,-1,'gunner'],[0.7,-10.5,'gunner'],[0,-12.5,'gunner'],[-0.6,-14.5,'gunner'],[3,-4,'drone'],[-3,-9,'drone']]);}
  }else if(DIR.stage==='fight2'){ // 波次2全灭 → 头目
    if(enemies.length===0){DIR.stage='boss';DIR.t=1.0;sfx('boss');
      if(elHit){elHit.textContent='⚠ 精英盾兵现身!';elHit.classList.add('on');elHit.classList.add('kill');
        setTimeout(function(){elHit.classList.remove('on');elHit.classList.remove('kill');},1500);}}
  }else if(DIR.stage==='boss'){DIR.t-=dt;
    if(DIR.t<=0){DIR.stage='bossfight';
      var b=spawnEnemy(0,-12,'brute',1);b.dmg=20;DIR.boss=b;
      spawnEnemy(2,-6,'tank',1); // 坦克作为重甲增援随头目现身
      if(elHit){elHit.textContent='⚠ 头目: 精英盾兵!';elHit.classList.add('on');elHit.classList.add('kill');
        setTimeout(function(){elHit.classList.remove('on');elHit.classList.remove('kill');},1500);}}
  } // bossfight: 等待killEnemy设置flag.ready + DIR.stage='exit'
  // HUD波次标签
  if(elWave){
    var label=DIR.stage==='wait'?'准备...':
      (DIR.stage==='wave1'||DIR.stage==='fight1')?'波次1 · 守卫':
      (DIR.stage==='wave2'||DIR.stage==='fight2')?'波次2 · 增援':
      (DIR.stage==='boss'||DIR.stage==='bossfight')?'头目 · 精英盾兵':'撤离 · 前往撤离点';
    elWave.textContent=enemies.length?(label+' · 剩余'+enemies.length):label;
  }
  if(elHp)elHp.textContent=Math.max(0,Math.floor(player.hp));
}
/* ===== 背景音乐 ===== */
function startBgm(){
  try{var el=document.getElementById('bgm');
    if(el&&el.paused){el.volume=0.35;el.loop=true;var pr=el.play();if(pr&&pr.catch)pr.catch(function(){});}}
  catch(e){}
}
/* ===== 音效 ===== */
var AC=null;
/* BGM路由: 把<audio>接入WebAudio图(createMediaElementSource), 才能进录制captureStream音轨.
   <audio>元素本身不经WebAudio, 若不接入, 录制只有sfx(音效)+静默源 → 背景音乐录不到 */
function setupBgmRoute(){
  try{
    var bgmEl=document.getElementById('bgm');
    if(!bgmEl||!AC||window.__bgmSrc)return; // 已初始化或条件不满足
    window.__bgmSrc=AC.createMediaElementSource(bgmEl); // 只创建一次(二次调用报错)
    window.__bgmGain=AC.createGain();window.__bgmGain.gain.value=0.5; // 音量由Gain控制(0.5录制清晰)
    window.__bgmSrc.connect(window.__bgmGain);
    window.__bgmGain.connect(AC.destination); // 扬声器(用户听到)
  }catch(e){console.warn('BGM路由失败',e);}
}
/* 音频解锁: 浏览器自动播放策略需用户手势, 一次交互解锁AC+BGM */
function unlockAudio(){ // 解锁音频: 移动端(iOS/Android)需用户手势, 每次手势都尝试(AC可能被系统suspend)
  try{if(!AC)AC=new (window.AudioContext||window.webkitAudioContext)();}catch(e){}
  try{if(AC&&AC.state==='suspended')AC.resume();}catch(e){}
  setupBgmRoute(); // BGM接入WebAudio(录制需要)
  try{var el=document.getElementById('bgm');
    if(el){el.muted=false;if(el.paused){el.volume=0.35;el.loop=true;var pr=el.play();if(pr&&pr.catch)pr.catch(function(){});}}}catch(e){}
}
['mousedown','touchstart','pointerdown','keydown'].forEach(function(ev){addEventListener(ev,unlockAudio,{passive:true});}); // 移动端触摸/指针均解锁
function sfx(t){
  try{if(!AC)AC=new (window.AudioContext||window.webkitAudioContext)();}catch(e){return;}
  try{if(AC.state==='suspended')AC.resume();}catch(e){} // 移动端AC初始suspended, 每次音效确保resume(否则无声)
  var map={rifle:[200,55,'sawtooth',0.16,0.22],pistol:[380,95,'square',0.13,0.18],
    kill:[650,1500,'triangle',0.28,0.24],hit:[160,65,'sawtooth',0.12,0.14],
    wave:[110,520,'square',0.5,0.12],hurt:[90,40,'sawtooth',0.18,0.2],
    grenade:[75,28,'sawtooth',0.5,0.32],crate:[220,70,'square',0.16,0.16],pickup:[900,1300,'sine',0.15,0.13],
    combo:[880,1900,'triangle',0.3,0.22],boss:[55,32,'square',0.6,0.3],step:[320,150,'sine',0.1,0.08],
    tank:[60,30,'sine',0.5,0.55],drone:[110,90,'sawtooth',0.22,0.10],
    tankhit:[1100,180,'square',0.18,0.22], // 坦克受击金属声(高频→低频快速衰减) — 新增音色, 自动接入__recDest输出总线
    explosion:[50,25,'sine',0.6,0.5],win:[440,880,'sine',0.5,0.3],lose:[110,55,'sine',0.9,0.3]};
  var p=map[t];if(!p)return;
  var now=AC.currentTime,sfxVol=0.9; // sfxVol: 新增合成层音量系数(防叠加过响/失真)
  var pan=window.__sfxPan||0;window.__sfxPan=0; // 3D分级pan(敌人相对玩家左右, 一次性消费)
  // 输出总线: 所有合成层→out→stereoPan(可选)→扬声器+录制(录制必需, 新音色必须接入__recDest)
  var out=AC.createGain();out.gain.value=1;
  try{
    if(AC.createStereoPanner){var pn=AC.createStereoPanner();pn.pan.value=Math.max(-1,Math.min(1,pan));
      out.connect(pn);pn.connect(AC.destination);if(window.__recDest)pn.connect(window.__recDest);}
    else{out.connect(AC.destination);if(window.__recDest)out.connect(window.__recDest);}
  }catch(e){try{out.connect(AC.destination);if(window.__recDest)out.connect(window.__recDest);}catch(e2){}}
  function osc(type,f0,f1,dur,peak,delay){ // 振荡层: 频率滑降+增益包络
    try{var d0=delay||0,o=AC.createOscillator(),gn=AC.createGain();
      o.type=type;o.frequency.setValueAtTime(Math.max(1,f0),now+d0);
      o.frequency.exponentialRampToValueAtTime(Math.max(1,f1),now+d0+dur);
      gn.gain.setValueAtTime(Math.max(0.0001,peak),now+d0);
      gn.gain.exponentialRampToValueAtTime(0.001,now+d0+dur);
      o.connect(gn);gn.connect(out);
      o.start(now+d0);o.stop(now+d0+dur);}catch(e){}
  }
  function noise(dur,type,f0,f1,peak,delay){ // 白噪层: Buffer噪声+滤波扫频
    try{var d0=delay||0,len=Math.max(1,Math.floor(AC.sampleRate*dur));
      var buf=AC.createBuffer(1,len,AC.sampleRate),ch=buf.getChannelData(0);
      for(var i=0;i<len;i++)ch[i]=Math.random()*2-1;
      var src=AC.createBufferSource();src.buffer=buf;
      var flt=AC.createBiquadFilter();flt.type=type;
      flt.frequency.setValueAtTime(Math.max(20,f0),now+d0);
      flt.frequency.exponentialRampToValueAtTime(Math.max(20,f1),now+d0+dur);
      var gn=AC.createGain();gn.gain.setValueAtTime(Math.max(0.0001,peak),now+d0);
      gn.gain.exponentialRampToValueAtTime(0.001,now+d0+dur);
      src.connect(flt);flt.connect(gn);gn.connect(out);
      src.start(now+d0);src.stop(now+d0+dur);}catch(e){}
  }
  if(t==='win'){ // 胜利: 上行琶音 660/880/1100 + 底层和声
    osc('sine',660,660,0.18,0.26*sfxVol,0);
    osc('sine',880,880,0.18,0.26*sfxVol,0.12);
    osc('sine',1100,1100,0.30,0.30*sfxVol,0.24);
    osc('triangle',330,660,0.5,0.10*sfxVol,0);
    return;
  }
  if(t==='tank'){ // 坦克炮击: 低频冲击+白噪爆音+金属冲击(厚重)
    osc('sine',60,30,0.5,0.45*sfxVol,0);
    noise(0.3,'lowpass',800,120,0.40*sfxVol,0);
    osc('triangle',300,120,0.25,0.18*sfxVol,0.02);
    return;
  }
  if(t==='explosion'){ // 爆炸: 白噪扫频(低通400→150)+低频长音
    osc('sine',50,25,0.6,0.40*sfxVol,0);
    noise(0.5,'lowpass',400,150,0.48*sfxVol,0);
    return;
  }
  if(t==='drone'){ // 无人机旋翼: 锯齿嗡嗡+LFO 5Hz调幅+射击高频短音
    osc('sawtooth',110,90,0.22,0.08*sfxVol,0);
    osc('sine',600,200,0.12,0.07*sfxVol,0.02);
    try{var do_=AC.createOscillator(),dg=AC.createGain(),dlf=AC.createOscillator(),dlo=AC.createGain();
      do_.type='sawtooth';do_.frequency.value=95;
      dlf.type='sine';dlf.frequency.value=5;dlo.gain.value=0.035*sfxVol;
      dlf.connect(dlo);dlo.connect(dg.gain); // LFO调幅
      dg.gain.setValueAtTime(0.06*sfxVol,now);
      dg.gain.exponentialRampToValueAtTime(0.001,now+0.22);
      do_.connect(dg);dg.connect(out);
      do_.start(now);do_.stop(now+0.22);dlf.start(now);dlf.stop(now+0.22);}catch(e){}
    return;
  }
  // 主振荡层(基础音色, 主音量保持p[4]不变)
  osc(p[2],p[0],p[1],p[3],p[4],0);
  if(t==='rifle'||t==='pistol'){ // 枪声: 白噪枪口爆音(低通3000)+高频谐波层(保留原增强)
    noise(t==='rifle'?0.09:0.07,'lowpass',3000,500,0.32*sfxVol,0);
    osc('square',p[0]*3,p[1]*2.5,p[3]*0.6,p[4]*0.4,0);
  }
  if(t==='wave'){ // 波次警报: 2连音(升级)
    osc('square',220,620,p[3]*0.8,p[4]*0.7,0.35);
  }
  if(t==='lose'){ // 失败: 低频噪声轰鸣衬底
    noise(0.7,'lowpass',300,80,0.16*sfxVol,0);
  }
}
/* ===== 主循环 ===== */
var frameCount=0;
var __perfFrames=0,__perfT0=0,__perfChecked=false;
function animate(){
  requestAnimationFrame(animate);frameCount++;
  // 性能自适应: 启动3秒后若FPS<20(低端设备/软件渲染), 自动关阴影保流畅(电影感靠光效/雾/暗角)
  if(!__perfChecked){
    if(__perfT0===0)__perfT0=performance.now();
    __perfFrames++;
    if(performance.now()-__perfT0>3000){
      __perfChecked=true;
      var fps=__perfFrames/((performance.now()-__perfT0)/1000);
      if(fps<20&&renderer.shadowMap.enabled){renderer.shadowMap.enabled=false;
        scene.traverse(function(o){if(o.material)o.material.needsUpdate=true;});}
      window.__perfFPS=fps;
    }
  }
  var dt=Math.min(clock.getDelta(),0.05);
  if(locked&&!gameOver){
    if(window.__autoPlay)autoPlay(dt);
    // 指针锁定不可用(iframe/浏览器拒绝requestPointerLock)时: 虚拟摇杆视角兜底
    // 仅当按住鼠标左键(开火)时, 光标偏离中心才转视角(符合"开火键=开火+自由移动"习惯)
    // 不按时光标自由移动(点录像按钮/UI)不转视角 → 不会"点击录像后人飞了"
    if(!document.pointerLockElement&&!window.__uiHold&&mouseDown){
      var vx=(mpx-innerWidth/2)/(innerWidth/2);
      var vy=(mpy-innerHeight/2)/(innerHeight/2);
      player.ry-=vx*2.6*dt;
      player.pitch-=vy*2.0*dt;
      player.pitch=Math.max(-1.5,Math.min(1.5,player.pitch));
    }
    // 60秒任务限时(开场运镜期间暂停计时, 运镜结束才开始)
    if(!flag.won&&!flag.taken&&(!window.CINE||!window.CINE.intro)){taskTime-=dt;if(taskTime<=0){taskTime=0;doLose();}}
    updatePlayer(dt);updateEnemies(dt);updatePickups(dt);updateGrenades(dt);updateFx(dt);updatePlayerBullets(dt);updateWave(dt);updateFlag(dt);updateCrosshair(dt);
    comboT-=dt;if(comboT<=0)combo=0; // 连杀超时归零
    try{if(window.__authReport)window.__authReport();}catch(e){}
  }
  updateParticles(dt); // 绿色数字雨/尘埃始终下落(电影氛围, 不依赖游戏状态)
  // 权威服务器: 首次锁定即启动录制+上报
  try{if(locked&&!window.__auth.active){window.__auth.active=true;window.__authStartRec();}}catch(e){}
  // 权威服务器: 游戏结束(胜利/阵亡/超时)自动停止录制+提交
  try{if((gameOver||flag.won)&&window.__auth&&window.__auth.rec&&!window.__auth.submitted){window.__authStopRec();}}catch(e){}
  // 本地录像: 游戏结束自动停止并下载
  try{if((gameOver||flag.won)&&window.__rec&&window.__rec.active)window.__recStop();}catch(e){}
  // ADS瞄准视野缩放
  camera.fov+=((ads?50:75)-camera.fov)*0.18;camera.updateProjectionMatrix();
  renderer.render(scene,camera);try{drawHud();}catch(e){}
  // 录制: 每帧合成3D场景+HUD+准星到录制canvas(准星是DOM, 需手动画入)
  // 节流: 每2帧合成一次(15fps录制够用, 降低drawImage+编码负载保帧率)
  try{if(window.__rec&&window.__rec.active&&frameCount%2===0)__recFrame();}catch(e){}

}
/* ===== 权威服务器模式: 状态上报 + 第一视角录制 + 自动提交 ===== */
var AUTH_SERVER=''; // 输出版不启用远程认证/录制(devkit专用, 避免网络噪音)
var __auth={active:false,lastX:null,lastZ:null,lastT:null,log:[],batch:[],pending:false,recorded:false,
  maxSpeed:6.0, // 允许最大速度(米/秒), 冲刺4.6+容差
  bound:80}; // 地图边界(米), 超出=穿墙/出界
function __authReport(){
  if(!AUTH_SERVER||!window.__fps)return;
  var p=window.__fps.player;
  var now=performance.now();
  var f={t:now,x:p.x,z:p.z,y:p.y,ry:p.ry,pitch:p.pitch,hp:p.hp,
    k:window.__fps.kills,sh:window.__fps.hitStats?window.__fps.hitStats.shots:0,
    hi:window.__fps.hitStats?window.__fps.hitStats.hits:0,
    en:window.__fps.enemies?window.__fps.enemies.length:0,
    won:window.__fps.flag?window.__fps.flag.won:false,over:window.__fps.gameOver,
    w:window.__fps.curWeapon};
  // 帧间速度验证(客户端本地标记, 服务器复核)
  if(__auth.lastX!==null&&__auth.lastT!==null){
    var ddx=f.x-__auth.lastX,ddz=f.z-__auth.lastZ;
    var dt=(f.t-__auth.lastT)/1000;
    if(dt>0.001){var spd=Math.sqrt(ddx*ddx+ddz*ddz)/dt;
      if(spd>__auth.maxSpeed)f.speedFlag='accel';}
  }
  if(Math.abs(f.x)>__auth.bound||Math.abs(f.z)>__auth.bound)f.posFlag='out';
  __auth.lastX=f.x;__auth.lastZ=f.z;__auth.lastT=f.t;
  __auth.log.push(f);
  // 批量上报(每15帧一次, 防刷屏)
  __auth.batch.push(f);
  if(__auth.batch.length>=15&&!__auth.pending){
    __auth.pending=true;var batch=__auth.batch;__auth.batch=[];
    try{fetch(AUTH_SERVER+'/report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({batch:batch,id:__auth.id})})
      .catch(function(){}).finally(function(){__auth.pending=false;});}catch(e){__auth.pending=false;}
  }
}
function __authStartRec(){
  if(!AUTH_SERVER)return;
  try{
    var canvas=document.querySelector('canvas');
    if(!canvas||__auth.recorded)return;
    var vs=canvas.captureStream(30);
    var ms=new MediaStream();vs.getVideoTracks().forEach(function(t){ms.addTrack(t);});
    if(window.__fps&&window.__fps.AC){try{var d=window.__fps.AC.createMediaStreamDestination();window.__recDest=d;d.stream.getAudioTracks().forEach(function(t){ms.addTrack(t);});}catch(e){}}
    var mt=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(function(m){return MediaRecorder.isTypeSupported(m);})||'video/webm';
    var rec=new MediaRecorder(ms,{mimeType:mt,videoBitsPerSecond:2500000,audioBitsPerSecond:128000});
    var chunks=[];rec.ondataavailable=function(e){if(e.data.size>0)chunks.push(e.data);};
    rec.onstop=function(){var blob=new Blob(chunks,{type:'video/webm'});
      var rd=new FileReader();rd.onload=function(){
        var b64=rd.result.split(',')[1];
        try{fetch(AUTH_SERVER+'/submit',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({id:__auth.id,log:__auth.log,videoB64:b64,meta:{kills:window.__fps.kills,won:window.__fps.flag.won,shots:window.__fps.hitStats.shots,hits:window.__fps.hitStats.hits,t:performance.now()}})})
          .catch(function(e){console.warn('提交失败',e);});}catch(e){console.warn('提交失败',e);};};
      rd.readAsDataURL(blob);};
    rec.start(1000);__auth.rec=rec;__auth.recorded=true;
  }catch(e){console.warn('录制启动失败',e);}
}
window.__auth=__auth;window.__authReport=__authReport;window.__authStartRec=__authStartRec;
window.__authStopRec=function(){
  try{if(window.__auth&&window.__auth.rec&&!window.__auth.submitted){window.__auth.submitted=true;window.__auth.rec.stop();}}catch(e){}
};
/* ===== 本地录像: 点击⏺录制, 结束下载.webm(无需远程服务器) ===== */
var __rec={rec:null,chunks:[],timer:null,t0:0,active:false,minDur:10,waiting:false}; // minDur=最短时长(快手下限), waiting=补录中
function __fmt(s){s=Math.max(0,Math.floor(s));return Math.floor(s/60)+':'+('0'+(s%60)).slice(-2);}
/* 每帧合成到录制canvas: 3D场景+HUD+准星(DOM准星不在webgl捕获内, 手动画) */
/* 竖屏(9:16): 横屏游戏画面cover等比缩放填满, 居中裁剪左右两侧(竖屏视频标准) */
function __recFrame(){
  if(!__rec.active||!__rec.ctx)return;
  var rc=__rec.canvas,ctx=__rec.ctx;
  try{
    ctx.clearRect(0,0,rc.width,rc.height);
    // cover: 等比缩放填满竖屏, 高度铺满, 宽度溢出→横向居中裁剪
    var gw=__rec.gameCanvas?__rec.gameCanvas.width:1,gh=__rec.gameCanvas?__rec.gameCanvas.height:1;
    var scale=Math.max(rc.width/gw,rc.height/gh);
    var dw=gw*scale,dh=gh*scale;
    var dx=(rc.width-dw)/2,dy=(rc.height-dh)/2;
    if(__rec.gameCanvas)ctx.drawImage(__rec.gameCanvas,dx,dy,dw,dh);
    if(__rec.hudCanvas)ctx.drawImage(__rec.hudCanvas,dx,dy,dw,dh);
    // 准星(十字线, 白+黑边): 跟随命中闪红, 竖屏中心(cover裁剪后画面中心对准)
    var cx=rc.width/2,cy=rc.height/2;
    var chl=document.getElementById('crosshair');
    var col=chl&&chl.style.color?chl.style.color:'#fff';
    ctx.strokeStyle='rgba(0,0,0,.8)';ctx.lineWidth=3;
    ctx.beginPath();ctx.moveTo(cx-14,cy);ctx.lineTo(cx+14,cy);ctx.moveTo(cx,cy-14);ctx.lineTo(cx,cy+14);ctx.stroke();
    ctx.strokeStyle=col;ctx.lineWidth=1.6;
    ctx.beginPath();ctx.moveTo(cx-14,cy);ctx.lineTo(cx+14,cy);ctx.moveTo(cx,cy-14);ctx.lineTo(cx,cy+14);ctx.stroke();
    // 暗角(与屏幕视觉一致, 电影质感)
    var vg=ctx.createRadialGradient(cx,cy,Math.min(rc.width,rc.height)*0.38,cx,cy,Math.max(rc.width,rc.height)*0.72);
    vg.addColorStop(0,'rgba(0,0,0,0)');vg.addColorStop(1,'rgba(0,0,0,0.5)');
    ctx.fillStyle=vg;ctx.fillRect(0,0,rc.width,rc.height);
  }catch(e){}
}
function __recTick(){
  if(!__rec.active)return;
  var el=document.getElementById('recBtn');
  if(el)el.textContent='● 录制中 '+__fmt((performance.now()-__rec.t0)/1000);
  __rec.timer=setTimeout(__recTick,500);
}
function __recStart(){
  if(__rec.active)return;
  try{
    // 每次新录制重置终止标志/补录态(否则上次录像后finalized=true → 本次__recStop2直接return, 录了不下发)
    __rec.finalized=false;__rec.waiting=false;
    if(__rec.waitIv){clearInterval(__rec.waitIv);__rec.waitIv=null;}
    var canvas=document.getElementById('game');
    var hudc2=document.getElementById('hudc');
    if(!canvas||!canvas.captureStream)return;
    // 合成录制canvas: 每帧把 3D场景+HUD+准星 画上去(准星是DOM, captureStream(webgl)捕不到)
    // 竖屏(9:16): 720×1280 输出竖屏视频(cover裁剪横屏画面, 居中保留中央走廊)
    var rc=document.createElement('canvas');
    rc.width=720;rc.height=1280;
    var rctx=rc.getContext('2d');
    __rec.canvas=rc;__rec.ctx=rctx;__rec.gameCanvas=canvas;__rec.hudCanvas=hudc2;
    var vs=rc.captureStream(30);
    // 强制关键帧间隔1秒: MediaRecorder的H.264默认GOP过大(实测3.9s仅1个I帧),
    // 快手等平台转码需合理GOP(关键帧间隔≤2-5s), 否则转码/seek失败 → 上传被拒
    try{vs.getVideoTracks().forEach(function(t){if(t.applyConstraints)t.applyConstraints({keyFrameInterval:1});});}catch(e){}
    var ms=new MediaStream();vs.getVideoTracks().forEach(function(t){ms.addTrack(t);});
    // 游戏音频(WebAudio振荡器)接入录制: 用闭包内AC(不依赖__fps.AC), 确保sfx()的振荡器被捕获
    try{
      if(!AC)AC=new (window.AudioContext||window.webkitAudioContext)();
      try{if(AC.state==='suspended')AC.resume();}catch(e2){} // 解锁音频(录制在用户点击手势内)
      setupBgmRoute(); // BGM接入WebAudio(必须在录制前, 否则<audio>不进音轨)
      var d=AC.createMediaStreamDestination();window.__recDest=d;
      d.stream.getAudioTracks().forEach(function(t){ms.addTrack(t);});
      // 背景音乐接入录制(主要声音): BGM经__bgmGain → 录制目标
      try{if(window.__bgmGain)window.__bgmGain.connect(d);}catch(e3){}
      // 持续静默源: 保证音频轨一直有数据(否则MediaRecorder不编码音轨 → 无声)
      var sil=AC.createOscillator(),silG=AC.createGain();
      sil.frequency.value=1;silG.gain.value=0.00001;
      sil.connect(silG);silG.connect(d);
      sil.start();
      window.__recSil=sil;
    }catch(e){console.warn('音频接入失败',e);}
    // 编码兼容: WebM(vp9/vp8+opus)浏览器原生稳定编码优先, 转码由/transcode统一转标准mp4下载;
    // mp4(avc1)兜底(部分Chrome MediaRecorder mp4音频封装快影读不出→无声, 转码后可解)
    var mt=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm','video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4']
      .find(function(m){return window.MediaRecorder&&MediaRecorder.isTypeSupported(m);})||'video/webm';
    __rec.chunks=[];__rec.mt=mt;
    // 高清晰度: 8Mbps视频 + 192Kbps音频
    __rec.rec=new MediaRecorder(ms,{mimeType:mt,videoBitsPerSecond:8000000,audioBitsPerSecond:192000});
    __rec.rec.ondataavailable=function(e){if(e.data&&e.data.size>0)__rec.chunks.push(e.data);};
    __rec.rec.onstop=function(){__recStop2();};
    __rec.rec.start(1000);
    __rec.active=true;__rec.t0=performance.now();__rec.timer=setTimeout(__recTick,500);
    var el=document.getElementById('recBtn');
    if(el){el.classList.add('rec');el.textContent='● 录制中 0:00';}
  }catch(e){console.warn('录制启动失败',e);}
}
function __recStop(breakWait){ // 停止录制: 若太短(<最短时长)自动补录到最短, 保证快手上传时长合规
  if(!__rec.active)return;
  if(__rec.waiting){ // 补录中: 仅手动(按钮)再点才立即停止; 自动(游戏结束)停止补录中忽略
    if(breakWait){__rec.waiting=false;__recDoStop();}return;
  }
  var elapsed=(performance.now()-__rec.t0)/1000;
  if(elapsed<__rec.minDur){ // 视频太短(快手时长下限) → 补录到最短时长
    __rec.waiting=true;
    var btn=document.getElementById('recBtn');
    __rec.waitIv=setInterval(function(){
      var left=__rec.minDur-(performance.now()-__rec.t0)/1000;
      if(btn)btn.textContent='● 补录 '+Math.max(0,left).toFixed(1)+'s';
      if(left<=0){clearInterval(__rec.waitIv);__rec.waitIv=null;__recDoStop();}
    },200);
    return;
  }
  __recDoStop();
}
function __recDoStop(){ // 真正停止录制
  __rec.active=false;
  if(__rec.timer)clearTimeout(__rec.timer);
  if(__rec.waitIv){clearInterval(__rec.waitIv);__rec.waitIv=null;} // 清理补录定时器(防重复停止/下载)
  try{if(__rec.rec&&__rec.rec.state!=='inactive')__rec.rec.stop();else __recStop2();}catch(e){__recStop2();}
}
function __recStop2(){ // 停止后组装blob → 上传转码标准mp4(快影/快手兼容) → 下载 + 页面内预览
  if(__rec.finalized)return;__rec.finalized=true; // 防重入: 同一次录像只下载一次
  var btn=document.getElementById('recBtn');
  var rawBlob=null,mt=__rec.mt||'video/webm';
  if(__rec.chunks.length)rawBlob=new Blob(__rec.chunks,{type:mt});
  if(btn){
    btn.classList.remove('rec');
    // 转码耗时提示: 预估基于录制时长(实测60s视频转码约40s满负载/20s空闲), 避免用户以为卡住而刷新/关页(下载丢失根因)
    var durS=(performance.now()-(__rec.t0||performance.now()-60000))/1000||60;
    btn.textContent='⏺ 转码中… 约'+Math.max(5,Math.round(durS*0.7))+'s';
  }
  if(!rawBlob){if(btn)btn.textContent='⏺ 录像';return;}
  // 转码实时耗时显示: 每250ms刷新已耗时, 让用户看到进度仍在进行; >90s提示保持页面打开
  var tT0=performance.now(),tTip=null,slowWarned=false;
  tTip=setInterval(function(){
    var el=(performance.now()-tT0)/1000;
    if(btn)btn.textContent='⏺ 转码中… '+el.toFixed(1)+'s';
    if(!slowWarned&&el>90){
      slowWarned=true;
      __recWarn('转码较慢(已>90s)，请保持页面打开，完成后将自动下载。','⏳ 转码较慢');
    }
  },250);
  var stamp=new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
  function done(blob,ext,warn){ // 下载 + 预览; warn=转码失败提示(明确告知, 不静默给损坏文件)
    if(tTip){clearInterval(tTip);tTip=null;}
    var url=URL.createObjectURL(blob);
    var a=document.createElement('a');
    a.href=url;a.download='fps_'+stamp+'.'+ext;
    a.style.display='none';a.rel='noopener';a.target='_blank';
    document.body.appendChild(a);a.click();a.remove();
    __recPreview(url,ext);
    if(warn)__recWarn(warn);
    setTimeout(function(){URL.revokeObjectURL(url);},60000);
    if(btn)btn.textContent='⏺ 录像';
  }
  // 上传本机ffmpeg转码 → 标准mp4(H.264 High+yuv420p+AAC+关键帧2s+faststart): 快影/快手编辑器兼容
  // (Chrome MediaRecorder的mp4音频封装在快影读不出→无声, 转码后为标准编码可解码)
  // 重试: 网络抖动/ffmpeg瞬时故障可自愈, 避免一次失败就回退原始webm(播放器判受损)
  function transcode(attempt){
    return fetch('/transcode',{method:'POST',body:rawBlob}).then(function(r){
      if(!r.ok)throw new Error('transcode '+r.status);
      return r.blob();
    }).catch(function(err){
      if(attempt<2)return new Promise(function(res){setTimeout(res,700);}).then(function(){return transcode(attempt+1);});
      throw err;
    });
  }
  transcode(0).then(function(std){done(std,'mp4');})
  .catch(function(){ // 转码最终失败: 仍下载原始文件(保留素材)但明确提示, 避免用户拿webm到快影/快手被判"受损"
    var ext=(mt.indexOf('mp4')>=0)?'mp4':'webm';
    var what=ext==='webm'?'WebM(部分编辑器不支持)':'原始文件';
    done(rawBlob,ext,'⚠️ 转码失败：已下载原始 .'+ext+' 文件('+what+')。若播放器提示“视频已受损/无法使用”，请用 Chrome/VLC 打开，或稍后重试录制；持续失败请检查转码服务(8022)。');
  });
}
function __recPreview(url,ext){
  var old=document.getElementById('recPreview');
  if(old)old.remove();
  var box=document.createElement('div');
  box.id='recPreview';
  box.style.cssText='position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:9999;background:rgba(10,14,12,.95);border:1px solid #4ae84a;border-radius:12px;padding:14px;box-shadow:0 8px 40px rgba(0,0,0,.6);width:min(560px,90vw)';
  box.innerHTML='<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font-size:14px;color:#4ae84a"><span>✅ 录像已生成 (.'+ext+') — 可播放</span><button id="recPrevClose" style="background:none;border:none;color:#aaa;font-size:20px;cursor:pointer;pointer-events:auto">✕</button></div><video controls autoplay style="width:100%;border-radius:8px;background:#000"></video>';
  document.body.appendChild(box);
  var v=box.querySelector('video');
  v.src=url;v.play().catch(function(){});
  var cb=box.querySelector('#recPrevClose');
  if(cb)cb.addEventListener('click',function(e){e.stopPropagation();box.remove();});
}
function __recWarn(msg,title){ // 转码失败/慢提示条: 明确告知用户, 避免静默下载webm被播放器判"受损"
  try{
    title=title||'⚠️ 转码失败';
    var old=document.getElementById('recWarn');
    if(old)old.remove();
    var w=document.createElement('div');
    w.id='recWarn';
    w.style.cssText='position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:10000;max-width:min(560px,92vw);background:rgba(120,40,8,.96);border:1px solid #ff8844;border-radius:10px;padding:10px 14px;color:#ffe8d0;font-size:13px;line-height:1.5;box-shadow:0 6px 24px rgba(0,0,0,.5)';
    w.innerHTML='<div style="font-weight:700;color:#ffb066;margin-bottom:4px">'+title+'</div><div>'+msg+'</div>';
    document.body.appendChild(w);
    setTimeout(function(){try{var e2=document.getElementById('recWarn');if(e2)e2.remove();}catch(e){}},12000);
  }catch(e){}
}
function __recToggle(){if(__rec.active)__recStop(true);else __recStart();}
window.__rec=__rec;window.__recToggle=__recToggle;window.__recStart=__recStart;window.__recStop=__recStop;
// 绑定录像按钮(点击开始/停止); 游戏结束时自动停止录像
function initRec(){
  var el=document.getElementById('recBtn');
  if(!el)return;
  // 光标进入按钮(悬停全程): 暂停视角旋转, 避免滑到按钮途中/点击后视角狂转("人飞了")
  el.addEventListener('mouseenter',function(){window.__uiHold=true;mpx=innerWidth/2;mpy=innerHeight/2;});
  el.addEventListener('mouseleave',function(){window.__uiHold=false;});
  // 阻止mousedown/pointerdown冒泡: 避免触发全局startGame/开火
  el.addEventListener('mousedown',function(e){e.stopPropagation();window.__uiHold=true;mpx=innerWidth/2;mpy=innerHeight/2;});
  el.addEventListener('pointerdown',function(e){e.stopPropagation();});
  el.addEventListener('mouseup',function(e){e.stopPropagation();});
  el.addEventListener('touchstart',function(e){e.stopPropagation();window.__uiHold=true;mpx=innerWidth/2;mpy=innerHeight/2;},{passive:false});
  el.addEventListener('touchend',function(e){e.stopPropagation();window.__uiHold=false;});
  el.addEventListener('click',function(e){e.stopPropagation();e.preventDefault();__recToggle();});
  // 光标进入顶部UI安全区(顶栏附近)或按钮外扩区: 暂停视角旋转(防滑向按钮途中视角狂转)
  addEventListener('mousemove',function(e){
    var r=el.getBoundingClientRect();
    var px=e.clientX,py=e.clientY;
    var near=(py<r.bottom+120)&&(px>=r.left-260&&px<=r.right+60); // 顶部右侧宽区(顶栏)+按钮周边
    if(near){window.__uiHold=true;if(!window.__uiHoldCenter){window.__uiHoldCenter=true;mpx=innerWidth/2;mpy=innerHeight/2;}}
    else{window.__uiHold=false;window.__uiHoldCenter=false;}
  });
}
window.__uiHold=false;
window.__fps={IS_MOBILE:IS_MOBILE,
  startGame:startGame,updatePlayer:updatePlayer,shoot:shoot,reload:reload,switchWeapon:switchWeapon,
  spawnEnemy:spawnEnemy,updateEnemies:updateEnemies,spawnPickup:spawnPickup,updatePickups:updatePickups,throwGrenade:throwGrenade,
  get player(){return player;},get enemies(){return enemies;},get AMMO(){return AMMO;},
  get score(){return score;},get kills(){return kills;},get curWeapon(){return curWeapon;},
  get locked(){return locked;},get fireCount(){return fireCount;},get joy(){return joy;},
  get models(){return models;},get scene(){return scene;},get camera(){return camera;},get renderer(){return renderer;},
  get props(){return props;},get weaponObjs(){return weaponObjs;},get pickups(){return pickups;},
  get grenades(){return grenades;},get grenadeCd(){return grenadeCd;},
  get flag(){return flag;},get gameOver(){return gameOver;},
  get taskTime(){return taskTime;},get DIR(){return DIR;},get taskOver(){return taskOver;},
  get AC(){return AC;},
  get hitStats(){return hitStats;},get accuracy(){return hitStats.accuracy;},
  get mouseDown(){return mouseDown;},set mouseDown(v){mouseDown=v;},
  get reloading(){return reloading;},get lockTarget(){return lockTarget;},
  get pstate(){return {x:player.x,z:player.z,ry:player.ry,pitch:player.pitch,hp:player.hp,vy:player.vy};},
  get kstate(){return {W:keys.KeyW,S:keys.KeyS,D:keys.KeyD,A:keys.KeyA,sh:keys.ShiftLeft,md:mouseDown};},
  diag:function(){return {models:Object.keys(models).length,drawCalls:renderer?renderer.info.render.calls:0,
    场景对象:scene.children.length,相机:camera.position.toArray().map(function(v){return +v.toFixed(1);})};}
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){init();initRec();});else{init();initRec();}
})();
