okkk urrrrm gun looks untextured on mobile because the UI scene has no env map on mobile, so the metallic gun parts render pure black. the map works because optimizeMaterials strips env-map dependency, but the weapon doesnt get that treatment. fix in src/App.tsx, dont touch any other files. 3 small changes:

==============================================
1) find this block near the top of bootstrap:

```ts
let RoomEnvironment: any;
if (!isMobile) {
  try { const m = await import('https://esm.sh/three@0.160.0/examples/jsm/environments/RoomEnvironment.js'); RoomEnvironment = m.RoomEnvironment; } catch {}
}
```

REPLACE with this version that loads on mobile too. its a small file:

```ts
let RoomEnvironment: any;
try { const m = await import('https://esm.sh/three@0.160.0/examples/jsm/environments/RoomEnvironment.js'); RoomEnvironment = m.RoomEnvironment; } catch {}
```

==============================================
2) leave the existing `if (RoomEnvironment) { ... uiScene.environment = ... }` block alone. it already has no isMobile check, it just couldnt run before because RoomEnvironment was undefined on mobile. step 1 fixes that automatically.

leave the world env block alone too (`if (!isMobile && RoomEnvironment)`) the map doesnt need it.

==============================================
3) ADD mobile-specific texture optimization in loadWeaponFile so the weapon doesnt blow up GPU memory. find this block in loadWeaponFile:

```ts
ctx.weaponModel.traverse((c: any) => {
  if (!c.isMesh || !c.material) return;
  const mats = Array.isArray(c.material) ? c.material : [c.material];
  for (const m of mats) {
    if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
    if (m.emissiveMap) m.emissiveMap.colorSpace = THREE.SRGBColorSpace;
    m.needsUpdate = true;
  }
});
```

REPLACE with this version that adds mobile-friendly texture filtering and bumps envMapIntensity:

```ts
ctx.weaponModel.traverse((c: any) => {
  if (!c.isMesh || !c.material) return;
  const mats = Array.isArray(c.material) ? c.material : [c.material];
  for (const m of mats) {
    if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
    if (m.emissiveMap) m.emissiveMap.colorSpace = THREE.SRGBColorSpace;
    if (isMobile) {
      const tweakTex = (tex: any) => {
        if (!tex) return;
        tex.anisotropy = 1;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;
      };
      tweakTex(m.map);
      tweakTex(m.normalMap);
      tweakTex(m.roughnessMap);
      tweakTex(m.metalnessMap);
      tweakTex(m.aoMap);
      tweakTex(m.emissiveMap);
    }
    if (m.envMapIntensity !== undefined) m.envMapIntensity = 1.0;
    m.needsUpdate = true;
  }
});
```

==============================================
thats it. only edit src/App.tsx, leave everything else alone.

after this:
- mobile gets an env map for the UI/weapon scene so metallic parts arent black
- weapon textures use mobile-friendly filtering to reduce GPU load
- gun should look properly textured on phone

if it STILL looks untextured after this, then the GLB textures themselves arent loading at all (memory issue on the 97MB scorpion file). compress the weapon GLB to under 30MB with gltfpack or similar. but try this first since its much simpler.
