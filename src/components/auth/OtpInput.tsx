import React, { useEffect, useRef } from 'react';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  length?: number;
  disabled?: boolean;
}

/** Saisie du code : une case par chiffre, collage et retour arrière gérés, complétion automatique. */
export const OtpInput: React.FC<Props> = ({ value, onChange, onComplete, length = 6, disabled }) => {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  useEffect(() => {
    refs.current[Math.min(value.length, length - 1)]?.focus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (next: string) => {
    const clean = next.replace(/\D/g, '').slice(0, length);
    onChange(clean);
    refs.current[Math.min(clean.length, length - 1)]?.focus();
    if (clean.length === length) onComplete?.(clean);
  };

  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` }}>
      {Array.from({ length }, (_, i) => {
        const filled = i < value.length;
        const current = i === Math.min(value.length, length - 1);
        return (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="text"
            inputMode="numeric"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            maxLength={length}
            disabled={disabled}
            aria-label={`Chiffre ${i + 1}`}
            value={value[i] ?? ''}
            onChange={(e) => {
              const d = e.target.value.replace(/\D/g, '');
              if (!d) return;
              set(value.slice(0, i) + d + value.slice(i + 1));
            }}
            onKeyDown={(e) => {
              if (e.key === 'Backspace') {
                e.preventDefault();
                set(value.slice(0, filled ? i : Math.max(0, i - 1)));
              } else if (e.key === 'ArrowLeft') refs.current[Math.max(0, i - 1)]?.focus();
              else if (e.key === 'ArrowRight') refs.current[Math.min(length - 1, i + 1)]?.focus();
            }}
            onPaste={(e) => {
              e.preventDefault();
              set(e.clipboardData.getData('text'));
            }}
            className={`h-[58px] min-w-0 rounded-[9px] border bg-[#262626] text-center font-mono text-2xl text-hx-text outline-none transition max-md:h-14 ${
              current && !disabled ? 'border-[1.5px] border-hx-accent' : 'border-hx-line2'
            }`}
          />
        );
      })}
    </div>
  );
};
