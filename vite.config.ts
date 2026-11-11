import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { localApi } from './scripts/dev-api.ts'

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), localApi(loadEnv(mode, process.cwd(), ''))],
  build: { rolldownOptions: { output: { codeSplitting: { groups: [{ name: 'account-service', test: /[\\/]node_modules[\\/]@supabase[\\/]/ }] } } } },
}))
