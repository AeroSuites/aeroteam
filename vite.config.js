import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

const buildLabel = new Date().toLocaleString('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Paris',
})

// Chemin de base : /aeroteam/ pour GitHub Pages (défaut),
// "/" pour un déploiement on-premise à la racine du domaine (VITE_BASE="/").
const basePath = process.env.VITE_BASE || '/aeroteam/'

// https://vite.dev/config/
export default defineConfig({
  base: basePath,
  define: {
    __APP_VERSION__: JSON.stringify(buildLabel),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'AeroTeam',
        short_name: 'AeroTeam',
        description: 'Application web de gestion des équipes de maintenance aéronautique',
        theme_color: '#051039',
        background_color: '#f5f5f5',
        display: 'standalone',
        start_url: basePath,
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        navigateFallback: `${basePath}index.html`,
        navigateFallbackDenylist: [
          new RegExp(`^${basePath}assets/.*`),
          new RegExp(`^${basePath}docs/.*`),
        ],
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        // Le bundle principal dépasse 2 Mo : on autorise jusqu'à 5 Mo
        // (sinon la génération du service worker échoue).
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
})