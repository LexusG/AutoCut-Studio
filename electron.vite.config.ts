import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import type { PluginOption } from 'vite'

/**
 * Narrow the renderer's Content-Security-Policy for production builds.
 *
 * `ws:` and `http:` in `connect-src` exist only so the Vite dev server and its HMR
 * socket can reach the renderer. A packaged build loads from disk and needs neither, so
 * shipping them would widen the renderer's network reach for no benefit. This is
 * defence in depth rather than a fix for a reachable hole: the renderer is sandboxed
 * with no Node integration, and `script-src` is already restricted.
 */
function productionCsp(): PluginOption {
  return {
    name: 'autocut-production-csp',
    apply: 'build',
    transformIndexHtml(html: string): string {
      return html.replace(/connect-src ([^"]*)/, (match, sources: string) =>
        `connect-src ${sources.replace(/\s*\bws:\s*/g, ' ').replace(/\s*\bhttp:\s*/g, ' ').trim()}`
      )
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared')
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react(), tailwindcss(), productionCsp()]
  }
})
