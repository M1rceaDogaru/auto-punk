import { useState } from 'react';
import { useGameStore } from '../store/useGameStore.js';
import EventFeed from '../components/EventFeed.js';
import CharacterSheet from '../components/CharacterSheet.js';

export default function Game() {
  const state = useGameStore((s) => s.state)!;
  const playerId = useGameStore((s) => s.playerId);
  const declareAction = useGameStore((s) => s.declareAction);
  const proceedRound = useGameStore((s) => s.proceedRound);

  const me = state.players.find((p) => p.id === playerId);
  const isHost = !!me?.isHost;
  const status = state.room.status;
  const busy = state.busy;
  const round = state.round;
  const myChar = state.characters.find((c) => c.playerId === playerId);

  const inPlay = status === 'playing' || status === 'combat';
  const canAct = inPlay && !!round && round.phase === 'collecting' && round.awaitingHumanIds.includes(playerId ?? '') && !busy;

  const [intent, setIntent] = useState('');
  const [skill, setSkill] = useState('');
  const [pool, setPool] = useState('');

  function submit(e: React.FormEvent): void {
    e.preventDefault();
    if (!intent.trim()) return;
    declareAction({
      intent: intent.trim(),
      skillUsed: skill || undefined,
      dicePool: pool ? Number(pool) : undefined,
    });
    setIntent('');
    setSkill('');
    setPool('');
  }

  const waiting = (round?.awaitingHumanIds ?? [])
    .map((id) => state.players.find((p) => p.id === id)?.name)
    .filter(Boolean);

  return (
    <div className="container">
      <div className="row spread" style={{ marginBottom: 12 }}>
        <h1>Table {state.room.id}</h1>
        <span className="badge">{status}{round ? ` · round ${round.number}` : ''}</span>
      </div>

      <div className="game-grid">
        <div className="col grow">
          <EventFeed events={state.events} />

          {busy && <div className="thinking">The GM is thinking…</div>}

          {!inPlay && status === 'ended' && (
            <div className="card">The session has ended. Thanks for playing.</div>
          )}

          {inPlay && round?.phase === 'collecting' && (
            <form className="card col" onSubmit={submit}>
              <h2>Your action</h2>
              <textarea
                rows={2}
                value={intent}
                onChange={(e) => setIntent(e.target.value)}
                placeholder="What does your character do? (e.g. I try to pickpocket the guard)"
                disabled={!canAct}
              />
              {myChar && Object.keys(myChar.skills).length > 0 && (
                <div className="row">
                  <select value={skill} onChange={(e) => setSkill(e.target.value)} disabled={!canAct}>
                    <option value="">No skill test</option>
                    {Object.entries(myChar.skills).map(([name, val]) => (
                      <option key={name} value={name}>{name} ({val})</option>
                    ))}
                  </select>
                  <input type="number" min={1} style={{ width: 90 }} placeholder="pool" value={pool} onChange={(e) => setPool(e.target.value)} disabled={!canAct} />
                </div>
              )}
              <div className="row spread">
                {waiting.length > 0 && (
                  <span className="muted small">Waiting for: {waiting.join(', ')}</span>
                )}
                <button type="submit" disabled={!canAct || !intent.trim()}>Declare action</button>
              </div>
            </form>
          )}

          {inPlay && isHost && round?.phase === 'collecting' && (
            <button className="ghost" onClick={proceedRound}>Proceed now (skip waiting players)</button>
          )}
        </div>

        <div className="col">
          {status === 'combat' && round?.initiative && (
            <div className="card col" style={{ marginBottom: 12 }}>
              <h2>Initiative</h2>
              {round.initiative.map((id, i) => {
                const c = state.characters.find((x) => x.id === id);
                if (!c) return null;
                return (
                  <div key={id} className="row spread small">
                    <span>{i + 1}. {c.name}</span>
                    <span className="muted">{c.hp.current}/{c.hp.max} HP</span>
                  </div>
                );
              })}
            </div>
          )}

          {state.characters.map((c) => (
            <CharacterSheet key={c.id} character={c} isMe={c.playerId === playerId} />
          ))}
        </div>
      </div>
    </div>
  );
}
