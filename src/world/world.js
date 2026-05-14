import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast, MeshBVH } from 'three-mesh-bvh';
import { TEX } from './textures.js';
import { CFG, isMobile } from '../config.js';

// Wire BVH to three.js
THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

/**
 * The world scene. Owns the map, lights, sky, BVH for collision.
 */
export class World {
  constructor() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xcccccc);
    this.scene.fog = new THREE.FogExp2(0xcccccc, 0.0008);

    this.raycastTargets = [];          // meshes the player bullets can hit
    this.collisionMeshes = [];         // for raycast floor probing
    this.bvhMesh = null;               // merged BVH for capsule sliding
    this.targets = [];                 // knockdown targets
    this.muzzleLight = null;
    this._setupLights();
  }

  _setupLights() {
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x888888, 0.8));

    const dir = new THREE.DirectionalLight(0xfff9f0, 2.5);
    dir.position.set(50, 80, 50);
    dir.castShadow = true;
    dir.shadow.mapSize.width = isMobile ? 512 : 2048;
    dir.shadow.mapSize.height = isMobile ? 512 : 2048;
    dir.shadow.camera.left = -60;
    dir.shadow.camera.right = 60;
    dir.shadow.camera.top = 60;
    dir.shadow.camera.bottom = -60;
    dir.shadow.camera.far = 150;
    dir.shadow.bias = isMobile ? -0.005 : -0.001;
    this.scene.add(dir);

    this.muzzleLight = new THREE.PointLight(0xffaa44, 0, 8);
    this.scene.add(this.muzzleLight);
  }

  async loadSky(url) {
    return new Promise((resolve, reject) => {
      const loader = new THREE.TextureLoader();
      loader.setCrossOrigin('anonymous');
      loader.load(url, (tex) => {
        tex.mapping = THREE.EquirectangularReflectionMapping;
        tex.colorSpace = THREE.SRGBColorSpace;
        this.scene.background = tex;
        resolve(tex);
      }, undefined, reject);
    });
  }

  async loadCustomMap(url) {
    return new Promise((resolve, reject) => {
      const loader = new GLTFLoader();
      loader.load(url, (gltf) => {
        const model = gltf.scene;
        model.updateMatrixWorld(true);

        const colliderGeoms = [];
        model.traverse((child) => {
          if (!child.isMesh) return;
          child.castShadow = true;
          child.receiveShadow = true;
          this.raycastTargets.push(child);
          this.collisionMeshes.push(child);

          // Collect transformed positions for merged BVH
          if (child.geometry) {
            const g = child.geometry.clone();
            g.applyMatrix4(child.matrixWorld);
            for (const k in g.attributes) {
              if (k !== 'position') g.deleteAttribute(k);
            }
            colliderGeoms.push(g);
          }
        });

        if (colliderGeoms.length > 0) {
          try {
            const merged = BufferGeometryUtils.mergeGeometries(colliderGeoms, false);
            if (merged) {
              merged.boundsTree = new MeshBVH(merged);
              this.bvhMesh = new THREE.Mesh(merged, new THREE.MeshBasicMaterial());
            }
          } catch (e) {
            console.warn('BVH merge failed; using per-mesh raycasts only.', e);
          }
        }

        this.scene.add(model);
        resolve(model);
      }, undefined, reject);
    });
  }

  buildDefaultMap() {
    // Floor
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ map: TEX.grid, roughness: 0.9, metalness: 0.05 }),
    );
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.collisionMeshes.push(floor);
    this.raycastTargets.push(floor);

    const blockMat = new THREE.MeshStandardMaterial({ map: TEX.sandbag, color: 0x9999aa, roughness: 0.85 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.9 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.8, roughness: 0.2 });
    const faceMat = new THREE.MeshStandardMaterial({ color: 0xff3333, roughness: 0.5 });

    const addBlock = (w, h, d, x, z, rotY = 0) => {
      const geom = new THREE.BoxGeometry(w, h, d);
      geom.translate(0, h / 2, 0);
      const mesh = new THREE.Mesh(geom, blockMat);
      mesh.position.set(x, 0, z);
      mesh.rotation.y = rotY;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.collisionMeshes.push(mesh);
      this.raycastTargets.push(mesh);
    };

    const addTarget = (x, z, rotY = 0) => {
      const grp = new THREE.Group();
      grp.position.set(x, 0, z);
      grp.rotation.y = rotY;

      const post = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.5, 0.2), woodMat);
      post.position.y = 0.75;
      post.castShadow = true;
      grp.add(post);

      const pivot = new THREE.Group();
      pivot.position.y = 1.4;
      grp.add(pivot);

      const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 0.1), metalMat);
      body.position.y = 0.6;
      body.castShadow = true;
      pivot.add(body);

      const face = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.12), faceMat);
      face.position.y = 0.6;
      pivot.add(face);

      this.scene.add(grp);
      this.raycastTargets.push(body, face, post);
      this.targets.push({
        pos: new THREE.Vector3(x, 2.0, z),
        pivot,
        isDown: false,
        resetTimer: 0,
      });
    };

    // Cover
    addBlock(4, 2, 1, 0, -10);
    addBlock(1, 2, 4, -4, -12);
    addBlock(1, 2, 4, 4, -12);

    // Targets
    addTarget(2, -14);
    addTarget(-2, -14);
    addTarget(0, -28);
    addTarget(-8, -23, Math.PI / 4);
    addTarget(8, -23, -Math.PI / 4);

    // Backstops
    addBlock(10, 4, 1, 0, -30);
    addBlock(4, 4, 1, -12, -25, Math.PI / 4);
    addBlock(4, 4, 1, 12, -25, -Math.PI / 4);

    // Random scatter
    for (let i = 0; i < 25; i++) {
      const w = 1 + Math.random() * 3;
      const h = 1 + Math.random() * 2;
      const d = 1 + Math.random() * 3;
      const x = (Math.random() - 0.5) * 70;
      const z = (Math.random() - 0.5) * 70;
      if (Math.abs(x) < 5 && Math.abs(z) < 5) continue;
      addBlock(w, h, d, x, z, Math.random() * Math.PI);
    }

    // Build merged BVH for capsule collision
    this._buildBVHFromCollisionMeshes();
  }

  _buildBVHFromCollisionMeshes() {
    const geoms = [];
    for (const m of this.collisionMeshes) {
      if (!m.geometry) continue;
      m.updateMatrixWorld(true);
      const g = m.geometry.clone();
      g.applyMatrix4(m.matrixWorld);
      for (const k in g.attributes) {
        if (k !== 'position') g.deleteAttribute(k);
      }
      geoms.push(g);
    }
    if (geoms.length === 0) return;
    try {
      const merged = BufferGeometryUtils.mergeGeometries(geoms, false);
      if (merged) {
        merged.boundsTree = new MeshBVH(merged);
        this.bvhMesh = new THREE.Mesh(merged, new THREE.MeshBasicMaterial());
      }
    } catch (e) {
      console.warn('Default map BVH merge failed.', e);
    }
  }

  updateTargets(dt) {
    for (const t of this.targets) {
      const target = t.isDown ? -Math.PI / 2.2 : 0;
      t.pivot.rotation.x = THREE.MathUtils.lerp(t.pivot.rotation.x, target, dt * 10);
      if (t.isDown) {
        t.resetTimer -= dt;
        if (t.resetTimer <= 0) t.isDown = false;
      }
    }
  }

  /**
   * Returns the target hit at point, or null.
   */
  hitTargetAt(point) {
    for (const t of this.targets) {
      if (!t.isDown && point.distanceTo(t.pos) < 1.5) return t;
    }
    return null;
  }
}
