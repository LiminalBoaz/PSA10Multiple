import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves the site from /<repo>/. CI sets BASE_PATH; locally it is "/".
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  base,
  oxc: { jsx: { runtime: 'automatic', importSource: 'preact' } },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'Slab Scout',
        short_name: 'Slab Scout',
        description: 'Which cards at this booth are worth grading? Cardmarket NM English prices vs PSA 8/9/10.',
        theme_color: '#14161a',
        background_color: '#f6f7f9',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the data and every thumbnail so the app works with no signal on the show floor.
        globPatterns: ['**/*.{js,css,html,json,webp,png,svg}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
    }),
  ],
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
