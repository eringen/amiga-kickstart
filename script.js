/* global Zdog */
'use strict';

const canvas = document.querySelector('#scene');
const context = canvas.getContext('2d');
const bootScreen = document.querySelector('.boot-screen');
const replayButton = document.querySelector('.status');
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
const LOOP_MS = 4200;
const FRAME_MS = 1000 / 25;
const SLOT_Y = 175;
let elapsed = 0;
let lastTime = null;
let lastFrame = -Infinity;
let frameRequest = null;
const sceneTilt = { x: 0, y: 0, targetX: 0, targetY: 0 };

function followPointer(event) {
  if (motionPreference.matches || event.pointerType !== 'mouse') return;
  // Use the viewport so the transformed scene cannot affect pointer mapping.
  const x = Math.max(-1, Math.min(1, event.clientX / window.innerWidth * 2 - 1));
  const y = Math.max(-1, Math.min(1, event.clientY / window.innerHeight * 2 - 1));
  sceneTilt.targetX = -y * 10;
  sceneTilt.targetY = x * 10;
}

function centerScene(immediate = false) {
  sceneTilt.targetX = 0;
  sceneTilt.targetY = 0;
  if (immediate) {
    sceneTilt.x = 0;
    sceneTilt.y = 0;
    bootScreen.style.setProperty('--tilt-x', '0deg');
    bootScreen.style.setProperty('--tilt-y', '0deg');
  }
}

function updateSceneTilt(delta) {
  const easing = 1 - Math.exp(-delta / 140);
  for (const axis of ['x', 'y']) {
    const target = axis === 'x' ? sceneTilt.targetX : sceneTilt.targetY;
    sceneTilt[axis] += (target - sceneTilt[axis]) * easing;
    if (Math.abs(target - sceneTilt[axis]) < 0.001) sceneTilt[axis] = target;
    bootScreen.style.setProperty(`--tilt-${axis}`, `${sceneTilt[axis].toFixed(3)}deg`);
  }
}

// Render Zdog models into a fixed-resolution canvas; no Dragger is installed.
const floppy = new Zdog.Anchor({ translate: { x: 519, y: 275 } });
// Keep the pivot at the disk's center and the face details in painting order.
const floppyFace = new Zdog.Group({
  addTo: floppy,
  translate: { x: -519, y: -275 },
});
const drive = new Zdog.Anchor();

function polygon(parent, points, color) {
  return new Zdog.Shape({
    addTo: parent, path: points.map(([x, y]) => ({ x, y })),
    stroke: false, fill: true, color,
  });
}

function rectangle(parent, x, y, width, height, color) {
  return new Zdog.Rect({
    addTo: parent, width, height,
    translate: { x: x + width / 2, y: y + height / 2 },
    stroke: false, fill: true, color,
  });
}

// Disk and drive are separate models: only the disk moves.
polygon(floppyFace, [[452, 223], [460, 215], [578, 215], [586, 223],
[586, 335], [452, 335]], '#26388e');
rectangle(floppyFace, 456, 222, 7, 108, '#203078');
rectangle(floppyFace, 486, 215, 70, 41, '#a1947e');
rectangle(floppyFace, 527, 223, 14, 30, '#273487');
rectangle(floppyFace, 466, 267, 108, 68, '#151f62');
polygon(floppyFace, [[470, 270], [570, 270], [572, 273], [572, 335],
[468, 335], [468, 273]], '#fff');
rectangle(floppyFace, 456, 325, 6, 4, '#14265e');
polygon(floppyFace, [[455, 226], [460, 220], [465, 226]], '#132966');
rectangle(floppyFace, 459, 225, 2, 7, '#132966');

rectangle(drive, 442, 165, 156, 38, '#efab87');
rectangle(drive, 450, 171, 140, 8, '#24170d');
rectangle(drive, 467, 193, 8, 2, '#24170d');
rectangle(drive, 560, 187, 25, 2, '#b8795e');
rectangle(drive, 560, 189, 1, 6, '#b8795e');
rectangle(drive, 584, 189, 1, 6, '#b8795e');

// Rotate around X and rise into the slot together, with no intermediate stop.
// Timing is an approximation from the supplied still, not measured video frames.
function smoothStep(value) {
  const progress = Math.max(0, Math.min(1, value));
  return progress * progress * (3 - 2 * progress);
}

function diskPose(time) {
  const phase = time % LOOP_MS;
  const progress = smoothStep((phase - 1600) / 1400);
  return {
    y: 275 - 104 * progress,
    // Stop just short of 90 degrees so the flat model's edge stays visible.
    rotateX: (88 * Math.PI / 180) * progress,
  };
}

function paint(time) {
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.translate(26, 64);
  context.scale(0.91, 0.91);
  drive.renderGraphCanvas(context);

  context.save();
  context.beginPath();
  context.rect(0, SLOT_Y, 640, 400);
  context.clip();
  const pose = diskPose(time);
  floppy.translate.y = pose.y;
  floppy.rotate.x = pose.rotateX;
  floppy.updateGraph();
  floppy.renderGraphCanvas(context);
  context.restore();

  context.restore();
}

function tick(time) {
  frameRequest = null;
  const delta = lastTime === null ? 0 : time - lastTime;
  elapsed += delta;
  lastTime = time;
  updateSceneTilt(Math.min(delta, 64));
  if (time - lastFrame >= FRAME_MS) {
    paint(elapsed);
    lastFrame = time;
  }
  frameRequest = requestAnimationFrame(tick);
}

function synchronizePlayback() {
  if (frameRequest !== null) cancelAnimationFrame(frameRequest);
  frameRequest = null;
  lastTime = null;
  lastFrame = -Infinity;
  if (motionPreference.matches || document.hidden) centerScene(true);
  if (motionPreference.matches) {
    elapsed = 0;
    paint(0);
  } else if (!document.hidden) {
    frameRequest = requestAnimationFrame(tick);
  }
}

replayButton.addEventListener('click', () => {
  elapsed = 0;
  paint(0);
  synchronizePlayback();
});
motionPreference.addEventListener('change', synchronizePlayback);
document.addEventListener('visibilitychange', synchronizePlayback);
window.addEventListener('pointermove', followPointer, { passive: true });
document.documentElement.addEventListener('pointerleave', () => centerScene());
window.addEventListener('blur', () => centerScene());
window.addEventListener('resize', () => centerScene());

drive.updateGraph();
paint(0);
synchronizePlayback();
