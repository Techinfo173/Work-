import * as THREE from 'three';

/**
 * Procedural canvas textures. Generated once at boot.
 */
export const TEX = {};

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}

function makeTex(c, repeat = 1) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat !== 1) t.repeat.set(repeat, repeat);
  return t;
}

function buildAsphalt() {
  const [c, ctx] = canvas(1024);
  ctx.fillStyle = '#2a2a2c';
  ctx.fillRect(0, 0, 1024, 1024);

  // Speckle
  for (let i = 0; i < 30000; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(0,0,0,0.15)' : 'rgba(255,255,255,0.03)';
    ctx.fillRect(Math.random() * 1024, Math.random() * 1024, 2, 2);
  }
  // Cracks
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 80; i++) {
    let x = Math.random() * 1024, y = Math.random() * 1024;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let j = 0; j < 8; j++) {
      x += (Math.random() - 0.5) * 30;
      y += (Math.random() - 0.5) * 30;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return makeTex(c, 10);
}

function buildGrid() {
  const [c, ctx] = canvas(1024);
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(0, 0, 1024, 1024);
  // Speckle
  for (let i = 0; i < 4000; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.05)';
    ctx.fillRect(Math.random() * 1024, Math.random() * 1024, 3, 3);
  }
  ctx.strokeStyle = 'rgba(255,170,0,0.3)';
  ctx.lineWidth = 3;
  for (let i = 0; i <= 1024; i += 128) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 1024); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(1024, i); ctx.stroke();
  }
  return makeTex(c, 100);
}

function buildSandbag() {
  const [c, ctx] = canvas(256);
  ctx.fillStyle = '#8b8b6a';
  ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(0,0,0,0.1)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 256; i += 4) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(256, i); ctx.stroke();
  }
  return makeTex(c);
}

function buildMuzzleFlash() {
  const [c, ctx] = canvas(256);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 256, 256);
  ctx.globalCompositeOperation = 'lighter';

  // Core
  for (let i = 0; i < 30; i++) {
    const r = 10 + Math.random() * 25;
    const x = 32 + (Math.random() - 0.5) * 20;
    const y = 128 + (Math.random() - 0.5) * 20;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.8)');
    g.addColorStop(0.3, 'rgba(255,200,100,0.5)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.28); ctx.fill();
  }
  // Forward jet
  for (let i = 0; i < 20; i++) {
    const r = 15 + Math.random() * 25;
    const x = 50 + Math.random() * 150;
    const y = 128 + (Math.random() - 0.5) * 20;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,220,100,0.8)');
    g.addColorStop(0.4, 'rgba(255,100,20,0.3)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.28); ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildMuzzleGlow() {
  const [c, ctx] = canvas(64);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 64, 64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,180,50,0.6)');
  g.addColorStop(0.4, 'rgba(200,50,0,0.2)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function buildBulletHole() {
  const [c, ctx] = canvas(64);
  ctx.fillStyle = 'rgba(10,10,10,0.95)';
  ctx.beginPath(); ctx.arc(32, 32, 10, 0, Math.PI * 2); ctx.fill();
  for (let i = 0; i < 15; i++) {
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.4 + 0.1})`;
    ctx.beginPath();
    ctx.arc(32 + (Math.random() - 0.5) * 8, 32 + (Math.random() - 0.5) * 8,
      12 + Math.random() * 8, 0, Math.PI * 2);
    ctx.fill();
  }
  return new THREE.CanvasTexture(c);
}

function buildSmoke() {
  const [c, ctx] = canvas(64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(200,200,200,0.8)');
  g.addColorStop(0.5, 'rgba(150,150,150,0.3)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export function buildTextures() {
  TEX.asphalt     = buildAsphalt();
  TEX.grid        = buildGrid();
  TEX.sandbag     = buildSandbag();
  TEX.muzzle      = buildMuzzleFlash();
  TEX.muzzleGlow  = buildMuzzleGlow();
  TEX.bulletHole  = buildBulletHole();
  TEX.smoke       = buildSmoke();
}
