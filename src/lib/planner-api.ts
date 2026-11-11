import type { SupabaseClient } from '@supabase/supabase-js'

export class PlannerError extends Error {
  constructor(message: string, public status = 0, public fields?: Record<string, string>) { super(message) }
}
export async function plannerRequest<T>(client: SupabaseClient | null, path: string, method = 'GET', data?: unknown): Promise<T> {
  const session = client ? await client.auth.getSession() : null
  const token = session?.data.session?.access_token
  if (!token) throw new PlannerError('გეგმის შესანახად და AI რჩევის მისაღებად შედი შენს ანგარიშში.', 401)
  let response: Response
  try {
    response = await fetch(path, { method, headers: { Authorization: `Bearer ${token}`, ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}) }, ...(data !== undefined ? { body: JSON.stringify(data) } : {}), signal: AbortSignal.timeout(85000) })
  } catch { throw new PlannerError('სერვერთან დაკავშირება ვერ დასრულდა. შენახული მონახაზები „ჩემს გეგმებში“ დაგხვდება. სცადე ხელახლა.') }
  let body: { error?: string; fields?: Record<string, string> }
  try { body = await response.json() } catch { throw new PlannerError('სერვერმა პასუხი ვერ დააბრუნა. სცადე მოგვიანებით.') }
  if (!response.ok) throw new PlannerError(body.error || 'მოთხოვნა ვერ დასრულდა.', response.status, body.fields)
  return body as T
}
