okkk urrrrm two bugs at once. gun loads without textures and enemies are invisible. fix both in src/App.tsx, dont touch any other files.

==============================================
1) GUN UNTEXTURED — your disposeModel function nukes textures, and when it runs on the Skybox mesh inside the weapon GLB, any textures shared between the Skybox material and the gun materials get nuked too. fix is to NOT remove the Skybox mesh, just hide it.

find this part of loadWeaponFile:

```ts
const toRemove: any[] = [];
ctx.weaponModel.traverse((child: any) => {
  const isSkybox = child.name && child.name.toLowerCase().includes('skybox');
  let maxDim = 0;
  if (child.geometry) { const box = new THREE.Box3().setFromObject(child); const size = new THREE.Vector3(); box.getSize(size); maxDim = Math.max(size.x, size.y, size.z); }
  if (isSkybox || maxDim > 10) toRemove.push(child);
});
for (const obj of toRemove) { obj.removeFromParent(); disposeModel(obj); }
```

REPLACE with this version that just hides the skybox without disposing anything:

```ts
ctx.weaponModel.traverse((child: any) => {
  if (!child.isMesh) return;
  const isSkybox = child.name && child.name.toLowerCase().includes('skybox');
  let maxDim = 0;
  if (child.geometry) { const box = new THREE.Box3().setFromObject(child); const size = new THREE.Vector3(); box.getSize(size); maxDim = Math.max(size.x, size.y, size.z); }
  if (isSkybox || maxDim > 10) {
    child.visible = false;
    console.log('[VoidEngine] Hidden weapon mesh:', child.name, 'size:', maxDim);
  }
});
```

==============================================
2) MAKE disposeModel SAFER — never dispose textures, only materials and geometry. textures often get shared between materials in GLBs, disposing them breaks other meshes that share them.

find the disposeModel function and REPLACE it with:

```ts
function disposeModel(model: any) {
  model.traverse((c: any) => {
    if (c.geometry) { c.geometry.disposeBoundsTree?.(); c.geometry.dispose(); }
    if (c.material) {
      const mats = Array.isArray(c.material) ? c.material : [c.material];
      for (const m of mats) {
        if (m && typeof m.dispose === 'function') m.dispose();
      }
    }
  });
}
```

==============================================
3) ENEMIES INVISIBLE — find the spawnEnemies function. inside the for loop that creates each enemy find this line:

```ts
model.position.set(pos.x, pos.y, pos.z);
```

REPLACE with this version that uses the model's actual bounding box to position feet on the floor instead of guessing, plus debug logging:

```ts
model.updateMatrixWorld(true);
const tmpBox = new THREE.Box3().setFromObject(model);
const tmpSize = new THREE.Vector3(); tmpBox.getSize(tmpSize);
const feetOffsetY = tmpBox.min.y - model.position.y;
model.position.set(pos.x, pos.y - feetOffsetY, pos.z);
console.log('[VoidEngine] Enemy', i, 'spawned at', pos.x.toFixed(2), pos.y.toFixed(2), pos.z.toFixed(2), 'feetOffsetY:', feetOffsetY.toFixed(2), 'visualHeight:', tmpSize.y.toFixed(2));
```

==============================================
4) further down in the spawnEnemies for loop find this material cloning block:

```ts
model.traverse((c: any) => {
  if (c.isMesh) {
    c.frustumCulled = false;
    c.castShadow = false;
    c.receiveShadow = false;
    if (c.material) {
      const mats = Array.isArray(c.material) ? c.material : [c.material];
      const cloned = mats.map((m: any) => m.clone());
      c.material = Array.isArray(c.material) ? cloned : cloned[0];
    }
  }
});
```

REPLACE with this version that forces visibility, kills transparency, sets DoubleSide so back-face culling doesnt hide them, and counts visible meshes:

```ts
let meshCount = 0;
model.traverse((c: any) => {
  if (c.isMesh) {
    meshCount++;
    c.frustumCulled = false;
    c.castShadow = false;
    c.receiveShadow = false;
    c.visible = true;
    if (c.material) {
      const mats = Array.isArray(c.material) ? c.material : [c.material];
      const cloned = mats.map((m: any) => {
        const cm = m.clone();
        cm.transparent = false;
        cm.opacity = 1;
        cm.visible = true;
        cm.depthWrite = true;
        cm.depthTest = true;
        cm.side = THREE.DoubleSide;
        return cm;
      });
      c.material = Array.isArray(c.material) ? cloned : cloned[0];
    }
  }
});
console.log('[VoidEngine] Enemy', i, 'mesh count:', meshCount, 'scale:', ctx.enemyScale.toFixed(3));
```

==============================================
5) at the very END of spawnEnemies, right before `ctx.totalEnemies = ctx.enemies.length;` ADD this debug line:

```ts
console.log('[VoidEngine] Spawn complete. Total enemies:', ctx.enemies.length, 'navZone:', !!ctx.navZone, 'spawnPositions count:', spawnPositions.length);
```

==============================================
thats it. only edit src/App.tsx, leave everything else alone.

after deploying:

1. open https://callofwar.gitlawb.app/ in incognito so old indexedDB doesnt mess things up
2. on phone use chrome and tap the 3-dot menu, request desktop site, or use chrome devtools remote debugging if you have a laptop. or just play and tell me what you see
3. you should see logs in the console like:
   - `[VoidEngine] Hidden weapon mesh: Skybox size: 1234.5`
   - `[VoidEngine] Enemy 0 spawned at 5.00 0.00 -3.00 feetOffsetY: -0.85 visualHeight: 1.80`
   - `[VoidEngine] Enemy 0 mesh count: 8 scale: 1.222`
   - `[VoidEngine] Spawn complete. Total enemies: 4 navZone: true spawnPositions count: 4`

if total enemies is 0, no spawn positions were found (navmesh issue). if mesh count per enemy is 0, the SkeletonUtils clone failed. tell me which logs you see and ill know which to fix next.

if gun is still untextured after step 1+2, its not a texture-disposal issue, its probably color space or env map related and well need a different fix.
