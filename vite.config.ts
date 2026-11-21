import fs from 'node:fs'
import path from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

function getMimeType(filePath: string): string {
  if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) return 'application/javascript; charset=utf-8'
  if (filePath.endsWith('.wasm')) return 'application/wasm'
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8'
  if (filePath.endsWith('.gz')) return 'application/gzip'
  if (filePath.endsWith('.ttf')) return 'font/ttf'
  if (filePath.endsWith('.otf')) return 'font/otf'
  return 'application/octet-stream'
}

function resolveVendorAssetPath(urlPath: string): string | null {
  const cleanUrl = urlPath.split('?')[0]
  if (cleanUrl === '/pdf.worker.min.mjs') {
    return path.resolve('node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs')
  }

  const folderMappings: Array<[string, string]> = [
    ['/pdfjs-cmaps/', 'node_modules/pdfjs-dist/cmaps'],
    ['/pdfjs-fonts/', 'node_modules/pdfjs-dist/standard_fonts'],
    ['/pdfjs-iccs/', 'node_modules/pdfjs-dist/iccs'],
    ['/pdfjs-wasm/', 'node_modules/pdfjs-dist/wasm'],
  ]

  for (const [prefix, dir] of folderMappings) {
    if (cleanUrl.startsWith(prefix)) {
      const rel = path.posix.normalize(cleanUrl.slice(prefix.length)).replace(/^(\.\.(\/|\\|$))+/, '')
      return path.resolve(dir, rel)
    }
  }

  if (cleanUrl.startsWith('/tesseract/')) {
    const fileName = path.basename(cleanUrl.slice('/tesseract/'.length))
    if (fileName === 'worker.min.js') {
      return path.resolve('node_modules/tesseract.js/dist/worker.min.js')
    }
    if (fileName === 'ita.traineddata.gz') {
      return path.resolve('node_modules/@tesseract.js-data/ita/4.0.0/ita.traineddata.gz')
    }
    if (fileName.startsWith('tesseract-core')) {
      return path.resolve('node_modules/tesseract.js-core', fileName)
    }
  }

  return null
}

function vendorPdfOcrAssetsPlugin(): Plugin {
  return {
    name: 'vendor-pdf-ocr-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const reqUrl = req.url || ''
        const target = resolveVendorAssetPath(reqUrl)
        if (target && fs.existsSync(target) && fs.statSync(target).isFile()) {
          res.setHeader('Content-Type', getMimeType(target))
          res.setHeader('Cache-Control', 'public, max-age=86400')
          fs.createReadStream(target).pipe(res)
          return
        }
        next()
      })
    },
    closeBundle() {
      const distDir = path.resolve('dist')
      if (!fs.existsSync(distDir)) return

      const copySafe = (src: string, dest: string) => {
        if (!fs.existsSync(src)) return
        fs.mkdirSync(path.dirname(dest), { recursive: true })
        fs.copyFileSync(src, dest)
      }

      const copyDirSafe = (srcDir: string, destDir: string) => {
        if (!fs.existsSync(srcDir)) return
        fs.mkdirSync(destDir, { recursive: true })
        for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
          const s = path.join(srcDir, entry.name)
          const d = path.join(destDir, entry.name)
          if (entry.isDirectory()) copyDirSafe(s, d)
          else fs.copyFileSync(s, d)
        }
      }

      copySafe(
        path.resolve('node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs'),
        path.join(distDir, 'pdf.worker.min.mjs')
      )
      copyDirSafe(path.resolve('node_modules/pdfjs-dist/cmaps'), path.join(distDir, 'pdfjs-cmaps'))
      copyDirSafe(path.resolve('node_modules/pdfjs-dist/standard_fonts'), path.join(distDir, 'pdfjs-fonts'))
      copyDirSafe(path.resolve('node_modules/pdfjs-dist/iccs'), path.join(distDir, 'pdfjs-iccs'))
      copyDirSafe(path.resolve('node_modules/pdfjs-dist/wasm'), path.join(distDir, 'pdfjs-wasm'))

      const tessDest = path.join(distDir, 'tesseract')
      copySafe(path.resolve('node_modules/tesseract.js/dist/worker.min.js'), path.join(tessDest, 'worker.min.js'))
      copySafe(
        path.resolve('node_modules/@tesseract.js-data/ita/4.0.0/ita.traineddata.gz'),
        path.join(tessDest, 'ita.traineddata.gz')
      )
      const tessCoreDir = path.resolve('node_modules/tesseract.js-core')
      if (fs.existsSync(tessCoreDir)) {
        for (const f of fs.readdirSync(tessCoreDir)) {
          if (f.startsWith('tesseract-core-lstm.') || f.startsWith('tesseract-core-simd-lstm.') || f.startsWith('tesseract-core-relaxedsimd-lstm.')) {
            copySafe(path.join(tessCoreDir, f), path.join(tessDest, f))
          }
        }
      }
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  base: '/',
  plugins: [react(), vendorPdfOcrAssetsPlugin()],
  server: {
    port: 3000,
    host: '0.0.0.0',
    strictPort: true,
    allowedHosts: true,
    hmr: false,
    watch: {
      ignored: ['**/dist/**', '**/.gecola-shared/**'],
    },
  },
  build: {
    target: 'es2020',
    // DISABILITA LE MAPPE (Nasconde il codice originale)
    sourcemap: false,

    // MINIFICAZIONE AGGRESSIVA
    minify: 'esbuild',

    // NOMI FILE CASUALI (Hash) — NON separare react da react-dom/client (causa crash React 19 in produzione!)
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[hash].js',
        chunkFileNames: 'assets/[hash].js',
        assetFileNames: 'assets/[hash].[ext]',
        compact: true,
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('jspdf')) return 'pdf-engine';
          if (id.includes('/three/')) return 'three-engine';
          if (id.includes('pdfjs-dist')) return 'pdfjs-engine';
          if (id.includes('tesseract.js')) return 'ocr-engine';
          if (id.includes('firebase')) return 'firebase-vendor';
        },
      },
    },
    chunkSizeWarningLimit: 1600,
  },
})