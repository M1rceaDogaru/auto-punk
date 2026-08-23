import { useState } from 'react';
import type { AIPersona } from '@auto-punk/shared';
import { useGameStore } from '../store/useGameStore.js';
import CharacterForm from '../components/CharacterForm.js';
import CharacterSheet from '../components/CharacterSheet.js';

const EMPTY_PERSONA: AIPersona = { archetype: '', personality: '', goals: [], secrets: [] };

export default function Lobby() {
  const state = useGameStore((s) => s.state)!;
  const playerId = useGameStore((s) => s.playerId);
  const setGame = useGameStore((s) => s.setGame);
  const configureAI = useGameStore((s) => s.configureAI);
  const createCharacter = useGameStore((s) => s.createCharacter);
  const startGame = useGameStore((s) => s.startGame);

  const me = state.players.find((p) => p.id === playerId);
  const isHost = !!me?.isHost;
  const status = state.room.status;
  const busy = state.busy;

  const humans = state.players.filter((p) => p.kind === 'human');
  const ais = state.players.filter((p) => p.kind === 'ai');
  const myChar = state.characters.find((c) => c.playerId === playerId);
  const allHumansReady = humans.every((h) => state.characters.some((c) => c.playerId === h.id));
  const canStart = isHost && status === 'character_creation' && allHumansReady;

  const [aiDraft, setAiDraft] = useState<AIPersona[]>(() => ais.map((a) => a.persona ?? EMPTY_PERSONA));
  const [copied, setCopied] = useState(false);

  function shareLink(): void {
    const url = `${window.location.origin}${window.location.pathname}?room=${state.room.id}`;
    navigator.clipboard?.writeText(url).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => window.prompt('Copy this link:', url),
    );
  }

  return (
    <div className="container">
      <div className="row spread" style={{ marginBottom: 16 }}>
        <h1>Table {state.room.id}</h1>
        <button className="secondary" onClick={shareLink}>{copied ? 'Copied!' : 'Copy invite link'}</button>
      </div>

      {status === 'creating' && isHost && (
        <div className="card col" style={{ marginBottom: 16 }}>
          <h2>Choose the game</h2>
          <div className="row">
            <span>Cyberpunk 2020</span>
            <button onClick={() => setGame('cyberpunk2020')}>Confirm & continue</button>
          </div>
        </div>
      )}

      {status === 'creating' && !isHost && (
        <div className="card" style={{ marginBottom: 16 }}>Waiting for the host to choose a game…</div>
      )}

      <div className="row" style={{ alignItems: 'stretch', gap: 16 }}>
        <div className="col grow">
          {isHost && status !== 'creating' && (
            <div className="card col">
              <h2>AI players ({aiDraft.length})</h2>
              {aiDraft.map((persona, i) => (
                <div key={i} className="row">
                  <input placeholder="Archetype (e.g. Solo)" value={persona.archetype} onChange={(e) => updateAi(i, 'archetype', e.target.value)} />
                  <input placeholder="Personality / vibe" value={persona.personality} onChange={(e) => updateAi(i, 'personality', e.target.value)} />
                  <button className="ghost" onClick={() => setAiDraft((d) => d.filter((_, j) => j !== i))}>×</button>
                </div>
              ))}
              <div className="row">
                <button className="secondary" onClick={() => setAiDraft((d) => [...d, { ...EMPTY_PERSONA }])}>Add AI</button>
                <button disabled={busy} onClick={() => configureAI(aiDraft)}>Apply roster</button>
              </div>
            </div>
          )}

          {!isHost && ais.length > 0 && (
            <div className="card">
              <h2>AI players</h2>
              {ais.map((a) => (
                <div key={a.id} className="small muted">{a.name}</div>
              ))}
            </div>
          )}

          <div className="card col">
            <h2>Your character</h2>
            {myChar ? (
              <>
                <span className="badge ready">Ready</span>
                <CharacterSheet character={myChar} isMe />
              </>
            ) : (
              status !== 'creating' && <CharacterForm onCreate={createCharacter} />
            )}
          </div>
        </div>

        <div className="col" style={{ width: 300 }}>
          <div className="card col">
            <h2>Players</h2>
            {state.players.map((p) => {
              const ready = state.characters.some((c) => c.playerId === p.id);
              return (
                <div key={p.id} className="row spread small">
                  <span>{p.name}{p.id === playerId ? ' (you)' : ''}</span>
                  <span className="row" style={{ gap: 6 }}>
                    {p.isHost && <span className="badge host">host</span>}
                    {p.kind === 'ai' && <span className="badge ai">AI</span>}
                    {ready ? <span className="badge ready">✓</span> : <span className="muted">…</span>}
                  </span>
                </div>
              );
            })}
          </div>

          {isHost && (
            <button disabled={!canStart || busy} onClick={startGame}>
              {busy ? 'Starting…' : allHumansReady ? 'Start the game' : 'Waiting for characters'}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  function updateAi(index: number, field: keyof AIPersona, value: string): void {
    setAiDraft((d) => d.map((p, i) => (i === index ? { ...p, [field]: value } : p)));
  }
}
