/**
 * Damped harmonic oscillator. Use addImpulse() for kicks, set target to drive.
 */
export class Spring {
  constructor(mass = 1, damping = 15, stiffness = 250) {
    this.val = 0;
    this.target = 0;
    this.vel = 0;
    this.m = mass;
    this.d = damping;
    this.s = stiffness;
  }

  update(dt) {
    const force = (this.target - this.val) * this.s - this.vel * this.d;
    this.vel += (force / this.m) * dt;
    this.val += this.vel * dt;
  }

  addImpulse(amt) {
    this.vel += amt;
  }

  reset() {
    this.val = 0;
    this.vel = 0;
    this.target = 0;
  }
}
