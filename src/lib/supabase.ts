import { createClient } from '@supabase/supabase-js'

const projectUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

export const supabase = !import.meta.env.SSR && projectUrl && publishableKey?.startsWith('sb_publishable_')
  ? createClient(projectUrl, publishableKey, { auth: { flowType: 'pkce' } })
  : null
