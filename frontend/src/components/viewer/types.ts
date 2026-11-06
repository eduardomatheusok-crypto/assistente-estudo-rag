import type { PageLocation } from '../../api/types.ts';

/** Algo a pintar no documento: um grifo ou a citação aberta. */
export type Overlay = {
  id: string;
  /** "r, g, b" */
  color: string;
  title: string;
  docCharStart: number;
  docCharEnd: number;
  /** Retângulos por página (PDF). Vazio em MD/TXT: usa os offsets. */
  locations: PageLocation[];
  /** A citação aberta fica mais forte e com borda. */
  focused?: boolean;
};

/** Para onde o visualizador deve ir (muda a cada clique, mesmo na mesma página). */
export type FocusTarget = { page: number; overlayId: string | null; nonce: number };
