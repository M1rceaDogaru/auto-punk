import { useEffect, useState } from 'react';

interface NumberSliderProps {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

export default function NumberSlider({ value, min, max, onChange }: NumberSliderProps) {
  const [text, setText] = useState(String(value));

  useEffect(() => {
    setText(String(value));
  }, [value]);

  function commit(raw: string): void {
    const t = raw.trim();
    if (t === '') return;
    const n = Math.round(Number(t));
    if (Number.isFinite(n)) onChange(clamp(n, min, max));
  }

  return (
    <div className="num-slider">
      <input type="range" min={min} max={max} step={1} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <input
        type="number"
        min={min}
        max={max}
        className="num-slider-box"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          commit(e.target.value);
        }}
        onBlur={() => setText(String(value))}
      />
    </div>
  );
}
