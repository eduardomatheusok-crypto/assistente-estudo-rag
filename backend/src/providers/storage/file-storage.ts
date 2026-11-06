import { createReadStream } from 'node:fs';
import { access, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, normalize, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';

/** Armazenamento dos arquivos originais. Trocável (ex.: S3) sem mexer nos serviços. */
export interface FileStorage {
  /** Grava o arquivo se ainda não existir. Retorna true se gravou agora. */
  save(key: string, bytes: Uint8Array): Promise<boolean>;
  read(key: string): Promise<Uint8Array>;
  stream(key: string): Readable;
  remove(key: string): Promise<void>;
}

export class LocalFileStorage implements FileStorage {
  private readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  async save(key: string, bytes: Uint8Array): Promise<boolean> {
    const path = this.resolve(key);
    if (await exists(path)) return false;
    await mkdir(dirname(path), { recursive: true });
    // Grava num temporário e renomeia: nunca deixa um arquivo pela metade.
    const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, bytes);
    await rename(tmp, path);
    return true;
  }

  async read(key: string): Promise<Uint8Array> {
    return readFile(this.resolve(key));
  }

  stream(key: string): Readable {
    return createReadStream(this.resolve(key));
  }

  async remove(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }

  /** Impede chaves que escapem da pasta raiz (ex.: "../"). */
  private resolve(key: string): string {
    const path = normalize(join(this.root, key));
    if (!path.startsWith(this.root + sep)) {
      throw new Error(`Chave de armazenamento inválida: ${key}`);
    }
    return path;
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
