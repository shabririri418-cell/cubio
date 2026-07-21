import * as THREE from 'three';
import Cube from 'cubejs';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  createIcons,
  Lightbulb,
  Minus,
  MousePointer2,
  PackageOpen,
  Plus,
  RotateCcw,
  RotateCw,
  Shuffle,
  Volume2,
  VolumeX,
  Wrench,
} from 'lucide';
import './style.css';

const stage = document.querySelector('#stage');
const appEl = document.querySelector('#app');
const moveCountEl = document.querySelector('#move-count');
const timerEl = document.querySelector('#timer');
const statusEl = document.querySelector('#status');
const statusTextEl = document.querySelector('#status-text');
const scrambleButton = document.querySelector('#scramble');
const resetButton = document.querySelector('#reset');
const soundButton = document.querySelector('#sound-toggle');
const hintButton = document.querySelector('#hint-toggle');
const hintPanel = document.querySelector('#hint-panel');
const hintNotationEl = document.querySelector('#hint-notation');
const hintInstructionEl = document.querySelector('#hint-instruction');
const hintDetailEl = document.querySelector('#hint-detail');
const hintDirectionIcon = document.querySelector('#hint-direction-icon');
const stepsDownButton = document.querySelector('#steps-down');
const stepsUpButton = document.querySelector('#steps-up');
const scrambleStepsEl = document.querySelector('#scramble-steps');
const gestureCue = document.querySelector('#gesture-cue');
const confettiEl = document.querySelector('#confetti');
const breakPanel = document.querySelector('#break-panel');
const rebuildButton = document.querySelector('#rebuild');

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const GRID = 1.04;
const CUBE_SIZE = GRID * 3;
const AXES = ['x', 'y', 'z'];
const logicalCube = new Cube();
const SOLVED_STATE = logicalCube.asString();

const solverWorker = new Worker(new URL('./solver.worker.js', import.meta.url), { type: 'module' });
let solverReady = false;
let solverReadyResolve;
let solveRequestId = 0;
const pendingSolves = new Map();
const solverReadyPromise = new Promise((resolve) => {
  solverReadyResolve = resolve;
});

solverWorker.addEventListener('message', (event) => {
  const { type, id, solution, upright, error } = event.data;
  if (type === 'ready') {
    solverReady = true;
    appEl.dataset.solverReady = 'true';
    solverReadyResolve();
    return;
  }
  if (type === 'solution' && pendingSolves.has(id)) {
    const { resolve, reject } = pendingSolves.get(id);
    pendingSolves.delete(id);
    if (error) reject(new Error(error));
    else resolve({ solution, upright });
  }
});

function requestSolution() {
  return new Promise((resolve, reject) => {
    const id = ++solveRequestId;
    pendingSolves.set(id, { resolve, reject });
    solverWorker.postMessage({ type: 'solve', id, state: logicalCube.toJSON() });
  });
}

const ICONS = { Lightbulb, Minus, MousePointer2, PackageOpen, Plus, RotateCcw, RotateCw, Shuffle, Volume2, VolumeX, Wrench };
createIcons({ icons: ICONS });

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xe8edf1, 10, 22);

const camera = new THREE.PerspectiveCamera(34, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(6.7, 5.6, 7.4);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.075;
controls.enablePan = false;
controls.minDistance = 7.3;
controls.maxDistance = 13;
controls.minPolarAngle = Math.PI * 0.12;
controls.maxPolarAngle = Math.PI * 0.88;
controls.target.set(0, 0.05, 0);

function fitCameraToViewport() {
  const aspect = window.innerWidth / window.innerHeight;
  const direction = camera.position.clone().sub(controls.target).normalize();
  const distance = aspect < 0.62 ? 15.2 : aspect < 0.9 ? 13.1 : 11.45;
  camera.fov = aspect < 0.62 ? 37 : 34;
  camera.position.copy(controls.target).addScaledVector(direction, distance);
  controls.minDistance = aspect < 0.62 ? 12.6 : 7.3;
  controls.maxDistance = aspect < 0.62 ? 19 : 13;
  camera.updateProjectionMatrix();
  controls.update();
}

fitCameraToViewport();

scene.add(new THREE.HemisphereLight(0xffffff, 0xaab8c2, 2.6));

const keyLight = new THREE.DirectionalLight(0xffffff, 5.3);
keyLight.position.set(4.5, 8, 6);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
keyLight.shadow.camera.left = -6;
keyLight.shadow.camera.right = 6;
keyLight.shadow.camera.top = 6;
keyLight.shadow.camera.bottom = -6;
scene.add(keyLight);

const rimLight = new THREE.DirectionalLight(0xffb09f, 2.2);
rimLight.position.set(-6, 2, -5);
scene.add(rimLight);

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(4.8, 64),
  new THREE.ShadowMaterial({ color: 0x25313c, opacity: 0.18, transparent: true })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -2.02;
floor.receiveShadow = true;
scene.add(floor);

const cubeRoot = new THREE.Group();
cubeRoot.rotation.set(-0.08, 0.16, -0.025);
scene.add(cubeRoot);

const hintGuide = new THREE.Group();
const hintSpinner = new THREE.Group();
const hintTrackGroup = new THREE.Group();
const hintArrowGroup = new THREE.Group();
const hintTrackBaseMaterial = new THREE.MeshBasicMaterial({
  color: 0xf5c842,
  transparent: true,
  opacity: 0.28,
  depthTest: true,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const hintTrackYellowMaterial = new THREE.MeshBasicMaterial({
  color: 0xf5c842,
  transparent: true,
  opacity: 0.96,
  depthTest: true,
  depthWrite: false,
});
const hintTrackInkMaterial = new THREE.MeshBasicMaterial({
  color: 0x101820,
  transparent: true,
  opacity: 0.88,
  depthTest: true,
  depthWrite: false,
});
const hintSliceMaterial = new THREE.MeshBasicMaterial({
  color: 0xf5c842,
  transparent: true,
  opacity: 0.1,
  depthTest: true,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const hintArrowMaterial = new THREE.MeshBasicMaterial({
  color: 0xff5746,
  transparent: true,
  opacity: 1,
  depthTest: true,
  depthWrite: false,
});
const hintArrowGeometry = new THREE.ConeGeometry(0.135, 0.34, 3);
const hintSegmentGeometry = new RoundedBoxGeometry(0.34, 0.09, 0.045, 2, 0.035);
const hintTrackBase = new THREE.Mesh(new THREE.TorusGeometry(1.77, 0.048, 10, 112), hintTrackBaseMaterial);
const hintSlicePlane = new THREE.Mesh(new THREE.PlaneGeometry(CUBE_SIZE + 0.12, CUBE_SIZE + 0.12), hintSliceMaterial);
hintTrackBase.renderOrder = 19;
hintSlicePlane.renderOrder = 18;

for (let i = 0; i < 16; i += 1) {
  const angle = (Math.PI * 2 * i) / 16;
  const segment = new THREE.Mesh(
    hintSegmentGeometry,
    i % 4 === 3 ? hintTrackInkMaterial : hintTrackYellowMaterial
  );
  segment.position.set(Math.cos(angle) * 1.77, Math.sin(angle) * 1.77, 0);
  segment.rotation.z = angle + Math.PI / 2;
  segment.renderOrder = 20;
  hintTrackGroup.add(segment);
}

hintSpinner.add(hintTrackBase, hintTrackGroup, hintArrowGroup);
hintGuide.add(hintSlicePlane, hintSpinner);
hintGuide.visible = false;
cubeRoot.add(hintGuide);

const bodyGeometry = new RoundedBoxGeometry(0.96, 0.96, 0.96, 4, 0.105);
const stickerGeometry = new RoundedBoxGeometry(0.755, 0.755, 0.035, 3, 0.075);
const bodyMaterial = new THREE.MeshStandardMaterial({
  color: 0x111820,
  roughness: 0.42,
  metalness: 0.03,
});

const stickerMaterials = {
  right: new THREE.MeshStandardMaterial({ color: 0xe84036, roughness: 0.3 }),
  left: new THREE.MeshStandardMaterial({ color: 0xff7a28, roughness: 0.3 }),
  top: new THREE.MeshStandardMaterial({ color: 0xf7f8f5, roughness: 0.25 }),
  bottom: new THREE.MeshStandardMaterial({ color: 0xf5cc35, roughness: 0.3 }),
  front: new THREE.MeshStandardMaterial({ color: 0x23ae65, roughness: 0.3 }),
  back: new THREE.MeshStandardMaterial({ color: 0x2f67d9, roughness: 0.3 }),
};

const cubies = [];
const cubieBodies = [];

function addSticker(cubie, face, material) {
  const sticker = new THREE.Mesh(stickerGeometry, material);
  const offset = 0.496;

  if (face === 'right') {
    sticker.position.x = offset;
    sticker.rotation.y = Math.PI / 2;
  } else if (face === 'left') {
    sticker.position.x = -offset;
    sticker.rotation.y = -Math.PI / 2;
  } else if (face === 'top') {
    sticker.position.y = offset;
    sticker.rotation.x = -Math.PI / 2;
  } else if (face === 'bottom') {
    sticker.position.y = -offset;
    sticker.rotation.x = Math.PI / 2;
  } else if (face === 'front') {
    sticker.position.z = offset;
  } else {
    sticker.position.z = -offset;
    sticker.rotation.y = Math.PI;
  }

  sticker.castShadow = true;
  sticker.userData.isSticker = true;
  cubie.add(sticker);
}

function createCubie(x, y, z) {
  const cubie = new THREE.Group();
  cubie.position.set(x * GRID, y * GRID, z * GRID);
  cubie.userData.coord = new THREE.Vector3(x, y, z);
  cubie.userData.homeCoord = new THREE.Vector3(x, y, z);

  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.castShadow = true;
  body.receiveShadow = true;
  body.userData.cubie = cubie;
  cubie.add(body);
  cubieBodies.push(body);

  if (x === 1) addSticker(cubie, 'right', stickerMaterials.right);
  if (x === -1) addSticker(cubie, 'left', stickerMaterials.left);
  if (y === 1) addSticker(cubie, 'top', stickerMaterials.top);
  if (y === -1) addSticker(cubie, 'bottom', stickerMaterials.bottom);
  if (z === 1) addSticker(cubie, 'front', stickerMaterials.front);
  if (z === -1) addSticker(cubie, 'back', stickerMaterials.back);

  cubeRoot.add(cubie);
  cubies.push(cubie);
}

for (let x = -1; x <= 1; x += 1) {
  for (let y = -1; y <= 1; y += 1) {
    for (let z = -1; z <= 1; z += 1) createCubie(x, y, z);
  }
}

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const dragPlane = new THREE.Plane();
let cubeGesture = null;
let turnInProgress = false;
let autoMode = false;
let scrambleSteps = 18;
let soundEnabled = true;
let audioContext = null;
let musicMasterGain = null;
let musicTimer = null;
let musicNextStepTime = 0;
let musicStep = 0;
let noiseBuffer = null;
let history = [];
let moveCount = 0;
let timerStart = null;
let timerElapsed = 0;
let timerRunning = false;
let hasInteracted = false;
let manualInputLockedUntil = 0;
let hintEnabled = window.localStorage.getItem('cubio-hints') === 'on';
let hintGeneration = 0;
let hintTimer = null;
let currentHintMove = null;
let hintRevision = 0;
let hintPlan = [];
let cubeDestroyed = false;
let reassembling = false;
let explosionStartedAt = 0;
let rebuildStartedAt = 0;
let breakPanelTimer = null;
let lastFrameTime = performance.now();
let floorImpactBudget = 0;
let collisionImpactBudget = 0;
let lastDebrisImpactSoundAt = -Infinity;
const manualFrenzyMoves = [];
const CUBIE_COLLISION_DISTANCE = 1.36;
const EXPLOSION_FLOOR_Y = -1.5;
const FRENZY_WINDOW_MS = 3600;
const FRENZY_MIN_MOVES = 9;
const FRENZY_TRIGGER_MS = 3000;

function setPointerFromEvent(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
}

function dominantAxis(vector) {
  const values = AXES.map((axis) => Math.abs(vector[axis]));
  return AXES[values.indexOf(Math.max(...values))];
}

function onPointerDown(event) {
  if (event.button !== 0 || autoMode || turnInProgress || cubeDestroyed || reassembling || performance.now() < manualInputLockedUntil) return;
  setPointerFromEvent(event);
  const hit = raycaster.intersectObjects(cubieBodies, false)[0];

  if (!hit) {
    stage.classList.add('is-grabbing');
    return;
  }

  event.stopImmediatePropagation();
  renderer.domElement.setPointerCapture(event.pointerId);
  ensureAudio();
  const cubie = hit.object.userData.cubie;
  const worldNormal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
  const rootWorldQuaternion = cubeRoot.getWorldQuaternion(new THREE.Quaternion());
  const localNormal = worldNormal.clone().applyQuaternion(rootWorldQuaternion.clone().invert());
  localNormal.set(Math.round(localNormal.x), Math.round(localNormal.y), Math.round(localNormal.z));
  dragPlane.setFromNormalAndCoplanarPoint(worldNormal, hit.point);
  const startPoint = new THREE.Vector3();
  raycaster.ray.intersectPlane(dragPlane, startPoint);
  cubeGesture = {
    pointerId: event.pointerId,
    cubie,
    coord: cubie.userData.coord.clone(),
    normal: localNormal,
    rootWorldQuaternion,
    startPoint,
    committed: false,
  };
  controls.enabled = false;
  stage.classList.add('is-turning');
}

function onPointerMove(event) {
  if (!cubeGesture || cubeGesture.pointerId !== event.pointerId || cubeGesture.committed) return;
  event.stopImmediatePropagation();
  setPointerFromEvent(event);
  const currentPoint = new THREE.Vector3();
  if (!raycaster.ray.intersectPlane(dragPlane, currentPoint)) return;

  const drag = currentPoint.sub(cubeGesture.startPoint);
  if (drag.length() < 0.18) return;

  const localDrag = drag.applyQuaternion(cubeGesture.rootWorldQuaternion.clone().invert());
  const rotationVector = cubeGesture.normal.clone().cross(localDrag);
  const axis = dominantAxis(rotationVector);
  const direction = Math.sign(rotationVector[axis]) || 1;
  const layer = Math.round(cubeGesture.coord[axis]);
  cubeGesture.committed = true;
  hasInteracted = true;
  gestureCue.classList.remove('show');
  performMove({ axis, layer, direction }, { record: true, duration: 310, source: 'manual' });
}

function endPointerGesture(event) {
  if (cubeGesture && cubeGesture.pointerId === event.pointerId) {
    event.stopImmediatePropagation();
    cubeGesture = null;
    controls.enabled = true;
    stage.classList.remove('is-turning');
    if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId);
  }
  stage.classList.remove('is-grabbing');
}

renderer.domElement.addEventListener('pointerdown', onPointerDown, true);
renderer.domElement.addEventListener('pointermove', onPointerMove, true);
renderer.domElement.addEventListener('pointerup', endPointerGesture, true);
renderer.domElement.addEventListener('pointercancel', endPointerGesture, true);
renderer.domElement.addEventListener('pointerleave', (event) => {
  if (!cubeGesture) stage.classList.remove('is-grabbing');
  if (event.buttons === 0) endPointerGesture(event);
}, true);

function snapQuaternion(object) {
  const matrix = new THREE.Matrix4().makeRotationFromQuaternion(object.quaternion);
  const e = matrix.elements;
  [0, 1, 2, 4, 5, 6, 8, 9, 10].forEach((index) => {
    e[index] = Math.round(e[index]);
  });
  object.quaternion.setFromRotationMatrix(matrix).normalize();
}

function rotateCoord(coord, axis, angle) {
  const axisVector = new THREE.Vector3(
    axis === 'x' ? 1 : 0,
    axis === 'y' ? 1 : 0,
    axis === 'z' ? 1 : 0
  );
  coord.applyAxisAngle(axisVector, angle);
  coord.set(Math.round(coord.x), Math.round(coord.y), Math.round(coord.z));
}

const FACE_MOVE_MAP = {
  U: { axis: 'y', layer: 1, direction: -1 },
  R: { axis: 'x', layer: 1, direction: -1 },
  F: { axis: 'z', layer: 1, direction: -1 },
  D: { axis: 'y', layer: -1, direction: 1 },
  L: { axis: 'x', layer: -1, direction: 1 },
  B: { axis: 'z', layer: -1, direction: 1 },
};

function moveToNotation(move) {
  if (move.notation) return move.notation;
  let face;
  let baseDirection;

  if (move.axis === 'x' && move.layer === 1) [face, baseDirection] = ['R', -1];
  if (move.axis === 'x' && move.layer === -1) [face, baseDirection] = ['L', 1];
  if (move.axis === 'x' && move.layer === 0) [face, baseDirection] = ['M', 1];
  if (move.axis === 'y' && move.layer === 1) [face, baseDirection] = ['U', -1];
  if (move.axis === 'y' && move.layer === -1) [face, baseDirection] = ['D', 1];
  if (move.axis === 'y' && move.layer === 0) [face, baseDirection] = ['E', 1];
  if (move.axis === 'z' && move.layer === 1) [face, baseDirection] = ['F', -1];
  if (move.axis === 'z' && move.layer === -1) [face, baseDirection] = ['B', 1];
  if (move.axis === 'z' && move.layer === 0) [face, baseDirection] = ['S', -1];

  if (!face) throw new Error(`Unsupported move: ${JSON.stringify(move)}`);
  if (move.turns === 2) return `${face}2`;
  return move.direction === baseDirection ? face : `${face}'`;
}

function parseAlgorithm(algorithm) {
  if (!algorithm.trim()) return [];
  return algorithm.trim().split(/\s+/).map((token) => {
    const face = token[0];
    const base = FACE_MOVE_MAP[face];
    if (!base) throw new Error(`Unsupported solver move: ${token}`);
    return {
      ...base,
      direction: token.endsWith("'") ? -base.direction : base.direction,
      turns: token.endsWith('2') ? 2 : 1,
      notation: token,
    };
  });
}

function parseCubeRotations(algorithm) {
  if (!algorithm.trim()) return [];
  const rotationMap = {
    x: { axis: 'x', direction: -1 },
    y: { axis: 'y', direction: -1 },
    z: { axis: 'z', direction: -1 },
  };
  return algorithm.trim().split(/\s+/).map((token) => {
    const base = rotationMap[token[0]];
    if (!base) throw new Error(`Unsupported cube rotation: ${token}`);
    return {
      ...base,
      layer: 0,
      whole: true,
      direction: token.endsWith("'") ? -base.direction : base.direction,
      turns: token.endsWith('2') ? 2 : 1,
      notation: token,
    };
  });
}

const HINT_FACE_NAMES = {
  U: '顶层',
  R: '右层',
  F: '前层',
  D: '底层',
  L: '左层',
  B: '后层',
};

function setHintIcon(iconName) {
  hintDirectionIcon.innerHTML = `<i data-lucide="${iconName}"></i>`;
  createIcons({ icons: ICONS });
}

function setHintMessage(notation, instruction, detail, iconName = 'lightbulb') {
  hintPanel.hidden = false;
  hintNotationEl.textContent = notation;
  hintInstructionEl.textContent = instruction;
  hintDetailEl.textContent = detail;
  setHintIcon(iconName);
}

function hideHintGuide() {
  currentHintMove = null;
  hintGuide.visible = false;
}

function rebuildHintArrows(direction) {
  hintArrowGroup.clear();
  const up = new THREE.Vector3(0, 1, 0);
  [0.18, 2.27, 4.36].forEach((angle) => {
    const arrow = new THREE.Mesh(hintArrowGeometry, hintArrowMaterial);
    arrow.position.set(Math.cos(angle) * 1.76, Math.sin(angle) * 1.76, 0);
    const tangent = new THREE.Vector3(-Math.sin(angle) * direction, Math.cos(angle) * direction, 0).normalize();
    arrow.quaternion.setFromUnitVectors(up, tangent);
    arrow.renderOrder = 21;
    hintArrowGroup.add(arrow);
  });
}

function showHintGuide(move) {
  currentHintMove = move;
  hintGuide.position.set(0, 0, 0);
  hintGuide.rotation.set(0, 0, 0);
  hintSpinner.rotation.z = 0;
  hintGuide.position[move.axis] = move.layer * (GRID + 0.52);
  if (move.axis === 'x') hintGuide.rotation.y = Math.PI / 2;
  if (move.axis === 'y') hintGuide.rotation.x = -Math.PI / 2;
  rebuildHintArrows(move.direction);
  hintGuide.visible = true;
}

function expandHintPlan(solutionMoves) {
  return solutionMoves.flatMap((move) => {
    if (move.turns !== 2) return [{ ...move, turns: 1 }];
    const quarterTurn = {
      ...move,
      turns: 1,
      notation: move.notation[0],
    };
    return [{ ...quarterTurn }, { ...quarterTurn }];
  });
}

function showSolvedHint(detail = '打乱后会继续提示下一步') {
  hintPlan = [];
  appEl.dataset.hintPlanLength = '0';
  hideHintGuide();
  setHintMessage('✓', '魔方已经复原', detail, 'lightbulb');
  appEl.dataset.hintMove = 'solved';
  appEl.dataset.hintRevision = String(++hintRevision);
}

function renderHintPlanMove(feedback = '') {
  const move = hintPlan[0];
  if (!move) {
    if (logicalCube.isSolved()) showSolvedHint('这一组步骤已经完成');
    else scheduleHintUpdate(80);
    return;
  }

  const token = move.notation;
  const faceName = HINT_FACE_NAMES[token[0]];
  const counterClockwise = token.endsWith("'");
  const directionText = counterClockwise ? '逆时针转 90°' : '顺时针转 90°';
  const iconName = counterClockwise ? 'rotate-ccw' : 'rotate-cw';
  const detail = `${feedback ? `${feedback} · ` : ''}正对该面 · 剩余 ${hintPlan.length} 次转动`;
  setHintMessage(token, `${faceName}${directionText}`, detail, iconName);
  showHintGuide(move);
  appEl.dataset.hintMove = token;
  appEl.dataset.hintPlanLength = String(hintPlan.length);
  appEl.dataset.hintRevision = String(++hintRevision);
}

function advanceHintAfterManual(move) {
  if (!hintEnabled) return;
  const actualNotation = moveToNotation({
    axis: move.axis,
    layer: move.layer,
    direction: move.direction,
    turns: 1,
  });
  const expectedNotation = hintPlan[0]?.notation;

  if (expectedNotation && actualNotation === expectedNotation) {
    hintPlan.shift();
    appEl.dataset.hintFeedback = 'matched';
    if (logicalCube.isSolved()) showSolvedHint('完成了整组训练步骤');
    else renderHintPlanMove('方向正确');
    return;
  }

  hintPlan = [];
  appEl.dataset.hintPlanLength = '0';
  hideHintGuide();
  appEl.dataset.hintFeedback = 'replanned';
  setHintMessage('↻', '正在重新规划', expectedNotation ? `刚才目标是 ${expectedNotation}` : '读取新的魔方状态', 'lightbulb');
  scheduleHintUpdate(180);
}

function pauseHint(instruction, detail) {
  hintGeneration += 1;
  hintPlan = [];
  appEl.dataset.hintPlanLength = '0';
  hideHintGuide();
  if (hintEnabled) setHintMessage('···', instruction, detail, 'lightbulb');
}

function scheduleHintUpdate(delay = 120) {
  if (!hintEnabled) return;
  window.clearTimeout(hintTimer);
  hintTimer = window.setTimeout(updateHint, delay);
}

async function updateHint() {
  if (!hintEnabled) return;
  const generation = ++hintGeneration;
  hideHintGuide();

  if (logicalCube.isSolved()) {
    showSolvedHint();
    return;
  }

  if (autoMode || turnInProgress) {
    setHintMessage('···', '观察当前动作', '完成后自动更新下一步', 'lightbulb');
    return;
  }

  const stateBeforeSolve = logicalCube.asString();
  setHintMessage('···', solverReady ? '正在计算下一步' : '正在准备提示', '读取当前魔方状态', 'lightbulb');

  try {
    await solverReadyPromise;
    const { solution } = await requestSolution();
    if (!hintEnabled || generation !== hintGeneration || stateBeforeSolve !== logicalCube.asString()) return;

    hintPlan = expandHintPlan(parseAlgorithm(solution));
    appEl.dataset.hintPlanLength = String(hintPlan.length);
    if (hintPlan.length === 0) {
      showSolvedHint('可以开始下一次打乱');
      return;
    }
    renderHintPlanMove();
  } catch (error) {
    if (generation !== hintGeneration) return;
    console.error(error);
    setHintMessage('!', '暂时无法计算', '再转动一次后会自动重试', 'lightbulb');
    appEl.dataset.hintMove = 'error';
    appEl.dataset.hintRevision = String(++hintRevision);
  }
}

function setHintEnabled(enabled, persist = true) {
  hintEnabled = enabled;
  hintButton.classList.toggle('is-active', enabled);
  hintButton.setAttribute('aria-pressed', String(enabled));
  const label = enabled ? '关闭新手提示' : '开启新手提示';
  hintButton.setAttribute('aria-label', label);
  hintButton.setAttribute('title', label);
  appEl.dataset.hintsEnabled = String(enabled);
  if (persist) window.localStorage.setItem('cubio-hints', enabled ? 'on' : 'off');

  if (enabled) updateHint();
  else {
    hintGeneration += 1;
    hintPlan = [];
    appEl.dataset.hintPlanLength = '0';
    window.clearTimeout(hintTimer);
    hintPanel.hidden = true;
    hideHintGuide();
    appEl.dataset.hintMove = 'off';
    appEl.dataset.hintRevision = String(hintRevision);
  }
}

function easeBackOut(t) {
  const c1 = 1.28;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

function addTurnRing(axis, layer, direction) {
  if (prefersReducedMotion) return null;
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1.73, 0.018, 8, 72),
    new THREE.MeshBasicMaterial({ color: direction > 0 ? 0xff6c59 : 0x3d7cff, transparent: true, opacity: 0.72 })
  );
  ring.userData.life = 1;
  ring.userData.spin = direction * 0.018;
  ring.userData.kind = 'ring';
  ring.userData.disposeGeometry = true;
  ring.userData.disposeMaterial = true;
  ring.position[axis] = layer * GRID;
  if (axis === 'x') ring.rotation.y = Math.PI / 2;
  if (axis === 'y') ring.rotation.x = Math.PI / 2;
  cubeRoot.add(ring);
  effectObjects.push(ring);
  return ring;
}

const effectObjects = [];
const sparkGeometry = new THREE.IcosahedronGeometry(0.035, 0);
const sparkMaterials = [0xff5746, 0xf5c842, 0x3474f4, 0x12b8a5].map(
  (color) => new THREE.MeshBasicMaterial({ color, transparent: true })
);
const debrisGeometry = new THREE.TetrahedronGeometry(0.075, 0);
const debrisMaterials = [0x111820, 0xff5746, 0xf5c842, 0x3474f4, 0x12b8a5, 0xffffff].map(
  (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.44, transparent: true })
);
const blastLight = new THREE.PointLight(0xffbd63, 0, 7.5, 2.2);
cubeRoot.add(blastLight);

function emitSparks(axis, layer) {
  if (prefersReducedMotion) return;
  for (let i = 0; i < 9; i += 1) {
    const spark = new THREE.Mesh(sparkGeometry, sparkMaterials[i % sparkMaterials.length]);
    spark.position.set(
      THREE.MathUtils.randFloatSpread(2.7),
      THREE.MathUtils.randFloatSpread(2.7),
      THREE.MathUtils.randFloatSpread(2.7)
    );
    spark.position[axis] = layer * GRID + THREE.MathUtils.randFloatSpread(0.18);
    const outward = spark.position.clone().normalize().multiplyScalar(THREE.MathUtils.randFloat(0.015, 0.035));
    spark.userData.velocity = outward;
    spark.userData.life = 1;
    spark.userData.kind = 'spark';
    cubeRoot.add(spark);
    effectObjects.push(spark);
  }
}

function emitExplosionDebris() {
  if (prefersReducedMotion) return;

  for (let i = 0; i < 94; i += 1) {
    const sourceCubie = cubies[Math.floor(Math.random() * cubies.length)];
    const shard = new THREE.Mesh(debrisGeometry, debrisMaterials[i % debrisMaterials.length].clone());
    shard.position.copy(sourceCubie.position).multiplyScalar(0.82);
    shard.position.add(new THREE.Vector3(
      THREE.MathUtils.randFloatSpread(0.24),
      THREE.MathUtils.randFloatSpread(0.24),
      THREE.MathUtils.randFloatSpread(0.24)
    ));
    const outward = shard.position.lengthSq() > 0.01
      ? shard.position.clone().normalize()
      : new THREE.Vector3(THREE.MathUtils.randFloatSpread(1), 0.4, THREE.MathUtils.randFloatSpread(1)).normalize();
    outward.y += THREE.MathUtils.randFloat(0.06, 0.5);
    shard.userData.velocity = outward.normalize().multiplyScalar(THREE.MathUtils.randFloat(4.6, 10.5));
    shard.userData.angularVelocity = new THREE.Vector3(
      THREE.MathUtils.randFloatSpread(12),
      THREE.MathUtils.randFloatSpread(12),
      THREE.MathUtils.randFloatSpread(12)
    );
    shard.userData.life = THREE.MathUtils.randFloat(0.7, 1);
    shard.userData.decay = THREE.MathUtils.randFloat(0.42, 0.62);
    shard.userData.kind = 'debris';
    shard.userData.disposeMaterial = true;
    shard.scale.setScalar(THREE.MathUtils.randFloat(0.42, 1.4));
    cubeRoot.add(shard);
    effectObjects.push(shard);
  }

  AXES.forEach((axis, index) => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.38 + index * 0.11, 0.046, 10, 112),
      new THREE.MeshBasicMaterial({
        color: [0xff5746, 0xf5c842, 0x3474f4][index],
        transparent: true,
        opacity: 0.94,
        depthWrite: false,
      })
    );
    if (axis === 'x') ring.rotation.y = Math.PI / 2;
    if (axis === 'y') ring.rotation.x = Math.PI / 2;
    ring.userData.kind = 'shockwave';
    ring.userData.life = 1;
    ring.userData.decay = 1.18 + index * 0.1;
    ring.userData.growth = 4.4 + index * 0.45;
    ring.userData.disposeGeometry = true;
    ring.userData.disposeMaterial = true;
    cubeRoot.add(ring);
    effectObjects.push(ring);
  });
}

function recordManualFrenzy(move, now = performance.now()) {
  manualFrenzyMoves.push({
    time: now,
    axis: move.axis,
    layer: move.layer,
    direction: move.direction,
  });

  while (manualFrenzyMoves.length && now - manualFrenzyMoves[0].time > FRENZY_WINDOW_MS) {
    manualFrenzyMoves.shift();
  }

  let sequenceStart = manualFrenzyMoves.length - 1;
  while (
    sequenceStart > 0
    && manualFrenzyMoves[sequenceStart].time - manualFrenzyMoves[sequenceStart - 1].time <= 650
  ) {
    sequenceStart -= 1;
  }
  const sequence = manualFrenzyMoves.slice(sequenceStart);
  if (sequence.length < FRENZY_MIN_MOVES || now - sequence[0].time < FRENZY_TRIGGER_MS) return false;

  const axes = new Set(sequence.map((item) => item.axis));
  const faces = new Set(sequence.map((item) => `${item.axis}:${item.layer}`));
  let directionChanges = 0;
  for (let i = 1; i < sequence.length; i += 1) {
    if (sequence[i].direction !== sequence[i - 1].direction) directionChanges += 1;
  }

  return axes.size >= 2 && faces.size >= 4 && directionChanges >= 3;
}

function triggerCubeExplosion() {
  if (cubeDestroyed || reassembling) return;
  cubeDestroyed = true;
  timerRunning = false;
  manualFrenzyMoves.length = 0;
  explosionStartedAt = performance.now() + (prefersReducedMotion ? 0 : 92);
  floorImpactBudget = prefersReducedMotion ? 0 : 14;
  collisionImpactBudget = prefersReducedMotion ? 0 : 6;
  lastDebrisImpactSoundAt = -Infinity;
  appEl.dataset.destroyed = 'true';
  controls.enabled = false;
  hintGeneration += 1;
  hintPanel.hidden = true;
  hideHintGuide();
  updateControlsDisabled();
  setStatus('结构崩解', 'broken');

  cubeRoot.updateMatrixWorld(true);
  const cameraDirection = cubeRoot.worldToLocal(camera.position.clone()).normalize();
  cubies.forEach((cubie, index) => {
    const radial = cubie.position.lengthSq() > 0.01
      ? cubie.position.clone().normalize()
      : new THREE.Vector3(THREE.MathUtils.randFloatSpread(1), 0.55, THREE.MathUtils.randFloatSpread(1)).normalize();
    const cameraFacing = Math.max(radial.dot(cameraDirection), 0);
    radial.addScaledVector(cameraDirection, cameraFacing * THREE.MathUtils.randFloat(0.48, 0.92));
    radial.x += THREE.MathUtils.randFloatSpread(0.46);
    radial.y += THREE.MathUtils.randFloat(0.14, 0.68);
    radial.z += THREE.MathUtils.randFloatSpread(0.46);
    const launchSpeed = THREE.MathUtils.randFloat(5.2, 8.4) + cameraFacing * THREE.MathUtils.randFloat(1.2, 2.6);
    cubie.userData.explosion = {
      originPosition: cubie.position.clone(),
      originQuaternion: cubie.quaternion.clone(),
      velocity: radial.normalize().multiplyScalar(launchSpeed),
      angularVelocity: new THREE.Vector3(
        THREE.MathUtils.randFloatSpread(10),
        THREE.MathUtils.randFloatSpread(10),
        THREE.MathUtils.randFloatSpread(10)
      ),
      delay: (index % 3) * 0.008 + THREE.MathUtils.randFloat(0, 0.035),
      launched: false,
      settled: false,
    };
  });

  emitExplosionDebris();
  blastLight.intensity = prefersReducedMotion ? 0 : 32;
  blastLight.userData.startedAt = explosionStartedAt;
  playCubeExplosionSound();
  if (!prefersReducedMotion) {
    stage.animate(
      [
        { transform: 'translate3d(0, 0, 0)' },
        { transform: 'translate3d(-17px, 9px, 0) rotate(-0.45deg) scale(1.035)' },
        { transform: 'translate3d(15px, -11px, 0) rotate(0.38deg) scale(1.025)' },
        { transform: 'translate3d(-12px, -6px, 0) rotate(-0.28deg) scale(1.02)' },
        { transform: 'translate3d(9px, 7px, 0) rotate(0.2deg) scale(1.012)' },
        { transform: 'translate3d(-5px, 2px, 0) rotate(-0.1deg)' },
        { transform: 'translate3d(0, 0, 0)' },
      ],
      { duration: 720, easing: 'cubic-bezier(0.14, 0.76, 0.22, 1)' }
    );
  }

  window.clearTimeout(breakPanelTimer);
  breakPanelTimer = window.setTimeout(() => {
    breakPanel.hidden = false;
    requestAnimationFrame(() => breakPanel.classList.add('is-visible'));
  }, prefersReducedMotion ? 0 : 620);
}

function finishReassembly() {
  cubies.forEach((cubie) => {
    const data = cubie.userData.explosion;
    cubie.position.copy(data.originPosition);
    cubie.quaternion.copy(data.originQuaternion);
    cubie.scale.setScalar(1);
    delete cubie.userData.explosion;
    delete cubie.userData.rebuildFrom;
  });
  cubeRoot.scale.setScalar(1);
  cubeDestroyed = false;
  reassembling = false;
  appEl.dataset.destroyed = 'false';
  delete appEl.dataset.minCubieDistance;
  rebuildButton.disabled = false;
  controls.enabled = true;
  updateControlsDisabled();
  setStatus(isSolved() ? '完成复原' : '重新组装完成', isSolved() ? 'solved' : 'ready');
  restoreMusicLevel();
  scheduleHintUpdate(260);
}

function reassembleCube() {
  if (!cubeDestroyed || reassembling) return;
  reassembling = true;
  rebuildStartedAt = performance.now();
  rebuildButton.disabled = true;
  setStatus('正在重新组装', 'busy');
  breakPanel.classList.remove('is-visible');
  window.setTimeout(() => {
    if (reassembling) breakPanel.hidden = true;
  }, prefersReducedMotion ? 0 : 260);
  playReassemblySound();
  cubies.forEach((cubie, index) => {
    cubie.userData.rebuildFrom = {
      position: cubie.position.clone(),
      quaternion: cubie.quaternion.clone(),
      delay: prefersReducedMotion ? 0 : (index % 9) * 0.026 + Math.floor(index / 9) * 0.04,
    };
  });
}

function performMove(move, options = {}) {
  if (turnInProgress || cubeDestroyed || reassembling) return Promise.resolve(false);
  const { record = true, trackState = true, duration = 280, source = 'manual' } = options;
  const actualDuration = prefersReducedMotion ? 40 : duration;
  turnInProgress = true;
  if (hintEnabled) {
    hintGeneration += 1;
    hideHintGuide();
  }
  updateControlsDisabled();
  setStatus(source === 'manual' ? '转动中' : source === 'scramble' ? '正在打乱' : '正在复位', 'busy');
  ensureAudio();
  playTurnSound(move, source);

  const pivot = new THREE.Group();
  cubeRoot.add(pivot);
  const selected = move.whole
    ? cubies.slice()
    : cubies.filter((cubie) => Math.round(cubie.userData.coord[move.axis]) === move.layer);
  selected.forEach((cubie) => pivot.attach(cubie));
  const ring = move.whole ? null : addTurnRing(move.axis, move.layer, move.direction);
  const targetAngle = move.direction * Math.PI / 2 * (move.turns || 1);
  const started = performance.now();

  return new Promise((resolve) => {
    function animateTurn(now) {
      const progress = Math.min((now - started) / actualDuration, 1);
      pivot.rotation[move.axis] = targetAngle * easeBackOut(progress);
      if (ring) ring.rotation.z += ring.userData.spin;

      if (progress < 1) {
        requestAnimationFrame(animateTurn);
        return;
      }

      pivot.rotation[move.axis] = targetAngle;
      pivot.updateMatrixWorld(true);
      selected.forEach((cubie) => {
        cubeRoot.attach(cubie);
        rotateCoord(cubie.userData.coord, move.axis, targetAngle);
        cubie.position.copy(cubie.userData.coord).multiplyScalar(GRID);
        snapQuaternion(cubie);
      });
      cubeRoot.remove(pivot);
      if (!move.whole) emitSparks(move.axis, move.layer);
      playSnapSound(move, source);

      if (trackState) logicalCube.move(moveToNotation(move));
      appEl.dataset.lastMoveSource = source;
      appEl.dataset.logicalSolved = String(logicalCube.isSolved());
      appEl.dataset.exactSolved = String(logicalCube.asString() === SOLVED_STATE);

      if (record) {
        history.push({ ...move });
        moveCount += 1;
        updateMoveCount();
        if (source === 'manual' && !timerRunning) startTimer();
      }

      turnInProgress = false;
      updateControlsDisabled();
      if (source === 'manual' && !autoMode && recordManualFrenzy(move)) {
        triggerCubeExplosion();
        resolve(true);
        return;
      }
      if (!autoMode) {
        const solved = isSolved();
        setStatus(solved ? '完成复原' : '继续挑战', solved ? 'solved' : 'ready');
        if (solved && moveCount > 0) celebrate();
      }
      if (source === 'manual' && !autoMode) advanceHintAfterManual(move);
      resolve(true);
    }

    requestAnimationFrame(animateTurn);
  });
}

function isSolved() {
  return logicalCube.isSolved();
}

function randomMoves(count) {
  const result = [];
  let previousAxis = '';
  for (let i = 0; i < count; i += 1) {
    const choices = AXES.filter((axis) => axis !== previousAxis);
    const axis = choices[Math.floor(Math.random() * choices.length)];
    result.push({
      axis,
      layer: [-1, 0, 1][Math.floor(Math.random() * 3)],
      direction: Math.random() > 0.5 ? 1 : -1,
    });
    previousAxis = axis;
  }
  return result;
}

async function scrambleCube() {
  if (autoMode || turnInProgress || cubeDestroyed || reassembling) return;
  manualFrenzyMoves.length = 0;
  hasInteracted = true;
  gestureCue.classList.remove('show');
  ensureAudio();

  if (logicalCube.asString() !== SOLVED_STATE) await resetCube(false);
  autoMode = true;
  pauseHint('正在自动打乱', '完成后给出第一步提示');
  timerRunning = false;
  timerElapsed = 0;
  updateTimer();
  updateControlsDisabled();
  setStatus('正在打乱', 'busy');
  const moves = randomMoves(scrambleSteps);
  for (const move of moves) {
    await performMove(move, { record: true, duration: 145, source: 'scramble' });
  }
  autoMode = false;
  manualInputLockedUntil = performance.now() + 450;
  moveCount = 0;
  updateMoveCount();
  timerElapsed = 0;
  updateTimer();
  updateControlsDisabled();
  setStatus('挑战开始', 'ready');
  scheduleHintUpdate(180);
}

async function resetCube(announce = true) {
  if (autoMode || turnInProgress || cubeDestroyed || reassembling || logicalCube.asString() === SOLVED_STATE) {
    if (announce && logicalCube.asString() === SOLVED_STATE) {
      setStatus('已经复原', 'solved');
      softBump(resetButton);
    }
    return;
  }

  hasInteracted = true;
  gestureCue.classList.remove('show');
  autoMode = true;
  pauseHint('正在自动复位', '完成后继续待命');
  timerRunning = false;
  updateControlsDisabled();
  setStatus(solverReady ? '正在计算解法' : '正在准备求解器', 'busy');

  try {
    await solverReadyPromise;
    setStatus('正在计算解法', 'busy');
    const { solution, upright } = await requestSolution();
    const solutionMoves = parseAlgorithm(solution);
    const orientationMoves = parseCubeRotations(upright);
    setStatus(`求解完成 · ${solutionMoves.length} 步`, 'busy');

    for (const move of solutionMoves) {
      await performMove(move, { record: false, trackState: true, duration: 175, source: 'reset' });
    }
    for (const move of orientationMoves) {
      await performMove(move, { record: false, trackState: true, duration: 310, source: 'reset' });
    }
  } catch (error) {
    console.error(error);
    autoMode = false;
    updateControlsDisabled();
    setStatus('求解失败，请再试一次', 'ready');
    scheduleHintUpdate();
    return;
  }

  history = [];
  moveCount = 0;
  timerElapsed = 0;
  autoMode = false;
  manualInputLockedUntil = performance.now() + 700;
  updateMoveCount();
  updateTimer();
  updateControlsDisabled();
  setStatus('完成复原', 'solved');
  scheduleHintUpdate(180);
  if (announce) celebrate();
}

function setStatus(text, tone = 'ready') {
  statusTextEl.textContent = text;
  statusEl.dataset.tone = tone;
}

function updateMoveCount() {
  moveCountEl.textContent = String(moveCount).padStart(3, '0');
}

function startTimer() {
  timerRunning = true;
  timerStart = performance.now() - timerElapsed;
}

function updateTimer(now = performance.now()) {
  if (timerRunning) timerElapsed = now - timerStart;
  const totalSeconds = Math.floor(timerElapsed / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  timerEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function updateControlsDisabled() {
  const disabled = autoMode || turnInProgress || cubeDestroyed || reassembling;
  appEl.dataset.autoMode = String(autoMode);
  appEl.dataset.turning = String(turnInProgress);
  scrambleButton.disabled = disabled;
  resetButton.disabled = disabled;
  stepsDownButton.disabled = disabled;
  stepsUpButton.disabled = disabled;
  hintButton.disabled = disabled;
}

function ensureAudio() {
  if (!soundEnabled) return null;
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    audioContext.addEventListener('statechange', () => {
      appEl.dataset.audioState = audioContext.state;
      if (audioContext.state === 'running' && soundEnabled) appEl.dataset.music = 'playing';
    });
  }
  appEl.dataset.audioState = audioContext.state;
  if (audioContext.state === 'suspended') {
    audioContext.resume().then(() => {
      if (!soundEnabled) return;
      appEl.dataset.audioState = audioContext.state;
      appEl.dataset.music = 'playing';
      startBackgroundMusic();
    }).catch(() => {
      appEl.dataset.music = 'waiting-for-gesture';
    });
  }
  startBackgroundMusic();
  if (audioContext.state !== 'running') appEl.dataset.music = 'waiting-for-gesture';
  return audioContext;
}

function unlockAudio() {
  if (!soundEnabled) return;
  ensureAudio();
}

function makeGain(ctx, gainValue, start, duration, destination = ctx.destination) {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(Math.max(gainValue, 0.0001), start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  gain.connect(destination);
  return gain;
}

function connectWithPan(ctx, node, destination, pan = 0) {
  if (typeof ctx.createStereoPanner !== 'function') {
    node.connect(destination);
    return;
  }
  const panner = ctx.createStereoPanner();
  panner.pan.value = THREE.MathUtils.clamp(pan, -0.8, 0.8);
  node.connect(panner);
  panner.connect(destination);
}

function getNoiseBuffer(ctx) {
  if (noiseBuffer && noiseBuffer.sampleRate === ctx.sampleRate) return noiseBuffer;
  const length = Math.floor(ctx.sampleRate * 0.45);
  noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    const envelope = 1 - i / length;
    data[i] = (Math.random() * 2 - 1) * envelope;
  }
  return noiseBuffer;
}

function playNoiseBurst(ctx, options = {}) {
  const {
    start = ctx.currentTime,
    duration = 0.06,
    volume = 0.01,
    frequency = 900,
    type = 'bandpass',
    pan = 0,
    destination = ctx.destination,
  } = options;
  const noise = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  noise.buffer = getNoiseBuffer(ctx);
  filter.type = type;
  filter.frequency.value = frequency;
  filter.Q.value = type === 'bandpass' ? 1.8 : 0.7;
  gain.gain.setValueAtTime(Math.max(volume, 0.0001), start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  noise.connect(filter);
  filter.connect(gain);
  connectWithPan(ctx, gain, destination, pan);
  noise.start(start);
  noise.stop(start + duration + 0.01);
}

function midiToFrequency(note) {
  return 440 * Math.pow(2, (note - 69) / 12);
}

const MUSIC_STEP_DURATION = 60 / 106 / 4;
const MUSIC_CHORDS = [
  [48, 55, 60, 64],
  [45, 52, 57, 60],
  [41, 48, 53, 57],
  [43, 50, 55, 60],
];
const MUSIC_ARPEGGIO = [0, null, 2, 1, null, 3, 2, null];
const MUSIC_MELODY = new Map([
  [6, 76], [14, 72], [22, 74], [30, 71],
  [38, 79], [46, 76], [54, 81], [62, 79],
]);

function scheduleMusicPluck(ctx, midi, start, volume = 0.018, pan = 0) {
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  const oscillator = ctx.createOscillator();
  const shimmer = ctx.createOscillator();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(2100, start);
  filter.frequency.exponentialRampToValueAtTime(720, start + 0.24);
  filter.Q.value = 2.2;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
  oscillator.type = 'triangle';
  oscillator.frequency.value = midiToFrequency(midi);
  shimmer.type = 'sine';
  shimmer.frequency.value = midiToFrequency(midi + 12);
  oscillator.connect(filter);
  shimmer.connect(filter);
  filter.connect(gain);
  connectWithPan(ctx, gain, musicMasterGain, pan);
  oscillator.start(start);
  shimmer.start(start);
  oscillator.stop(start + 0.3);
  shimmer.stop(start + 0.2);
}

function scheduleMusicBass(ctx, midi, start) {
  const oscillator = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  oscillator.type = 'triangle';
  oscillator.frequency.setValueAtTime(midiToFrequency(midi), start);
  oscillator.frequency.exponentialRampToValueAtTime(midiToFrequency(midi - 1), start + 0.42);
  filter.type = 'lowpass';
  filter.frequency.value = 460;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.026, start + 0.018);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.48);
  oscillator.connect(filter);
  filter.connect(gain);
  connectWithPan(ctx, gain, musicMasterGain, -0.08);
  oscillator.start(start);
  oscillator.stop(start + 0.5);
}

function scheduleMusicPercussion(ctx, step, start) {
  if (step % 8 === 0) {
    const kick = ctx.createOscillator();
    const gain = ctx.createGain();
    kick.type = 'sine';
    kick.frequency.setValueAtTime(112, start);
    kick.frequency.exponentialRampToValueAtTime(48, start + 0.12);
    gain.gain.setValueAtTime(0.022, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.14);
    kick.connect(gain);
    gain.connect(musicMasterGain);
    kick.start(start);
    kick.stop(start + 0.15);
  }
  if (step % 4 === 2) {
    playNoiseBurst(ctx, {
      start,
      duration: 0.035,
      volume: 0.0065,
      frequency: 2600,
      type: 'highpass',
      pan: step % 8 === 2 ? -0.22 : 0.22,
      destination: musicMasterGain,
    });
  }
}

function scheduleMusicStep(ctx, step, start) {
  const loopStep = step % 64;
  const chordIndex = Math.floor((loopStep % 32) / 8);
  const localStep = loopStep % 8;
  const chord = MUSIC_CHORDS[chordIndex];
  const arpeggioIndex = MUSIC_ARPEGGIO[localStep];

  if (localStep === 0) scheduleMusicBass(ctx, chord[0], start);
  if (arpeggioIndex !== null) {
    const octaveLift = loopStep >= 32 && arpeggioIndex >= 2 ? 12 : 0;
    scheduleMusicPluck(ctx, chord[arpeggioIndex] + octaveLift, start, 0.014, localStep < 4 ? -0.18 : 0.18);
  }
  if (MUSIC_MELODY.has(loopStep)) {
    scheduleMusicPluck(ctx, MUSIC_MELODY.get(loopStep), start, 0.022, loopStep % 16 < 8 ? 0.3 : -0.3);
  }
  scheduleMusicPercussion(ctx, loopStep, start);
}

function scheduleMusicAhead() {
  if (!audioContext || !soundEnabled || !musicMasterGain) return;
  while (musicNextStepTime < audioContext.currentTime + 0.2) {
    scheduleMusicStep(audioContext, musicStep, musicNextStepTime);
    musicNextStepTime += MUSIC_STEP_DURATION;
    musicStep = (musicStep + 1) % 64;
  }
}

function startBackgroundMusic() {
  if (!audioContext || !soundEnabled || musicTimer) return;
  const targetLevel = cubeDestroyed ? 0.12 : 0.72;
  if (!musicMasterGain) {
    musicMasterGain = audioContext.createGain();
    musicMasterGain.gain.value = targetLevel;
    musicMasterGain.connect(audioContext.destination);
  } else {
    musicMasterGain.gain.cancelScheduledValues(audioContext.currentTime);
    musicMasterGain.gain.setValueAtTime(Math.max(musicMasterGain.gain.value, 0.0001), audioContext.currentTime);
    musicMasterGain.gain.exponentialRampToValueAtTime(targetLevel, audioContext.currentTime + 0.22);
  }
  musicNextStepTime = audioContext.currentTime + 0.06;
  scheduleMusicAhead();
  musicTimer = window.setInterval(scheduleMusicAhead, 80);
  appEl.dataset.music = 'playing';
}

function stopBackgroundMusic() {
  if (musicTimer) window.clearInterval(musicTimer);
  musicTimer = null;
  if (audioContext && musicMasterGain) {
    musicMasterGain.gain.cancelScheduledValues(audioContext.currentTime);
    musicMasterGain.gain.setValueAtTime(Math.max(musicMasterGain.gain.value, 0.0001), audioContext.currentTime);
    musicMasterGain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.16);
  }
  appEl.dataset.music = 'stopped';
}

function playTurnSound(move, source) {
  const ctx = ensureAudio();
  if (!ctx) return;
  const now = ctx.currentTime;
  const axisIndex = Math.max(AXES.indexOf(move.axis), 0);
  const duration = source === 'manual' ? 0.16 : 0.095;
  const volume = source === 'manual' ? 0.026 : 0.014;
  const base = [261.63, 329.63, 415.3][axisIndex] * (move.layer === 0 ? 0.96 : 1);
  const startFrequency = base * (move.direction > 0 ? 0.82 : 1.32);
  const endFrequency = base * (move.direction > 0 ? 1.48 : 0.76);
  const pan = move.layer * 0.2 + move.direction * 0.08;
  const oscillator = ctx.createOscillator();
  const overtone = ctx.createOscillator();
  const overtoneGain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  const gain = ctx.createGain();
  oscillator.type = 'sine';
  overtone.type = 'triangle';
  oscillator.frequency.setValueAtTime(startFrequency, now);
  oscillator.frequency.exponentialRampToValueAtTime(endFrequency, now + duration * 0.88);
  overtone.frequency.setValueAtTime(startFrequency * 2.25, now);
  overtone.frequency.exponentialRampToValueAtTime(endFrequency * 1.9, now + duration * 0.82);
  overtoneGain.gain.value = 0.22;
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(6200, now);
  filter.frequency.exponentialRampToValueAtTime(2800 + axisIndex * 380, now + duration);
  filter.Q.value = 0.75;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(volume, now + 0.009);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  oscillator.connect(filter);
  overtone.connect(overtoneGain);
  overtoneGain.connect(filter);
  filter.connect(gain);
  connectWithPan(ctx, gain, ctx.destination, pan);
  oscillator.start(now);
  overtone.start(now);
  oscillator.stop(now + duration + 0.01);
  overtone.stop(now + duration * 0.9);

  const sparkle = ctx.createOscillator();
  const sparkleGain = ctx.createGain();
  const sparkleStart = now + duration * 0.42;
  sparkle.type = 'sine';
  sparkle.frequency.setValueAtTime(base * 3.4, sparkleStart);
  sparkle.frequency.exponentialRampToValueAtTime(base * 4.1, sparkleStart + 0.045);
  sparkleGain.gain.setValueAtTime(source === 'manual' ? 0.012 : 0.006, sparkleStart);
  sparkleGain.gain.exponentialRampToValueAtTime(0.0001, sparkleStart + 0.055);
  sparkle.connect(sparkleGain);
  connectWithPan(ctx, sparkleGain, ctx.destination, -pan * 0.6);
  sparkle.start(sparkleStart);
  sparkle.stop(sparkleStart + 0.06);

  playNoiseBurst(ctx, {
    start: now,
    duration: duration * 0.48,
    volume: source === 'manual' ? 0.0055 : 0.003,
    frequency: 2400 + axisIndex * 520,
    type: 'highpass',
    pan,
  });
}

function playSnapSound(move, source) {
  const ctx = ensureAudio();
  if (!ctx) return;
  const now = ctx.currentTime;
  const axisIndex = Math.max(AXES.indexOf(move.axis), 0);
  const root = [720, 880, 1080][axisIndex] * (move.layer === 0 ? 0.92 : 1);
  const volume = source === 'manual' ? 0.034 : 0.018;
  const pan = move.layer * 0.22;

  [
    { offset: 0, ratio: 1, amount: 1 },
    { offset: 0.038, ratio: 1.34, amount: 0.54 },
    { offset: 0.074, ratio: 1.68, amount: 0.26 },
  ].forEach(({ offset, ratio, amount }, index) => {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = index === 1 ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(root * ratio, now + offset);
    oscillator.frequency.exponentialRampToValueAtTime(root * ratio * 0.9, now + offset + 0.065);
    gain.gain.setValueAtTime(volume * amount, now + offset);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + 0.07);
    oscillator.connect(gain);
    connectWithPan(ctx, gain, ctx.destination, pan + (index - 1) * 0.08);
    oscillator.start(now + offset);
    oscillator.stop(now + offset + 0.075);
  });

  playNoiseBurst(ctx, {
    start: now,
    duration: 0.018,
    volume: source === 'manual' ? 0.009 : 0.005,
    frequency: 4200 + axisIndex * 650,
    type: 'highpass',
    pan,
  });
}

function playCelebrationSound() {
  const ctx = ensureAudio();
  if (!ctx) return;
  [392, 523.25, 659.25, 783.99].forEach((frequency, index) => {
    const start = ctx.currentTime + index * 0.075;
    const oscillator = ctx.createOscillator();
    const gain = makeGain(ctx, 0.045, start, 0.22);
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    oscillator.connect(gain);
    oscillator.start(start);
    oscillator.stop(start + 0.23);
  });
}

function duckMusicForExplosion(ctx) {
  if (!musicMasterGain) return;
  const now = ctx.currentTime;
  musicMasterGain.gain.cancelScheduledValues(now);
  musicMasterGain.gain.setValueAtTime(Math.max(musicMasterGain.gain.value, 0.0001), now);
  musicMasterGain.gain.exponentialRampToValueAtTime(0.035, now + 0.11);
  musicMasterGain.gain.exponentialRampToValueAtTime(0.12, now + 1.2);
}

function restoreMusicLevel() {
  if (!audioContext || !musicMasterGain || !soundEnabled) return;
  const now = audioContext.currentTime;
  musicMasterGain.gain.cancelScheduledValues(now);
  musicMasterGain.gain.setValueAtTime(Math.max(musicMasterGain.gain.value, 0.0001), now);
  musicMasterGain.gain.exponentialRampToValueAtTime(0.72, now + 0.9);
}

function playCubeExplosionSound() {
  const ctx = ensureAudio();
  if (!ctx) return;
  const now = ctx.currentTime + 0.075;
  duckMusicForExplosion(ctx);

  const explosionBus = ctx.createDynamicsCompressor();
  explosionBus.threshold.value = -12;
  explosionBus.knee.value = 8;
  explosionBus.ratio.value = 10;
  explosionBus.attack.value = 0.002;
  explosionBus.release.value = 0.2;
  explosionBus.connect(ctx.destination);

  const impact = ctx.createOscillator();
  const impactFilter = ctx.createBiquadFilter();
  const impactGain = ctx.createGain();
  impact.type = 'sine';
  impact.frequency.setValueAtTime(96, now);
  impact.frequency.exponentialRampToValueAtTime(34, now + 0.42);
  impactFilter.type = 'lowpass';
  impactFilter.frequency.value = 240;
  impactGain.gain.setValueAtTime(0.0001, now);
  impactGain.gain.exponentialRampToValueAtTime(0.19, now + 0.008);
  impactGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.62);
  impact.connect(impactFilter);
  impactFilter.connect(impactGain);
  impactGain.connect(explosionBus);
  impact.start(now);
  impact.stop(now + 0.54);

  playNoiseBurst(ctx, {
    start: now,
    duration: 0.34,
    volume: 0.12,
    frequency: 540,
    type: 'lowpass',
    destination: explosionBus,
  });

  const crack = ctx.createOscillator();
  const crackFilter = ctx.createBiquadFilter();
  const crackGain = ctx.createGain();
  crack.type = 'sawtooth';
  crack.frequency.setValueAtTime(210, now);
  crack.frequency.exponentialRampToValueAtTime(62, now + 0.16);
  crackFilter.type = 'bandpass';
  crackFilter.frequency.setValueAtTime(1850, now);
  crackFilter.frequency.exponentialRampToValueAtTime(620, now + 0.2);
  crackFilter.Q.value = 0.82;
  crackGain.gain.setValueAtTime(0.11, now);
  crackGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
  crack.connect(crackFilter);
  crackFilter.connect(crackGain);
  crackGain.connect(explosionBus);
  crack.start(now);
  crack.stop(now + 0.25);

  [0, 0.028, 0.064, 0.11, 0.17].forEach((offset, index) => {
    playNoiseBurst(ctx, {
      start: now + offset,
      duration: 0.035 + index * 0.008,
      volume: 0.044 - index * 0.004,
      frequency: 2900 + index * 880,
      type: 'highpass',
      pan: index % 2 === 0 ? -0.5 + index * 0.1 : 0.5 - index * 0.08,
      destination: explosionBus,
    });
  });

  [330, 440, 587.33, 783.99, 1046.5, 1396.91].forEach((frequency, index) => {
    const start = now + 0.04 + index * 0.047 + Math.random() * 0.025;
    const oscillator = ctx.createOscillator();
    const resonator = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    oscillator.type = index % 2 === 0 ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(frequency * THREE.MathUtils.randFloat(0.94, 1.07), start);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.72, start + 0.28);
    resonator.type = 'bandpass';
    resonator.frequency.value = frequency * 1.7;
    resonator.Q.value = 3.2;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.042 - index * 0.0035, start + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3 + index * 0.018);
    oscillator.connect(resonator);
    resonator.connect(gain);
    connectWithPan(ctx, gain, explosionBus, index % 2 === 0 ? -0.72 + index * 0.09 : 0.68 - index * 0.07);
    oscillator.start(start);
    oscillator.stop(start + 0.42);
  });
}

function playReassemblySound() {
  const ctx = ensureAudio();
  if (!ctx) return;
  const now = ctx.currentTime;
  [261.63, 329.63, 392, 523.25, 659.25].forEach((frequency, index) => {
    const start = now + index * 0.12;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = index % 2 === 0 ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(frequency * 0.84, start);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.08, start + 0.18);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.026, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.24);
    oscillator.connect(gain);
    connectWithPan(ctx, gain, ctx.destination, THREE.MathUtils.lerp(-0.45, 0.45, index / 4));
    oscillator.start(start);
    oscillator.stop(start + 0.26);
    playNoiseBurst(ctx, {
      start: start + 0.075,
      duration: 0.018,
      volume: 0.007,
      frequency: 3900 + index * 420,
      type: 'highpass',
      pan: THREE.MathUtils.lerp(-0.4, 0.4, index / 4),
    });
  });
}

function playDebrisImpactSound(pan, energy, toneSeed = 0) {
  if (!audioContext || !soundEnabled || audioContext.state !== 'running') return false;
  const ctx = audioContext;
  const now = ctx.currentTime;
  if (now - lastDebrisImpactSoundAt < 0.042) return false;
  lastDebrisImpactSoundAt = now;
  const strength = THREE.MathUtils.clamp(energy / 5, 0.35, 1);
  const baseFrequency = 760 + (toneSeed % 7) * 86 + THREE.MathUtils.randFloatSpread(65);

  [
    { ratio: 1, volume: 0.022, duration: 0.13 },
    { ratio: 2.16, volume: 0.0095, duration: 0.075 },
  ].forEach(({ ratio, volume, duration }, index) => {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = index === 0 ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(baseFrequency * ratio, now);
    oscillator.frequency.exponentialRampToValueAtTime(baseFrequency * ratio * 0.88, now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume * strength, now + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain);
    connectWithPan(ctx, gain, ctx.destination, pan + (index === 0 ? -0.03 : 0.04));
    oscillator.start(now);
    oscillator.stop(now + duration + 0.01);
  });
  playNoiseBurst(ctx, {
    start: now,
    duration: 0.018,
    volume: 0.008 * strength,
    frequency: 4600 + (toneSeed % 3) * 540,
    type: 'highpass',
    pan,
  });
  return true;
}

function softBump(element) {
  element.animate(
    [
      { transform: 'scale(1)' },
      { transform: 'scale(0.94)' },
      { transform: 'scale(1)' },
    ],
    { duration: prefersReducedMotion ? 1 : 220, easing: 'ease-out' }
  );
}

function celebrate() {
  playCelebrationSound();
  if (prefersReducedMotion) return;
  const colors = ['#ff5746', '#f5c842', '#3474f4', '#12b8a5', '#ffffff'];
  for (let i = 0; i < 28; i += 1) {
    const piece = document.createElement('i');
    piece.className = 'confetti-piece';
    const angle = (Math.PI * 2 * i) / 28 + Math.random() * 0.3;
    const distance = 100 + Math.random() * Math.min(window.innerWidth * 0.35, 310);
    piece.style.setProperty('--dx', `${Math.cos(angle) * distance}px`);
    piece.style.setProperty('--dy', `${Math.sin(angle) * distance}px`);
    piece.style.setProperty('--spin', `${THREE.MathUtils.randInt(-420, 420)}deg`);
    piece.style.background = colors[i % colors.length];
    piece.style.animationDelay = `${Math.random() * 90}ms`;
    confettiEl.appendChild(piece);
    piece.addEventListener('animationend', () => piece.remove(), { once: true });
  }
}

scrambleButton.addEventListener('click', scrambleCube);
resetButton.addEventListener('click', () => resetCube(true));
rebuildButton.addEventListener('click', reassembleCube);
hintButton.addEventListener('click', () => {
  ensureAudio();
  setHintEnabled(!hintEnabled);
  softBump(hintButton);
});

stepsDownButton.addEventListener('click', () => {
  scrambleSteps = Math.max(8, scrambleSteps - 2);
  scrambleStepsEl.textContent = scrambleSteps;
  softBump(scrambleStepsEl);
});

stepsUpButton.addEventListener('click', () => {
  scrambleSteps = Math.min(30, scrambleSteps + 2);
  scrambleStepsEl.textContent = scrambleSteps;
  softBump(scrambleStepsEl);
});

soundButton.addEventListener('click', () => {
  soundEnabled = !soundEnabled;
  const label = soundEnabled ? '关闭声音' : '开启声音';
  soundButton.setAttribute('aria-label', label);
  soundButton.setAttribute('title', label);
  soundButton.innerHTML = `<i data-lucide="${soundEnabled ? 'volume-2' : 'volume-x'}"></i>`;
  createIcons({ icons: ICONS });
  if (soundEnabled) {
    ensureAudio();
    playSnapSound({ axis: 'y', layer: 1, direction: -1 }, 'manual');
  } else stopBackgroundMusic();
});

window.addEventListener('pointerdown', unlockAudio, { capture: true });
window.addEventListener('keydown', unlockAudio, { capture: true });

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  fitCameraToViewport();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

function updateEffects(delta) {
  for (let i = effectObjects.length - 1; i >= 0; i -= 1) {
    const effect = effectObjects[i];
    const frameScale = delta * 60;
    effect.userData.life -= (effect.userData.decay ?? 2.1) * delta;
    if (effect.userData.kind === 'spark') {
      effect.position.addScaledVector(effect.userData.velocity, frameScale);
      effect.userData.velocity.y -= 0.0008 * frameScale;
      effect.rotation.x += 0.08 * frameScale;
      effect.rotation.y += 0.06 * frameScale;
    } else if (effect.userData.kind === 'debris') {
      effect.position.addScaledVector(effect.userData.velocity, delta);
      effect.userData.velocity.y -= 5.8 * delta;
      effect.rotation.x += effect.userData.angularVelocity.x * delta;
      effect.rotation.y += effect.userData.angularVelocity.y * delta;
      effect.rotation.z += effect.userData.angularVelocity.z * delta;
    } else if (effect.userData.kind === 'shockwave') {
      effect.scale.addScalar(effect.userData.growth * delta);
      effect.rotation.z += 0.8 * delta;
    } else {
      effect.scale.multiplyScalar(Math.pow(1.008, frameScale));
    }
    effect.material.opacity = Math.max(effect.userData.life, 0);
    if (effect.userData.life <= 0) {
      cubeRoot.remove(effect);
      if (effect.userData.disposeGeometry) effect.geometry.dispose();
      if (effect.userData.disposeMaterial) effect.material.dispose();
      effectObjects.splice(i, 1);
    }
  }
}

function playLimitedImpact(pan, energy, toneSeed, type = 'floor') {
  const budget = type === 'collision' ? collisionImpactBudget : floorImpactBudget;
  if (budget <= 0 || energy < 1.45) return;
  if (!playDebrisImpactSound(pan, energy, toneSeed)) return;
  if (type === 'collision') collisionImpactBudget -= 1;
  else floorImpactBudget -= 1;
}

function resolveCubieCollisions(elapsed) {
  if (elapsed < 0.1) return Infinity;
  let minimumDistance = Infinity;

  for (let pass = 0; pass < 3; pass += 1) {
    for (let i = 0; i < cubies.length - 1; i += 1) {
      const first = cubies[i];
      const firstData = first.userData.explosion;
      if (!firstData.launched) continue;

      for (let j = i + 1; j < cubies.length; j += 1) {
        const second = cubies[j];
        const secondData = second.userData.explosion;
        if (!secondData.launched) continue;

        const offset = second.position.clone().sub(first.position);
        let distance = offset.length();
        minimumDistance = Math.min(minimumDistance, distance);
        if (distance >= CUBIE_COLLISION_DISTANCE) continue;

        if (distance < 0.0001) {
          offset.set(
            THREE.MathUtils.randFloatSpread(1),
            THREE.MathUtils.randFloat(0.12, 0.7),
            THREE.MathUtils.randFloatSpread(1)
          ).normalize();
          distance = 0.0001;
        } else {
          offset.multiplyScalar(1 / distance);
        }

        const overlap = CUBIE_COLLISION_DISTANCE - distance;
        const firstWeight = firstData.settled && !secondData.settled ? 0.18 : 0.5;
        const secondWeight = secondData.settled && !firstData.settled ? 0.18 : 0.5;
        const weightTotal = firstWeight + secondWeight;
        first.position.addScaledVector(offset, -overlap * (firstWeight / weightTotal));
        second.position.addScaledVector(offset, overlap * (secondWeight / weightTotal));

        const relativeVelocity = secondData.velocity.clone().sub(firstData.velocity);
        const closingSpeed = -relativeVelocity.dot(offset);
        if (closingSpeed > 0) {
          const impulse = closingSpeed * 0.62;
          firstData.velocity.addScaledVector(offset, -impulse * 0.5);
          secondData.velocity.addScaledVector(offset, impulse * 0.5);
          const tangent = relativeVelocity.addScaledVector(offset, closingSpeed).multiplyScalar(0.08);
          firstData.velocity.add(tangent);
          secondData.velocity.sub(tangent);
          firstData.angularVelocity.add(new THREE.Vector3(
            offset.z,
            THREE.MathUtils.randFloatSpread(0.5),
            -offset.x
          ).multiplyScalar(impulse * 0.32));
          secondData.angularVelocity.add(new THREE.Vector3(
            -offset.z,
            THREE.MathUtils.randFloatSpread(0.5),
            offset.x
          ).multiplyScalar(impulse * 0.32));
          if (closingSpeed > 0.8) {
            firstData.settled = false;
            secondData.settled = false;
          }
          if (pass === 0) {
            playLimitedImpact(
              THREE.MathUtils.clamp((first.position.x + second.position.x) / 10, -0.78, 0.78),
              closingSpeed,
              i + j,
              'collision'
            );
          }
        }
      }
    }
  }

  minimumDistance = Infinity;
  for (let i = 0; i < cubies.length - 1; i += 1) {
    for (let j = i + 1; j < cubies.length; j += 1) {
      minimumDistance = Math.min(minimumDistance, cubies[i].position.distanceTo(cubies[j].position));
    }
  }
  return minimumDistance;
}

function updateDestroyedCubies(now, delta) {
  if (reassembling) {
    let finished = true;
    const elapsed = (now - rebuildStartedAt) / 1000;
    const duration = prefersReducedMotion ? 0.08 : 0.88;
    cubies.forEach((cubie) => {
      const data = cubie.userData.explosion;
      const from = cubie.userData.rebuildFrom;
      const progress = THREE.MathUtils.clamp((elapsed - from.delay) / duration, 0, 1);
      if (progress < 1) finished = false;
      const eased = 1 - Math.pow(1 - progress, 3);
      cubie.position.lerpVectors(from.position, data.originPosition, eased);
      cubie.quaternion.slerpQuaternions(from.quaternion, data.originQuaternion, eased);
      const settle = progress < 0.82 ? 1 : 1 + Math.sin((progress - 0.82) / 0.18 * Math.PI) * 0.055;
      cubie.scale.setScalar(settle);
    });
    if (finished) finishReassembly();
    return;
  }

  if (!cubeDestroyed) return;
  if (now < explosionStartedAt) {
    const tension = THREE.MathUtils.clamp(1 - (explosionStartedAt - now) / 105, 0, 1);
    cubeRoot.scale.setScalar(1 + Math.sin(tension * Math.PI) * 0.035);
    return;
  }

  cubeRoot.scale.setScalar(1);
  const elapsed = (now - explosionStartedAt) / 1000;
  cubies.forEach((cubie, index) => {
    const data = cubie.userData.explosion;
    if (elapsed < data.delay || data.settled) return;
    data.launched = true;
    cubie.position.addScaledVector(data.velocity, delta);
    data.velocity.y -= 6.2 * delta;
    data.velocity.multiplyScalar(Math.pow(0.988, delta * 60));
    cubie.rotateX(data.angularVelocity.x * delta);
    cubie.rotateY(data.angularVelocity.y * delta);
    cubie.rotateZ(data.angularVelocity.z * delta);
    data.angularVelocity.multiplyScalar(Math.pow(0.992, delta * 60));

    if (cubie.position.y < EXPLOSION_FLOOR_Y && data.velocity.y < 0) {
      const impactSpeed = Math.abs(data.velocity.y);
      cubie.position.y = EXPLOSION_FLOOR_Y;
      data.velocity.y *= -0.34;
      data.velocity.x *= 0.72;
      data.velocity.z *= 0.72;
      data.angularVelocity.multiplyScalar(0.74);
      playLimitedImpact(
        THREE.MathUtils.clamp(cubie.position.x / 5, -0.78, 0.78),
        impactSpeed,
        index
      );
    }
  });

  const minimumDistance = resolveCubieCollisions(elapsed);
  cubies.forEach((cubie) => {
    const data = cubie.userData.explosion;
    if (cubie.position.y < EXPLOSION_FLOOR_Y) {
      cubie.position.y = EXPLOSION_FLOOR_Y;
      if (data.velocity.y < 0) data.velocity.y = 0;
    }
    if (elapsed > 6.2 || (
      cubie.position.y <= EXPLOSION_FLOOR_Y + 0.01
      && data.velocity.lengthSq() < 0.075
    )) {
      data.settled = true;
    }
  });

  if (import.meta.env.DEV && Number.isFinite(minimumDistance)) {
    appEl.dataset.minCubieDistance = minimumDistance.toFixed(3);
  }
}

function animate(now) {
  requestAnimationFrame(animate);
  const delta = Math.min(Math.max((now - lastFrameTime) / 1000, 0), 0.034);
  lastFrameTime = now;
  controls.update();
  if (hintGuide.visible && currentHintMove) {
    hintSpinner.rotation.z += currentHintMove.direction * (prefersReducedMotion ? 0 : 0.012);
  }
  updateEffects(delta);
  updateDestroyedCubies(now, delta);
  if (blastLight.intensity > 0) {
    const lightElapsed = Math.max((now - blastLight.userData.startedAt) / 1000, 0);
    blastLight.intensity = 32 * Math.pow(Math.max(1 - lightElapsed / 0.24, 0), 2);
  }
  updateTimer(now);
  renderer.render(scene, camera);
}

if (import.meta.env.DEV) {
  window.addEventListener('keydown', (event) => {
    if (event.shiftKey && event.code === 'KeyE') triggerCubeExplosion();
  });
  Object.defineProperty(window, '__cubioTest', {
    configurable: true,
    value: {
      followHint: () => {
        const move = hintPlan[0];
        if (!move || turnInProgress || autoMode) return Promise.resolve(false);
        return performMove({ ...move }, { record: true, trackState: true, duration: 45, source: 'manual' });
      },
      explode: triggerCubeExplosion,
      reassemble: reassembleCube,
    },
  });
}

updateMoveCount();
updateTimer();
appEl.dataset.solverReady = 'false';
appEl.dataset.autoMode = 'false';
appEl.dataset.turning = 'false';
appEl.dataset.logicalSolved = 'true';
appEl.dataset.exactSolved = 'true';
appEl.dataset.lastMoveSource = 'none';
appEl.dataset.music = 'waiting';
appEl.dataset.destroyed = 'false';
setHintEnabled(hintEnabled, false);
ensureAudio();
setTimeout(() => {
  if (!hasInteracted) gestureCue.classList.add('show');
}, 900);
animate(performance.now());
