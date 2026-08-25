import { useEffect, useRef, useState } from 'react';
import { maxSkillPool } from '@auto-punk/shared';
import { useGameStore } from '../store/useGameStore.js';
import EventFeed from '../components/EventFeed.js';
import CharacterSheet from '../components/CharacterSheet.js';
import Markdown from '../components/Markdown.js';

export default function Game() {
  const state = useGameStore((s) => s.state)!;
  const playerId = useGameStore((s) => s.playerId);
  const declareAction = useGameStore((s) => s.declareAction);
  const proceedRound = useGameStore((s) => s.proceedRound);
  const gmChat = useGameStore((s) => s.gmChat);
  const askGm = useGameStore((s) => s.askGm);

  const me = state.players.find((p) => p.id === playerId);
  const isHost = !!me?.isHost;
  const status = state.room.status;
  const busy = state.busy;
  const round = state.round;
  const myChar = state.characters.find((c) => c.playerId === playerId);

  const inPlay = status === 'playing' || status === 'combat';
  const canAct = inPlay && !!round && round.phase === 'collecting' && round.awaitingHumanIds.includes(playerId ?? '') && !busy;

  const online = new Set(state.onlinePlayerIds);
  const awayHumans = state.players.filter((p) => p.kind === 'human' && !online.has(p.id));

  const [intent, setIntent] = useState('');
  const [skill, setSkill] = useState('');
  const [pool, setPool] = useState('');
  const [gmQuestion, setGmQuestion] = useState('');
  const gmLogRef = useRef<HTMLDivElement>(null);

  const maxPool = myChar && skill ? maxSkillPool(myChar, skill) : undefined;

  useEffect(() => {
    if (maxPool === undefined) return;
    const n = Number(pool);
    if (Number.isFinite(n) && n > maxPool) setPool(String(maxPool));
  }, [maxPool]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    gmLogRef.current?.scrollTo({ top: gmLogRef.current.scrollHeight });
  }, [gmChat]);

  function submit(e: React.FormEvent): void {
    e.preventDefault();
    if (!intent.trim()) return;
    let dicePool = pool ? Number(pool) : undefined;
    if (dicePool !== undefined && maxPool !== undefined) dicePool = Math.min(dicePool, maxPool);
    declareAction({
      intent: intent.trim(),
      skillUsed: skill || undefined,
      dicePool,
    });
    setIntent('');
    setSkill('');
    setPool('');
  }

  function submitGm(e: React.FormEvent): void {
    e.preventDefault();
    const q = gmQuestion.trim();
    if (!q) return;
    askGm(q);
    setGmQuestion('');
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

      {inPlay && awayHumans.length > 0 && (
        <div className="waiting-banner" style={{ marginBottom: 12 }}>
          ⏸ Waiting for <b>{awayHumans.map((h) => h.name).join(', ')}</b> to return before play resumes.
        </div>
      )}

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
                  <input
                    type="number"
                    min={1}
                    max={maxPool}
                    style={{ width: 90 }}
                    placeholder="pool"
                    value={pool}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === '') { setPool(''); return; }
                      let n = Number(raw);
                      if (!Number.isFinite(n)) return;
                      if (maxPool !== undefined) n = Math.min(n, maxPool);
                      setPool(String(Math.max(1, n)));
                    }}
                    disabled={!canAct}
                  />
                  {maxPool !== undefined && <span className="muted small">≤ {maxPool}</span>}
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
            <button
              className="ghost"
              disabled={awayHumans.length > 0}
              title={awayHumans.length > 0 ? `Waiting for ${awayHumans.map((h) => h.name).join(', ')} to reconnect` : undefined}
              onClick={proceedRound}
            >
              Proceed now (skip waiting players)
            </button>
          )}
        </div>

        <div className="col">
          {inPlay && (
            <div className="card col gm-chat">
              <h2>Ask the GM</h2>
              <p className="hint">Private questions about your character or the scene — answers don't affect the game.</p>
              <div className="gm-chat-log" ref={gmLogRef}>
                {gmChat.length === 0 && <span className="muted small">e.g. “What weapons am I carrying?”</span>}
                {gmChat.map((entry) => (
                  <div key={entry.id} className="col gm-msg">
                    <span className="small muted">You: {entry.question}</span>
                    {entry.answer ? <Markdown text={String(entry.answer)} /> : <span className="thinking small">The GM is thinking…</span>}
                  </div>
                ))}
              </div>
              <form onSubmit={submitGm}>
                <div className="row" style={{ gap: 8 }}>
                  <input value={gmQuestion} onChange={(e) => setGmQuestion(e.target.value)} placeholder="Ask the GM…" />
                  <button type="submit" disabled={!gmQuestion.trim()}>Ask</button>
                </div>
              </form>
            </div>
          )}

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
