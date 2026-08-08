import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // The site is served from the root of its own domain, so no path prefix.
  base: '/',
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
})
