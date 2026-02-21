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