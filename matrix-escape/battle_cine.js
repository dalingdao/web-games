(function(){
function _boot(){
  if(!(window.__fps&&window.__fps.scene)){return setTimeout(_boot,50);}
  _main();
}
function _main(){
var F=window.__fps;
var scene=F.scene,camera=F.camera;
var CINE={intro:1,introT:0,slowmo:1,shake:0,fovKick:0};
window.CINE=CINE;
var P=F.player;
var origFov=camera.fov;
var seq=[
  {t:0,  pos:[0,20,26],  look:[0,2,10],  fov:90},
  {t:0.8,pos:[0,9,20],   look:[0,2,12],  fov:78},
  {t:1.6,pos:[2,3.5,18], look:[0,1.7,12],fov:70},
  {t:2.3,pos:[0,2.4,16], look:[0,1.7,12],fov:66},
  {t:3.0,pos:[P.x,P.y+1.7,P.z+0.01],look:[P.x-Math.sin(P.ry)*6,1.6,P.z-Math.cos(P.ry)*6],fov:origFov}
];
function ease(k){return k<0.5?2*k*k:1-Math.pow(-2*k+2,2)/2;}
function segFor(k){
  for(var i=0;i<seq.length-1;i++){if(k>=seq[i].t/3&&k<=seq[i+1].t/3)return[seq[i],seq[i+1]];}
  return[seq[seq.length-2],seq[seq.length-1]];
}
var introStart=performance.now(),introDone=false;
function introStep(){
  if(introDone)return;
  var k=Math.min(1,(performance.now()-introStart)/3000);
  var s=segFor(k),a=s[0],b=s[1];
  var lk=ease(Math.max(0,Math.min(1,(k-a.t/3)/((b.t-a.t)/3||1))));
  camera.position.set(a.pos[0]+(b.pos[0]-a.pos[0])*lk,a.pos[1]+(b.pos[1]-a.pos[1])*lk,a.pos[2]+(b.pos[2]-a.pos[2])*lk);
  camera.lookAt(a.look[0]+(b.look[0]-a.look[0])*lk,a.look[1]+(b.look[1]-a.look[1])*lk,a.look[2]+(b.look[2]-a.look[2])*lk);
  camera.fov=a.fov+(b.fov-a.fov)*lk;camera.updateProjectionMatrix();
  if(k<1)requestAnimationFrame(introStep);
  else{introDone=true;camera.fov=origFov;camera.updateProjectionMatrix();CINE.intro=0;}
}
introStep();
window.boomFx=function(x,y,z){
  var n=20,geo=new THREE.BufferGeometry(),pos=new Float32Array(n*3),vel=[];
  for(var i=0;i<n;i++){pos[i*3]=x;pos[i*3+1]=y;pos[i*3+2]=z;
    var th=Math.random()*Math.PI*2,ph=Math.acos(2*Math.random()-1),sp=2+Math.random()*3;
    vel.push([Math.sin(ph)*Math.cos(th)*sp,Math.cos(ph)*sp+1.5,Math.sin(ph)*Math.sin(th)*sp]);}
  geo.setAttribute('position',new THREE.BufferAttribute(pos,3));
  var pts=new THREE.Points(geo,new THREE.PointsMaterial({color:0xffb850,size:0.05,transparent:true,opacity:1,blending:THREE.AdditiveBlending,depthWrite:false}));
  scene.add(pts);
  var t0=performance.now();
  (function anim(){
    var t=(performance.now()-t0)/1000;
    var arr=geo.attributes.position.array;
    for(var i=0;i<n;i++){vel[i][1]-=9.8*0.3*t;arr[i*3]+=vel[i][0]*0.016;arr[i*3+1]+=vel[i][1]*0.016;arr[i*3+2]+=vel[i][2]*0.016;}
    geo.attributes.position.needsUpdate=true;
    pts.material.opacity=Math.max(0,1-t/0.45);
    if(t<0.45)requestAnimationFrame(anim);
    else{scene.remove(pts);}
  })();
};
window.hurtCine=function(){CINE.shake=Math.min(0.35,CINE.shake+0.14);};
var origRender=F.renderer.render.bind(F.renderer);
F.renderer.render=function(sc,cam){
  if(introDone){
    if(CINE.shake>0.01){
      cam.position.x+=(Math.random()-0.5)*CINE.shake*0.12;
      cam.position.y+=(Math.random()-0.5)*CINE.shake*0.12;
      cam.rotation.z+=(Math.random()-0.5)*CINE.shake*0.015;
      CINE.shake*=0.86;
    }
    if(CINE.fovKick>0.1){cam.fov=origFov+CINE.fovKick;cam.updateProjectionMatrix();CINE.fovKick*=0.82;}
    else if(cam.fov!==origFov){cam.fov=origFov;cam.updateProjectionMatrix();}
  }
  origRender(sc,cam);
};
// 敌人强化
window.upgradeEnemy=function(e){
  if(!e||!e.obj||e._upg)return;e._upg=1;
  var mat=new THREE.MeshStandardMaterial({color:0xff2a2a,emissive:0xff1010,emissiveIntensity:2.5});
  var eye1=new THREE.Mesh(new THREE.SphereGeometry(0.09,8,6),mat);eye1.position.set(0.16,1.5,0.32);
  var eye2=eye1.clone();eye2.position.x=-0.16;
  e.obj.add(eye1);e.obj.add(eye2);
  var spikeMat=new THREE.MeshStandardMaterial({color:0x3a1414,emissive:0x550a0a,emissiveIntensity:0.5,metalness:0.6,roughness:0.4});
  for(var i=0;i<4;i++){
    var sp=new THREE.Mesh(new THREE.ConeGeometry(0.1,0.45,6),spikeMat);
    sp.position.set((i%2?0.12:-0.12),1.1+i*0.12,-0.25);sp.rotation.x=-0.6;e.obj.add(sp);
  }
  e.obj.scale.set(2.2,2.2,2.2);
};
}
_boot();
})();