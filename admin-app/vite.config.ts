import path from "path"
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Built to ../admin-dist and served by Express under /admin.
export default defineConfig({
  base: '/admin/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  build: {
    outDir: '../admin-dist',
    emptyOutDir: true,
  },
  server: {
    // During `npm run dev`, proxy API + uploads to the Express server.
    proxy: {
      '/api': 'http://localhost:3030',
      '/uploads': 'http://localhost:3030',
    },
  },
})
