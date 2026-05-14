/**
 * Tiny procedural SFX synth. No external audio files required.
 * All sounds are generated with WebAudio oscillators + noise buffers.
 */
let ctx = null;

function getCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
  }
  return ctx;
}

export function resumeAudio() {
  const c = getCtx();
  if (c.state === 'suspended') c.resume();
}

function noiseBuffer(duration) {
  const c = getCtx();
  const buf = c.createBuffer(1, c.sampleRate * duration, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

export function playGunshot() {
  const c = getCtx();
  if (c.state === 'suspended') return;
  const t = c.currentTime;

  // Low-frequency punch
  const osc = c.createOscillator();
  const oscGain = c.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(180, t);
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.1);
  oscGain.gain.setValueAtTime(1, t);
  oscGain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
  osc.connect(oscGain).connect(c.destination);
  osc.start(t);
  osc.stop(t + 0.15);

  // High-frequency noise crack
  const noise = c.createBufferSource();
  noise.buffer = noiseBuffer(0.2);
  const filter = c.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 800;
  const noiseGain = c.createGain();
  noiseGain.gain.setValueAtTime(0.7, t);
  noiseGain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);
  noise.connect(filter).connect(noiseGain).connect(c.destination);
  noise.start(t);
}

export function playClick() {
  const c = getCtx();
  if (c.state === 'suspended') return;
  const t = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(400, t);
  osc.frequency.exponentialRampToValueAtTime(100, t + 0.05);
  gain.gain.setValueAtTime(0.3, t);
  gain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);
  osc.connect(gain).connect(c.destination);
  osc.start(t);
  osc.stop(t + 0.05);
}

export function playSlide() {
  const c = getCtx();
  if (c.state === 'suspended') return;
  const t = c.currentTime;
  const noise = c.createBufferSource();
  noise.buffer = noiseBuffer(0.1);
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.2, t);
  gain.gain.exponentialRampToValueAtTime(0.01, t + 0.1);
  noise.connect(gain).connect(c.destination);
  noise.start(t);
}

export function playFootstep() {
  const c = getCtx();
  if (c.state === 'suspended') return;
  const t = c.currentTime;
  const noise = c.createBufferSource();
  noise.buffer = noiseBuffer(0.08);
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 300 + Math.random() * 200;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0.1, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  noise.connect(filter).connect(gain).connect(c.destination);
  noise.start(t);
}

export function playShellBounce(volume = 0.5) {
  const c = getCtx();
  if (c.state === 'suspended') return;
  const t = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(4000 + Math.random() * 1000, t);
  osc.frequency.exponentialRampToValueAtTime(800, t + 0.05);
  gain.gain.setValueAtTime(volume * 0.15, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
  osc.connect(gain).connect(c.destination);
  osc.start(t);
  osc.stop(t + 0.05);
}
