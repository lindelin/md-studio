import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from "vite-plugin-svgr";
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';

const browserDependency = (path: string) => fileURLToPath(new URL(`./node_modules/${path}`, import.meta.url));
const sourceFile = (path: string) => fileURLToPath(new URL(`./src/${path}`, import.meta.url));

let base = process.env.PUBLIC_URL ?? '/';
if(!base.endsWith("/")) base += '/';

console.log(`Building for base = ${base}`);

// https://vitejs.dev/config/
export default () => {
  return defineConfig({
    base,
    resolve: {
      alias: {
        events: browserDependency('events/events.js'),
        process: browserDependency('process/browser.js'),
        stream: browserDependency('stream-browserify/index.js'),
        util: sourceFile('shims/node-util.ts'),
      },
    },
    plugins: [
      svgr(),
      react(),
      VitePWA({
        // Keep an already-open recording workspace on the version it loaded.
        // A waiting worker activates after the last old client closes, so an
        // update cannot remove lazy chunks while a device task is still live.
        registerType: 'prompt',
        injectRegister: 'script-defer',
        manifestFilename: 'manifest.json',
        manifest: {
          "short_name": "MD Workspace",
          "name": "MiniDisc Workspace",
          "description": "Organize, record, play, and automate NetMD and HiMD MiniDisc devices",
          "icons": [
            {
              "src": "MiniDisc192.png",
              "type": "image/png",
              "sizes": "192x192"
            },
            {
              "src": "MiniDisc512.png",
              "type": "image/png",
              "sizes": "512x512"
            },
            {
              "src": "favicon.ico",
              "sizes": "64x64 32x32 24x24 16x16",
              "type": "image/x-icon"
            }
          ],
          "start_url": ".",
          "display": "standalone",
          "theme_color": "#000000",
          "orientation": "any",
          "background_color": "#ffffff"
        },
        workbox: {
          cleanupOutdatedCaches: true,
          clientsClaim: false,
          skipWaiting: false,
          maximumFileSizeToCacheInBytes: 1024 * 1024 * 10, // 10 MiB
          runtimeCaching: [
            {
              urlPattern: ({ request }) => request.destination === 'document',
              handler: 'NetworkFirst',
              options: {
                cacheName: 'pages',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 30, // 30 Days
                },
              },
            },
            {
              urlPattern: ({ request }) => request.destination === 'image',
              handler: 'CacheFirst',
              options: {
                cacheName: 'images',
                expiration: {
                  maxEntries: 50,
                  maxAgeSeconds: 60 * 60 * 24 * 30, // 30 Days
                },
              },
            },
          ],
        },
      }),
    ],
    build: {
      commonjsOptions: { transformMixedEsModules: true },
    },
  })
}
