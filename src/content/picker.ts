// Element picker (PRD M6) : survol = surbrillance, clic = sélection, Échap = annuler,
// ↑ / ↓ = remonter au parent / redescendre. L'overlay vit dans un shadow root isolé du site.
import {
  MAX_PICKED_ELEMENTS,
  PICKER_PORT,
  type PickerCommand,
  type PickerEvent,
} from '../shared/picker';
import type { PickResult } from '../shared/types';
import { textSample } from './distill';
import { buildSelectors, fingerprint } from './selectors';

let stopActive: (() => void) | null = null;

function label(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const id = element.id ? `#${element.id}` : '';
  const text = textSample(element, 30);
  return `${tag}${id}${text ? ` · ${text}` : ''}`;
}

function createOverlay(selectionNumber?: number) {
  const host = document.createElement('div');
  host.setAttribute(selectionNumber === undefined ? 'data-bp-picker' : 'data-bp-selection', '');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483647';
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `<style>
    .box{position:fixed;box-sizing:border-box;border:1.5px solid #aa4d31;background:rgba(170,77,49,.06);border-radius:1px;transition:left .08s,top .08s,width .08s,height .08s;pointer-events:none}
    .box::before,.box::after{content:'';position:absolute;width:4px;height:4px;border:1px solid #aa4d31;background:#f3f0e7}
    .box::before{top:-3px;left:-3px}.box::after{bottom:-3px;right:-3px}
    .tag{position:fixed;font:12px/1.5 ui-monospace,monospace;background:#282b27;color:#faf8f0;border-left:3px solid #c17a57;padding:4px 8px;border-radius:1px;white-space:nowrap;max-width:min(360px,calc(100vw - 16px));overflow:hidden;text-overflow:ellipsis;pointer-events:none}
    .selected.box{border:2px solid #bbdcd9;background:rgba(187,220,217,.15);box-shadow:0 0 0 1px #26282d;transition:none}
    .selected.box::before,.selected.box::after{border-color:#26282d;background:#bbdcd9}
    .selected.tag{border-left:2px solid #bbdcd9;background:#26282d;color:#f3f6fa}
    @media(prefers-reduced-motion:reduce){.box{transition:none}}
  </style><div class="box"></div><div class="tag"></div>`;
  const box = root.querySelector('.box') as HTMLElement;
  const tag = root.querySelector('.tag') as HTMLElement;
  if (selectionNumber !== undefined) {
    box.classList.add('selected');
    tag.classList.add('selected');
    tag.textContent = String(selectionNumber);
  }
  document.documentElement.appendChild(host);
  return {
    host,
    show(element: Element) {
      const r = element.getBoundingClientRect();
      host.hidden = !element.isConnected || !r.width || !r.height;
      host.style.display = host.hidden ? 'none' : '';
      if (host.hidden) return;
      Object.assign(box.style, {
        left: `${r.left}px`,
        top: `${r.top}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
      });
      // textContent : jamais de HTML issu de la page.
      if (selectionNumber === undefined) tag.textContent = label(element);
      const top = r.top > 30 ? r.top - 28 : Math.min(r.bottom + 4, window.innerHeight - 28);
      const left = Math.max(4, Math.min(r.left, window.innerWidth - tag.offsetWidth - 4));
      Object.assign(tag.style, { left: `${left}px`, top: `${Math.max(top, 4)}px` });
    },
  };
}

function startPicker(
  onPick: (result: PickResult) => boolean,
  onStop: () => void,
  enterFinishes = false,
) {
  stopActive?.();
  const overlay = createOverlay();
  let current: Element | null = null;
  let keyboardTarget = false;
  const trail: Element[] = []; // pour redescendre après ↑

  const isOurs = (node: EventTarget | null) => node instanceof Node && overlay.host.contains(node);
  const setCurrent = (element: Element | null) => {
    if (!element || element === document.documentElement || isOurs(element)) return;
    current = element;
    overlay.show(element);
  };

  // On ne suit que les changements réels de l'élément sous la souris : un mousemove
  // sur le même élément (ex. juste avant le clic) ne doit pas annuler une remontée ↑.
  let hovered: Element | null = null;
  const onMove = (event: MouseEvent) => {
    const target = event.target as Element | null;
    if (target && target !== hovered && !isOurs(target)) {
      hovered = target;
      keyboardTarget = false;
      trail.length = 0;
      setCurrent(target);
    }
  };
  const swallow = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  };
  const onClick = (event: MouseEvent) => {
    swallow(event);
    choose(current ?? (event.target as Element | null));
  };
  const choose = (element: Element | null) => {
    if (!element || element === document.documentElement) return;
    const selectors = buildSelectors(element);
    if (!selectors.length) return;
    const result = {
      selector: selectors[0]!,
      selectors,
      label: label(element),
      fingerprint: fingerprint(element),
    };
    keyboardTarget = false;
    if (!onPick(result)) finish();
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      swallow(event);
      finish();
    } else if (event.key === 'Enter') {
      swallow(event);
      if (!enterFinishes || keyboardTarget) choose(current);
      if (enterFinishes && stopActive === finish) finish();
    } else if (event.key === ' ' && current && enterFinishes) {
      swallow(event);
      if (!event.repeat) choose(current);
    } else if (
      event.key === 'ArrowUp' &&
      current?.parentElement &&
      current.parentElement !== document.documentElement
    ) {
      swallow(event);
      keyboardTarget = true;
      trail.push(current);
      setCurrent(current.parentElement);
    } else if (event.key === 'ArrowDown' && trail.length) {
      swallow(event);
      keyboardTarget = true;
      setCurrent(trail.pop()!);
    }
  };
  const onScroll = () => current && overlay.show(current);

  const blocked = [
    'mousedown',
    'mouseup',
    'pointerdown',
    'pointerup',
    'dblclick',
    'contextmenu',
  ] as const;
  function finish() {
    document.removeEventListener('mousemove', onMove, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('scroll', onScroll, true);
    window.removeEventListener('resize', onScroll);
    blocked.forEach((type) => document.removeEventListener(type, swallow, true));
    overlay.host.remove();
    stopActive = null;
    onStop();
  }

  document.addEventListener('mousemove', onMove, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('scroll', onScroll, true);
  window.addEventListener('resize', onScroll);
  blocked.forEach((type) => document.addEventListener(type, swallow, true));
  stopActive = finish;
  return finish;
}

export function pick(): Promise<PickResult | null> {
  return new Promise((resolve) => {
    startPicker(
      (result) => {
        resolve(result);
        return false;
      },
      () => resolve(null),
    );
  });
}

export function cancelPick(): void {
  stopActive?.();
}

// Le port rattache les repères à la durée de vie du panneau.
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== PICKER_PORT) return;
  let frame = 0;
  let stopPicking: (() => void) | null = null;
  let connected = true;
  let selected = new Set<string>();
  let marks: { element: Element; overlay: ReturnType<typeof createOverlay> }[] = [];

  function clear() {
    cancelAnimationFrame(frame);
    marks.forEach(({ overlay }) => overlay.host.remove());
    marks = [];
  }

  function draw() {
    marks.forEach(({ element, overlay }) => overlay.show(element));
    frame = requestAnimationFrame(draw);
  }

  port.onMessage.addListener((message: PickerCommand) => {
    if (message.type === 'start') {
      if (stopPicking || selected.size >= MAX_PICKED_ELEMENTS) return;
      stopPicking = startPicker(
        (result) => {
          if (selected.has(result.selector)) return true;
          selected.add(result.selector);
          port.postMessage({ type: 'picked', result } satisfies PickerEvent);
          return selected.size < MAX_PICKED_ELEMENTS;
        },
        () => {
          stopPicking = null;
          if (connected) port.postMessage({ type: 'stopped' } satisfies PickerEvent);
        },
        true,
      );
      return;
    }
    if (message.type === 'stop') {
      stopPicking?.();
      return;
    }
    if (message.type !== 'highlight') return;
    clear();
    const selectors = message.selectors.slice(0, MAX_PICKED_ELEMENTS);
    // An outline update may follow a second click in the same picking session.
    selected = stopPicking ? new Set([...selected, ...selectors]) : new Set(selectors);
    marks = selectors.flatMap((selector, index) => {
      try {
        const element = document.querySelector(selector);
        return element ? [{ element, overlay: createOverlay(index + 1) }] : [];
      } catch {
        return [];
      }
    });
    if (marks.length) draw();
  });
  port.onDisconnect.addListener(() => {
    connected = false;
    clear();
    stopPicking?.();
  });
});
