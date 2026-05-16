import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { Capsule } from 'three/addons/math/Capsule.js';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast, MeshBVH } from 'three-mesh-bvh';
import RAPIER from '@dimforge/rapier3d-compat';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
const CFG = {
  playerSpeed: 7, sprintMult: 1.35, adsSpeedMult: 0.4, fireSpeedMult: 0.5,
  playerRadius: 0.4, playerHeight: 2.2, jumpVel: 8, gravity: 25,
  fovHip: 70, fovAds: 45, sens: 0.0028, adsSensMult: 0.5,
  fireRate: 0.09, magSize: 30, reserveStart: 120, reloadTime: 1.8,
  gunHipPos: new THREE.Vector3(0.26, -0.36, -0.25),
  gunHipRot: new THREE.Euler(0.02, 0.05, -0.05),
  gunAdsPos: new THREE.Vector3(0.0, -0.256, -0.15),
  gunAdsRot: new THREE.Euler(0, 0, 0),
  maxDecals: isMobile ? 20 : 60, maxShells: isMobile ? 15 : 40
};

/* === SPRING === */
class Spring {
  constructor(m=1,d=15,s=250) { this.val=0; this.target=0; this.vel=0; this.m=m; this.d=d; this.s=s; }
  update(dt) { const f=(this.target-this.val)*this.s - this.vel*this.d; this.vel+=(f/this.m)*dt; this.val+=this.vel*dt; }
  addImpulse(a) { this.vel+=a; }
  reset() { this.val=0; this.vel=0; this.target=0; }
}

/* === AUDIO === */
let audioCtx=null;
function getAudio() { if(!audioCtx) audioCtx=new (window.AudioContext||window.webkitAudioContext)(); return audioCtx; }
function resumeAudio() { const c=getAudio(); if(c.state==='suspended') c.resume(); }
function noiseBuf(dur) { const c=getAudio(); const b=c.createBuffer(1,c.sampleRate*dur,c.sampleRate); const d=b.getChannelData(0); for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1; return b; }
function playGunshot() { const c=getAudio(); if(c.state==='suspended') return; const t=c.currentTime; const o=c.createOscillator(),g=c.createGain(); o.type='sine'; o.frequency.setValueAtTime(180,t); o.frequency.exponentialRampToValueAtTime(40,t+0.1); g.gain.setValueAtTime(1,t); g.gain.exponentialRampToValueAtTime(0.01,t+0.15); o.connect(g).connect(c.destination); o.start(t); o.stop(t+0.15); const n=c.createBufferSource(); n.buffer=noiseBuf(0.2); const f=c.createBiquadFilter(); f.type='highpass'; f.frequency.value=800; const ng=c.createGain(); ng.gain.setValueAtTime(0.7,t); ng.gain.exponentialRampToValueAtTime(0.01,t+0.2); n.connect(f).connect(ng).connect(c.destination); n.start(t); }
function playClick() { const c=getAudio(); if(c.state==='suspended') return; const t=c.currentTime; const o=c.createOscillator(),g=c.createGain(); o.type='square'; o.frequency.setValueAtTime(400,t); o.frequency.exponentialRampToValueAtTime(100,t+0.05); g.gain.setValueAtTime(0.3,t); g.gain.exponentialRampToValueAtTime(0.01,t+0.05); o.connect(g).connect(c.destination); o.start(t); o.stop(t+0.05); }
function playSlide() { const c=getAudio(); if(c.state==='suspended') return; const t=c.currentTime; const n=c.createBufferSource(); n.buffer=noiseBuf(0.1); const g=c.createGain(); g.gain.setValueAtTime(0.2,t); g.gain.exponentialRampToValueAtTime(0.01,t+0.1); n.connect(g).connect(c.destination); n.start(t); }
function playFootstep() { const c=getAudio(); if(c.state==='suspended') return; const t=c.currentTime; const n=c.createBufferSource(); n.buffer=noiseBuf(0.08); const f=c.createBiquadFilter(); f.type='lowpass'; f.frequency.value=300+Math.random()*200; const g=c.createGain(); g.gain.setValueAtTime(0.1,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.08); n.connect(f).connect(g).connect(c.destination); n.start(t); }
function playShellBounce(v) { const c=getAudio(); if(c.state==='suspended') return; const t=c.currentTime; const o=c.createOscillator(),g=c.createGain(); o.type='triangle'; o.frequency.setValueAtTime(4000+Math.random()*1000,t); o.frequency.exponentialRampToValueAtTime(800,t+0.05); g.gain.setValueAtTime(v*0.15,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.05); o.connect(g).connect(c.destination); o.start(t); o.stop(t+0.05); }

/* === STORAGE === */
const DB_NAME='VoidEngineDB', STORE='assets';
function openDB() { return new Promise((res,rej)=>{ const r=indexedDB.open(DB_NAME,1); r.onupgradeneeded=e=>{const db=e.target.result; if(!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);}; r.onsuccess=e=>res(e.target.result); r.onerror=()=>rej(r.error); }); }
async function saveBlob(key,blob) { const db=await openDB(); return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite'); tx.objectStore(STORE).put(blob,key); tx.oncomplete=()=>res(); tx.onerror=()=>rej(tx.error);}); }
async function loadBlob(key) { const db=await openDB(); return new Promise(res=>{const tx=db.transaction(STORE,'readonly'); const r=tx.objectStore(STORE).get(key); r.onsuccess=()=>res(r.result||null); r.onerror=()=>res(null);}); }
async function deleteBlob(key) { const db=await openDB(); return new Promise(res=>{const tx=db.transaction(STORE,'readwrite'); tx.objectStore(STORE).delete(key); tx.oncomplete=()=>res(); tx.onerror=()=>res();}); }

/* === TEXTURES === */
const TEX = {};
function canvas(sz) { const c=document.createElement('canvas'); c.width=c.height=sz; return [c,c.getContext('2d')]; }
function makeTex(c,rep=1) { const t=new THREE.CanvasTexture(c); t.wrapS=t.wrapT=THREE.RepeatWrapping; t.colorSpace=THREE.SRGBColorSpace; if(rep!==1) t.repeat.set(rep,rep); return t; }
function buildTextures() {
  const gridSize = isMobile ? 256 : 1024;
  const flashSize = isMobile ? 128 : 256;
  let c,ctx;
  // Grid floor (smaller on mobile)
  [c,ctx]=canvas(gridSize); ctx.fillStyle='#3a3a3a'; ctx.fillRect(0,0,gridSize,gridSize);
  const speckCount = isMobile ? 500 : 4000;
  for(let i=0;i<speckCount;i++){ctx.fillStyle=Math.random()>0.5?'rgba(0,0,0,0.2)':'rgba(255,255,255,0.05)'; ctx.fillRect(Math.random()*gridSize,Math.random()*gridSize,3,3);}
  ctx.strokeStyle='rgba(255,170,0,0.3)'; ctx.lineWidth=3; const step = gridSize/8;
  for(let i=0;i<=gridSize;i+=step){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,gridSize);ctx.stroke();ctx.beginPath();ctx.moveTo(0,i);ctx.lineTo(gridSize,i);ctx.stroke();}
  TEX.grid=makeTex(c,100);
  // Sandbag (small, fine)
  [c,ctx]=canvas(128); ctx.fillStyle='#8b8b6a'; ctx.fillRect(0,0,128,128); ctx.strokeStyle='rgba(0,0,0,0.1)'; ctx.lineWidth=1; for(let i=0;i<128;i+=4){ctx.beginPath();ctx.moveTo(i,0);ctx.lineTo(i,128);ctx.stroke();ctx.beginPath();ctx.moveTo(0,i);ctx.lineTo(128,i);ctx.stroke();}
  TEX.sandbag=makeTex(c);
  // Muzzle flash
  [c,ctx]=canvas(flashSize); ctx.fillStyle='#000'; ctx.fillRect(0,0,flashSize,flashSize); ctx.globalCompositeOperation='lighter';
  const cx = flashSize/8, cy = flashSize/2;
  for(let i=0;i<(isMobile?15:30);i++){const r=10+Math.random()*25,x=cx+(Math.random()-0.5)*20,y=cy+(Math.random()-0.5)*20; const g=ctx.createRadialGradient(x,y,0,x,y,r); g.addColorStop(0,'rgba(255,255,255,0.8)'); g.addColorStop(0.3,'rgba(255,200,100,0.5)'); g.addColorStop(1,'rgba(0,0,0,0)'); ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r,0,6.28); ctx.fill();}
  for(let i=0;i<(isMobile?10:20);i++){const r=15+Math.random()*25,x=50+Math.random()*(flashSize-50),y=cy+(Math.random()-0.5)*20; const g=ctx.createRadialGradient(x,y,0,x,y,r); g.addColorStop(0,'rgba(255,220,100,0.8)'); g.addColorStop(0.4,'rgba(255,100,20,0.3)'); g.addColorStop(1,'rgba(0,0,0,0)'); ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r,0,6.28); ctx.fill();}
  TEX.muzzle=new THREE.CanvasTexture(c); TEX.muzzle.colorSpace=THREE.SRGBColorSpace;
  // Muzzle glow
  [c,ctx]=canvas(64); ctx.fillStyle='#000'; ctx.fillRect(0,0,64,64); const gg=ctx.createRadialGradient(32,32,0,32,32,32); gg.addColorStop(0,'rgba(255,180,50,0.6)'); gg.addColorStop(0.4,'rgba(200,50,0,0.2)'); gg.addColorStop(1,'rgba(0,0,0,0)'); ctx.fillStyle=gg; ctx.fillRect(0,0,64,64);
  TEX.muzzleGlow=new THREE.CanvasTexture(c);
  // Bullet hole
  [c,ctx]=canvas(64); ctx.fillStyle='rgba(10,10,10,0.95)'; ctx.beginPath(); ctx.arc(32,32,10,0,Math.PI*2); ctx.fill();
  for(let i=0;i<15;i++){ctx.fillStyle=`rgba(0,0,0,${Math.random()*0.4+0.1})`; ctx.beginPath(); ctx.arc(32+(Math.random()-0.5)*8,32+(Math.random()-0.5)*8,12+Math.random()*8,0,Math.PI*2); ctx.fill();}
  TEX.bulletHole=new THREE.CanvasTexture(c);
  // Smoke
  [c,ctx]=canvas(64); const sg=ctx.createRadialGradient(32,32,0,32,32,32); sg.addColorStop(0,'rgba(200,200,200,0.8)'); sg.addColorStop(0.5,'rgba(150,150,150,0.3)'); sg.addColorStop(1,'rgba(0,0,0,0)'); ctx.fillStyle=sg; ctx.fillRect(0,0,64,64);
  TEX.smoke=new THREE.CanvasTexture(c);
}


/* === RENDERER SETUP (performance-optimized) === */
const renderer = new THREE.WebGLRenderer({ antialias:false, powerPreference:'high-performance', precision:'mediump', stencil:false, depth:true });
// Cap pixel ratio aggressively - #1 perf killer on ALL devices with complex GLBs
renderer.setPixelRatio(isMobile ? 0.6 : Math.min(window.devicePixelRatio, 1.0));
renderer.setSize(window.innerWidth, window.innerHeight);
// Shadows OFF by default - will be re-enabled only for simple default map
renderer.shadowMap.enabled = false;
renderer.shadowMap.type = THREE.BasicShadowMap; // cheapest shadow type if re-enabled
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping; // skip tone mapping entirely for perf
renderer.toneMappingExposure = 1.0;
renderer.autoClear = false;
document.body.appendChild(renderer.domElement);

const worldScene=new THREE.Scene(); worldScene.background=new THREE.Color(0xcccccc); worldScene.fog=new THREE.FogExp2(0xcccccc,0.002);
const worldCamera=new THREE.PerspectiveCamera(70,window.innerWidth/window.innerHeight,0.1,150);
const uiScene=new THREE.Scene();
const uiCamera=new THREE.PerspectiveCamera(50,window.innerWidth/window.innerHeight,0.01,100);

// Skip PMREM env entirely for world scene - it forces expensive IBL sampling on every material.
// The weapon UI scene gets env map setup in init() where async is available.

function onResize() { const w=window.innerWidth,h=window.innerHeight; renderer.setSize(w,h); worldCamera.aspect=w/h; worldCamera.updateProjectionMatrix(); uiCamera.aspect=w/h; uiCamera.updateProjectionMatrix(); }
window.addEventListener('resize',onResize);
window.addEventListener('orientationchange',()=>setTimeout(onResize,200));
document.addEventListener('fullscreenchange',()=>setTimeout(onResize,100));

/* === STATE === */
const S = {
  running:false, yaw:0, pitch:0, pos:new THREE.Vector3(0,CFG.playerHeight,0), vel:new THREE.Vector3(),
  isGrounded:true, walkPhase:0, walkAmt:0, locoSpeed:0, swayX:0, swayY:0, tilt:0,
  isFiring:false, isAds:false, isReloading:false, isInspecting:false, isSprinting:false,
  ammo:CFG.magSize, reserve:CFG.reserveStart, lastFire:0, fireCount:0, kills:0, screenFlash:0,
  weaponWrapper:null, weaponMixer:null, weaponActions:{}, currentAnim:null, defaultWeaponTransform:null,
  // Animation manager state.
  // locoTarget   = the locomotion clip that *should* be visible (idle/walk/run)
  // locoWeight   = the smoothed visible weight of locoTarget; faded to 0 during overlays (fire/reload/inspect)
  //                so the additive mixer doesn't double-pose the gun ("ghosting").
  locoTarget:null, locoWeight:1,
  impacts:[], decals:[], shells:[], tracers:[], targets:[], raycastTargets:[], collisionMeshes:[], bvhMesh:null,
  muzzleLight:null,
  // === Rapier physics handles ===
  physWorld:null, charCtl:null, playerBody:null, playerCol:null, mapCol:null
};

/* === PHYSICS (Rapier) ===
 * Rapier replaces the hand-rolled capsule slide + floor raycast.
 * - World: zero damping, gravity = -CFG.gravity
 * - Map: a single static TriMesh collider (built from merged collision geometry,
 *   same source the BVH uses, so both are guaranteed in sync)
 * - Player: kinematicPositionBased rigid body + capsule collider
 * - Movement: KinematicCharacterController.computeColliderMovement(...)
 *   handles slide, autostep, slope limits, snap-to-ground, all natively.
 */
// PHYS holds the LIVE physics parameters. The calibrator panel writes to these
// fields and the next physics step picks them up. Defaults are deliberately
// permissive - tuned for "complex maps with door thresholds and tall steps",
// not for a polite default arena.
const PHYS = {
  // Player capsule shape (live-tunable)
  bodyRadius: 0.18,         // capsule radius. <= ~0.20 fits through any normal door.
  bodyHeight: 2.2,          // total capsule height (top of head to feet)

  // Character controller
  CHAR_OFFSET: 0.02,        // skin width. Smaller = squeeze through tighter gaps.
  AUTOSTEP_HEIGHT: 1.0,     // max step the controller climbs without you jumping.
                            //   1.0m handles waist-high obstacles, doorway thresholds,
                            //   and most stair-of-doom cases out of the box.
  AUTOSTEP_MIN_WIDTH: 0.05, // tread must be >= 5cm to count as a step. Very permissive.
  SNAP_DIST: 0.5,           // stay glued to ground within 0.5m so we don't pop off ledges.
  MAX_SLOPE_CLIMB_DEG: 50,  // climb up to 50 degree slopes
  MIN_SLOPE_SLIDE_DEG: 65,  // start sliding above 65 degrees

  // Bookkeeping (set when player body is created)
  capsuleHalfHeight: 0,
  capsuleRadius: 0,
  // Reused per-frame to avoid allocations
  desired: { x:0, y:0, z:0 }
};

// Persisted overrides from previous session
try {
  const saved = JSON.parse(localStorage.getItem('physCal') || 'null');
  if (saved && typeof saved === 'object') Object.assign(PHYS, saved);
} catch(e) { /* ignore corrupt storage */ }

async function initPhysics() {
  await RAPIER.init();
  const gravity = { x: 0, y: -CFG.gravity, z: 0 };
  S.physWorld = new RAPIER.World(gravity);
  // Slightly larger timestep tolerance is fine for an FPS - we step at frame rate
  S.physWorld.timestep = 1/60;

  applyControllerSettings();
}

// (Re)build the character controller from the live PHYS values.
// Safe to call again whenever the calibrator changes any controller-level setting.
function applyControllerSettings() {
  if (!S.physWorld) return;
  // Recreate the controller so all settings (especially offset) take effect.
  if (S.charCtl) { try { S.physWorld.removeCharacterController(S.charCtl); } catch(e){} S.charCtl = null; }
  S.charCtl = S.physWorld.createCharacterController(PHYS.CHAR_OFFSET);
  S.charCtl.setUp({ x:0, y:1, z:0 });
  S.charCtl.enableAutostep(PHYS.AUTOSTEP_HEIGHT, PHYS.AUTOSTEP_MIN_WIDTH, true);
  S.charCtl.enableSnapToGround(PHYS.SNAP_DIST);
  S.charCtl.setMaxSlopeClimbAngle(PHYS.MAX_SLOPE_CLIMB_DEG * Math.PI / 180);
  S.charCtl.setMinSlopeSlideAngle(PHYS.MIN_SLOPE_SLIDE_DEG * Math.PI / 180);
  // Don't push dynamic objects around (we have none, and it's cheaper)
  S.charCtl.setApplyImpulsesToDynamicBodies(false);
}

function createPlayerBody() {
  if (!S.physWorld) return;
  // Tear down any existing body (so the calibrator can rebuild on the fly)
  if (S.playerCol) { try { S.physWorld.removeCollider(S.playerCol, false); } catch(e){} S.playerCol = null; }
  if (S.playerBody) { try { S.physWorld.removeRigidBody(S.playerBody); } catch(e){} S.playerBody = null; }

  // Capsule with total height = PHYS.bodyHeight, radius = PHYS.bodyRadius (live values).
  // Rapier capsule param 'halfHeight' is the half-length of the cylindrical *middle* part,
  // so total height = 2 * (halfHeight + radius)
  const totalH = PHYS.bodyHeight;
  const r = PHYS.bodyRadius;
  const halfH = Math.max(0.05, totalH/2 - r);
  PHYS.capsuleRadius = r;
  PHYS.capsuleHalfHeight = halfH;

  // Place the body so the capsule's *bottom* sits at S.pos.y - totalH;
  // S.pos.y is the eye/top position so the body center is S.pos.y - totalH/2.
  const bodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
    .setTranslation(S.pos.x, S.pos.y - totalH/2, S.pos.z);
  S.playerBody = S.physWorld.createRigidBody(bodyDesc);

  const colDesc = RAPIER.ColliderDesc.capsule(halfH, r)
    .setFriction(0.0)
    .setRestitution(0.0);
  S.playerCol = S.physWorld.createCollider(colDesc, S.playerBody);
}

// Live-rebuild the player capsule when the calibrator changes radius/height.
// Preserves the player's current position so it doesn't teleport.
function rebuildPlayerBody() {
  createPlayerBody();
}

/** Build the static map collider from a merged THREE.BufferGeometry.
 *  We reuse the same geometry the BVH uses to guarantee they describe the same world. */
function buildMapCollider(mergedGeom) {
  if (!S.physWorld || !mergedGeom) return;
  // Remove old one if rebuilding
  if (S.mapCol) { try { S.physWorld.removeCollider(S.mapCol, false); } catch(e){} S.mapCol = null; }

  const posAttr = mergedGeom.getAttribute('position');
  if (!posAttr) return;
  const verts = posAttr.array instanceof Float32Array ? posAttr.array : new Float32Array(posAttr.array);

  // Rapier wants a Uint32Array index buffer. If the merged geometry is non-indexed,
  // synthesize a sequential index.
  let indices;
  if (mergedGeom.index) {
    const src = mergedGeom.index.array;
    indices = src instanceof Uint32Array ? src : new Uint32Array(src);
  } else {
    const triCount = (verts.length / 3) | 0;
    indices = new Uint32Array(triCount);
    for (let i = 0; i < triCount; i++) indices[i] = i;
  }

  const colDesc = RAPIER.ColliderDesc.trimesh(verts, indices)
    .setFriction(1.0)
    .setRestitution(0.0);
  S.mapCol = S.physWorld.createCollider(colDesc);
  console.log('[Phys] Map collider built: ' + (verts.length/3) + ' verts, ' + (indices.length/3) + ' tris');
}

/* === SPRINGS === */
const springs = {
  kick:new Spring(1,25,350), rise:new Spring(1,15,350), twist:new Spring(1,10,250),
  ads:new Spring(1,18,200), side:new Spring(1,14,280), fov:new Spring(1,12,300), shake:new Spring(1,35,600),
  rPosX:new Spring(1,15,250), rPosY:new Spring(1,15,250), rPosZ:new Spring(1,15,250),
  rRotX:new Spring(1,12,200), rRotY:new Spring(1,12,200), rRotZ:new Spring(1,12,200)
};

/* === SHARED GEOMETRY (pooling) === */
const GEO = {
  impact: new THREE.BoxGeometry(0.04,0.04,0.04),
  decal: new THREE.PlaneGeometry(0.15,0.15),
  shell: new THREE.CylinderGeometry(0.003,0.003,0.015,6),
  tracer: new THREE.CylinderGeometry(0.01,0.01,1.0,4)
};
const POOL = { impacts:[], decals:[], shells:[], tracers:[] };

// Scratch vectors (reused every frame - zero allocations in hot loop)
const _v1=new THREE.Vector3(), _v2=new THREE.Vector3(), _v3=new THREE.Vector3();
const _q=new THREE.Quaternion(), _fwd=new THREE.Vector3(), _right=new THREE.Vector3(), _move=new THREE.Vector3();
const _down=new THREE.Vector3(0,-1,0), _rayO=new THREE.Vector3();
const _tPos=new THREE.Vector3();
const _floorRay=new THREE.Raycaster(); _floorRay.firstHitOnly=true;
const _hitRay=new THREE.Raycaster(); _hitRay.firstHitOnly=true;
const _capsule=new Capsule(new THREE.Vector3(), new THREE.Vector3(), 0.3);
const _capLine=new THREE.Line3();
const _triN=new THREE.Vector3(), _triP=new THREE.Vector3(), _capP=new THREE.Vector3();

/* === WORLD BUILD === */
let hasCustomMap = false; // track if user loaded a custom GLB

function buildLights() {
  worldScene.add(new THREE.HemisphereLight(0xffffff,0x888888,1.2));
  const dir=new THREE.DirectionalLight(0xfff9f0,2.0); dir.position.set(50,80,50);
  worldScene.add(dir);
  // Muzzle light only when no custom map (saves a per-frame point light)
  if (!hasCustomMap) {
    S.muzzleLight = new THREE.PointLight(0xffaa44,0,8); worldScene.add(S.muzzleLight);
  }
}

function buildDefaultMap() {
  // Default map is simple enough for shadows
  if(!isMobile) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.BasicShadowMap;
    // Add shadow to existing directional light
    worldScene.traverse(c => {
      if(c.isDirectionalLight) {
        c.castShadow = true;
        c.shadow.mapSize.width = c.shadow.mapSize.height = 1024;
        c.shadow.camera.left = -40; c.shadow.camera.right = 40;
        c.shadow.camera.top = 40; c.shadow.camera.bottom = -40;
        c.shadow.camera.far = 120; c.shadow.bias = -0.002;
      }
    });
  }

  const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200).rotateX(-Math.PI/2), new THREE.MeshStandardMaterial({map:TEX.grid,roughness:0.9,metalness:0.05}));
  if(!isMobile) floor.receiveShadow=true; worldScene.add(floor); S.collisionMeshes.push(floor); S.raycastTargets.push(floor);

  const bMat=new THREE.MeshStandardMaterial({map:TEX.sandbag,color:0x9999aa,roughness:0.85});
  const addBlock=(w,h,d,x,z,ry=0)=>{const g=new THREE.BoxGeometry(w,h,d); g.translate(0,h/2,0); const m=new THREE.Mesh(g,bMat); m.position.set(x,0,z); m.rotation.y=ry; if(!isMobile){m.castShadow=true; m.receiveShadow=true;} worldScene.add(m); S.collisionMeshes.push(m); S.raycastTargets.push(m);};

  const woodMat=new THREE.MeshStandardMaterial({color:0x8b5a2b,roughness:0.9});
  const metalMat=new THREE.MeshStandardMaterial({color:0x444444,metalness:0.8,roughness:0.2});
  const faceMat=new THREE.MeshStandardMaterial({color:0xff3333,roughness:0.5});

  const addTarget=(x,z,ry=0)=>{
    const grp=new THREE.Group(); grp.position.set(x,0,z); grp.rotation.y=ry;
    const post=new THREE.Mesh(new THREE.BoxGeometry(0.2,1.5,0.2),woodMat); post.position.y=0.75; if(!isMobile)post.castShadow=true; grp.add(post);
    const pivot=new THREE.Group(); pivot.position.y=1.4; grp.add(pivot);
    const body=new THREE.Mesh(new THREE.BoxGeometry(1.2,1.2,0.1),metalMat); body.position.y=0.6; if(!isMobile)body.castShadow=true; pivot.add(body);
    const face=new THREE.Mesh(new THREE.BoxGeometry(0.8,0.8,0.12),faceMat); face.position.y=0.6; pivot.add(face);
    worldScene.add(grp); S.raycastTargets.push(body,face,post);
    S.targets.push({pos:new THREE.Vector3(x,2.0,z),pivot,isDown:false,resetTimer:0});
  };

  addBlock(4,2,1,0,-10); addBlock(1,2,4,-4,-12); addBlock(1,2,4,4,-12);
  addTarget(2,-14); addTarget(-2,-14); addTarget(0,-28); addTarget(-8,-23,Math.PI/4); addTarget(8,-23,-Math.PI/4);
  addBlock(10,4,1,0,-30); addBlock(4,4,1,-12,-25,Math.PI/4); addBlock(4,4,1,12,-25,-Math.PI/4);
  // Fewer scatter blocks on mobile
  const scatter = isMobile ? 10 : 25;
  for(let i=0;i<scatter;i++){const w=1+Math.random()*3,h=1+Math.random()*2,d=1+Math.random()*3,x=(Math.random()-0.5)*70,z=(Math.random()-0.5)*70; if(Math.abs(x)<5&&Math.abs(z)<5) continue; addBlock(w,h,d,x,z,Math.random()*Math.PI);}

  // Build BVH
  const geoms=[];
  S.collisionMeshes.forEach(m=>{if(!m.geometry) return; m.updateMatrixWorld(true); const g=m.geometry.clone(); g.applyMatrix4(m.matrixWorld); for(const k in g.attributes) if(k!=='position') g.deleteAttribute(k); geoms.push(g);});
  if(geoms.length>0){try{const merged=BufferGeometryUtils.mergeGeometries(geoms,false); if(merged){merged.boundsTree=new MeshBVH(merged); S.bvhMesh=new THREE.Mesh(merged,new THREE.MeshBasicMaterial()); buildMapCollider(merged);}}catch(e){console.warn('BVH merge failed',e);}}
}

async function loadCustomMap(url) {
  hasCustomMap = true;
  return new Promise((res,rej)=>{
    const loader=new GLTFLoader();
    loader.load(url,gltf=>{
      const model=gltf.scene; model.updateMatrixWorld(true);
      const geoms=[];
      let totalTris = 0;
      const collisionGeoms = [];

      model.traverse(c=>{
        if(!c.isMesh) return;

        // === NEVER enable shadows on custom maps - this is the #1 killer ===
        c.castShadow=false;
        c.receiveShadow=false;

        // === Disable frustum culling for small meshes (avoids per-frame bounding box checks on complex scenes) ===
        // Actually keep it on - it helps when there are many meshes

        // === Downgrade materials for performance ===
        if(c.material) {
          // Convert to array for uniform handling
          const mats = Array.isArray(c.material) ? c.material : [c.material];
          mats.forEach(mat => {
            // Kill environment map (saves huge IBL sampling cost per fragment)
            mat.envMap = null;
            mat.envMapIntensity = 0;
            // Reduce shader complexity
            if(mat.isMeshStandardMaterial || mat.isMeshPhysicalMaterial) {
              // Downgrade MeshPhysicalMaterial to Standard behavior
              if(mat.isMeshPhysicalMaterial) {
                mat.clearcoat = 0;
                mat.sheen = 0;
                mat.transmission = 0;
                mat.thickness = 0;
                mat.iridescence = 0;
              }
              // Clamp texture sizes - huge textures from Sketchfab murder GPU bandwidth
              const downscaleTexture = (tex) => {
                if(!tex || !tex.image) return;
                const maxSize = isMobile ? 512 : 1024;
                if(tex.image.width > maxSize || tex.image.height > maxSize) {
                  // Force GPU to use smaller mip levels
                  tex.minFilter = THREE.LinearMipmapNearestFilter;
                  tex.generateMipmaps = true;
                }
                // Ensure no anisotropy (expensive)
                tex.anisotropy = 1;
              };
              downscaleTexture(mat.map);
              downscaleTexture(mat.normalMap);
              downscaleTexture(mat.roughnessMap);
              downscaleTexture(mat.metalnessMap);
              downscaleTexture(mat.aoMap);
              downscaleTexture(mat.emissiveMap);
              // Kill normal map if scene is very heavy (normal maps are expensive)
              if(isMobile) {
                mat.normalMap = null;
                mat.aoMap = null;
              }
            }
            // Ensure no double-sided (doubles triangle count for rasterizer)
            // Actually keep original side setting to avoid visual issues
            mat.needsUpdate = true;
          });
        }

        // Track triangle count
        if(c.geometry) {
          const idx = c.geometry.index;
          const tris = idx ? idx.count / 3 : (c.geometry.attributes.position ? c.geometry.attributes.position.count / 3 : 0);
          totalTris += tris;
        }

        // Only add larger meshes to raycast targets (skip tiny decorations)
        const box = new THREE.Box3().setFromObject(c);
        const size = box.getSize(_v1);
        const maxDim = Math.max(size.x, size.y, size.z);
        if(maxDim > 0.3) {
          S.raycastTargets.push(c);
        }
        // All meshes for collision BVH
        S.collisionMeshes.push(c);
        if(c.geometry){
          const g=c.geometry.clone(); g.applyMatrix4(c.matrixWorld);
          for(const k in g.attributes) if(k!=='position') g.deleteAttribute(k);
          collisionGeoms.push(g);
        }
      });

      console.log('[Perf] Custom map loaded: ~' + Math.round(totalTris/1000) + 'k triangles, ' + S.collisionMeshes.length + ' meshes');

      // Build BVH from collision geometry
      if(collisionGeoms.length>0){
        try{
          const merged=BufferGeometryUtils.mergeGeometries(collisionGeoms,false);
          if(merged){merged.boundsTree=new MeshBVH(merged); S.bvhMesh=new THREE.Mesh(merged,new THREE.MeshBasicMaterial()); buildMapCollider(merged);}
        }catch(e){console.warn('BVH merge failed',e);}
      }

      worldScene.add(model); res(model);
    },undefined,rej);
  });
}


/* === WEAPON === */
function findClip(anims,keywords){for(const kw of keywords){const f=anims.find(a=>a.name.toLowerCase().includes(kw.toLowerCase())); if(f) return f;} return null;}

let weaponGroup, weaponPivot, muzzleFlash, flashMeshes, muzzleGroup;
function buildWeaponScene() {
  weaponGroup=new THREE.Group();
  weaponPivot=new THREE.Group(); weaponPivot.add(weaponGroup); uiScene.add(weaponPivot);
  uiScene.add(new THREE.HemisphereLight(0xffffff,0x444444,1.4));
  const fl=new THREE.DirectionalLight(0xffffff,2.5); fl.position.set(2,4,3); uiScene.add(fl);
  if (!isMobile) {
    const rl=new THREE.DirectionalLight(0xccddff,2); rl.position.set(-3,2,-3); uiScene.add(rl);
  }
  uiScene.add(new THREE.AmbientLight(0xffffff,0.6));

  // Muzzle flash
  muzzleFlash=new THREE.PointLight(0xffcc55,0,4); muzzleFlash.position.set(0,0,-1); weaponGroup.add(muzzleFlash);
  const fGeo=new THREE.PlaneGeometry(0.5,0.5); fGeo.translate(0.25,0,0);
  const fMat=new THREE.MeshBasicMaterial({map:TEX.muzzle,color:0xffeebb,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,depthTest:false,side:THREE.DoubleSide});
  const p1=new THREE.Mesh(fGeo,fMat.clone()); p1.rotation.y=Math.PI/2;
  const p2=new THREE.Mesh(fGeo,fMat.clone()); p2.rotation.y=Math.PI/2; p2.rotation.x=Math.PI/2;
  const p3=new THREE.Mesh(fGeo,fMat.clone()); p3.rotation.y=Math.PI/2; p3.rotation.x=Math.PI/4;
  const glow=new THREE.Mesh(new THREE.PlaneGeometry(1.5,1.5), new THREE.MeshBasicMaterial({map:TEX.muzzleGlow,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,depthTest:false}));
  glow.position.z=-0.1;
  muzzleGroup=new THREE.Group(); muzzleGroup.add(p1,p2,p3,glow); muzzleFlash.add(muzzleGroup);
  flashMeshes=[p1,p2,p3,glow]; flashMeshes.forEach(m=>{m.frustumCulled=false; m.renderOrder=999;});
}

async function loadWeapon(url,isCustom) {
  while(weaponGroup.children.length>1) weaponGroup.remove(weaponGroup.children[weaponGroup.children.length-1]);
  S.weaponMixer=null; S.weaponActions={}; S.currentAnim=null;
  S.locoTarget=null; S.locoWeight=1;

  if(!url) { buildProceduralWeapon(); return {animationNames:[],meshes:[],isCustom:false}; }

  return new Promise((res,rej)=>{
    const loader=new GLTFLoader();
    loader.load(url,gltf=>{
      const model=gltf.scene;
      const meshes=[], animNames=[];
      // Enhance materials
      model.traverse(c=>{if(c.isMesh&&c.material){c.material.envMapIntensity=1.5; if(c.material.metalness!==undefined){c.material.metalness=Math.max(c.material.metalness,0.4); c.material.roughness=Math.min(c.material.roughness,0.6);}}});
      // Collect meshes + auto-hide sky shells
      model.traverse(c=>{if(!c.isMesh) return; const sz=new THREE.Box3().setFromObject(c).getSize(new THREE.Vector3()); const mx=Math.max(sz.x,sz.y,sz.z); const n=(c.name||'unnamed').toLowerCase(); if(n.includes('sky')||n.includes('dome')||n.includes('panorama')||n.includes('env')||mx>10) c.visible=false; meshes.push(c);});

      const wrapper=new THREE.Group(); wrapper.add(model); S.weaponWrapper=wrapper;
      // Auto-fit
      const box=new THREE.Box3().setFromObject(wrapper); const size=box.getSize(new THREE.Vector3()); const maxDim=Math.max(size.x,size.y,size.z);
      if(maxDim>0&&isFinite(maxDim)) wrapper.scale.setScalar(0.85/maxDim);
      const center=new THREE.Box3().setFromObject(wrapper).getCenter(new THREE.Vector3());
      wrapper.position.sub(center); wrapper.position.z+=0.05; wrapper.rotation.y=Math.PI;

      // Restore calibration
      if(isCustom){const saved=localStorage.getItem('weaponCal'); if(saved){try{const p=JSON.parse(saved); wrapper.scale.setScalar(p.s); wrapper.position.set(p.x,p.y,p.z); wrapper.rotation.set(THREE.MathUtils.degToRad(p.rx),THREE.MathUtils.degToRad(p.ry),THREE.MathUtils.degToRad(p.rz));}catch(e){}}}
      S.defaultWeaponTransform={s:wrapper.scale.x,x:wrapper.position.x,y:wrapper.position.y,z:wrapper.position.z,rx:THREE.MathUtils.radToDeg(wrapper.rotation.x),ry:THREE.MathUtils.radToDeg(wrapper.rotation.y),rz:THREE.MathUtils.radToDeg(wrapper.rotation.z)};
      weaponGroup.add(wrapper);

      // Animations
      if(gltf.animations&&gltf.animations.length>0){
        S.weaponMixer=new THREE.AnimationMixer(model);
        const act=(kws)=>{const clip=findClip(gltf.animations,kws); return clip?S.weaponMixer.clipAction(clip):null;};
        S.weaponActions={fire:act(['fire','shoot','attack','recoil']), idle:act(['idle','stand','wait','base']), reload:act(['reload','reloadclip']), emptyReload:act(['reload_empty','emptyclipreload','empty','dry']), inspect:act(['inspect','examine','weild','check']), walk:act(['walk','move','forward']), run:act(['run','sprint','dash'])};
        if(!S.weaponActions.emptyReload) S.weaponActions.emptyReload=S.weaponActions.reload;
        if(!S.weaponActions.fire) S.weaponActions.fire=S.weaponMixer.clipAction(gltf.animations[0]);
        if(S.weaponActions.fire){S.weaponActions.fire.setLoop(THREE.LoopOnce); S.weaponActions.fire.clampWhenFinished=true;}
        if(S.weaponActions.reload){S.weaponActions.reload.setLoop(THREE.LoopOnce); S.weaponActions.reload.clampWhenFinished=true;}
        if(S.weaponActions.emptyReload&&S.weaponActions.emptyReload!==S.weaponActions.reload){S.weaponActions.emptyReload.setLoop(THREE.LoopOnce); S.weaponActions.emptyReload.clampWhenFinished=true;}
        if(S.weaponActions.inspect){S.weaponActions.inspect.setLoop(THREE.LoopOnce); S.weaponActions.inspect.clampWhenFinished=true;}
        // Start *all* locomotion clips playing at weight 0; we cross-fade their weights
        // from updateWeapon. None of them is ever stopped, so the playhead never resets
        // mid-loop -> no hard cut when fire/reload ends.
        ['idle','walk','run'].forEach(k => {
          const a = S.weaponActions[k];
          if (a) { a.setLoop(THREE.LoopRepeat); a.setEffectiveWeight(0); a.play(); }
        });
        // Default to idle visible
        if (S.weaponActions.idle) {
          S.weaponActions.idle.setEffectiveWeight(1);
          S.locoTarget = S.weaponActions.idle;
          S.currentAnim = S.weaponActions.idle;
        }
        // When an overlay (fire/reload/inspect) finishes, we just stop *that* action.
        // We do NOT reset the locomotion clip - it has been playing this whole time
        // at weight 0, and updateWeapon will fade it back up.
        S.weaponMixer.addEventListener('finished', e => {
          e.action.stop();
          if (e.action === S.weaponActions.inspect) S.isInspecting = false;
        });
        gltf.animations.forEach(a=>animNames.push(a.name));
      }
      res({animationNames:animNames,meshes,isCustom});
    },undefined,rej);
  });
}

function buildProceduralWeapon() {
  const body=new THREE.Mesh(new THREE.BoxGeometry(0.06,0.18,0.42), new THREE.MeshStandardMaterial({color:0x222222,metalness:0.9,roughness:0.3}));
  const grip=new THREE.Mesh(new THREE.BoxGeometry(0.05,0.18,0.08), new THREE.MeshStandardMaterial({color:0x111111,roughness:0.7})); grip.position.set(0,-0.13,0.12); grip.rotation.x=-0.2;
  const barrel=new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.02,0.12,12), new THREE.MeshStandardMaterial({color:0x333333,metalness:0.9,roughness:0.4})); barrel.rotation.x=Math.PI/2; barrel.position.set(0,0.05,-0.27);
  const sight=new THREE.Mesh(new THREE.BoxGeometry(0.01,0.02,0.02), new THREE.MeshStandardMaterial({color:0xff3300})); sight.position.set(0,0.105,-0.1);
  const grp=new THREE.Group(); grp.add(body,grip,barrel,sight);
  const wrapper=new THREE.Group(); wrapper.add(grp); S.weaponWrapper=wrapper;
  S.defaultWeaponTransform={s:1,x:0,y:0,z:0,rx:0,ry:0,rz:0};
  weaponGroup.add(wrapper);
}

/* === ACTIONS === */
function triggerReload() {
  if(S.isReloading||S.ammo>=CFG.magSize||S.reserve<=0) return;
  if(S.isInspecting) cancelInspect();
  S.isReloading=true; S.isAds=false; S.isFiring=false;
  const isEmpty=S.ammo===0; const action=isEmpty?S.weaponActions.emptyReload:S.weaponActions.reload;
  let dur=CFG.reloadTime, ammoAt=dur*0.55;
  // Overlay clips: full weight, restart cleanly. The locomotion layer fades
  // itself out (see updateWeapon's locoWeight) so we don't double-pose.
  if(action){dur=action.getClip().duration; ammoAt=dur*0.55; action.stop(); action.reset(); action.setEffectiveWeight(1); action.play();}
  playSlide();
  setTimeout(()=>{const need=CFG.magSize-S.ammo,take=Math.min(need,S.reserve); S.ammo+=take; S.reserve-=take; playClick();}, ammoAt*1000);
  setTimeout(()=>{S.isReloading=false;}, dur*1000);
}

function triggerInspect() {
  if(S.isReloading||S.isAds||S.isFiring||S.isInspecting) return;
  if(!S.weaponActions.inspect) return;
  S.isInspecting=true;
  const a=S.weaponActions.inspect;
  a.stop(); a.reset(); a.setEffectiveWeight(1); a.play();
  playSlide();
}

function cancelInspect() {
  if(!S.isInspecting) return; S.isInspecting=false;
  if(S.weaponActions.inspect) S.weaponActions.inspect.stop();
  // Locomotion fades itself back in via updateWeapon - no manual reset needed.
}

function toggleAds() { if(S.isReloading) return; if(S.isInspecting) cancelInspect(); S.isAds=!S.isAds; }
function triggerJump() { if(S.isGrounded&&!S.isReloading){S.vel.y=CFG.jumpVel; S.isGrounded=false; playFootstep(); springs.shake.addImpulse(0.5);} }


/* === EFFECTS === */
function spawnImpact(point,normal) {
  if(S.decals.length>=CFG.maxDecals){const old=S.decals.shift(); old.mesh.visible=false; POOL.decals.push(old.mesh);}
  let d=POOL.decals.length>0?POOL.decals.pop():new THREE.Mesh(GEO.decal,new THREE.MeshBasicMaterial({map:TEX.bulletHole,transparent:true,opacity:0.9,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4}));
  d.visible=true; d.material.opacity=0.9; d.position.copy(point); d.lookAt(point.x+normal.x,point.y+normal.y,point.z+normal.z); d.rotateZ(Math.random()*Math.PI*2);
  if(!d.parent) worldScene.add(d); S.decals.push({mesh:d,life:10});

  for(let i=0;i<(isMobile?2:4);i++){
    const isSpark=Math.random()>0.4;
    let p=POOL.impacts.length>0?POOL.impacts.pop():new THREE.Mesh(GEO.impact,new THREE.MeshBasicMaterial({color:0xffaa44,transparent:true,opacity:1}));
    p.visible=true; p.material.color.setHex(isSpark?0xffdd88:0x444444); p.material.opacity=1; p.material.blending=isSpark?THREE.AdditiveBlending:THREE.NormalBlending;
    p.position.copy(point).addScaledVector(normal,0.02);
    _v1.set(Math.random()-0.5,Math.random()-0.5,Math.random()-0.5).normalize();
    const pw=isSpark?0.15+Math.random()*0.2:0.05+Math.random()*0.05;
    _v2.copy(normal).multiplyScalar(pw*0.5).add(_v1.multiplyScalar(pw));
    if(!p.parent) worldScene.add(p);
    S.impacts.push({mesh:p,vel:_v2.clone(),life:1,isSpark});
  }
}

function spawnShell() {
  if(S.shells.length>=CFG.maxShells){const old=S.shells.shift(); old.mesh.visible=false; POOL.shells.push(old.mesh);}
  let sh=POOL.shells.length>0?POOL.shells.pop():new THREE.Mesh(GEO.shell,new THREE.MeshStandardMaterial({color:0xccaa44,metalness:0.8,roughness:0.2,transparent:true}));
  sh.visible=true; sh.material.opacity=1;
  _v1.set(0.05,-0.04,-0.15).applyQuaternion(worldCamera.quaternion);
  sh.position.copy(worldCamera.position).add(_v1);
  _v2.set(0.04+Math.random()*0.02,0.02+Math.random()*0.02,0.01+Math.random()*0.02).applyQuaternion(worldCamera.quaternion);
  if(!sh.parent) worldScene.add(sh);
  S.shells.push({mesh:sh,vel:_v2.clone(),rotVel:new THREE.Vector3((Math.random()-0.5)*40,(Math.random()-0.5)*40,(Math.random()-0.5)*40),life:2.5});
}

function spawnTracer(start,end) {
  if(S.tracers.length>=30) return;
  let t=POOL.tracers.length>0?POOL.tracers.pop():new THREE.Mesh(GEO.tracer,new THREE.MeshBasicMaterial({color:0xffdd88,transparent:true,opacity:0.8,depthWrite:false}));
  t.visible=true; t.material.opacity=0.8; const dist=start.distanceTo(end);
  t.position.copy(start).lerp(end,0.5); t.lookAt(end); t.rotateX(Math.PI/2); t.scale.set(1,Math.min(dist,15),1);
  if(!t.parent) worldScene.add(t); S.tracers.push({mesh:t,life:0.05});
}

function updateEffects(dt) {
  for(let i=S.impacts.length-1;i>=0;i--){const p=S.impacts[i]; p.life-=dt*(p.isSpark?1.5:2.5); p.vel.y-=dt*0.05; p.mesh.position.addScaledVector(p.vel,dt*60); if(p.isSpark){p.mesh.material.opacity=p.life; p.mesh.scale.set(0.015,0.015,p.vel.length()*0.015);}else{p.mesh.scale.setScalar(Math.max(0,p.life));} if(p.life<=0){p.mesh.visible=false; POOL.impacts.push(p.mesh); S.impacts.splice(i,1);}}
  for(let i=S.decals.length-1;i>=0;i--){const d=S.decals[i]; d.life-=dt; if(d.life<2) d.mesh.material.opacity=(d.life/2)*0.9; if(d.life<=0){d.mesh.visible=false; POOL.decals.push(d.mesh); S.decals.splice(i,1);}}
  for(let i=S.shells.length-1;i>=0;i--){const s=S.shells[i]; s.life-=dt; s.vel.y-=dt*0.2; s.mesh.position.addScaledVector(s.vel,dt*60); if(s.mesh.position.y<=0.02&&s.vel.y<0){s.mesh.position.y=0.02; s.vel.y*=-0.5; if(Math.abs(s.vel.y)>0.01) playShellBounce(s.life/2.5); s.vel.x*=0.6; s.vel.z*=0.6; s.rotVel.multiplyScalar(0.5);} s.mesh.rotation.x+=s.rotVel.x*dt; s.mesh.rotation.y+=s.rotVel.y*dt; s.mesh.rotation.z+=s.rotVel.z*dt; if(s.life<0.5) s.mesh.material.opacity=Math.max(0,s.life/0.5); if(s.life<=0){s.mesh.visible=false; POOL.shells.push(s.mesh); S.shells.splice(i,1);}}
  for(let i=S.tracers.length-1;i>=0;i--){const t=S.tracers[i]; t.life-=dt; if(t.life<=0){t.mesh.visible=false; POOL.tracers.push(t.mesh); S.tracers.splice(i,1);}}
  for(const t of S.targets){const rot=t.isDown?-Math.PI/2.2:0; t.pivot.rotation.x=THREE.MathUtils.lerp(t.pivot.rotation.x,rot,dt*10); if(t.isDown){t.resetTimer-=dt; if(t.resetTimer<=0) t.isDown=false;}}
}

/* === INPUT === */
const keys={};
let touchMoveX=0, touchMoveY=0, touchSprint=false;
window.addEventListener('keydown',e=>{keys[e.code]=true; if(e.code==='KeyR') triggerReload(); if(e.code==='KeyF') triggerInspect(); if(e.code==='Space') triggerJump();});
window.addEventListener('keyup',e=>{keys[e.code]=false;});
window.addEventListener('contextmenu',e=>e.preventDefault());
document.addEventListener('mousemove',e=>{if(document.pointerLockElement&&S.running){let sens=CFG.sens; if(S.isAds) sens*=CFG.adsSensMult; S.yaw-=e.movementX*sens; S.pitch-=e.movementY*sens; S.pitch=Math.max(-1.5,Math.min(1.5,S.pitch)); S.swayX-=e.movementX*0.0012; S.swayY+=e.movementY*0.0012;}});
document.addEventListener('mousedown',e=>{if(!S.running) return; if(!document.pointerLockElement){renderer.domElement.requestPointerLock(); return;} if(e.button===0){if(S.isInspecting) cancelInspect(); S.isFiring=true;} if(e.button===2) toggleAds();});
document.addEventListener('mouseup',e=>{if(e.button===0) S.isFiring=false;});

// Touch
const touchLeft=document.getElementById('touch-left'), touchRight=document.getElementById('touch-right');
const jBase=document.getElementById('joy-base'), jStick=document.getElementById('joy-stick');
let moveId=null,startX=0,startY=0, lookId=null,lastLX=0,lastLY=0;
touchLeft.addEventListener('touchstart',e=>{e.preventDefault(); const t=e.changedTouches[0]; moveId=t.identifier; startX=t.clientX; startY=t.clientY; jBase.style.display='block'; jBase.style.left=t.clientX+'px'; jBase.style.top=t.clientY+'px';},{passive:false});
touchLeft.addEventListener('touchmove',e=>{e.preventDefault(); for(const t of e.changedTouches){if(t.identifier===moveId){const dx=t.clientX-startX,dy=t.clientY-startY,dist=Math.min(Math.hypot(dx,dy),50),ang=Math.atan2(dy,dx); jStick.style.transform=`translate(calc(-50% + ${Math.cos(ang)*dist}px), calc(-50% + ${Math.sin(ang)*dist}px))`; touchMoveX=Math.cos(ang)*dist/50; touchMoveY=Math.sin(ang)*dist/50; touchSprint=touchMoveY<-0.65;}}},{passive:false});
const endMove=e=>{for(const t of e.changedTouches){if(t.identifier===moveId){moveId=null; touchMoveX=0; touchMoveY=0; touchSprint=false; jBase.style.display='none';}}};
touchLeft.addEventListener('touchend',endMove); touchLeft.addEventListener('touchcancel',endMove);
touchRight.addEventListener('touchstart',e=>{e.preventDefault(); const t=e.changedTouches[0]; lookId=t.identifier; lastLX=t.clientX; lastLY=t.clientY;},{passive:false});
touchRight.addEventListener('touchmove',e=>{e.preventDefault(); for(const t of e.changedTouches){if(t.identifier===lookId){let sens=CFG.sens; if(S.isAds) sens*=CFG.adsSensMult; const dx=t.clientX-lastLX,dy=t.clientY-lastLY; S.yaw-=dx*sens; S.pitch-=dy*sens; S.pitch=Math.max(-1.5,Math.min(1.5,S.pitch)); S.swayX-=dx*0.0012; S.swayY+=dy*0.0012; lastLX=t.clientX; lastLY=t.clientY;}}},{passive:false});
const endLook=e=>{for(const t of e.changedTouches){if(t.identifier===lookId) lookId=null;}};
touchRight.addEventListener('touchend',endLook); touchRight.addEventListener('touchcancel',endLook);

// Buttons
const bindBtn=(id,start,end)=>{const el=document.getElementById(id); if(!el) return; el.addEventListener('touchstart',e=>{e.preventDefault(); start();},{passive:false}); if(end){el.addEventListener('touchend',e=>{e.preventDefault(); end();}); el.addEventListener('touchcancel',e=>{e.preventDefault(); end();});}};
bindBtn('btn-fire',()=>{if(S.isInspecting) cancelInspect(); S.isFiring=true;},()=>{S.isFiring=false;});
bindBtn('btn-ads',()=>toggleAds()); bindBtn('btn-reload',()=>triggerReload()); bindBtn('btn-jump',()=>triggerJump()); bindBtn('btn-inspect',()=>triggerInspect());

/* === PLAYER UPDATE === */
const FLOOR_SAMPLES=[{x:0,z:0},{x:CFG.playerRadius*0.7,z:0},{x:-CFG.playerRadius*0.7,z:0},{x:0,z:CFG.playerRadius*0.7},{x:0,z:-CFG.playerRadius*0.7}];
// Reduced floor samples for custom maps (BVH handles collision)
const FLOOR_SAMPLES_LITE=[{x:0,z:0},{x:CFG.playerRadius*0.6,z:0},{x:0,z:CFG.playerRadius*0.6}];
function updatePlayer(dt) {
  // Input
  let mx=0,my=0,sprint=false;
  if(keys['KeyW']) my-=1; if(keys['KeyS']) my+=1; if(keys['KeyA']) mx-=1; if(keys['KeyD']) mx+=1;
  if(mx||my){const l=Math.hypot(mx,my)||1; mx/=l; my/=l; sprint=!!keys['ShiftLeft'];}else{mx=touchMoveX; my=touchMoveY; sprint=touchSprint;}

  _q.setFromEuler(new THREE.Euler(S.pitch,S.yaw,0,'YXZ'));
  _fwd.set(0,0,-1).applyQuaternion(_q); _fwd.y=0; _fwd.normalize();
  _right.set(1,0,0).applyQuaternion(_q); _right.y=0; _right.normalize();
  _move.set(0,0,0).addScaledVector(_fwd,-my).addScaledVector(_right,mx); if(_move.lengthSq()>0) _move.normalize();

  const canSprint=!S.isAds&&!S.isFiring&&!S.isReloading&&S.isGrounded;
  S.isSprinting=canSprint&&sprint;
  let spd=CFG.playerSpeed; if(S.isAds) spd*=CFG.adsSpeedMult; if(S.isFiring&&!S.isReloading) spd*=CFG.fireSpeedMult; if(S.isSprinting) spd*=CFG.sprintMult;
  S.vel.x+=(_move.x*spd-S.vel.x)*10*dt; S.vel.z+=(_move.z*spd-S.vel.z)*10*dt;

  // === Movement: Rapier kinematic character controller ===
  if (S.physWorld && S.charCtl && S.playerBody) {
    // Apply gravity to vertical velocity (jump impulses set S.vel.y elsewhere)
    if (!S.isGrounded) S.vel.y -= CFG.gravity * dt;
    else if (S.vel.y < 0) S.vel.y = -1;  // small downward bias keeps us snapped to ground

    PHYS.desired.x = S.vel.x * dt;
    PHYS.desired.y = S.vel.y * dt;
    PHYS.desired.z = S.vel.z * dt;

    // Compute the corrected movement: handles slide, autostep, slope limits, snap-to-ground.
    S.charCtl.computeColliderMovement(S.playerCol, PHYS.desired);
    const corrected = S.charCtl.computedMovement();
    const wasGrounded = S.isGrounded;
    S.isGrounded = S.charCtl.computedGrounded();

    const t = S.playerBody.translation();
    const nx = t.x + corrected.x;
    const ny = t.y + corrected.y;
    const nz = t.z + corrected.z;
    S.playerBody.setNextKinematicTranslation({ x: nx, y: ny, z: nz });

    // Step the physics world (kinematic bodies' next translations are committed here)
    S.physWorld.step();

    // Mirror physics state back into game state.
    // S.pos is the camera/eye position; capsule center is at body translation.
    S.pos.x = nx;
    S.pos.z = nz;
    S.pos.y = ny + PHYS.bodyHeight/2;  // top of capsule == eye

    // If we were airborne and just landed, play the landing fx
    if (!wasGrounded && S.isGrounded) {
      springs.shake.addImpulse(Math.min(2, Math.abs(S.vel.y) * 0.15));
      playFootstep();
      S.vel.y = 0;
    }
    // If we were grounded and walked off a ledge, the controller will report not grounded
    // and gravity will take over next frame. No special-case needed.
    if (S.isGrounded && S.vel.y < 0) S.vel.y = 0;

    // Safety net: if something teleports us below the world, reset
    if (S.pos.y < -50) {
      S.pos.set(0, PHYS.bodyHeight, 0); S.vel.set(0,0,0);
      S.playerBody.setNextKinematicTranslation({ x:0, y:PHYS.bodyHeight/2, z:0 });
    }
  } else {
    // Fallback (should not happen in practice): integrate without collision.
    S.pos.x += S.vel.x * dt;
    S.pos.z += S.vel.z * dt;
    if (!S.isGrounded) { S.vel.y -= CFG.gravity * dt; S.pos.y += S.vel.y * dt; }
    if (S.pos.y <= CFG.playerHeight) { S.pos.y = CFG.playerHeight; S.vel.y = 0; S.isGrounded = true; }
    if (S.pos.y < -50) { S.pos.set(0, CFG.playerHeight, 0); S.vel.set(0,0,0); }
  }

  // Walk phase - advance at a fixed cadence based on speed (decoupled from
  // per-frame velocity wobble) so the gun bob frequency is rock-steady.
  const spd2D=Math.hypot(S.vel.x,S.vel.z);
  const moving = spd2D > 0.1 && S.isGrounded;
  // Smoothly ramp the bob *amount* in/out so stopping doesn't snap the gun.
  S.walkAmt = THREE.MathUtils.lerp(S.walkAmt, moving ? Math.min(1, spd2D / CFG.playerSpeed) : 0, dt * 6);
  if (moving) {
    const prev = S.walkPhase;
    // Step cadence: ~2 Hz at walk, ~2.6 Hz at sprint. Independent of frame jitter.
    const cadence = S.isSprinting ? 8.0 : 6.2;
    S.walkPhase += dt * cadence;
    if (Math.sin(prev) * Math.sin(S.walkPhase) <= 0) playFootstep();
  }
  // Don't lerp the *phase* back to 0 - that creates a visible flick. Just let
  // walkAmt fade out; the phase keeps advancing harmlessly behind the curtain.

  S.swayX=THREE.MathUtils.clamp(THREE.MathUtils.lerp(S.swayX,0,dt*7),-0.05,0.05);
  S.swayY=THREE.MathUtils.clamp(THREE.MathUtils.lerp(S.swayY,0,dt*7),-0.05,0.05);
  const localVx=S.vel.x*Math.cos(-S.yaw)-S.vel.z*Math.sin(-S.yaw);
  S.tilt=THREE.MathUtils.lerp(S.tilt,localVx*-0.012,dt*5);
  springs.shake.update(dt);

  // Camera
  worldCamera.position.copy(S.pos);
  // Only add procedural camera bob when we DON'T have a baked walk/run anim.
  // If a baked clip is active, it already bobs the weapon - adding camera bob
  // on top creates a double-bounce that reads as vibration/jitter.
  if (S.walkAmt > 0.001 && !(S.weaponActions.walk || S.weaponActions.run)) {
    worldCamera.position.y += Math.sin(S.walkPhase * 2) * 0.035 * S.walkAmt;
    worldCamera.position.x += Math.cos(S.walkPhase) * 0.025 * S.walkAmt;
  }
  const sk=springs.shake.val; if(sk>0.01){worldCamera.position.x+=(Math.random()-0.5)*sk*0.05; worldCamera.position.y+=(Math.random()-0.5)*sk*0.05;}
  worldCamera.rotation.set(S.pitch,S.yaw,S.tilt,'YXZ');
}


/* === WEAPON UPDATE === */
function updateWeapon(dt,time) {
  if(S.weaponMixer) S.weaponMixer.update(dt);
  for(const k in springs) springs[k].update(dt);
  springs.ads.target=S.isAds?1:0;

  // Fire
  if(S.isFiring&&!S.isReloading&&!S.isInspecting){
    if(time-S.lastFire>=CFG.fireRate){
      if(S.ammo>0){
        S.lastFire=time; S.ammo--; S.fireCount=(S.fireCount||0)+1; playGunshot(); spawnShell();
        if(S.weaponActions.fire){S.weaponActions.fire.stop(); S.weaponActions.fire.reset(); S.weaponActions.fire.setEffectiveWeight(1); S.weaponActions.fire.play();}
        const rm=S.isAds?0.6:1, acc=1+Math.min(1,(S.fireCount-1)*0.1);
        springs.kick.addImpulse(1.6*rm*acc); springs.rise.addImpulse(2.4*rm*acc); springs.side.addImpulse((Math.random()-0.5)*1.2*rm*acc); springs.twist.addImpulse((Math.random()-0.5)*rm*acc); springs.fov.addImpulse(15*rm);
        muzzleFlash.intensity=8; muzzleGroup.rotation.z=Math.random()*Math.PI; flashMeshes.forEach((m,i)=>{m.material.opacity=0.8+Math.random()*0.2; if(i===3){m.material.opacity=0.6; m.scale.setScalar(0.7+Math.random()*0.4);}else{m.scale.set(1+Math.random()*0.8,0.3+Math.random()*0.2,1);}});
        S.screenFlash=0.4; S.pitch+=(Math.random()*0.015+0.01)*(S.isAds?0.3:1)*acc; S.yaw+=(Math.random()-0.5)*0.015*(S.isAds?0.3:1)*acc;
        springs.shake.addImpulse(2*(S.isAds?0.6:1));
        // Hitscan
        _hitRay.setFromCamera({x:0,y:0},worldCamera);
        const muzzPos=worldCamera.position.clone().add(_v1.set(0,-0.05,-0.5).applyQuaternion(worldCamera.quaternion));
        // Use BVH mesh for hit detection when available (orders of magnitude faster)
        let hits;
        if(S.bvhMesh && S.bvhMesh.geometry.boundsTree) {
          hits = _hitRay.intersectObject(S.bvhMesh, false);
        } else {
          hits = _hitRay.intersectObjects(S.raycastTargets, true);
        }
        if(hits.length>0){const h=hits[0]; spawnImpact(h.point,h.face.normal); spawnTracer(muzzPos,h.point);
          for(const t of S.targets){if(!t.isDown&&h.point.distanceTo(t.pos)<1.5){t.isDown=true; t.resetTimer=3; S.kills++;
            const hm=document.getElementById('hit-marker'); hm.style.transition='none'; hm.style.transform=`translate(-50%,-50%) rotate(${Math.random()*20-10}deg) scale(1.8)`; hm.style.opacity='1'; requestAnimationFrame(()=>{hm.style.transition='all 0.15s ease-out'; hm.style.transform='translate(-50%,-50%) scale(0.8)'; hm.style.opacity='0';});}}}
        else{spawnTracer(muzzPos,muzzPos.clone().add(_hitRay.ray.direction.clone().multiplyScalar(100)));}
        if(S.muzzleLight){S.muzzleLight.intensity=4; const fw=_v1.set(0,0,-1).applyQuaternion(worldCamera.quaternion); S.muzzleLight.position.copy(worldCamera.position).add(fw);}
        if(S.ammo===0&&S.reserve>0) triggerReload();
      }else if(time-S.lastFire>0.3){S.lastFire=time; S.fireCount=0; playClick();}
    }
  }else{S.fireCount=THREE.MathUtils.lerp(S.fireCount||0,0,dt*5);}

  // === Locomotion ===
  // We keep idle/walk/run *all* playing at weight 0 (set up in loadWeapon) and
  // cross-fade their weights here. None of them ever gets stop()'d mid-loop,
  // so the playhead never resets - that's what fixes the "hard cut" when fire
  // ends. While an overlay (fire/reload/inspect) is active, we also fade the
  // whole locomotion layer to 0 so the overlay reads cleanly instead of being
  // *added on top* of walk (the "two ghosts" bug).
  if (S.weaponMixer && (S.weaponActions.idle || S.weaponActions.walk || S.weaponActions.run)) {
    const spd2D = Math.hypot(S.vel.x, S.vel.z);

    // Smooth the speed used for animation. Rapier's character controller produces
    // small per-frame velocity wobble on slopes / autostep (sub-frame collision
    // corrections), and feeding that raw into clip.timeScale makes the *playback
    // speed itself* jitter every frame -> the gun appears to vibrate while running.
    // 8/sec exponential smoothing kills the wobble without adding noticeable lag.
    S.locoSpeed += (spd2D - S.locoSpeed) * Math.min(1, dt * 8);
    const animSpeed = S.locoSpeed;

    // Pick the locomotion clip we *want* to be visible right now.
    // Use the smoothed speed (not raw spd2D, not isSprinting) with a hysteresis
    // band so we don't flap walk<->run when the controller briefly reports
    // ungrounded on a step (which would clear isSprinting for one frame).
    const runIn  = CFG.playerSpeed * 1.05;  // need to exceed walk-cap by 5% to start running
    const runOut = CFG.playerSpeed * 0.95;  // and drop below 95% to fall back to walk
    const wasRun = S.locoTarget === S.weaponActions.run;
    let target = S.weaponActions.idle || null;
    if (animSpeed > 0.5) {
      const wantRun = wasRun ? animSpeed > runOut : animSpeed > runIn;
      target = (wantRun && S.weaponActions.run)
        ? S.weaponActions.run
        : (S.weaponActions.walk || S.weaponActions.idle);
    }
    if (target) S.locoTarget = target;
    if (S.locoTarget) S.currentAnim = S.locoTarget;

    // Drive the *layer* weight: full when nothing is overlaying, 0 when an overlay plays.
    const overlayActive = S.isFiring || S.isReloading || S.isInspecting;
    const layerTarget = overlayActive ? 0 : 1;
    // 12/sec feels snappy without popping
    S.locoWeight += (layerTarget - S.locoWeight) * Math.min(1, dt * 12);

    // Cross-fade individual locomotion clips toward locoTarget at speed 8/sec.
    const k = Math.min(1, dt * 8);
    ['idle', 'walk', 'run'].forEach(name => {
      const a = S.weaponActions[name];
      if (!a) return;
      const want = (a === S.locoTarget) ? S.locoWeight : 0;
      const cur = a.getEffectiveWeight();
      a.setEffectiveWeight(cur + (want - cur) * k);
    });

    // Match clip speed to player speed (only if locomotion layer is at all visible).
    // Uses the smoothed animSpeed so playback rate is stable instead of jittering
    // every frame with raw velocity wobble.
    if (S.locoTarget === S.weaponActions.walk || S.locoTarget === S.weaponActions.run) {
      const base = S.locoTarget === S.weaponActions.run
        ? CFG.playerSpeed * CFG.sprintMult
        : CFG.playerSpeed;
      const desired = THREE.MathUtils.clamp(animSpeed / base, 0.5, 2);
      // Extra smoothing on timeScale itself - even with smoothed speed we don't
      // want abrupt rate changes when crossing thresholds.
      const cur = S.locoTarget.timeScale;
      S.locoTarget.timeScale = cur + (desired - cur) * Math.min(1, dt * 6);
    }
  }

  // Muzzle decay
  muzzleFlash.intensity=Math.max(0,muzzleFlash.intensity-dt*100);
  flashMeshes.forEach(m=>{m.material.opacity=Math.max(0,m.material.opacity-dt*45); m.scale.multiplyScalar(1+dt*10);});
  if(S.muzzleLight) S.muzzleLight.intensity=Math.max(0,S.muzzleLight.intensity-dt*1500);
  S.screenFlash=Math.max(0,S.screenFlash-dt*10);

  // Weapon pose
  const adsT=springs.ads.val, adsFac=1-adsT;
  _tPos.lerpVectors(CFG.gunHipPos,CFG.gunAdsPos,adsT);
  const rX=THREE.MathUtils.lerp(CFG.gunHipRot.x,CFG.gunAdsRot.x,adsT);
  const rY=THREE.MathUtils.lerp(CFG.gunHipRot.y,CFG.gunAdsRot.y,adsT);
  const rZ=THREE.MathUtils.lerp(CFG.gunHipRot.z,CFG.gunAdsRot.z,adsT);
  const spd2D=Math.hypot(S.vel.x,S.vel.z), bs=adsFac*0.6+0.1;
  let bX=0,bY=0,bRX=0,bRZ=0;
  // Only apply procedural bob when we don't have a baked walk/run animation.
  // Use S.walkAmt (smoothly faded) instead of raw speed so the gun doesn't
  // pop in/out on the first/last frame of motion. All axes share the same
  // base frequency (S.walkPhase) for a natural figure-8 sway - no axis runs
  // at a doubled rate, which is what was reading as "vibration".
  if (!(S.weaponActions.walk || S.weaponActions.run)) {
    const w = S.walkAmt * bs;
    bX  = Math.cos(S.walkPhase)     * 0.012 * w;
    bY  = Math.sin(S.walkPhase * 2) * 0.010 * w;   // one bump per step
    bRZ = Math.cos(S.walkPhase)     * 0.018 * w;
    bRX = Math.sin(S.walkPhase * 2) * 0.010 * w;   // matches vertical bump
  }

  weaponPivot.position.set(_tPos.x+bX+S.swayX+springs.side.val*0.05+springs.rPosX.val, _tPos.y+bY+S.swayY+springs.rise.val*0.02+springs.rPosY.val, _tPos.z+springs.kick.val+springs.rPosZ.val);
  weaponPivot.rotation.set(rX+springs.rise.val+bRX-S.swayY*1.2+springs.rRotX.val, rY+springs.side.val*0.8+S.swayX*1.2+springs.rRotY.val, rZ+springs.twist.val+bRZ-S.swayX*0.4+springs.rRotZ.val);
  worldCamera.fov=(S.isAds?CFG.fovAds:CFG.fovHip)+springs.fov.val; worldCamera.updateProjectionMatrix();
}

/* === HUD === */
let _lastAmmo=-1,_lastRes=-1,_lastKills=-1,_lastAds=null;
function updateHUD() {
  if(S.ammo!==_lastAmmo){document.getElementById('ammo-current').innerText=S.ammo; _lastAmmo=S.ammo;}
  if(S.reserve!==_lastRes){document.getElementById('ammo-max').innerText='/ '+S.reserve; _lastRes=S.reserve;}
  if(S.kills!==_lastKills){document.getElementById('kill-count').innerText=S.kills; _lastKills=S.kills;}
  if(S.isAds!==_lastAds){document.getElementById('btn-ads').style.background=S.isAds?'rgba(0,200,255,0.4)':''; document.getElementById('crosshair').style.opacity=S.isAds?'0':'1'; document.getElementById('vignette').style.opacity=S.isAds?'0.9':'0.55'; _lastAds=S.isAds;}
  document.getElementById('flash-overlay').style.opacity=S.screenFlash;
  document.getElementById('bearing-strip').style.transform=`translateX(-50%) translateX(${S.yaw*300}px)`;
  const st=document.getElementById('status-indicator');
  if(S.isReloading){st.innerText='RELOADING...'; st.style.opacity='1';}else if(S.ammo===0&&S.reserve>0){st.innerText='PRESS R TO RELOAD'; st.style.opacity='1';}else if(S.ammo===0&&S.reserve===0){st.innerText='OUT OF AMMO'; st.style.opacity='1';}else{st.style.opacity='0';}
}

/* === GAME LOOP === */
const clock=new THREE.Clock();
let _frameCount = 0;
function gameLoop() {
  requestAnimationFrame(gameLoop);
  const dt=Math.min(clock.getDelta(),0.05), time=clock.getElapsedTime();
  if(S.running){
    updatePlayer(dt);
    updateWeapon(dt,time);
    // Only update effects every other frame on heavy scenes
    _frameCount++;
    if(!hasCustomMap || (_frameCount & 1) === 0) {
      updateEffects(dt * (hasCustomMap ? 2 : 1));
    }
    updateHUD();
  }
  renderer.clear(); renderer.render(worldScene,worldCamera); renderer.clearDepth(); renderer.render(uiScene,uiCamera);
}

/* === CALIBRATOR === */
function setupCalibrator(meta) {
  if(!meta.isCustom) return;
  document.getElementById('btn-calibrator').hidden=false;
  const ids=['s','x','y','z','rx','ry','rz'];
  const apply=()=>{if(!S.weaponWrapper) return; const c={s:+document.getElementById('cal-s').value,x:+document.getElementById('cal-x').value,y:+document.getElementById('cal-y').value,z:+document.getElementById('cal-z').value,rx:+document.getElementById('cal-rx').value,ry:+document.getElementById('cal-ry').value,rz:+document.getElementById('cal-rz').value}; S.weaponWrapper.scale.setScalar(c.s); S.weaponWrapper.position.set(c.x,c.y,c.z); S.weaponWrapper.rotation.set(THREE.MathUtils.degToRad(c.rx),THREE.MathUtils.degToRad(c.ry),THREE.MathUtils.degToRad(c.rz)); localStorage.setItem('weaponCal',JSON.stringify(c)); ids.forEach(id=>{const v=+document.getElementById('cal-'+id).value; document.getElementById('cal-'+id+'-val').innerText=id.startsWith('r')?Math.round(v):v.toFixed(2);});};
  ids.forEach(id=>document.getElementById('cal-'+id).addEventListener('input',apply));
  // Sync sliders
  if(S.weaponWrapper){const w=S.weaponWrapper; document.getElementById('cal-s').value=w.scale.x; document.getElementById('cal-x').value=w.position.x; document.getElementById('cal-y').value=w.position.y; document.getElementById('cal-z').value=w.position.z; document.getElementById('cal-rx').value=THREE.MathUtils.radToDeg(w.rotation.x); document.getElementById('cal-ry').value=THREE.MathUtils.radToDeg(w.rotation.y); document.getElementById('cal-rz').value=THREE.MathUtils.radToDeg(w.rotation.z); apply();}
  const toggle=e=>{e.preventDefault(); e.stopPropagation(); document.getElementById('calibrator-ui').hidden=!document.getElementById('calibrator-ui').hidden;};
  document.getElementById('btn-calibrator').addEventListener('click',toggle);
  document.getElementById('btn-calibrator').addEventListener('touchstart',toggle,{passive:false});
  document.getElementById('btn-close-cal').addEventListener('click',toggle);
  document.getElementById('btn-close-cal').addEventListener('touchstart',toggle,{passive:false});
  document.getElementById('btn-reset-cal').addEventListener('click',()=>{if(!S.defaultWeaponTransform) return; const p=S.defaultWeaponTransform; document.getElementById('cal-s').value=p.s; document.getElementById('cal-x').value=p.x; document.getElementById('cal-y').value=p.y; document.getElementById('cal-z').value=p.z; document.getElementById('cal-rx').value=p.rx; document.getElementById('cal-ry').value=p.ry; document.getElementById('cal-rz').value=p.rz; apply();});
  // Populate inspectors
  const al=document.getElementById('anim-list'); al.innerHTML=meta.animationNames.length?meta.animationNames.map(n=>`<div style="border-bottom:1px solid #333;padding:2px 0">${n}</div>`).join(''):'<div style="color:#888;text-align:center">No animations</div>';
  document.getElementById('btn-copy-anims').addEventListener('click',()=>navigator.clipboard.writeText(meta.animationNames.join('\n')));
  const ml=document.getElementById('mesh-list'); ml.innerHTML=meta.meshes.length?meta.meshes.map(m=>`<div style="border-bottom:1px solid #333;padding:2px 0;cursor:pointer" data-name="${m.name||'unnamed'}">${m.name||'unnamed'}</div>`).join(''):'<div style="color:#888;text-align:center">No meshes</div>';
}

/* === PHYSICS CALIBRATOR ===
 * Live in-game tuning panel for the Rapier character controller.
 * Same UX as the weapon calibrator: drag a slider, see the change instantly,
 * settings persist in localStorage('physCal').
 *
 * Sliders -> PHYS fields -> applyControllerSettings() / rebuildPlayerBody()
 */
function setupPhysicsCalibrator() {
  const btn = document.getElementById('btn-phys-cal');
  const ui = document.getElementById('physics-ui');
  if (!btn || !ui) return;
  btn.hidden = false;

  // Slider id -> PHYS field name. Keep in sync with index.html.
  const SLIDERS = [
    { id: 'phys-radius',   field: 'bodyRadius',          rebuild: true,  fmt: v => v.toFixed(2) },
    { id: 'phys-height',   field: 'bodyHeight',          rebuild: true,  fmt: v => v.toFixed(2) },
    { id: 'phys-step',     field: 'AUTOSTEP_HEIGHT',     ctlOnly: true,  fmt: v => v.toFixed(2) },
    { id: 'phys-stepw',    field: 'AUTOSTEP_MIN_WIDTH',  ctlOnly: true,  fmt: v => v.toFixed(2) },
    { id: 'phys-snap',     field: 'SNAP_DIST',           ctlOnly: true,  fmt: v => v.toFixed(2) },
    { id: 'phys-skin',     field: 'CHAR_OFFSET',         ctlOnly: true,  fmt: v => v.toFixed(3) },
    { id: 'phys-climb',    field: 'MAX_SLOPE_CLIMB_DEG', ctlOnly: true,  fmt: v => Math.round(v) + '°' },
    { id: 'phys-slide',    field: 'MIN_SLOPE_SLIDE_DEG', ctlOnly: true,  fmt: v => Math.round(v) + '°' }
  ];

  // Defaults to restore on RESET
  const DEFAULTS = {
    bodyRadius: 0.18, bodyHeight: 2.2,
    AUTOSTEP_HEIGHT: 1.0, AUTOSTEP_MIN_WIDTH: 0.05,
    SNAP_DIST: 0.5, CHAR_OFFSET: 0.02,
    MAX_SLOPE_CLIMB_DEG: 50, MIN_SLOPE_SLIDE_DEG: 65
  };

  function syncSliderToState() {
    SLIDERS.forEach(s => {
      const el = document.getElementById(s.id);
      const lab = document.getElementById(s.id + '-val');
      if (!el) return;
      el.value = PHYS[s.field];
      if (lab) lab.innerText = s.fmt(+el.value);
    });
  }

  function persist() {
    const out = {};
    for (const k of Object.keys(DEFAULTS)) out[k] = PHYS[k];
    try { localStorage.setItem('physCal', JSON.stringify(out)); } catch(e){}
  }

  function applySlider(s) {
    const el = document.getElementById(s.id);
    if (!el) return;
    const v = +el.value;
    PHYS[s.field] = v;
    const lab = document.getElementById(s.id + '-val');
    if (lab) lab.innerText = s.fmt(v);
    if (s.rebuild) {
      // shape change - need a fresh collider
      rebuildPlayerBody();
    } else if (s.ctlOnly) {
      // controller setting - rebuild the controller (cheap)
      applyControllerSettings();
    }
    persist();
  }

  SLIDERS.forEach(s => {
    const el = document.getElementById(s.id);
    if (el) el.addEventListener('input', () => applySlider(s));
  });

  syncSliderToState();

  const toggle = e => { e.preventDefault(); e.stopPropagation(); ui.hidden = !ui.hidden; };
  btn.addEventListener('click', toggle);
  btn.addEventListener('touchstart', toggle, { passive: false });
  const closeBtn = document.getElementById('btn-close-phys');
  if (closeBtn) {
    closeBtn.addEventListener('click', toggle);
    closeBtn.addEventListener('touchstart', toggle, { passive: false });
  }
  const resetBtn = document.getElementById('btn-reset-phys');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      Object.assign(PHYS, DEFAULTS);
      syncSliderToState();
      applyControllerSettings();
      rebuildPlayerBody();
      persist();
    });
  }
}

/* === BOOTSTRAP === */
async function init() {
  buildTextures();

  // Initialize physics engine (Rapier WASM) before anything that builds colliders
  try {
    await initPhysics();
  } catch(e) {
    showError('Physics init failed: ' + e.message);
    console.error(e);
  }

  // Check if user has a custom map BEFORE building lights (affects muzzle light decision)
  const [weaponBlob,mapBlob]=await Promise.all([loadBlob('weapon'),loadBlob('map')]);
  if(mapBlob) hasCustomMap = true;

  buildLights(); buildWeaponScene();

  // Setup env map for weapon UI only (not world scene - too expensive with custom GLBs)
  if (!isMobile) {
    try {
      const { RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js');
      const pmrem=new THREE.PMREMGenerator(renderer);
      const envTex=pmrem.fromScene(new RoomEnvironment(),0.04).texture;
      uiScene.environment=envTex; pmrem.dispose();
    } catch(e) { console.warn('PMREM setup skipped', e); }
  }

  // Bearing strip
  const labels=['N','.','.',  'NE','.','.', 'E','.','.', 'SE','.','.', 'S','.','.', 'SW','.','.', 'W','.','.', 'NW','.','.', 'N'];
  document.getElementById('bearing-strip').innerHTML=labels.map(l=>l==='.'?'<span class="deg">.</span>':`<span>${l}</span>`).join('');

  if(weaponBlob) document.getElementById('btn-clear-weapon').hidden=false;
  if(mapBlob) document.getElementById('btn-clear-map').hidden=false;

  try{
    if(mapBlob) await loadCustomMap(URL.createObjectURL(mapBlob)); else buildDefaultMap();
  }catch(e){showError('Map failed: '+e.message); buildDefaultMap();}

  // Player physics body (must exist after the map collider so the first step has something to land on)
  createPlayerBody();
  // Physics calibrator panel (always available - works on default and custom maps)
  setupPhysicsCalibrator();

  let weaponMeta;
  try{
    weaponMeta=await loadWeapon(weaponBlob?URL.createObjectURL(weaponBlob):null, !!weaponBlob);
  }catch(e){showError('Weapon failed: '+e.message); weaponMeta=await loadWeapon(null,false);}

  setupCalibrator(weaponMeta);
  // Pre-warm pools
  for(let i=0;i<30;i++){const m=new THREE.Mesh(GEO.impact,new THREE.MeshBasicMaterial({color:0xffaa44,transparent:true,opacity:0})); m.visible=false; worldScene.add(m); POOL.impacts.push(m);}

  document.getElementById('loading-text').hidden=true;
  document.getElementById('btn-start').hidden=false;
  gameLoop();
}

function showError(msg){const el=document.getElementById('error-toast'); el.hidden=false; el.innerText=msg; console.error(msg);}

// Upload handlers
document.getElementById('weapon-upload').addEventListener('change',async e=>{const f=e.target.files[0]; if(!f) return; await saveBlob('weapon',f); location.reload();});
document.getElementById('map-upload').addEventListener('change',async e=>{const f=e.target.files[0]; if(!f) return; await saveBlob('map',f); location.reload();});
document.getElementById('sky-upload').addEventListener('change',e=>{const f=e.target.files[0]; if(!f) return; const r=new FileReader(); r.onload=ev=>{const img=new Image(); img.onload=()=>{const t=new THREE.Texture(img); t.needsUpdate=true; t.mapping=THREE.EquirectangularReflectionMapping; t.colorSpace=THREE.SRGBColorSpace; worldScene.background=t;}; img.src=ev.target.result;}; r.readAsDataURL(f);});
document.getElementById('btn-clear-weapon').addEventListener('click',async()=>{await deleteBlob('weapon'); localStorage.removeItem('weaponCal'); location.reload();});
document.getElementById('btn-clear-map').addEventListener('click',async()=>{await deleteBlob('map'); location.reload();});

// Start button
document.getElementById('btn-start').addEventListener('click',async()=>{
  try{const e=document.documentElement; if(e.requestFullscreen) await e.requestFullscreen(); else if(e.webkitRequestFullscreen) await e.webkitRequestFullscreen(); if(screen.orientation&&screen.orientation.lock) await screen.orientation.lock('landscape').catch(()=>{});}catch(ex){}
  document.getElementById('start-screen').hidden=true; document.getElementById('hud').hidden=false;
  resumeAudio(); S.running=true;
  const isFS=document.fullscreenElement||document.webkitFullscreenElement; document.getElementById('btn-fullscreen').hidden=!!isFS;
});
document.getElementById('btn-fullscreen').addEventListener('click',async()=>{try{const e=document.documentElement; if(e.requestFullscreen) await e.requestFullscreen();}catch(ex){}});
document.addEventListener('fullscreenchange',()=>{const isFS=document.fullscreenElement||document.webkitFullscreenElement; document.getElementById('btn-fullscreen').hidden=!!isFS;});

init();
