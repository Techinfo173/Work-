import * as THREE from 'three';

export const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

export const CFG = {
  // World
  worldSize: 1000,
  gravity: 25,

  // Player
  playerSpeed: 7.0,
  sprintMultiplier: 1.35,
  adsSpeedMultiplier: 0.4,
  fireSpeedMultiplier: 0.5,
  playerRadius: 0.4,
  playerHeight: 2.2,
  jumpVelocity: 8.0,

  // Camera
  fovHip: 70,
  fovAds: 45,
  sensitivity: 0.0028,
  adsSensitivityMultiplier: 0.5,

  // Weapon
  fireRate: 0.09,
  magSize: 30,
  reserveStart: 120,
  reloadTime: 1.8,
  reloadAmmoTime: 1.0,

  // Default weapon transform (in UI camera local space)
  gunHipPos: new THREE.Vector3(0.26, -0.36, -0.25),
  gunHipRot: new THREE.Euler(0.02, 0.05, -0.05),
  gunAdsPos: new THREE.Vector3(0.0, -0.256, -0.15),
  gunAdsRot: new THREE.Euler(0, 0, 0),

  // Limits
  maxDecals: 60,
  maxImpactParticles: 200,
  maxShells: 40,
};
