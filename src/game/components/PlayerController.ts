/**
 * Movement core: box and ramp collision, bunny hops, slides, landing rolls,
 * dives, wall runs, wall jumps, and vaults.
 *
 * Pure simulation (studs, seconds). It has no renderer dependency and is
 * frame-rate independent because it sub-steps every frame.
 */

export interface AABB {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  ice?: boolean;
  /** Bounce pad: landing on top launches the player upward with this speed. */
  bounce?: number;
}

/** A sloped floor. Its height climbs linearly from y0 (min edge) to y1 (max edge) along one axis. */
export interface Ramp {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  axis: 'x' | 'z';
  y0: number;
  y1: number;
}

export const PLAYER_DIM = {
  HALF_W: 0.9,
  HALF_D: 0.9,
  HEIGHT: 5.2,
  SLIDE_HEIGHT: 2.6,
} as const;

export const MOVEMENT = {
  BASE_SPEED: 48,
  SPEED_CAP: 170,

  BHOP_WINDOW: 0.15,
  JUMP_BUFFER: 0.1,
  BHOP_SPEED_GAIN: 7,
  JUMP_VELOCITY: 46,
  JUMP_HEIGHT_GAIN: 4,
  JUMP_HEIGHT_MAX_CHAIN: 3,
  /** Releasing jump early multiplies the remaining upward speed by this. */
  JUMP_CUT: 0.5,
  COYOTE_TIME: 0.08,

  GRAVITY: 96,
  FALL_GRAVITY_MULT: 1.14,

  GROUND_ACCEL: 40,
  GROUND_DECEL: 34,
  GROUND_FRICTION: 4.2,
  AIR_ACCEL: 12,
  AIR_TURN_RATE: 13,
  AIR_TURN_EASE: 12,

  SLIDE_BURST: 14,
  SLIDE_DURATION: 0.85,
  SLIDE_COOLDOWN: 0.22,
  SLIDE_TURN_RATE: 3.4,
  SLIDE_TURN_EASE: 6,
  SLIDE_JUMP_POP: 8,

  /** After a vault, dive landing, or wall jump, friction is paused for this long. */
  GRACE_TIME: 0.45,

  DIVE_VY: -52,
  DIVE_FORWARD: 10,
  /** Dive-land boost only pays out for a hard fall, scaled by impact. */
  DIVE_LAND_MIN_IMPACT: 60,
  DIVE_LAND_MAX_BOOST: 8,
  WALL_KICK_TIME: 0.28,

  SLOPE_FACTOR: 0.9,
  SLIDE_SLOPE_MULT: 1.6,

  WALLRUN_TIME: 1.0,
  WALLRUN_GAP: 0.15,
  WALLRUN_MIN_SPEED: 28,
  WALLRUN_GRAVITY: 0.2,
  WALLRUN_MAX_FALL: 4,

  STEP_HEIGHT: 0.45,
  VAULT_MIN_LEDGE: 0.7,
  VAULT_MAX_LEDGE: 5.2,
  VAULT_BASE_LIFT: 31,
  VAULT_HEIGHT_LIFT: 4.5,
  VAULT_SPEED_GAIN: 3,
  VAULT_COOLDOWN: 0.32,
  VAULT_ANIMATION: 0.3,

  WALL_JUMP_VY: 44,
  WALL_JUMP_PUSH: 34,
  WALL_JUMP_CONTROL_LOCK: 0.15,
  WALL_JUMP_COOLDOWN: 0.22,

  DASH_SPEED: 74,
  DASH_BONUS: 12,
  DASH_COOLDOWN: 1.5,
  DASH_DURATION: 0.18,
} as const;

export type ControllerEventType =
  | 'PERFECT_JUMP'
  | 'PLAIN_JUMP'
  | 'CHAIN_LOST'
  | 'SLIDE_START'
  | 'LAND'
  | 'MANTLE'
  | 'WALL_JUMP'
  | 'DIVE'
  | 'DIVE_LAND'
  | 'WALLRUN_START'
  | 'DASH'
  | 'BOUNCE';

export interface ControllerEvent {
  type: ControllerEventType;
  chain: number;
  gain: number;
  impact: number;
}

const EPS = 0.001;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export class PlayerController {
  x = 0;
  y = 0;
  z = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  grounded = true;
  sliding = false;
  chain = 0;
  groundTime = 1;
  wallTimer = 0;
  wallNX = 0;
  wallNZ = 0;
  wallRunning = false;
  /** Ice skate map: every surface is slippery. */
  iceAll = false;

  private readonly boxes: AABB[];
  private readonly ramps: Ramp[];
  private events: ControllerEvent[] = [];
  private pendingEvents: ControllerEvent[] = [];
  private clock = 0;
  private jumpBuffer = 0;
  private vaultIntent = 0;
  private slideRequested = false;
  private slideTime = 0;
  private slideCooldown = 0;
  private coyoteTimer = 0;
  private canBhop = false;
  private vaultTimer = 0;
  private vaultCooldown = 0;
  private vaultBox: AABB | null = null;
  private wallCooldown = 0;
  private wallControlLock = 0;
  private lastWishX = 0;
  private lastWishZ = -1;
  private inputNow = false;
  private graceTimer = 0;
  private diveRequested = false;
  private diveActive = false;
  private jumpCutArmed = false;
  private wallKickTimer = 0;
  private wallRunTimer = 0;
  private wallRunAvailable = true;
  private dashTimer = 0;
  private dashCooldownTimer = 0;

  constructor(boxes: AABB[] = [], ramps: Ramp[] = []) {
    this.boxes = boxes;
    this.ramps = ramps;
  }

  get speed(): number {
    return Math.hypot(this.vx, this.vz);
  }

  get mantling(): boolean {
    return this.vaultTimer > 0;
  }

  get vaultProgress(): number {
    return 1 - this.vaultTimer / MOVEMENT.VAULT_ANIMATION;
  }

  get wallSliding(): boolean {
    return !this.grounded && this.wallTimer > 0 && this.vy < 0 && !this.mantling && !this.wallRunning;
  }

  get diving(): boolean {
    return this.diveActive;
  }

  get wallKicking(): boolean {
    return this.wallKickTimer > 0;
  }

  get dashing(): boolean {
    return this.dashTimer > 0;
  }

  get dashCooldown(): number {
    return this.dashCooldownTimer;
  }

  get height(): number {
    return this.sliding ? PLAYER_DIM.SLIDE_HEIGHT : PLAYER_DIM.HEIGHT;
  }

  reset(x = 0, y = 0, z = 0): void {
    this.x = x;
    this.y = y;
    this.z = z;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.sliding = false;
    this.chain = 0;
    this.groundTime = 1;
    this.wallTimer = 0;
    this.wallNX = 0;
    this.wallNZ = 0;
    this.wallRunning = false;
    this.wallRunTimer = 0;
    this.wallRunAvailable = true;
    this.jumpBuffer = 0;
    this.vaultIntent = 0;
    this.slideRequested = false;
    this.slideTime = 0;
    this.slideCooldown = 0;
    this.coyoteTimer = 0;
    this.canBhop = false;
    this.vaultTimer = 0;
    this.vaultCooldown = 0;
    this.vaultBox = null;
    this.wallCooldown = 0;
    this.wallControlLock = 0;
    this.graceTimer = 0;
    this.diveRequested = false;
    this.diveActive = false;
    this.jumpCutArmed = false;
    this.wallKickTimer = 0;
    this.dashTimer = 0;
    this.dashCooldownTimer = 0;
    this.inputNow = false;
    this.events = [];
    this.pendingEvents = [];
    this.grounded = this.isSupported();
  }

  /** E / Q: sharp lateral or directional juke dash (Huss Valley dash). */
  queueDash(dx: number, dz: number): boolean {
    if (this.dashCooldownTimer > 0 || this.mantling) return false;
    const len = Math.hypot(dx, dz);
    const dirX = len > 1e-4 ? dx / len : this.lastWishX;
    const dirZ = len > 1e-4 ? dz / len : this.lastWishZ;
    const before = this.speed;
    const target = Math.min(
      MOVEMENT.SPEED_CAP,
      Math.max(MOVEMENT.DASH_SPEED, before + MOVEMENT.DASH_BONUS * this.capScale()),
    );
    this.vx = dirX * target;
    this.vz = dirZ * target;
    if (!this.grounded && this.vy < 10) this.vy = Math.max(this.vy, 10);
    this.dashTimer = MOVEMENT.DASH_DURATION;
    this.dashCooldownTimer = MOVEMENT.DASH_COOLDOWN;
    this.graceTimer = MOVEMENT.GRACE_TIME;
    this.lastWishX = dirX;
    this.lastWishZ = dirZ;
    this.pendingEvents.push({ type: 'DASH', chain: this.chain, gain: Math.max(0, target - before), impact: 0 });
    return true;
  }

  /** Space press: buffers a hop and arms the variable-height cut. */
  queueJump(): void {
    this.jumpBuffer = MOVEMENT.JUMP_BUFFER;
    this.vaultIntent = MOVEMENT.JUMP_BUFFER;
  }

  /** Space release: cuts the rising arc short, so a tap hops lower than a hold. */
  releaseJump(): void {
    if (this.jumpCutArmed && this.vy > 0 && !this.mantling) this.vy *= MOVEMENT.JUMP_CUT;
    this.jumpCutArmed = false;
  }

  /** C on the ground: slide, or cancel a running slide. */
  queueSlide(): void {
    this.slideRequested = true;
  }

  /** F in the air: dive straight down and forward. */
  queueDive(): void {
    this.diveRequested = true;
  }

  clearInput(): void {
    this.jumpBuffer = 0;
    this.vaultIntent = 0;
    this.slideRequested = false;
    this.diveRequested = false;
    this.jumpCutArmed = false;
  }

  step(dt: number, wishX: number, wishZ: number, hasInput: boolean): ControllerEvent[] {
    this.events = this.pendingEvents.length ? this.pendingEvents.splice(0) : [];
    if (!Number.isFinite(dt) || dt <= 0) return this.events;
    dt = Math.min(dt, 0.1);

    const length = Math.hypot(wishX, wishZ);
    hasInput = hasInput && length > 1e-5;
    this.inputNow = hasInput;
    if (hasInput) {
      wishX /= length;
      wishZ /= length;
      this.lastWishX = wishX;
      this.lastWishZ = wishZ;
    } else {
      wishX = 0;
      wishZ = 0;
    }

    if (this.slideRequested) {
      this.slideRequested = false;
      if (this.sliding) this.endSlide();
      else if (this.grounded) this.startSlide();
    }

    // Sub-step so fast movement can never tunnel through thin walls.
    const steps = Math.ceil(dt / (1 / 240));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) this.integrate(h, wishX, wishZ, hasInput);
    return this.events;
  }

  private integrate(dt: number, wx: number, wz: number, hasInput: boolean): void {
    const M = MOVEMENT;
    this.clock += dt;
    this.slideCooldown = Math.max(0, this.slideCooldown - dt);
    this.wallTimer = Math.max(0, this.wallTimer - dt);
    this.wallCooldown = Math.max(0, this.wallCooldown - dt);
    this.wallControlLock = Math.max(0, this.wallControlLock - dt);
    this.vaultCooldown = Math.max(0, this.vaultCooldown - dt);
    this.vaultTimer = Math.max(0, this.vaultTimer - dt);
    this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
    this.graceTimer = Math.max(0, this.graceTimer - dt);
    this.wallKickTimer = Math.max(0, this.wallKickTimer - dt);
    this.dashTimer = Math.max(0, this.dashTimer - dt);
    this.dashCooldownTimer = Math.max(0, this.dashCooldownTimer - dt);
    if (this.vaultTimer === 0) this.vaultBox = null;

    if (this.grounded && !this.isSupported()) {
      this.grounded = false;
      this.canBhop = false;
      this.coyoteTimer = M.COYOTE_TIME;
    }
    if (this.grounded) this.groundTime += dt;
    if (this.sliding) {
      this.slideTime -= dt;
      if (!this.grounded || this.slideTime <= 0) this.endSlide();
    }

    this.consumeJump();
    if (!this.grounded && this.vaultIntent > 0 && !this.mantling) this.probeVault();

    if (this.diveRequested) {
      this.diveRequested = false;
      // One dive per airtime: repeat presses cannot keep adding speed.
      if (!this.grounded && !this.mantling && !this.diveActive) this.startDive();
    }

    if (this.wallRunning) this.updateWallRun(dt);
    else if (!this.grounded && !this.mantling && !this.sliding && this.wallRunAvailable) this.probeWallRun();

    // Friction: ground hops and grace windows keep momentum.
    if (this.grounded && !this.sliding && this.groundTime > M.BHOP_WINDOW) {
      this.canBhop = false;
      if (this.chain > 0) {
        this.emit('CHAIN_LOST');
        this.chain = 0;
      }
      const onIce = this.isOnIce();
      if (this.graceTimer <= 0 && this.speed > M.BASE_SPEED) {
        const friction = onIce ? 0.55 : M.GROUND_FRICTION;
        this.setSpeed(M.BASE_SPEED + (this.speed - M.BASE_SPEED) * Math.exp(-friction * dt));
      }
    }

    // Slopes pull the player downhill. Sliding uses the stronger pull.
    if (this.grounded && !this.mantling) {
      const ramp = this.rampAt(this.x, this.z);
      if (ramp) {
        const gx = ramp.axis === 'x' ? (ramp.y1 - ramp.y0) / (ramp.maxX - ramp.minX) : 0;
        const gz = ramp.axis === 'z' ? (ramp.y1 - ramp.y0) / (ramp.maxZ - ramp.minZ) : 0;
        const pull = (M.GRAVITY * M.SLOPE_FACTOR * (this.sliding ? M.SLIDE_SLOPE_MULT : 1)) /
          Math.sqrt(1 + gx * gx + gz * gz) * dt;
        this.vx -= gx * pull;
        this.vz -= gz * pull;
      }
    }

    if (this.sliding) {
      if (hasInput) this.turnToward(wx, wz, M.SLIDE_TURN_RATE, M.SLIDE_TURN_EASE, dt);
    } else if (this.wallRunning) {
      // Locked to the wall line; no steering while running along it.
    } else if (this.wallControlLock <= 0) {
      const onIce = this.grounded && this.isOnIce();
      if (hasInput) {
        const topGround = onIce ? M.BASE_SPEED * 1.35 : M.BASE_SPEED;
        if (this.speed >= topGround - 0.001) {
          if (this.grounded) this.turnToward(wx, wz, onIce ? 8 : 22, onIce ? 7 : 18, dt);
          else this.turnToward(wx, wz, M.AIR_TURN_RATE, M.AIR_TURN_EASE, dt);
        } else {
          const accel = this.grounded ? (onIce ? 14 : M.GROUND_ACCEL) : M.AIR_ACCEL;
          const k = 1 - Math.exp(-accel * dt);
          this.vx += (wx * topGround - this.vx) * k;
          this.vz += (wz * topGround - this.vz) * k;
        }
      } else if (this.grounded && !this.canBhop && this.graceTimer <= 0) {
        this.setSpeed(this.speed * Math.exp(-(onIce ? 1.8 : M.GROUND_DECEL) * dt));
        if (this.speed < 0.1) {
          this.vx = 0;
          this.vz = 0;
        }
      }
    }
    if (this.speed > M.SPEED_CAP) this.setSpeed(M.SPEED_CAP);

    if (!this.grounded) {
      const gravity = M.GRAVITY * (this.vy < 0 ? M.FALL_GRAVITY_MULT : 1) *
        (this.wallRunning ? M.WALLRUN_GRAVITY : 1);
      const oldY = this.y;
      this.y += this.vy * dt - 0.5 * gravity * dt * dt;
      this.vy -= gravity * dt;
      if (this.wallRunning && this.vy < -M.WALLRUN_MAX_FALL) this.vy = -M.WALLRUN_MAX_FALL;
      this.resolveVertical(oldY);
    }

    this.moveAxis('x', this.vx * dt);
    this.moveAxis('z', this.vz * dt);

    // Ramps: stick to the surface while grounded, so walking and sliding follow the slope.
    if (this.grounded && !this.mantling) {
      const ramp = this.rampAt(this.x, this.z);
      if (ramp) {
        const surface = this.rampY(ramp, this.x, this.z);
        if (Math.abs(surface - this.y) <= 0.7) {
          this.y = surface;
          this.vy = 0;
        }
      }
    }

    this.consumeJump();
    this.jumpBuffer = Math.max(0, this.jumpBuffer - dt);
    this.vaultIntent = Math.max(0, this.vaultIntent - dt);
  }

  private consumeJump(): void {
    if (this.jumpBuffer <= 0) return;
    const M = MOVEMENT;
    if (!this.sliding && this.probeVault()) return;

    if (this.grounded || this.coyoteTimer > 0) {
      if (this.sliding && !this.canStand()) return;
      const wasSliding = this.sliding;
      const timed = this.grounded && (wasSliding || (this.canBhop && this.groundTime <= M.BHOP_WINDOW));
      const before = this.speed;
      this.chain = timed && before > 1 ? this.chain + 1 : 0;
      let gain = 0;
      if (timed && before > 1) {
        const next = Math.min(M.SPEED_CAP, before + M.BHOP_SPEED_GAIN * this.capScale());
        this.setSpeed(next);
        gain = next - before;
      }
      this.vy = M.JUMP_VELOCITY + Math.min(this.chain, M.JUMP_HEIGHT_MAX_CHAIN) * M.JUMP_HEIGHT_GAIN;
      if (wasSliding) {
        this.vy += M.SLIDE_JUMP_POP;
        this.endSlide();
      }
      this.grounded = false;
      this.canBhop = false;
      this.groundTime = 0;
      this.coyoteTimer = 0;
      this.jumpBuffer = 0;
      this.vaultIntent = 0.6;
      this.jumpCutArmed = true;
      this.emit(timed && before > 1 ? 'PERFECT_JUMP' : 'PLAIN_JUMP', gain);
    } else if (this.wallTimer > 0 && this.wallCooldown <= 0 && !this.mantling) {
      const tx = -this.wallNZ;
      const tz = this.wallNX;
      const tangentSpeed = this.vx * tx + this.vz * tz;
      this.vx = this.wallNX * M.WALL_JUMP_PUSH + tx * tangentSpeed;
      this.vz = this.wallNZ * M.WALL_JUMP_PUSH + tz * tangentSpeed;
      if (this.speed > M.SPEED_CAP) this.setSpeed(M.SPEED_CAP);
      this.vy = M.WALL_JUMP_VY;
      this.x += this.wallNX * 0.015;
      this.z += this.wallNZ * 0.015;
      this.wallTimer = 0;
      this.jumpBuffer = 0;
      this.vaultIntent = 0;
      this.wallCooldown = M.WALL_JUMP_COOLDOWN;
      this.wallControlLock = M.WALL_JUMP_CONTROL_LOCK;
      this.wallRunning = false;
      this.wallRunAvailable = true;
      this.graceTimer = M.GRACE_TIME;
      this.jumpCutArmed = false;
      this.wallKickTimer = M.WALL_KICK_TIME;
      this.emit('WALL_JUMP');
    }
  }

  private probeVault(): boolean {
    if (this.vaultCooldown > 0 || this.vaultIntent <= 0 || this.sliding) return false;
    const dx = this.lastWishX;
    const dz = this.lastWishZ;
    const px = this.x + dx * 1.55;
    const pz = this.z + dz * 1.55;
    for (const box of this.boxes) {
      if (px <= box.minX || px >= box.maxX || pz <= box.minZ || pz >= box.maxZ) continue;
      let nx = 0;
      let nz = 0;
      if (this.x <= box.minX) nx = -1;
      else if (this.x >= box.maxX) nx = 1;
      else if (this.z <= box.minZ) nz = -1;
      else if (this.z >= box.maxZ) nz = 1;
      else continue;
      if (dx * nx + dz * nz > -0.2) continue;
      if (this.startVault(box, nx, nz)) return true;
    }
    return false;
  }

  private startVault(box: AABB, nx: number, nz: number, fromWallContact = false): boolean {
    const M = MOVEMENT;
    const ledge = box.maxY - this.y;
    if (this.vaultCooldown > 0 || this.sliding) return false;
    // From the forward probe, a recent jump press is required. From wall contact,
    // being airborne and pushing into the ledge is enough (covers jumping early
    // and reaching the ledge on the way down).
    if (!fromWallContact && this.vaultIntent <= 0) return false;
    if (ledge < M.VAULT_MIN_LEDGE || ledge > M.VAULT_MAX_LEDGE) return false;
    if (box.maxX - box.minX < 1.9 || box.maxZ - box.minZ < 1.9) return false;
    if (fromWallContact && (this.grounded || this.mantling)) return false;
    // Must be heading into the wall (input direction, or velocity if no input this frame)
    const hx = this.inputNow ? this.lastWishX : this.vx;
    const hz = this.inputNow ? this.lastWishZ : this.vz;
    const hl = Math.hypot(hx, hz);
    if (hl < 0.5) return false;
    if ((hx * nx + hz * nz) / hl > -0.2) return false;
    // Vault launch direction follows the actual heading
    this.lastWishX = hx / hl;
    this.lastWishZ = hz / hl;

    const tx = clamp(this.x - nx * 2, box.minX + 0.95, box.maxX - 0.95);
    const tz = clamp(this.z - nz * 2, box.minZ + 0.95, box.maxZ - 0.95);
    for (const other of this.boxes) {
      if (other === box) continue;
      const blocksExit = this.overlapXZ(tx, tz, other) &&
        other.maxY > box.maxY + EPS && other.minY < box.maxY + PLAYER_DIM.HEIGHT + 1;
      const blocksRise = this.overlapXZ(this.x, this.z, other) &&
        other.minY >= this.y + this.height - EPS && other.minY < box.maxY + PLAYER_DIM.HEIGHT;
      if (blocksExit || blocksRise) return false;
    }

    // A vault is an impulse with momentum kept, not a teleport onto the ledge.
    const before = this.speed;
    const speed = Math.min(M.SPEED_CAP, Math.max(before, M.BASE_SPEED) + M.VAULT_SPEED_GAIN);
    this.vx = this.lastWishX * speed;
    this.vz = this.lastWishZ * speed;
    this.vy = M.VAULT_BASE_LIFT + ledge * M.VAULT_HEIGHT_LIFT;
    this.grounded = false;
    this.canBhop = false;
    this.vaultBox = box;
    this.vaultTimer = M.VAULT_ANIMATION;
    this.vaultCooldown = M.VAULT_COOLDOWN;
    this.jumpBuffer = 0;
    this.vaultIntent = 0;
    this.wallTimer = 0;
    this.coyoteTimer = 0;
    this.wallRunning = false;
    this.wallRunAvailable = true;
    this.diveActive = false;
    this.jumpCutArmed = false;
    this.graceTimer = M.GRACE_TIME;
    this.emit('MANTLE', Math.max(0, this.speed - before));
    return true;
  }

  private startDive(): void {
    const M = MOVEMENT;
    const before = this.speed;
    this.wallRunning = false;
    this.diveActive = true;
    this.vy = M.DIVE_VY;
    if (before > 1) {
      this.setSpeed(Math.min(M.SPEED_CAP, before + M.DIVE_FORWARD));
    } else {
      this.vx = this.lastWishX * M.DIVE_FORWARD;
      this.vz = this.lastWishZ * M.DIVE_FORWARD;
    }
    this.vaultIntent = 0;
    this.jumpCutArmed = false;
    this.emit('DIVE', this.speed - before);
  }

  /** Finds a wall touching the player's side, returning the normal pointing away from the wall. */
  private wallSide(gap: number): { nx: number; nz: number } | null {
    const { HALF_W, HALF_D, HEIGHT } = PLAYER_DIM;
    for (const box of this.boxes) {
      if (this.y + HEIGHT <= box.minY + 0.3 || this.y >= box.maxY - 0.3) continue;
      const zOverlap = this.z + HALF_D > box.minZ + 0.2 && this.z - HALF_D < box.maxZ - 0.2;
      const xOverlap = this.x + HALF_W > box.minX + 0.2 && this.x - HALF_W < box.maxX - 0.2;
      if (zOverlap) {
        if (Math.abs(this.x + HALF_W - box.minX) <= gap) return { nx: -1, nz: 0 };
        if (Math.abs(this.x - HALF_W - box.maxX) <= gap) return { nx: 1, nz: 0 };
      }
      if (xOverlap) {
        if (Math.abs(this.z + HALF_D - box.minZ) <= gap) return { nx: 0, nz: -1 };
        if (Math.abs(this.z - HALF_D - box.maxZ) <= gap) return { nx: 0, nz: 1 };
      }
    }
    return null;
  }

  /** Air + running angled into a wall at speed = stick to it and run along it (once per airtime). */
  private probeWallRun(): void {
    const M = MOVEMENT;
    const side = this.wallSide(M.WALLRUN_GAP);
    if (!side) return;
    const intoWall = this.vx * side.nx + this.vz * side.nz;
    if (intoWall >= 0) return;
    const along = side.nx !== 0 ? Math.abs(this.vz) : Math.abs(this.vx);
    if (along < M.WALLRUN_MIN_SPEED) return;

    this.wallRunning = true;
    this.wallRunTimer = M.WALLRUN_TIME;
    this.wallRunAvailable = false;
    this.wallNX = side.nx;
    this.wallNZ = side.nz;
    this.wallTimer = 0.1;
    this.jumpCutArmed = false;
    if (side.nx !== 0) this.vx = 0;
    else this.vz = 0;
    this.emit('WALLRUN_START');
  }

  private updateWallRun(dt: number): void {
    const M = MOVEMENT;
    this.wallRunTimer -= dt;
    const side = this.wallSide(M.WALLRUN_GAP * 2);
    const stillOnWall = side !== null && side.nx === this.wallNX && side.nz === this.wallNZ;
    if (this.grounded || this.mantling || this.wallRunTimer <= 0 || !stillOnWall) {
      this.wallRunning = false;
      return;
    }
    this.wallTimer = 0.1;
    if (this.wallNX !== 0) this.vx = 0;
    else this.vz = 0;
  }

  private rampAt(x: number, z: number): Ramp | null {
    for (const r of this.ramps) {
      if (x >= r.minX && x <= r.maxX && z >= r.minZ && z <= r.maxZ) return r;
    }
    return null;
  }

  private rampY(r: Ramp, x: number, z: number): number {
    const t = r.axis === 'z' ? (z - r.minZ) / (r.maxZ - r.minZ) : (x - r.minX) / (r.maxX - r.minX);
    return r.y0 + (r.y1 - r.y0) * clamp(t, 0, 1);
  }

  private moveAxis(axis: 'x' | 'z', delta: number): void {
    if (Math.abs(delta) < 1e-7) return;
    const half = axis === 'x' ? PLAYER_DIM.HALF_W : PLAYER_DIM.HALF_D;
    let next = this[axis] + delta;

    for (const box of this.boxes) {
      if (this.y >= box.maxY - EPS || this.y + this.height <= box.minY + EPS) continue;
      const cross = axis === 'x' ? this.z : this.x;
      const crossHalf = axis === 'x' ? PLAYER_DIM.HALF_D : PLAYER_DIM.HALF_W;
      const crossMin = axis === 'x' ? box.minZ : box.minX;
      const crossMax = axis === 'x' ? box.maxZ : box.maxX;
      if (cross + crossHalf <= crossMin + EPS || cross - crossHalf >= crossMax - EPS) continue;
      const min = axis === 'x' ? box.minX : box.minZ;
      const max = axis === 'x' ? box.maxX : box.maxZ;
      const hit = delta > 0
        ? this[axis] + half <= min + EPS * 2 && next + half > min
        : this[axis] - half >= max - EPS * 2 && next - half < max;
      if (!hit) continue;

      const ledge = box.maxY - this.y;
      // Near-level ledges are stepped up (grounded) or cleared (airborne and rising):
      // otherwise a jump that reaches a ledge just below its top gets stopped dead.
      const canClear = this.clearAt(axis === 'x' ? next : this.x, box.maxY, axis === 'z' ? next : this.z, this.height);
      if (ledge <= MOVEMENT.STEP_HEIGHT && canClear && this.vaultTimer <= 0 && (this.grounded || this.vy > -4)) {
        this.y = box.maxY;
        if (!this.grounded) this.land(box.maxY);
        continue;
      }

      const nx = axis === 'x' ? (delta > 0 ? -1 : 1) : 0;
      const nz = axis === 'z' ? (delta > 0 ? -1 : 1) : 0;
      if (!this.grounded) this.startVault(box, nx, nz, true);
      const boundary = delta > 0 ? min - half - EPS : max + half + EPS;
      next = delta > 0 ? Math.min(next, boundary) : Math.max(next, boundary);

      if (box !== this.vaultBox || this.vaultTimer <= 0) {
        if (axis === 'x') this.vx = 0;
        else this.vz = 0;
        this.wallNX = nx;
        this.wallNZ = nz;
        this.wallTimer = 0.1;
      }
    }

    // Ramps are solid from the side: the leading edge cannot pass below the surface.
    const lead = next + (delta > 0 ? half : -half);
    const probeX = axis === 'x' ? lead : this.x;
    const probeZ = axis === 'z' ? lead : this.z;
    const ramp = this.rampAt(probeX, probeZ);
    // The threshold has to allow for slope rise over the leading edge, plus one sub-step of lag.
    if (ramp && this.y < this.rampY(ramp, probeX, probeZ) - 2.0) {
      next = this[axis];
      if (axis === 'x') {
        this.vx = 0;
        this.wallNX = delta > 0 ? -1 : 1;
        this.wallNZ = 0;
      } else {
        this.vz = 0;
        this.wallNX = 0;
        this.wallNZ = delta > 0 ? -1 : 1;
      }
      this.wallTimer = 0.1;
    }
    this[axis] = next;
  }

  private resolveVertical(oldY: number): void {
    if (this.vy <= 0) {
      let floor = this.y <= 0 ? 0 : -Infinity;
      for (const box of this.boxes) {
        if (!this.overlapXZ(this.x, this.z, box)) continue;
        if (oldY >= box.maxY - EPS && this.y <= box.maxY) floor = Math.max(floor, box.maxY);
      }
      const ramp = this.rampAt(this.x, this.z);
      if (ramp) {
        const surface = this.rampY(ramp, this.x, this.z);
        if (oldY >= surface - 0.06 && this.y <= surface) floor = Math.max(floor, surface);
      }
      if (floor !== -Infinity) {
        // Bounce pads launch instead of landing. Only the pad under the feet counts.
        const pad = this.boxes.find(
          (box) => box.bounce && Math.abs(box.maxY - floor) < 0.01 && this.overlapXZ(this.x, this.z, box),
        );
        if (pad && pad.bounce) {
          this.y = floor;
          this.vy = pad.bounce;
          this.grounded = false;
          this.groundTime = 0;
          this.canBhop = false;
          this.chain = 0;
          this.emit('BOUNCE', pad.bounce);
        } else {
          this.land(floor);
        }
      }
    } else {
      let ceiling = Infinity;
      for (const box of this.boxes) {
        if (!this.overlapXZ(this.x, this.z, box)) continue;
        if (oldY + this.height <= box.minY + EPS && this.y + this.height >= box.minY) {
          ceiling = Math.min(ceiling, box.minY);
        }
      }
      if (ceiling !== Infinity) {
        this.y = ceiling - this.height - EPS;
        this.vy = 0;
        this.vaultIntent = 0;
        this.vaultTimer = 0;
        this.vaultBox = null;
      }
    }
  }

  private land(y: number): void {
    const impact = Math.abs(this.vy);
    const wasAir = !this.grounded;
    this.y = y;
    this.vy = 0;
    this.grounded = true;
    if (!wasAir) return;

    this.groundTime = 0;
    this.canBhop = true;
    this.wallTimer = 0;
    this.vaultTimer = 0;
    this.vaultIntent = 0;
    this.vaultBox = null;
    this.wallRunning = false;
    this.wallRunAvailable = true;
    this.jumpCutArmed = false;
    this.emit('LAND', 0, impact);

    if (this.diveActive) {
      this.diveActive = false;
      this.diveRequested = false;
      const before = this.speed;
      // No free speed from flat hops: the boost needs a real fall behind the dive.
      const boost = impact > MOVEMENT.DIVE_LAND_MIN_IMPACT
        ? Math.min(MOVEMENT.DIVE_LAND_MAX_BOOST, (impact - MOVEMENT.DIVE_LAND_MIN_IMPACT) / 5)
        : 0;
      if (before > 1 && boost > 0) this.setSpeed(Math.min(MOVEMENT.SPEED_CAP, before + boost));
      this.graceTimer = MOVEMENT.GRACE_TIME;
      this.emit('DIVE_LAND', boost);
    }
  }

  private overlapXZ(x: number, z: number, box: AABB): boolean {
    return x + PLAYER_DIM.HALF_W > box.minX + EPS && x - PLAYER_DIM.HALF_W < box.maxX - EPS &&
      z + PLAYER_DIM.HALF_D > box.minZ + EPS && z - PLAYER_DIM.HALF_D < box.maxZ - EPS;
  }

  private isOnIce(): boolean {
    if (this.iceAll && this.grounded) return true;
    return this.boxes.some(
      (box) => box.ice && Math.abs(this.y - box.maxY) <= 0.08 && this.overlapXZ(this.x, this.z, box),
    );
  }

  private isSupported(): boolean {
    if (this.y <= EPS) return true;
    if (this.boxes.some((box) => Math.abs(this.y - box.maxY) <= EPS * 2 && this.overlapXZ(this.x, this.z, box))) {
      return true;
    }
    const ramp = this.rampAt(this.x, this.z);
    return ramp !== null && Math.abs(this.y - this.rampY(ramp, this.x, this.z)) <= 0.35;
  }

  private clearAt(x: number, y: number, z: number, height: number): boolean {
    return !this.boxes.some((box) =>
      this.overlapXZ(x, z, box) && y < box.maxY - EPS && y + height > box.minY + EPS);
  }

  private canStand(): boolean {
    return this.clearAt(this.x, this.y, this.z, PLAYER_DIM.HEIGHT);
  }

  private startSlide(): boolean {
    const M = MOVEMENT;
    if (!this.grounded || this.sliding || this.slideCooldown > 0 || this.speed < M.BASE_SPEED * 0.5) return false;
    const before = this.speed;
    this.sliding = true;
    this.slideTime = M.SLIDE_DURATION;
    this.setSpeed(Math.min(M.SPEED_CAP, before + M.SLIDE_BURST * this.capScale()));
    this.emit('SLIDE_START', this.speed - before);
    return true;
  }

  private endSlide(): void {
    if (!this.canStand()) return;
    this.sliding = false;
    this.slideCooldown = MOVEMENT.SLIDE_COOLDOWN;
  }

  private setSpeed(speed: number): void {
    const current = this.speed;
    if (current <= 1e-6) return;
    const factor = speed / current;
    this.vx *= factor;
    this.vz *= factor;
  }

  private capScale(): number {
    return clamp(1 - (this.speed - MOVEMENT.BASE_SPEED) / (MOVEMENT.SPEED_CAP - MOVEMENT.BASE_SPEED), 0, 1);
  }

  private turnToward(wx: number, wz: number, rate: number, ease: number, dt: number): void {
    const speed = this.speed;
    if (speed < 0.001) return;
    const current = Math.atan2(this.vz, this.vx);
    const target = Math.atan2(wz, wx);
    const diff = Math.atan2(Math.sin(target - current), Math.cos(target - current));
    const angle = current + clamp(diff * (1 - Math.exp(-ease * dt)), -rate * dt, rate * dt);
    this.vx = Math.cos(angle) * speed;
    this.vz = Math.sin(angle) * speed;
  }

  private emit(type: ControllerEventType, gain = 0, impact = 0): void {
    this.events.push({ type, chain: this.chain, gain, impact });
  }
}
