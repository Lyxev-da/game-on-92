import { MOVEMENT } from '../components/PlayerController';

export type MovementEventType =
  | 'PERFECT_JUMP'
  | 'PLAIN_JUMP'
  | 'CHAIN_LOST'
  | 'SLIDE_START'
  | 'LAND'
  | 'MANTLE'
  | 'WALL_JUMP'
  | 'DASH';

export interface MovementEvent {
  /** Increments on every event so subscribers can tell a new hop from a repeat read. */
  id: number;
  type: MovementEventType;
  chain: number;
  /** studs/s gained on this hop */
  gain: number;
  /** studs/s of downward speed on landing */
  impact: number;
}

export interface MovementSnapshot {
  /** horizontal studs/s */
  speed: number;
  /** 0..1 share of the speed cap */
  fill: number;
  chain: number;
  sliding: boolean;
  grounded: boolean;
  dashCooldown: number;
  event: MovementEvent;
}

type Listener = (snapshot: MovementSnapshot) => void;

function initialSnapshot(): MovementSnapshot {
  return {
    speed: 0,
    fill: 0,
    chain: 0,
    sliding: false,
    grounded: true,
    dashCooldown: 0,
    event: { id: 0, type: 'LAND', chain: 0, gain: 0, impact: 0 },
  };
}

/**
 * Tiny read-out channel from the fixed-step movement loop to the HUD.
 * The snapshot object is mutated in place: the speed counter updates the DOM
 * straight from the listener, so React never re-renders at frame rate.
 */
class MovementStore {
  private snapshot = initialSnapshot();
  private listeners = new Set<Listener>();
  private nextEventId = 1;

  frame(speed: number, chain: number, sliding: boolean, grounded: boolean, dashCooldown = 0): void {
    const s = this.snapshot;
    s.speed = speed;
    s.fill = Math.min(1, speed / MOVEMENT.SPEED_CAP);
    s.chain = chain;
    s.sliding = sliding;
    s.grounded = grounded;
    s.dashCooldown = dashCooldown;
    this.notify();
  }

  pushEvent(type: MovementEventType, chain: number, gain: number, impact: number): void {
    const e = this.snapshot.event;
    e.id = this.nextEventId++;
    e.type = type;
    e.chain = chain;
    e.gain = gain;
    e.impact = impact;
    this.notify();
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener(this.snapshot));
  }
}

export const movementStore = new MovementStore();
