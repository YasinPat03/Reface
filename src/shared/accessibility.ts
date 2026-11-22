export const ACCESSIBILITY_MASTER = 'reface-accessibility:v1:enabled';

export const ACCESSIBILITY_PALETTE = 'reface-accessibility:v1:palette';
export const ACCESSIBILITY_CONTRAST = 'reface-accessibility:v1:contrast';
const reading = ':is(p,li,dt,dd,blockquote,figcaption):not(:is(code,pre,kbd,samp,math,svg) *)';
const fields =
  'input:not([type=hidden],[type=checkbox],[type=radio],[type=range],[type=color]),select,textarea';

export const ACCESSIBILITY_RULES = {
  'reface-accessibility:v1:text-size':
    'p,li,dt,dd,blockquote,figcaption{font-size:max(1em,18px)!important}',
  'reface-accessibility:v1:line-spacing':
    'p,li,dt,dd,blockquote,figcaption{line-height:1.6!important}',
  'reface-accessibility:v1:underline-links':
    'a[href]{text-decoration-line:underline!important;text-underline-offset:0.15em!important}',
  'reface-accessibility:v1:visible-focus':
    ':focus-visible{outline:3px solid CanvasText!important;outline-offset:2px!important;box-shadow:0 0 0 2px Canvas!important}',
  'reface-accessibility:v1:larger-controls':
    'button,input:not([type=hidden],[type=checkbox],[type=radio]),select,textarea,[role=button]{min-block-size:44px!important;min-inline-size:44px!important}input:is([type=checkbox],[type=radio]){min-block-size:24px!important;min-inline-size:24px!important}',
  'reface-accessibility:v1:letter-spacing': reading + '{letter-spacing:0.08em!important}',
  'reface-accessibility:v1:word-spacing': reading + '{word-spacing:0.16em!important}',
  'reface-accessibility:v1:reading-font':
    reading +
    '{font-family:Arial,Helvetica,sans-serif!important}pre,code,kbd,samp{font-family:monospace!important}',
  'reface-accessibility:v1:short-lines':
    ':is(article,[role=article]) :is(p,blockquote){max-inline-size:min(100%,70ch)!important}',
  'reface-accessibility:v1:selection-cues':
    ':is([aria-selected=true],[aria-pressed=true],[aria-checked=true],[aria-current]:not([aria-current=false],[aria-current=""]),input:checked):not(:focus-visible){outline:2px solid currentColor!important;outline-offset:2px!important}',
  'reface-accessibility:v1:form-errors':
    ':is(input,select,textarea,[role=textbox])[aria-invalid]:not([aria-invalid=false],[aria-invalid=""]){border:2px dashed currentColor!important}',
  [ACCESSIBILITY_CONTRAST]:
    'html,body,:is(article,main,p,li,blockquote,figcaption,button,select,textarea,input:not([type=hidden],[type=color])){background-color:Canvas!important;color:CanvasText!important}a[href]{color:LinkText!important}',
  'reface-accessibility:v1:control-spacing':
    ':is(fieldset,[role=group]) > :is(button,select,textarea,input:not([type=hidden])) + :is(button,select,textarea,input:not([type=hidden])){margin-inline-start:0.5rem!important}',
  'reface-accessibility:v1:field-outlines':
    ':is(' +
    fields +
    '):not([aria-invalid]:not([aria-invalid=false],[aria-invalid=""])){border:2px solid currentColor!important}',
  'reface-accessibility:v1:reduced-motion':
    '[aria-hidden=true], [aria-hidden=true] *{animation-duration:1ms!important;animation-iteration-count:1!important;transition-duration:1ms!important}',
  'reface-accessibility:v1:instant-scroll': '*{scroll-behavior:auto!important}',
};

export const ACCESSIBILITY_KEYS = [
  ACCESSIBILITY_MASTER,
  ACCESSIBILITY_PALETTE,
  ...Object.keys(ACCESSIBILITY_RULES),
];

export function compileAccessibility(settings: Readonly<Record<string, unknown>>): string {
  if (settings[ACCESSIBILITY_MASTER] === false) return '';
  return Object.entries(ACCESSIBILITY_RULES)
    .filter(([key]) => settings[key] === true)
    .map(([key, css]) => {
      if (key !== ACCESSIBILITY_CONTRAST) return css;
      const scheme = settings[ACCESSIBILITY_PALETTE] === 'dark' ? 'dark' : 'light';
      return 'html{color-scheme:only ' + scheme + '!important}' + css;
    })
    .join('\n');
}
