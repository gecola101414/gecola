import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    // DISABILITA LE MAPPE (Nasconde il codice originale)
    sourcemap: false,

    // MINIFICAZIONE AGGRESSIVA
    minify: 'esbuild',
    
    esbuild: {
      // Rimuove console.log e debugger
      drop: ['console', 'debugger'],
      legalComments: 'none',
      treeShaking: true,
      target: 'es2015'
    },

    // NOMI FILE CASUALI (Hash)
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[hash].js',
        chunkFileNames: 'assets/[hash].js',
        assetFileNames: 'assets/[hash].[ext]',
        compact: true,
      }
    },
    chunkSizeWarningLimit: 1000
  }
})