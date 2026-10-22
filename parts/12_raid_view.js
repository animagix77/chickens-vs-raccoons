/* Judge Dean LLC — read-only tactical scenery for Save the Coop.
   All cues are pooled. This module never changes a unit, timer or random stream. */
function disposeRaidView(){
  const state=buildRaidView.state;if(!state)return;
  const geos=new Set(),mats=new Set(),maps=new Set();
  state.root.traverse(o=>{
    if(o.geometry)geos.add(o.geometry);
    if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material]){
      mats.add(m);if(m.map)maps.add(m.map);
    }
  });
  geos.forEach(g=>g.dispose());mats.forEach(m=>m.dispose());maps.forEach(t=>t.dispose());
  scene.remove(state.root);buildRaidView.state=null;
}
function buildRaidView(){
  disposeRaidView();
  const root=new THREE.Group();root.name='raid-tactical-cues';scene.add(root);
  const cap=12,dummy=new THREE.Object3D(),color=new THREE.Color();
  const ring=new THREE.RingGeometry(.91,1,48);ring.rotateX(-Math.PI/2);
  const disk=new THREE.CircleGeometry(1,48);disk.rotateX(-Math.PI/2);
  function instances(geo,opacity){
    const mat=new THREE.MeshBasicMaterial({color:0xffffff,transparent:true,opacity,depthWrite:false,side:THREE.DoubleSide});
    const mesh=new THREE.InstancedMesh(geo,mat,cap);mesh.count=0;mesh.frustumCulled=false;mesh.renderOrder=2;root.add(mesh);return mesh;
  }
  const arrivals=instances(ring,.86),arrivalFill=instances(disk,.12);
  const threats=instances(ring,.84),threatFill=instances(disk,.15);
  const preview=new THREE.Group();root.add(preview);
  const previewRing=new THREE.Mesh(ring,new THREE.MeshBasicMaterial({color:new THREE.Color('#b7e6c2').convertSRGBToLinear(),transparent:true,opacity:.88,depthWrite:false,side:THREE.DoubleSide}));
  previewRing.scale.setScalar(2.2);preview.add(previewRing);
  const previewDisk=new THREE.Mesh(disk,new THREE.MeshBasicMaterial({color:new THREE.Color('#b7e6c2').convertSRGBToLinear(),transparent:true,opacity:.12,depthWrite:false,side:THREE.DoubleSide}));
  previewDisk.scale.setScalar(2.2);preview.add(previewDisk);
  preview.position.y=.14;preview.visible=false;

  // Three inward chevrons remain visible against both soil and grass.
  const entrance=new THREE.Group();root.add(entrance);
  const shape=new THREE.Shape();shape.moveTo(-.85,.50);shape.lineTo(0,-.50);shape.lineTo(.85,.50);
  shape.lineTo(.85,1);shape.lineTo(0,0);shape.lineTo(-.85,1);shape.closePath();
  const arrowGeo=new THREE.ShapeGeometry(shape);arrowGeo.rotateX(Math.PI/2);
  const arrowMat=new THREE.MeshBasicMaterial({color:new THREE.Color('#ffd18b').convertSRGBToLinear(),transparent:true,opacity:.82,side:THREE.DoubleSide,depthWrite:false});
  for(let j=0;j<3;j++){
    const arrow=new THREE.Mesh(arrowGeo,arrowMat);arrow.position.set(0,.12,j*1.45);entrance.add(arrow);
  }
  const beacon=new THREE.Mesh(ring,new THREE.MeshBasicMaterial({color:new THREE.Color('#ffd18b').convertSRGBToLinear(),transparent:true,opacity:.38,side:THREE.DoubleSide,depthWrite:false}));
  beacon.position.set(0,.10,1.4);beacon.scale.setScalar(2.45);entrance.add(beacon);

  const labels=[];
  for(let i=0;i<cap;i++){
    const canvas=document.createElement('canvas');canvas.width=128;canvas.height=64;
    const texture=new THREE.CanvasTexture(canvas);texture.minFilter=THREE.LinearFilter;texture.generateMipmaps=false;
    const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthWrite:false,depthTest:false}));
    sprite.scale.set(2.3,1.15,1);sprite.renderOrder=4;sprite.visible=false;root.add(sprite);
    labels.push({canvas,texture,sprite,text:''});
  }
  buildRaidView.state={root,arrivals,arrivalFill,threats,threatFill,preview,entrance,arrowMat,beacon,
    labels,dummy,color,cap,time:0,arena:arenaGroup};
  updateRaidView(0);
}
function raidViewInstance(mesh,index,x,z,radius,tint,y){
  const state=buildRaidView.state,d=state.dummy;
  d.position.set(x,y,z);d.rotation.set(0,0,0);d.scale.set(radius,1,radius);d.updateMatrix();
  mesh.setMatrixAt(index,d.matrix);mesh.setColorAt(index,state.color.set(tint).convertSRGBToLinear());
}
function updateRaidView(dt){
  let state=buildRaidView.state;
  if(!state){buildRaidView();return;}
  if(state.arena!==arenaGroup){buildRaidView();return;}
  const reduced=typeof VIEW!=='undefined'&&VIEW.reducedMotion,paused=typeof VIEW!=='undefined'&&VIEW.paused;
  if(!paused)state.time+=Math.min(.1,Math.max(0,Number(dt)||0));
  const active=typeof RAID!=='undefined'&&RAID.active;
  const playing=typeof BATTLE!=='undefined'&&BATTLE.running&&!BATTLE.over;
  state.entrance.visible=active&&playing&&RAID.phase!=='complete';
  if(state.entrance.visible){
    const angle=RAID.phase==='prep'&&Number.isFinite(RAID.nextApproach)?RAID.nextApproach:RAID.approach;
    const a=Number.isFinite(angle)?angle:0;
    state.entrance.position.set(Math.cos(a)*ARENA_R*.83,0,Math.sin(a)*ARENA_R*.83);
    state.entrance.rotation.y=Math.PI/2-a;
    state.arrowMat.opacity=reduced?.85:.67+.18*Math.sin(state.time*2.4);
    state.beacon.material.opacity=RAID.phase==='prep'?.28:.40;
  }
  const deployment=typeof DEPLOYMENT!=='undefined'?DEPLOYMENT:null;
  const hover=deployment&&deployment.hover;
  state.preview.visible=playing&&!!(deployment&&deployment.selected&&hover)&&Number.isFinite(hover.x)&&Number.isFinite(hover.z);
  if(state.preview.visible)state.preview.position.set(hover.x,.14,hover.z);
  const pending=deployment&&Array.isArray(deployment.pending)?deployment.pending:[];
  let n=0;
  for(const packet of pending){
    if(n>=state.cap)break;
    if(!Number.isFinite(packet.x)||!Number.isFinite(packet.z))continue;
    const remaining=Math.max(0,Number(packet.remaining)||0),total=Math.max(.01,Number(packet.total)||2);
    const progress=clamp(1-remaining/total,0,1),radius=2.2;
    raidViewInstance(state.arrivals,n,packet.x,packet.z,radius,'#a4e8be',.13);
    raidViewInstance(state.arrivalFill,n,packet.x,packet.z,radius*(.32+.68*progress),'#a4e8be',.12);
    const label=state.labels[n],text=Math.max(1,Math.ceil(remaining))+'s';
    if(text!==label.text){
      const ctx=label.canvas.getContext('2d');ctx.clearRect(0,0,128,64);
      ctx.fillStyle='rgba(18,34,28,.90)';ctx.beginPath();ctx.moveTo(17,6);ctx.lineTo(111,6);ctx.quadraticCurveTo(120,6,120,15);
      ctx.lineTo(120,49);ctx.quadraticCurveTo(120,58,111,58);ctx.lineTo(17,58);ctx.quadraticCurveTo(8,58,8,49);ctx.lineTo(8,15);ctx.quadraticCurveTo(8,6,17,6);ctx.fill();
      ctx.strokeStyle='#a4e8be';ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#e6f8df';ctx.font='bold 36px system-ui, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,64,33);
      label.texture.needsUpdate=true;label.text=text;
    }
    label.sprite.position.set(packet.x,1.9,packet.z);label.sprite.visible=playing;n++;
  }
  state.arrivals.count=state.arrivalFill.count=playing?n:0;
  for(let i=n;i<state.cap;i++)state.labels[i].sprite.visible=false;
  let count=0;
  if(active&&playing&&Array.isArray(RAID.threats))for(const threat of RAID.threats){
    if(count>=state.cap)break;
    if(!Number.isFinite(threat.x)||!Number.isFinite(threat.z))continue;
    const progress=clamp(Number(threat.progress)||0,0,1),radius=Math.max(.2,Number(threat.radius)||2.8);
    const tint=progress>.68?'#f1724c':'#f7bb62';
    raidViewInstance(state.threats,count,threat.x,threat.z,radius,tint,.115);
    raidViewInstance(state.threatFill,count,threat.x,threat.z,radius*progress,tint,.105);count++;
  }
  state.threats.count=state.threatFill.count=count;
  for(const mesh of [state.arrivals,state.arrivalFill,state.threats,state.threatFill])if(mesh.count){
    mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;
  }
}
