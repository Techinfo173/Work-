import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CFG, isMobile } from './config.js';
import { buildTextures } from './world/textures.js';
import { World } from './world/world.js';
import { Effects } from './world/Effects.js';
import { Player } from './player/Player.js';
import { Weapon } from './weapon/Weapon.js';
import { InputManager } from './input/InputManager.js';
import { HUD } from './ui/HUD.js';
import { Calibrator } from './ui/Calibrator.js';
import { resumeAudio } from './audio/sfx.js';

const _crosshairRay = new THREE.Raycaster();
_crosshairRay.firstHitOnly = true;
const _v = new THREE.Vector3();

/**
 * Top-level orchestration. Holds the renderer, world camera, UI camera,
 * and runs the main loop.
 */
export class Game {
  constructor() {
    this.renderer = this._buildRenderer();
    this.worldCamera = new THREE.PerspectiveCamera(CFG.fovHip, window.innerWidth / window.innerHeight, 0.1, 5000);
    this.uiCamera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.01, 100);
    this.uiScene = new THREE.Scene();

    buildTextures();

    this.world = new World();
    this.effects = new Effects(this.world.scene);
    this.weapon = new Weapon(this.uiScene);
    this.player = new Player(this.worldCamera);
    this.input = new InputManager();
    this.hud = new HUD();
    this.calibrator = new Calibrator(this.weapon);

    this.kills = 0;
    this.running = false;
    this.screenFlash = 0;

    // Environment map
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.world.scene.environment = envMap;
    this.uiScene.environment = envMap;
    pmrem.dispose();

    this._wireEvents();
    this._wireResize();
  }

  _buildRenderer() {
    const r = new THREE.WebGLRenderer({
      antialias: !isMobile,
      powerPreference: 'high-performance',
      precision: 'mediump',
    });
    r.setPixelRatio(isMobile ? Math.min(window.devicePixelRatio, 1.0) : Math.min(window.devicePixelRatio, 1.5));
    r.setSize(window.innerWidth, window.innerHeight);
    r.shadowMap.enabled = true;
    r.shadowMap.type = isMobile ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.1;
    r.autoClear = false;
    document.body.appendChild(r.domElement);
    return r;
  }

  _wireResize() {
    const onResize = () => {
      const w = window.innerWidth, h = window.innerHeight;
      this.renderer.setSize(w, h);
      this.worldCamera.aspect = w / h; this.worldCamera.updateProjectionMatrix();
      this.uiCamera.aspect = w / h; this.uiCamera.updateProjectionMatrix();
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', () => setTimeout(onResize, 200));
    document.addEventListener('fullscreenchange', () => setTimeout(onResize, 100));
  }

  _wireEvents() {
    this.input.on('look', (dx, dy, isTouch) => {
      this.player.applyLook(dx, dy);
    });

    this.input.on('action', (name) => {
      if (!this.running) return;
      switch (name) {
        case 'fire-start':
          if (this.weapon.isInspecting) this.weapon.cancelInspect();
          this.weapon.isFiring = true;
          break;
        case 'fire-end':
          this.weapon.isFiring = false;
          break;
        case 'ads-toggle':
          this.weapon.toggleAds();
          break;
        case 'reload':
          this.weapon.triggerReload();
          break;
        case 'inspect':
          this.weapon.triggerInspect();
          break;
        case 'jump':
          this.player.jump();
          break;
      }
    });

    // Pointer lock on canvas click (desktop)
    this.renderer.domElement.addEventListener('click', () => {
      if (this.running && !document.pointerLockElement) {
        this.renderer.domElement.requestPointerLock();
      }
    });
  }

  /**
   * Load assets and prepare to play.
   * @param {Object} opts { weaponUrl, mapUrl, skyUrl }
   */
  async init(opts = {}) {
    if (opts.skyUrl) {
      try { await this.world.loadSky(opts.skyUrl); }
      catch (e) { console.warn('Sky failed to load:', e); }
    }

    // Map
    if (opts.mapUrl) {
      try {
        await this.world.loadCustomMap(opts.mapUrl);
      } catch (e) {
        console.error('Custom map failed; using default.', e);
        throw new Error(`Map failed to load: ${e.message || e}`);
      }
    } else {
      this.world.buildDefaultMap();
    }

    // Weapon
    let weaponMeta;
    if (opts.weaponUrl) {
      try {
        weaponMeta = await this.weapon.load(opts.weaponUrl, true);
      } catch (e) {
        console.error('Custom weapon failed; using procedural placeholder.', e);
        weaponMeta = await this.weapon.load(null, false);
        throw new Error(`Weapon failed to load: ${e.message || e}`);
      }
    } else {
      weaponMeta = await this.weapon.load(null, false);
    }
    this.calibrator.showFor(weaponMeta);
  }

  start() {
    this.running = true;
    resumeAudio();
    this._loop = this._loop.bind(this);
    this._lastTime = performance.now();
    this._clock = new THREE.Clock();
    requestAnimationFrame(this._loop);
  }

  _loop(now) {
    requestAnimationFrame(this._loop);
    const dt = Math.min(this._clock.getDelta(), 0.05);
    const time = this._clock.getElapsedTime();

    if (!this.running) {
      this._render();
      return;
    }

    // Input -> player flags
    this.input.pollKeyboard();
    this.player._wantSprint = this.input.wantSprint;
    this.player.isFiring = this.weapon.isFiring;
    this.player.isAds = this.weapon.isAds;
    this.player.isReloading = this.weapon.isReloading;

    // Player update
    this.player.update({ moveX: this.input.moveX, moveY: this.input.moveY }, this.world, dt);

    // Fire logic (every frame while held)
    if (this.weapon.isFiring && !this.weapon.isInspecting) {
      const result = this.weapon.tryFire(time);
      if (result.fired) {
        this.effects.spawnShell(this.worldCamera, this.player.velocity);
        this._performHitscan();
        this.screenFlash = 0.4;
        // Recoil climb on view
        const accum = 1.0 + Math.min(1.0, (this.weapon.fireCount - 1) * 0.1);
        const recoilFac = this.weapon.isAds ? 0.3 : 1.0;
        this.player.pitch += (Math.random() * 0.015 + 0.01) * recoilFac * accum;
        this.player.yaw += (Math.random() - 0.5) * 0.015 * recoilFac * accum;
        this.player.shake.addImpulse(2.0 * recoilFac);

        // Auto-reload on empty
        if (this.weapon.ammo === 0 && this.weapon.reserve > 0) {
          this.weapon.triggerReload();
        }
      } else if (result.dryFire) {
        if (this.weapon.reserve > 0) this.hud.setStatus('PRESS R TO RELOAD', 600);
        else this.hud.setStatus('OUT OF AMMO', 600);
      }
    }

    // Weapon spring + animation update
    this.weapon.update(dt, this.player);

    // Apply weapon pose
    const fov = this.weapon.applyPose(this.player);
    this.worldCamera.fov = fov;
    this.worldCamera.updateProjectionMatrix();

    // World updates
    this.world.updateTargets(dt);
    this.effects.update(dt);

    // Muzzle light in world
    if (this.world.muzzleLight) {
      const next = Math.max(0, this.world.muzzleLight.intensity - dt * 1500);
      this.world.muzzleLight.intensity = next;
    }

    // HUD
    this._updateHUD(dt);

    this._render();
  }

  _performHitscan() {
    _crosshairRay.setFromCamera({ x: 0, y: 0 }, this.worldCamera);
    const hits = _crosshairRay.intersectObjects(this.world.raycastTargets, true);

    const muzzlePos = this.worldCamera.position.clone()
      .add(_v.set(0, -0.05, -0.5).applyQuaternion(this.worldCamera.quaternion));

    if (hits.length > 0) {
      const hit = hits[0];
      this.effects.spawnImpact(hit.point, hit.face.normal, this.weapon.isAds);
      this.effects.spawnTracer(muzzlePos, hit.point);

      const tgt = this.world.hitTargetAt(hit.point);
      if (tgt) {
        tgt.isDown = true;
        tgt.resetTimer = 3.0;
        this.kills++;
        this.hud.showHitMarker();
      }

      // Boost world muzzle light
      if (this.world.muzzleLight) {
        this.world.muzzleLight.intensity = 4;
        const fwd = _v.set(0, 0, -1).applyQuaternion(this.worldCamera.quaternion);
        this.world.muzzleLight.position.copy(this.worldCamera.position).add(fwd.multiplyScalar(1.0));
      }
    } else {
      const end = muzzlePos.clone().add(_crosshairRay.ray.direction.clone().multiplyScalar(100));
      this.effects.spawnTracer(muzzlePos, end);
    }
  }

  _updateHUD(dt) {
    this.hud.setAmmo(this.weapon.ammo, this.weapon.reserve);
    this.hud.setKills(this.kills);
    this.hud.setAds(this.weapon.isAds);

    // Crosshair scaling
    const speed = Math.hypot(this.player.velocity.x, this.player.velocity.z);
    const base = this.weapon.isAds ? 0.2 : 1.0;
    const scale = base + speed * 0.15 + this.player.shake.val * 0.2;
    this.hud.pulseCrosshair(scale);

    // Bearing
    this.hud.setBearing(this.player.yaw);

    // Reload status
    if (this.weapon.isReloading) this.hud.setStatus('RELOADING...');
    else if (this.weapon.ammo === 0 && this.weapon.reserve > 0) this.hud.setStatus('PRESS R TO RELOAD');
    else if (this.weapon.ammo === 0 && this.weapon.reserve === 0) this.hud.setStatus('OUT OF AMMO');
    else this.hud.hideStatus();

    // Screen flash decay
    this.screenFlash = Math.max(0, this.screenFlash - dt * 10);
    this.hud.setFlash(this.screenFlash);
  }

  _render() {
    this.renderer.clear();
    this.renderer.render(this.world.scene, this.worldCamera);
    this.renderer.clearDepth();
    this.renderer.render(this.uiScene, this.uiCamera);
  }
}
