okkk urrrrm the gun GLB has a Skybox mesh inside it that is now showing because we removed the skybox-removal code to fix textures. fix it by just HIDING the skybox mesh (not removing or disposing it). only edit src/App.tsx, dont touch other files.

==============================================
1) find loadWeaponFile. inside it find the colorSpace traversal block that looks like this:

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

right BEFORE that block ADD this skybox-hiding traversal:

```ts
ctx.weaponModel.traverse((c: any) => {
  if (!c.isMesh) return;
  const lower = (c.name || '').toLowerCase();
  if (lower.includes('skybox') || lower.includes('sky_dome') || lower.includes('panorama')) {
    c.visible = false;
    return;
  }
  // also hide anything insanely large since the gun should be tiny
  if (c.geometry) {
    const box = new THREE.Box3().setFromObject(c);
    const size = new THREE.Vector3(); box.getSize(size);
    if (Math.max(size.x, size.y, size.z) > 10) c.visible = false;
  }
});
```

==============================================
thats it. just hides the skybox, doesnt remove or dispose, so no textures get nuked. dont change anything else.
