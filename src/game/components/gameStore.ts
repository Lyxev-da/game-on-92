/**
 * Round director for the Huss Valley loop:
 *
 *   intermission (map vote) -> intro (chaser reveal + countdown) -> playing -> results -> ...
 *
 * Everything advances from tick(dt). There are no timers, so the loop is deterministic,
 * testable, and cannot be left half-transitioned. State is mutated in place by a single
 * writer, which rules out the stale-snapshot overwrite that once froze the game.
 */

export type Role = 'runner' | 'tagger';
export type GamePhase = 'intermission' | 'intro' | 'playing' | 'results';
export type TargetZone = 'finish' | 'start';
export type MapId = 'valley' | 'ice' | 'sunset';
export type Outcome = 'escaped' | 'survived' | 'infected' | 'chasers-win' | 'chasers-lose';

export const CROSSINGS_TO_WIN = 3;

export const TIMINGS = {
  firstIntermission: 8,
  intermission: 14,
  intro: 4.5,
  play: 110,
  results: 9,
  immunity: 3,
} as const;

export interface MapInfo {
  id: MapId;
  name: string;
  blurb: string;
  color: string;
}

export const MAPS: MapInfo[] = [
  { id: 'valley', name: 'the valley', blurb: 'classic crossing', color: '#3f8fe0' },
  { id: 'ice', name: 'ice skate', blurb: 'everything is slippery', color: '#2fb4ba' },
  { id: 'sunset', name: 'sunset run', blurb: 'golden hour chase', color: '#e8812f' },
];

export interface FeedEntry {
  id: number;
  text: string;
  actor: string;
  victim: string;
  tone?: 'tag' | 'ankle' | 'cross' | 'win' | 'taunt';
}

export interface Participant {
  id: string;
  name: string;
  isPlayer: boolean;
  role: Role;
  /** Role at the start of the round, used to score the round fairly. */
  startRole: Role;
  crossings: number;
  finished: boolean;
  infections: number;
}

export interface RoundResult {
  winner: 'runners' | 'chasers';
  outcome: Outcome;
  crossings: number;
  infections: number;
  ankles: number;
  escaped: number;
  infected: number;
  runnersTotal: number;
  xp: number;
  coins: number;
  leveledUp: boolean;
}

export interface Progress {
  coins: number;
  xp: number;
  level: number;
}

export const xpForLevel = (level: number): number => 120 + level * 60;

export interface GameState {
  phase: GamePhase;
  /** Seconds left in the current phase (intermission, intro, results). */
  phaseTime: number;
  phaseTotal: number;
  roundNumber: number;
  mapId: MapId;
  votes: Record<MapId, number>;
  myVote: MapId | null;
  roster: Participant[];
  /** Player view of the roster, kept in sync for the HUD. */
  role: Role;
  crossings: number;
  finished: boolean;
  targetZone: TargetZone;
  inSafeZone: boolean;
  /** Seconds of start-of-round immunity for a runner. */
  ntb: number;
  timeLeft: number;
  score: number;
  ankleBreaks: number;
  anklePopupId: number;
  anklePopupText: string;
  runnersAlive: number;
  chasersAlive: number;
  chaserDistance: number;
  feed: FeedEntry[];
  result: RoundResult | null;
  progress: Progress;
  version: number;
}

const PROGRESS_KEY = 'huss-valley-progress-v1';
const BOT_NAMES = ['Builderman', 'xX_Noob_Xx', 'BaconHair', 'Guest1337', 'ankle_enjoyer', 'ItsRufus', 'GopGopGop'];

function loadProgress(): Progress {
  const fresh: Progress = { coins: 0, xp: 0, level: 1 };
  try {
    if (typeof localStorage === 'undefined') return fresh;
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return fresh;
    const p = JSON.parse(raw) as Partial<Progress>;
    return {
      coins: Math.max(0, Number(p.coins) || 0),
      xp: Math.max(0, Number(p.xp) || 0),
      level: Math.max(1, Number(p.level) || 1),
    };
  } catch {
    return fresh;
  }
}

function saveProgress(p: Progress): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(PROGRESS_KEY, JSON.stringify(p));
  } catch {
    // Progress is a nicety: ignore storage failures (private mode, quota).
  }
}

function freshRoster(): Participant[] {
  const make = (id: string, name: string, isPlayer: boolean): Participant => ({
    id, name, isPlayer, role: 'runner', startRole: 'runner', crossings: 0, finished: false, infections: 0,
  });
  return [make('you', 'You', true), ...BOT_NAMES.map((n, i) => make(`bot${i}`, n, false))];
}

const emptyVotes = (): Record<MapId, number> => ({ valley: 0, ice: 0, sunset: 0 });

function makeState(): GameState {
  return {
    phase: 'intermission',
    phaseTime: TIMINGS.firstIntermission,
    phaseTotal: TIMINGS.firstIntermission,
    roundNumber: 0,
    mapId: 'valley',
    votes: emptyVotes(),
    myVote: null,
    roster: freshRoster(),
    role: 'runner',
    crossings: 0,
    finished: false,
    targetZone: 'finish',
    inSafeZone: true,
    ntb: 0,
    timeLeft: TIMINGS.play,
    score: 0,
    ankleBreaks: 0,
    anklePopupId: 0,
    anklePopupText: '',
    runnersAlive: BOT_NAMES.length + 1,
    chasersAlive: 0,
    chaserDistance: Infinity,
    feed: [],
    result: null,
    progress: loadProgress(),
    version: 0,
  };
}

let state: GameState = makeState();
const listeners = new Set<() => void>();
let feedId = 1;
let ankleId = 1;
let forcedRole: Role | null = null;
let roundsSincePlayerChaser = 0;
let phaseElapsed = 0;
let emitAccum = 0;
let botVotes: Array<{ at: number; map: MapId; cast: boolean }> = [];
let lastCtx = { nearestThreat: Infinity, inSafeZone: false };

const pick = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)];

function pushFeed(actor: string, text: string, victim: string, tone: FeedEntry['tone']): void {
  state.feed = [{ id: feedId++, actor, text, victim, tone }, ...state.feed].slice(0, 5);
}

function emit(): void {
  listeners.forEach((l) => l());
}

function touch(): void {
  state.version++;
  emit();
}

function syncPlayerFields(): void {
  const s = state;
  const you = s.roster[0];
  s.role = you.role;
  s.crossings = you.crossings;
  s.finished = you.finished;
  s.targetZone = you.crossings % 2 === 0 ? 'finish' : 'start';
  s.runnersAlive = s.roster.filter((p) => p.role === 'runner').length;
  s.chasersAlive = s.roster.filter((p) => p.role === 'tagger').length;
}

function tallyVotes(): void {
  const v = emptyVotes();
  for (const b of botVotes) if (b.cast) v[b.map]++;
  if (state.myVote) v[state.myVote]++;
  state.votes = v;
}

function pickWinningMap(): MapId {
  const best = Math.max(...MAPS.map((m) => state.votes[m.id]));
  return pick(MAPS.filter((m) => state.votes[m.id] === best)).id;
}

function beginIntermission(first: boolean): void {
  const s = state;
  const length = first ? TIMINGS.firstIntermission : TIMINGS.intermission;
  s.phase = 'intermission';
  s.phaseTime = length;
  s.phaseTotal = length;
  phaseElapsed = 0;
  s.myVote = null;
  s.result = null;
  s.timeLeft = TIMINGS.play;
  s.ntb = 0;
  for (const p of s.roster) {
    p.role = 'runner';
    p.startRole = 'runner';
    p.crossings = 0;
    p.finished = false;
    p.infections = 0;
  }
  botVotes = BOT_NAMES.map(() => ({
    at: 1 + Math.random() * Math.max(1, length - 3.5),
    map: pick(MAPS).id,
    cast: false,
  }));
  tallyVotes();
  syncPlayerFields();
}

function startIntro(): void {
  const s = state;
  s.mapId = pickWinningMap();
  s.roundNumber++;
  s.phase = 'intro';
  s.phaseTime = TIMINGS.intro;
  s.phaseTotal = TIMINGS.intro;
  phaseElapsed = 0;
  s.timeLeft = TIMINGS.play;
  s.ntb = 0;
  s.ankleBreaks = 0;
  s.result = null;

  for (const p of s.roster) {
    p.role = 'runner';
    p.startRole = 'runner';
    p.crossings = 0;
    p.finished = false;
    p.infections = 0;
  }
  // One chaser per round. The player is picked on a forced role, a 20% roll, or as a pity pick.
  const you = s.roster[0];
  let chaser: Participant;
  if (forcedRole) {
    chaser = forcedRole === 'tagger' ? you : pick(s.roster.filter((p) => !p.isPlayer));
  } else if (roundsSincePlayerChaser >= 3 || Math.random() < 0.2) {
    chaser = you;
  } else {
    chaser = pick(s.roster.filter((p) => !p.isPlayer));
  }
  forcedRole = null;
  roundsSincePlayerChaser = chaser.isPlayer ? 0 : roundsSincePlayerChaser + 1;
  chaser.role = 'tagger';
  chaser.startRole = 'tagger';

  syncPlayerFields();
  pushFeed(chaser.isPlayer ? 'You' : chaser.name, 'is the chaser!', '', 'tag');
  touch();
}

function startPlaying(): void {
  state.phase = 'playing';
  state.phaseTime = 0;
  state.ntb = state.role === 'runner' ? TIMINGS.immunity : 0;
  touch();
}

function endRound(): void {
  const s = state;
  const you = s.roster[0];
  const runners = s.roster.filter((p) => p.startRole === 'runner');
  const survivors = runners.filter((p) => p.role === 'runner');
  const winner: RoundResult['winner'] = survivors.length > 0 ? 'runners' : 'chasers';

  let outcome: Outcome;
  if (you.startRole === 'runner') {
    outcome = you.finished ? 'escaped' : you.role === 'runner' ? 'survived' : 'infected';
  } else {
    outcome = winner === 'chasers' ? 'chasers-win' : 'chasers-lose';
  }

  const xp =
    20 +
    you.crossings * 20 +
    (outcome === 'escaped' ? 100 : outcome === 'survived' ? 60 : 0) +
    you.infections * 30 +
    s.ankleBreaks * 15 +
    (outcome === 'chasers-win' ? 80 : 0);
  const coins = Math.round(xp / 4);

  const progress = s.progress;
  progress.xp += xp;
  progress.coins += coins;
  let leveledUp = false;
  while (progress.xp >= xpForLevel(progress.level)) {
    progress.xp -= xpForLevel(progress.level);
    progress.level++;
    leveledUp = true;
  }
  saveProgress(progress);

  s.result = {
    winner,
    outcome,
    crossings: you.crossings,
    infections: you.infections,
    ankles: s.ankleBreaks,
    escaped: runners.filter((p) => p.finished).length,
    infected: runners.filter((p) => p.role === 'tagger').length,
    runnersTotal: runners.length,
    xp,
    coins,
    leveledUp,
  };
  if (outcome === 'escaped' || outcome === 'survived' || outcome === 'chasers-win') s.score++;

  s.phase = 'results';
  s.phaseTime = TIMINGS.results;
  s.phaseTotal = TIMINGS.results;
  phaseElapsed = 0;
  pushFeed(winner === 'runners' ? 'Runners' : 'Chasers', 'win the round!', '', 'win');
  touch();
}

function checkRoundEnd(): void {
  const s = state;
  const stillRunning = s.roster.filter((p) => p.role === 'runner' && !p.finished).length;
  if (s.timeLeft <= 0 || stillRunning === 0) endRound();
}

export const game = {
  get state(): GameState {
    return state;
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  /** Advances the whole round loop. Call once per frame. */
  tick(dt: number, ctx: { nearestThreat: number; inSafeZone: boolean }): void {
    const s = state;
    lastCtx = ctx;
    s.chaserDistance = ctx.nearestThreat;
    s.inSafeZone = ctx.inSafeZone;
    phaseElapsed += dt;
    s.phaseTime = Math.max(0, s.phaseTime - dt);

    switch (s.phase) {
      case 'intermission':
        for (const b of botVotes) {
          if (!b.cast && b.at <= phaseElapsed) {
            b.cast = true;
            tallyVotes();
          }
        }
        if (s.phaseTime <= 0) startIntro();
        break;
      case 'intro':
        if (s.phaseTime <= 0) startPlaying();
        break;
      case 'playing':
        s.ntb = Math.max(0, s.ntb - dt);
        s.timeLeft = Math.max(0, s.timeLeft - dt);
        checkRoundEnd();
        break;
      case 'results':
        if (s.phaseTime <= 0) {
          beginIntermission(false);
          touch();
        }
        break;
    }

    // Per-frame updates only notify subscribers about 10 times a second.
    emitAccum += dt;
    if (emitAccum >= 0.1) {
      emitAccum = 0;
      state.version++;
      emit();
    }
  },

  /** Cast or change the player's map vote during intermission. */
  vote(map: MapId): void {
    if (state.phase !== 'intermission') return;
    state.myVote = map;
    tallyVotes();
    touch();
  },

  /** A runner reached the target end zone. Returns what happened, or null if it did not count. */
  completeCrossing(id: string): 'crossing' | 'finished' | null {
    const s = state;
    if (s.phase !== 'playing') return null;
    const p = s.roster.find((r) => r.id === id);
    if (!p || p.role !== 'runner' || p.finished) return null;
    p.crossings++;
    const finished = p.crossings >= CROSSINGS_TO_WIN;
    if (finished) p.finished = true;
    if (p.isPlayer) {
      pushFeed('You', finished ? 'MADE IT ACROSS (3/3)!' : `crossing ${p.crossings}/${CROSSINGS_TO_WIN}`, '', finished ? 'win' : 'cross');
    } else if (finished) {
      pushFeed(p.name, 'made it across!', '', 'cross');
    }
    syncPlayerFields();
    touch();
    return finished ? 'finished' : 'crossing';
  },

  /** A chaser infected a runner. Returns false when the hit did not count. */
  infect(victimId: string, byId: string): boolean {
    const s = state;
    if (s.phase !== 'playing') return false;
    const victim = s.roster.find((r) => r.id === victimId);
    if (!victim || victim.role !== 'runner' || victim.finished) return false;
    if (victim.isPlayer && s.ntb > 0) return false;
    const by = s.roster.find((r) => r.id === byId);
    if (!by || by.role !== 'tagger') return false;
    victim.role = 'tagger';
    by.infections++;
    pushFeed(by.name, victim.isPlayer ? 'caught you!' : `infected ${victim.name}`, victim.name, 'tag');
    syncPlayerFields();
    touch();
    return true;
  },

  /** The player juked a chaser hard enough to break their ankles. */
  recordAnkleBreak(chaserName: string, line: string): void {
    state.ankleBreaks++;
    state.anklePopupId = ankleId++;
    state.anklePopupText = line;
    pushFeed('You', `broke ${chaserName}'s ankles!`, chaserName, 'ankle');
    touch();
  },

  /** A chaser yells something goofy. Feed only. */
  taunt(chaserName: string, line: string): void {
    pushFeed(chaserName, line, '', 'taunt');
    touch();
  },

  /** Force the player's role for the next round. Used by tests. */
  forceNextPlayerRole(role: Role | null): void {
    forcedRole = role;
  },

  /** Jump to the end of the current phase. Used by tests. */
  skipPhase(): void {
    state.phaseTime = 0;
    if (state.phase === 'playing') state.timeLeft = 0;
    this.tick(0, lastCtx);
  },

  reset(): void {
    state = makeState();
    forcedRole = null;
    roundsSincePlayerChaser = 0;
    emitAccum = 0;
    beginIntermission(true);
    touch();
  },
};

beginIntermission(true);
