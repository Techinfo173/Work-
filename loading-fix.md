okkk urrrrm gonna fix the blank screen issue in src/App.tsx for the live game. dont touch any other files. 5 changes total:

==============================================
1) at the very top of the bootstrap function find this line and DELETE it entirely:

   try { await document.documentElement.requestFullscreen(); } catch {}

(it doesnt work without a user gesture and just slows boot)

==============================================
2) find the urls array in the auto-load section that has the catbox urls. REPLACE the whole array with this:

```ts
const urls: [string, string, string][] = [
  ['weapon', 'https://pub-f78ba872e9c64f64afec51da87f06546.r2.dev/cz_scorpion_evo3_a1__first_person_animations.glb', 'CZ Scorpion EVO 3 A1'],
  ['map', 'https://pub-f78ba872e9c64f64afec51da87f06546.r2.dev/fps_map.glb', 'Combat Zone'],
  ['enemy', 'https://pub-f78ba872e9c64f64afec51da87f06546.r2.dev/winter_soldier_-_armed_-_marvel_vs_capcom.glb', 'Winter Soldier'],
];
```

==============================================
3) inside the same auto-load section find the line:

   const res = await fetch(url);

REPLACE it with this version that has a 20s timeout per attempt and retries up to 2 times before giving up:

```ts
let res: Response | null = null;
let lastErr: any = null;
for (let attempt = 0; attempt < 3; attempt++) {
  const ctrl = new AbortController();
  const _to = setTimeout(() => ctrl.abort(), 20000);
  try {
    const tryRes = await fetch(url, { signal: ctrl.signal, cache: 'force-cache' });
    if (tryRes.ok) { res = tryRes; clearTimeout(_to); break; }
    lastErr = new Error('HTTP ' + tryRes.status);
  } catch (e) { lastErr = e; }
  clearTimeout(_to);
  if (attempt < 2) await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
}
if (!res) throw lastErr || new Error('Fetch failed');
```

==============================================
4) at the END of bootstrap find these final 2 lines:

   report(100, 'Starting game...');
   startGame();

REPLACE both with this block. it shows a clean retry screen for END USERS if assets fail. there is NO upload UI exposed to players. only a retry button:

```ts
if (!ctx.weaponModel || !ctx.mapModel) {
  const fb = document.createElement('div');
  fb.style.cssText = 'position:fixed;inset:0;z-index:9998;background:#0a0a0a;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1.5rem;padding:2rem;font-family:Rajdhani,sans-serif;color:#e0e0e0';
  fb.innerHTML = `
    <div style="font-family:'Bebas Neue',sans-serif;font-size:clamp(2.5rem,8vw,5rem);letter-spacing:0.2em;color:#ff8800;text-shadow:0 0 30px rgba(255,136,0,0.5)">VOID ENGINE</div>
    <div style="font-family:'Share Tech Mono',monospace;font-size:0.7rem;letter-spacing:0.3em;color:rgba(224,224,224,0.5);text-transform:uppercase">Connection Issue</div>
    <p style="color:rgba(224,224,224,0.7);font-size:0.95rem;text-align:center;max-width:420px;line-height:1.6;margin:0">
      We could not reach the game servers. Please check your connection and try again.
    </p>
    <button id="fb-retry" style="background:#ff8800;color:#000;border:none;font-family:'Bebas Neue',sans-serif;font-size:1.4rem;letter-spacing:0.25em;padding:0.9rem 3.5rem;cursor:pointer;margin-top:0.5rem;box-shadow:0 0 30px rgba(255,136,0,0.4)">RETRY</button>
  `;
  container.appendChild(fb);
  const rBtn = document.getElementById('fb-retry');
  if (rBtn) rBtn.onclick = () => location.reload();
  onReady?.();
  return;
}

report(100, 'Starting game...');
startGame();
```

==============================================
5) in the App component (the React component at the bottom of the file) find this line:

   const timer = setTimeout(ready, 30000);

REPLACE with:

   const timer = setTimeout(ready, 90000);

(longer timeout because the assets are big, the retry screen will show up if it actually times out)

==============================================
thats it. only edit src/App.tsx, leave everything else alone.
