// Sound engine: MyInstants clips bundled into the build (so they work from file://),
// plus procedural WebAudio blips for movement feedback.

import whereAreYouGoing from '../assets/sounds/where-are-you-going';
import whereAreYouGoingFahhh from '../assets/sounds/where-are-you-going-fahhh';
import brokenAnkles from '../assets/sounds/broken-ankles';
import ankleBreaker from '../assets/sounds/ankle-breaker';
import vineBoom from '../assets/sounds/vine-boom';
import fahhh from '../assets/sounds/fahhh';
import metalPipe from '../assets/sounds/metal-pipe';
import bruh from '../assets/sounds/bruh';
import faaah from '../assets/sounds/faaah-63455';
import ohNo from '../assets/sounds/oh-no-no-no-laugh-56694';
import michaelHeeHee from '../assets/sounds/michael-jackson-hee-hee-40277';
import dunDun from '../assets/sounds/dun-dun-dunnnnnnnn-68584';
import hahaLaugh from '../assets/sounds/haha-funny-laugh-93061';
import gopgopgop from '../assets/sounds/gopgopgop-41469';

export type MemeSoundKey =
  | 'where-are-you-going'
  | 'where-are-you-going-fahhh'
  | 'broken-ankles'
  | 'ankle-breaker'
  | 'vine-boom'
  | 'fahhh'
  | 'metal-pipe'
  | 'bruh'
  | 'faaah'
  | 'oh-no'
  | 'hee-hee'
  | 'dun-dun'
  | 'haha'
  | 'gopgopgop';

const MEME_URLS: Record<MemeSoundKey, string> = {
  'where-are-you-going': whereAreYouGoing,
  'where-are-you-going-fahhh': whereAreYouGoingFahhh,
  'broken-ankles': brokenAnkles,
  'ankle-breaker': ankleBreaker,
  'vine-boom': vineBoom,
  fahhh,
  'metal-pipe': metalPipe,
  bruh,
  faaah,
  'oh-no': ohNo,
  'hee-hee': michaelHeeHee,
  'dun-dun': dunDun,
  haha: hahaLaugh,
  gopgopgop,
};

const ANKLE_LINES: MemeSoundKey[] = [
  'where-are-you-going',
  'where-are-you-going-fahhh',
  'broken-ankles',
  'ankle-breaker',
];
const TAUNTS: MemeSoundKey[] = ['where-are-you-going', 'where-are-you-going-fahhh', 'gopgopgop', 'dun-dun', 'haha', 'hee-hee'];
const CAUGHT_SOUNDS: MemeSoundKey[] = ['fahhh', 'faaah', 'oh-no', 'metal-pipe'];

/** Subtitles shown on screen for each clip so the goofy stuff reads clearly. */
export const MEME_CAPTIONS: Record<MemeSoundKey, string> = {
  'where-are-you-going': 'WHERE ARE YOU GOING?!',
  'where-are-you-going-fahhh': 'WHERE ARE YOU GOING FAHHH!',
  'broken-ankles': 'BROKEN ANKLES!',
  'ankle-breaker': 'ANKLE BREAKER!',
  'vine-boom': 'BOOM!',
  fahhh: 'FAHHHHH!',
  'metal-pipe': 'CLANG!',
  bruh: 'BRUH.',
  faaah: 'FAAAAH!',
  'oh-no': 'OH NO NO NO!',
  'hee-hee': 'HEE HEE!',
  'dun-dun': 'DUN DUN DUNNN',
  haha: 'HAHA!',
  gopgopgop: 'GOP GOP GOP!',
};

const pick = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)];

class SoundEffects {
  private ctx: AudioContext | null = null;
  private buffers = new Map<MemeSoundKey, AudioBuffer>();
  private loadStarted = false;
  private lastAt = new Map<string, number>();
  public muted = false;

  /** Number of meme clips decoded and ready. Exposed for diagnostics and tests. */
  get loadedCount(): number {
    return this.buffers.size;
  }

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined' || this.muted) return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    if (!this.loadStarted) {
      this.loadStarted = true;
      this.preload();
    }
    return this.ctx;
  }

  /** Call from a user gesture (keydown / mousedown) so browsers allow audio. */
  unlock(): void {
    this.getContext();
  }

  private preload(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    (Object.keys(MEME_URLS) as MemeSoundKey[]).forEach((key) => {
      fetch(MEME_URLS[key])
        .then((res) => res.arrayBuffer())
        .then((buf) => ctx.decodeAudioData(buf))
        .then((decoded) => {
          this.buffers.set(key, decoded);
        })
        .catch(() => {
          // Clip failed to decode: playMeme falls back to an HTMLAudio element.
        });
    });
  }

  /** Plays a clip. Returns false when the cooldown blocked it. */
  playMeme(key: MemeSoundKey, volume = 0.8, cooldownMs = 700): boolean {
    if (this.muted || typeof window === 'undefined') return false;
    const nowMs = performance.now();
    if (nowMs - (this.lastAt.get(key) ?? -1e9) < cooldownMs) return false;
    this.lastAt.set(key, nowMs);

    const ctx = this.getContext();
    const buf = this.buffers.get(key);
    if (ctx && buf) {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const gain = ctx.createGain();
      gain.gain.value = volume;
      src.connect(gain);
      gain.connect(ctx.destination);
      src.start();
      return true;
    }

    // Clip still decoding or WebAudio unavailable: HTMLAudio plays the bundled data URL.
    try {
      const audio = new Audio(MEME_URLS[key]);
      audio.volume = Math.min(1, volume);
      void audio.play().catch(() => {});
    } catch {
      // Ignore: audio is optional.
    }
    return true;
  }

  /** Ankle break: picks a random line, with a global cooldown so clips never stack. */
  playAnkleBreaker(): MemeSoundKey {
    const key = pick(ANKLE_LINES);
    if (this.playMeme(key, 0.95, 350)) {
      this.lastAt.set('__ankle__', performance.now());
    }
    return key;
  }

  /** Random goofy taunt from a chaser. */
  playTaunt(): MemeSoundKey {
    const key = pick(TAUNTS);
    this.playMeme(key, 0.7, 2500);
    return key;
  }

  /** Random reaction when a runner is infected. */
  playCaughtReaction(): MemeSoundKey {
    const key = pick(CAUGHT_SOUNDS);
    this.playMeme(key, 0.85, 800);
    return key;
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), now + dur);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.01);
  }

  playFootstep(pitch = 1): void {
    this.tone('triangle', 135 * pitch, 48 * pitch, 0.045, 0.05);
  }

  playJump(chain = 0): void {
    const base = 190 + Math.min(chain * 18, 90);
    this.tone('sine', base, base * 1.95, 0.09, 0.09);
  }

  /** Springy boing for bounce pads. */
  playBoing(): void {
    this.tone('sine', 180, 980, 0.32, 0.12);
    this.tone('triangle', 420, 240, 0.22, 0.05, 0.04);
  }

  playPerfect(chain = 1): void {
    const root = 523.25 * Math.pow(2, Math.min(chain, 8) / 12);
    this.tone('sine', root, root, 0.14, 0.06);
    this.tone('sine', root * 1.5, root * 1.5, 0.14, 0.06, 0.07);
  }

  playDash(): void {
    this.tone('sawtooth', 320, 920, 0.11, 0.055);
    this.tone('sine', 240, 620, 0.12, 0.07);
  }

  playLand(intensity = 1): void {
    this.tone('sine', 110, 34, 0.075, Math.min(0.14, Math.max(0.04, intensity * 0.09)));
  }

  playSlide(): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const size = Math.floor(ctx.sampleRate * 0.18);
    const buffer = ctx.createBuffer(1, size, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < size; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / size);
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(900, now);
    filter.frequency.exponentialRampToValueAtTime(320, now + 0.18);
    filter.Q.value = 1.8;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
  }

  playMantle(): void {
    this.tone('sine', 240, 520, 0.16, 0.06);
    this.tone('triangle', 420, 900, 0.14, 0.03, 0.03);
  }

  playWallJump(): void {
    this.tone('square', 180, 430, 0.11, 0.04);
    this.tone('sine', 220, 430, 0.09, 0.08, 0.02);
  }

  playShiftLock(locked: boolean): void {
    this.tone('triangle', locked ? 520 : 680, locked ? 780 : 440, 0.06, 0.05);
  }

  playChainLost(): void {
    this.tone('triangle', 320, 140, 0.18, 0.04);
  }

  playCrossing(step: number): void {
    const base = 523.25 * Math.pow(1.12, step);
    this.tone('sine', base, base, 0.1, 0.08);
    this.tone('sine', base * 1.25, base * 1.25, 0.12, 0.08, 0.08);
    this.tone('sine', base * 1.5, base * 1.5, 0.2, 0.09, 0.16);
  }

  playTag(success: boolean): void {
    if (success) {
      this.tone('square', 660, 990, 0.08, 0.06);
      this.tone('square', 990, 1320, 0.12, 0.06, 0.08);
      this.playMeme('vine-boom', 0.7, 800);
    } else {
      this.tone('sawtooth', 330, 110, 0.3, 0.08);
      this.playCaughtReaction();
    }
  }

  /** Countdown beep. The last one (n === 0) is the high GO note. */
  playTick(n: number): void {
    if (n === 0) {
      this.tone('square', 880, 880, 0.22, 0.07);
      this.tone('sine', 1320, 1320, 0.3, 0.08, 0.02);
    } else {
      this.tone('square', 440, 440, 0.1, 0.05);
    }
  }

  playVote(): void {
    this.tone('triangle', 520, 780, 0.08, 0.07);
  }

  playRoundStart(): void {
    this.tone('sine', 440, 440, 0.1, 0.07);
    this.tone('sine', 554, 554, 0.1, 0.07, 0.11);
    this.tone('sine', 659, 659, 0.18, 0.08, 0.22);
  }

  playSurvive(): void {
    this.tone('sine', 523, 523, 0.12, 0.07);
    this.tone('sine', 659, 659, 0.12, 0.07, 0.12);
    this.tone('sine', 784, 784, 0.12, 0.07, 0.24);
    this.tone('sine', 1046, 1046, 0.3, 0.08, 0.36);
  }
}

export const soundFX = new SoundEffects();

// Diagnostics hook: lets tests (and curious players in devtools) check that clips decoded.
if (typeof window !== 'undefined') {
  (window as unknown as { __hussSoundCount?: () => number }).__hussSoundCount = () => soundFX.loadedCount;
}
