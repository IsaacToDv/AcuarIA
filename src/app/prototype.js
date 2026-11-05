import * as THREE from 'three/webgpu';
import { pbr } from '../assets/textures.js';
import { lodWeights } from '../world/lod.js';
import { resourceSet } from './resources.js';
import { pass, mrt, output, diffuseColor, normalView, velocity, packNormalToRGB, unpackRGBToNormal, sample, screenUV, builtinGIContext, getViewPosition, cameraProjectionMatrixInverse, cameraWorldMatrix, vec3, vec4, step, clamp as tslClamp, texture3D, add as tslAdd } from 'three/tsl';
import { ssgi } from 'three/addons/tsl/display/SSGINode.js';
import { traa } from 'three/addons/tsl/display/TRAANode.js';
import { vxgi } from 'three/addons/lighting/vxgi/VXGINode.js';

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const loader = $('loader');
const loadBar = $('loadBar');
const loadNote = $('loadNote');
const errorBox = $('errorBox');
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;

let renderer, scene, camera, renderPipeline;
let prePass, scenePass, screenGI, voxelGI, temporalPass, giComposite;
let voxelRadianceTexture = null, fallbackVoxelBounce = null, pipelineFailed = false;
let width = innerWidth, height = innerHeight, quality = 'balanced', giEnabled = true;
let frame = 0, fpsAccum = 0, fpsFrames = 0, backendLabel = 'GPU';
let firstFrame = true;
let yaw = 0, pitch = -0.015, dragging = false, lastPointer = {x:0,y:0};
const keys = new Set();
const fishActors = [], plants = [], clodActors = [], bubblePositions = [];
const clock = new THREE.Clock();
const aquariumBounds = { minX:-3.75, maxX:3.75, minY:.68, maxY:3.92, minZ:-1.62, maxZ:1.62 };
const initialCamera = new THREE.Vector3(0,1.75,.92);
const moveForward = new THREE.Vector3();
const moveRight = new THREE.Vector3();
const moveVector = new THREE.Vector3();
const voxelBounds = { min:new THREE.Vector3(-8,-1,-20), size:new THREE.Vector3(16,8,23) };
const geometryCache = new Map();
const materialCache = new Map();

function setLoad(pct, message) { loadBar.style.width = `${pct}%`; loadNote.textContent = message; }
function showError(message) { errorBox.textContent = message; errorBox.style.display = 'block'; }


function makeMat(color, roughness=.7, extra={}) {
  const key = `${color}|${roughness}|${JSON.stringify(extra)}`;
  if (!materialCache.has(key)) {
    const mat = new THREE.MeshStandardMaterial({color,roughness,...extra});
    materialCache.set(key, mat); resourceSet.add(mat);
  }
  return materialCache.get(key);
}
function box(parent, size, pos, material, rot=null, options={}) {
  const key = size.join('x');
  if (!geometryCache.has(key)) { const g = new THREE.BoxGeometry(...size); geometryCache.set(key,g); resourceSet.add(g); }
  const mesh = new THREE.Mesh(geometryCache.get(key), material);
  mesh.position.set(...pos); if (rot) mesh.rotation.set(...rot);
  mesh.castShadow = options.castShadow === true;
  mesh.receiveShadow = options.receiveShadow !== false;
  parent.add(mesh); return mesh;
}
function sphere(parent, radius, scale, pos, material, detail=2) {
  const key = `${radius}|${detail}`;
  if (!geometryCache.has(key)) { const g = new THREE.IcosahedronGeometry(radius,detail); geometryCache.set(key,g); resourceSet.add(g); }
  const mesh = new THREE.Mesh(geometryCache.get(key), material);
  mesh.scale.set(...scale); mesh.position.set(...pos); mesh.castShadow=false; mesh.receiveShadow=true; parent.add(mesh); return mesh;
}

function makeWoodMaterial() {
  pbr.woodColor.repeat.set(2.8,2.8); pbr.woodNormal.repeat.set(2.8,2.8); pbr.woodRough.repeat.set(2.8,2.8);
  const key='wood-pbr';
  if (!materialCache.has(key)) {
    const mat=new THREE.MeshStandardMaterial({map:pbr.woodColor,normalMap:pbr.woodNormal,roughnessMap:pbr.woodRough,roughness:.68,color:0xffffff});
    materialCache.set(key,mat); resourceSet.add(mat);
  }
  return materialCache.get(key);
}
function makeRockMaterial() {
  pbr.rockColor.repeat.set(1.5,1.5); pbr.rockNormal.repeat.set(1.5,1.5); pbr.rockRough.repeat.set(1.5,1.5);
  const key='rock-pbr';
  if (!materialCache.has(key)) {
    const mat=new THREE.MeshStandardMaterial({map:pbr.rockColor,normalMap:pbr.rockNormal,roughnessMap:pbr.rockRough,roughness:.92,color:0xc2c9b7});
    materialCache.set(key,mat); resourceSet.add(mat);
  }
  return materialCache.get(key);
}
function makeSandMaterial() {
  pbr.sandColor.repeat.set(4,2.2); pbr.sandNormal.repeat.set(4,2.2); pbr.sandRough.repeat.set(4,2.2);
  const key='sand-pbr';
  if (!materialCache.has(key)) {
    const mat=new THREE.MeshStandardMaterial({map:pbr.sandColor,normalMap:pbr.sandNormal,roughnessMap:pbr.sandRough,roughness:.96,color:0xe0d1ad});
    materialCache.set(key,mat); resourceSet.add(mat);
  }
  return materialCache.get(key);
}

function createRoom() {
  const room = new THREE.Group(); scene.add(room);
  const wood = makeWoodMaterial();
  const wallMat = makeMat('#c6c6b9',.95);
  const ceilingMat = makeMat('#d0d0c5',.97);
  const trim = makeMat('#403b34',.5);
  const sofaMat = makeMat('#788b80',.96);
  const cushionMat = makeMat('#b1b39f',.98);
  const blackMetal = makeMat('#343a36',.34,{metalness:.42});
  // Real room shell. The rear wall is split around a true window opening.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(22,24),wood); floor.rotation.x=-Math.PI/2; floor.position.set(0,-.34,-11); floor.receiveShadow=true; room.add(floor);
  box(room,[22,.18,.18],[0,-.22,-22.85],trim);
  box(room,[22,2.75,.25],[0,6.625,-23.0],wallMat); // lintel above window
  box(room,[22,1.55,.25],[0,.525,-23.0],wallMat); // sill wall
  box(room,[3.2,3.5,.25],[-9.4,3.5,-23.0],wallMat);
  box(room,[14.2,3.5,.25],[3.9,3.5,-23.0],wallMat);
  box(room,[.22,8,21],[-10.9,3.7,-12.0],wallMat);
  box(room,[.22,8,21],[10.9,3.7,-12.0],wallMat);
  box(room,[22,.18,21],[0,7.7,-12.0],ceilingMat);

  // Window reveals a lit garden beyond the rear wall rather than a pane in front of a solid wall.
  const windowGroup = new THREE.Group(); windowGroup.position.set(-5.5,3.45,-22.82); room.add(windowGroup);
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(4.55,3.42),new THREE.MeshBasicMaterial({color:'#c4ddd4'}));
  // Background sits behind the garden meshes; no opaque glow card hides their silhouettes.
  sky.position.set(0,0,-.72); windowGroup.add(sky);
  const gardenGreen = new THREE.MeshBasicMaterial({color:'#547c5a'});
  const gardenDark = new THREE.MeshBasicMaterial({color:'#315e48'});
  for(let i=0;i<11;i++) {
    const x=-2.05+i*.41, y=1.05+(i%4)*.19;
    const tree = new THREE.Mesh(new THREE.IcosahedronGeometry(.55+(i%3)*.1,1),i%2?gardenGreen:gardenDark);
    tree.scale.set(.7,1.15,.4); tree.position.set(x,y,-.48); windowGroup.add(tree);
  }
  for (const x of [-2.32,0,2.32]) box(windowGroup,[.12,3.68,.16],[x,0,.08],trim);
  for (const y of [-1.78,0,1.78]) box(windowGroup,[4.68,.12,.16],[0,y,.08],trim);

  // Sofa and cushions.
  const sofa = new THREE.Group(); sofa.position.set(2.65,-.27,-10.6); room.add(sofa);
  box(sofa,[4.25,.7,1.25],[0,.62,0],sofaMat);
  box(sofa,[4.25,1.25,.42],[0,1.32,.48],sofaMat);
  for (const x of [-1.55,1.55]) box(sofa,[.55,1.0,1.25],[x,1.0,0],sofaMat);
  for (const x of [-1.05,0,1.05]) { const c=box(sofa,[.94,.18,.85],[x,1.03,-.1],cushionMat); c.rotation.z=(x*.025); }

  // Coffee table and visible room props.
  const table = new THREE.Group(); table.position.set(.35,-.30,-8.2); room.add(table);
  box(table,[2.6,.14,1.25],[0,.75,0],wood);
  for(const x of [-1.08,1.08]) for(const z of [-.43,.43]) box(table,[.09,.72,.09],[x,.36,z],blackMetal);
  const bookMat=makeMat('#b3a18a',.8); box(table,[.65,.055,.48],[-.52,.85,0],bookMat,[0,.1,0]);
  const bowlMat=new THREE.MeshPhysicalMaterial({color:'#9aada1',roughness:.22,metalness:.02,clearcoat:.55}); resourceSet.add(bowlMat);
  const bowl=new THREE.Mesh(new THREE.SphereGeometry(.25,20,12,0,Math.PI*2,0,Math.PI*.5),bowlMat); bowl.scale.set(1.3,.42,1); bowl.position.set(.65,.84,.1); table.add(bowl);

  // Warm practical lamp: a visible shade plus a light with a controlled radius.
  const lamp = new THREE.Group(); lamp.position.set(5.25,-.27,-10.6); room.add(lamp);
  const brass=makeMat('#aa976b',.38,{metalness:.62});
  const stem=new THREE.Mesh(new THREE.CylinderGeometry(.035,.05,2.6,10),brass); stem.position.y=1.3; lamp.add(stem);
  const foot=new THREE.Mesh(new THREE.CylinderGeometry(.42,.48,.09,18),blackMetal); foot.position.y=.04; lamp.add(foot);
  const shade=new THREE.Mesh(new THREE.CylinderGeometry(.24,.62,.62,20,1,true),makeMat('#f0dfbd',.78,{side:THREE.DoubleSide})); shade.position.y=2.55; lamp.add(shade);
  const lampGlow=new THREE.PointLight('#ffe0b6',42,9,2); lampGlow.position.set(0,2.3,0); lamp.add(lampGlow);

  // Indoor plant silhouette to add depth and scale.
  const potMat=makeMat('#8b7259',.88); const pot=new THREE.Mesh(new THREE.CylinderGeometry(.34,.25,.55,16),potMat); pot.position.set(-5.3,-.02,-10.5); room.add(pot);
  const soil=new THREE.Mesh(new THREE.CircleGeometry(.29,16),makeMat('#342c24',1)); soil.rotation.x=-Math.PI/2; soil.position.set(-5.3,.26,-10.5); room.add(soil);
  const plantGreen=makeMat('#547b5e',.92), plantDark=makeMat('#385f4b',.95);
  for(let i=0;i<9;i++) {
    const a=i*2.399, len=1.1+(i%3)*.22;
    const leaf=new THREE.Mesh(new THREE.SphereGeometry(1,10,8),i%2?plantGreen:plantDark);
    leaf.scale.set(.12,len*.48,.11); leaf.position.set(-5.3+Math.cos(a)*.32,.45+len*.42,-10.5+Math.sin(a)*.28); leaf.rotation.z=-Math.cos(a)*.55; leaf.rotation.x=Math.sin(a)*.28; room.add(leaf);
  }

  // Low bookshelf and a few grouped books; one shared material per colour.
  const shelf = new THREE.Group(); shelf.position.set(-1.2,-.27,-20.9); room.add(shelf);
  const shelfWood=makeMat('#5b4939',.62);
  box(shelf,[3.5,2.7,.42],[0,1.35,0],shelfWood);
  for(const y of [.35,1.15,1.95,2.65]) box(shelf,[3.58,.07,.5],[0,y,-.04],wood);
  const bookColors=['#a66d55','#627c75','#d0b78c','#586777','#ad997c','#8b624f'].map((c)=>makeMat(c,.82));
  for(let row=0;row<3;row++) {
    let x=-1.45;
    for(let i=0;i<8;i++) { const h=.38+(i%3)*.12; const b=box(shelf,[.18,h,.28],[x,.4+row*.8+h/2,-.14],bookColors[(i+row*2)%bookColors.length]); b.rotation.z=(i%2?.035:-.02); x+=.34; }
  }
  const artFrame=makeMat('#51473b',.5); box(room,[2.2,1.45,.12],[4.35,4.35,-22.76],artFrame);
  const art=new THREE.Mesh(new THREE.PlaneGeometry(1.96,1.2),new THREE.MeshBasicMaterial({color:'#a9c0b0'})); art.position.set(4.35,4.35,-22.68); room.add(art);
  const artShape=new THREE.Mesh(new THREE.CircleGeometry(.48,24),new THREE.MeshBasicMaterial({color:'#d4bb8e'})); artShape.position.set(4.25,4.36,-22.65); room.add(artShape);

  // Tank cabinet beneath the aquarium.
  const cabinet = new THREE.Group(); cabinet.position.set(0,-.37,0); room.add(cabinet);
  const cabinetMat=makeMat('#302c27',.42,{metalness:.12});
  box(cabinet,[8.35,.78,4.1],[0,-.01,0],cabinetMat);
  box(cabinet,[8.42,.09,4.18],[0,.40,0],blackMetal);
  const slatMat=makeMat('#45423b',.72);
  for(let x=-3.75;x<=3.76;x+=.5) box(cabinet,[.018,.48,3.9],[x,-.02,0],slatMat);
  return room;
}

function createAquarium() {
  const aquarium = new THREE.Group(); scene.add(aquarium);
  const metal = makeMat('#1b292a',.3,{metalness:.78});
  const frontGlass = new THREE.MeshPhysicalMaterial({
    color:'#f1fbf7', metalness:0, roughness:.045, transmission:.94, thickness:.025, ior:1.49,
    clearcoat:1, clearcoatRoughness:.035, side:THREE.DoubleSide,
    attenuationColor:new THREE.Color('#d2f0e7'), attenuationDistance:18
  });
  const sideGlass = new THREE.MeshPhysicalMaterial({
    color:'#e3f5ef', metalness:0, roughness:.07, transmission:.78, thickness:.035, ior:1.49,
    clearcoat:.8, clearcoatRoughness:.06, side:THREE.DoubleSide,
    attenuationColor:new THREE.Color('#b7ded6'), attenuationDistance:12
  });
  resourceSet.add(frontGlass); resourceSet.add(sideGlass);
  // A single optical pane: opaque render state + transmission, not alpha blending.
  const frontGeometry = new THREE.PlaneGeometry(8.02,3.62); resourceSet.add(frontGeometry);
  const front = new THREE.Mesh(frontGeometry,frontGlass);
  front.position.set(0,2.28,-1.82); front.renderOrder=2; front.castShadow=false; front.receiveShadow=false; aquarium.add(front);
  for(const x of [-4.01,4.01]) {
    const side = new THREE.Mesh(new THREE.PlaneGeometry(3.68,3.62),sideGlass);
    side.rotation.y=x<0?-Math.PI/2:Math.PI/2; side.position.set(x,2.28,0); aquarium.add(side);
  }
  const topPane=new THREE.Mesh(new THREE.PlaneGeometry(8.02,3.68),sideGlass);
  topPane.rotation.x=-Math.PI/2; topPane.position.set(0,4.09,0); aquarium.add(topPane);
  for(const x of [-4.03,4.03]) for(const z of [-1.83,1.83]) box(aquarium,[.09,3.75,.09],[x,2.28,z],metal);
  for(const y of [.46,4.1]) for(const z of [-1.83,1.83]) box(aquarium,[8.1,.09,.09],[0,y,z],metal);
  for(const y of [.46,4.1]) for(const x of [-4.03,4.03]) box(aquarium,[.09,.09,3.75],[x,y,0],metal);
  const reflectionMat=new THREE.MeshBasicMaterial({color:'#b6e6d9',transparent:true,opacity:.10,depthWrite:false,side:THREE.DoubleSide});
  const edge=new THREE.Mesh(new THREE.PlaneGeometry(7.85,3.48),reflectionMat); edge.position.set(0,2.28,-1.795); edge.renderOrder=3; aquarium.add(edge);
  return aquarium;
}

function deformRockGeometry(radius, seed, detail=2) {
  const geo = new THREE.IcosahedronGeometry(radius,detail); const p=geo.attributes.position; let s=seed>>>0;
  const rand=()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};
  for(let i=0;i<p.count;i++) {
    const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
    const n=1+(rand()-.5)*.17 + Math.sin(x*8+seed)*.035 + Math.cos(y*7+seed*2)*.03;
    p.setXYZ(i,x*n,y*n,z*n);
  }
  geo.computeVertexNormals(); return geo;
}

// Surface-only voxel geometry. Faces shared by neighbouring occupied cells are omitted.
function buildVoxelGeometry(seed, tint, dims=[9,6,9], cell=.105, kind='rock') {
  let s=seed>>>0; const rand=()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};
  const [nx,ny,nz]=dims, cells=new Map();
  for(let z=0;z<nz;z++) for(let y=0;y<ny;y++) for(let x=0;x<nx;x++) {
    const px=(x-(nx-1)/2)/(nx*.5), py=y/(ny*.82)-.35, pz=(z-(nz-1)/2)/(nz*.5);
    let inside;
    if(kind==='plant') inside=(Math.abs(px)<.18+rand()*.08 && y>0) || (Math.abs(px)<.52 && y>ny*.45 && rand()>.55);
    else inside=(px*px*1.05+py*py*1.8+pz*pz*.95 < .95+rand()*.24) && !(y<1 && rand()<.2);
    if(inside) cells.set(`${x},${y},${z}`,{x,y,z,c:0.78+rand()*.35});
  }
  const dirs=[[-1,0,0],[1,0,0],[0,-1,0],[0,1,0],[0,0,-1],[0,0,1]];
  const corners=[
    [[0,0,0],[0,1,0],[0,1,1],[0,0,1]], [[1,0,1],[1,1,1],[1,1,0],[1,0,0]],
    [[0,0,1],[1,0,1],[1,0,0],[0,0,0]], [[0,1,0],[1,1,0],[1,1,1],[0,1,1]],
    [[1,0,0],[1,1,0],[0,1,0],[0,0,0]], [[0,0,1],[0,1,1],[1,1,1],[1,0,1]]
  ];
  const positions=[], normals=[], colors=[], indices=[]; let index=0;
  const base=new THREE.Color(tint);
  for(const cellData of cells.values()) {
    for(let f=0;f<6;f++) {
      const [dx,dy,dz]=dirs[f]; if(cells.has(`${cellData.x+dx},${cellData.y+dy},${cellData.z+dz}`)) continue;
      const normal=new THREE.Vector3(dx,dy,dz); const shade=cellData.c*(f===3?1.12:(f===2?.72:.9));
      for(const c of corners[f]) { positions.push((cellData.x+c[0]-nx/2)*cell,(cellData.y+c[1]-ny*.25)*cell,(cellData.z+c[2]-nz/2)*cell); normals.push(dx,dy,dz); colors.push(base.r*shade,base.g*shade,base.b*shade); }
      indices.push(index,index+1,index+2,index,index+2,index+3); index+=4;
    }
  }
  const geo=new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3)); geo.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3)); geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3)); geo.setIndex(indices); geo.computeBoundingSphere(); return geo;
}

function makeCLOD(x,y,z,detail,voxel,proxy) {
  const root=new THREE.Group(); root.position.set(x,y,z);
  root.add(detail,voxel,proxy);
  voxel.visible=false; proxy.visible=false;
  scene.add(root); clodActors.push(root);
  return root;
}

function createRockLOD(x,y,z,seed,scale=1) {
  const detail=new THREE.Group(), mat=makeRockMaterial().clone(); resourceSet.add(mat); // per-LOD material: fades must not affect every rock at once
  const rng=(()=>{let s=seed>>>0;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};})();
  for(let i=0;i<7;i++) {
    const r=.24+rng()*.34; const mesh=new THREE.Mesh(deformRockGeometry(r,seed+i*13,2),mat);
    mesh.position.set((rng()-.5)*.85,(rng()-.5)*.35,(rng()-.5)*.72); mesh.scale.set(1+rng()*.45,.72+rng()*.55,1+rng()*.3); mesh.castShadow=true; mesh.receiveShadow=true; detail.add(mesh);
  }
  detail.scale.setScalar(scale);
  const voxel=new THREE.Mesh(buildVoxelGeometry(seed,'#8c9680',[10,7,10],.11,'rock'),new THREE.MeshStandardMaterial({vertexColors:true,roughness:.96})); voxel.scale.setScalar(scale); voxel.position.y=.06;
  const proxy=new THREE.Mesh(new THREE.IcosahedronGeometry(.66,0),new THREE.MeshStandardMaterial({color:'#7c8978',roughness:1,flatShading:true})); proxy.scale.set(scale*1.3,scale*.85,scale*1.1);
  return makeCLOD(x,y,z,detail,voxel,proxy);
}

function createLeafGeometry(length, width, bend) {
  const verts=[], uvs=[], indices=[]; const rows=12, cols=4;
  for(let i=0;i<=rows;i++) {
    const t=i/rows, w=Math.sin(Math.PI*t)*width*(.95-.2*t);
    for(let j=0;j<=cols;j++) {
      const v=j/cols*2-1; const x=v*w*.5 + bend*t*t; const y=length*t; const z=Math.sin(t*Math.PI)*.035*(1-v*v);
      verts.push(x,y,z); uvs.push(j/cols,t);
    }
  }
  for(let i=0;i<rows;i++) for(let j=0;j<cols;j++) { const a=i*(cols+1)+j,b=a+cols+1; indices.push(a,b,a+1,b,b+1,a+1); }
  const geo=new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3)); geo.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2)); geo.setIndex(indices); geo.computeVertexNormals(); return geo;
}

function createPlantLOD(x,y,z,seed,height=1.35) {
  const detail=new THREE.Group(); let s=seed>>>0; const rand=()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};
  const greens=['#567f66','#73977a','#385f50','#8aa27b'];
  const leafMaterials=greens.map(color=>{const material=new THREE.MeshStandardMaterial({color,roughness:.82,side:THREE.DoubleSide});resourceSet.add(material);return material;});
  for(let i=0;i<13;i++) {
    const a=i*2.399+rand()*.3, len=height*(.55+rand()*.65), bend=(rand()-.5)*.35;
    const leaf=new THREE.Mesh(createLeafGeometry(len,.2+rand()*.15,bend),leafMaterials[i%leafMaterials.length]);
    leaf.position.set(Math.cos(a)*.12,0,Math.sin(a)*.12); leaf.rotation.y=a; leaf.castShadow=true; detail.add(leaf);
  }
  const voxel=new THREE.Mesh(buildVoxelGeometry(seed,'#50795e',[7,9,7],.09,'plant'),new THREE.MeshStandardMaterial({vertexColors:true,roughness:1}));
  const proxy=new THREE.Mesh(new THREE.ConeGeometry(.32,height*.6,5,2),new THREE.MeshStandardMaterial({color:'#56745d',flatShading:true,roughness:1})); proxy.position.y=height*.24;
  const root=makeCLOD(x,y,z,detail,voxel,proxy); plants.push(root); return root;
}


function setTierOpacity(object, alpha) {
  object.visible = alpha > .008;
  object.traverse(child => {
    if (!child.isMesh || !child.material) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const mat of materials) {
      if (mat.userData.baseOpacity === undefined) {
        mat.userData.baseOpacity = mat.opacity;
        mat.userData.baseTransparent = mat.transparent;
        mat.userData.baseDepthWrite = mat.depthWrite;
      }
      mat.opacity = mat.userData.baseOpacity * alpha;
      mat.transparent = alpha < .995 || mat.userData.baseTransparent;
      mat.depthWrite = alpha > .995 ? mat.userData.baseDepthWrite : false;
    }
  });
}

function updateCLODs() {
  for (const root of clodActors) {
    const d = camera.position.distanceTo(root.position);
    // Smooth transitions: detailed geometry -> explicit voxel surfaces -> ordinary static proxy mesh.
    const [detail, voxel, proxy] = lodWeights(d);
    setTierOpacity(root.children[0],detail);
    setTierOpacity(root.children[1],voxel);
    setTierOpacity(root.children[2],proxy);
  }
}

function createFish(color, accent, scale=1, position=[0,1.5,0], phase=0) {
  const group=new THREE.Group(); group.position.set(...position); group.scale.setScalar(scale); scene.add(group);
  const pectorals={};
  const bodyMat=new THREE.MeshPhysicalMaterial({color,roughness:.29,metalness:.02,clearcoat:.68,clearcoatRoughness:.22}); resourceSet.add(bodyMat);
  const finMat=new THREE.MeshPhysicalMaterial({color:accent,roughness:.36,side:THREE.DoubleSide,transparent:true,opacity:.94,clearcoat:.45}); resourceSet.add(finMat);
  const body=new THREE.Mesh(new THREE.SphereGeometry(1,36,24),bodyMat); body.scale.set(.32,.23,.61); body.castShadow=false; group.add(body);
  const snout=new THREE.Mesh(new THREE.SphereGeometry(.16,20,14),bodyMat); snout.scale.set(1,.78,1.2); snout.position.set(0,-.015,-.49); group.add(snout);
  const eyeMat=new THREE.MeshPhysicalMaterial({color:'#071214',roughness:.09,clearcoat:1}); resourceSet.add(eyeMat);
  const irisMat=new THREE.MeshBasicMaterial({color:'#d8c9a0'}); resourceSet.add(irisMat);
  for(const side of [-1,1]) {
    const eye=new THREE.Mesh(new THREE.SphereGeometry(.052,16,12),eyeMat); eye.position.set(side*.255,.055,-.27); group.add(eye);
    const glint=new THREE.Mesh(new THREE.SphereGeometry(.014,10,8),irisMat); glint.position.set(side*.275,.072,-.294); group.add(glint);
    const pectoral=new THREE.Mesh(new THREE.SphereGeometry(1,16,10),finMat); pectoral.scale.set(.16,.018,.25); pectoral.position.set(side*.29,-.02,-.02); pectoral.rotation.z=side*.25; group.add(pectoral); pectorals[side]=pectoral;
  }
  // Tail and dorsal fin silhouettes.
  const tailShape=new THREE.Shape(); tailShape.moveTo(0,0); tailShape.quadraticCurveTo(-.22,.27,-.5,.32); tailShape.quadraticCurveTo(-.38,0,-.5,-.32); tailShape.quadraticCurveTo(-.22,-.25,0,0);
  const tail=new THREE.Mesh(new THREE.ShapeGeometry(tailShape,18),finMat); tail.position.z=.53; group.add(tail);
  const dorsalShape=new THREE.Shape(); dorsalShape.moveTo(-.35,.1); dorsalShape.quadraticCurveTo(-.12,.43,.19,.17); dorsalShape.lineTo(.28,.12); dorsalShape.closePath();
  const dorsal=new THREE.Mesh(new THREE.ShapeGeometry(dorsalShape,16),finMat); dorsal.position.set(0,.12,.02); dorsal.name='dorsal'; group.add(dorsal);
  const analShape=new THREE.Shape(); analShape.moveTo(-.2,-.1); analShape.quadraticCurveTo(.02,-.34,.25,-.13); analShape.closePath();
  const anal=new THREE.Mesh(new THREE.ShapeGeometry(analShape,12),finMat); anal.position.set(0,-.1,.25); group.add(anal);
  // Subtle gill arcs.
  const gillMat=new THREE.MeshStandardMaterial({color:accent,roughness:.65}); resourceSet.add(gillMat);
  for(const side of [-1,1]) {
    const curve=new THREE.QuadraticBezierCurve3(new THREE.Vector3(side*.27,.12,-.12),new THREE.Vector3(side*.32,0,-.05),new THREE.Vector3(side*.27,-.12,-.12));
    const gill=new THREE.Mesh(new THREE.TubeGeometry(curve,10,.008,5,false),gillMat); group.add(gill);
  }
  fishActors.push({group,phase,speed:.42+phase*.035,range:.5+scale*.3,origin:new THREE.Vector3(...position),tail,pectoralLeft:pectorals[-1],pectoralRight:pectorals[1]}); return group;
}

function createWaterAndParticles() {
  // Lightweight repeating caustic mask: a texture scroll replaces a full-screen shader.
  const c=document.createElement('canvas'); c.width=c.height=256;
  const ctx=c.getContext('2d'); ctx.fillStyle='#000'; ctx.fillRect(0,0,256,256);
  ctx.strokeStyle='rgba(190,245,218,.9)'; ctx.lineWidth=2;
  for(let i=0;i<34;i++) {
    const x=(i*47)%256, y=(i*83)%256;
    ctx.beginPath(); ctx.moveTo(x-28,y-20);
    ctx.bezierCurveTo(x-10,y-36,x+10,y+30,x+34,y+10); ctx.stroke();
  }
  const causticTexture=new THREE.CanvasTexture(c); causticTexture.wrapS=causticTexture.wrapT=THREE.RepeatWrapping; causticTexture.colorSpace=THREE.NoColorSpace; causticTexture.repeat.set(4,2); resourceSet.add(causticTexture);
  const causticMat=new THREE.MeshBasicMaterial({map:causticTexture,color:'#b8eedb',transparent:true,opacity:.14,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide}); resourceSet.add(causticMat);
  const caustics=new THREE.Mesh(new THREE.PlaneGeometry(7.85,3.55),causticMat); caustics.rotation.x=-Math.PI/2; caustics.position.set(0,.595,0); scene.add(caustics);
  // Directional shafts are shallow transparent meshes, not volumetric ray marching.
  const beamMat=new THREE.MeshBasicMaterial({color:'#e4f1d8',transparent:true,opacity:.035,depthWrite:false,side:THREE.DoubleSide}); resourceSet.add(beamMat);
  const beam=new THREE.Mesh(new THREE.ConeGeometry(1.9,7.2,20,1,true),beamMat); beam.position.set(-1.75,3.5,-3.65); beam.rotation.x=Math.PI/2; scene.add(beam);
  const beamMat2=new THREE.MeshBasicMaterial({color:'#c4e2d3',transparent:true,opacity:.02,depthWrite:false,side:THREE.DoubleSide}); resourceSet.add(beamMat2);
  const beam2=new THREE.Mesh(new THREE.ConeGeometry(1.15,6.5,18,1,true),beamMat2); beam2.position.set(-.8,3.1,-3.75); beam2.rotation.x=Math.PI/2; beam2.rotation.z=-.12; scene.add(beam2);
  // DynamicDrawUsage is explicit; 420 points share one draw call and one GPU buffer.
  const count=420, positions=new Float32Array(count*3);
  for(let i=0;i<count;i++) {
    const x=(Math.random()-.5)*7.6, y=.65+Math.random()*3.25, z=(Math.random()-.5)*3.2;
    positions[i*3]=x; positions[i*3+1]=y; positions[i*3+2]=z;
    bubblePositions.push({i,x,y,z,speed:.07+Math.random()*.18,phase:Math.random()*10});
  }
  const particleGeo=new THREE.BufferGeometry();
  const particleAttribute=new THREE.BufferAttribute(positions,3); particleAttribute.setUsage(THREE.DynamicDrawUsage);
  particleGeo.setAttribute('position',particleAttribute); particleGeo.computeBoundingSphere(); resourceSet.add(particleGeo);
  const particleMat=new THREE.PointsMaterial({color:'#d6eee0',size:.012,transparent:true,opacity:.38,depthWrite:false,sizeAttenuation:true}); resourceSet.add(particleMat);
  const particles=new THREE.Points(particleGeo,particleMat); scene.add(particles);
  return {causticTexture,causticMat,particleGeo,beam,beam2};
}

function createVoxelRadiance() {
  // Small static radiance field used only when the device falls back to WebGL 2.
  // Native WebGPU uses the actual VXGI voxelizer and cone-tracing volume below.
  const w=32,h=16,d=32, data=new Uint8Array(w*h*d*4);
  const gauss=(x,y,z,cx,cy,cz,sx,sy,sz)=>Math.exp(-(((x-cx)/sx)**2+((y-cy)/sy)**2+((z-cz)/sz)**2)*.5);
  for(let z=0;z<d;z++) for(let y=0;y<h;y++) for(let x=0;x<w;x++) {
    const wx=voxelBounds.min.x+(x/(w-1))*voxelBounds.size.x;
    const wy=voxelBounds.min.y+(y/(h-1))*voxelBounds.size.y;
    const wz=voxelBounds.min.z+(z/(d-1))*voxelBounds.size.z;
    const plantGlow=gauss(wx,wy,wz,-2.7,1.15,.55,1.8,1.1,1.8)+gauss(wx,wy,wz,2.45,1.0,.4,1.4,1,1.6);
    const sandGlow=gauss(wx,wy,wz,0,.68,0,4.5,.6,2.4);
    const windowGlow=gauss(wx,wy,wz,-2.0,3.1,-2.5,3.8,2.2,5.4);
    const roomGlow=gauss(wx,wy,wz,5.1,2.2,-10.4,3.2,2.5,4.4);
    const i=(z*h*w+y*w+x)*4;
    data[i]=Math.min(255,16+plantGlow*55+windowGlow*62+roomGlow*32);
    data[i+1]=Math.min(255,24+plantGlow*75+sandGlow*42+windowGlow*68+roomGlow*28);
    data[i+2]=Math.min(255,26+plantGlow*50+sandGlow*28+windowGlow*48+roomGlow*18);
    data[i+3]=255;
  }
  const tex=new THREE.Data3DTexture(data,w,h,d);
  tex.format=THREE.RGBAFormat; tex.type=THREE.UnsignedByteType; tex.minFilter=THREE.LinearFilter; tex.magFilter=THREE.LinearFilter;
  tex.wrapS=tex.wrapT=tex.wrapR=THREE.ClampToEdgeWrapping; tex.unpackAlignment=1; tex.needsUpdate=true; resourceSet.add(tex); return tex;
}

function createHybridPipeline() {
  renderPipeline = new THREE.RenderPipeline(renderer);

  // Compact G-buffer: packed normals and velocity in RGBA8/HDR-compatible passes.
  prePass = pass(scene,camera);
  prePass.setMRT(mrt({output:packNormalToRGB(normalView),velocity}));
  prePass.getTexture('output').type=THREE.UnsignedByteType;
  const preDepth=prePass.getTextureNode('depth');
  const preVelocity=prePass.getTextureNode('velocity');
  const preNormal=sample((uv)=>unpackRGBToNormal(prePass.getTextureNode('output').sample(uv)));

  scenePass=pass(scene,camera);
  scenePass.setMRT(mrt({output,diffuseColor}));
  scenePass.getTexture('diffuseColor').type=THREE.UnsignedByteType;
  const sceneColor=scenePass.getTextureNode('output');
  const sceneDiffuse=scenePass.getTextureNode('diffuseColor');

  // Screen-space GI is intentionally low-sample. It supplements, never replaces,
  // the directly lit base image; this prevents AO from crushing the whole frame.
  screenGI=ssgi(sceneColor,preDepth,preNormal,camera);
  screenGI.sliceCount.value=1;
  screenGI.stepCount.value=8;
  screenGI.giIntensity.value=2.2;
  screenGI.radius.value=5.5;
  screenGI.useTemporalFiltering=true;

  const isNativeWebGPU=!!(renderer.backend && renderer.backend.isWebGPUBackend===true);
  let voxelContext=null;
  fallbackVoxelBounce=null;

  if(isNativeWebGPU) {
    // Native Three.js VXGI performs GPU voxelization and cone tracing.
    // 64^3, two cones and zero extra bounces cap cost and radiance storage.
    voxelGI=vxgi(preDepth,preNormal,scene,camera,64);
    voxelGI.coneCount.value=2;
    voxelGI.coneAngle.value=48;
    voxelGI.giIntensity.value=.28;
    voxelGI.aoIntensity.value=.48;
    voxelGI.aoMinVisibility.value=.78;
    voxelGI.bounces=0;
    voxelGI.volume.bounces=0;
    voxelGI.volume.bounds.set(new THREE.Vector3(-8,-.4,-16),new THREE.Vector3(8,5.5,2));
    voxelGI.volume.maxDistance.value=9;
    voxelGI.useTemporalFiltering=true;
    voxelContext=builtinGIContext(
      voxelGI.getAONode().sample(screenUV).r,
      voxelGI.getGINode().sample(screenUV).rgb
    );
    backendLabel='WEBGPU';
  } else {
    // WebGL2 fallback: screen GI plus a 32x16x32 static voxel-light texture.
    // It preserves the hybrid look without pretending WebGL is running VXGI.
    voxelRadianceTexture=createVoxelRadiance();
    const voxelMin=vec3(-8,-1,-20);
    const voxelSize=vec3(16,8,23);
    const viewPos=getViewPosition(screenUV,preDepth,cameraProjectionMatrixInverse);
    const worldH=cameraWorldMatrix.mul(vec4(viewPos,1));
    const worldPos=worldH.xyz.div(worldH.w);
    const uvw=worldPos.sub(voxelMin).div(voxelSize);
    const inside=step(0,uvw.x).mul(step(uvw.x,1))
      .mul(step(0,uvw.y)).mul(step(uvw.y,1))
      .mul(step(0,uvw.z)).mul(step(uvw.z,1));
    const safeUVW=tslClamp(uvw,vec3(0),vec3(1));
    fallbackVoxelBounce=texture3D(voxelRadianceTexture,safeUVW).rgb.mul(inside).mul(.035);
    backendLabel='WEBGL 2 FALLBACK';
  }

  scenePass.contextNode=voxelContext;

  const ao=screenGI.getAONode().sample(screenUV).r;
  const gi=screenGI.getGINode().sample(screenUV).rgb;
  // Retain at least 84% of the original lit scene before adding subtle GI.
  const stableVisibility=ao.mul(.16).add(.84);
  let composite=vec4(
    tslAdd(sceneColor.rgb.mul(stableVisibility),sceneDiffuse.rgb.mul(gi).mul(.12)),
    sceneColor.a
  );
  if(fallbackVoxelBounce) {
    composite=vec4(tslAdd(composite.rgb,fallbackVoxelBounce),composite.a);
  }

  temporalPass=traa(composite,preDepth,preVelocity,camera);
  giComposite=temporalPass;
  renderPipeline.outputNode=giEnabled?giComposite:scenePass;
  $('fps').textContent=`-- FPS  /  ${backendLabel}`;
  $('qualityReadout').textContent=isNativeWebGPU?'SSGI + VXGI · VOXEL CLOD ACTIVE':'SSGI + BAKED VOXELS · WEBGL 2 FALLBACK';
}

async function initScene() {
  scene=new THREE.Scene();
  scene.background=new THREE.Color('#88aca5');
  scene.fog=new THREE.FogExp2('#8bb8b0',.0022); // restrained haze: the room must stay legible
  camera=new THREE.PerspectiveCamera(68,innerWidth/innerHeight,.06,70);
  camera.position.copy(initialCamera); camera.rotation.order='YXZ';

  renderer=new THREE.WebGPURenderer({antialias:true,alpha:false,stencil:false,powerPreference:'high-performance',forceWebGL:new URLSearchParams(location.search).get('backend') === 'webgl'});
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.42;
  renderer.transmissionResolutionScale=.55;
  renderer.setPixelRatio(Math.min(devicePixelRatio,quality==='high'?1.08:.86));
  renderer.setSize(innerWidth,innerHeight);
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  stage.appendChild(renderer.domElement);
  await renderer.init();

  // A broad skylight + soft underwater fill; exposure is balanced after physically based shading.
  const hemi=new THREE.HemisphereLight('#e3f5ec','#53746b',2.1); scene.add(hemi);
  const ambient=new THREE.AmbientLight('#fff4df',.62); scene.add(ambient);
  const key=new THREE.DirectionalLight('#fff0d4',4.6);
  key.position.set(-4.5,8,-8); key.target.position.set(0,1.2,0); key.castShadow=true;
  key.shadow.mapSize.set(1024,1024); key.shadow.camera.left=-6; key.shadow.camera.right=6; key.shadow.camera.top=6; key.shadow.camera.bottom=-6;
  key.shadow.bias=-.00012; key.shadow.normalBias=.025; scene.add(key,key.target);
  const aquaFill=new THREE.PointLight('#70c9b7',22,14,2); aquaFill.position.set(0,3.6,1.1); scene.add(aquaFill);
  const frontFill=new THREE.PointLight('#c8e7d8',11,11,2); frontFill.position.set(-2.8,2.8,-1.2); scene.add(frontFill);
  const windowLight=new THREE.DirectionalLight('#fff0d9',3.2); windowLight.position.set(-5.5,6.5,-22.2); windowLight.target.position.set(-1.5,1.4,-8); scene.add(windowLight,windowLight.target);

  createRoom(); createAquarium();
  // PBR substrate.
  const sand=new THREE.Mesh(new THREE.PlaneGeometry(7.85,3.55),makeSandMaterial());
  sand.rotation.x=-Math.PI/2; sand.position.set(0,.59,0); sand.receiveShadow=true; scene.add(sand);

  // Pebbles are one InstancedMesh instead of 190 independent draw calls.
  const gravelMat=makeMat('#99947d',.98);
  const gravelGeo=new THREE.IcosahedronGeometry(.04,0); resourceSet.add(gravelGeo);
  const gravelCount=190, gravel=new THREE.InstancedMesh(gravelGeo,gravelMat,gravelCount);
  const dummy=new THREE.Object3D();
  for(let i=0;i<gravelCount;i++) {
    const r=.55+Math.random()*.45;
    dummy.position.set((Math.random()-.5)*7.7,.60+Math.random()*.018,(Math.random()-.5)*3.45);
    dummy.scale.set(r,.55+Math.random()*.45,r); dummy.rotation.set(Math.random(),Math.random(),Math.random());
    dummy.updateMatrix(); gravel.setMatrixAt(i,dummy.matrix);
  }
  gravel.instanceMatrix.setUsage(THREE.StaticDrawUsage); gravel.computeBoundingSphere(); gravel.castShadow=false; gravel.receiveShadow=true; scene.add(gravel);

  // Detail -> surface voxels -> real low-poly proxies. No billboard impostors.
  createRockLOD(-2.8,.83,.15,81,1.35); createRockLOD(2.55,.82,-.15,143,1.18);
  createRockLOD(-.25,.75,-1.15,203,.72); createRockLOD(3.25,.76,1.2,271,.72);
  createPlantLOD(-2.25,.79,-.25,301,1.48); createPlantLOD(2.2,.8,.36,347,1.3); createPlantLOD(.2,.77,1.1,391,1.05); createPlantLOD(-3.15,.75,1.1,429,1.0);

  createFish('#d1a756','#e6d6a2',.88,[-1.0,1.6,-.55],1.1);
  createFish('#628d83','#d3c28e',.72,[1.65,2.25,.2],2.4);
  createFish('#bd7654','#e6c99b',.55,[.55,1.25,-1.0],3.5);
  createFish('#7695a4','#d9d9b0',.62,[-2.55,2.55,.65],4.4);
  scene.userData.particles=createWaterAndParticles();

  // Avoid continuous shadow-map rendering for a mostly static environment.
  renderer.shadowMap.autoUpdate=false;
  renderer.shadowMap.needsUpdate=true;
  try {
    createHybridPipeline();
  } catch(err) {
    console.warn('GI pipeline unavailable; using direct PBR renderer:',err);
    renderPipeline=null; pipelineFailed=true; giEnabled=false;
    $('giButton').textContent='GI no disponible'; $('giButton').classList.remove('primary'); $('giButton').disabled=true;
  }
  await renderer.compileAsync(scene,camera).catch((err)=>console.warn('Scene shader precompile warning:',err));
}

function updateCamera(dt) {
  moveForward.set(-Math.sin(yaw),0,-Math.cos(yaw));
  moveRight.set(Math.cos(yaw),0,-Math.sin(yaw));
  moveVector.set(0,0,0);
  if(keys.has('KeyW')||keys.has('ArrowUp')) moveVector.add(moveForward);
  if(keys.has('KeyS')||keys.has('ArrowDown')) moveVector.sub(moveForward);
  if(keys.has('KeyD')||keys.has('ArrowRight')) moveVector.add(moveRight);
  if(keys.has('KeyA')||keys.has('ArrowLeft')) moveVector.sub(moveRight);
  if(keys.has('Space')) moveVector.y+=.8;
  if(keys.has('ControlLeft')||keys.has('ControlRight')) moveVector.y-=.8;
  if(moveVector.lengthSq()>0) { moveVector.normalize().multiplyScalar(dt*1.65); camera.position.add(moveVector); }
  camera.position.x=clamp(camera.position.x,aquariumBounds.minX,aquariumBounds.maxX);
  camera.position.y=clamp(camera.position.y,aquariumBounds.minY,aquariumBounds.maxY);
  camera.position.z=clamp(camera.position.z,aquariumBounds.minZ,aquariumBounds.maxZ);
  camera.rotation.set(pitch,yaw,0,'YXZ');
  $('depthReadout').textContent=`${(4.35-camera.position.y).toFixed(1)} m`;
}

function animateScene(t,dt) {
  for(const f of fishActors) {
    const {group,phase,speed,range,origin}=f;
    const q=t*speed+phase;
    group.position.x=origin.x+Math.sin(q)*range;
    group.position.y=origin.y+Math.sin(q*1.45)*.13;
    group.position.z=origin.z+Math.cos(q*.72)*.31;
    group.rotation.y=Math.sin(q+.7)*.42;
    group.rotation.z=Math.cos(q*1.45)*.07;
    f.tail.rotation.y=Math.sin(t*5+phase)*.26;
    f.pectoralLeft.rotation.z=-(.22+Math.sin(t*6+phase)*.22);
    f.pectoralRight.rotation.z=.22+Math.sin(t*6+phase)*.22;
  }
  const particleInfo=scene.userData.particles;
  if(particleInfo) {
    const attr=particleInfo.particleGeo.attributes.position;
    for(const b of bubblePositions) {
      const y=.65+((b.y-.65+(t*b.speed)%3.15+3.15)%3.15);
      attr.array[b.i*3]=b.x+Math.sin(t*.35+b.phase)*.025;
      attr.array[b.i*3+1]=y;
      attr.array[b.i*3+2]=b.z+Math.cos(t*.25+b.phase)*.025;
    }
    attr.needsUpdate=true;
    particleInfo.causticTexture.offset.x=(t*.012)%1;
    particleInfo.causticTexture.offset.y=(t*.006)%1;
    particleInfo.beam.material.opacity=.032+.008*Math.sin(t*.43);
    particleInfo.beam2.material.opacity=.018+.005*Math.sin(t*.37+1.2);
  }
  for(let i=0;i<plants.length;i++) plants[i].rotation.z=Math.sin(t*.38+i*1.9)*.012;
}

function render() {
  renderer.setAnimationLoop(renderFrame);
}
function renderFrame() {
  const dt=Math.min(clock.getDelta(),.04), t=clock.elapsedTime;
  updateCamera(dt); animateScene(t,dt); updateCLODs();
  if(renderPipeline && !pipelineFailed) {
    try { renderPipeline.render(); }
    catch(err) {
      console.error('GI pipeline runtime failure; direct rendering enabled:',err);
      pipelineFailed=true; renderPipeline=null; giEnabled=false;
      $('giButton').textContent='GI no disponible'; $('giButton').classList.remove('primary'); $('giButton').disabled=true;
      renderer.render(scene,camera);
    }
  } else renderer.render(scene,camera);
  if(firstFrame) { renderer.shadowMap.autoUpdate=false; firstFrame=false; }
  fpsAccum+=dt; fpsFrames++;
  if(fpsAccum>.8) {
    const fps=Math.round(fpsFrames/fpsAccum);
    $('fps').textContent=`${fps} FPS  /  ${backendLabel}`;
    $('qualityReadout').textContent=`${giEnabled?'GI ON':'GI OFF'} · ${renderer.info.render.calls} CALLS · ${renderer.info.memory.geometries} GEO`;
    fpsAccum=0; fpsFrames=0;
  }
}
function resize() {
  width=innerWidth;height=innerHeight;
  if(!camera || !renderer) return;
  camera.aspect=width/height; camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(devicePixelRatio,quality==='high'?1.08:.86));
  renderer.setSize(width,height);
  const bufferWidth=Math.round(width*renderer.getPixelRatio());
  const bufferHeight=Math.round(height*renderer.getPixelRatio());
  screenGI?.setSize?.(bufferWidth,bufferHeight);
  voxelGI?.setSize?.(bufferWidth,bufferHeight);
  temporalPass?.setSize?.(bufferWidth,bufferHeight);
}
function setQuality() {
  quality=quality==='high'?'balanced':'high';
  $('qualityButton').textContent=`Calidad · ${quality==='high'?'Alta':'Equilibrada'}`;
  $('qualityReadout').textContent=quality==='high'?'SSGI + VXGI · HIGH':'SSGI + VXGI · BALANCED';
  if(screenGI) {
    screenGI.sliceCount.value=quality==='high'?2:1;
    screenGI.stepCount.value=quality==='high'?12:8;
  }
  if(voxelGI) {
    voxelGI.coneCount.value=quality==='high'?3:2;
    // Keep the 64^3 volume allocation fixed; quality changes sampling, not memory size.
  }
  resize();
}

function bindControls() {
  const canvas=renderer.domElement;
  canvas.addEventListener('pointerdown',(e)=>{dragging=true;lastPointer.x=e.clientX;lastPointer.y=e.clientY;canvas.setPointerCapture?.(e.pointerId);});
  canvas.addEventListener('pointermove',(e)=>{if(!dragging)return;const dx=e.clientX-lastPointer.x,dy=e.clientY-lastPointer.y;lastPointer.x=e.clientX;lastPointer.y=e.clientY;yaw-=dx*.0032;pitch=clamp(pitch-dy*.0026,-.85,.78);});
  canvas.addEventListener('pointerup',()=>dragging=false); canvas.addEventListener('pointercancel',()=>dragging=false);
  window.addEventListener('keydown',(e)=>{keys.add(e.code);if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();});
  window.addEventListener('keyup',(e)=>keys.delete(e.code));
  $('giButton').addEventListener('click',()=>{giEnabled=!giEnabled;$('giButton').textContent=`GI híbrida · ${giEnabled?'ON':'OFF'}`;$('giButton').classList.toggle('primary',giEnabled);if(renderPipeline){renderPipeline.outputNode=giEnabled?giComposite:scenePass;renderPipeline.needsUpdate=true;}});
  $('qualityButton').addEventListener('click',setQuality);
  $('resetButton').addEventListener('click',()=>{camera.position.copy(initialCamera);yaw=0;pitch=-.015;});
  window.addEventListener('resize',resize);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)clock.getDelta();});
  window.addEventListener('pagehide',(event)=>{ if (!event.persisted) disposeScene(); });
}

function disposeScene() {
  renderer?.setAnimationLoop(null);
  renderPipeline?.dispose?.();
  const disposed=new Set();
  const release=(resource)=>{ if(resource && !disposed.has(resource)) { disposed.add(resource); resource.dispose?.(); } };
  scene?.traverse((object)=>{
    release(object.geometry);
    const materials=Array.isArray(object.material)?object.material:(object.material?[object.material]:[]);
    for(const material of materials) {
      for(const value of Object.values(material)) if(value?.isTexture) release(value);
      release(material);
    }
  });
  for(const resource of resourceSet) release(resource);
  release(voxelRadianceTexture);
  renderer?.dispose?.();
}

async function boot() {
  try {
    setLoad(8,'Inicializando WebGPU y comprobando el backend…');
    await initScene();
    const isGPU=renderer.backend && renderer.backend.isWebGPUBackend===true;
    backendLabel=isGPU?'WEBGPU':'WEBGL 2 FALLBACK';
    setLoad(74,'Preparando GI de pantalla y volumen voxel…');
    bindControls();
    setLoad(92,'Compilando materiales PBR y sombreadores…');
    setLoad(100,'Listo · arrastra para explorar');
    $('fps').textContent=`-- FPS  /  ${backendLabel}`;
    $('qualityButton').textContent=`Calidad · ${quality==='high'?'Alta':'Equilibrada'}`;
    $('qualityReadout').textContent=isGPU?'WEBGPU · SSGI + VXGI':'WEBGL 2 · SSGI + VOXEL FIELD';
    setTimeout(()=>loader.classList.add('hidden'),450);
    render();
  } catch(err) {
    console.error(err);
    showError(`No se pudo iniciar el acuario: ${err.message}. Usa Chrome/Edge actualizado y abre el proyecto desde localhost; WebGPU requiere un navegador compatible y HTTPS o localhost.`);
    loadNote.textContent='Falló el inicio del renderizador.';
  }
}

boot();
