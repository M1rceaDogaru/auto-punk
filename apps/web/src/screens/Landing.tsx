import { useEffect, useState } from 'react';
import type { RoomSummary } from '@auto-punk/shared';
import { useGameStore } from '../store/useGameStore.js';

const NAME_KEY = 'autopunk.name';
const SEAT_PREFIX = 'autopunk.seat.';

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

/** Room ids this browser has previously sat in (from stored seat tokens). */
function mySeatRoomIds(): Set<string> {
  const ids = new Set<string>();
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(SEAT_PREFIX)) ids.add(k.slice(SEAT_PREFIX.length));
    }
  } catch {
    /* ignore storage errors */
  }
  return ids;
}

function timeAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const STATUS_LABEL: Record<string, string> = {
  creating: 'Setting up',
  character_creation: 'Characters',
  ready_check: 'Ready check',
  playing: 'Playing',
  combat: 'Combat',
  ended: 'Ended',
};

export default function Landing() {
  const createRoom = useGameStore((s) => s.createRoom);
  const joinRoom = useGameStore((s) => s.joinRoom);
  const fetchRooms = useGameStore((s) => s.fetchRooms);
  const rooms = useGameStore((s) => s.rooms);
  const connStatus = useGameStore((s) => s.connStatus);
  const error = useGameStore((s) => s.error);

  const [name, setName] = useState(() => {
    try { return localStorage.getItem(NAME_KEY) ?? ''; } catch { return ''; }
  });
  const [joinInput, setJoinInput] = useState(roomIdFromUrl() ?? '');

  useEffect(() => {
    fetchRooms();
    const id = setInterval(fetchRooms, 5000);
    return () => clearInterval(id);
  }, [fetchRooms]);

  const busy = connStatus === 'connecting';
  const seatIds = mySeatRoomIds();
  const hasName = !!name.trim();

  function rememberName(n: string): void {
    try { localStorage.setItem(NAME_KEY, n); } catch { /* ignore */ }
  }

  return (
    <div className="container">
      <h1>auto-punk</h1>
      <p className="muted">AI game master · Cyberpunk 2020 · no account needed. Share the room link to bring in players.</p>

      {error && <div className="error-banner">{error}</div>}

      <section className="card col" style={{ marginBottom: 16 }}>
        <div className="row spread">
          <h2>Tables</h2>
          <button className="ghost" onClick={() => fetchRooms()}>Refresh</button>
        </div>
        {rooms && rooms.length > 0 ? (
          <div className="room-list">
            {rooms.map((r) => (
              <RoomRow
                key={r.id}
                room={r}
                mine={seatIds.has(r.id)}
                hasName={hasName}
                busy={busy}
                onJoin={() => joinRoom(r.id, name.trim() || 'Player')}
              />
            ))}
          </div>
        ) : (
          <p className="muted small">No tables yet. Create one below to get started.</p>
        )}
      </section>

      <div className="row" style={{ alignItems: 'stretch' }}>
        <div className="card grow col">
          <h2>Create a table</h2>
          <label className="field">
            Your name
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Host" />
          </label>
          <button disabled={!hasName || busy} onClick={() => { rememberName(name.trim()); createRoom(name.trim()); }}>
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
            disabled={!joinInput.trim() || !hasName || busy}
            onClick={() => { rememberName(name.trim()); joinRoom(normalizeRoom(joinInput), name.trim()); }}
          >
            {busy ? 'Connecting…' : 'Join table'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RoomRow({ room, mine, hasName, busy, onJoin }: {
  room: RoomSummary;
  mine: boolean;
  hasName: boolean;
  busy: boolean;
  onJoin: () => void;
}) {
  const canNewJoin = ['creating', 'character_creation', 'ready_check'].includes(room.status);
  // Returning members (we hold a seat) re-enter in any status; new players only before play starts.
  const enabled = !busy && (mine || (canNewJoin && hasName));
  const label = mine ? 'Return' : canNewJoin ? 'Join' : room.status === 'ended' ? 'Ended' : 'In progress';

  return (
    <div className={`room-row${mine ? ' mine' : ''}`}>
      <span className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
        <span className={`badge status-${room.status}`}>{STATUS_LABEL[room.status] ?? room.status}</span>
        <b>{room.id}</b>
        {mine && <span className="badge host">your table</span>}
      </span>
      <div className="col grow" style={{ gap: 2 }}>
        <div className="muted small">
          {room.hostName ? `Host: ${room.hostName}` : 'No host yet'} · {room.playerCount} player{room.playerCount === 1 ? '' : 's'}
          {room.aiCount > 0 ? ` (${room.aiCount} AI)` : ''} · active {timeAgo(room.updatedAt)}
        </div>
        {room.label && <div className="small">“{room.label}”</div>}
      </div>
      <button className={mine ? '' : 'secondary'} disabled={!enabled} onClick={onJoin}>{label}</button>
    </div>
  );
}
