import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CFG } from '../config.js';
import { Spring } from '../utils/Spring.js';
import { TEX } from '../world/textures.js';
import { prefs } from '../utils/storage.js';
import { playGunshot, playClick, playSlide } from '../audio/sfx.js';

const _tPos = new THREE.Vector3();

/**
 * Detect an animation clip on the GLTF whose name matches any keyword (case-insensitive substring).
 * Falls back to first clip if none match.
 */
function findClip(animations, keywords) {
  for (const kw of keywords) {
    const found = animations.find((a) => a.name.toLowerCase().includes(kw.toLowerCase()));
    if (found) return found;
  }
  return null;
}

/**
 * The weapon holds:
 *  - a wrapper Group that the GLB lives inside (calibrator transform applied here)
 *  - a pivot Group that animates with springs/sway/bob (parented to UI camera)
 *  - the AnimationMixer + actions for fire/reload/idle/inspect/walk/run
 */
export class Weapon {
  constructor(uiScene) {
    this.uiScene = uiScene;
    this.group = new THREE.Group();      // outer pivot (springs/bob)
    this.wrapper = new THREE.Group();    // inner wrapper (calibrator transform)
    this.group.add(this.wrapper);
    uiScene.add(this.group);

    this.mixer = null;
    this.actions = {};
    this.currentAnim = null;
    this.animationNames = [];
    this.meshes = [];
    this.defaultTransform = null;

    // State
    this.ammo = CFG.magSize;
    this.reserve = CFG.reserveStart;
    this.lastFire = 0;
    this.fireCount = 0;
    this.isFiring = false;
    this.isAds = false;
    this.isReloading = false;
    this.isInspecting = false;
    this._reloadTimer = null;

    // Springs - all weapon-pose springs live here
    this.springs = {
      kick:  new Spring(1, 25, 350),
      rise:  new Spring(1, 15, 350),
      twist: new Spring(1, 10, 250),
      ads:   new Spring(1, 18, 200),
      side:  new Spring(1, 14, 280),
      fov:   new Spring(1, 12, 300),
      // Inspect/manual offsets
      rPosX: new Spring(1, 15, 250),
      rPosY: new Spring(1, 15, 250),
      rPosZ: new Spring(1, 15, 250),
      rRotX: new Spring(1, 12, 200),
      rRotY: new Spring(1, 12, 200),
      rRotZ: new Spring(1, 12, 200),
    };

    // Muzzle flash sub-scene
    this._buildMuzzleFlash();
    this._setupLights();
  }

  _setupLights() {
    this.uiScene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.2));

    const front = new THREE.DirectionalLight(0xffffff, 3.0);
    front.position.set(2, 4, 3);
    this.uiScene.add(front);

    const rim = new THREE.DirectionalLight(0xccddff, 2.0);
    rim.position.set(-3, 2, -3);
    this.uiScene.add(rim);

    const fill = new THREE.AmbientLight(0xffffff, 0.6);
    this.uiScene.add(fill);
  }

  _buildMuzzleFlash() {
    this.muzzleLight = new THREE.PointLight(0xffcc55, 0, 4);
    this.muzzleLight.position.set(0, 0, -1);
    this.group.add(this.muzzleLight);

    const flashGeo = new THREE.PlaneGeometry(0.5, 0.5);
    flashGeo.translate(0.25, 0, 0);
    const flashMat = new THREE.MeshBasicMaterial({
      map: TEX.muzzle,
      color: 0xffeebb,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
    });

    const p1 = new THREE.Mesh(flashGeo, flashMat.clone()); p1.rotation.y = Math.PI / 2;
    const p2 = new THREE.Mesh(flashGeo, flashMat.clone()); p2.rotation.y = Math.PI / 2; p2.rotation.x = Math.PI / 2;
    const p3 = new THREE.Mesh(flashGeo, flashMat.clone()); p3.rotation.y = Math.PI / 2; p3.rotation.x = Math.PI / 4;

    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 1.5),
      new THREE.MeshBasicMaterial({
        map: TEX.muzzleGlow,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
      })
    );
    glow.position.z = -0.1;

    this.muzzleGroup = new THREE.Group();
    this.muzzleGroup.add(p1, p2, p3, glow);
    this.muzzleLight.add(this.muzzleGroup);
    this.flashMeshes = [p1, p2, p3, glow];
    this.flashMeshes.forEach((m) => { m.frustumCulled = false; m.renderOrder = 999; });
  }

  /**
   * Load a weapon GLB. If url is null, builds a procedural placeholder.
   * Returns metadata: { animationNames, meshNames, isCustom }
   */
  async load(url, isCustom = false) {
    // Clear previous
    while (this.wrapper.children.length) this.wrapper.remove(this.wrapper.children[0]);
    this.mixer = null;
    this.actions = {};
    this.currentAnim = null;
    this.animationNames = [];
    this.meshes = [];

    if (!url) {
      this._buildProceduralWeapon();
      return { animationNames: [], meshes: [], isCustom: false };
    }

    return new Promise((resolve, reject) => {
      const loader = new GLTFLoader();
      loader.load(
        url,
        (gltf) => {
          const model = gltf.scene;
          this._enhanceMaterials(model);
          this._collectMeshes(model);
          this.wrapper.add(model);

          // Auto-fit
          this._autoFit();

          // Restore calibration if custom
          if (isCustom) {
            const saved = prefs.get('weaponCal');
            if (saved) this.applyCalibration(saved);
          }

          // Capture default transform for reset
          this.defaultTransform = this._snapshotTransform();

          // Animations
          if (gltf.animations && gltf.animations.length > 0) {
            this._setupAnimations(gltf.animations, model);
            this.animationNames = gltf.animations.map((a) => a.name);
          }

          resolve({
            animationNames: this.animationNames,
            meshes: this.meshes,
            isCustom,
          });
        },
        undefined,
        (err) => reject(err)
      );
    });
  }

  _buildProceduralWeapon() {
    // Simple placeholder gun (body + barrel) when no GLB is provided.
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.18, 0.42),
      new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.9, roughness: 0.3 })
    );
    body.position.set(0, 0, 0);

    const grip = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.18, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7 })
    );
    grip.position.set(0, -0.13, 0.12);
    grip.rotation.x = -0.2;

    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.12, 12),
      new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.9, roughness: 0.4 })
    );
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.05, -0.27);

    const sight = new THREE.Mesh(
      new THREE.BoxGeometry(0.01, 0.02, 0.02),
      new THREE.MeshStandardMaterial({ color: 0xff3300 })
    );
    sight.position.set(0, 0.105, -0.1);

    const grp = new THREE.Group();
    grp.add(body, grip, barrel, sight);
    this.wrapper.add(grp);
    this.defaultTransform = this._snapshotTransform();
  }

  _enhanceMaterials(model) {
    model.traverse((c) => {
      if (c.isMesh && c.material) {
        c.material.envMapIntensity = 1.5;
        if (c.material.metalness !== undefined) {
          c.material.metalness = Math.max(c.material.metalness, 0.4);
          c.material.roughness = Math.min(c.material.roughness, 0.6);
        }
      }
    });
  }

  _collectMeshes(model) {
    model.traverse((c) => {
      if (!c.isMesh) return;
      const box = new THREE.Box3().setFromObject(c);
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const name = c.name || 'unnamed';

      // Auto-hide enormous meshes (likely sky shells from exporters)
      const ln = name.toLowerCase();
      if (ln.includes('sky') || ln.includes('dome') || ln.includes('panorama') || ln.includes('env') || maxDim > 10) {
        c.visible = false;
      }

      this.meshes.push(c);
    });
  }

  _autoFit() {
    const box = new THREE.Box3().setFromObject(this.wrapper);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0 && isFinite(maxDim)) {
      this.wrapper.scale.setScalar(0.85 / maxDim);
    }
    const box2 = new THREE.Box3().setFromObject(this.wrapper);
    const center = box2.getCenter(new THREE.Vector3());
    this.wrapper.position.sub(center);
    this.wrapper.position.z += 0.05;
    this.wrapper.rotation.y = Math.PI;
  }

  _setupAnimations(clips, root) {
    this.mixer = new THREE.AnimationMixer(root);

    // Try canonical names first, then keyword search.
    this.actions.fire = this._action(clips, ['fire', 'shoot', 'attack', 'recoil']);
    this.actions.idle = this._action(clips, ['idle', 'stand', 'wait', 'base']);
    this.actions.reload = this._action(clips, ['reload', 'reloadclip', 'reload_full']);
    this.actions.emptyReload = this._action(clips, ['reload_empty', 'emptyclipreload', 'empty', 'dry']);
    this.actions.inspect = this._action(clips, ['inspect', 'examine', 'weild', 'check']);
    this.actions.walk = this._action(clips, ['walk', 'move', 'forward']);
    this.actions.run = this._action(clips, ['run', 'sprint', 'dash']);

    if (!this.actions.emptyReload) this.actions.emptyReload = this.actions.reload;
    if (!this.actions.fire) this.actions.fire = this.mixer.clipAction(clips[0]);

    if (this.actions.fire) {
      this.actions.fire.setLoop(THREE.LoopOnce);
      this.actions.fire.clampWhenFinished = true;
    }
    if (this.actions.reload) {
      this.actions.reload.setLoop(THREE.LoopOnce);
      this.actions.reload.clampWhenFinished = true;
    }
    if (this.actions.emptyReload && this.actions.emptyReload !== this.actions.reload) {
      this.actions.emptyReload.setLoop(THREE.LoopOnce);
      this.actions.emptyReload.clampWhenFinished = true;
    }
    if (this.actions.inspect) {
      this.actions.inspect.setLoop(THREE.LoopOnce);
      this.actions.inspect.clampWhenFinished = true;
    }
    if (this.actions.idle) {
      this.actions.idle.setLoop(THREE.LoopRepeat);
      this.actions.idle.play();
      this.currentAnim = this.actions.idle;
    }

    // Single mixer event handler
    this.mixer.addEventListener('finished', (e) => {
      const a = e.action;
      a.stop();
      if (a === this.actions.inspect) this.isInspecting = false;
      // Reload completion is now driven by a precise timer (see triggerReload)
      // so mixer 'finished' just needs to return to idle/walk.
      if (this.currentAnim) {
        this.currentAnim.reset();
        this.currentAnim.play();
      }
    });
  }

  _action(clips, keywords) {
    const clip = findClip(clips, keywords);
    return clip ? this.mixer.clipAction(clip) : null;
  }

  _snapshotTransform() {
    return {
      s: this.wrapper.scale.x,
      x: this.wrapper.position.x,
      y: this.wrapper.position.y,
      z: this.wrapper.position.z,
      rx: THREE.MathUtils.radToDeg(this.wrapper.rotation.x),
      ry: THREE.MathUtils.radToDeg(this.wrapper.rotation.y),
      rz: THREE.MathUtils.radToDeg(this.wrapper.rotation.z),
    };
  }

  applyCalibration(c) {
    this.wrapper.scale.setScalar(c.s);
    this.wrapper.position.set(c.x, c.y, c.z);
    this.wrapper.rotation.set(
      THREE.MathUtils.degToRad(c.rx),
      THREE.MathUtils.degToRad(c.ry),
      THREE.MathUtils.degToRad(c.rz)
    );
  }

  // === ACTIONS ===

  toggleAds() {
    if (this.isReloading) return;
    if (this.isInspecting) this.cancelInspect();
    this.isAds = !this.isAds;
  }

  /**
   * Try to fire. Returns { fired: bool, ammo: number, dryFire: bool }
   */
  tryFire(time) {
    if (this.isReloading) return { fired: false };
    if (time - this.lastFire < CFG.fireRate) return { fired: false };

    if (this.ammo <= 0) {
      if (time - this.lastFire > 0.3) {
        this.lastFire = time;
        this.fireCount = 0;
        playClick();
        return { fired: false, dryFire: true };
      }
      return { fired: false };
    }

    this.lastFire = time;
    this.ammo--;
    this.fireCount++;
    playGunshot();

    // Animation
    if (this.actions.fire) {
      this.actions.fire.stop();
      this.actions.fire.reset();
      this.actions.fire.play();
    }

    // Recoil springs (escalates with sustained fire)
    const recoilMult = this.isAds ? 0.6 : 1.0;
    const accum = 1.0 + Math.min(1.0, (this.fireCount - 1) * 0.1);
    this.springs.kick.addImpulse(1.6 * recoilMult * accum);
    this.springs.rise.addImpulse(2.4 * recoilMult * accum);
    this.springs.side.addImpulse((Math.random() - 0.5) * 1.2 * recoilMult * accum);
    this.springs.twist.addImpulse((Math.random() - 0.5) * 1.0 * recoilMult * accum);
    this.springs.fov.addImpulse(15.0 * recoilMult);

    // Muzzle flash on
    this.muzzleLight.intensity = 8;
    if (this.flashMeshes) {
      this.muzzleGroup.rotation.z = Math.random() * Math.PI;
      this.flashMeshes.forEach((m, i) => {
        m.material.opacity = 0.8 + Math.random() * 0.2;
        if (i === 3) {
          m.material.opacity = 0.6;
          m.scale.setScalar(0.7 + Math.random() * 0.4);
        } else {
          m.scale.set(1.0 + Math.random() * 0.8, 0.3 + Math.random() * 0.2, 1);
        }
      });
    }

    return { fired: true };
  }

  triggerReload() {
    if (this.isReloading) return false;
    if (this.ammo >= CFG.magSize) return false;
    if (this.reserve <= 0) return false;

    if (this.isInspecting) this.cancelInspect();

    this.isReloading = true;
    this.isAds = false;
    this.isFiring = false;

    const isEmpty = this.ammo === 0;
    const action = isEmpty ? this.actions.emptyReload : this.actions.reload;

    let reloadDuration = CFG.reloadTime;
    let ammoAt = CFG.reloadAmmoTime;

    if (action) {
      const clipDuration = action.getClip().duration;
      reloadDuration = clipDuration;
      ammoAt = clipDuration * 0.55; // give ammo at ~55% through
      action.stop();
      action.reset();
      action.play();
      if (this.currentAnim) {
        this.currentAnim.crossFadeTo(action, 0.1, false);
      }
      playSlide();
    } else {
      playSlide();
    }

    // Schedule ammo fill
    setTimeout(() => {
      const needed = CFG.magSize - this.ammo;
      const take = Math.min(needed, this.reserve);
      this.ammo += take;
      this.reserve -= take;
      playClick();
    }, ammoAt * 1000);

    // Schedule end of reload (slightly before clip ends to feel snappy)
    if (this._reloadTimer) clearTimeout(this._reloadTimer);
    this._reloadTimer = setTimeout(() => {
      this.isReloading = false;
      this._reloadTimer = null;
    }, reloadDuration * 1000);

    return true;
  }

  triggerInspect() {
    if (this.isReloading || this.isAds || this.isFiring || this.isInspecting) return;
    if (!this.actions.inspect) return false; // Only works if the model has an inspect anim
    this.isInspecting = true;
    const a = this.actions.inspect;
    a.stop();
    a.reset();
    a.play();
    if (this.currentAnim) this.currentAnim.crossFadeTo(a, 0.1, false);
    playSlide();
    return true;
  }

  cancelInspect() {
    if (!this.isInspecting) return;
    this.isInspecting = false;
    if (this.actions.inspect) this.actions.inspect.stop();
    if (this.currentAnim) {
      this.currentAnim.reset();
      this.currentAnim.play();
    }
  }

  // === FRAME UPDATE ===

  update(dt, player) {
    if (this.mixer) this.mixer.update(dt);

    // Update all springs
    for (const k in this.springs) this.springs[k].update(dt);

    // Sprint-cancel: can't fire while sprinting
    const canSprint = !this.isAds && !this.isFiring && !this.isReloading && player.isGrounded;
    player.isSprinting = canSprint && (player._wantSprint === true);

    // Drive locomotion animation if available
    this._updateLocomotionAnim(player);

    // ADS spring target
    this.springs.ads.target = this.isAds ? 1 : 0;

    // Cool down recoil accumulation
    if (!this.isFiring) {
      this.fireCount = THREE.MathUtils.lerp(this.fireCount, 0, dt * 5);
    }

    // Decay muzzle flash
    this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - dt * 100);
    if (this.flashMeshes) {
      this.flashMeshes.forEach((m) => {
        m.material.opacity = Math.max(0, m.material.opacity - dt * 45);
        m.scale.multiplyScalar(1.0 + dt * 10);
      });
    }
  }

  _updateLocomotionAnim(player) {
    if (!this.actions || (!this.actions.walk && !this.actions.run && !this.actions.idle)) return;
    if (this.isFiring || this.isReloading || this.isInspecting) return;

    const speed2D = Math.hypot(player.velocity.x, player.velocity.z);
    let target = this.actions.idle;
    if (speed2D > 0.5) {
      target = (player.isSprinting && this.actions.run) ? this.actions.run : (this.actions.walk || this.actions.idle);
    }

    if (target && this.currentAnim !== target) {
      target.setLoop(THREE.LoopRepeat);
      target.reset();
      target.play();
      if (this.currentAnim) this.currentAnim.crossFadeTo(target, 0.2, false);
      this.currentAnim = target;
    }

    if (this.currentAnim === this.actions.walk || this.currentAnim === this.actions.run) {
      const base = this.currentAnim === this.actions.run ? CFG.playerSpeed * CFG.sprintMultiplier : CFG.playerSpeed;
      this.currentAnim.timeScale = THREE.MathUtils.clamp(speed2D / base, 0.5, 2.0);
    }
  }

  /**
   * Apply pose to the outer group. Called after springs update.
   * Returns the camera FOV the renderer should use this frame.
   */
  applyPose(player) {
    const adsT = this.springs.ads.val;
    const adsFac = 1.0 - adsT;

    // Lerp between hip/ads transforms
    _tPos.lerpVectors(CFG.gunHipPos, CFG.gunAdsPos, adsT);
    const rotX = THREE.MathUtils.lerp(CFG.gunHipRot.x, CFG.gunAdsRot.x, adsT);
    const rotY = THREE.MathUtils.lerp(CFG.gunHipRot.y, CFG.gunAdsRot.y, adsT);
    const rotZ = THREE.MathUtils.lerp(CFG.gunHipRot.z, CFG.gunAdsRot.z, adsT);

    // Bob from walk phase
    const speed2D = Math.hypot(player.velocity.x, player.velocity.z);
    const speedNorm = Math.min(1.2, speed2D / CFG.playerSpeed);
    const bobScale = adsFac * 0.6 + 0.1; // dampened in ADS

    let bobX = 0, bobY = 0, bobRX = 0, bobRZ = 0;
    if (!(this.actions.walk || this.actions.run)) {
      // Procedural bob only if model lacks locomotion anims
      bobX = Math.cos(player.walkPhase * 0.5) * 0.01 * speedNorm * bobScale;
      bobY = Math.abs(Math.sin(player.walkPhase * 0.5)) * 0.015 * speedNorm * bobScale;
      bobRZ = Math.cos(player.walkPhase * 0.5) * 0.02 * speedNorm * bobScale;
      bobRX = Math.sin(player.walkPhase) * 0.015 * speedNorm * bobScale;
    }

    // Sway (organic micro-movement)
    const sx = player.swayX * 1.2;
    const sy = player.swayY * 1.2;

    this.group.position.set(
      _tPos.x + bobX + player.swayX + this.springs.side.val * 0.05 + this.springs.rPosX.val,
      _tPos.y + bobY + player.swayY + this.springs.rise.val * 0.02 + this.springs.rPosY.val,
      _tPos.z + this.springs.kick.val + this.springs.rPosZ.val
    );
    this.group.rotation.set(
      rotX + this.springs.rise.val + bobRX - sy + this.springs.rRotX.val,
      rotY + this.springs.side.val * 0.8 + sx + this.springs.rRotY.val,
      rotZ + this.springs.twist.val + bobRZ - player.swayX * 0.4 + this.springs.rRotZ.val
    );

    // Camera FOV
    const targetFov = this.isAds ? CFG.fovAds : CFG.fovHip;
    return targetFov + this.springs.fov.val;
  }
}
