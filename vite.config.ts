import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// `vite build --mode artifact` -> one self-contained index.html (claude.ai artifact)
// `vite build`                 -> normal static build for Vercel (dist/ + api/ functions)
export default defineConfig(({ mode }) => ({
  base: mode === 'artifact' ? './' : '/app/',
  plugins: [react(), ...(mode === 'artifact' ? [viteSingleFile()] : [])],
  define: { __TARGET__: JSON.stringify(mode === 'artifact' ? 'artifact' : 'web') },
  build: {
    outDir: mode === 'artifact' ? 'dist-artifact' : 'dist',
    chunkSizeWarningLimit: 4000,
    assetsInlineLimit: mode === 'artifact' ? 100_000_000 : 4096,
  },
}))
