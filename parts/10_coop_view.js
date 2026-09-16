/* Central objective scenery. All resources belong to the supplied arena group.
   Hoisted functions are intentional: the first arena builds during 06_ui boot.
   Visual state never writes COOP or consumes the simulation random stream. */
function coopViewMaterial(color,extra){
  return new THREE.MeshStandardMaterial(Object.assign({
    color:new THREE.Color(color).convertSRGBToLinear(),roughness:.88,metalness:0
  },extra||{}));
}
function coopViewMerged(parts,material,parent){
  const mesh=new THREE.Mesh(mergeAll(parts),material);
  mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
function coopViewLine(points,material,parent){
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(points,3));
  geo.computeBoundingSphere();const line=new THREE.LineSegments(geo,material);parent.add(line);return line;
}
function coopViewSegment(points,a,b){points.push(a[0],a[1],a[2],b[0],b[1],b[2]);}
function coopViewBeam(parts,color,a,b,width){
  const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],len=Math.hypot(dx,dy,dz);
  const geo=G.box.clone();
  const rotation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3(dx,dy,dz).normalize());
  const matrix=new THREE.Matrix4().compose(new THREE.Vector3((a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2),rotation,new THREE.Vector3(width,len,width));
  geo.applyMatrix4(matrix);
  const piece=geo.index?geo.toNonIndexed():geo;
  if(piece!==geo) geo.dispose();
  if(piece.attributes.uv)piece.deleteAttribute('uv');
  const c=new THREE.Color(color).convertSRGBToLinear(),colors=new Float32Array(piece.attributes.position.count*3);
  for(let i=0;i<colors.length;i+=3){colors[i]=c.r;colors[i+1]=c.g;colors[i+2]=c.b;}
  piece.setAttribute('color',new THREE.BufferAttribute(colors,3));parts.push(piece);
}

function buildCoopView(parent){
  buildCoopView.state=null;
  if(typeof COOP==='undefined'||!COOP.active)return;
  const root=new THREE.Group();root.name='protected-coop-run';parent.add(root);
  const radius=COOP.radius||7.5,height=2.7,sectorCount=COOP.sections.length||8;
  const timber=coopViewMaterial('#ffffff',{vertexColors:true});
  const earth=coopViewMaterial('#b69a69');
  const floorGeo=new THREE.CircleGeometry(radius-.08,64);floorGeo.rotateX(-Math.PI/2);
  const floor=new THREE.Mesh(floorGeo,earth);floor.position.y=.045;floor.receiveShadow=true;root.add(floor);
  const staticParts=[],panels=[];

  /* Dark earth rim and substantial corner posts establish the protected area
     even when the wire itself is sub-pixel in the overview. */
  for(let j=0;j<sectorCount*2;j++){
    const a=j/(sectorCount*2)*TAU,x=Math.cos(a)*radius,z=Math.sin(a)*radius;
    staticParts.push(P(G.box,'#775132',x,1.43,z,0,-a,0,.20,2.86,.20));
    staticParts.push(P(G.box,'#e1ba79',x,2.91,z,0,-a,0,.31,.12,.31));
    const a2=(j+1)/(sectorCount*2)*TAU;
    coopViewBeam(staticParts,'#655238',[x,.10,z],[Math.cos(a2)*radius,.10,Math.sin(a2)*radius],.14);
  }
  for(let i=0;i<sectorCount;i++){
    const start=i/sectorCount*TAU,end=(i+1)/sectorCount*TAU,mid=(start+end)/2;
    const mx=Math.cos(mid)*radius,mz=Math.sin(mid)*radius;
    const panel=new THREE.Group();panel.position.set(mx,0,mz);root.add(panel);
    const wood=[],wire=[],sub=10;
    /* Eight physically separate arcs correspond exactly to simulation sectors. */
    for(let j=0;j<sub;j++){
      const a=start+(end-start)*j/sub,a2=start+(end-start)*(j+1)/sub;
      const x=Math.cos(a)*radius-mx,z=Math.sin(a)*radius-mz;
      const x2=Math.cos(a2)*radius-mx,z2=Math.sin(a2)*radius-mz;
      for(let k=1;k<=9;k++)coopViewSegment(wire,[x,k*height/10,z],[x2,k*height/10,z2]);
      coopViewSegment(wire,[x,.16,z],[x,height,z]);
      for(const y of [.28,2.61])coopViewBeam(wood,'#be9460',[x,y,z],[x2,y,z2],.085);
    }
    const endpoint=[Math.cos(end)*radius-mx,0,Math.sin(end)*radius-mz];
    coopViewSegment(wire,[endpoint[0],.16,endpoint[2]],[endpoint[0],height,endpoint[2]]);
    const woodMat=coopViewMaterial('#ffffff',{vertexColors:true});
    const wireMat=new THREE.LineBasicMaterial({color:new THREE.Color('#a9c4ba').convertSRGBToLinear(),transparent:true,opacity:.62});
    const woodMesh=coopViewMerged(wood,woodMat,panel);coopViewLine(wire,wireMat,panel);
    panels.push({group:panel,wood:woodMat,wire:wireMat,woodMesh:woodMesh,angle:mid,pulse:0,lastHit:0,breached:false});
  }

  /* A closed mesh roof protects against hawks. Sparse lines preserve views of
     the hens and ground combat, while four ribs make the enclosure unmistakable. */
  const net=[];
  function netY(r){return 4.35-1.65*(r/radius);}
  for(let j=0;j<40;j++){
    const a=j/40*TAU;
    for(let k=0;k<9;k++){
      const r=k/9*radius,r2=(k+1)/9*radius;
      coopViewSegment(net,[Math.cos(a)*r,netY(r),Math.sin(a)*r],[Math.cos(a)*r2,netY(r2),Math.sin(a)*r2]);
    }
  }
  for(let k=1;k<=9;k++){
    const r=k/9*radius;
    for(let j=0;j<64;j++){
      const a=j/64*TAU,b=(j+1)/64*TAU;
      coopViewSegment(net,[Math.cos(a)*r,netY(r),Math.sin(a)*r],[Math.cos(b)*r,netY(r),Math.sin(b)*r]);
    }
  }
  for(let j=0;j<4;j++){
    const a=j/4*TAU;
    coopViewBeam(staticParts,'#c3a571',[0,4.35,0],[Math.cos(a)*radius,height,Math.sin(a)*radius],.065);
  }
  const roofNet=coopViewLine(net,new THREE.LineBasicMaterial({color:new THREE.Color('#a7b6a0').convertSRGBToLinear(),transparent:true,opacity:.28,depthWrite:false}),root);
  roofNet.name='closed-hawk-net';

  /* Raised wood house, open front door, pitched roof and a slatted ramp.
     The doorway is a real gap rather than a black rectangle on a solid box. */
  const hz=-2.05;
  for(const x of [-1.55,1.55])for(const z of [hz-1.3,hz+1.3])
    staticParts.push(P(G.box,'#684329',x,.53,z,0,0,0,.20,1.06,.20));
  staticParts.push(P(G.box,'#91633b',0,1.02,hz,0,0,0,3.7,.16,3.15));
  for(let j=0;j<8;j++){
    const y=1.20+j*.19,c=j%2?'#a97846':'#b58450';
    for(const x of [-1.76,1.76])staticParts.push(P(G.box,c,x,y,hz,0,0,0,.13,.18,3.08));
    staticParts.push(P(G.box,c,0,y,hz-1.48,0,0,0,3.48,.18,.13));
    for(const x of [-1.22,1.22])staticParts.push(P(G.box,c,x,y,hz+1.48,0,0,0,1.04,.18,.13));
    if(j>5)staticParts.push(P(G.box,c,0,y,hz+1.48,0,0,0,1.38,.18,.13));
  }
  for(const x of [-.71,.71])staticParts.push(P(G.box,'#dfc499',x,1.76,hz+1.57,0,0,0,.11,1.40,.13));
  staticParts.push(P(G.box,'#dfc499',0,2.48,hz+1.57,0,0,0,1.54,.13,.13));
  for(const side of [-1,1]){
    staticParts.push(P(G.box,'#566b68',side*.95,2.97,hz,0,0,-side*.30,2.02,.15,3.58));
    coopViewBeam(staticParts,'#ded0ad',[side*1.96,2.68,hz+1.80],[0,3.30,hz+1.80],.105);
  }
  staticParts.push(P(G.box,'#84918a',0,3.28,hz,0,0,0,.14,.10,3.65));
  const rampStart=[0,1.04,hz+1.62],rampEnd=[0,.12,1.10];
  /* Ramp plank is oriented along its slope, with contrasting traction slats. */
  const rampLen=Math.hypot(rampEnd[1]-rampStart[1],rampEnd[2]-rampStart[2]);
  const rampTilt=Math.atan2(rampStart[1]-rampEnd[1],rampEnd[2]-rampStart[2]);
  staticParts.push(P(G.box,'#997345',0,(rampStart[1]+rampEnd[1])/2,(rampStart[2]+rampEnd[2])/2,rampTilt,0,0,1.14,.09,rampLen));
  for(let j=1;j<7;j++){
    const t=j/7;
    staticParts.push(P(G.box,'#d3af73',0,lerp(rampStart[1],rampEnd[1],t)+.07,lerp(rampStart[2],rampEnd[2],t),rampTilt,0,0,1.10,.065,.11));
  }
  /* Two side nesting boxes, individual openings and pale eggs. */
  for(const z of [hz-.67,hz+.55]){
    staticParts.push(P(G.box,'#765034',2.10,1.20,z,0,0,0,.76,.10,1.05));
    staticParts.push(P(G.box,'#a17749',2.10,1.73,z,0,0,0,.79,.10,1.08));
    for(const zz of [z-.48,z+.48])staticParts.push(P(G.box,'#94663d',2.10,1.45,zz,0,0,0,.72,.47,.09));
    staticParts.push(P(G.sphLo,'#d9be74',2.10,1.29,z,0,0,0,.27,.06,.34));
    staticParts.push(P(G.sphLo,'#f0dfb9',2.23,1.37,z,0,0,.15,.10,.13,.10));
  }
  /* A low water pan and feed bowl help the protected space feel inhabited. */
  staticParts.push(P(G.cyl,'#788789',-3.5,.18,.3,0,0,0,.55,.24,.55));
  staticParts.push(P(G.cyl,'#8ebabe',-3.5,.31,.3,0,0,0,.47,.025,.47));
  staticParts.push(P(G.cyl,'#9d6239',3.1,.13,2.5,0,0,0,.45,.18,.45));
  staticParts.push(P(G.cyl,'#d6b270',3.1,.23,2.5,0,0,0,.37,.025,.37));
  coopViewMerged(staticParts,timber,root);

  const hens=[];
  for(let i=0;i<COOP.hens.length;i++){
    const data=COOP.hens[i],group=new THREE.Group();group.position.set(data.x,.055,data.z);root.add(group);
    const kit=buildHen(Object.assign({},BIRD_KITS.hen[i%2?1:3],{scale:1.65}));
    const mat=coopViewMaterial('#ffffff',{vertexColors:true});
    const hen=coopViewMerged([kit.core,kit.flap],mat,group);hen.rotation.y=i?-.52:.52;
    const nestMat=coopViewMaterial(i?'#d5bb7c':'#cfaa6c');
    const nestParts=[P(G.sphLo,'#ffffff',0,.04,0,0,0,0,.72,.075,.66)];
    const nest=coopViewMerged(nestParts,nestMat,group);nest.castShadow=false;
    hens.push({group:group,mesh:hen,material:mat,nest:nest,nestMaterial:nestMat,angle:hen.rotation.y,index:i});
  }
  buildCoopView.state={root:root,panels:panels,hens:hens,time:0};
  updateCoopView(0);
}

function updateCoopView(dt){
  const state=buildCoopView.state;
  if(!state||typeof COOP==='undefined')return;
  state.root.visible=!!COOP.active;
  if(!COOP.active)return;
  state.time+=Math.max(0,Number(dt)||0);
  for(let i=0;i<state.panels.length;i++){
    const visual=state.panels[i],section=COOP.sections[i];if(!section)continue;
    const health=clamp(section.hp/Math.max(1,section.maxHp),0,1),hit=Number(section.hit)||0;
    if(hit>visual.lastHit)visual.pulse=.32;
    visual.lastHit=hit;visual.pulse=Math.max(0,visual.pulse-(Number(dt)||0));
    const breached=section.hp<=0;
    /* Breached arc drops outward below the animals' eye line: the roof remains
       closed, but the fence opening is physically visible and traversable. */
    visual.group.rotation.set(0,0,0);
    if(breached){
      const axis=new THREE.Vector3(Math.sin(visual.angle),0,-Math.cos(visual.angle));
      visual.group.quaternion.setFromAxisAngle(axis,Math.PI*.48);
      visual.group.position.y=.03;
    }else{
      visual.group.position.y=0;
      const lean=(1-health)*.065;
      visual.group.quaternion.setFromAxisAngle(new THREE.Vector3(Math.sin(visual.angle),0,-Math.cos(visual.angle)),lean);
    }
    const color=visual.pulse>0?'#fff0ba':breached?'#b65b39':health<.35?'#e79650':health<.7?'#d3b66c':'#a9c4ba';
    visual.wire.color.set(color).convertSRGBToLinear();visual.wire.opacity=breached?.35:.62;
    visual.wood.color.set(breached?'#bd8265':health<.35?'#e1a176':'#ffffff').convertSRGBToLinear();
    visual.wood.emissive.set(visual.pulse>0?'#d38b24':'#000000').convertSRGBToLinear();
    visual.wood.emissiveIntensity=visual.pulse>0?.22:0;
    visual.breached=breached;
  }
  for(const hen of state.hens){
    const data=COOP.hens[hen.index];if(!data)continue;
    const alive=data.hp>0,health=clamp(data.hp/Math.max(1,data.maxHp),0,1);
    hen.group.position.x=data.x;hen.group.position.z=data.z;hen.mesh.visible=alive;
    hen.mesh.position.y=alive?.012*Math.sin(state.time*2.4+hen.index*2):0;
    hen.mesh.rotation.y=hen.angle+.035*Math.sin(state.time*.65+hen.index);
    hen.material.color.set(health<.35?'#c9b19d':'#ffffff').convertSRGBToLinear();
    hen.nestMaterial.color.set(alive?'#d5bb7c':'#786e60').convertSRGBToLinear();
    hen.nest.scale.setScalar(alive?1:.85);
  }
}
