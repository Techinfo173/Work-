okkk urrrrm the loading screen finishes but i get a blank screen because the catbox URLs probably fail to download and the game starts with no weapon or map. fix this in src/App.tsx, dont touch other files. add these 4 things exactly as written.

==============================================
1) at the very top of the bootstrap function find this line:

   try { await document.documentElement.requestFullscreen(); } catch {}

DELETE it entirely. it doesnt work without a user gesture and just wastes time.

==============================================
2) the catbox fetch can hang forever. find the loop that uses Promise.allSettled with the urls. inside the async function find this line:

   const res = await fetch(url);

REPLACE it with this timeout-protected version:

```ts
const ctrl = new AbortController();
const _to = setTimeout(() => ctrl.abort(), 10000);
let res: Response;
try {
  res = await fetch(url, { signal: ctrl.signal });
} finally {
  clearTimeout(_to);
}
```

==============================================
3) at the END of bootstrap, find these last 2 lines:

   report(100, 'Starting game...');
   startGame();

REPLACE both with this block that shows a fallback upload screen if assets failed to download:

```ts
if (!ctx.weaponModel || !ctx.mapModel) {
  // assets failed to download, show a fallback upload screen
  const fb = document.createElement('div');
  fb.className = 'start-screen';
  fb.style.zIndex = '9998';
  fb.innerHTML = `
    <div class="grid-bg"></div>
    <div class="title">VOID ENGINE</div>
    <div class="subtitle">ASSETS NOT LOADED</div>
    <div style="display:flex;gap:0.8rem;flex-direction:column;align-items:center;z-index:1;max-width:90vw">
      <p style="color:rgba(224,224,224,0.7);font-family:var(--font-mono);font-size:0.65rem;letter-spacing:0.1em;text-align:center;max-width:400px;line-height:1.6;margin-bottom:0.5rem">
        could not download default assets. upload your own glb files below or tap retry.
      </p>
      <label class="fb-btn" style="background:var(--accent);color:#000;padding:0.7rem 1.5rem;font-family:var(--font-display);font-size:1.1rem;letter-spacing:0.2em;cursor:pointer;display:block;text-align:center;min-width:280px">
        <span id="fb-weapon-label">UPLOAD WEAPON .GLB</span>
        <input type="file" accept=".glb,.gltf" id="fb-weapon" style="display:none">
      </label>
      <label class="fb-btn" style="background:var(--accent);color:#000;padding:0.7rem 1.5rem;font-family:var(--font-display);font-size:1.1rem;letter-spacing:0.2em;cursor:pointer;display:block;text-align:center;min-width:280px">
        <span id="fb-map-label">UPLOAD MAP .GLB</span>
        <input type="file" accept=".glb,.gltf" id="fb-map" style="display:none">
      </label>
      <label class="fb-btn" style="background:transparent;border:1px solid var(--accent);color:var(--accent);padding:0.7rem 1.5rem;font-family:var(--font-display);font-size:1rem;letter-spacing:0.2em;cursor:pointer;display:block;text-align:center;min-width:280px">
        <span id="fb-enemy-label">UPLOAD ENEMY .GLB (OPTIONAL)</span>
        <input type="file" accept=".glb,.gltf" id="fb-enemy" style="display:none">
      </label>
      <button id="fb-deploy" style="background:var(--accent);color:#000;border:none;font-family:var(--font-display);font-size:1.5rem;letter-spacing:0.25em;padding:0.8rem 3rem;cursor:pointer;margin-top:1.5rem;opacity:0.3" disabled>DEPLOY</button>
      <button id="fb-retry" style="background:transparent;border:1px solid var(--text-dim);color:var(--text-dim);font-family:var(--font-mono);font-size:0.65rem;letter-spacing:0.15em;padding:0.5rem 1.5rem;cursor:pointer;margin-top:0.5rem">RETRY DOWNLOAD</button>
    </div>
  `;
  container.appendChild(fb);

  const updateDeployBtn = () => {
    const btn = document.getElementById('fb-deploy') as HTMLButtonElement;
    if (!btn) return;
    const ok = !!(ctx.weaponModel && ctx.mapModel);
    btn.disabled = !ok;
    btn.style.opacity = ok ? '1' : '0.3';
  };

  const wInp = document.getElementById('fb-weapon') as HTMLInputElement;
  if (wInp) wInp.onchange = async () => {
    const f = wInp.files?.[0]; if (!f) return;
    await loadWeaponFile(f, f.name);
    const lbl = document.getElementById('fb-weapon-label');
    if (lbl) lbl.textContent = 'WEAPON LOADED';
    updateDeployBtn();
  };
  const mInp = document.getElementById('fb-map') as HTMLInputElement;
  if (mInp) mInp.onchange = async () => {
    const f = mInp.files?.[0]; if (!f) return;
    await loadMapFile(f, f.name);
    const lbl = document.getElementById('fb-map-label');
    if (lbl) lbl.textContent = 'MAP LOADED';
    updateDeployBtn();
  };
  const eInp = document.getElementById('fb-enemy') as HTMLInputElement;
  if (eInp) eInp.onchange = async () => {
    const f = eInp.files?.[0]; if (!f) return;
    await loadEnemyFile(f, f.name);
    const lbl = document.getElementById('fb-enemy-label');
    if (lbl) lbl.textContent = 'ENEMY LOADED';
  };

  const dBtn = document.getElementById('fb-deploy');
  if (dBtn) dBtn.onclick = () => {
    if (!ctx.weaponModel || !ctx.mapModel) return;
    fb.remove();
    startGame();
  };
  const rBtn = document.getElementById('fb-retry');
  if (rBtn) rBtn.onclick = () => location.reload();

  // hide the loading screen so the user can interact with the upload buttons
  onReady?.();
  return;
}

report(100, 'Starting game...');
startGame();
```

==============================================
4) the safety timeout in App component is too short and dismisses the loading screen even if no assets loaded. find this line in the App component (its right above `return () => { cleanup(); clearTimeout(timer); };`):

   const timer = setTimeout(ready, 30000);

REPLACE with:

   const timer = setTimeout(ready, 60000);

(longer timeout because the catbox downloads might be slow on bad connections, the fallback screen will handle the case where they actually failed)

==============================================
thats it. dont add or remove anything else. after that:

- if the catbox URLs work, the game starts normally with the default assets
- if they fail, you get an upload screen where you can drop your own glb files and tap deploy
- if you wanna retry the auto download just tap retry to reload the page

the blank screen problem was that the game was starting WITHOUT a weapon or map loaded so theres nothing to render. now it shows the fallback screen instead.
