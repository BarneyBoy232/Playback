import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Spotify requires the numeric loopback address for redirect URIs now —
    // "localhost" is rejected. Keeping the dev server here means the redirect
    // URI registered in the Spotify dashboard works without any extra setup.
    host: '127.0.0.1',
    port: 5173,
  },
})
