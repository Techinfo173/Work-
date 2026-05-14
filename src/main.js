import { Game } from './Game.js';
import { saveBlob, loadBlob, deleteBlob } from './utils/storage.js';

const KEYS = { weapon: 'weapon', map: 'map' };

const el = {
  start: document.getElementById('start-screen'),
  loading: document.getElementById('loading-text'),
  btnStart: document.getElementById('btn-start'),
  hud: document.getElementById('hud'),
  fs: document.getElementById('btn-fullscreen'),
  weaponUpload: document.getElementById('weapon-upload'),
  mapUpload: document.getElementById('map-upload'),
  skyUpload: document.getElementById('sky-upload'),
  clearWeapon: document.getElementById('btn-clear-weapon'),
  clearMap: document.getElementById('btn-clear-map'),
  error: document.getElementById('error-toast'),
};

function showError(msg) {
  el.error.innerText = msg;
  el.error.hidden = false;
  console.error(msg);
}
function clearError() {
  el.error.hidden = true;
}

async function bootstrap() {
  el.loading.innerText = 'LOADING ASSETS...';

  // Pull cached blobs
  const [weaponBlob, mapBlob] = await Promise.all([
    loadBlob(KEYS.weapon),
    loadBlob(KEYS.map),
  ]);

  if (weaponBlob) el.clearWeapon.hidden = false;
  if (mapBlob) el.clearMap.hidden = false;

  const weaponUrl = weaponBlob ? URL.createObjectURL(weaponBlob) : null;
  const mapUrl = mapBlob ? URL.createObjectURL(mapBlob) : null;

  // Use a hosted default sky if we have one cached, otherwise a solid color
  // (skipped here; user can upload their own).

  const game = new Game();
  window.__game = game; // debug handle

  try {
    await game.init({ weaponUrl, mapUrl });
    if (weaponBlob) console.log('[Boot] Custom weapon loaded.');
    if (mapBlob) console.log('[Boot] Custom map loaded.');
  } catch (e) {
    showError(e.message || String(e));
  }

  el.loading.hidden = true;
  el.btnStart.hidden = false;

  el.btnStart.addEventListener('click', async () => {
    try { await requestFullscreenAndLandscape(); } catch {}
    el.start.hidden = true;
    el.hud.hidden = false;
    game.start();
    updateFullscreenBtn();
  });
}

async function requestFullscreenAndLandscape() {
  const e = document.documentElement;
  if (e.requestFullscreen) await e.requestFullscreen();
  else if (e.webkitRequestFullscreen) await e.webkitRequestFullscreen();
  if (screen.orientation && screen.orientation.lock) {
    try { await screen.orientation.lock('landscape'); } catch {}
  }
}

function updateFullscreenBtn() {
  const fs = document.fullscreenElement || document.webkitFullscreenElement;
  el.fs.hidden = !!fs;
}
el.fs.addEventListener('click', requestFullscreenAndLandscape);
document.addEventListener('fullscreenchange', updateFullscreenBtn);
document.addEventListener('webkitfullscreenchange', updateFullscreenBtn);

// Upload handlers ----------------------------------------------------------

el.weaponUpload.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  el.loading.hidden = false;
  el.loading.innerText = 'CACHING WEAPON...';
  el.btnStart.hidden = true;
  clearError();
  try {
    await saveBlob(KEYS.weapon, file);
    location.reload();
  } catch (err) {
    showError(`Failed to save weapon: ${err.message || err}`);
  }
});

el.mapUpload.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  el.loading.hidden = false;
  el.loading.innerText = 'CACHING MAP...';
  el.btnStart.hidden = true;
  clearError();
  try {
    await saveBlob(KEYS.map, file);
    location.reload();
  } catch (err) {
    showError(`Failed to save map: ${err.message || err}`);
  }
});

el.skyUpload.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  if (window.__game) {
    try {
      await window.__game.world.loadSky(url);
    } catch (err) {
      showError(`Failed to load sky: ${err.message || err}`);
    }
  }
});

el.clearWeapon.addEventListener('click', async () => {
  await deleteBlob(KEYS.weapon);
  localStorage.removeItem('weaponCal');
  location.reload();
});

el.clearMap.addEventListener('click', async () => {
  await deleteBlob(KEYS.map);
  location.reload();
});

bootstrap();
