const COLORS = ['#2f55d4', '#ffd60a', '#48bb78', '#00aaff', '#ff5c5c'];

/**
 * Pequena explosão de confete a partir de um ponto da tela (comemora acertos).
 * Usa a Web Animations API; quem pediu menos movimento não vê nada.
 */
export function confetti(x: number, y: number, pieces = 26): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  for (let i = 0; i < pieces; i++) {
    const el = document.createElement('i');
    el.className = 'confetti';
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.background = COLORS[i % COLORS.length]!;
    document.body.append(el);
    const dx = Math.random() * 260 - 130;
    const dy = -(Math.random() * 220 + 40);
    const rot = Math.random() * 720 - 360;
    el.animate(
      [
        { transform: 'translate(0, 0) rotate(0deg)', opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) rotate(${rot}deg)`, opacity: 0 },
      ],
      { duration: 900 + Math.random() * 300, easing: 'cubic-bezier(.22,1,.36,1)' },
    ).onfinish = () => el.remove();
  }
}

/** Confete saindo do centro de um elemento (ex.: o botão "Acertei"). */
export function confettiFrom(element: Element | null): void {
  if (!element) return;
  const r = element.getBoundingClientRect();
  confetti(r.left + r.width / 2, r.top);
}
