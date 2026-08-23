import { useGameStore } from './store/useGameStore.js';
import Landing from './screens/Landing.js';
import Lobby from './screens/Lobby.js';
import Game from './screens/Game.js';

export default function App() {
  const roomId = useGameStore((s) => s.roomId);
  const state = useGameStore((s) => s.state);
  const error = useGameStore((s) => s.error);
  const clearError = useGameStore((s) => s.clearError);

  if (!roomId || !state) return <Landing />;

  const inPlay = state.room.status === 'playing' || state.room.status === 'combat' || state.room.status === 'ended';

  return (
    <>
      {error && (
        <div className="container">
          <div className="error-banner row spread">
            <span>{error}</span>
            <button className="ghost" onClick={clearError}>Dismiss</button>
          </div>
        </div>
      )}
      {inPlay ? <Game /> : <Lobby />}
    </>
  );
}
