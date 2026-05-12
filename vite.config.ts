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
  // /api             → local backend (project data, auth, templates, etc.)
  // /uploads         → local backend (template previews & assets stored on disk locally)
  // /images          → Hostinger (legacy template thumbnails were saved under /images/ on VPS)
  //                    New previews use /uploads/templates/ instead; old ones still live on Hostinger.
  // /backend-uploads → local backend (alias kept for backward compat)
  // /student-photos  → local backend (student photo directory served by Express)
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        rewrite: (path) => path,
      },
      '/uploads': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
      '/images': {
        target: 'http://72.62.241.170',
        changeOrigin: true,
      },
      '/backend-uploads': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/backend-uploads/, '/uploads'),
      },
      '/student-photos': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
})
