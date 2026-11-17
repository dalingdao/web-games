
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
  runner:{hp:120,speed:3.6,dmg:10,r:0.8,color:0x8a8a9a,scale:0.9,shoot:1,shootRate:2.4,shootDmg:6}   // 备用(未用)
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
  var boss=null;for(var bi=0;bi<enemies.length;bi++){if(enemies[bi].scale&&enemies[bi].scale>1&&enemies[bi].hp>0){boss=enemies[bi];break;}}
  var bb=document.getElementById('bossbar'),bh=document.getElementById('bosshp');
  if(bb&&bh){if(boss){bb.style.display='block';bh.style.width=(Math.max(0,boss.hp/boss.max*100))+'%';}else bb.style.display='none';}
  // 手雷冷却提示
  var gnd=document.getElementById('gnd');
  if(gnd)gnd.textContent=grenadeCd>0?('冷却 '+grenadeCd.toFixed(1)+'s'):'待发';
  // 敌人血条(投影到屏幕, 受击反馈)
  for(var ei=0;ei<enemies.length;ei++){var e=enemies[ei];if(e.hp<=0||!e.obj)continue;
    var v=new THREE.Vector3(e.x,2.4,e.z).project(camera);
    if(v.z>1||v.z<-1)continue;
    var sx=(v.x*0.5+0.5)*hudc.width,sy=(-v.y*0.5+0.5)*hudc.height;
    if(sx<-60||sx>hudc.width+60||sy<0||sy>hudc.height)continue;
    var w=44,h=5;
    hctx.fillStyle='rgba(0,0,0,0.65)';hctx.fillRect(sx-w/2,sy,w,h);
    var pct=Math.max(0,e.hp/e.max);
    hctx.fillStyle=e.type==='brute'?'#5f5':(e.type==='runner'?'#fd5':(e.type==='gunner'?'#c7f':'#f55'));
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
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap; // 基础PCF阴影(性能优于PCFSoft, 边缘锐利电影感)
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=0.86; // 电影感: 暗部深邃+绿光过曝
  // WebGL上下文丢失恢复(否则context lost后永久黑屏)
  canvas.addEventListener('webglcontextlost',function(e){e.preventDefault();
    console.warn('WebGL上下文丢失, 尝试恢复');});
  canvas.addEventListener('webglcontextrestored',function(){console.log('WebGL上下文已恢复');});
  scene=new THREE.Scene();scene.background=new THREE.Color(0x030806);
  var grid=new THREE.GridHelper(40,20,0x00ff66,0x0a3a22);grid.position.y=0.02;scene.add(grid); // 地面绿色矩阵网格(提亮)
  scene.fog=new THREE.Fog(0x030806,10,38); // 电影雾效: 深绿黑, 远处快速渐隐(更浓贴电影)
  camera=new THREE.PerspectiveCamera(75,innerWidth/innerHeight,0.05,200);
  clock=new THREE.Clock();raycaster=new THREE.Raycaster();
  // 灯光(矩阵风: 深暗环境+强烈绿光源, 高对比电影感)
  scene.add(new THREE.AmbientLight(0x1a2a20,0.55)); // 环境光(调暗, 暗部深邃)
  scene.add(new THREE.HemisphereLight(0x0f2a1a,0x020604,0.6)); // 半球光(微弱)
  var sun=new THREE.DirectionalLight(0x9fe8b0,0.9);sun.position.set(6,24,4);
  sun.castShadow=true;sun.shadow.mapSize.set(256,256); // 阴影贴图256(性能: 256×256最低, 电影质感仍够)
  sun.shadow.bias=-0.0004;
  Object.assign(sun.shadow.camera,{left:-16,right:16,top:16,bottom:-16});scene.add(sun); // 阴影范围收紧到走廊中心(性能)
  var p1=new THREE.PointLight(0x00ff88,1.6,30);p1.position.set(0,5,-12);scene.add(p1);
  var p2=new THREE.PointLight(0x00cc66,1.4,30);p2.position.set(0,5,10);scene.add(p2);
  // HUD
  elHp=document.getElementById('hp');elAmmo=document.getElementById('ammo');
  elWN=document.getElementById('wn');elScore=document.getElementById('score');elWave=document.getElementById('wave');
  elHit=document.getElementById('hit');
  bindInput();
  // 加载超时兜底: 6秒内没加载完也强制开始(用程序化几何体), 杜绝黑屏
  var started=false;
  function begin(){if(started)return;started=true;buildMap();buildFlag();setupWeapons();initParticles();animate();msg('击败特工史密斯, 抵达走廊尽头出口门!');startGame();}
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
    m.material.color=new THREE.Color(0x8a8a8a); // 压暗贴图(电影感暗部, 保留绿网格)
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
  sfx('boss');shake(0.08,0.3);
  if(elHit){elHit.textContent='✅ 逃离成功! 击杀 '+kills+' · 用时 '+Math.max(0,Math.ceil(60-taskTime))+'s';elHit.classList.add('on');elHit.classList.add('kill');
    setTimeout(function(){elHit.classList.remove('on');elHit.classList.remove('kill');},2500);}
  setTimeout(function(){location.reload();},2500); // 胜利后自动重开(可重玩)
}
function doLose(){ // 60秒未抵达出口: 任务失败
  if(gameOver)return; // 防同帧重复触发
  gameOver=true;mouseDown=false;sfx('crate');shake(0.1,0.35);
  if(elHit){elHit.textContent='⏰ 任务失败! 未在60秒内抵达出口';elHit.classList.add('on');elHit.classList.add('kill');
    setTimeout(function(){elHit.classList.remove('on');elHit.classList.remove('kill');},2500);}
  setTimeout(function(){location.reload();},2500); // 失败后自动重开
}
function buildMap(){
  var g=place('ground',0,0,0);if(g){g.scale.set(1,1,1);texAll(g,'ground',10);}
  // 走廊侧墙(左右, rotY=1: 6m宽×8.2m深, 5段/侧 覆盖z -20..20)
  for(var i=-16;i<=16;i+=8){addWall(-8,i,1);addWall(8,i,1);}
  // 走廊两端(前后, rotY=0: 8.2m宽×6m深, 2段/端 覆盖x -8..8)
  addWall(-4,20,0);addWall(4,20,0);   // 南端(出生点后方)
  addWall(-4,-20,0);addWall(4,-20,0); // 北端(出口)
  // 绿色霓虹横梁(矩阵风, 高发光过曝感)
  [-12,-4,4,12].forEach(function(z){addNeon(0,3.6,z,6,0.18,0.14,0x00ff88,{ei:2.2});});
  // 侧壁绿色发光板
  addNeon(-7.6,2.2,0,0.3,1.3,0.3,0x00c86a,{ei:1.6});
  addNeon(7.6,2.2,0,0.3,1.3,0.3,0x00c86a,{ei:1.6});
  // 绿色立柱(掩体+视觉)
  [[-4,8],[4,8],[-4,-8],[4,-8]].forEach(function(p,i){
    addCyl(p[0],1.8,p[1],0.3,3.6,0x0d3a2a,{emissive:0x00c86a,ei:0.5,metal:0.3,rough:0.4});
    props.push({x:p[0],z:p[1],r:0.4,type:'column',h:3.6});
  });
  // 走廊掩体: 木箱(碰撞, 靠两侧留中央通道)
  [[-3.5,10],[3.5,8],[-3.5,2],[3.5,-2],[-3.5,-8],[3.5,-10]].forEach(function(p,i){
    addBox(p[0],0.8,p[1],2.0,1.6,1.1,0x3a4a3a,{ry:(i%2)*0.4,metal:0.35,rough:0.55});
    props.push({x:p[0],z:p[1],r:0.85,type:'crate',h:1.6});
  });
  // 走廊掩体: 油桶(爆炸, 靠两侧)
  [[-3.5,12],[3.5,12],[-3.5,-4],[3.5,-4],[-3.5,-12],[3.5,-12]].forEach(function(p,i){
    var b=place('barrel',p[0],0,p[1],1,(i*1.1));if(b){texAll(b,'barrel',1);props.push({x:p[0],z:p[1],r:0.5,type:'barrel',hp:20,obj:b,h:0.5});}
  });
  // 走廊掩体: 矮掩体(cover, 靠两侧)
  [[2.5,5],[-2.5,-1],[2.5,-7]].forEach(function(p,i){
    var v=place('cover',p[0],0,p[1],1,(i%2)*Math.PI/2);if(v){texAll(v,'cover',1);props.push({x:p[0],z:p[1],r:1.0,type:'cover',h:1.0});}
  });
  // 绿光吊灯(矩阵氛围, 强点光): 3个点光合并为2个(性能: 5点光太贵, 减到2)
  addLamp(0,4,0,0x00ff88,1.8,22);addLamp(0,4,-9,0x00cc66,1.2,18);
  // ==== 电影级地图细节(纯装饰, 不碰撞) ====
  // 顶部管线(工业感: 沿走廊顶部横贯)
  [[-6.2,0,0x1a241e],[-6.2,4,0x141c18],[-6.2,-6,0x1a241e],[6.2,2,0x141c18],[6.2,-2,0x1a241e],[6.2,-10,0x141c18]].forEach(function(c){
    addCyl(c[0],3.9,c[1],0.14,7.6,c[2],{rotX:Math.PI/2,metal:0.7,rough:0.35});
  });
  // 顶部横向金属梁(支撑结构)
  [-12,-4,4,12].forEach(function(z){addBox(0,3.95,z,6.4,0.22,0.22,0x1e2a22,{metal:0.6,rough:0.4});});
  // 地面中央金属反光导轨(引导视线到出口)
  addBox(0,0.03,0,0.5,0.05,36,0x0e2a1c,{metal:0.8,rough:0.2});
  // 侧墙底部绿色灯带(踢脚发光, 电影感)
  [-7.9,7.9].forEach(function(x){addNeon(x,0.25,0,0.08,0.12,32,0x00cc66,{ei:0.8});});
  // 侧墙顶部金属管道支架
  [[-7.9,8],[7.9,-8]].forEach(function(c){addBox(c[0],2.0,c[1],0.25,0.5,4.0,0x1a221c,{metal:0.6,rough:0.4});});
  // 地面通风格栅(装饰)
  [[-2,14],[2,-14]].forEach(function(c){addBox(c[0],0.02,c[1],1.6,0.04,2.2,0x0c1a12,{metal:0.5,rough:0.5});});
  // 远处出口门光晕(电影焦点)
  addNeon(0,1.6,-15.8,2.2,2.6,0.1,0x00ff88,{ei:0.7});
  // ==== 电影级细节增强(贴近真实, 通用设计语言不复制版权元素) ====
  // 侧墙顶部电缆(工业下垂感, 细管沿墙横贯)
  [[-7.6,6,0.055],[7.6,-6,0.055]].forEach(function(c){addCyl(c[0],3.4,c[1],c[2],11,0x0e1410,{rotX:Math.PI/2,metal:0.5,rough:0.5});});
  // 地面碎玻璃(反光小面, 走廊两侧散落)
  [[-4.5,6,0.3,0.4],[4.5,0,0.4,0.5],[-4.8,-9,0.35,0.3],[4.6,12,0.25,0.45]].forEach(function(g2){
    addBox(g2[0],0.04,g2[1],g2[2],0.03,0.34,0x0a3a24,{metal:0.9,rough:0.08,ry:g2[3]*3});
  });
  // 更多侧壁绿色发光板(光效层次, 走廊纵深)
  [[-7.6,1.5],[7.6,-4],[-7.6,-11],[7.6,9]].forEach(function(n2){
    addNeon(n2[0],1.4,n2[1],0.22,0.9,0.22,0x00b85a,{ei:1.1});
  });
  // 墙角金属护角(结构细节)
  [[-7.8,-12],[7.8,14]].forEach(function(c2){addBox(c2[0],1.5,c2[1],0.18,3,0.18,0x16241c,{metal:0.7,rough:0.35});});
  // 顶部悬垂绿色指示灯光(纵深光点, 过曝感)
  [[-6,3.7,3],[6,3.7,-7],[-6,3.7,-14]].forEach(function(p3){addNeon(p3[0],p3[1],p3[2],0.3,0.14,0.3,0x00ff88,{ei:2.6});});
}
/* 绿色数字雨+尘埃粒子(Matrix标志性视觉: 绿色光点垂直下落, 通用科幻效果) */
var rainPoints=null,dustPoints=null;
function initParticles(){
  try{
    // 数字雨: 绿色光点从天花板(约4m)落到地面, 循环
    var rc=280,rp=new Float32Array(rc*3),rs=[];
    for(var i=0;i<rc;i++){rp[i*3]=Math.random()*16-8;rp[i*3+1]=Math.random()*4.5;rp[i*3+2]=Math.random()*44-22;rs.push(2.2+Math.random()*4.2);}
    var rg=new THREE.BufferGeometry();rg.setAttribute('position',new THREE.BufferAttribute(rp,3));
    rainPoints=new THREE.Points(rg,new THREE.PointsMaterial({color:0x00ff88,size:0.055,transparent:true,opacity:0.5,blending:THREE.AdditiveBlending,depthWrite:false}));
    rainPoints.userData.speed=rs;rainPoints.frustumCulled=false;scene.add(rainPoints);
    // 环境尘埃: 绿色微光悬浮(近处可感, 电影空气质感)
    var dc=150,dp=new Float32Array(dc*3),ds=[];
    for(var j=0;j<dc;j++){dp[j*3]=Math.random()*16-8;dp[j*3+1]=Math.random()*3.6;dp[j*3+2]=Math.random()*42-20;ds.push(0.04+Math.random()*0.12);}
    var dg=new THREE.BufferGeometry();dg.setAttribute('position',new THREE.BufferAttribute(dp,3));
    dustPoints=new THREE.Points(dg,new THREE.PointsMaterial({color:0x2faa60,size:0.032,transparent:true,opacity:0.28,depthWrite:false}));
    dustPoints.userData.speed=ds;dustPoints.frustumCulled=false;scene.add(dustPoints);
  }catch(e){}
}
function updateParticles(dt){
  try{
    if(rainPoints){var p=rainPoints.geometry.attributes.position.array,s=rainPoints.userData.speed;
      for(var i=0;i<s.length;i++){p[i*3+1]-=s[i]*dt;if(p[i*3+1]<0)p[i*3+1]=4.2+Math.random()*0.6;}
      rainPoints.geometry.attributes.position.needsUpdate=true;}
    if(dustPoints){var q=dustPoints.geometry.attributes.position.array,d=dustPoints.userData.speed;
      for(var j=0;j<d.length;j++){q[j*3+1]-=d[j]*dt;if(q[j*3+1]<0.1)q[j*3+1]=3.6;}
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
      var wd=rayWallDist(camera.position.x,camera.position.z,wux,wuz);
      if(wd>=0&&wd<wlen2-0.2){ // 障碍物在敌人前: 子弹打障碍物, 不可隔墙打人
        hitPoint=new THREE.Vector3(camera.position.x+wux*wd,1.0,camera.position.z+wuz*wd);
        hitEnemy=null;hitCrate=null;}}
  }
  if(hitEnemy){
    hitStats.hits++; // 命中敌人: 计入命中率
    var hs=false; // 打头无奖励: 一律躯体伤害(不爆头, 不打头加分)
    var pd=camera.position.distanceTo(hitPoint);
    var dmg=a.dmg; // 固定伤害120(无衰减, 打中对方掉血120)
    hitEnemy.hp-=dmg;hitEnemy.hitT=0.15;
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
function spawnEnemy(x,z,type,hpMul){
  type=type||'grunt';
  var t=ETYPES[type]||ETYPES.grunt;
  var nc=collide(x,z,0.6);x=nc[0];z=nc[1]; // 出生点推离障碍物(不刷在墙内)
  var o=place('enemy',x,0,z,t.scale||1,Math.random()*6.28);
  if(!o){ // 模型加载失败回退: 程序化占位体(仍可命中/击杀, 不卡波次)
    o=new THREE.Group();
    var bodyM=new THREE.Mesh(new THREE.BoxGeometry(0.8,1.8,0.5),
      new THREE.MeshStandardMaterial({color:t.color,roughness:0.6,metalness:0.2}));
    bodyM.position.y=0.9;bodyM.castShadow=true;o.add(bodyM);
    o.position.set(x,0,z);
    scene.add(o);
  }
  if(o){ // 保留GLB多材质细节(西装/制服分件), 只增强质感, 不统一染色
    o.traverse(function(m){if(m.isMesh){
      m.castShadow=true; // 敌人投影(视觉关键, 地面受影)
      if(m.material&&m.material.isMeshStandardMaterial){
        // 金属高光增强 + 布料粗糙度(按类型微调)
        m.material.metalness=Math.min(0.6,(m.material.metalness||0)+0.15);
        m.material.roughness=Math.max(0.35,Math.min(0.75,(m.material.roughness||0.5)));
        // 敌人类型微调色相(保安蓝/特勤深灰/特工黑, 保留分件层次)
        var c=new THREE.Color(t.color);
        m.material.color.lerp(c,0.45);
        m.material.emissive=new THREE.Color(t.color).multiplyScalar(0.12);
        m.material.emissiveIntensity=0.35;
        m.material.needsUpdate=true;
      }}});
    // 敌人武器(枪模型, 金属质感)
    var eg=new THREE.Mesh(new THREE.BoxGeometry(0.1,0.1,0.6),new THREE.MeshStandardMaterial({color:0x22252c,metalness:0.7,roughness:0.3}));
    eg.position.set(0,1.1,-0.4);o.add(eg);}
  var hp=t.hp*(hpMul||1);
  var spMul=1+(wave-1)*0.015; // 难度曲线: 每波+1.5%速度
  var e={obj:o,x:x,z:z,hp:hp,max:hp,speed:t.speed*spMul,dmg:t.dmg,cool:0,state:'chase',hitT:0,type:type,gun:eg,scale:t.scale||1,
    shoot:t.shoot||0,shootRate:t.shootRate||0,shootDmg:t.shootDmg||0,shootCd:1};
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
  sfx('crate');
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
      if(wp.h!==undefined&&wp.h<1.4)continue; // 低矮掩体(油桶0.5/矮墙1.0): 子弹可越过, 不挡(与rayWallDist一致)
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
  burstFx(e.x,1.2,e.z,headshot?0xff5544:0xffaa44); // 击杀彩色粒子
  shake(0.015,0.1); // 击杀轻微震动(很轻, 防晃屏)
  e.hp=0;kills++;
  if(e.obj){e.obj.rotation.z+=Math.PI/2;e.obj.position.y-=0.5; // 倒地: 倒下90°+下沉
    setTimeout(function(){if(e.obj&&e.obj.parent)scene.remove(e.obj);},500);} // 0.5s后移除
  var pts=(headshot?150:100)+combo*25;score+=pts; // 爆头加分+连杀奖励递增(2连杀起+25/连)
  if(e.scale&&e.scale>1){score+=500;spawnPickup(e.x,e.z,'ammo');spawnPickup(e.x+1,e.z,'ammo'); // Boss大奖励(弹药,不回血)
    if(elHit){elHit.textContent='⚑ BOSS 击杀! +500';elHit.classList.add('on');elHit.classList.add('kill');
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
  if(e.scale&&e.scale>1)sfx('boss'); // Boss击杀低音
  // 击杀掉落补给(25%概率: 弹药包/血量包)
  if(Math.random()<0.3)spawnPickup(e.x,e.z,Math.random()<0.5?'ammo':'health'); // 击杀掉落补给30%
}
function updateEnemies(dt){
  enemies.forEach(function(e){
    if(e.hp<=0||!e.obj)return; // 跳过死亡或无模型的敌人
    e.hitT=Math.max(0,e.hitT-dt);
    // 追踪玩家(仅当玩家进入警戒距离才进攻, 远离则待命)
    var dx=player.x-e.x,dz=player.z-e.z,d=Math.sqrt(dx*dx+dz*dz)||1;
    var stopDist=e.shoot?10:2; // 远程敌人留距射击(稍远更安全)
    var alertRange=45; // 全场警戒: 敌人出生即发现玩家, 立即进攻(不再待命)
    if(d<alertRange&&d>stopDist){
      // 敌人走位: runner包抄(侧翼), gunner环绕(射击走位), grunt/brute直线
      var tx=-dz/d,tz=dx/d; // 切线方向(垂直)
      var strafe=(e.type==='runner')?Math.sin(performance.now()*0.002+e.x)*0.7:
        (e.type==='gunner'?Math.sin(performance.now()*0.0015+e.z)*0.9:0);
      var rage=(e.scale&&e.scale>1&&e.hp<e.max*0.4)?1.5:1; // Boss狂暴: 血<40%速度+50%
      if(rage>1&&!e.rage){e.rage=true;sfx('boss');} // 狂暴触发音效(一次)
      var sprint=(e.scale&&e.scale>1&&d<9)?2.2:1; // Boss冲刺突进
      var stun=e.hitT>0?0.45:1; // 受击僵直(短暂减速45%, 打击感更强)
      // 寻路绕过障碍物: 前方<5m有障碍 → 垂直绕行; 10m内自我检测(感知障碍,提前预判)
      var ux=dx/d,uz=dz/d,obst=rayWallDist(e.x,e.z,ux,uz);
      e.aware=(obst>=0&&obst<10); // 10m内障碍自我检测(感知标记)
      if(obst>=0&&obst<5){
        if(!e.av||e.avT>1.4){e.av=Math.random()<0.5?1:-1;e.avT=0;} // 换绕行侧
        e.avT=(e.avT||0)+dt;
        var vx=(-uz*e.av*e.speed*sprint*rage+tx*e.speed*strafe)*stun; // 垂直绕障碍
        var vz=(ux*e.av*e.speed*sprint*rage+tz*e.speed*strafe)*stun;
      }else{e.avT=0;e.av=0;
        var vx=(dx/d*e.speed*sprint*rage+tx*e.speed*strafe)*stun;
        var vz=(dz/d*e.speed*sprint*rage+tz*e.speed*strafe)*stun;}
      var maxv=e.speed*sprint*rage,vs=Math.sqrt(vx*vx+vz*vz); // 合成速度限最大(绕障+strafe不超速)
      if(vs>maxv){vx*=maxv/vs;vz*=maxv/vs;}
      var enx=e.x+vx*dt,enz=e.z+vz*dt;
      var enc=collide(enx,enz,0.6);e.x=enc[0];e.z=enc[1]; // 敌人碰撞(不穿障碍物)
    }
    e.obj.position.set(e.x,0,e.z);
    e.obj.rotation.y=Math.atan2(dx,dz);
    // 远程射击(仅警戒内)
    if(e.shoot){e.shootCd-=dt;
      if(e.shootCd<=0&&d<alertRange){e.shootCd=e.shootRate;fireEnemyBullet(e);}}
    // 近战攻击
    e.cool-=dt;
    if(e.scale&&e.scale>1){ // Boss震击(AOE, 冷却3秒)
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
  var b={x:e.x,y:1.2,z:e.z,vx:Math.cos(ang)*8,vz:Math.sin(ang)*8,dmg:e.shootDmg||6,life:3.2};
  var mesh=new THREE.Mesh(new THREE.SphereGeometry(0.16,8,6),
    new THREE.MeshBasicMaterial({color:0xff4040,transparent:true,opacity:1}));
  mesh.userData.noRay=true;mesh.position.set(b.x,b.y,b.z);scene.add(mesh);b.obj=mesh;eBullets.push(b);
  if(e.gun&&e.gun.material){e.gun.material.emissive=new THREE.Color(0xffaa44); // 枪口闪光预警
    setTimeout(function(){if(e.gun&&e.gun.material)e.gun.material.emissive=new THREE.Color(0x000000);},60);}
  sfx('hit'); // 敌人开火音效(听觉预警)
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
      if(wp.type==='wall'){var wox=Math.abs(b.x-wp.x)-wp.hw,woz=Math.abs(b.z-wp.z)-wp.hd;
        if(wox<0&&woz<0){hitWall=true;break;}}
      else if(wp.r){var wdx=b.x-wp.x,wdz=b.z-wp.z;
        if(wdx*wdx+wdz*wdz<wp.r*wp.r){hitWall=true;break;}}}
    if(hitWall){if(b.obj)scene.remove(b.obj);eBullets.splice(i,1);continue;}
    var dx=b.x-player.x,dz=b.z-player.z;
    if(dx*dx+dz*dz<0.6&&player.invulnT<=0){player.hp-=b.dmg;hitFlash();if(window.hurtCine)window.hurtCine();
      if(player.hp<=0)doGameOver();
      if(b.obj)scene.remove(b.obj);eBullets.splice(i,1);continue;}
    if(b.life<=0){if(b.obj)scene.remove(b.obj);eBullets.splice(i,1);}
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
  nx=Math.max(-19.3,Math.min(19.3,nx));nz=Math.max(-19.3,Math.min(19.3,nz));
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
    if(ld>0.001){var lux=ldx/ld,luz=ldz/ld,lwd=rayWallDist(player.x,player.z,lux,luz);
      if(lwd>=0&&lwd<ld-0.5){lockTarget=null;}} // 墙在敌前: 解锁
  }
  var pref=lockTarget&&lockTarget.hp>0?lockTarget:null,best=pref,bd=1e9;
  var fwx=-Math.sin(player.ry),fwz=-Math.cos(player.ry); // 准星方向
  var nearE=null,nearD=1e9,alignE=null,alignDot=-2;
  for(var j=0;j<enemies.length;j++){var e=enemies[j];if(e.hp<=0||!e.obj)continue;
    var dx=e.x-player.x,dz=e.z-player.z,d=dx*dx+dz*dz;
    var vd=Math.sqrt(d);if(vd>0.001){var vux=dx/vd,vuz=dz/vd,vwd=rayWallDist(player.x,player.z,vux,vuz);
      if(vwd>=0&&vwd<vd-0.5)continue;} // 墙在敌前: 跳过(不可见)
    if(vd<nearD){nearD=vd;nearE=e;} // 最近可见敌(回退用)
    var vl=vd||1;var dot=(vux/vl)*fwx+(vuz/vl)*fwz; // 敌方向·准星方向(1=正对准星)
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
      if(elHit){elHit.textContent='⚔ 波次1: 保安来袭!';elHit.classList.add('on');elHit.classList.add('kill');
        setTimeout(function(){elHit.classList.remove('on');elHit.classList.remove('kill');},1400);}}
  }else if(DIR.stage==='wave1'){DIR.t-=dt;
    if(DIR.t<=0){DIR.stage='fight1';
      spawnWave([[-0.5,9,'grunt'],[0.5,8,'grunt'],[-1,6.5,'grunt'],[0.5,4.5,'grunt'],[-0.7,3,'grunt'],[0.7,1.2,'grunt'],[0,-2.5,'grunt'],[-0.6,-5,'grunt']]);}
  }else if(DIR.stage==='fight1'){ // 波次1全灭 → 波次2
    if(enemies.length===0){DIR.stage='wave2';DIR.t=1.2;
      if(elHit){elHit.textContent='⚔ 波次2: 特勤部队!';elHit.classList.add('on');elHit.classList.add('kill');
        setTimeout(function(){elHit.classList.remove('on');elHit.classList.remove('kill');},1400);}}
  }else if(DIR.stage==='wave2'){DIR.t-=dt;
    if(DIR.t<=0){DIR.stage='fight2';
      spawnWave([[-0.5,-3,'gunner'],[0.5,-5,'gunner'],[-1,-7,'gunner'],[0.5,-8,'gunner'],[-0.7,-1,'gunner'],[0.7,-10.5,'gunner'],[0,-12.5,'gunner'],[-0.6,-14.5,'gunner']]);}
  }else if(DIR.stage==='fight2'){ // 波次2全灭 → 头目
    if(enemies.length===0){DIR.stage='boss';DIR.t=1.0;sfx('boss');
      if(elHit){elHit.textContent='⚠ 特工史密斯现身!';elHit.classList.add('on');elHit.classList.add('kill');
        setTimeout(function(){elHit.classList.remove('on');elHit.classList.remove('kill');},1500);}}
  }else if(DIR.stage==='boss'){DIR.t-=dt;
    if(DIR.t<=0){DIR.stage='bossfight';
      var b=spawnEnemy(0,-12,'brute',1);b.dmg=20;DIR.boss=b;
      if(elHit){elHit.textContent='⚠ 头目: 特工史密斯!';elHit.classList.add('on');elHit.classList.add('kill');
        setTimeout(function(){elHit.classList.remove('on');elHit.classList.remove('kill');},1500);}}
  } // bossfight: 等待killEnemy设置flag.ready + DIR.stage='exit'
  // HUD波次标签
  if(elWave){
    var label=DIR.stage==='wait'?'准备...':
      (DIR.stage==='wave1'||DIR.stage==='fight1')?'波次1 · 保安':
      (DIR.stage==='wave2'||DIR.stage==='fight2')?'波次2 · 特勤':
      (DIR.stage==='boss'||DIR.stage==='bossfight')?'头目 · 特工史密斯':'出口 · 前往出口门';
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
    combo:[880,1900,'triangle',0.3,0.22],boss:[55,32,'square',0.6,0.3],step:[320,150,'sine',0.1,0.08]};
  var p=map[t];if(!p)return;
  try{var o=AC.createOscillator(),gn=AC.createGain();
  o.type=p[2];o.frequency.setValueAtTime(p[0],AC.currentTime);
  o.frequency.exponentialRampToValueAtTime(p[1],AC.currentTime+p[3]);
  gn.gain.setValueAtTime(p[4],AC.currentTime);gn.gain.exponentialRampToValueAtTime(0.001,AC.currentTime+p[3]);
  o.connect(gn);gn.connect(AC.destination);
  // 枪声叠加高频谐波(更真实打击感): rifle/pistol加清脆高频层
  if(t==='rifle'||t==='pistol'){try{var o2=AC.createOscillator(),gn2=AC.createGain();
    o2.type='square';o2.frequency.setValueAtTime(p[0]*3,AC.currentTime);
    o2.frequency.exponentialRampToValueAtTime(p[1]*2.5,AC.currentTime+p[3]*0.6);
    gn2.gain.setValueAtTime(p[4]*0.4,AC.currentTime);gn2.gain.exponentialRampToValueAtTime(0.001,AC.currentTime+p[3]*0.7);
    o2.connect(gn2);gn2.connect(AC.destination);
    if(window.__recDest)gn2.connect(window.__recDest);
    o2.start();o2.stop(AC.currentTime+p[3]*0.8);}catch(e2){}}
  if(window.__recDest)gn.connect(window.__recDest); // 同时连接到录制目标
  o.start();o.stop(AC.currentTime+p[3]);}catch(e){}
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
    // 编码兼容: mp4(H.264+AAC)最通用优先, fallback vp8/vp9/webm
    var mt=['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4','video/webm;codecs=vp8,opus','video/webm;codecs=vp9,opus','video/webm']
      .find(function(m){return window.MediaRecorder&&MediaRecorder.isTypeSupported(m);})||'video/mp4';
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
  if(btn){btn.classList.remove('rec');btn.textContent='⏺ 转码中...';}
  if(!rawBlob){if(btn)btn.textContent='⏺ 录像';return;}
  var stamp=new Date().toISOString().slice(0,19).replace(/[:T]/g,'-');
  var done=function(blob,ext){ // 下载 + 预览
    var url=URL.createObjectURL(blob);
    var a=document.createElement('a');
    a.href=url;a.download='fps_'+stamp+'.'+ext;
    a.style.display='none';a.rel='noopener';a.target='_blank';
    document.body.appendChild(a);a.click();a.remove();
    __recPreview(url,ext);
    setTimeout(function(){URL.revokeObjectURL(url);},60000);
    if(btn)btn.textContent='⏺ 录像';
  };
  // 上传本机ffmpeg转码 → 标准mp4(H.264 High+yuv420p+AAC+关键帧2s+faststart): 快影/快手编辑器兼容
  // (Chrome MediaRecorder的mp4音频封装在快影读不出→无声, 转码后为标准编码可解码)
  fetch('/transcode',{method:'POST',body:rawBlob}).then(function(r){
    if(!r.ok)throw new Error('transcode '+r.status);
    return r.blob();
  }).then(function(std){done(std,'mp4');})
  .catch(function(){done(rawBlob,(mt.indexOf('mp4')>=0)?'mp4':'webm');}); // 转码失败回退原始文件
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
