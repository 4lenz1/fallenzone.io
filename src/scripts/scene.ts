/**
 * CSS3D periodic table of projects.
 * Layout transitions adapted from the three.js css3d_periodictable example (MIT).
 */
import { PerspectiveCamera, Scene, Group, Object3D, Vector3, MathUtils } from 'three';
import { CSS3DRenderer, CSS3DObject } from 'three/addons/renderers/CSS3DRenderer.js';
import { TrackballControls } from 'three/addons/controls/TrackballControls.js';
import TWEEN from 'three/addons/libs/tween.module.js';
import type { Project } from '../data/projects';

const container = document.getElementById('scene');
const source = document.getElementById('elements');
if (!container || !source) throw new Error('scene mount points missing');

const projects: Project[] = JSON.parse(
  document.getElementById('projects-data')!.textContent!
);

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const DURATION = reducedMotion ? 0 : 1600;

/* ---------- scene ---------- */

const camera = new PerspectiveCamera(40, innerWidth / innerHeight, 1, 10000);
camera.position.z = defaultCameraZ();

const scene = new Scene();
const cloud = new Group();
scene.add(cloud);

const renderer = new CSS3DRenderer();
renderer.setSize(innerWidth, innerHeight);
container.appendChild(renderer.domElement);

const controls = new TrackballControls(camera, renderer.domElement);
controls.minDistance = 600;
controls.maxDistance = 7000;
controls.noPan = true;
controls.rotateSpeed = 0.9;

function defaultCameraZ() {
  // pull back further on narrow screens so the table fits
  return innerWidth < 768 ? 3400 : 2400;
}

/* ---------- objects ---------- */

const tiles = Array.from(source.querySelectorAll<HTMLButtonElement>('.element'));
const objects: CSS3DObject[] = [];

for (const tile of tiles) {
  const object = new CSS3DObject(tile);
  object.position.set(
    MathUtils.randFloatSpread(6000),
    MathUtils.randFloatSpread(6000),
    MathUtils.randFloatSpread(6000)
  );
  cloud.add(object);
  objects.push(object);
}
document.body.classList.add('is-3d');

/* ---------- layout targets ---------- */

type LayoutName = 'table' | 'sphere' | 'helix' | 'grid';
const targets: Record<LayoutName, Object3D[]> = { table: [], sphere: [], helix: [], grid: [] };

// the wide periodic layout does not fit portrait screens; fall back to 4 x 5
const compactTable = innerWidth < 768;

projects.forEach((p, i) => {
  // table: pseudo periodic layout from data
  const table = new Object3D();
  if (compactTable) {
    const compactRows = Math.ceil(projects.length / 4);
    table.position.set(
      (i % 4) * 150 - 225,
      -Math.floor(i / 4) * 190 + ((compactRows - 1) * 190) / 2,
      0
    );
  } else {
    table.position.set((p.col - 5.5) * 150, -(p.row - 2.5) * 190, 0);
  }
  targets.table.push(table);

  // sphere: even distribution
  const phi = Math.acos(-1 + (2 * i) / projects.length);
  const theta = Math.sqrt(projects.length * Math.PI) * phi;
  const sphere = new Object3D();
  sphere.position.setFromSphericalCoords(850, phi, theta);
  const sv = new Vector3().copy(sphere.position).multiplyScalar(2);
  sphere.lookAt(sv);
  targets.sphere.push(sphere);

  // helix: two turns
  const ht = i * 0.62 + 3;
  const helix = new Object3D();
  helix.position.setFromCylindricalCoords(900, ht, -(i * 42) + 400);
  const hv = new Vector3(helix.position.x * 2, helix.position.y, helix.position.z * 2);
  helix.lookAt(hv);
  targets.helix.push(helix);

  // grid: 5 x 3 x 2
  const grid = new Object3D();
  grid.position.set(
    (i % 5) * 380 - 760,
    -(Math.floor(i / 5) % 3) * 400 + 400,
    Math.floor(i / 15) * 900 - 450
  );
  targets.grid.push(grid);
});

/* ---------- transitions ---------- */

let currentLayout: LayoutName = 'table';

function transform(layoutTargets: Object3D[], duration: number) {
  TWEEN.removeAll();
  fadingElectrons.forEach(removeElectron);
  objects.forEach((object, i) => {
    const target = layoutTargets[i];
    new TWEEN.Tween(object.position)
      .to(
        { x: target.position.x, y: target.position.y, z: target.position.z },
        Math.random() * duration + duration
      )
      .easing(TWEEN.Easing.Exponential.InOut)
      .start();
    new TWEEN.Tween(object.rotation)
      .to(
        { x: target.rotation.x, y: target.rotation.y, z: target.rotation.z },
        Math.random() * duration + duration
      )
      .easing(TWEEN.Easing.Exponential.InOut)
      .start();
    new TWEEN.Tween(object.scale)
      .to({ x: 1, y: 1, z: 1 }, duration)
      .easing(TWEEN.Easing.Exponential.InOut)
      .start();
  });
}

function tweenCamera(z: number, duration: number) {
  new TWEEN.Tween(camera.position)
    .to({ x: 0, y: 0, z }, duration)
    .easing(TWEEN.Easing.Exponential.InOut)
    .start();
  new TWEEN.Tween(camera.up)
    .to({ x: 0, y: 1, z: 0 }, duration)
    .easing(TWEEN.Easing.Exponential.InOut)
    .start();
}

/* ---------- focus mode ---------- */

const panel = document.getElementById('panel')!;
const panelClose = document.getElementById('panel-close')!;
let focused: number | null = null;

/* tech-stack electrons: each stack item orbits the focused tile on one of
   two crossing rings, like electron shells around a nucleus */
interface Electron {
  object: CSS3DObject;
  ring: number;
  phase: number;
  spin: { progress: number };
}
let electrons: Electron[] = [];
let orbitClock = 0;

const RINGS = [
  { u: new Vector3(1, 0, 0), v: new Vector3(0, 0.9, 0.44), speed: 0.55 },
  { u: new Vector3(0, 1, 0), v: new Vector3(0.9, 0, 0.44), speed: -0.4 },
];

function orbitRadius(ring: number) {
  const base = innerWidth < 768 ? 220 : 300;
  return base + ring * (innerWidth < 768 ? 75 : 105);
}

function spawnElectrons(stack: string[]) {
  // hard-clean any chips whose exit tween got cancelled by a TWEEN.removeAll()
  fadingElectrons.forEach(removeElectron);
  const perRing = [0, 0];
  stack.forEach((_, i) => perRing[i % 2]++);
  const seen = [0, 0];
  electrons = stack.map((label, i) => {
    const el = document.createElement('span');
    el.className = 'electron';
    el.textContent = label;
    const object = new CSS3DObject(el);
    const ring = i % 2;
    const phase = (seen[ring]++ / perRing[ring]) * Math.PI * 2;
    object.scale.setScalar(0.01);
    scene.add(object);
    const spin = { progress: 0 };
    new TWEEN.Tween(spin)
      .to({ progress: 1 }, reducedMotion ? 0 : 700)
      .delay(reducedMotion ? 0 : 450 + i * 70)
      .easing(TWEEN.Easing.Back.Out)
      .start();
    return { object, ring, phase, spin };
  });
}

function updateElectrons() {
  if (focused === null || electrons.length === 0) return;
  const center = objects[focused].position;
  if (!reducedMotion) orbitClock += 0.016;
  for (const e of electrons) {
    const { u, v, speed } = RINGS[e.ring];
    const theta = orbitClock * speed + e.phase;
    const r = orbitRadius(e.ring) * e.spin.progress;
    e.object.position.set(
      center.x + (u.x * Math.cos(theta) + v.x * Math.sin(theta)) * r,
      center.y + (u.y * Math.cos(theta) + v.y * Math.sin(theta)) * r,
      center.z + (u.z * Math.cos(theta) + v.z * Math.sin(theta)) * r
    );
    e.object.scale.setScalar(Math.max(0.01, e.spin.progress * 1.5));
  }
}

const fadingElectrons = new Set<CSS3DObject>();

function removeElectron(object: CSS3DObject) {
  scene.remove(object);
  object.element.remove();
  fadingElectrons.delete(object);
}

/** Suck the chips back into the tile. Call AFTER any TWEEN.removeAll(). */
function despawnElectrons(center: Vector3) {
  for (const e of electrons) {
    fadingElectrons.add(e.object);
    new TWEEN.Tween(e.object.position)
      .to({ x: center.x, y: center.y, z: center.z }, reducedMotion ? 0 : 320)
      .easing(TWEEN.Easing.Quadratic.In)
      .start();
    new TWEEN.Tween(e.object.scale)
      .to({ x: 0.01, y: 0.01, z: 0.01 }, reducedMotion ? 0 : 320)
      .easing(TWEEN.Easing.Quadratic.In)
      .onComplete(() => removeElectron(e.object))
      .start();
  }
  electrons = [];
}

let closeTimer: number | undefined;

function openProject(index: number) {
  if (focused !== null) return;
  focused = index;
  window.clearTimeout(closeTimer);
  controls.enabled = false;
  TWEEN.removeAll();
  tweenCamera(defaultCameraZ(), DURATION * 0.6);

  const isMobile = innerWidth < 768;
  const selected = objects[index];
  selected.element.classList.add('is-focused');
  // lift the chosen tile out of the cloud so the shell can spin without it
  scene.add(selected);

  objects.forEach((object, i) => {
    if (i === index) return;
    object.element.classList.add('is-dimmed');
    // scatter the rest onto a wide shell around the origin
    const phi = Math.acos(-1 + (2 * i) / objects.length);
    const theta = Math.sqrt(objects.length * Math.PI) * phi;
    const pos = new Vector3().setFromSphericalCoords(1200, phi, theta);
    pos.z *= 0.45; // squash the shell so no tile drifts in front of the focused one
    new TWEEN.Tween(object.position)
      .to({ x: pos.x, y: pos.y, z: pos.z }, DURATION * 0.7)
      .easing(TWEEN.Easing.Exponential.InOut)
      .start();
    new TWEEN.Tween(object.rotation)
      .to({ x: 0, y: 0, z: 0 }, DURATION * 0.7)
      .easing(TWEEN.Easing.Exponential.InOut)
      .start();
    new TWEEN.Tween(object.scale)
      .to({ x: 0.7, y: 0.7, z: 0.7 }, DURATION * 0.7)
      .easing(TWEEN.Easing.Exponential.InOut)
      .start();
  });

  // fly the chosen tile in front of the camera
  const front = isMobile
    ? { x: 0, y: 350, z: defaultCameraZ() - 2400 }
    : { x: 280, y: 0, z: 900 };
  new TWEEN.Tween(selected.position)
    .to(front, DURATION * 0.75)
    .easing(TWEEN.Easing.Exponential.InOut)
    .start();
  new TWEEN.Tween(selected.rotation)
    .to({ x: 0, y: 0, z: 0 }, DURATION * 0.75)
    .easing(TWEEN.Easing.Exponential.InOut)
    .start();
  new TWEEN.Tween(selected.scale)
    .to({ x: 2.1, y: 2.1, z: 2.1 }, DURATION * 0.75)
    .easing(TWEEN.Easing.Exponential.InOut)
    .start();

  spawnElectrons(projects[index].stack);
  fillPanel(projects[index]);
  window.setTimeout(() => {
    panel.classList.add('is-open');
    panel.setAttribute('aria-hidden', 'false');
  }, reducedMotion ? 0 : DURATION * 0.45);
}

function closeProject() {
  if (focused === null) return;
  const selected = objects[focused];
  const exitCenter = selected.position.clone();
  selected.element.classList.remove('is-focused');
  objects.forEach((object) => object.element.classList.remove('is-dimmed'));
  focused = null;

  panel.classList.remove('is-open');
  panel.setAttribute('aria-hidden', 'true');

  // fold the tile back into the (possibly rotated) cloud without a jump
  cloud.rotation.y %= Math.PI * 2;
  selected.position.applyAxisAngle(AXIS_Y, -cloud.rotation.y);
  cloud.add(selected);
  new TWEEN.Tween(cloud.rotation)
    .to({ y: cloud.rotation.y > Math.PI ? Math.PI * 2 : 0 }, DURATION / 2)
    .easing(TWEEN.Easing.Exponential.InOut)
    .onComplete(() => cloud.rotation.set(0, 0, 0))
    .start();

  transform(targets[currentLayout], DURATION / 2);
  despawnElectrons(exitCenter);
  tweenCamera(defaultCameraZ(), DURATION * 0.6);
  // transform() staggers tiles up to a full DURATION; only accept input again
  // once every tile has settled, so taps cannot hit a tile mid-flight
  closeTimer = window.setTimeout(() => {
    controls.reset();
    controls.enabled = true;
  }, reducedMotion ? 0 : DURATION);
}

function fillPanel(p: Project) {
  (document.getElementById('panel-number')!).textContent = String(p.number).padStart(2, '0');
  (document.getElementById('panel-symbol')!).textContent = p.symbol;
  (document.getElementById('panel-title')!).textContent = p.name;
  (document.getElementById('panel-category')!).textContent = p.category;
  (document.getElementById('panel-year')!).textContent = p.year;
  (document.getElementById('panel-blurb')!).textContent = p.blurb;

  const tags = document.getElementById('panel-tags')!;
  tags.replaceChildren(
    ...p.tags.map((t) => {
      const li = document.createElement('li');
      li.textContent = t;
      return li;
    })
  );

  const link = document.getElementById('panel-link') as HTMLAnchorElement;
  if (p.url) {
    link.href = p.url;
    link.textContent = `Visit ${p.urlLabel ?? 'site'}`;
    link.classList.remove('is-hidden');
  } else {
    link.classList.add('is-hidden');
  }
}

/* ---------- wire up ---------- */

// TrackballControls captures the pointer on the renderer element, which eats
// click events on the tiles. Detect taps manually: pointerdown on a tile plus
// a pointerup nearby means "open", anything longer is an orbit drag.
let pressed: { index: number; x: number; y: number } | null = null;
tiles.forEach((tile, i) => {
  tile.addEventListener('pointerdown', (e) => {
    pressed = { index: i, x: e.clientX, y: e.clientY };
  });
  // keyboard activation still arrives as a plain click
  tile.addEventListener('click', (e) => {
    if (e.detail === 0 && controls.enabled) openProject(i);
  });
});
document.addEventListener('pointerup', (e) => {
  if (!pressed) return;
  const { index, x, y } = pressed;
  pressed = null;
  // while a focus/close animation runs (controls disabled), mid-flight tiles
  // can intercept taps meant for their neighbours; ignore clicks until settled
  if (!controls.enabled) return;
  if (Math.hypot(e.clientX - x, e.clientY - y) < 8) openProject(index);
});
panelClose.addEventListener('click', closeProject);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeProject();
});

document.querySelectorAll<HTMLButtonElement>('.view-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const layout = btn.dataset.layout as LayoutName;
    if (focused !== null) closeProject();
    currentLayout = layout;
    document
      .querySelectorAll('.view-btn')
      .forEach((b) => b.classList.toggle('is-active', b === btn));
    transform(targets[layout], DURATION);
  });
});

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

/* ---------- loop ---------- */

function animate() {
  requestAnimationFrame(animate);
  TWEEN.update();
  if (controls.enabled) controls.update();
  // slow drift of the dimmed shell while a project is open
  if (focused !== null && !reducedMotion) {
    cloud.rotation.y += 0.0016;
  }
  updateElectrons();
  renderer.render(scene, camera);
}

const AXIS_Y = new Vector3(0, 1, 0);

transform(targets.table, reducedMotion ? 0 : 2200);
animate();
