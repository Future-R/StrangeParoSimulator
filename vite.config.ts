
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // 修改为相对路径 './'，这样无论你的仓库名叫什么，都能正确找到资源文件
  base: './', 
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  }
})
