/**
 * Minimal database contract shared by the two drivers:
 *  - PGlite (embedded Postgres) for local mode and tests
 *  - postgres.js for a Supabase Postgres database
 *
 * Queries are plain SQL with $1-style parameters. Always cast parameters in SQL
 * (`$1::uuid`, `$2::timestamptz`) and counts to int (`count(*)::int`) so both
 * drivers return identical shapes. Pass JSON and arrays as strings cast through
 * text (`$1::text::jsonb`, `$2::text::uuid[]`): postgres.js re-encodes values
 * bound directly to json/array parameter types.
 */
export type Row = Record<string, unknown>;

export interface Tx {
  query<T = Row>(text: string, params?: readonly unknown[]): Promise<T[]>;
  /** Runs one or more statements without parameters (migrations, SET ROLE). */
  exec(text: string): Promise<void>;
}

export interface Driver {
  /** Runs `fn` inside a single transaction, rolling back if it throws. */
  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/** Postgres roles that mirror Supabase's API roles. */
export type DbRole = "anon" | "authenticated" | "service_role";
