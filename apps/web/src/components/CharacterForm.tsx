import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { ATTRIBUTE_KEYS, ATTRIBUTE_LABELS, ATTRIBUTE_POINT_BUDGET, SKILL_CATEGORIES, SKILL_POINT_BUDGET, emptyAttributes, type AttributeKey, type Attributes, type NewCharacterInput } from '@auto-punk/shared';
import NumberSlider from './NumberSlider';

interface SkillRow {
  name: string;
  value: number;
}

const ATTRIBUTE_HINTS: Record<AttributeKey, string> = {
  body: 'Physical strength and endurance. Sets your HP (Body + 5) and Soak (half of Body).',
  cool: 'Nerve under pressure. High Cool keeps you composed in tense or threatening situations.',
  intelligence: 'Raw mental capacity — learning, analysis, and recall.',
  reflexes: 'Speed and coordination. 4+ grants +1 Move; key for dodging and quick reactions.',
  tech: 'Technical aptitude — hacking, repair, and working with cyberware.',
  empathy: 'Emotional awareness. Lets you read people and sense their intentions.',
};

const SKILL_HINTS: Record<string, string> = {
  Guns: 'Firearms — pistols, SMGs, rifles. Your go-to for ranged gunfights.',
  Melee: 'Unarmed combat and melee weapons like knives and batons in close quarters.',
  Throwing: 'Knives and other thrown weapons at range.',
  Athletics: 'Running, jumping, climbing, swimming — raw physical performance.',
  Driving: "Piloting cars, bikes, and hovercars. High ratings keep you in control under fire.",
  Stealth: 'Sneaking, hiding, and avoiding detection.',
  Streetwise: 'Street knowledge — contacts, prices, and where to find what in Night City.',
  Barter: 'Haggling over price and deals. Higher rating means better prices.',
  Oratory: 'Public speaking — speeches, rallies, and moving a crowd.',
  Persuasion: 'Convincing individuals through words alone.',
  Psychology: 'Reading minds, spotting lies, and subtle mental manipulation.',
  Computer: 'Hacking computers directly — intrusion, data access, and manipulation.',
  Cyberdeck: "Running advanced hacks from a cyberdeck. The netrunner's tool of choice.",
  Electronics: 'Building and repairing electronic devices and circuits.',
  'First Aid': 'Basic emergency medical treatment to stabilize the wounded.',
  Medicine: 'Advanced medical knowledge — diagnosis, surgery, long-term care.',
  Repair: 'Fixing vehicles and mechanical equipment in the field.',
  'Security Systems': 'Bypassing alarms, locks, cameras, and other security tech.',
};

function InfoTip({ text }: { text: string }) {
  return (
    <span className="info-tip" tabIndex={0} onClick={(e) => e.stopPropagation()}>
      i
      <span className="info-tip-bubble">{text}</span>
    </span>
  );
}

const CATEGORY_COLORS: Record<string, [string, string]> = {
  Combat: ['#ff2a6d', '#ff8f5e'],
  Physical: ['#ffb020', '#ffe08a'],
  Social: ['#05d9e8', '#7ce7f3'],
  Technical: ['#3ddc84', '#9df5c1'],
};

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildSkillArt(seedKey: string, category: string): ReactNode[] {
  const rng = mulberry32(hashString(`${category}:${seedKey}`));
  const [c1, c2] = CATEGORY_COLORS[category] ?? ['#05d9e8', '#ff2a6d'];
  const nodes: ReactNode[] = [];

  nodes.push(<circle key="glow" cx={32} cy={32} r={14 + rng() * 8} fill={c1} opacity={0.12} />);

  for (let i = 0; i < 5; i++) {
    const kind = Math.floor(rng() * 4);
    const x = 10 + rng() * 44;
    const y = 10 + rng() * 44;
    const color = rng() > 0.5 ? c1 : c2;
    if (kind === 0) {
      nodes.push(
        <circle key={i} cx={x} cy={y} r={2 + rng() * 5} fill="none" stroke={color} strokeWidth={1.5} opacity={0.7 + rng() * 0.3} />,
      );
    } else if (kind === 1) {
      nodes.push(<circle key={i} cx={x} cy={y} r={1.5 + rng() * 2.5} fill={color} opacity={0.85} />);
    } else if (kind === 2) {
      const s = 4 + rng() * 7;
      nodes.push(
        <rect
          key={i}
          x={x - s / 2}
          y={y - s / 2}
          width={s}
          height={s}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          opacity={0.6 + rng() * 0.4}
          transform={`rotate(${Math.floor(rng() * 90)} ${x} ${y})`}
        />,
      );
    } else {
      const len = 8 + rng() * 14;
      const a = rng() * Math.PI;
      nodes.push(
        <line
          key={i}
          x1={x - (len / 2) * Math.cos(a)}
          y1={y - (len / 2) * Math.sin(a)}
          x2={x + (len / 2) * Math.cos(a)}
          y2={y + (len / 2) * Math.sin(a)}
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
          opacity={0.7}
        />,
      );
    }
  }
  return nodes;
}

function SkillArt({ seed, category }: { seed: string; category: string }) {
  const nodes = useMemo(() => buildSkillArt(seed, category), [seed, category]);
  return (
    <svg viewBox="0 0 64 64" className="skill-art" aria-hidden="true">
      {nodes}
    </svg>
  );
}

export default function CharacterForm({ onCreate }: { onCreate: (input: NewCharacterInput) => void }) {
  const [name, setName] = useState('');
  const [attributes, setAttributes] = useState<Attributes>(() => emptyAttributes());
  const [skills, setSkills] = useState<SkillRow[]>([]);

  const usedPoints = skills.reduce((sum, s) => sum + s.value, 0);
  const remainingPoints = SKILL_POINT_BUDGET - usedPoints;

  const attrUsed = ATTRIBUTE_KEYS.reduce((sum, k) => sum + attributes[k], 0);
  const attrRemaining = ATTRIBUTE_POINT_BUDGET - attrUsed;

  function setAttributeValue(key: AttributeKey, value: number): void {
    const others = attrUsed - attributes[key];
    const maxAllowed = Math.min(6, ATTRIBUTE_POINT_BUDGET - others);
    const v = Math.max(1, Math.min(maxAllowed, Math.round(value)));
    setAttributes((prev) => ({ ...prev, [key]: v }));
  }

  function addSkill(skillName: string): void {
    if (skills.some((s) => s.name === skillName)) return;
    if (remainingPoints < 1) return;
    setSkills((prev) => [...prev, { name: skillName, value: Math.min(3, remainingPoints) }]);
  }

  function removeSkill(skillName: string): void {
    setSkills((prev) => prev.filter((s) => s.name !== skillName));
  }

  function setSkillValue(skillName: string, value: number): void {
    const others = usedPoints - (skills.find((s) => s.name === skillName)?.value ?? 0);
    const maxAllowed = Math.min(6, SKILL_POINT_BUDGET - others);
    const v = Math.max(0, Math.min(maxAllowed, Math.round(value)));
    setSkills((prev) => prev.map((s) => (s.name === skillName ? { ...s, value: v } : s)));
  }

  function submit(e: React.FormEvent): void {
    e.preventDefault();
    const skillMap: Record<string, number> = {};
    for (const s of skills) skillMap[s.name] = s.value;
    onCreate({ name: name.trim() || 'Rockerboy', attributes, skills: skillMap });
  }

  return (
    <form className="col" onSubmit={submit}>
      <label className="field">
        Character name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Rache" />
      </label>

      <div>
        <div className="row spread">
          <h2>Attributes</h2>
          <span className={`badge${attrRemaining <= 0 ? ' host' : ''}`}>{attrRemaining} pts left</span>
        </div>
        <p className="hint">1–6 each, {ATTRIBUTE_POINT_BUDGET} points total across all six. Hover ⓘ for what each attribute does.</p>
        <div className="stat-grid">
          {ATTRIBUTE_KEYS.map((k) => (
            <label key={k} className="field stat">
              <span>
                {ATTRIBUTE_LABELS[k]} <InfoTip text={ATTRIBUTE_HINTS[k]} />
              </span>
              <NumberSlider value={attributes[k]} min={1} max={6} onChange={(v) => setAttributeValue(k, v)} />
            </label>
          ))}
        </div>
      </div>

      <div className="col">
        <div className="row spread">
          <h2>Skills</h2>
          <span className={`badge${remainingPoints <= 0 ? ' host' : ''}`}>{remainingPoints} pts left</span>
        </div>
        <p className="hint">
          You have {SKILL_POINT_BUDGET} skill points to spend. Click a card to add it at rating 3, then adjust or remove below. When you act with a
          skill the game rolls d10s equal to its rating — each die showing 5+ is a success and any 1 is an automatic fumble. Hover ⓘ on a card for what it does.
        </p>
        {SKILL_CATEGORIES.map((c) => (
          <section key={c.category} className="skill-section">
            <div className="skill-section-head">
              <SkillArt seed={`§${c.category}`} category={c.category} />
              <h3>{c.category}</h3>
            </div>
            <div className="skill-grid">
              {c.skills.map((s) => {
                const added = skills.some((x) => x.name === s);
                return (
                  <button type="button" key={s} className={`skill-card${added ? ' added' : ''}`} onClick={() => addSkill(s)} disabled={added || remainingPoints < 1}>
                    {added && <span className="skill-check">✓</span>}
                    <InfoTip text={SKILL_HINTS[s] ?? 'Rating adds dice to your pool when you test this skill.'} />
                    <SkillArt seed={s} category={c.category} />
                    <span>{s}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
        {skills.length > 0 && (
          <ul className="skill-list">
            {skills.map((s) => (
              <li key={s.name} className="row">
                <span className="skill-name">{s.name}</span>
                <NumberSlider value={s.value} min={0} max={6} onChange={(v) => setSkillValue(s.name, v)} />
                <button type="button" className="ghost" onClick={() => removeSkill(s.name)}>×</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button type="submit">Create character</button>
    </form>
  );
}
