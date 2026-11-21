/** Personal presentation preferences, independent from saved modification rules. */
export type AccessibilitySettings = {
  vision: boolean;
  color: boolean;
  motor: boolean;
  textSize: number;
  lineHeight: number;
  contrast: 'original' | 'light' | 'dark';
  targetSize: number;
  spacing: number;
};
export const DEFAULT_ACCESSIBILITY: AccessibilitySettings = {
  vision: false,
  color: false,
  motor: false,
  textSize: 18,
  lineHeight: 1.6,
  contrast: 'original',
  targetSize: 44,
  spacing: 4,
};
export const accessibilityKey = (host: string) => `accessibility:${host}`;
export const accessibilityCssKey = (host: string) => `accessibility-css:${host}`;
export function readAccessibility(raw: unknown): AccessibilitySettings {
  const value = (raw && typeof raw === 'object' ? raw : {}) as Partial<AccessibilitySettings>;
  const bounded = (n: unknown, fallback: number, min: number, max: number) =>
    typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
  return {
    vision: value.vision === true,
    color: value.color === true,
    motor: value.motor === true,
    textSize: bounded(value.textSize, 18, 16, 28),
    lineHeight: bounded(value.lineHeight, 1.6, 1.4, 2),
    contrast: value.contrast === 'light' || value.contrast === 'dark' ? value.contrast : 'original',
    targetSize: bounded(value.targetSize, 44, 44, 64),
    spacing: bounded(value.spacing, 4, 0, 12),
  };
}
export function compileAccessibility(raw: unknown): string {
  const s = readAccessibility(raw);
  const css: string[] = [];
  const links = 'a[href]';
  const controls =
    'button,input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]),select,textarea,[role="button"]';
  if (s.vision) {
    css.push(
      `:where(p,li,dt,dd,label,legend,blockquote,figcaption,td,th,button,input,select,textarea){font-size:max(1em,${s.textSize}px)!important;line-height:${s.lineHeight}!important}`,
    );
    if (s.contrast !== 'original') {
      const bg = s.contrast === 'dark' ? '#17191c' : '#faf9f6';
      const fg = s.contrast === 'dark' ? '#f5f5f0' : '#1c2024';
      css.push(
        `html,body,:where(main,article,section,header,footer,nav,aside,div,p,li,h1,h2,h3,h4,h5,h6,table,td,th,${controls}){background-color:${bg}!important;color:${fg}!important}`,
      );
      css.push(`a[href]{color:${s.contrast === 'dark' ? '#a9d9ff' : '#174c8c'}!important}`);
    }
  }
  if (s.vision || s.color)
    css.push(
      `${links}{text-decoration-line:underline!important;text-underline-offset:0.2em!important;text-decoration-thickness:0.12em!important}`,
    );
  if (s.color) {
    css.push(
      '[aria-selected="true"],[aria-pressed="true"],[aria-current]:not([aria-current="false"]),input:checked{outline:3px solid currentColor!important;outline-offset:2px!important}',
    );
    css.push('[aria-invalid="true"]{border:3px dashed currentColor!important}');
  }
  if (s.motor) {
    css.push(
      `:where(${controls}){min-width:${s.targetSize}px!important;min-height:${s.targetSize}px!important;padding:8px 12px!important;margin:${s.spacing}px!important;box-sizing:border-box!important;touch-action:manipulation!important}`,
    );
    css.push(
      `input[type="checkbox"],input[type="radio"]{width:28px!important;height:28px!important;margin:${s.spacing + 4}px!important;vertical-align:middle!important}`,
    );
    css.push(
      `:where(nav a[href],[role="navigation"] a[href]){display:inline-flex!important;align-items:center!important;min-height:${s.targetSize}px!important;padding:8px!important;margin:${s.spacing}px!important}`,
    );
    css.push('button,[role="button"],a[href]{transition:none!important}');
  }
  if (s.vision || s.color || s.motor)
    css.push(
      ':focus-visible{outline:3px solid CanvasText!important;outline-offset:4px!important;box-shadow:0 0 0 4px Canvas!important}',
    );
  return css.join('\n');
}
