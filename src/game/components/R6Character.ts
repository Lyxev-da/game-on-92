import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { createGoofyFaceTexture } from '../utils/characterTextures';
import { createR6TorsoFrontTexture } from '../utils/robloxTextures';

export interface CharacterAnimationInput {
  dt: number;
  speedRatio: number;
  isGrounded: boolean;
  verticalVelocity: number;
  isSliding: boolean;
  strafeAmount: number;
  forwardAmount: number;
  turnRate: number;
  landingSquash: number;
  mantling: boolean;
  vaultProgress: number;
  wallSliding: boolean;
  wallRunning: boolean;
  /** -1..1 wall side, used to lean the torso while wall running */
  wallRunLean: number;
  /** Just kicked off a wall: brief arched kick pose */
  wallKicking: boolean;
  diving: boolean;
}

type PoseKey =
  | 'hip' | 'torsoPitch' | 'torsoRoll' | 'torsoYaw' | 'headPitch' | 'headYaw'
  | 'lArmPitch' | 'rArmPitch' | 'lArmRoll' | 'rArmRoll'
  | 'lLegPitch' | 'rLegPitch' | 'lLegRoll' | 'rLegRoll';
type Pose = Record<PoseKey, number>;

const REST: Pose = {
  hip: 0, torsoPitch: 0, torsoRoll: 0, torsoYaw: 0, headPitch: 0, headYaw: 0,
  lArmPitch: 0, rArmPitch: 0, lArmRoll: 0.08, rArmRoll: -0.08,
  lLegPitch: 0, rLegPitch: 0, lLegRoll: 0, rLegRoll: 0,
};

const EDGE_RADIUS = 0.1;
const block = (w: number, h: number, d: number) => new RoundedBoxGeometry(w, h, d, 3, EDGE_RADIUS);

/** Glossy Roblox-style plastic. */
const plastic = (color: number) =>
  new THREE.MeshPhysicalMaterial({ color, roughness: 0.42, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.3 });

/**
 * Convention: rotation.x > 0 leans or swings a part forward (+Z), rotation.x < 0 swings it back.
 * The hip group never drops far enough for a posed limb to sink below the floor.
 */
export class R6Character {
  public root = new THREE.Group();
  public hipGroup = new THREE.Group();
  public torsoPivot = new THREE.Group();
  public neckPivot = new THREE.Group();
  public leftShoulder = new THREE.Group();
  public rightShoulder = new THREE.Group();
  public leftHip = new THREE.Group();
  public rightHip = new THREE.Group();

  public headMesh: THREE.Mesh;
  public torsoMesh: THREE.Mesh;
  public leftArmMesh: THREE.Mesh;
  public rightArmMesh: THREE.Mesh;
  public leftLegMesh: THREE.Mesh;
  public rightLegMesh: THREE.Mesh;

  private runPhase = 0;
  private idlePhase = 0;
  private lastStepHalfCycle = 0;
  private cur: Pose = { ...REST };

  constructor() {
    this.root.add(this.hipGroup);
    this.hipGroup.position.set(0, 2.0, 0);

    const yellow = plastic(0xf5cd30);
    const face = new THREE.MeshPhysicalMaterial({
      map: createGoofyFaceTexture(),
      roughness: 0.42,
      clearcoat: 0.35,
      clearcoatRoughness: 0.3,
    });
    const blue = plastic(0x0d69ac);
    const torsoFront = new THREE.MeshPhysicalMaterial({
      map: createR6TorsoFrontTexture(),
      roughness: 0.42,
      clearcoat: 0.35,
      clearcoatRoughness: 0.3,
    });
    const green = plastic(0xa4bd47);

    // Torso: 2 x 2 x 1 studs
    this.hipGroup.add(this.torsoPivot);
    this.torsoMesh = new THREE.Mesh(block(2, 2, 1), [blue, blue, blue, blue, torsoFront, blue]);
    this.torsoMesh.position.set(0, 1, 0);
    this.torsoPivot.add(this.torsoMesh);

    // Head: 1.22 cube, face on +Z
    this.torsoPivot.add(this.neckPivot);
    this.neckPivot.position.set(0, 2.02, 0);
    this.headMesh = new THREE.Mesh(block(1.22, 1.22, 1.22), [yellow, yellow, yellow, yellow, face, yellow]);
    this.headMesh.position.set(0, 0.62, 0);
    this.neckPivot.add(this.headMesh);

    // Arms: character Left = +X, character Right = -X
    const armGeo = block(1, 2, 1);
    this.torsoPivot.add(this.leftShoulder);
    this.leftShoulder.position.set(1.52, 1.75, 0);
    this.leftArmMesh = new THREE.Mesh(armGeo, yellow);
    this.leftArmMesh.position.set(0, -0.75, 0);
    this.leftShoulder.add(this.leftArmMesh);

    this.torsoPivot.add(this.rightShoulder);
    this.rightShoulder.position.set(-1.52, 1.75, 0);
    this.rightArmMesh = new THREE.Mesh(armGeo, yellow);
    this.rightArmMesh.position.set(0, -0.75, 0);
    this.rightShoulder.add(this.rightArmMesh);

    // Legs
    const legGeo = block(0.98, 2, 1);
    this.hipGroup.add(this.leftHip);
    this.leftHip.position.set(0.51, 0, 0);
    this.leftLegMesh = new THREE.Mesh(legGeo, green);
    this.leftLegMesh.position.set(0, -1, 0);
    this.leftHip.add(this.leftLegMesh);

    this.hipGroup.add(this.rightHip);
    this.rightHip.position.set(-0.51, 0, 0);
    this.rightLegMesh = new THREE.Mesh(legGeo, green);
    this.rightLegMesh.position.set(0, -1, 0);
    this.rightHip.add(this.rightLegMesh);

    for (const mesh of [this.torsoMesh, this.headMesh, this.leftArmMesh, this.rightArmMesh, this.leftLegMesh, this.rightLegMesh]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  }

  /** Leg swing with a knee lift on the forward leg. */
  private legPitch(s: number, amp: number, ratio: number): number {
    return s * amp * Math.min(1, ratio);
  }

  /** Updates the pose. Returns true on a footstep. */
  public update(input: CharacterAnimationInput): boolean {
    const {
      dt, speedRatio, isGrounded, verticalVelocity, isSliding, strafeAmount, forwardAmount,
      turnRate, landingSquash, mantling, vaultProgress, wallSliding, wallRunning, wallRunLean,
      wallKicking, diving,
    } = input;

    let triggered = false;
    this.idlePhase += dt * 2.4;
    const ratio = THREE.MathUtils.clamp(speedRatio, 0, 1.4);
    const t: Pose = { ...REST };

    if (wallRunning) {
      // Running along a wall: lean into it, arms trailing, legs scissoring
      this.runPhase += dt * 18;
      const s = Math.sin(this.runPhase);
      const bounce = Math.abs(Math.cos(this.runPhase));
      t.torsoPitch = 0.22;
      t.torsoRoll = -wallRunLean * 0.3;
      t.torsoYaw = -wallRunLean * 0.12;
      t.headPitch = -0.14;
      t.headYaw = -wallRunLean * 0.25;
      t.lArmPitch = 0.5 + s * 0.25;
      t.rArmPitch = 0.5 - s * 0.25;
      t.lArmRoll = wallRunLean * 0.7;
      t.rArmRoll = -wallRunLean * 0.7;
      t.lLegPitch = s * 0.95 - 0.2;
      t.rLegPitch = -s * 0.95 - 0.2;
      t.hip = bounce * 0.12 - 0.08;
    } else if (wallKicking) {
      // Kick off the wall: arch back, arms swung behind, one leg driving
      t.torsoPitch = -0.35;
      t.headPitch = 0.3;
      t.lArmPitch = 0.9;
      t.rArmPitch = 1.1;
      t.lArmRoll = 0.4;
      t.rArmRoll = -0.4;
      t.lLegPitch = -0.9;
      t.rLegPitch = 0.7;
      t.hip = -0.15;
    } else if (diving) {
      // Superman dive: arms reach forward, body flat
      t.torsoPitch = 0.95;
      t.headPitch = -0.5;
      t.lArmPitch = -2.9;
      t.rArmPitch = -2.9;
      t.lArmRoll = 0.2;
      t.rArmRoll = -0.2;
      t.lLegPitch = -0.25;
      t.rLegPitch = 0.25;
      t.hip = -0.2;
    } else if (isSliding) {
      t.hip = -1.2;
      t.torsoPitch = -0.6;
      t.torsoYaw = 0.22;
      t.headPitch = 0.45;
      t.lArmPitch = -0.8;
      t.rArmPitch = 0.7;
      t.lArmRoll = 0.5;
      t.rArmRoll = -0.5;
      t.lLegPitch = -1.25;
      t.rLegPitch = 0.5;
    } else if (mantling) {
      // Reach up on the vault, then pull the knees in
      const push = THREE.MathUtils.smoothstep(vaultProgress, 0.12, 0.8);
      t.torsoPitch = 0.3 * (1 - push);
      t.headPitch = -t.torsoPitch * 0.8;
      t.lArmPitch = THREE.MathUtils.lerp(-1.35, 0.25, push);
      t.rArmPitch = THREE.MathUtils.lerp(-1.1, 0.45, push);
      t.lArmRoll = 0.12;
      t.rArmRoll = -0.12;
      t.lLegPitch = -0.8 * (1 - push * 0.45);
      t.rLegPitch = 0.45 * (1 - push * 0.4);
    } else if (wallSliding) {
      t.torsoPitch = -0.14;
      t.headPitch = 0.16;
      t.lArmPitch = -1.05;
      t.rArmPitch = -1.05;
      t.lArmRoll = 0.55;
      t.rArmRoll = -0.55;
      t.lLegPitch = -0.6;
      t.rLegPitch = 0.4;
    } else if (!isGrounded) {
      // Jump: reach up on the rise, flare out on the fall
      const up = THREE.MathUtils.clamp(verticalVelocity / 30 + 0.5, 0, 1);
      t.torsoPitch = THREE.MathUtils.lerp(-0.12, 0.26, up);
      t.torsoRoll = THREE.MathUtils.clamp(-turnRate * 0.14 - strafeAmount * 0.12, -0.35, 0.35);
      const lArm = THREE.MathUtils.lerp(-0.3, -1.95, up);
      t.lArmPitch = lArm;
      t.rArmPitch = lArm + 0.12;
      t.lArmRoll = THREE.MathUtils.lerp(0.32, 0.12, up);
      t.rArmRoll = -t.lArmRoll;
      t.lLegPitch = THREE.MathUtils.lerp(-0.12, -0.72, up);
      t.rLegPitch = THREE.MathUtils.lerp(0.12, 0.38, up);
      t.lLegRoll = 0.04;
      t.rLegRoll = -0.04;
      t.headPitch = -t.torsoPitch * 0.55;
    } else if (ratio > 0.05) {
      // Grounded sprint: cadence and stride rise with speed
      const cadence = 12 + ratio * 6;
      const dirSign = forwardAmount < -0.1 ? -1 : 1;
      this.runPhase += dt * cadence * dirSign;
      const half = Math.floor(Math.abs(this.runPhase) / Math.PI);
      if (half !== this.lastStepHalfCycle) {
        this.lastStepHalfCycle = half;
        triggered = true;
      }
      const swing = Math.sin(this.runPhase);
      const bounce = Math.abs(Math.cos(this.runPhase));
      const amp = 0.9 + 0.2 * Math.min(ratio, 1.2);
      t.lLegPitch = this.legPitch(swing, amp, ratio);
      t.rLegPitch = this.legPitch(-swing, amp, ratio);
      // Arms pump opposite the legs, swinging wider at speed
      t.lArmPitch = -swing * amp * 1.05 - 0.15 * ratio - bounce * 0.08;
      t.rArmPitch = swing * amp * 1.05 - 0.15 * ratio - bounce * 0.08;
      t.lArmRoll = 0.12 + swing * 0.06;
      t.rArmRoll = -0.12 - swing * 0.06;
      t.torsoPitch = THREE.MathUtils.clamp(0.24 * ratio, 0, 0.3) * dirSign + bounce * 0.02;
      t.torsoRoll = THREE.MathUtils.clamp(-turnRate * 0.03 - strafeAmount * 0.12, -0.2, 0.2);
      t.torsoYaw = swing * 0.12 * ratio * dirSign - strafeAmount * 0.2 * dirSign;
      t.headYaw = -t.torsoYaw * 0.9;
      t.headPitch = -t.torsoPitch * 0.75 - bounce * 0.03;
      t.hip = bounce * 0.16 * Math.min(ratio, 1.2);
      t.lLegRoll = strafeAmount * 0.1;
      t.rLegRoll = strafeAmount * 0.1;
    } else {
      // Idle breathing
      const breath = Math.sin(this.idlePhase);
      t.hip = breath * 0.03;
      t.torsoPitch = breath * 0.02;
      t.lArmPitch = Math.sin(this.idlePhase * 0.8) * 0.04;
      t.rArmPitch = -Math.sin(this.idlePhase * 0.8) * 0.04;
      t.lArmRoll = 0.07 + breath * 0.025;
      t.rArmRoll = -0.07 - breath * 0.025;
      t.headPitch = -breath * 0.02;
    }

    // Landing squash: knees bend, torso dips, arms flare
    if (landingSquash > 0.001) {
      t.hip -= landingSquash * 0.45;
      t.torsoPitch += landingSquash * 0.22;
      t.lArmRoll += landingSquash * 0.3;
      t.rArmRoll -= landingSquash * 0.3;
      t.lLegPitch -= landingSquash * 0.3;
      t.rLegPitch -= landingSquash * 0.3;
    }

    const keys = Object.keys(this.cur) as PoseKey[];
    for (const key of keys) {
      this.cur[key] = THREE.MathUtils.damp(this.cur[key], t[key], key === 'hip' ? 34 : 30, dt);
    }
    const c = this.cur;

    // Ground clearance: the hip never drops far enough for a posed limb to sink below y=0.
    const legClearance = 2 * Math.max(Math.cos(c.lLegPitch), Math.cos(c.rLegPitch));
    this.hipGroup.position.y = Math.max(2 + c.hip, legClearance) + 0.02;

    this.torsoPivot.rotation.set(c.torsoPitch, c.torsoYaw, c.torsoRoll);
    this.neckPivot.rotation.set(c.headPitch, c.headYaw, 0);
    this.leftShoulder.rotation.set(c.lArmPitch, 0, c.lArmRoll);
    this.rightShoulder.rotation.set(c.rArmPitch, 0, c.rArmRoll);
    this.leftHip.rotation.set(c.lLegPitch, 0, c.lLegRoll);
    this.rightHip.rotation.set(c.rLegPitch, 0, c.rLegRoll);
    return triggered;
  }
}
