/**
 * Minimal typings for the built-in `node:sqlite` module (unflagged since
 * Node 22.13 / 23.4). The repo pins @types/node 20, which predates it; only
 * what e2e/helpers/db.ts uses is declared. Delete this file once @types/node
 * is bumped to a version that ships `sqlite.d.ts`.
 */
declare module 'node:sqlite' {
  type SQLInputValue = null | number | bigint | string | Uint8Array;

  interface StatementResultingChanges {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  }

  class StatementSync {
    all(...params: SQLInputValue[]): unknown[];
    get(...params: SQLInputValue[]): unknown;
    run(...params: SQLInputValue[]): StatementResultingChanges;
  }

  class DatabaseSync {
    constructor(path: string, options?: { readOnly?: boolean; timeout?: number });
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
