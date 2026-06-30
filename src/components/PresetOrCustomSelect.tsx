import { ChevronDown } from 'lucide-react';
import { useId } from 'react';
import type { ComponentType } from 'react';

interface PresetOrCustomSelectProps {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder: string;
  customPlaceholder: string;
  customLabel?: string;
  required?: boolean;
  disabled?: boolean;
  error?: boolean;
  icon?: ComponentType<{ size?: number; strokeWidth?: number }>;
  inputAriaLabel?: string;
}

function uniqueOptions(options: string[]) {
  return Array.from(new Set(options.map((option) => option.trim()).filter(Boolean)));
}

export default function PresetOrCustomSelect({
  label,
  value,
  options,
  onChange,
  placeholder,
  customPlaceholder,
  customLabel = 'Atau ketik custom',
  required = false,
  disabled = false,
  error = false,
  icon: Icon,
  inputAriaLabel,
}: PresetOrCustomSelectProps) {
  const generatedId = useId();
  const selectId = `${generatedId}-preset`;
  const normalizedOptions = uniqueOptions(options);
  const isPresetValue = normalizedOptions.includes(value);
  const customValue = isPresetValue ? '' : value;

  const fieldBorder = error
    ? 'border-rose-400 ring-2 ring-rose-100'
    : 'border-slate-300 focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10';

  return (
    <div className={`space-y-1.5 ${disabled ? 'opacity-40 pointer-events-none' : ''}`}>
      <label
        htmlFor={selectId}
        className="flex items-center gap-1 text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500"
      >
        {Icon && <Icon size={13} strokeWidth={2} />}
        {label}{required ? ' *' : ''}
      </label>

      <div className="relative">
        <select
          id={selectId}
          value={isPresetValue ? value : ''}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          className={`h-11 w-full appearance-none rounded-xl border bg-white px-3 pr-8 text-[14px] text-slate-700 outline-none transition-all duration-200 font-body ${fieldBorder}`}
        >
          <option value="">{placeholder}</option>
          {normalizedOptions.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <ChevronDown
          size={14}
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
      </div>

      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-3 py-2">
        <span className="mb-1 block text-[11px] font-medium uppercase tracking-[0.04em] text-slate-400">
          {customLabel}
        </span>
        <input
          type="text"
          value={customValue}
          onChange={(event) => onChange(event.target.value)}
          placeholder={customPlaceholder}
          disabled={disabled}
          aria-label={inputAriaLabel ?? customLabel}
          className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13px] text-slate-800 outline-none transition-all placeholder:text-slate-400 focus:border-teal-500 focus:ring-[3px] focus:ring-teal-500/10"
        />
      </div>
    </div>
  );
}
