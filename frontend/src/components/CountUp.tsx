import { animate, useReducedMotion } from 'motion/react';
import { useEffect, useState } from 'react';

/** Número que conta de 0 até o valor (tela inicial do caderno). */
export function CountUp({ value, format = (n) => String(Math.round(n)) }: { value: number; format?: (n: number) => string }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(reduced ? value : 0);

  useEffect(() => {
    if (reduced) {
      setShown(value);
      return;
    }
    const controls = animate(0, value, { duration: 0.9, ease: [0.22, 1, 0.36, 1], onUpdate: setShown });
    return () => controls.stop();
  }, [value, reduced]);

  return <>{format(shown)}</>;
}
