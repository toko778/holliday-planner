export interface DatabaseStatement {
  bind(...values: unknown[]): DatabaseStatement
  first<T = Record<string, unknown>>(): Promise<T | null>
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>
  run(): Promise<{ meta: { changes: number } }>
}
export interface Database { prepare(sql: string): DatabaseStatement }
export type Environment = { DB: Database; GROQ_API_KEY?: string; GROQ_MODEL?: string; SUPABASE_URL?: string; SUPABASE_PUBLISHABLE_KEY?: string }
export type Fetcher = typeof fetch
export class ApiError extends Error {
  constructor(public status: number, message: string, public fields?: Record<string, string>) { super(message) }
}
