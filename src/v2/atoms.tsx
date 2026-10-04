import React from 'react';

/** Petits éléments d'interface de l'Atelier v2 (gris Blender + bleu d'action), partagés par tous les écrans. */

export const Section: React.FC<{ title: string; hint?: string; right?: React.ReactNode; children: React.ReactNode }> = ({ title, hint, right, children }) => (
  <section className="flex flex-col gap-2">
    <div className="flex items-baseline justify-between gap-3">
      <h3 className="text-[13px] font-semibold text-hx-text">{title}</h3>
      {right}
    </div>
    {hint && <p className="-mt-1 text-[12px] leading-snug text-hx-faint">{hint}</p>}
    {children}
  </section>
);

export const Segmented: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; hint?: string }[];
  columns?: 2 | 3 | 4;
}> = ({ label, value, onChange, options, columns = 2 }) => (
  <div role="radiogroup" aria-label={label} className={`grid gap-2 ${columns === 2 ? 'grid-cols-2' : columns === 3 ? 'grid-cols-3' : 'grid-cols-4'}`}>
    {options.map((o) => {
      const on = o.value === value;
      return (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={on}
          onClick={() => onChange(o.value)}
          className={`rounded-lg border p-3 text-left transition ${on ? 'border-hx-accent bg-hx-accent-soft' : 'border-hx-line2 bg-transparent hover:bg-hx-hover/40'}`}
        >
          <div className="text-[13.5px] font-semibold text-hx-text">{o.label}</div>
          {o.hint && <div className="mt-0.5 text-[12px] text-hx-faint">{o.hint}</div>}
        </button>
      );
    })}
  </div>
);

export const Chips: React.FC<{ label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }> = ({ label, value, onChange, options }) => (
  <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
    {options.map((o) => {
      const on = o.value === value;
      return (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={on}
          onClick={() => onChange(o.value)}
          className={`h-10 rounded-lg border px-3.5 text-[13.5px] transition ${on ? 'border-hx-accent bg-hx-accent-soft text-hx-text' : 'border-hx-line2 text-hx-dim hover:bg-hx-hover/40'}`}
        >
          {o.label}
        </button>
      );
    })}
  </div>
);

export const NumberStepper: React.FC<{ label: string; value: number; onChange: (n: number) => void; min?: number; max?: number; format?: (n: number) => string }> = ({
  label,
  value,
  onChange,
  min = 0,
  max = 60,
  format,
}) => (
  <div className="flex items-center justify-between gap-3">
    <span className="text-[13px] font-semibold text-hx-text">{label}</span>
    <div className="flex items-center gap-1 rounded-lg border border-hx-line2 p-[3px]">
      <button type="button" aria-label={`${label} : moins`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - 1))} className="h-8 w-9 rounded-md bg-hx-hover text-[17px] text-hx-text transition hover:bg-hx-line2 disabled:opacity-40">
        −
      </button>
      <span className="w-14 text-center font-mono text-[15px] text-hx-text">{format ? format(value) : value}</span>
      <button type="button" aria-label={`${label} : plus`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + 1))} className="h-8 w-9 rounded-md bg-hx-hover text-[17px] text-hx-text transition hover:bg-hx-line2 disabled:opacity-40">
        +
      </button>
    </div>
  </div>
);

export const TextField: React.FC<{ label: string; optional?: boolean; value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean }> = ({
  label,
  optional,
  value,
  onChange,
  placeholder,
  multiline,
}) => (
  <label className="flex flex-col gap-1.5">
    <span className="text-[13px] font-semibold text-hx-text">
      {label} {optional && <span className="font-normal text-hx-faint">(facultatif)</span>}
    </span>
    {multiline ? (
      <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={2} className="resize-none rounded-lg border border-hx-line2 bg-hx-base/60 px-3 py-2 text-[14px] text-hx-text outline-none placeholder:text-hx-faint focus:border-hx-accent" />
    ) : (
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="h-[38px] rounded-lg border border-hx-line2 bg-hx-base/60 px-3 text-[14px] text-hx-text outline-none placeholder:text-hx-faint focus:border-hx-accent" />
    )}
  </label>
);

export const CheckRow: React.FC<{ label: string; checked: boolean; onChange: (v: boolean) => void }> = ({ label, checked, onChange }) => (
  <label className="flex h-10 items-center gap-2.5 rounded-lg border border-hx-line2 px-3 text-[13.5px] text-hx-text">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[#3f6fc4]" />
    {label}
  </label>
);

export const Note: React.FC<{ tone?: 'info' | 'warn' | 'ok'; children: React.ReactNode }> = ({ tone = 'info', children }) => (
  <div className={`flex gap-2.5 rounded-lg bg-hx-card px-3 py-2.5 text-[12.5px] leading-relaxed text-hx-dim`}>
    <span className={`mt-0.5 shrink-0 ${tone === 'warn' ? 'text-hx-warn' : tone === 'ok' ? 'text-hx-ok' : 'text-hx-violet'}`}>●</span>
    <span>{children}</span>
  </div>
);

export const PrimaryButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { hint?: string }> = ({ children, hint, className = '', ...rest }) => (
  <button {...rest} className={`flex h-10 flex-1 items-center justify-center gap-2.5 rounded-lg bg-hx-accent text-[14px] font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 ${className}`}>
    {children}
    {hint && <span className="font-mono text-[11.5px] opacity-70">{hint}</span>}
  </button>
);

export const GhostButton: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement>> = ({ children, className = '', ...rest }) => (
  <button {...rest} className={`h-10 rounded-lg border border-hx-line2 bg-hx-hover px-4 text-[13.5px] text-hx-text transition hover:brightness-110 disabled:opacity-40 ${className}`}>
    {children}
  </button>
);
