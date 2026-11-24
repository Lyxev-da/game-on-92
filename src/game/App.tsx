import { useState } from 'react';
import { RobloxSandboxCanvas } from './components/RobloxSandboxCanvas';
import { UtgHud } from './components/UtgHud';

export function App() {
  const [shiftLocked, setShiftLocked] = useState(false);

  return (
    <main className="game">
      <RobloxSandboxCanvas shiftLocked={shiftLocked} onSetShiftLocked={setShiftLocked} />
      <UtgHud />
      {shiftLocked && <div className="reticle" aria-hidden="true" />}
      <p id="game-instructions" className="sr-only">
        Huss Valley, round based. Each round: vote for a map during intermission with 1, 2 or 3, then one player is
        chosen as the chaser. Runners must cross the valley between START and FINISH three times. Chasers infect runners
        they touch, and infected runners become chasers. Chasers win only if every runner is infected.
        WASD to run, Space to jump and bunny hop, E or Q to dash and break ankles, C to slide, F to dive.
        Jump into ledges to vault, run at walls to wall run. Shift locks the mouse. R returns you to your spawn.
      </p>
    </main>
  );
}

export default App;
