
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Cloudflare Pages 部署建议使用绝对路径 '/'
  base: '/', 
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  }
})
