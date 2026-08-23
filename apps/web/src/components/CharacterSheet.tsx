import type { Character } from '@auto-punk/shared';

export default function CharacterSheet({ character, isMe }: { character: Character; isMe?: boolean }) {
  const a = character.attributes;
  const hpPct = Math.max(0, Math.min(100, (character.hp.current / character.hp.max) * 100));
  return (
    <div className={`char-card ${isMe ? 'me' : ''}`}>
      <div className="row spread">
        <strong>{character.name}</strong>
        {isMe && <span className="badge host">you</span>}
      </div>
      <div className="small muted">
        HP {character.hp.current}/{character.hp.max} · Soak {character.soak} · Edge {character.edgePool} · EDD {character.edd}
      </div>
      <div className={`bar hp ${hpPct <= 30 ? 'low' : ''}`}>
        <span style={{ width: `${hpPct}%` }} />
      </div>
      <div className="stat-grid">
        <div className="stat"><b>{a.body}</b>BODY</div>
        <div className="stat"><b>{a.cool}</b>COOL</div>
        <div className="stat"><b>{a.intelligence}</b>INT</div>
        <div className="stat"><b>{a.reflexes}</b>REF</div>
        <div className="stat"><b>{a.tech}</b>TECH</div>
        <div className="stat"><b>{a.empathy}</b>EMP</div>
      </div>
    </div>
  );
}
