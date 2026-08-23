import { useState } from 'react';
import { ATTRIBUTE_KEYS, ATTRIBUTE_LABELS, SKILL_CATEGORIES, emptyAttributes, type Attributes, type NewCharacterInput } from '@auto-punk/shared';

interface SkillRow {
  name: string;
  value: number;
}

export default function CharacterForm({ onCreate }: { onCreate: (input: NewCharacterInput) => void }) {
  const [name, setName] = useState('');
  const [attributes, setAttributes] = useState<Attributes>(() => emptyAttributes());
  const [skills, setSkills] = useState<SkillRow[]>([]);

  const firstCat = SKILL_CATEGORIES[0];
  const [rowCat, setRowCat] = useState(firstCat.category);
  const catSkills = SKILL_CATEGORIES.find((c) => c.category === rowCat)?.skills ?? [];
  const [rowSkill, setRowSkill] = useState(catSkills[0] ?? '');
  const [rowVal, setRowVal] = useState(3);

  function changeCategory(cat: string): void {
    setRowCat(cat);
    const first = SKILL_CATEGORIES.find((c) => c.category === cat)?.skills[0] ?? '';
    setRowSkill(first);
  }

  function addSkill(): void {
    if (!rowSkill || skills.some((s) => s.name === rowSkill)) return;
    setSkills((prev) => [...prev, { name: rowSkill, value: rowVal }]);
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
        <h2>Attributes</h2>
        <div className="stat-grid">
          {ATTRIBUTE_KEYS.map((k) => (
            <label key={k} className="field stat">
              {ATTRIBUTE_LABELS[k]}
              <input
                type="number"
                min={1}
                max={6}
                value={attributes[k]}
                onChange={(e) => setAttributes((prev) => ({ ...prev, [k]: Number(e.target.value) }))}
              />
            </label>
          ))}
        </div>
      </div>

      <div className="col">
        <h2>Skills</h2>
        <div className="row">
          <select value={rowCat} onChange={(e) => changeCategory(e.target.value)}>
            {SKILL_CATEGORIES.map((c) => (
              <option key={c.category}>{c.category}</option>
            ))}
          </select>
          <select value={rowSkill} onChange={(e) => setRowSkill(e.target.value)}>
            {catSkills.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <input type="number" min={0} max={6} style={{ width: 70 }} value={rowVal} onChange={(e) => setRowVal(Number(e.target.value))} />
          <button type="button" className="secondary" onClick={addSkill}>Add</button>
        </div>
        {skills.length > 0 && (
          <ul style={{ margin: '8px 0', paddingLeft: 18 }}>
            {skills.map((s) => (
              <li key={s.name} className="row">
                <span>{s.name}</span>
                <b>{s.value}</b>
                <button type="button" className="ghost" onClick={() => setSkills((prev) => prev.filter((x) => x.name !== s.name))}>×</button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button type="submit">Create character</button>
    </form>
  );
}
