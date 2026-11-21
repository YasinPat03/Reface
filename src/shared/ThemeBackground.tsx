import Grainient from './grainient/Grainient';

const PRESETS = {
  dark: {
    colors: ['#26282d', '#3e444c', '#6e7a8c', '#94a3b8', '#94bdbb'],
    angle: 55,
    flow: 0.8,
    silk: 0.35,
    grainAmount: 0.08,
    interactive: false,
  },
  light: {
    colors: ['#0c0c0f', '#3f3f46', '#a1a1aa', '#fafafa'],
    angle: 40,
    flow: 0.65,
    silk: 1,
    grainAmount: 0.08,
    bands: 2,
    scale: 0.25,
    speed: 0.7,
    contrast: 0.99,
    interactive: false,
    clickSwirl: false,
    intro: false,
  },
};
export function ThemeBackground({ appearance }: { appearance: 'light' | 'dark' }) {
  const preset = PRESETS[appearance];
  return (
    <div
      className="theme-background"
      aria-hidden="true"
      style={{ background: `linear-gradient(${preset.angle}deg, ${preset.colors.join(', ')})` }}
    >
      <Grainient {...preset} />
    </div>
  );
}
