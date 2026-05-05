import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      // Alias @ to the src directory
      '@': path.resolve(__dirname, './src'),
    },
  },

  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],

  // API Proxy for development
  // /api             → local backend (project data, auth, etc.)
  // /uploads         → Hostinger file server (SFTP-uploaded student photos)
  // /backend-uploads → local backend (fallback when SFTP disabled, stored at http://localhost:5000/uploads/)
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        rewrite: (path) => path,
      },
      '/backend-uploads': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/backend-uploads/, '/uploads'),
      },
      '/uploads': {
        target: 'http://72.62.241.170',
        changeOrigin: true,
      },
      '/student-photos': {
        target: 'http://72.62.241.170',
        changeOrigin: true,
      },
    },
  },
})
