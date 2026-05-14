import * as THREE from 'three';
import { Pool } from '../utils/Pool.js';
import { TEX } from './textures.js';
import { CFG } from '../config.js';
import { playShellBounce } from '../audio/sfx.js';

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();

/**
 * Manages bullet holes (decals), impact sparks, shell casings, tracers, and smoke.
 * All objects are pooled and capped.
 */
export class Effects {
  constructor(scene) {
    this.scene = scene;

    const impactGeo = new THREE.BoxGeometry(0.04, 0.04, 0.04);
    const decalGeo = new THREE.PlaneGeometry(0.15, 0.15);
    const shellGeo = new THREE.CylinderGeometry(0.003, 0.003, 0.015, 6);
    const tracerGeo = new THREE.CylinderGeometry(0.01, 0.01, 1.0, 4);

    this.impactPool = new Pool(() => {
      const m = new THREE.Mesh(impactGeo,
        new THREE.MeshBasicMaterial({ color: 0xffaa44, transparent: true, opacity: 1 }));
      this.scene.add(m);
      return m;
    }, 50);

    this.decalPool = new Pool(() => {
      const m = new THREE.Mesh(decalGeo,
        new THREE.MeshBasicMaterial({
          map: TEX.bulletHole,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -4,
          polygonOffsetUnits: -4,
        }));
      this.scene.add(m);
      return m;
    }, 20);

    this.shellPool = new Pool(() => {
      const m = new THREE.Mesh(shellGeo,
        new THREE.MeshStandardMaterial({ color: 0xccaa44, metalness: 0.8, roughness: 0.2, transparent: true }));
      this.scene.add(m);
      return m;
    }, 20);

    this.tracerPool = new Pool(() => {
      const m = new THREE.Mesh(tracerGeo,
        new THREE.MeshBasicMaterial({ color: 0xffdd88, transparent: true, opacity: 0.8, depthWrite: false }));
      this.scene.add(m);
      return m;
    }, 20);

    // Active arrays (mesh + state)
    this.impacts = [];
    this.decals = [];
    this.shells = [];
    this.tracers = [];
  }

  spawnImpact(point, normal, ads = false) {
    // Decal
    if (this.decals.length >= CFG.maxDecals) {
      const oldest = this.decals.shift();
      this.decalPool.release(oldest.mesh);
    }
    const d = this.decalPool.acquire();
    d.material.opacity = 0.9;
    d.position.copy(point);
    d.lookAt(point.x + normal.x, point.y + normal.y, point.z + normal.z);
    d.rotateZ(Math.random() * Math.PI * 2);
    this.decals.push({ mesh: d, life: 10.0 });

    // Sparks
    const count = ads ? 3 : 5;
    for (let i = 0; i < count; i++) {
      if (this.impacts.length >= CFG.maxImpactParticles) break;
      const isSpark = Math.random() > 0.4;
      const p = this.impactPool.acquire();
      p.material.color.setHex(isSpark ? 0xffdd88 : 0x444444);
      p.material.opacity = 1;
      p.material.blending = isSpark ? THREE.AdditiveBlending : THREE.NormalBlending;
      p.position.copy(point).addScaledVector(normal, 0.02);

      _v1.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      const power = isSpark ? (0.15 + Math.random() * 0.2) : (0.05 + Math.random() * 0.05);
      _v2.copy(normal).multiplyScalar(power * 0.5).add(_v1.multiplyScalar(power));

      this.impacts.push({
        mesh: p,
        vel: _v2.clone(),
        life: 1.0,
        isSpark,
      });
    }
  }

  spawnTracer(start, end) {
    if (this.tracers.length >= 30) return;
    const t = this.tracerPool.acquire();
    t.material.opacity = 0.8;
    const dist = start.distanceTo(end);
    t.position.copy(start).lerp(end, 0.5);
    t.lookAt(end);
    t.rotateX(Math.PI / 2);
    t.scale.set(1, Math.min(dist, 15), 1);
    this.tracers.push({ mesh: t, life: 0.05 });
  }

  spawnShell(camera, playerVel) {
    if (this.shells.length >= CFG.maxShells) {
      const oldest = this.shells.shift();
      this.shellPool.release(oldest.mesh);
    }
    const sh = this.shellPool.acquire();
    sh.material.opacity = 1;

    _v1.set(0.05, -0.04, -0.15).applyQuaternion(camera.quaternion);
    sh.position.copy(camera.position).add(_v1);

    _v2.set(0.04 + Math.random() * 0.02, 0.02 + Math.random() * 0.02, 0.01 + Math.random() * 0.02)
      .applyQuaternion(camera.quaternion)
      .addScaledVector(playerVel, 0.01);

    this.shells.push({
      mesh: sh,
      vel: _v2.clone(),
      rotVel: new THREE.Vector3(
        (Math.random() - 0.5) * 40,
        (Math.random() - 0.5) * 40,
        (Math.random() - 0.5) * 40
      ),
      life: 2.5,
    });
  }

  update(dt) {
    // Impacts
    for (let i = this.impacts.length - 1; i >= 0; i--) {
      const imp = this.impacts[i];
      imp.life -= dt * (imp.isSpark ? 1.5 : 2.5);
      imp.vel.y -= dt * 0.05;
      imp.mesh.position.addScaledVector(imp.vel, dt * 60);

      if (imp.isSpark) {
        _v1.copy(imp.vel).normalize();
        imp.mesh.lookAt(
          imp.mesh.position.x + _v1.x,
          imp.mesh.position.y + _v1.y,
          imp.mesh.position.z + _v1.z
        );
        imp.mesh.scale.set(0.015, 0.015, imp.vel.length() * 0.015);
        imp.mesh.material.opacity = imp.life;
      } else {
        imp.mesh.rotation.x += imp.vel.y * 5;
        imp.mesh.rotation.y += imp.vel.x * 5;
        imp.mesh.scale.setScalar(Math.max(0, imp.life));
      }

      if (imp.life <= 0) {
        this.impactPool.release(imp.mesh);
        this.impacts.splice(i, 1);
      }
    }

    // Decals
    for (let i = this.decals.length - 1; i >= 0; i--) {
      const d = this.decals[i];
      d.life -= dt;
      if (d.life < 2.0) d.mesh.material.opacity = (d.life / 2.0) * 0.9;
      if (d.life <= 0) {
        this.decalPool.release(d.mesh);
        this.decals.splice(i, 1);
      }
    }

    // Shells
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const sh = this.shells[i];
      sh.life -= dt;
      sh.vel.y -= dt * 0.2;
      sh.mesh.position.addScaledVector(sh.vel, dt * 60);

      if (sh.mesh.position.y <= 0.02 && sh.vel.y < 0) {
        sh.mesh.position.y = 0.02;
        sh.vel.y *= -0.5;
        if (Math.abs(sh.vel.y) > 0.01) playShellBounce(sh.life / 2.5);
        sh.vel.x *= 0.6;
        sh.vel.z *= 0.6;
        sh.rotVel.multiplyScalar(0.5);
      }

      sh.mesh.rotation.x += sh.rotVel.x * dt;
      sh.mesh.rotation.y += sh.rotVel.y * dt;
      sh.mesh.rotation.z += sh.rotVel.z * dt;

      if (sh.life < 0.5) sh.mesh.material.opacity = Math.max(0, sh.life / 0.5);
      if (sh.life <= 0) {
        this.shellPool.release(sh.mesh);
        this.shells.splice(i, 1);
      }
    }

    // Tracers
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      if (t.life <= 0) {
        this.tracerPool.release(t.mesh);
        this.tracers.splice(i, 1);
      }
    }
  }
}
