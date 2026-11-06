import type { Queryable } from '../db/pool.ts';

export type Notebook = {
  id: string;
  name: string;
  discipline: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const COLUMNS = `id, name, discipline, created_at AS "createdAt", updated_at AS "updatedAt"`;

export class NotebookRepository {
  private readonly db: Queryable;

  constructor(db: Queryable) {
    this.db = db;
  }

  async create(input: { name: string; discipline: string | null }): Promise<Notebook> {
    const { rows } = await this.db.query<Notebook>(
      `INSERT INTO notebooks (name, discipline) VALUES ($1, $2) RETURNING ${COLUMNS}`,
      [input.name, input.discipline],
    );
    return rows[0]!;
  }

  async list(): Promise<Notebook[]> {
    const { rows } = await this.db.query<Notebook>(
      `SELECT ${COLUMNS} FROM notebooks ORDER BY created_at DESC`,
    );
    return rows;
  }

  async findById(id: string): Promise<Notebook | null> {
    const { rows } = await this.db.query<Notebook>(
      `SELECT ${COLUMNS} FROM notebooks WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async update(
    id: string,
    input: { name?: string; discipline?: string | null },
  ): Promise<Notebook | null> {
    const { rows } = await this.db.query<Notebook>(
      `UPDATE notebooks
          SET name = COALESCE($2, name),
              discipline = CASE WHEN $3 THEN $4 ELSE discipline END,
              updated_at = now()
        WHERE id = $1
        RETURNING ${COLUMNS}`,
      [id, input.name ?? null, input.discipline !== undefined, input.discipline ?? null],
    );
    return rows[0] ?? null;
  }

  async delete(id: string): Promise<boolean> {
    const { rowCount } = await this.db.query('DELETE FROM notebooks WHERE id = $1', [id]);
    return (rowCount ?? 0) > 0;
  }
}
