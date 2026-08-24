import type { GameEvent } from '@auto-punk/shared';
import Markdown from './Markdown.js';

const FIELD_LABEL: Record<string, string> = {
  'hp.current': 'HP',
  edgePool: 'Edge',
  edd: 'EDD',
};

export default function EventFeed({ events }: { events: GameEvent[] }) {
  return (
    <div className="feed">
      {events.map((e) => (
        <div key={e.seq} className={`event ${e.type}`}>
          <EventBody event={e} />
        </div>
      ))}
    </div>
  );
}

function EventBody({ event }: { event: GameEvent }) {
  const p = event.payload;
  switch (event.type) {
    case 'scene':
    case 'gm_resolution':
      return <Markdown text={String(p.narration ?? '')} />;
    case 'action_declared':
      return (
        <>
          <span className="who">{String(p.characterName)}</span>
          {String(p.intent)}
          {p.skillUsed ? <span className="muted"> ({String(p.skillUsed)})</span> : null}
        </>
      );
    case 'dice_roll':
      return (
        <>
          <b>{String(p.label)}</b>: pool {Number(p.pool)} → {Number(p.successes)} success{Number(p.successes) === 1 ? '' : 'es'}
          {p.fumble ? ' · FUMBLE' : ''} = <b>{Number(p.total)}</b>
        </>
      );
    case 'state_change': {
      const field = FIELD_LABEL[String(p.field)] ?? String(p.field);
      return (
        <span className="muted">
          {String(p.characterName)}: {field} {p.delta != null ? `${Number(p.delta) > 0 ? '+' : ''}${p.delta}` : `→ ${p.value}`}
        </span>
      );
    }
    case 'combat_start':
      return <>Combat! Initiative: {(p.participants as string[]).join(' → ')}</>;
    case 'character_created':
      return <span className="muted">{String(p.name)}{p.ai ? ' (AI)' : ''} is ready.</span>;
    case 'player_joined':
      return <span className="muted">{String(p.name)} joined the table.</span>;
    case 'combat_end':
      return <span className="muted">Combat ends.</span>;
    default:
      return null;
  }
}
