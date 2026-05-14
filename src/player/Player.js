import * as THREE from 'three';
import { Capsule } from 'three/addons/math/Capsule.js';
import { CFG } from '../config.js';
import { Spring } from '../utils/Spring.js';
import { playFootstep } from '../audio/sfx.js';

const _q = new THREE.Quaternion();
const _fwd = new THREE.Vector3();
const _right = new THREE.Vector3();
const _move = new THREE.Vector3();
const _down = new THREE.Vector3(0, -1, 0);
const _rayOrigin = new THREE.Vector3();
const _triNormal = new THREE.Vector3();
const _triPoint = new THREE.Vector3();
const _capPoint = new THREE.Vector3();
const _capLine = new THREE.Line3();
const _floorRay = new THREE.Raycaster();
_floorRay.firstHitOnly = true;
// Single capsule reused across frames
const _capsule = new Capsule(new THREE.Vector3(), new THREE.Vector3(), 0.3);

const FLOOR_SAMPLES = [
  { x: 0, z: 0 },
  { x: CFG.playerRadius * 0.7, z: 0 },
  { x: -CFG.playerRadius * 0.7, z: 0 },
  { x: 0, z: CFG.playerRadius * 0.7 },
  { x: 0, z: -CFG.playerRadius * 0.7 },
];

/**
 * First-person player controller with capsule sliding collision against world BVH.
 */
export class Player {
  constructor(camera) {
    this.camera = camera;
    this.position = new THREE.Vector3(0, CFG.playerHeight, 0);
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.isGrounded = true;
    this.walkPhase = 0;

    // Camera springs (recoil etc.) live on the weapon; player only owns shake.
    this.shake = new Spring(1, 35, 600);

    // Sway (driven by look input, decays)
    this.swayX = 0;
    this.swayY = 0;

    // Strafe tilt
    this.tilt = 0;

    // Sprinting / firing flags set externally
    this.isSprinting = false;
    this.isAds = false;
    this.isFiring = false;
    this.isReloading = false;
  }

  applyLook(dx, dy, sens = CFG.sensitivity) {
    if (this.isAds) sens *= CFG.adsSensitivityMultiplier;
    this.yaw -= dx * sens;
    this.pitch -= dy * sens;
    this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch));

    // Sway impulse from look
    this.swayX -= dx * 0.0012;
    this.swayY += dy * 0.0012;
  }

  jump() {
    if (this.isGrounded && !this.isReloading) {
      this.velocity.y = CFG.jumpVelocity;
      this.isGrounded = false;
      playFootstep();
      return true;
    }
    return false;
  }

  /**
   * @param {Object} input  { moveX, moveY }  -- normalized -1..1
   * @param {World} world
   * @param {number} dt
   */
  update(input, world, dt) {
    // Compute movement direction in yaw-aligned space
    _q.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    _fwd.set(0, 0, -1).applyQuaternion(_q); _fwd.y = 0; _fwd.normalize();
    _right.set(1, 0, 0).applyQuaternion(_q); _right.y = 0; _right.normalize();

    _move.set(0, 0, 0)
      .addScaledVector(_fwd, -input.moveY)
      .addScaledVector(_right, input.moveX);

    if (_move.lengthSq() > 0) _move.normalize();

    // Speed modifiers
    let speed = CFG.playerSpeed;
    if (this.isAds) speed *= CFG.adsSpeedMultiplier;
    if (this.isFiring && !this.isReloading) speed *= CFG.fireSpeedMultiplier;
    if (this.isSprinting) speed *= CFG.sprintMultiplier;

    // Smooth horizontal velocity
    this.velocity.x += (_move.x * speed - this.velocity.x) * 10 * dt;
    this.velocity.z += (_move.z * speed - this.velocity.z) * 10 * dt;

    // Apply XZ movement
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;

    // Slide against walls using BVH capsule
    if (world.bvhMesh && world.bvhMesh.geometry.boundsTree) {
      this._slideCapsule(world.bvhMesh.geometry.boundsTree);
    }

    // Ground sampling
    const targetFloorY = this._sampleFloor(world);

    // Vertical physics
    if (!this.isGrounded) {
      this.velocity.y -= CFG.gravity * dt;
      this.position.y += this.velocity.y * dt;

      if (this.position.y <= targetFloorY) {
        const fallSpeed = Math.abs(this.velocity.y);
        this.position.y = targetFloorY;
        this.velocity.y = 0;
        this.isGrounded = true;
        this.shake.addImpulse(Math.min(2.0, fallSpeed * 0.15));
        playFootstep();
      }
    } else {
      if (this.position.y > targetFloorY + 0.5) {
        this.isGrounded = false;
      } else {
        this.position.y += (targetFloorY - this.position.y) * 15 * dt;
        this.velocity.y = 0;
      }
    }

    // Safety respawn
    if (this.position.y < -50) {
      this.position.set(0, CFG.playerHeight, 0);
      this.velocity.set(0, 0, 0);
    }

    // Walk phase + footsteps
    const speed2D = Math.hypot(this.velocity.x, this.velocity.z);
    if (speed2D > 0.1 && this.isGrounded) {
      const prev = this.walkPhase;
      const phaseSpeed = this.isSprinting ? speed2D * 0.8 : speed2D * 1.2;
      this.walkPhase += dt * phaseSpeed;
      if (Math.sin(prev) * Math.sin(this.walkPhase) <= 0) playFootstep();
    } else {
      this.walkPhase = THREE.MathUtils.lerp(this.walkPhase, 0, dt * 10);
    }

    // Sway decay
    this.swayX = THREE.MathUtils.lerp(this.swayX, 0, dt * 7);
    this.swayY = THREE.MathUtils.lerp(this.swayY, 0, dt * 7);
    this.swayX = THREE.MathUtils.clamp(this.swayX, -0.05, 0.05);
    this.swayY = THREE.MathUtils.clamp(this.swayY, -0.05, 0.05);

    // Strafe roll
    const localVx = this.velocity.x * Math.cos(-this.yaw) - this.velocity.z * Math.sin(-this.yaw);
    this.tilt = THREE.MathUtils.lerp(this.tilt, localVx * -0.012, dt * 5);

    // Shake spring
    this.shake.update(dt);

    // Drive camera
    this._applyCamera(speed2D);
  }

  _sampleFloor(world) {
    if (!world.collisionMeshes || world.collisionMeshes.length === 0) {
      return CFG.playerHeight;
    }
    let best = -1000;
    let hit = false;
    for (const s of FLOOR_SAMPLES) {
      _rayOrigin.set(this.position.x + s.x, this.position.y + 1.0, this.position.z + s.z);
      _floorRay.set(_rayOrigin, _down);
      _floorRay.far = 50.0;
      const hits = _floorRay.intersectObjects(world.collisionMeshes, false);
      for (const h of hits) {
        if (h.face && h.face.normal.y > 0.7) {
          const y = h.point.y + CFG.playerHeight;
          if (y - this.position.y < 0.4 && y > best) {
            best = y;
            hit = true;
          }
          break;
        }
      }
    }
    return hit ? best : -1000;
  }

  _slideCapsule(bvh) {
    const r = CFG.playerRadius * 0.75;
    const h = CFG.playerHeight;
    const yOff = 0.2;
    _capsule.radius = r;
    _capsule.start.set(this.position.x, this.position.y - h + r + yOff, this.position.z);
    _capsule.end.set(this.position.x, this.position.y - r, this.position.z);

    for (let iter = 0; iter < 3; iter++) {
      _capLine.start.copy(_capsule.start);
      _capLine.end.copy(_capsule.end);
      bvh.shapecast({
        intersectsBounds: (box) => _capsule.intersectsBox(box),
        intersectsTriangle: (tri) => {
          tri.getNormal(_triNormal);
          if (Math.abs(_triNormal.y) > 0.7) return false; // skip floor/ceiling
          const dist = tri.closestPointToSegment(_capLine, _triPoint, _capPoint);
          if (dist < _capsule.radius) {
            const depth = _capsule.radius - dist;
            const dir = _capPoint.sub(_triPoint);
            dir.y = 0;
            if (dir.lengthSq() > 0) {
              dir.normalize();
              _capsule.translate(dir.multiplyScalar(depth));
            }
          }
        },
      });
    }
    this.position.x = _capsule.start.x;
    this.position.z = _capsule.start.z;
  }

  _applyCamera(speed2D) {
    const cam = this.camera;
    cam.position.copy(this.position);

    // Bob
    if (speed2D > 0.1 && this.isGrounded) {
      cam.position.y += Math.abs(Math.sin(this.walkPhase)) * 0.06;
      cam.position.x += Math.cos(this.walkPhase * 0.5) * 0.03;
    }

    // Shake
    const s = this.shake.val;
    if (s > 0.01) {
      cam.position.x += (Math.random() - 0.5) * s * 0.05;
      cam.position.y += (Math.random() - 0.5) * s * 0.05;
      cam.position.z += (Math.random() - 0.5) * s * 0.05;
    }

    cam.rotation.set(this.pitch, this.yaw, this.tilt, 'YXZ');
  }
}
