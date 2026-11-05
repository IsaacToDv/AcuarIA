import * as THREE from 'three/webgpu';
import { resourceSet } from '../app/resources.js';

function fallbackTexture(base = '#b9a98b', seed = 1, colorSpace = THREE.NoColorSpace) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const ctx = c.getContext('2d', { alpha: false });
  let s = seed >>> 0;
  const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  ctx.fillStyle = base; ctx.fillRect(0,0,256,256);
  for (let i=0;i<5200;i++) {
    const a = rand()*.12; const v = Math.floor(rand()*255);
    ctx.fillStyle = `rgba(${v},${v},${v},${a})`;
    const size = rand()*2.1+.35; ctx.fillRect(rand()*256,rand()*256,size,size);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = colorSpace;
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  resourceSet.add(tex);
  return tex;
}

const texLoader = new THREE.TextureLoader();
texLoader.setCrossOrigin('anonymous');
function loadPBR(url, fallbackColor, seed, isColor = false) {
  const space = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  const tex = fallbackTexture(fallbackColor, seed, space);
  tex.anisotropy = 4;
  texLoader.load(url, (loaded) => {
    tex.image = loaded.image;
    tex.colorSpace = space;
    tex.needsUpdate = true;
    loaded.dispose();
  }, undefined, () => {
    // A procedural map remains active if the public texture host is unavailable.
  });
  return tex;
}

export const pbr = {
  sandColor: loadPBR('https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/sand_02/sand_02_diff_1k.jpg','#c1a77b',11,true),
  sandNormal: loadPBR('https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/sand_02/sand_02_nor_gl_1k.jpg','#8080a0',12,false),
  sandRough: loadPBR('https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/sand_02/sand_02_rough_1k.jpg','#b6b6b6',13,false),
  rockColor: loadPBR('https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/rock_01/rock_01_diff_1k.jpg','#706e63',21,true),
  rockNormal: loadPBR('https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/rock_01/rock_01_nor_gl_1k.jpg','#8080a0',22,false),
  rockRough: loadPBR('https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/rock_01/rock_01_rough_1k.jpg','#b9b9b9',23,false),
  woodColor: loadPBR('https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/fine_grained_wood/fine_grained_wood_diff_1k.jpg','#76533a',31,true),
  woodNormal: loadPBR('https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/fine_grained_wood/fine_grained_wood_nor_gl_1k.jpg','#8080a0',32,false),
  woodRough: loadPBR('https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/fine_grained_wood/fine_grained_wood_rough_1k.jpg','#aaaaaa',33,false)
};

