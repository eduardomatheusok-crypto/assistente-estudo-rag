/**
 * Gera um PDF mínimo e válido para testes, com linhas de texto em Helvetica
 * (WinAnsiEncoding, que cobre os acentos do português) em posições conhecidas.
 */
export type TestLine = { text: string; x: number; y: number; size?: number };

export function buildTestPdf(pages: TestLine[][], pageSize = { width: 612, height: 792 }): Uint8Array {
  const objects: string[] = [];
  const pageIds: number[] = [];
  // 1: catálogo, 2: árvore de páginas, 3: fonte; páginas e conteúdos a partir de 4.
  let nextId = 4;
  const pageObjects: Array<{ id: number; body: string }> = [];

  for (const lines of pages) {
    const pageId = nextId++;
    const contentId = nextId++;
    pageIds.push(pageId);
    const stream = lines
      .map((l) => `BT /F1 ${l.size ?? 12} Tf ${l.x} ${l.y} Td (${escapePdfString(l.text)}) Tj ET`)
      .join('\n');
    pageObjects.push({
      id: pageId,
      body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageSize.width} ${pageSize.height}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`,
    });
    pageObjects.push({
      id: contentId,
      body: `<< /Length ${Buffer.byteLength(stream, 'latin1')} >>\nstream\n${stream}\nendstream`,
    });
  }

  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageIds.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  for (const { id, body } of pageObjects) objects[id] = body;

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = Buffer.byteLength(pdf, 'latin1');
    pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) {
    pdf += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(pdf, 'latin1'));
}

function escapePdfString(text: string): string {
  return text.replace(/[\\()]/g, (c) => `\\${c}`);
}
