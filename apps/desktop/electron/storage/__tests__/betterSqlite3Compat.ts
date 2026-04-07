import { DatabaseSync } from "node:sqlite";
import type { SQLInputValue } from "node:sqlite";

type SqlRecord = Record<string, SQLInputValue>;
type SqlParams = SQLInputValue[] | [SqlRecord];

function normalizeParams(params: unknown[]): SqlParams {
  if (params.length === 1 && typeof params[0] === "object" && params[0] !== null && !Array.isArray(params[0])) {
    return [params[0] as SqlRecord];
  }

  return params as SQLInputValue[];
}

class StatementCompat {
  constructor(private readonly statement: ReturnType<DatabaseSync["prepare"]>) {}

  run(...params: unknown[]) {
    return (this.statement.run as (...args: SqlParams) => unknown)(...normalizeParams(params));
  }

  get(...params: unknown[]) {
    return (this.statement.get as (...args: SqlParams) => unknown)(...normalizeParams(params));
  }

  all(...params: unknown[]) {
    return (this.statement.all as (...args: SqlParams) => unknown)(...normalizeParams(params));
  }
}

export default class BetterSqlite3Compat {
  private readonly db: DatabaseSync;

  constructor(filename: string) {
    this.db = new DatabaseSync(filename);
  }

  exec(sql: string): this {
    this.db.exec(sql);
    return this;
  }

  prepare(sql: string): StatementCompat {
    return new StatementCompat(this.db.prepare(sql));
  }

  transaction<TArgs extends unknown[]>(fn: (...args: TArgs) => void): (...args: TArgs) => void {
    return (...args: TArgs) => {
      this.db.exec("BEGIN");
      try {
        fn(...args);
        this.db.exec("COMMIT");
      } catch (error) {
        this.db.exec("ROLLBACK");
        throw error;
      }
    };
  }

  close(): void {
    this.db.close();
  }
}
