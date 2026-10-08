import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:3000', '/auth': 'http://localhost:3000', '/healthz': 'http://localhost:3000' },
  },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
  plugins: [
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'sw',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: false,
      injectManifest: { globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'] },
      devOptions: { enabled: true, type: 'module' },
      manifest: {
        id: '/',
        name: 'Pixel Farm',
        short_name: 'Pixel Farm',
        description: 'Family pixel farm',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#73eff7',
        theme_color: '#38b764',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
});
