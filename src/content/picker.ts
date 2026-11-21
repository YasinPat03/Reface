// Element picker (PRD M6) : survol = surbrillance, clic = sélection, Échap = annuler,
// ↑ / ↓ = remonter au parent / redescendre. L'overlay vit dans un shadow root isolé du site.
import type { PickResult } from '../shared/types';
import { textSample } from './distill';
import { buildSelectors, fingerprint } from './selectors';

let active: { cancel: () => void } | null = null;

function label(element: Element): string {
  const tag = element.tagName.toLowerCase();
  const id = element.id ? `#${element.id}` : '';
  const text = textSample(element, 30);
  return `${tag}${id}${text ? ` · ${text}` : ''}`;
}

function createOverlay() {
  const host = document.createElement('div');
  host.setAttribute('data-bp-picker', '');
  host.style.cssText = 'all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483647';
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `<style>
    .box{position:fixed;border:2px solid #7c3aed;background:rgba(124,58,237,.12);border-radius:3px;transition:all .06s;pointer-events:none}
    .tag{position:fixed;font:12px/1.4 ui-sans-serif,system-ui,sans-serif;background:#7c3aed;color:#fff;padding:2px 6px;border-radius:4px;white-space:nowrap;max-width:60vw;overflow:hidden;text-overflow:ellipsis;pointer-events:none}
  </style><div class="box"></div><div class="tag"></div>`;
  const box = root.querySelector('.box') as HTMLElement;
  const tag = root.querySelector('.tag') as HTMLElement;
  document.documentElement.appendChild(host);
  return {
    host,
    show(element: Element) {
      const r = element.getBoundingClientRect();
      Object.assign(box.style, {
        left: `${r.left}px`,
        top: `${r.top}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
      });
      // textContent : jamais de HTML issu de la page.
      tag.textContent = label(element);
      const top = r.top > 24 ? r.top - 22 : Math.min(r.bottom + 4, window.innerHeight - 22);
      Object.assign(tag.style, { left: `${Math.max(r.left, 4)}px`, top: `${top}px` });
    },
  };
}

/** Lance le picker ; se résout à la sélection, ou null si annulé. */
export function pick(): Promise<PickResult | null> {
  active?.cancel();
  return new Promise((resolve) => {
    const overlay = createOverlay();
    let current: Element | null = null;
    const trail: Element[] = []; // pour redescendre après ↑

    const isOurs = (node: EventTarget | null) =>
      node instanceof Node && overlay.host.contains(node);
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
      if (!element) return finish(null);
      const selectors = buildSelectors(element);
      finish(
        selectors.length
          ? {
              selector: selectors[0]!,
              selectors,
              label: label(element),
              fingerprint: fingerprint(element),
            }
          : null,
      );
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        swallow(event);
        finish(null);
      } else if (event.key === 'Enter' && current) {
        swallow(event);
        choose(current);
      } else if (
        event.key === 'ArrowUp' &&
        current?.parentElement &&
        current.parentElement !== document.documentElement
      ) {
        swallow(event);
        trail.push(current);
        setCurrent(current.parentElement);
      } else if (event.key === 'ArrowDown' && trail.length) {
        swallow(event);
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
    function finish(result: PickResult | null) {
      document.removeEventListener('mousemove', onMove, true);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('scroll', onScroll, true);
      blocked.forEach((type) => document.removeEventListener(type, swallow, true));
      overlay.host.remove();
      active = null;
      resolve(result);
    }

    document.addEventListener('mousemove', onMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('scroll', onScroll, true);
    blocked.forEach((type) => document.addEventListener(type, swallow, true));
    active = { cancel: () => finish(null) };
  });
}

export function cancelPick(): void {
  active?.cancel();
}
