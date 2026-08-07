import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The built site is served from https://<user>.github.io/Playback/, so every
// asset path has to be prefixed with the repository name. In development it is
// served from the root instead, hence the split.
const REPO = '/Playback/'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? REPO : '/',
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
}))
