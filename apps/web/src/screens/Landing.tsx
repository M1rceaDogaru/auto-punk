import { useState } from 'react';
import { useGameStore } from '../store/useGameStore.js';

function roomIdFromUrl(): string | undefined {
  const q = new URLSearchParams(window.location.search).get('room');
  if (q) return q;
  const m = window.location.pathname.match(/\/r\/([A-Za-z0-9]+)/);
  return m?.[1];
}

function normalizeRoom(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  try {
    const u = new URL(trimmed, window.location.origin);
    const q = u.searchParams.get('room');
    if (q) return q;
    const m = u.pathname.match(/\/r\/([A-Za-z0-9]+)/);
    if (m) return m[1];
  } catch {
    /* not a URL */
  }
  return trimmed.replace(/\s+/g, '');
}

export default function Landing() {
  const createRoom = useGameStore((s) => s.createRoom);
  const joinRoom = useGameStore((s) => s.joinRoom);
  const connStatus = useGameStore((s) => s.connStatus);
  const error = useGameStore((s) => s.error);

  const [name, setName] = useState('');
  const [joinInput, setJoinInput] = useState(roomIdFromUrl() ?? '');

  const busy = connStatus === 'connecting';

  return (
    <div className="container">
      <h1>auto-punk</h1>
      <p className="muted">AI game master · Cyberpunk 2020 · no account needed. Share the room link to bring in players.</p>

      {error && <div className="error-banner">{error}</div>}

      <div className="row" style={{ alignItems: 'stretch' }}>
        <div className="card grow col">
          <h2>Create a table</h2>
          <label className="field">
            Your name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Host" />
          </label>
          <button disabled={!name.trim() || busy} onClick={() => createRoom(name.trim())}>
            {busy ? 'Connecting…' : 'Create table'}
          </button>
        </div>

        <div className="card grow col">
          <h2>Join a table</h2>
          <label className="field">
            Room link or code
            <input value={joinInput} onChange={(e) => setJoinInput(e.target.value)} placeholder="Paste the shared link" />
          </label>
          <label className="field">
            Your name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Player" />
          </label>
          <button
            disabled={!joinInput.trim() || !name.trim() || busy}
            onClick={() => joinRoom(normalizeRoom(joinInput), name.trim())}
          >
            {busy ? 'Connecting…' : 'Join table'}
          </button>
        </div>
      </div>
    </div>
  );
}
