import { Switch as BaseSwitch } from '@base-ui/react/switch';
import { motion, useReducedMotion } from 'motion/react';
import { useId, type ReactNode } from 'react';

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <BaseSwitch.Root
      render={<button type="button" />}
      nativeButton
      checked={checked}
      onCheckedChange={onChange}
      aria-label={label}
      title={label}
      disabled={disabled}
      className="switch-control"
    >
      <BaseSwitch.Thumb className="switch-thumb" />
    </BaseSwitch.Root>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
  label: string;
}) {
  const id = useId();
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <label key={option.value} className="segment">
          <input
            type="radio"
            name={id}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
          />
          <span>{option.label}</span>
        </label>
      ))}
    </div>
  );
}

export type AssemblyPhase = 'idle' | 'picking' | 'working' | 'preview' | 'saved';

/** Le mouvement de ces trois plans suit les états réels de l'éditeur. */
export function AssemblyDiagram({ phase = 'idle' }: { phase?: AssemblyPhase }) {
  const reduce = useReducedMotion();
  const positions: Record<AssemblyPhase, number[]> = {
    idle: [18, 3, -12],
    picking: [22, 3, -18],
    working: [12, 4, -4],
    preview: [18, 1, -18],
    saved: [2, 1, 0],
  };
  return (
    <svg
      className={`assembly-diagram phase-${phase}`}
      viewBox="0 0 150 112"
      fill="none"
      aria-hidden="true"
    >
      <path className="diagram-guide" d="M14 71v22m122-22v22M14 89h122M75 7v91" />
      {[0, 1, 2].map((layer) => (
        <motion.g
          key={layer}
          initial={false}
          animate={{ y: reduce ? positions.idle[layer] : positions[phase][layer] }}
          transition={{ duration: reduce ? 0 : 0.28, ease: [0.22, 1, 0.36, 1] }}
          className={`diagram-layer layer-${layer}`}
        >
          <path className="diagram-plane" d="m16 51 59-34 59 34-59 34-59-34Z" />
          {layer === 2 && (
            <>
              <path d="m28 51 47-27 47 27-47 27-47-27Zm11-6 47 27M62 31l47 27M50 58l35-20M68 68l35-20" />
              <path className="diagram-selection" d="m62 51 18-10 18 10-18 10-18-10Z" />
            </>
          )}
        </motion.g>
      ))}
      <path className="diagram-tick" d="M13 86v6m124-6v6" />
    </svg>
  );
}
