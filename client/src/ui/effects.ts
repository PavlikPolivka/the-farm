import { h, sprite } from './dom.js';

/** "+3" with an icon that floats up from where the player tapped. */
export function floater(at: { x: number; y: number }, text: string, icon?: string): void {
  const el = h('div', { class: 'floater', 'aria-hidden': 'true' }, icon ? sprite(icon, 1) : null, text);
  el.style.left = `${at.x}px`;
  el.style.top = `${at.y}px`;
  document.body.append(el);
  el.addEventListener('animationend', () => el.remove());
  setTimeout(() => el.remove(), 2000);
}

const toastBox = () => document.getElementById('toasts')!;

export function toast(text: string, icon?: string, ms = 2500): void {
  const el = h('div', { class: 'toast', role: 'status' }, icon ? sprite(icon, 2) : null, h('span', null, text));
  toastBox().append(el);
  while (toastBox().children.length > 3) toastBox().firstElementChild?.remove();
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 300);
  }, ms);
}
