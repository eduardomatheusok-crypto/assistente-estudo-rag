import type { FileStorage } from '../providers/storage/file-storage.ts';
import type { DocumentRepository } from '../repositories/document-repository.ts';
import type { Notebook, NotebookRepository } from '../repositories/notebook-repository.ts';
import { notFound } from './errors.ts';

export class NotebookService {
  private readonly notebooks: NotebookRepository;
  private readonly documents: DocumentRepository;
  private readonly storage: FileStorage;

  constructor(deps: {
    notebooks: NotebookRepository;
    documents: DocumentRepository;
    storage: FileStorage;
  }) {
    this.notebooks = deps.notebooks;
    this.documents = deps.documents;
    this.storage = deps.storage;
  }

  create(input: { name: string; discipline?: string | null }): Promise<Notebook> {
    return this.notebooks.create({ name: input.name, discipline: input.discipline ?? null });
  }

  list(): Promise<Notebook[]> {
    return this.notebooks.list();
  }

  async get(id: string): Promise<Notebook> {
    const notebook = await this.notebooks.findById(id);
    if (!notebook) throw notFound('Caderno');
    return notebook;
  }

  async update(id: string, input: { name?: string; discipline?: string | null }): Promise<Notebook> {
    const notebook = await this.notebooks.update(id, input);
    if (!notebook) throw notFound('Caderno');
    return notebook;
  }

  /** Apaga o caderno (documentos, páginas e chunks em cascata) e os arquivos órfãos. */
  async delete(id: string): Promise<void> {
    const paths = await this.documents.listStoragePathsByNotebook(id);
    if (!(await this.notebooks.delete(id))) throw notFound('Caderno');
    for (const path of paths) {
      if (!(await this.documents.isStoragePathReferenced(path))) {
        await this.storage.remove(path);
      }
    }
  }
}
