okkk so urrrrm the enemy stuff is half done already in src/game.ts. the loadout slot and the model loading and the navmesh stuff is already there. now just add the rest pls. dont remove or rewrite anything that already works ok, only edit src/game.ts and src/index.css. add these 15 things exactly as written.

ALSO if a step says "find this line" and there are multiple of them, use the first one inside the function being mentioned.

==============================================
1) up top in src/game.ts find the block that starts with:
   const enemies: Enemy[] = [];
right after that block of enemy state vars, ADD this:

```ts
let playerHP = 100, maxPlayerHP = 100, playerArmor = 50, maxPlayerArmor = 50;
let lastDamageTime = -10, inputFrozenUntil = 0;
let frameCount = 0;
const enemyMeshList: any[] = [];
let dmgIndicator: HTMLElement | null = null;
let deathOverlay: HTMLElement | null = null;
let enemyCounter: HTMLElement | null = null;
const ENEMY_BODY_OFFSET = 0.95;
```

==============================================
2) find the existing tiny Enemy interface (the one with just hp, state: 'patrol', spawnPos). DELETE the whole interface block and REPLACE it with this bigger one:

```ts
interface Enemy {
  model: any;
  mixer: any;
  actions: Record<string, any>;
  vehicle: any;
  charController: any;
  body: any;
  collider: any;
  hp: number;
  maxHp: number;
  state: 'patrol' | 'investigate' | 'chase' | 'attack' | 'dead';
  spawnPos: THREE.Vector3;
  yaw: number;
  velocity: THREE.Vector3;
  patrolWaitTimer: number;
  patrolTarget: THREE.Vector3 | null;
  investigateTarget: THREE.Vector3 | null;
  investigateLookTimer: number;
  lastPlayerSighting: THREE.Vector3 | null;
  sightMemoryTimer: number;
  fireTimer: number;
  meleeTimer: number;
  staggerVel: THREE.Vector3;
  staggerTimer: number;
  deathTimer: number;
  deathTipAngle: number;
  locoMaster: number;
  meshList: any[];
}
```

==============================================
3) find this exact line:
   const footerClock = hud.querySelector('.footer-clock') as HTMLElement;
right AFTER it, ADD:

```ts
enemyCounter = document.createElement('div');
enemyCounter.className = 'enemy-counter';
hud.appendChild(enemyCounter);

const dmgWrap = document.createElement('div');
dmgWrap.className = 'dmg-indicators';
dmgIndicator = document.createElement('div');
dmgIndicator.className = 'dmg-indicator';
dmgWrap.appendChild(dmgIndicator);
hud.appendChild(dmgWrap);

deathOverlay = document.createElement('div');
deathOverlay.className = 'death-overlay';
hud.appendChild(deathOverlay);
```

==============================================
4) find the function loadMapFile. inside its try block right BEFORE the line:
   await saveBlob('map', file);
ADD:

```ts
trySpawnEnemies();
```

==============================================
5) find loadEnemyFile. inside it find the line:
   enemyModel = gltf.scene;
right AFTER that line, ADD:

```ts
enemyModel.userData.animations = gltf.animations;
```

then later in the same function find the line:
   enemyReset.style.display = 'block';
right AFTER that line, ADD:

```ts
trySpawnEnemies();
```

==============================================
6) find the function buildNavmesh. right BEFORE that whole function, ADD ALL these new functions in one block:

```ts
function pickRandomNavmeshPoint(minDistFromSpawn: number): THREE.Vector3 | null {
  if (!navZone || !navZone.groups || !navZone.groups[0]) return null;
  const grp = navZone.groups[0];
  if (grp.length === 0) return null;
  for (let tries = 0; tries < 30; tries++) {
    const node = grp[Math.floor(Math.random() * grp.length)];
    const v = node.centroid || (node.vertexIds ? null : null);
    if (!v) continue;
    const pos = new THREE.Vector3(v.x, v.y, v.z);
    if (pos.distanceTo(spawnPoint) >= minDistFromSpawn) return pos;
  }
  return null;
}

function trySpawnEnemies() {
  if (!enemyModel || !mapModel || !navZone || enemies.length > 0) return;
  const spawnPoints: THREE.Vector3[] = [];
  mapModel.traverse((c: any) => {
    if (/^enemy[_-]?spawn/i.test(c.name || '')) {
      const wp = new THREE.Vector3();
      c.getWorldPosition(wp);
      spawnPoints.push(wp);
    }
  });
  if (spawnPoints.length === 0) {
    for (let i = 0; i < 4; i++) {
      const p = pickRandomNavmeshPoint(15);
      if (p) spawnPoints.push(p);
    }
  }
  const cap = isMobile ? 4 : 8;
  for (let i = 0; i < Math.min(spawnPoints.length, cap); i++) {
    spawnEnemyAt(spawnPoints[i]);
  }
  console.log('[VoidEngine] Spawned ' + enemies.length + ' enemies');
}

function spawnEnemyAt(pos: THREE.Vector3) {
  const SkelClone = skeletonUtilsModule.clone || skeletonUtilsModule.SkeletonUtils?.clone || skeletonUtilsModule.default?.clone;
  if (!SkelClone) { console.warn('[VoidEngine] SkeletonUtils.clone not found'); return; }
  const model = SkelClone(enemyModel);
  model.scale.setScalar(enemyScale);
  model.position.copy(pos);
  model.rotation.set(0, 0, 0);
  worldScene.add(model);

  const mx = new THREE.AnimationMixer(model);
  const a: Record<string, any> = {};
  const detected: Record<string, any> = {};
  const animList = enemyModel.userData?.animations || [];
  for (const clip of animList) detected[clip.name] = clip;

  const setupClip = (name: string, loop: boolean) => {
    if (!detected[name]) return;
    const act = mx.clipAction(detected[name]);
    act.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce);
    if (!loop) (act as any).clampWhenFinished = true;
    act.play();
    act.setEffectiveWeight(name === 'idle' ? 1 : 0);
    if (!loop) act.paused = true;
    a[name] = act;
  };
  setupClip('idle', true);
  setupClip('walk', true);
  setupClip('run', true);
  setupClip('fire', false);
  setupClip('fire_up', false);
  setupClip('melee', false);
  setupClip('jump_attack', false);

  const bd = RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(pos.x, pos.y + ENEMY_BODY_OFFSET, pos.z);
  const body = rapierWorld.createRigidBody(bd);
  const col = rapierWorld.createCollider(RAPIER.ColliderDesc.capsule(0.7, 0.25), body);
  const cc = rapierWorld.createCharacterController(0.02);
  cc.setUp({ x: 0, y: 1, z: 0 });
  cc.enableAutostep(0.6, 0.05, true);
  cc.enableSnapToGround(0.5);
  cc.setMaxSlopeClimbAngle(50 * Math.PI / 180);

  const meshList: any[] = [];
  model.traverse((c: any) => {
    if (c.isMesh) {
      meshList.push(c);
      enemyMeshList.push(c);
    }
  });

  const Vehicle = yukaModule.Vehicle || yukaModule.default?.Vehicle;
  const vehicle = Vehicle ? new Vehicle() : null;

  const enemy: Enemy = {
    model, mixer: mx, actions: a, vehicle, charController: cc,
    body, collider: col,
    hp: 60, maxHp: 60, state: 'patrol',
    spawnPos: pos.clone(), yaw: 0,
    velocity: new THREE.Vector3(),
    patrolWaitTimer: 0, patrolTarget: null,
    investigateTarget: null, investigateLookTimer: 0,
    lastPlayerSighting: null, sightMemoryTimer: 0,
    fireTimer: 0, meleeTimer: 0,
    staggerVel: new THREE.Vector3(), staggerTimer: 0,
    deathTimer: 0, deathTipAngle: 0,
    locoMaster: 1, meshList
  };
  enemies.push(enemy);
}

function enemyVisionCheck(e: Enemy, playerPos: THREE.Vector3): boolean {
  const fwd = _v3a.set(-Math.sin(e.yaw), 0, -Math.cos(e.yaw));
  const toPlayer = _v3b.copy(playerPos).sub(e.model.position);
  const dist = toPlayer.length();
  if (dist > 25) return false;
  toPlayer.normalize();
  if (fwd.dot(toPlayer) < 0.5) return false;
  const chest = _v3c.copy(e.model.position); chest.y += 1.4;
  raycaster.set(chest, toPlayer);
  raycaster.far = dist;
  const hits = raycaster.intersectObjects(raycastMeshes, false);
  raycaster.far = Infinity;
  return hits.length === 0;
}

function broadcastNoise(pos: THREE.Vector3, radius: number) {
  for (const e of enemies) {
    if (e.state !== 'patrol' && e.state !== 'investigate') continue;
    if (e.model.position.distanceTo(pos) <= radius) {
      e.investigateTarget = pos.clone();
      e.investigateLookTimer = 0;
      e.state = 'investigate';
    }
  }
}

function moveEnemyToward(e: Enemy, target: THREE.Vector3, speed: number, dt: number): number {
  const dir = _v3a.copy(target).sub(e.model.position); dir.y = 0;
  const dist = dir.length();
  if (dist < 0.05) {
    e.velocity.x = 0; e.velocity.z = 0;
    e.velocity.y -= GRAVITY * dt;
    const desiredStop = { x: 0, y: e.velocity.y * dt, z: 0 };
    e.charController.computeColliderMovement(e.collider, desiredStop);
    const cmStop = e.charController.computedMovement();
    if (e.charController.computedGrounded()) e.velocity.y = -1;
    const t0 = e.body.translation();
    e.body.setNextKinematicTranslation({ x: t0.x, y: t0.y + cmStop.y, z: t0.z });
    e.model.position.set(t0.x, t0.y + cmStop.y - ENEMY_BODY_OFFSET, t0.z);
    return 0;
  }
  dir.normalize();
  e.velocity.x = dir.x * speed;
  e.velocity.z = dir.z * speed;
  e.velocity.y -= GRAVITY * dt;
  const desired = { x: e.velocity.x * dt, y: e.velocity.y * dt, z: e.velocity.z * dt };
  e.charController.computeColliderMovement(e.collider, desired);
  const cm = e.charController.computedMovement();
  if (e.charController.computedGrounded() && e.velocity.y < 0) e.velocity.y = -1;
  const t = e.body.translation();
  e.body.setNextKinematicTranslation({ x: t.x + cm.x, y: t.y + cm.y, z: t.z + cm.z });
  e.model.position.set(t.x + cm.x, t.y + cm.y - ENEMY_BODY_OFFSET, t.z + cm.z);
  e.yaw = Math.atan2(-dir.x, -dir.z);
  e.model.rotation.y = e.yaw;
  return dist;
}

function faceTarget(e: Enemy, target: THREE.Vector3, dt: number) {
  const dx = target.x - e.model.position.x;
  const dz = target.z - e.model.position.z;
  const targetYaw = Math.atan2(-dx, -dz);
  let diff = targetYaw - e.yaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  e.yaw += diff * Math.min(1, dt * 6);
  e.model.rotation.y = e.yaw;
}

function setEnemyAnim(e: Enemy, name: string, dt: number) {
  const targets: Record<string, number> = { idle: 0, walk: 0, run: 0 };
  targets[name] = 1;
  const blend = Math.min(1, dt * 8);
  for (const k of ['idle', 'walk', 'run']) {
    if (!e.actions[k]) continue;
    const cur = e.actions[k].getEffectiveWeight();
    const tgt = targets[k] * e.locoMaster;
    e.actions[k].setEffectiveWeight(cur + (tgt - cur) * blend);
  }
}

function playEnemyOverlay(e: Enemy, name: string) {
  const a = e.actions[name];
  if (!a) return;
  e.locoMaster = 0;
  a.time = 0;
  a.paused = false;
  a.reset();
  a.setEffectiveWeight(1);
  const dur = a.getClip().duration;
  setTimeout(() => {
    if (e.state === 'dead') return;
    a.setEffectiveWeight(0);
    e.locoMaster = 1;
  }, dur * 1000);
}

function damageEnemy(e: Enemy, amount: number, hitDir: THREE.Vector3): boolean {
  if (e.state === 'dead') return false;
  e.hp -= amount;
  e.staggerVel.copy(hitDir).multiplyScalar(2);
  e.staggerTimer = 0.15;
  if (e.hp <= 0) {
    e.state = 'dead';
    e.deathTimer = 0;
    weapon.hits++;
    return true;
  }
  return false;
}

function spawnDamageIndicator(attackerPos: THREE.Vector3) {
  if (!dmgIndicator) return;
  const dx = attackerPos.x - camera.position.x;
  const dz = attackerPos.z - camera.position.z;
  const angleToAttacker = Math.atan2(-dx, -dz);
  let rel = angleToAttacker - playerYaw;
  while (rel > Math.PI) rel -= Math.PI * 2;
  while (rel < -Math.PI) rel += Math.PI * 2;
  dmgIndicator.style.transform = 'rotate(' + (rel * 180 / Math.PI) + 'deg)';
  dmgIndicator.classList.add('show');
  setTimeout(() => { dmgIndicator?.classList.remove('show'); }, 1000);
}

function playerTakeDamage(amount: number, attackerPos: THREE.Vector3) {
  if (performance.now() / 1000 < inputFrozenUntil) return;
  let dmg = amount;
  if (playerArmor > 0) {
    const absorbed = Math.min(playerArmor, dmg * 0.6);
    playerArmor -= absorbed;
    dmg -= absorbed;
  }
  playerHP -= dmg;
  lastDamageTime = performance.now() / 1000;
  spawnDamageIndicator(attackerPos);
  if (playerHP <= 0) {
    playerHP = 0;
    deathOverlay?.classList.add('show');
    inputFrozenUntil = performance.now() / 1000 + 2;
    firing = false; adsMode = false;
    setTimeout(playerRespawn, 2000);
  }
}

function playerRespawn() {
  playerHP = maxPlayerHP;
  playerArmor = maxPlayerArmor;
  playerVel.set(0, 0, 0);
  playerBody.setNextKinematicTranslation({ x: spawnPoint.x, y: spawnPoint.y, z: spawnPoint.z });
  deathOverlay?.classList.remove('show');
}

function updateEnemies(dt: number) {
  if (phase !== 'playing') return;
  frameCount++;
  const playerPosVec = _v3d.set(camera.position.x, camera.position.y, camera.position.z);
  const aiSkipFrame = isMobile && (frameCount % 2 === 0);

  const sortable: { e: Enemy; d: number }[] = [];
  for (const e of enemies) {
    if (e.state === 'dead') continue;
    sortable.push({ e, d: e.model.position.distanceTo(playerPosVec) });
  }
  sortable.sort((a, b) => a.d - b.d);
  const visionAllowed = new Set<Enemy>();
  for (let i = 0; i < Math.min(3, sortable.length); i++) visionAllowed.add(sortable[i].e);
  if (sortable.length > 3) {
    const extraIdx = 3 + (frameCount % Math.max(1, sortable.length - 3));
    if (sortable[extraIdx]) visionAllowed.add(sortable[extraIdx].e);
  }

  for (let ei = enemies.length - 1; ei >= 0; ei--) {
    const e = enemies[ei];
    e.mixer.update(dt);

    if (e.state === 'dead') {
      e.deathTimer += dt;
      e.deathTipAngle = Math.min(Math.PI / 2, e.deathTipAngle + dt * Math.PI);
      e.model.rotation.z = e.deathTipAngle;
      if (e.deathTimer > 4) {
        const fade = Math.max(0, 1 - (e.deathTimer - 4) * 2);
        e.model.traverse((c: any) => {
          if (c.isMesh && c.material) {
            const mats = Array.isArray(c.material) ? c.material : [c.material];
            for (const m of mats) { m.transparent = true; m.opacity = fade; }
          }
        });
      }
      if (e.deathTimer > 5) {
        worldScene.remove(e.model);
        try { rapierWorld.removeRigidBody(e.body); } catch {}
        try { rapierWorld.removeCharacterController(e.charController); } catch {}
        for (const m of e.meshList) {
          const idx = enemyMeshList.indexOf(m);
          if (idx >= 0) enemyMeshList.splice(idx, 1);
        }
        enemies.splice(ei, 1);
      }
      continue;
    }

    if (e.staggerTimer > 0) {
      e.staggerTimer -= dt;
      const t = e.body.translation();
      e.body.setNextKinematicTranslation({
        x: t.x + e.staggerVel.x * dt,
        y: t.y,
        z: t.z + e.staggerVel.z * dt
      });
      e.staggerVel.multiplyScalar(0.85);
    }

    const dist = e.model.position.distanceTo(playerPosVec);
    if (dist > 50) { setEnemyAnim(e, 'idle', dt); continue; }
    if (aiSkipFrame) continue;

    if (visionAllowed.has(e)) {
      const sees = enemyVisionCheck(e, playerPosVec);
      if (sees) {
        e.lastPlayerSighting = playerPosVec.clone();
        e.sightMemoryTimer = 3;
        if (e.state === 'patrol' || e.state === 'investigate') e.state = 'chase';
      } else if (e.sightMemoryTimer > 0) {
        e.sightMemoryTimer -= dt;
        if (e.sightMemoryTimer <= 0 && e.state === 'chase' && e.lastPlayerSighting) {
          e.state = 'investigate';
          e.investigateTarget = e.lastPlayerSighting.clone();
          e.investigateLookTimer = 0;
        }
      }
    }

    if (e.state === 'patrol') {
      if (e.patrolWaitTimer > 0) {
        e.patrolWaitTimer -= dt;
        setEnemyAnim(e, 'idle', dt);
      } else if (e.patrolTarget) {
        const d = moveEnemyToward(e, e.patrolTarget, 2.5, dt);
        if (d < 0.5) {
          e.patrolTarget = null;
          e.patrolWaitTimer = 1 + Math.random() * 2;
        }
        setEnemyAnim(e, 'walk', dt);
      } else {
        const offset = new THREE.Vector3((Math.random() - 0.5) * 30, 0, (Math.random() - 0.5) * 30);
        e.patrolTarget = e.spawnPos.clone().add(offset);
        e.patrolTarget.y = e.model.position.y;
      }
    } else if (e.state === 'investigate') {
      if (e.investigateTarget) {
        const d = moveEnemyToward(e, e.investigateTarget, 2.5, dt);
        if (d < 0.5) {
          e.investigateTarget = null;
          e.investigateLookTimer = 2;
        }
        setEnemyAnim(e, 'walk', dt);
      } else if (e.investigateLookTimer > 0) {
        e.investigateLookTimer -= dt;
        e.yaw += dt * 1.5;
        e.model.rotation.y = e.yaw;
        setEnemyAnim(e, 'idle', dt);
        if (e.investigateLookTimer <= 0) e.state = 'patrol';
      } else {
        e.state = 'patrol';
      }
    } else if (e.state === 'chase') {
      if (dist < 12 && e.sightMemoryTimer > 0) {
        e.state = 'attack';
      } else if (e.lastPlayerSighting) {
        moveEnemyToward(e, e.lastPlayerSighting, 5, dt);
        setEnemyAnim(e, 'run', dt);
      }
    } else if (e.state === 'attack') {
      e.velocity.x = 0; e.velocity.z = 0;
      e.velocity.y -= GRAVITY * dt;
      const desired = { x: 0, y: e.velocity.y * dt, z: 0 };
      e.charController.computeColliderMovement(e.collider, desired);
      const cm = e.charController.computedMovement();
      if (e.charController.computedGrounded()) e.velocity.y = -1;
      const t = e.body.translation();
      e.body.setNextKinematicTranslation({ x: t.x, y: t.y + cm.y, z: t.z });
      e.model.position.set(t.x, t.y + cm.y - ENEMY_BODY_OFFSET, t.z);
      faceTarget(e, playerPosVec, dt);
      setEnemyAnim(e, 'idle', dt);
      if (dist > 20 || e.sightMemoryTimer <= 0) { e.state = 'chase'; continue; }
      if (dist < 2) {
        e.meleeTimer -= dt;
        if (e.meleeTimer <= 0) {
          playEnemyOverlay(e, 'melee');
          playerTakeDamage(25, e.model.position);
          e.meleeTimer = 1;
        }
      } else {
        e.fireTimer -= dt;
        if (e.fireTimer <= 0) {
          const chest = _v3e.copy(e.model.position); chest.y += 1.4;
          const aim = _v3a.copy(playerPosVec).sub(chest).normalize();
          raycaster.set(chest, aim);
          const playerDist = chest.distanceTo(playerPosVec);
          raycaster.far = playerDist;
          const obs = raycaster.intersectObjects(raycastMeshes, false);
          raycaster.far = Infinity;
          if (obs.length === 0) {
            const dmg = 8 + Math.floor(Math.random() * 8);
            playerTakeDamage(dmg, e.model.position);
          }
          const useUp = playerPosVec.y - e.model.position.y > 2;
          playEnemyOverlay(e, useUp && e.actions.fire_up ? 'fire_up' : 'fire');
          e.fireTimer = 1 + Math.random() * 0.5;
        }
      }
    }
  }
}
```

==============================================
7) find function performHitscan. inside it find the line:
   const hits = raycaster.intersectObjects(raycastMeshes, false);
right AFTER that line ADD:

```ts
const enemyHits = enemyMeshList.length > 0 ? raycaster.intersectObjects(enemyMeshList, false) : [];
const closerEnemyHit = enemyHits.length > 0 && (hits.length === 0 || enemyHits[0].distance < hits[0].distance);
```

then look further down in the same function for the block that starts with:
   if (hits.length > 0) {
DELETE the whole if/else block (the one that ends with the spawnTracer fallback in the else) and REPLACE it with this:

```ts
if (closerEnemyHit) {
  const eh = enemyHits[0];
  let target: Enemy | null = null;
  for (const en of enemies) {
    if (en.meshList.includes(eh.object)) { target = en; break; }
  }
  spawnImpactParticles(eh.point, eh.face ? eh.face.normal : _v3a.set(0,1,0));
  spawnTracer(muzzlePos, eh.point);
  if (target) {
    const hitDir = _v3a.copy(eh.point).sub(camera.position).normalize();
    const isKill = damageEnemy(target, 20, hitDir);
    showHitMarker(isKill);
    playHitConfirm();
  } else {
    showHitMarker(false);
    playHitConfirm();
  }
} else if (hits.length > 0) {
  const h = hits[0];
  const hitNormal = h.face ? h.face.normal.clone() : _v3a.clone().copy(camera.position).sub(h.point).normalize();
  spawnDecal(h.point, hitNormal);
  spawnImpactParticles(h.point, hitNormal);
  spawnTracer(muzzlePos, h.point);
  showHitMarker(false); weapon.hits++; playHitConfirm();
} else {
  spawnTracer(muzzlePos, _v3a.clone().addScaledVector(_v3b, 100));
}
```

==============================================
8) find function tryFire. inside it find the line:
   weapon.ammo--; playGunshot(); triggerOverlay('fire');
right AFTER that line ADD:

```ts
broadcastNoise(camera.position, 30);
```

==============================================
9) find function updateHUD. DELETE the whole function body and REPLACE it with this:

```ts
function updateHUD() {
  hpBar.style.width = (playerHP / maxPlayerHP * 100) + '%';
  hpVal.textContent = String(Math.max(0, Math.round(playerHP)));
  armorBar.style.width = (playerArmor / maxPlayerArmor * 100) + '%';
  armorVal.textContent = String(Math.max(0, Math.round(playerArmor)));
  ammoCurrent.textContent = String(weapon.ammo);
  ammoReserve.textContent = '/ ' + weapon.reserve;
  hitsCount.textContent = 'HITS: ' + weapon.hits;
  if (enemyCounter) {
    const alive = enemies.filter(e => e.state !== 'dead').length;
    enemyCounter.textContent = 'ENEMIES: ' + alive + '/' + enemies.length;
  }
  if (weapon.reloading) weaponStatusEl.textContent = 'RELOADING...';
  else if (weapon.ammo <= 0 && weapon.reserve <= 0) weaponStatusEl.textContent = 'OUT OF AMMO';
  else if (weapon.ammo > 0 && weapon.ammo < weapon.maxAmmo && weapon.reserve > 0) weaponStatusEl.textContent = 'PRESS R TO RELOAD';
  else weaponStatusEl.textContent = '';
}
```

==============================================
10) find function fixedUpdate. AT THE END of it (right before its closing brace) ADD:

```ts
updateEnemies(dt);
const _nowSec = performance.now() / 1000;
if (playerHP > 0 && playerHP < maxPlayerHP && _nowSec - lastDamageTime > 4) {
  playerHP = Math.min(maxPlayerHP, playerHP + 5 * dt);
}
```

==============================================
11) find function updatePlayerPhysics. inside it find the line:
   if (phase !== 'playing') return;
right AFTER that line ADD:

```ts
const __nowFrozen = performance.now() / 1000;
if (__nowFrozen < inputFrozenUntil) {
  rapierWorld.step();
  return;
}
```

==============================================
12) find mapReset.onclick. inside it BEFORE the line:
   if (mapModel) {
ADD:

```ts
for (const e of enemies) {
  worldScene.remove(e.model);
  try { rapierWorld.removeRigidBody(e.body); } catch {}
  try { rapierWorld.removeCharacterController(e.charController); } catch {}
}
enemies.length = 0;
enemyMeshList.length = 0;
```

==============================================
13) find enemyReset.onclick. inside it BEFORE the line:
   if (enemyModel) {
ADD the SAME block as step 12 (the enemy cleanup loop and the two .length = 0 lines).

==============================================
14) ADD these CSS rules to the END of src/index.css:

```css
.enemy-counter {
  position: absolute; bottom: 100px; right: 12px;
  font-family: var(--font-mono); font-size: 0.65rem;
  letter-spacing: 0.12em; color: var(--accent);
  text-shadow: 0 0 6px rgba(255,136,0,0.4);
  pointer-events: none;
}
.dmg-indicators { position: absolute; inset: 0; pointer-events: none; }
.dmg-indicator {
  position: absolute; top: 50%; left: 50%;
  width: 0; height: 0; pointer-events: none;
  opacity: 0; transition: opacity 0.3s;
}
.dmg-indicator::before {
  content: ''; position: absolute;
  top: -160px; left: -25px; width: 50px; height: 60px;
  background: linear-gradient(180deg, rgba(255,30,30,0.95), transparent);
  clip-path: polygon(50% 0%, 100% 100%, 0% 100%);
  filter: drop-shadow(0 0 8px rgba(255,30,30,0.7));
}
.dmg-indicator.show { opacity: 1; }
.death-overlay {
  position: absolute; inset: 0;
  background: radial-gradient(ellipse, rgba(120,0,0,0) 30%, rgba(120,0,0,0.85) 100%);
  pointer-events: none; opacity: 0;
  transition: opacity 0.4s ease-out;
  z-index: 60;
}
.death-overlay.show { opacity: 1; }
.hit-marker.kill .line { background: #ff3333; box-shadow: 0 0 6px rgba(255,0,0,0.6); }
.loadout-card.enemy { border-left: 3px solid #ffd700; }
.loadout-card.enemy .slot-label { color: #ffd700; }
.loadout-card.enemy.loaded { border-color: #ffd700; }
```

==============================================
15) one last thing. find showHitMarker function. make sure its signature accepts an isKill boolean. if it doesnt, change the function declaration to:

```ts
function showHitMarker(isKill = false) {
  hitMarkerEl.classList.toggle('kill', isKill);
  const startScale = isKill ? 2.1 : 1.4;
  const rot = (Math.random() - 0.5) * 30;
  hitMarkerEl.style.transform = 'translate(-50%,-50%) rotate(' + rot + 'deg) scale(' + startScale + ')';
  hitMarkerEl.classList.add('flash');
  requestAnimationFrame(() => {
    hitMarkerEl.style.transform = 'translate(-50%,-50%) rotate(' + rot + 'deg) scale(1)';
  });
  hitMarkerTimer = 0.2;
}
```

and in updateEffects find the line that resets hitMarkerEl when hitMarkerTimer hits 0 and make sure it also removes the kill class:

```ts
if (hitMarkerTimer > 0) { hitMarkerTimer -= dt; if (hitMarkerTimer <= 0) { hitMarkerEl.classList.remove('flash'); hitMarkerEl.classList.remove('kill'); hitMarkerEl.style.transform = 'translate(-50%,-50%) scale(1)'; } }
```

==============================================
thats it. dont add or remove anything else outside these 15 steps. dont rewrite the existing weapon stuff or the calibrators or the navmesh. just splice in the new bits exactly where they go. ty
