import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { execSync } from 'child_process'

function gitInfo() {
  try {
    const hash  = execSync('git rev-parse --short HEAD', { cwd: '../' }).toString().trim()
    const count = execSync('git rev-list --count HEAD', { cwd: '../' }).toString().trim()
    const date  = new Date().toISOString().slice(0, 10)
    return { hash, count, date }
  } catch {
    return { hash: 'unknown', count: '0', date: new Date().toISOString().slice(0, 10) }
  }
}

const { hash, count, date } = gitInfo()

// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react()],
  cacheDir: '.vite-cache',
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  define: {
    __GIT_HASH__:  JSON.stringify(hash),
    __GIT_COUNT__: JSON.stringify(count),
    __BUILD_DATE__: JSON.stringify(date),
  },
})
