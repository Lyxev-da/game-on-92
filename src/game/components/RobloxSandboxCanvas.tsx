import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { createMaterialTexture, type MaterialName } from '../utils/mapTextures';
import { R6Character } from './R6Character';
import { PlayerController, MOVEMENT, type Ramp } from './PlayerController';
import { LEVEL_BOXES, LEVEL_RAMPS, TREE_LOCATIONS, VALLEY_BOUNDS, levelToAABBs } from './level';
import { ValleyBot } from './TagController';
import { game, MAPS, type MapId, type Role } from './gameStore';
import { movementStore } from '../utils/movementStore';
import { soundFX, MEME_CAPTIONS } from '../utils/sound';

interface Props {
  shiftLocked: boolean;
  onSetShiftLocked: (locked: boolean) => void;
}

interface Theme {
  zenith: [number, number, number];
  horizon: [number, number, number];
  sunDir: [number, number, number];
  sunOffset: [number, number, number];
  fog: number;
  hemiSky: number;
  hemiGround: number;
  sun: number;
  sunIntensity: number;
  ground: number;
  groundTexture: 'grass' | 'ice';
  exposure: number;
  ice: boolean;
}

/** One look per map: the sky, fog, lights and ground all change, and ice skate changes the physics too. */
const THEMES: Record<MapId, Theme> = {
  valley: {
    zenith: [0.42, 0.66, 0.92], horizon: [0.84, 0.9, 0.94], sunDir: [0.45, 0.6, 0.35], sunOffset: [60, 110, 45],
    fog: 0xcfe4f2, hemiSky: 0xdff0ff, hemiGround: 0x6b7a5a, sun: 0xfff4dc, sunIntensity: 1.7,
    ground: 0x7fb04a, groundTexture: 'grass', exposure: 1.05, ice: false,
  },
  ice: {
    zenith: [0.5, 0.78, 0.98], horizon: [0.9, 0.97, 1.0], sunDir: [0.4, 0.55, 0.4], sunOffset: [55, 105, 50],
    fog: 0xdcf3ff, hemiSky: 0xe6f7ff, hemiGround: 0x8fb7c9, sun: 0xf2fbff, sunIntensity: 1.55,
    ground: 0xc5ecf8, groundTexture: 'ice', exposure: 1.1, ice: true,
  },
  sunset: {
    zenith: [0.3, 0.34, 0.64], horizon: [1.0, 0.6, 0.34], sunDir: [0.75, 0.16, 0.3], sunOffset: [150, 55, 60],
    fog: 0xf0b184, hemiSky: 0xffd2a8, hemiGround: 0x6a4a3a, sun: 0xffa860, sunIntensity: 1.5,
    ground: 0x9aa84a, groundTexture: 'grass', exposure: 1.0, ice: false,
  },
};

function angleDifference(from: number, to: number) {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function disposeScene(scene: THREE.Scene) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  scene.traverse((object) => {
    const renderable = object as THREE.Mesh;
    if (renderable.geometry) geometries.add(renderable.geometry);
    if (renderable.material) {
      for (const material of Array.isArray(renderable.material) ? renderable.material : [renderable.material]) {
        materials.add(material);
        for (const value of Object.values(material)) {
          if (value instanceof THREE.Texture) textures.add(value);
        }
      }
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  textures.forEach((texture) => texture.dispose());
}

function rampHeight(r: Ramp, x: number, z: number): number {
  const t = r.axis === 'z' ? (z - r.minZ) / (r.maxZ - r.minZ) : (x - r.minX) / (r.maxX - r.minX);
  return r.y0 + (r.y1 - r.y0) * THREE.MathUtils.clamp(t, 0, 1);
}

function buildRampMesh(r: Ramp, material: THREE.Material): THREE.Mesh {
  const sx = r.maxX - r.minX;
  const sz = r.maxZ - r.minZ;
  const height = Math.max(r.y0, r.y1, 0.01);
  const geometry = new THREE.BoxGeometry(sx, height, sz);
  const position = geometry.attributes.position as THREE.BufferAttribute;
  const cx = (r.minX + r.maxX) / 2;
  const cz = (r.minZ + r.maxZ) / 2;
  for (let i = 0; i < position.count; i++) {
    if (position.getY(i) > 0) {
      position.setY(i, rampHeight(r, position.getX(i) + cx, position.getZ(i) + cz) - height / 2);
    }
  }
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(cx, height / 2, cz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function buildTree(x: number, z: number, scale = 1): THREE.Group {
  const g = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x4f9a3a, roughness: 0.8 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(1.1 * scale, 1.4 * scale, 8 * scale, 8), trunkMat);
  trunk.position.y = 4 * scale;
  trunk.castShadow = true;
  g.add(trunk);
  const blobs: [number, number, number, number][] = [
    [0, 9, 0, 4.2], [2.6, 8, 1, 3], [-2.4, 8.4, -1.2, 2.8], [0.5, 11.6, 0.6, 2.8],
  ];
  for (const [bx, by, bz, r] of blobs) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(r * scale, 12, 10), leafMat);
    leaf.position.set(bx * scale, by * scale, bz * scale);
    leaf.castShadow = true;
    g.add(leaf);
  }
  g.position.set(x, 0, z);
  return g;
}

export function RobloxSandboxCanvas(props: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  const [error, setError] = useState(false);
  latest.current = props;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    } catch {
      setError(true);
      return;
    }

    // ───── Scene, sky, lighting ─────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xa9d3f2);
    scene.fog = new THREE.FogExp2(0xcfe4f2, 0.0014);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.setSize(container.clientWidth, container.clientHeight);
    const canvas = renderer.domElement;
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'application');
    canvas.setAttribute('aria-label', 'Huss Valley tag arena');
    canvas.setAttribute('aria-describedby', 'game-instructions');
    container.appendChild(canvas);
    const maxAniso = renderer.capabilities.getMaxAnisotropy();

    const camera = new THREE.PerspectiveCamera(86, container.clientWidth / container.clientHeight, 0.12, 1600);
    const skyUniforms = {
      sunDir: { value: new THREE.Vector3(0.45, 0.6, 0.35).normalize() },
      zenith: { value: new THREE.Vector3(0.42, 0.66, 0.92) },
      horizon: { value: new THREE.Vector3(0.84, 0.9, 0.94) },
    };
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(1200, 32, 16),
      new THREE.ShaderMaterial({
        uniforms: skyUniforms,
        vertexShader: `varying vec3 vDir; void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
        fragmentShader: `uniform vec3 sunDir; uniform vec3 zenith; uniform vec3 horizon; varying vec3 vDir;
          float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float noise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
            return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
          void main() {
            vec3 d = normalize(vDir);
            float h = pow(max(d.y, 0.0), 0.5);
            vec3 col = mix(horizon, zenith, h);
            if (d.y > 0.02) {
              vec2 uv = d.xz / (d.y + 0.15) * 1.4;
              float n = noise(uv) * 0.6 + noise(uv * 2.3) * 0.3 + noise(uv * 5.1) * 0.1;
              float c = smoothstep(0.58, 0.78, n) * smoothstep(0.02, 0.2, d.y);
              col = mix(col, mix(vec3(1.0), horizon, 0.35), c * 0.85);
            }
            float s = pow(max(dot(d, sunDir), 0.0), 220.0);
            col += vec3(1.0, 0.97, 0.9) * s * 0.5;
            float halo = pow(max(dot(d, sunDir), 0.0), 12.0);
            col += vec3(1.0, 0.98, 0.95) * halo * 0.1;
            gl_FragColor = vec4(col, 1.0);
          }`,
        side: THREE.BackSide,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    scene.add(sky);
    const hemi = new THREE.HemisphereLight(0xdff0ff, 0x6b7a5a, 0.92);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff4dc, 1.7);
    sun.position.set(60, 110, 45);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -130;
    sun.shadow.camera.right = sun.shadow.camera.top = 130;
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 420;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    scene.add(sun, sun.target);

    // ───── Ground (re-skinned per map) ─────
    const grassTex = createMaterialTexture('grass', maxAniso);
    grassTex.repeat.set(160, 160);
    const iceTex = createMaterialTexture('ice', maxAniso);
    iceTex.repeat.set(160, 160);
    const groundMat = new THREE.MeshStandardMaterial({ map: grassTex, color: 0x7fb04a, roughness: 0.95 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // ───── Map parts ─────
    const aabbs = levelToAABBs();
    const obstacles: THREE.Mesh[] = [];
    const matCache = new Map<string, THREE.MeshStandardMaterial>();
    const matFor = (name: MaterialName | undefined, color: number, isTop: boolean) => {
      const key = `${name ?? 'plastic'}-${color}-${isTop ? 't' : 's'}`;
      let m = matCache.get(key);
      if (!m) {
        if (name) {
          m = new THREE.MeshStandardMaterial({
            map: createMaterialTexture(name, maxAniso),
            color,
            roughness: name === 'ice' ? 0.2 : 0.85,
            metalness: name === 'metal' ? 0.2 : 0,
          });
        } else {
          m = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
        }
        matCache.set(key, m);
      }
      return m;
    };

    for (const box of LEVEL_BOXES) {
      const side = matFor(box.material, box.color, false);
      const top = box.top !== undefined ? matFor(box.material, box.top, true) : side;
      const geo = new THREE.BoxGeometry(box.sx, box.sy, box.sz);
      const uv = geo.attributes.uv as THREE.BufferAttribute;
      const dims: [number, number][] = [
        [box.sz, box.sy], [box.sz, box.sy],
        [box.sx, box.sz], [box.sx, box.sz],
        [box.sx, box.sy], [box.sx, box.sy],
      ];
      for (let face = 0; face < 6; face++) {
        const [u, v] = dims[face];
        for (let i = 0; i < 4; i++) {
          const idx = face * 4 + i;
          uv.setXY(idx, (uv.getX(idx) * u) / 8, (uv.getY(idx) * v) / 8);
        }
      }
      uv.needsUpdate = true;
      const mesh = new THREE.Mesh(geo, [side, side, top, side, side, side]);
      mesh.position.set(box.x, box.y, box.z);
      mesh.castShadow = !box.noShadow;
      mesh.receiveShadow = true;
      obstacles.push(mesh);
      scene.add(mesh);
    }
    for (const ramp of LEVEL_RAMPS) {
      const mesh = buildRampMesh(ramp, matFor(ramp.material ?? 'grass', ramp.color ?? 0x7fb04a, false));
      obstacles.push(mesh);
      scene.add(mesh);
    }
    for (const [tx, tz, scale] of TREE_LOCATIONS) scene.add(buildTree(tx, tz, scale));

    // Glowing goal beacons so the far end is always visible across the huge valley
    const startBeacon = new THREE.Mesh(
      new THREE.BoxGeometry(36, 0.35, 3),
      new THREE.MeshBasicMaterial({ color: 0x45e862, transparent: true, opacity: 0.75 }),
    );
    startBeacon.position.set(0, 0.6, VALLEY_BOUNDS.START_LINE_Z);
    scene.add(startBeacon);
    const finishBeacon = new THREE.Mesh(
      new THREE.BoxGeometry(36, 0.35, 3),
      new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.8 }),
    );
    finishBeacon.position.set(0, 0.6, VALLEY_BOUNDS.FINISH_LINE_Z);
    scene.add(finishBeacon);
    scene.updateMatrixWorld(true);

    // ───── Player & AI roster ─────
    const character = new R6Character();
    character.headMesh.scale.setScalar(1.3);
    scene.add(character.root);
    const player = new PlayerController(aabbs, LEVEL_RAMPS);

    const BOT_LANES = [-42, -18, 14, 44, -76, 78, 60];
    const bots: ValleyBot[] = BOT_LANES.map(
      (lane, i) => new ValleyBot(`bot${i}`, game.state.roster[i + 1].name, aabbs, LEVEL_RAMPS, lane, i),
    );
    for (const bot of bots) scene.add(bot.root);
    const botById = new Map(bots.map((b) => [b.id, b]));

    // The player's shirt follows their role: blue runner, red chaser.
    const torsoMats = character.torsoMesh.material as THREE.MeshPhysicalMaterial[];
    const frontMap = torsoMats[4].map;
    let appliedRole: Role = 'runner';
    const setPlayerRole = (role: Role) => {
      const chaser = role === 'tagger';
      torsoMats[0].color.set(chaser ? 0xc4281c : 0x0d69ac);
      torsoMats[4].map = chaser ? null : frontMap;
      torsoMats[4].color.set(chaser ? 0xc4281c : 0xffffff);
      torsoMats[4].needsUpdate = true;
      for (const leg of [character.leftLegMesh, character.rightLegMesh]) {
        (leg.material as THREE.MeshPhysicalMaterial).color.set(chaser ? 0x222328 : 0xa4bd47);
      }
      appliedRole = role;
    };

    const applyTheme = (id: MapId) => {
      const t = THEMES[id];
      skyUniforms.zenith.value.set(...t.zenith);
      skyUniforms.horizon.value.set(...t.horizon);
      skyUniforms.sunDir.value.set(...t.sunDir).normalize();
      (scene.fog as THREE.FogExp2).color.set(t.fog);
      hemi.color.set(t.hemiSky);
      hemi.groundColor.set(t.hemiGround);
      sun.color.set(t.sun);
      sun.intensity = t.sunIntensity;
      groundMat.color.set(t.ground);
      groundMat.map = t.groundTexture === 'ice' ? iceTex : grassTex;
      groundMat.roughness = t.ice ? 0.25 : 0.95;
      groundMat.needsUpdate = true;
      renderer.toneMappingExposure = t.exposure;
      player.iceAll = t.ice;
      for (const b of bots) b.body.iceAll = t.ice;
      sunOffset = t.sunOffset;
    };
    let sunOffset: [number, number, number] = THEMES.valley.sunOffset;

    /** Moves everyone to their spawn for the roles the round director just assigned. */
    const placeEveryone = () => {
      for (const p of game.state.roster) {
        const chaser = p.role === 'tagger';
        if (p.isPlayer) {
          if (chaser) player.reset(0, 0.5, 12);
          else player.reset(0, 0.5, 188);
          continue;
        }
        const bot = botById.get(p.id);
        if (!bot) continue;
        if (chaser) bot.place((Math.random() - 0.5) * 40, 14 + Math.random() * 6, 'chaser');
        else bot.place(BOT_LANES[bots.indexOf(bot)], 184 + Math.random() * 4, 'runner');
      }
    };
    // Lobby spawn: everyone waits at the start line
    for (let i = 0; i < bots.length; i++) bots[i].place(BOT_LANES[i], 184 + (i % 3) * 2, 'runner');
    player.reset(0, 0.5, 188);

    // ───── Confetti ─────
    type ConfettiPiece = { mesh: THREE.Mesh; v: THREE.Vector3; spin: THREE.Vector3; life: number };
    const confettiPieces: ConfettiPiece[] = [];
    const confettiGeo = new THREE.BoxGeometry(0.5, 0.5, 0.08);
    const confettiMats = [0xff6fd8, 0xffd23a, 0x7cf2ff, 0x73f27e, 0xff5a4e].map(
      (c) => new THREE.MeshBasicMaterial({ color: c }),
    );
    const spawnConfetti = (x: number, y: number, z: number, count: number) => {
      for (let i = 0; i < count; i++) {
        if (confettiPieces.length > 320) break;
        const mesh = new THREE.Mesh(confettiGeo, confettiMats[i % confettiMats.length]);
        mesh.position.set(x, y, z);
        scene.add(mesh);
        const a = Math.random() * Math.PI * 2;
        const sp = 12 + Math.random() * 20;
        confettiPieces.push({
          mesh,
          v: new THREE.Vector3(Math.cos(a) * sp * 0.6, 16 + Math.random() * 18, Math.sin(a) * sp * 0.6),
          spin: new THREE.Vector3(Math.random() * 12, Math.random() * 12, Math.random() * 12),
          life: 2.6 + Math.random() * 1.4,
        });
      }
    };

    const shield = new THREE.Mesh(
      new THREE.SphereGeometry(3.2, 20, 14),
      new THREE.MeshBasicMaterial({ color: 0x7fd7ff, transparent: true, opacity: 0.22, depthWrite: false }),
    );
    scene.add(shield);
    const tagRing = new THREE.Mesh(
      new THREE.RingGeometry(3.8, 4.2, 32),
      new THREE.MeshBasicMaterial({ color: 0xff5a4e, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false }),
    );
    tagRing.rotation.x = -Math.PI / 2;
    scene.add(tagRing);

    // ───── Input + camera state ─────
    const keys = new Set<string>();
    const ray = new THREE.Raycaster();
    const pivot = new THREE.Vector3();
    const desiredCamera = new THREE.Vector3();
    const rayDirection = new THREE.Vector3();
    const cameraLook = new THREE.Vector3();
    let yaw = 0; // look north (-Z) up the valley from the start line
    let pitch = -0.2;
    let distance = 12.5;
    let cameraHeight = 3.65;
    let shoulder = 0;
    let charYaw = Math.PI; // faces -Z, the same way the camera looks
    let landingCompression = 0;
    let fovKick = 0;
    let tilt = 0;
    let dragging = false;
    let wasPointerLocked = false;
    let discardLockDelta = false;
    let lastMouseX = 0;
    let lastMouseY = 0;
    let lastTime = performance.now();
    let frame = 0;
    let prevPhase = game.state.phase;
    let lastCountdown = -1;
    let tauntTimer = 4;
    let prevHeading = Math.PI;
    let sharpTurnAccum = 0;
    let sharpTurnTimer = 0;
    let freezeBots = false;

    const syncPointerLock = () => {
      const locked = document.pointerLockElement === canvas;
      if (locked !== wasPointerLocked) {
        wasPointerLocked = locked;
        discardLockDelta = locked;
      }
      return locked;
    };
    const requestLock = () => {
      if (document.pointerLockElement === canvas) return;
      try {
        canvas.requestPointerLock()?.catch(() => {});
      } catch {
        // Drag-to-look fallback
      }
    };
    const clearInput = () => {
      keys.clear();
      player.clearInput();
      dragging = false;
    };

    /** Heading (as a character yaw) that matches a camera yaw, so the rig faces where you look. */
    const headingFor = (cameraYaw: number) => Math.atan2(-Math.sin(cameraYaw), -Math.cos(cameraYaw));

    const getWish = () => {
      const forward = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'));
      const sideways = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
      const fx = -Math.sin(yaw);
      const fz = -Math.cos(yaw);
      const rx = Math.cos(yaw);
      const rz = -Math.sin(yaw);
      return { forward, sideways, fx, fz, rx, rz, wx: fx * forward + rx * sideways, wz: fz * forward + rz * sideways };
    };

    const down = (event: KeyboardEvent) => {
      soundFX.unlock();
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const code = event.code;
      if (/^(Space|Arrow|Shift)/.test(code)) event.preventDefault();
      if (event.repeat || keys.has(code)) return;
      keys.add(code);
      if (code === 'Space') player.queueJump();
      else if (code === 'KeyC') player.queueSlide();
      else if (code === 'KeyF') player.queueDive();
      else if (code === 'Digit1' || code === 'Digit2' || code === 'Digit3') {
        if (game.state.phase === 'intermission') {
          game.vote(MAPS[Number(code.slice(5)) - 1].id);
          soundFX.playVote();
        }
      } else if (code === 'KeyE' || code === 'KeyQ') {
        const w = getWish();
        const dx = w.wx !== 0 || w.wz !== 0 ? w.wx : w.fx;
        const dz = w.wx !== 0 || w.wz !== 0 ? w.wz : w.fz;
        if (game.state.phase !== 'intro' && player.queueDash(dx, dz)) {
          soundFX.playDash();
          fovKick = Math.min(10, fovKick + 6);
        }
      } else if (code === 'KeyR') {
        // Back to your spawn for the current role (never changes the round)
        const chaser = game.state.role === 'tagger';
        player.reset(0, 0.5, chaser ? 12 : 188);
        yaw = chaser ? Math.PI : 0;
        charYaw = headingFor(yaw);
        landingCompression = 0;
        fovKick = 0;
      } else if (code === 'ShiftLeft' || code === 'ShiftRight') {
        const locked = document.pointerLockElement !== canvas;
        latest.current.onSetShiftLocked(locked);
        if (locked) requestLock();
        else document.exitPointerLock();
      }
    };
    const up = (event: KeyboardEvent) => {
      keys.delete(event.code);
      if (event.code === 'Space') player.releaseJump();
    };

    /** Chaser click: infect the nearest unfinished runner within reach. */
    const tryInfectByClick = () => {
      const s = game.state;
      if (s.role !== 'tagger' || s.phase !== 'playing') return;
      for (const bot of bots) {
        if (bot.role !== 'runner' || bot.finished) continue;
        const safe = bot.body.z >= VALLEY_BOUNDS.START_LINE_Z + 1 || bot.body.z <= VALLEY_BOUNDS.FINISH_LINE_Z - 1;
        if (safe) continue;
        const d = Math.hypot(player.x - bot.body.x, player.y - bot.body.y, player.z - bot.body.z);
        if (d < 5.0 && game.infect(bot.id, 'you')) {
          bot.convertToChaser();
          soundFX.playTag(true);
          spawnConfetti(bot.body.x, bot.body.y + 2, bot.body.z, 24);
          break;
        }
      }
    };
    const mouseDown = (event: MouseEvent) => {
      soundFX.unlock();
      if (event.target !== canvas) return;
      canvas.focus({ preventScroll: true });
      dragging = true;
      lastMouseX = event.clientX;
      lastMouseY = event.clientY;
      if (latest.current.shiftLocked) requestLock();
      tryInfectByClick();
    };
    const mouseUp = () => { dragging = false; };
    const mouseMove = (event: MouseEvent) => {
      const locked = syncPointerLock();
      if (!locked && !dragging) return;
      if (locked && discardLockDelta) {
        if (event.movementX !== 0 || event.movementY !== 0) discardLockDelta = false;
        return;
      }
      const dx = locked ? event.movementX : event.clientX - lastMouseX;
      const dy = locked ? event.movementY : event.clientY - lastMouseY;
      lastMouseX = event.clientX;
      lastMouseY = event.clientY;
      yaw -= dx * 0.003;
      pitch = THREE.MathUtils.clamp(pitch - dy * 0.003, -1.35, 0.7);
    };
    const wheel = (event: WheelEvent) => {
      distance = THREE.MathUtils.clamp(distance + event.deltaY * 0.012, 5, 25);
    };
    const contextMenu = (event: MouseEvent) => event.preventDefault();
    const lockChange = () => {
      if (!syncPointerLock()) {
        latest.current.onSetShiftLocked(false);
        dragging = false;
      }
    };
    const visibility = () => {
      clearInput();
      lastTime = performance.now();
    };
    const resize = () => {
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clearInput);
    window.addEventListener('mousedown', mouseDown);
    window.addEventListener('mouseup', mouseUp);
    window.addEventListener('mousemove', mouseMove);
    canvas.addEventListener('wheel', wheel, { passive: true });
    canvas.addEventListener('contextmenu', contextMenu);
    document.addEventListener('pointerlockchange', lockChange);
    document.addEventListener('visibilitychange', visibility);

    type TestEvent = { type: string; speed: number; vx: number; vy: number; y: number; chain: number; grounded: boolean };
    const testApi = import.meta.env.DEV && new URLSearchParams(location.search).has('test')
      ? {
          player,
          bots,
          camera,
          scene,
          game,
          events: [] as TestEvent[],
          freezeBots: false,
          setYaw: (v: number) => { yaw = v; },
        }
      : null;
    const testWindow = window as Window & { __sandboxTest?: NonNullable<typeof testApi> };
    if (testApi) testWindow.__sandboxTest = testApi;

    const onPhaseChange = (from: string, to: string) => {
      const s = game.state;
      if (to === 'intro') {
        applyTheme(s.mapId);
        placeEveryone();
        yaw = s.role === 'tagger' ? Math.PI : 0;
        charYaw = headingFor(yaw);
        pitch = -0.2;
        lastCountdown = -1;
        soundFX.playRoundStart();
      } else if (to === 'playing') {
        soundFX.playTick(0);
        fovKick = Math.min(10, fovKick + 8);
        tauntTimer = 4;
      } else if (to === 'results' && s.result) {
        const good = ['escaped', 'survived', 'chasers-win'].includes(s.result.outcome);
        if (good) {
          soundFX.playSurvive();
          spawnConfetti(player.x, player.y + 2, player.z, 140);
        } else {
          soundFX.playMeme('dun-dun', 0.7, 1000);
        }
      } else if (to === 'intermission' && from !== 'intermission') {
        // Lobby: everyone back to a relaxed start-line crowd, and the map resets to the classic look
        for (let i = 0; i < bots.length; i++) bots[i].place(BOT_LANES[i], 184 + (i % 3) * 2, 'runner');
        player.reset(0, 0.5, 188);
        yaw = 0;
        charYaw = headingFor(yaw);
        applyTheme('valley');
      }
    };

    const animate = (now: number) => {
      frame = requestAnimationFrame(animate);
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      const state = game.state;
      const phase = state.phase;
      const playing = phase === 'playing';
      const frozen = phase === 'intro';
      const faceCamera = latest.current.shiftLocked;
      freezeBots = testApi ? testApi.freezeBots : false;

      if (phase !== prevPhase) {
        onPhaseChange(prevPhase, phase);
        prevPhase = phase;
      }
      if (state.role !== appliedRole) setPlayerRole(state.role);

      // Intro countdown beeps: 3, 2, 1
      if (phase === 'intro') {
        const n = Math.ceil(state.phaseTime);
        if (n !== lastCountdown && n <= 3 && n > 0) {
          lastCountdown = n;
          soundFX.playTick(n);
        }
      }

      const { forward, sideways, fx, fz, rx, rz, wx, wz } = getWish();
      if (frozen) player.clearInput();
      const events = player.step(dt, frozen ? 0 : wx, frozen ? 0 : wz, !frozen && (forward !== 0 || sideways !== 0));

      const inSafeZone =
        playing &&
        state.role === 'runner' &&
        (state.finished || player.z >= VALLEY_BOUNDS.START_LINE_Z + 1 || player.z <= VALLEY_BOUNDS.FINISH_LINE_Z - 1);

      let dashedThisFrame = false;
      const bounced = events.some((event) => event.type === 'PERFECT_JUMP');
      for (const event of events) {
        if (testApi) {
          testApi.events.push({
            type: event.type, speed: player.speed, vx: player.vx, vy: player.vy,
            y: player.y, chain: player.chain, grounded: player.grounded,
          });
          if (testApi.events.length > 100) testApi.events.shift();
        }
        switch (event.type) {
          case 'PERFECT_JUMP': soundFX.playPerfect(player.chain); fovKick = Math.min(10, fovKick + 4); break;
          case 'WALL_JUMP': soundFX.playWallJump(); fovKick = Math.min(10, fovKick + 5); break;
          case 'MANTLE': soundFX.playMantle(); fovKick = Math.min(10, fovKick + 3); break;
          case 'SLIDE_START': case 'WALLRUN_START': soundFX.playSlide(); break;
          case 'DASH':
            dashedThisFrame = true;
            spawnConfetti(player.x, player.y + 0.5, player.z, 10);
            break;
          case 'BOUNCE':
            soundFX.playBoing();
            fovKick = Math.min(10, fovKick + 6);
            spawnConfetti(player.x, player.y + 0.4, player.z, 18);
            break;
          case 'DIVE': soundFX.playJump(0); fovKick = Math.min(10, fovKick + 6); break;
          case 'DIVE_LAND': soundFX.playLand(0.9); landingCompression = 0.5; fovKick = Math.min(10, fovKick + 5); break;
          case 'LAND':
            if (!bounced) {
              landingCompression = Math.min(0.5, event.impact / 110);
              soundFX.playLand(Math.min(0.7, event.impact / 80));
            }
            break;
          default: break;
        }
      }
      landingCompression = THREE.MathUtils.damp(landingCompression, 0, 20, dt);

      // Track sharp jukes for ankle-break detection
      if (player.speed > 10) {
        const heading = Math.atan2(player.vz, player.vx);
        const turnDelta = Math.abs(angleDifference(prevHeading, heading));
        prevHeading = heading;
        sharpTurnAccum = sharpTurnTimer > 0 ? sharpTurnAccum + turnDelta : turnDelta;
        sharpTurnTimer = 0.25;
      } else {
        sharpTurnTimer = Math.max(0, sharpTurnTimer - dt);
        if (sharpTurnTimer === 0) sharpTurnAccum = 0;
      }

      // ───── AI bots ─────
      if (playing && !freezeBots) {
        for (const bot of bots) {
          bot.update(dt, player, state.role, inSafeZone, bots);
          while (bot.crossingsReported < bot.crossings) {
            bot.crossingsReported++;
            game.completeCrossing(bot.id);
          }
        }

        // Chasers shout goofy taunts at the player
        tauntTimer -= dt;
        if (tauntTimer <= 0 && state.role === 'runner' && !state.finished) {
          const near = bots.filter(
            (b) => b.role === 'chaser' && Math.hypot(b.body.x - player.x, b.body.z - player.z) < 60,
          );
          if (near.length > 0) {
            const chaser = near[Math.floor(Math.random() * near.length)];
            const key = soundFX.playTaunt();
            game.taunt(chaser.name, MEME_CAPTIONS[key]);
          }
          tauntTimer = 5 + Math.random() * 4;
        }

        // AI chasers infecting AI runners
        for (const c of bots) {
          if (c.role !== 'chaser' || c.stumbleTimer > 0 || c.tagCooldown > 0) continue;
          for (const r of bots) {
            if (r.role !== 'runner' || r.finished) continue;
            const rSafe =
              r.body.z >= VALLEY_BOUNDS.START_LINE_Z + 1 || r.body.z <= VALLEY_BOUNDS.FINISH_LINE_Z - 1;
            if (rSafe) continue;
            const d = Math.hypot(c.body.x - r.body.x, c.body.y - r.body.y, c.body.z - r.body.z);
            if (d < 3.4 && game.infect(r.id, c.id)) {
              r.convertToChaser();
              break;
            }
          }
        }

        // Player as chaser: touching a runner infects them (clicking works too)
        if (state.role === 'tagger') {
          for (const r of bots) {
            if (r.role !== 'runner' || r.finished) continue;
            const rSafe =
              r.body.z >= VALLEY_BOUNDS.START_LINE_Z + 1 || r.body.z <= VALLEY_BOUNDS.FINISH_LINE_Z - 1;
            if (rSafe) continue;
            const d = Math.hypot(player.x - r.body.x, player.y - r.body.y, player.z - r.body.z);
            if (d < 3.2 && game.infect(r.id, 'you')) {
              r.convertToChaser();
              soundFX.playTag(true);
              spawnConfetti(r.body.x, r.body.y + 2, r.body.z, 24);
            }
          }
        }
      } else {
        for (const bot of bots) bot.idle(dt);
      }

      // Player crossing progression
      if (playing && state.role === 'runner' && !state.finished) {
        const reached =
          (state.targetZone === 'finish' && player.z <= VALLEY_BOUNDS.FINISH_LINE_Z - 1) ||
          (state.targetZone === 'start' && player.z >= VALLEY_BOUNDS.START_LINE_Z + 1);
        if (reached) {
          const outcome = game.completeCrossing('you');
          if (outcome === 'finished') {
            soundFX.playSurvive();
            soundFX.playMeme('vine-boom', 0.65, 1000);
            spawnConfetti(player.x, player.y + 2, player.z, 140);
          } else if (outcome === 'crossing') {
            soundFX.playCrossing(game.state.crossings);
          }
        }
      }

      // Nearest relevant target: the closest chaser for a runner, the closest runner for a chaser
      let nearestDist = Infinity;
      let nearest: ValleyBot | null = null;
      for (const bot of bots) {
        const wanted = state.role === 'runner' ? bot.role === 'chaser' : bot.role === 'runner' && !bot.finished;
        if (!wanted) continue;
        const d = Math.hypot(player.x - bot.body.x, player.y - bot.body.y, player.z - bot.body.z);
        if (d < nearestDist) {
          nearestDist = d;
          nearest = bot;
        }
        if (
          playing && state.role === 'runner' && bot.role === 'chaser' && !inSafeZone &&
          bot.stumbleTimer <= 0 && d < 3.3 && game.infect('you', bot.id)
        ) {
          soundFX.playTag(false);
          fovKick = Math.min(10, fovKick + 8);
        }
        // Ankle breaker: a dash or a sharp juke right next to a chaser
        if (
          playing && state.role === 'runner' && bot.role === 'chaser' && !inSafeZone &&
          bot.ankleCooldown <= 0 && bot.stumbleTimer <= 0 && d < 15 &&
          (dashedThisFrame || (sharpTurnAccum > 1.35 && player.speed >= 42))
        ) {
          bot.triggerStumble();
          sharpTurnAccum = 0;
          const sound = soundFX.playAnkleBreaker();
          game.recordAnkleBreak(bot.name, MEME_CAPTIONS[sound]);
          fovKick = Math.min(10, fovKick + 5);
        }
      }

      game.tick(dt, { nearestThreat: nearestDist, inSafeZone });

      // Publish live positions for the HUD (valley strip + off-screen arrow)
      (window as unknown as { __hussRoster?: unknown }).__hussRoster = game.state.roster.map((p) => ({
        id: p.id,
        name: p.name,
        isPlayer: p.isPlayer,
        role: p.role,
        finished: p.finished,
        z: p.isPlayer ? player.z : (botById.get(p.id)?.body.z ?? 0),
      }));

      // ───── Player rig ─────
      const previousYaw = charYaw;
      const targetYaw =
        faceCamera && !player.sliding
          ? Math.atan2(fx, fz)
          : player.speed > 1 ? Math.atan2(player.vx, player.vz) : charYaw;
      charYaw += angleDifference(charYaw, targetYaw) * (1 - Math.exp(-28 * dt));
      const turnRate = angleDifference(previousYaw, charYaw) / Math.max(dt, 0.001);
      character.root.position.set(player.x, player.y, player.z);
      character.root.rotation.y = charYaw;
      const footstep = character.update({
        dt,
        speedRatio: Math.min(1.4, player.speed / MOVEMENT.BASE_SPEED),
        isGrounded: player.grounded,
        verticalVelocity: player.vy,
        isSliding: player.sliding,
        strafeAmount: faceCamera ? sideways : 0,
        forwardAmount: faceCamera ? forward : 1,
        turnRate,
        landingSquash: landingCompression,
        mantling: player.mantling,
        vaultProgress: player.vaultProgress,
        wallSliding: player.wallSliding,
        wallRunning: player.wallRunning,
        wallRunLean: player.wallNX,
        wallKicking: player.wallKicking,
        diving: player.diving,
      });
      if (footstep && player.grounded && !player.sliding) {
        soundFX.playFootstep(0.95 + 0.12 * Math.min(1, player.speed / MOVEMENT.BASE_SPEED) + Math.random() * 0.05);
      }

      shield.visible = playing && (state.ntb > 0 || inSafeZone);
      if (shield.visible) {
        shield.position.set(player.x, player.y + 2.6, player.z);
        (shield.material as THREE.MeshBasicMaterial).color.set(inSafeZone ? 0x5df27a : 0x7fd7ff);
        (shield.material as THREE.MeshBasicMaterial).opacity = 0.12 + 0.1 * Math.abs(Math.sin(now * 0.005));
      }
      tagRing.visible = playing && state.role === 'tagger';
      if (tagRing.visible) {
        tagRing.position.set(player.x, player.y + 0.06, player.z);
        tagRing.rotation.z = now * 0.001;
      }

      // ───── Camera ─────
      fovKick = THREE.MathUtils.damp(fovKick, 0, 6, dt);
      const speedKick = Math.min(9, Math.max(0, player.speed - 48) * 0.075);
      const newFov = THREE.MathUtils.damp(camera.fov, 86 + speedKick + fovKick, 6, dt);
      if (Math.abs(camera.fov - newFov) > 0.005) {
        camera.fov = newFov;
        camera.updateProjectionMatrix();
      }
      const tiltTarget =
        THREE.MathUtils.clamp(-turnRate * 0.01, -0.08, 0.08) + (player.wallRunning ? player.wallNX * 0.12 : 0);
      tilt = THREE.MathUtils.damp(tilt, tiltTarget, 8, dt);
      cameraHeight = THREE.MathUtils.damp(cameraHeight, player.sliding ? 2.1 : 3.65, 24, dt);
      shoulder = THREE.MathUtils.damp(shoulder, latest.current.shiftLocked ? 1.45 : 0, 20, dt);
      const lx = fx * Math.cos(pitch);
      const ly = Math.sin(pitch);
      const lz = fz * Math.cos(pitch);
      pivot.set(player.x, player.y + cameraHeight, player.z);
      desiredCamera.set(
        pivot.x - lx * distance + rx * shoulder,
        Math.max(0.5, pivot.y - ly * distance),
        pivot.z - lz * distance + rz * shoulder,
      );
      rayDirection.subVectors(desiredCamera, pivot);
      let actualDistance = rayDirection.length();
      rayDirection.normalize();
      ray.set(pivot, rayDirection);
      ray.far = actualDistance + 0.3;
      const hits = ray.intersectObjects(obstacles, false);
      if (hits.length) actualDistance = Math.max(0.15, Math.min(actualDistance, hits[0].distance - 0.35));
      camera.position.copy(pivot).addScaledVector(rayDirection, actualDistance);
      cameraLook.set(pivot.x + lx * 30 + rx * shoulder, pivot.y + ly * 30, pivot.z + lz * 30 + rz * shoulder);
      character.root.visible = actualDistance > 2;
      camera.lookAt(cameraLook);
      camera.rotateZ(tilt);

      if (nearest) {
        const projected = new THREE.Vector3(nearest.body.x, nearest.body.y + 2.5, nearest.body.z).project(camera);
        (window as unknown as { __chaserScreen?: unknown }).__chaserScreen = {
          x: (projected.x * 0.5 + 0.5) * container.clientWidth,
          y: (-projected.y * 0.5 + 0.5) * container.clientHeight,
          onScreen: projected.z < 1 && Math.abs(projected.x) < 0.92 && Math.abs(projected.y) < 0.92,
          dist: nearestDist,
        };
      }

      for (let i = confettiPieces.length - 1; i >= 0; i--) {
        const c = confettiPieces[i];
        c.life -= dt;
        c.v.y -= 22 * dt;
        c.v.multiplyScalar(1 - 0.6 * dt);
        c.mesh.position.addScaledVector(c.v, dt);
        c.mesh.rotation.x += c.spin.x * dt;
        c.mesh.rotation.y += c.spin.y * dt;
        c.mesh.rotation.z += c.spin.z * dt;
        if (c.life <= 0 || c.mesh.position.y < -0.5) {
          scene.remove(c.mesh);
          confettiPieces.splice(i, 1);
        }
      }

      sky.position.copy(camera.position);
      sun.position.set(player.x + sunOffset[0], player.y + sunOffset[1], player.z + sunOffset[2]);
      sun.target.position.set(player.x, player.y, player.z);
      sun.target.updateMatrixWorld();
      renderer.render(scene, camera);
      movementStore.frame(player.speed, player.chain, player.sliding, player.grounded, player.dashCooldown);
    };
    frame = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clearInput);
      window.removeEventListener('mousedown', mouseDown);
      window.removeEventListener('mouseup', mouseUp);
      window.removeEventListener('mousemove', mouseMove);
      canvas.removeEventListener('wheel', wheel);
      canvas.removeEventListener('contextmenu', contextMenu);
      document.removeEventListener('pointerlockchange', lockChange);
      document.removeEventListener('visibilitychange', visibility);
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      if (testWindow.__sandboxTest?.player === player) delete testWindow.__sandboxTest;
      disposeScene(scene);
      sun.shadow.dispose();
      renderer.dispose();
      canvas.remove();
    };
  }, []);

  return (
    <div className="game-canvas" ref={containerRef}>
      {error && <p role="alert">WebGL is unavailable. Enable hardware acceleration in your browser to play.</p>}
    </div>
  );
}
