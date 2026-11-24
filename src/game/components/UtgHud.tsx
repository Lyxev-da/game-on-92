import { useEffect, useRef, useState } from 'react';
import { CROSSINGS_TO_WIN, MAPS, game, xpForLevel, type GameState, type Outcome, type Participant } from './gameStore';
import { movementStore } from '../utils/movementStore';
import { MOVEMENT } from './PlayerController';
import { VALLEY_BOUNDS } from './level';
import { soundFX } from '../utils/sound';

const RUNNER_COLOR = '#ffd23a';
const CHASER_COLOR = '#ff5a4e';

const OUTCOME_TEXT: Record<Outcome, string> = {
  escaped: 'you made it across!',
  survived: 'you survived the valley',
  infected: 'you got infected',
  'chasers-win': 'you infected everyone!',
  'chasers-lose': 'the runners got away',
};
const GOOD_OUTCOMES: Outcome[] = ['escaped', 'survived', 'chasers-win'];

function Pips({ done, total = CROSSINGS_TO_WIN }: { done: number; total?: number }) {
  return (
    <span className="utg-pips" aria-label={`${done} of ${total} crossings`}>
      {Array.from({ length: total }, (_, i) => (
        <i key={i} className={i < done ? 'is-done' : ''} />
      ))}
    </span>
  );
}

/** Top-center pill during intermission: countdown to the next round. */
function IntermissionPill({ state }: { state: GameState }) {
  if (state.phase !== 'intermission') return null;
  return (
    <div className="utg-phase">
      <span className="utg-phase-label">intermission</span>
      <span className="utg-phase-count">{Math.ceil(state.phaseTime)}</span>
      <span className="utg-phase-sub">vote for the next map</span>
    </div>
  );
}

/** Map vote: three colored cards like UTG's gamemode list. Keys 1-3 or click. */
function VotePanel({ state }: { state: GameState }) {
  if (state.phase !== 'intermission') return null;
  const leading = Math.max(...MAPS.map((m) => state.votes[m.id]));
  return (
    <div className="utg-vote" role="group" aria-label="Map vote">
      {MAPS.map((m, i) => {
        const votes = state.votes[m.id];
        const selected = state.myVote === m.id;
        return (
          <button
            key={m.id}
            type="button"
            className={`utg-vote-card ${selected ? 'is-selected' : ''} ${votes === leading && votes > 0 ? 'is-leading' : ''}`}
            style={{ ['--card' as string]: m.color }}
            onClick={(e) => {
              e.currentTarget.blur();
              game.vote(m.id);
              soundFX.playVote();
            }}
          >
            <span className="utg-vote-key">{i + 1}</span>
            <span className="utg-vote-name">{m.name}</span>
            <span className="utg-vote-blurb">{m.blurb}</span>
            <span className="utg-vote-count">
              {votes} {votes === 1 ? 'vote' : 'votes'}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Top-center round timer with the objective and crossing pips. */
function RoundTimer({ state }: { state: GameState }) {
  if (state.phase !== 'playing') return null;
  const t = Math.ceil(state.timeLeft);
  const urgent = state.timeLeft < 10;
  const runner = state.role === 'runner';
  return (
    <div className={`utg-timer ${urgent ? 'utg-timer--urgent' : ''}`}>
      <span className="utg-timer-value">
        {Math.floor(t / 60)}:{(t % 60).toString().padStart(2, '0')}
      </span>
      <span className="utg-objective">
        {!runner
          ? 'infect every runner'
          : state.finished
            ? 'you made it · safe'
            : `go ${state.targetZone.toUpperCase()}`}
      </span>
      {runner && <Pips done={state.crossings} />}
      <div className="utg-counts">
        <span className="is-runners">{state.runnersAlive} runners</span>
        <span className="is-chasers">{state.chasersAlive} chasers</span>
      </div>
    </div>
  );
}

/** Thin START to FINISH strip with a dot per player, so the huge valley stays readable. */
function ValleyStrip({ state }: { state: GameState }) {
  const refs = useRef<Record<string, HTMLSpanElement | null>>({});
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const live = (window as unknown as { __hussRoster?: Array<{ id: string; z: number }> }).__hussRoster;
      if (!live) return;
      const span = VALLEY_BOUNDS.START_LINE_Z - VALLEY_BOUNDS.FINISH_LINE_Z;
      for (const p of live) {
        const el = refs.current[p.id];
        if (!el) continue;
        const t = Math.min(1, Math.max(0, (VALLEY_BOUNDS.START_LINE_Z - p.z) / span));
        el.style.left = `${(t * 100).toFixed(2)}%`;
      }
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);
  if (state.phase !== 'playing' && state.phase !== 'intro') return null;
  return (
    <div className="utg-strip" aria-hidden="true">
      <span className="utg-strip-end">start</span>
      <div className="utg-strip-track">
        {state.roster.map((p) => (
          <span
            key={p.id}
            ref={(el) => { refs.current[p.id] = el; }}
            className={`utg-strip-dot ${p.isPlayer ? 'is-you' : ''} ${p.role === 'tagger' ? 'is-chaser' : 'is-runner'} ${p.finished ? 'is-done' : ''}`}
          />
        ))}
      </div>
      <span className="utg-strip-end">finish</span>
    </div>
  );
}

/** Intro: role reveal with a colored vignette (UTG "role change visuals: full") and the countdown. */
function RoleSplash({ state }: { state: GameState }) {
  if (state.phase !== 'intro') return null;
  const chaser = state.roster.find((p) => p.role === 'tagger');
  const youChaser = state.role === 'tagger';
  const color = youChaser ? CHASER_COLOR : RUNNER_COLOR;
  const n = Math.ceil(state.phaseTime);
  const map = MAPS.find((m) => m.id === state.mapId);
  return (
    <div className="utg-splash" style={{ ['--role' as string]: color }}>
      <div className="utg-edge" />
      <div className="utg-splash-body">
        <span className="utg-splash-map" style={{ ['--card' as string]: map?.color }}>
          {map?.name} · round {state.roundNumber}
        </span>
        <span className="utg-splash-you">you are a</span>
        <span className="utg-splash-role">{youChaser ? 'CHASER' : 'RUNNER'}</span>
        <span className="utg-splash-sub">
          {youChaser
            ? 'infect every runner before they cross'
            : `${chaser?.name ?? 'someone'} is the chaser · make it across ${CROSSINGS_TO_WIN} times`}
        </span>
        {n <= 3 && <span key={n} className="utg-splash-count">{n}</span>}
      </div>
    </div>
  );
}

/** Red edge flash the moment you are infected mid-round. */
function InfectedVignette({ state }: { state: GameState }) {
  const [flash, setFlash] = useState(0);
  const prev = useRef({ role: state.role, phase: state.phase });
  useEffect(() => {
    if (prev.current.phase === 'playing' && state.phase === 'playing' && prev.current.role === 'runner' && state.role === 'tagger') {
      setFlash(Date.now());
    }
    prev.current = { role: state.role, phase: state.phase };
  }, [state.role, state.phase]);
  if (!flash) return null;
  return <div key={flash} className="utg-edge utg-edge--flash" style={{ ['--role' as string]: CHASER_COLOR }} />;
}

function CenterFlash({ state }: { state: GameState }) {
  const [msg, setMsg] = useState<{ text: string; color: string; id: number } | null>(null);
  const last = useRef({ phase: state.phase, role: state.role, crossings: state.crossings, ankle: state.anklePopupId });

  useEffect(() => {
    const prev = last.current;
    let text = '';
    let color = '#fff';
    if (state.anklePopupId !== prev.ankle) {
      text = state.anklePopupText || 'ANKLE BREAKER!';
      color = '#7cf2ff';
    } else if (state.phase === 'playing' && prev.phase === 'intro') {
      text = state.role === 'tagger' ? 'HUNT THEM!' : 'CROSS THE VALLEY!';
      color = state.role === 'tagger' ? CHASER_COLOR : RUNNER_COLOR;
    } else if (state.phase === 'playing' && prev.role === 'runner' && state.role === 'tagger') {
      text = "CAUGHT! YOU'RE A CHASER!";
      color = CHASER_COLOR;
    } else if (state.phase === 'playing' && state.crossings > prev.crossings) {
      text = state.crossings >= CROSSINGS_TO_WIN ? 'MADE IT ACROSS!' : `CROSSING ${state.crossings}/${CROSSINGS_TO_WIN}!`;
      color = '#73f27e';
    }
    last.current = { phase: state.phase, role: state.role, crossings: state.crossings, ankle: state.anklePopupId };
    if (!text) return;
    setMsg({ text, color, id: Date.now() + Math.random() });
    const t = window.setTimeout(() => setMsg(null), 1500);
    return () => window.clearTimeout(t);
  }, [state.phase, state.role, state.crossings, state.anklePopupId, state.anklePopupText]);

  if (!msg) return null;
  return (
    <div key={msg.id} className="utg-flash" style={{ color: msg.color }}>
      {msg.text}
    </div>
  );
}

function RoleBanner({ state }: { state: GameState }) {
  if (state.phase !== 'playing') return null;
  const chaser = state.role === 'tagger';
  const sub = chaser
    ? 'touch or click runners to infect'
    : state.finished
      ? 'safe · wait for the round to end'
      : state.inSafeZone
        ? 'safe zone · cross to score'
        : state.ntb > 0
          ? `shield · ${state.ntb.toFixed(1)}s`
          : `reach ${state.targetZone.toUpperCase()}`;
  return (
    <div className="utg-role" style={{ ['--role' as string]: chaser ? CHASER_COLOR : RUNNER_COLOR }}>
      <span className="utg-role-you">you are a</span>
      <span className="utg-role-name">{chaser ? 'CHASER' : 'RUNNER'}</span>
      <span className="utg-role-sub">{sub}</span>
    </div>
  );
}

function DashPill() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => movementStore.subscribe((s) => {
    const el = ref.current;
    if (!el) return;
    if (s.dashCooldown > 0.05) {
      el.textContent = `DASH ${s.dashCooldown.toFixed(1)}s`;
      el.classList.add('is-cooling');
    } else {
      el.textContent = 'DASH [E]';
      el.classList.remove('is-cooling');
    }
  }), []);
  return <div ref={ref} className="utg-dash">DASH [E]</div>;
}

function NtbTimer({ state }: { state: GameState }) {
  if (state.phase !== 'playing' || state.ntb <= 0) return null;
  return (
    <div className="utg-ntb">
      <svg viewBox="0 0 24 24" className="utg-ntb-shield" aria-hidden="true">
        <path d="M12 2 4 5v6c0 5 3.5 9.5 8 11 4.5-1.5 8-6 8-11V5l-8-3z" fill="#fff" stroke="#171717" strokeWidth="2" strokeLinejoin="round" />
      </svg>
      <span className="utg-ntb-value">{Math.ceil(state.ntb)}</span>
    </div>
  );
}

/** Top-left level card: level, XP bar and coins. */
function LevelCard({ state }: { state: GameState }) {
  const { level, xp, coins } = state.progress;
  const need = xpForLevel(level);
  return (
    <div className="utg-level">
      <span className="utg-level-badge">{level}</span>
      <div className="utg-level-body">
        <div className="utg-level-row">
          <span>level {level}</span>
          <span className="utg-level-coins">{coins} coins</span>
        </div>
        <div className="utg-level-bar"><i style={{ width: `${Math.min(100, (xp / need) * 100)}%` }} /></div>
        <div className="utg-level-xp">{xp} / {need} xp</div>
      </div>
    </div>
  );
}

function LeaderRow({ p }: { p: Participant }) {
  const chaser = p.role === 'tagger';
  return (
    <li className={`utg-lb-row ${p.isPlayer ? 'is-you' : ''} ${chaser ? 'is-chaser' : ''}`}>
      <span className="utg-lb-dot" style={{ background: chaser ? CHASER_COLOR : p.finished ? '#73f27e' : RUNNER_COLOR }} />
      <span className="utg-lb-name">{p.name}</span>
      {chaser ? <b className="utg-lb-tag">chaser</b> : p.finished ? <b className="utg-lb-tag is-ok">safe</b> : <Pips done={p.crossings} />}
    </li>
  );
}

/** Top-right leaderboard like UTG's player list: role colour, name and crossing pips. */
function Leaderboard({ state }: { state: GameState }) {
  const [muted, setMuted] = useState(soundFX.muted);
  const map = MAPS.find((m) => m.id === state.mapId);
  return (
    <div className="utg-lb">
      <div className="utg-lb-head">
        <span>huss valley</span>
        <span className="utg-lb-round">{state.roundNumber > 0 ? `round ${state.roundNumber} · ${map?.name}` : 'lobby'}</span>
      </div>
      <ul className="utg-lb-list">
        {state.roster.map((p) => <LeaderRow key={p.id} p={p} />)}
      </ul>
      <div className="utg-lb-foot">
        <span>wins <b>{state.score}</b></span>
        <span>ankles <b>{state.ankleBreaks}</b></span>
        <button
          type="button"
          className="utg-mute"
          aria-label={muted ? 'Unmute sounds' : 'Mute sounds'}
          onClick={(e) => {
            e.currentTarget.blur();
            soundFX.muted = !soundFX.muted;
            setMuted(soundFX.muted);
          }}
        >
          {muted ? 'SFX OFF' : 'SFX ON'}
        </button>
      </div>
    </div>
  );
}

function TagFeed({ state }: { state: GameState }) {
  if (state.feed.length === 0) return null;
  return (
    <div className="utg-feed">
      {state.feed.slice(0, 4).map((e) => (
        <div key={e.id} className={`utg-feed-row tone-${e.tone ?? 'tag'}`}>
          <span className={`utg-feed-avatar ${e.actor === 'You' ? 'is-you' : 'is-tagger'}`} />
          <span className="utg-feed-text"><b>{e.actor}</b> {e.text}</span>
        </div>
      ))}
    </div>
  );
}

/** Results screen: who won, what you did, and the XP and coins you earned. */
function ResultsPanel({ state }: { state: GameState }) {
  const r = state.result;
  if (state.phase !== 'results' || !r) return null;
  const good = GOOD_OUTCOMES.includes(r.outcome);
  const { level, xp } = state.progress;
  return (
    <div className={`utg-result ${r.winner === 'runners' ? 'is-runners' : 'is-chasers'}`}>
      <div className="utg-result-head">{r.winner} win!</div>
      <div className={`utg-result-badge ${good ? 'is-good' : ''}`}>{good ? 'victory' : 'better luck next time'}</div>
      <div className="utg-result-sub">{OUTCOME_TEXT[r.outcome]}</div>
      <div className="utg-result-grid">
        <div><b>{r.crossings}</b><span>crossings</span></div>
        <div><b>{r.infections}</b><span>infected</span></div>
        <div><b>{r.ankles}</b><span>ankles</span></div>
        <div><b>{r.escaped}/{r.runnersTotal}</b><span>escaped</span></div>
      </div>
      <div className="utg-result-reward">
        <span>+{r.xp} xp</span>
        <span className="is-coins">+{r.coins} coins</span>
      </div>
      <div className="utg-level-bar utg-result-bar"><i style={{ width: `${Math.min(100, (xp / xpForLevel(level)) * 100)}%` }} /></div>
      {r.leveledUp && <div className="utg-result-level">level up! you are level {level}</div>}
      <div className="utg-result-next">next round in {Math.ceil(state.phaseTime)}</div>
    </div>
  );
}

function ControlsHint({ state }: { state: GameState }) {
  if (state.phase !== 'intermission') return null;
  return (
    <div className="utg-hint">
      <span><b>WASD</b> run</span>
      <span><b>SPACE</b> jump / bhop</span>
      <span><b>E</b> juke dash</span>
      <span><b>C</b> slide</span>
      <span><b>F</b> dive</span>
      <span><b>1-3</b> vote</span>
    </div>
  );
}

function Speedometer() {
  const digits = useRef<HTMLSpanElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const chain = useRef<HTMLSpanElement>(null);
  useEffect(() => movementStore.subscribe((s) => {
    const v = String(Math.round(s.speed));
    if (digits.current && digits.current.textContent !== v) digits.current.textContent = v;
    if (bar.current) bar.current.style.transform = `scaleX(${Math.min(1, s.speed / MOVEMENT.SPEED_CAP).toFixed(4)})`;
    if (chain.current) chain.current.textContent = s.chain > 0 ? `×${s.chain}` : '';
    const vig = document.querySelector<HTMLElement>('.speed-vignette');
    if (vig) vig.style.opacity = Math.min(1, Math.max(0, (s.speed - 110) / 50)).toFixed(3);
  }), []);
  return (
    <output className="speed-counter" aria-label="Speed in studs per second" aria-live="off">
      <span ref={chain} className="speed-chain" />
      <span ref={digits} className="speed-value">0</span>
      <span className="speed-unit">studs/s</span>
      <span className="speed-bar"><span ref={bar} className="speed-bar-fill" /></span>
    </output>
  );
}

function ChaserIndicator({ state }: { state: GameState }) {
  const ref = useRef<HTMLDivElement>(null);
  const distRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const t = (window as unknown as { __chaserScreen?: { x: number; y: number; onScreen: boolean; dist: number } }).__chaserScreen;
      if (!t || !ref.current || !distRef.current) return;
      distRef.current.textContent = `${Math.round(t.dist)}m`;
      ref.current.style.opacity = t.onScreen ? '0' : '1';
      if (!t.onScreen) {
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        const ang = Math.atan2(t.y - cy, t.x - cx);
        const radius = Math.min(cx, cy) - 60;
        ref.current.style.transform = `translate(${cx + Math.cos(ang) * radius}px, ${cy + Math.sin(ang) * radius}px) translate(-50%,-50%) rotate(${ang}rad)`;
      }
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);
  if (state.phase !== 'playing') return null;
  return (
    <div ref={ref} className={`utg-chaser-arrow ${state.role === 'tagger' ? 'is-prey' : ''}`} aria-hidden="true">
      <span className="utg-chaser-arrow-head" />
      <span ref={distRef} className="utg-chaser-dist">0m</span>
    </div>
  );
}

export function UtgHud() {
  const [state, setState] = useState<GameState>({ ...game.state });
  useEffect(() => game.subscribe(() => setState({ ...game.state })), []);
  // The director only notifies ~10 times a second; this keeps countdowns smooth even if it pauses.
  useEffect(() => {
    const id = window.setInterval(() => setState({ ...game.state }), 100);
    return () => window.clearInterval(id);
  }, []);

  return (
    <>
      <div className="speed-vignette" aria-hidden="true" />
      <RoleSplash state={state} />
      <InfectedVignette state={state} />
      <LevelCard state={state} />
      <IntermissionPill state={state} />
      <VotePanel state={state} />
      <RoundTimer state={state} />
      <ValleyStrip state={state} />
      <CenterFlash state={state} />
      <Leaderboard state={state} />
      <RoleBanner state={state} />
      <DashPill />
      <NtbTimer state={state} />
      <TagFeed state={state} />
      <ResultsPanel state={state} />
      <ControlsHint state={state} />
      <Speedometer />
      <ChaserIndicator state={state} />
    </>
  );
}
