// @ts-nocheck -- imported game code written for looser TS settings
import * as THREE from 'three';
import { PlayerController, PLAYER_DIM, type AABB, type Ramp } from './PlayerController';
import { R6Character } from './R6Character';
import { VALLEY_BOUNDS } from './level';
import { CROSSINGS_TO_WIN } from './gameStore';

export type BotRole = 'chaser' | 'runner';

const RUNNER_SHIRT_COLORS = [0x0d69ac, 0x3b9e54, 0xf28c28, 0x7a49a5, 0x26a69a, 0xe85d99, 0xd1b21f];

export class ValleyBot {
  readonly id: string;
  readonly name: string;
  readonly body: PlayerController;
  readonly rig: R6Character;
  readonly root = new THREE.Group();
  role: BotRole;
  crossings = 0;
  /** How many crossings have been reported to the round director. */
  crossingsReported = 0;
  /** True once this runner has made all crossings: it parks safely at the end zone. */
  finished = false;
  targetZ: number = VALLEY_BOUNDS.FINISH_LINE_Z - 12;
  /** Cartoon stumble after the player breaks this chaser's ankles. */
  stumbleTimer = 0;
  ankleCooldown = 0;
  tagCooldown = 0;

  private yaw = Math.PI;
  private strafeDir = 1;
  private strafeTimer = 0;
  private weavePhase = Math.random() * Math.PI * 2;
  private laneOffsetX: number;
  private speedScale: number;
  private colorIndex: number;

  constructor(
    id: string,
    name: string,
    boxes: AABB[],
    ramps: Ramp[],
    laneOffsetX: number,
    colorIndex: number,
  ) {
    this.id = id;
    this.name = name;
    this.role = 'runner';
    this.laneOffsetX = laneOffsetX;
    this.colorIndex = colorIndex;
    this.speedScale = 0.84 + (colorIndex % 3) * 0.04;
    this.body = new PlayerController(boxes, ramps);
    this.rig = new R6Character();
    this.root.add(this.rig.root);
    // Bobblehead proportions: oversized heads read as goofy from the chase camera.
    this.rig.headMesh.scale.setScalar(1.3);
    this.applyOutfit();
  }

  private applyOutfit(): void {
    const chaser = this.role === 'chaser';
    const shirt = chaser ? 0xc4281c : RUNNER_SHIRT_COLORS[this.colorIndex % RUNNER_SHIRT_COLORS.length];
    const pants = chaser ? 0x222328 : 0x5d7a36;
    const torsoMats = this.rig.torsoMesh.material as THREE.MeshPhysicalMaterial[];
    torsoMats[0].color.set(shirt);
    torsoMats[4].map = null;
    torsoMats[4].color.set(shirt);
    torsoMats[4].needsUpdate = true;
    for (const leg of [this.rig.leftLegMesh, this.rig.rightLegMesh]) {
      (leg.material as THREE.MeshPhysicalMaterial).color.set(pants);
    }
  }

  convertToChaser(): void {
    if (this.role === 'chaser') return;
    this.role = 'chaser';
    this.speedScale = 0.91;
    this.tagCooldown = 1.5;
    this.applyOutfit();
  }

  /** Puts the bot at a spawn point for a new round with the role the director assigned. */
  place(x: number, z: number, role: BotRole): void {
    this.role = role;
    this.speedScale = role === 'chaser' ? 0.91 : 0.84 + (this.colorIndex % 3) * 0.04;
    this.applyOutfit();
    this.body.reset(x, 0.5, z);
    this.crossings = 0;
    this.crossingsReported = 0;
    this.finished = false;
    this.targetZ = VALLEY_BOUNDS.FINISH_LINE_Z - 12;
    this.stumbleTimer = 0;
    this.ankleCooldown = 0;
    this.tagCooldown = 0;
    this.root.position.set(x, 0.5, z);
    this.root.rotation.set(0, this.yaw, 0);
  }

  triggerStumble(): void {
    this.stumbleTimer = 0.9;
    this.ankleCooldown = 2.4;
    this.body.vx *= 0.25;
    this.body.vz *= 0.25;
  }

  /** Stand still (lobby, intro, results) while still settling onto the ground and animating. */
  idle(dt: number): void {
    const b = this.body;
    b.step(dt, 0, 0, false);
    this.root.position.set(b.x, b.y, b.z);
    this.root.rotation.set(0, this.yaw, 0);
    this.animate(dt, 0);
  }

  update(
    dt: number,
    player: PlayerController,
    playerRole: 'runner' | 'tagger',
    playerInSafe: boolean,
    others: ValleyBot[],
  ): void {
    const b = this.body;
    this.weavePhase += dt * 2.2;
    this.stumbleTimer = Math.max(0, this.stumbleTimer - dt);
    this.ankleCooldown = Math.max(0, this.ankleCooldown - dt);
    this.tagCooldown = Math.max(0, this.tagCooldown - dt);

    // A runner who finished all crossings stays parked inside the safe zone.
    if (this.finished) {
      this.idle(dt);
      return;
    }

    this.strafeTimer -= dt;
    if (this.strafeTimer <= 0) {
      this.strafeDir = Math.random() < 0.5 ? -1 : 1;
      this.strafeTimer = 1.0 + Math.random() * 1.4;
    }

    let goalX = this.laneOffsetX;
    let goalZ = this.targetZ;

    if (this.role === 'chaser') {
      let bestDist = Infinity;
      if (playerRole === 'runner' && !playerInSafe) {
        bestDist = Math.hypot(player.x - b.x, player.z - b.z);
        goalX = player.x;
        goalZ = player.z;
      }
      for (const r of others) {
        if (r.role !== 'runner' || r.finished) continue;
        const rSafe =
          r.body.z >= VALLEY_BOUNDS.START_LINE_Z + 1 || r.body.z <= VALLEY_BOUNDS.FINISH_LINE_Z - 1;
        if (rSafe) continue;
        const d = Math.hypot(r.body.x - b.x, r.body.z - b.z);
        if (d < bestDist) {
          bestDist = d;
          goalX = r.body.x;
          goalZ = r.body.z;
        }
      }
      if (!Number.isFinite(bestDist)) {
        goalX = Math.sin(this.weavePhase * 0.45) * 60;
        goalZ = Math.cos(this.weavePhase * 0.3) * 70;
      }
      goalZ = Math.max(VALLEY_BOUNDS.FINISH_LINE_Z + 6, Math.min(VALLEY_BOUNDS.START_LINE_Z - 6, goalZ));
    } else {
      // Runner: sprint to the far end zone, flip direction after each crossing, park after the last.
      if (this.targetZ < 0 && b.z <= VALLEY_BOUNDS.FINISH_LINE_Z - 4) {
        this.crossings++;
        this.targetZ = VALLEY_BOUNDS.START_LINE_Z + 12;
      } else if (this.targetZ > 0 && b.z >= VALLEY_BOUNDS.START_LINE_Z + 4) {
        this.crossings++;
        this.targetZ = VALLEY_BOUNDS.FINISH_LINE_Z - 12;
      }
      if (this.crossings >= CROSSINGS_TO_WIN) {
        this.finished = true;
        return;
      }
      goalX = this.laneOffsetX + Math.sin(this.weavePhase * 0.9) * 14;
      goalZ = this.targetZ;
      if (playerRole === 'tagger') {
        const dp = Math.hypot(player.x - b.x, player.z - b.z);
        if (dp < 35) {
          const away = Math.atan2(b.z - player.z, b.x - player.x);
          goalX = b.x + Math.cos(away) * 24;
        }
      }
    }

    const dx = goalX - b.x;
    const dz = goalZ - b.z;
    const dist = Math.hypot(dx, dz);
    const baseAngle = Math.atan2(dz, dx);
    const weave = Math.sin(this.weavePhase) * 0.22 * Math.min(1, dist / 14);
    let wx = Math.cos(baseAngle + weave * this.strafeDir);
    let wz = Math.sin(baseAngle + weave * this.strafeDir);
    if (this.lookAheadBlocked(wx, wz)) {
      wx = Math.cos(baseAngle + (Math.PI / 2) * this.strafeDir);
      wz = Math.sin(baseAngle + (Math.PI / 2) * this.strafeDir);
    }

    const shouldMove = this.stumbleTimer <= 0 && dist > 1.2;
    b.step(this.stumbleTimer > 0 ? dt * 0.3 : dt * this.speedScale, wx, wz, shouldMove);
    if (b.grounded && this.stumbleTimer <= 0 && (b.speed < 8 || (this.role === 'chaser' && player.y > b.y + 2))) {
      b.queueJump();
    }

    if (b.speed > 0.5) {
      const targetYaw = Math.atan2(b.vx, b.vz);
      const diff = Math.atan2(Math.sin(targetYaw - this.yaw), Math.cos(targetYaw - this.yaw));
      this.yaw += diff * (1 - Math.exp(-12 * dt));
    }

    this.root.position.set(b.x, b.y, b.z);
    this.root.rotation.y = this.yaw;
    // Ankle break: a cartoon wobble-and-topple that settles back up.
    const wobble = this.stumbleTimer > 0 ? Math.min(1, this.stumbleTimer / 0.5) : 0;
    this.root.rotation.z = Math.sin(this.stumbleTimer * 26) * 0.55 * wobble;
    this.root.rotation.x = wobble * -0.35;
    this.animate(dt, this.stumbleTimer > 0 ? 0.2 : Math.min(1.2, b.speed / 48));
  }

  private animate(dt: number, speedRatio: number): void {
    const b = this.body;
    this.rig.update({
      dt,
      speedRatio,
      isGrounded: b.grounded,
      verticalVelocity: b.vy,
      isSliding: false,
      strafeAmount: 0,
      forwardAmount: 1,
      turnRate: 0,
      landingSquash: 0,
      mantling: b.mantling,
      vaultProgress: b.vaultProgress,
      wallSliding: b.wallSliding,
      wallRunning: false,
      wallRunLean: 0,
      wallKicking: false,
      diving: false,
    });
  }

  private lookAheadBlocked(wx: number, wz: number): boolean {
    const b = this.body;
    const px = b.x + wx * 2.4;
    const pz = b.z + wz * 2.4;
    for (const box of this.bodyBoxes()) {
      if (
        px + PLAYER_DIM.HALF_W > box.minX &&
        px - PLAYER_DIM.HALF_W < box.maxX &&
        pz + PLAYER_DIM.HALF_D > box.minZ &&
        pz - PLAYER_DIM.HALF_D < box.maxZ &&
        box.maxY > b.y + 0.6 &&
        box.minY < b.y + PLAYER_DIM.HEIGHT
      ) {
        return true;
      }
    }
    return false;
  }

  private bodyBoxes(): AABB[] {
    return (this.body as unknown as { boxes: AABB[] }).boxes;
  }
}
