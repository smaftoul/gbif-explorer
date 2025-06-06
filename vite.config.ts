import basicSsl from '@vitejs/plugin-basic-ssl'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vite';

const config = defineConfig({
    base: "/gbif-explorer/",
    plugins: [
        basicSsl(),
        VitePWA({
            includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'favicon.svg'],
            manifest: {
                name: 'GBIF Explorer',
                short_name: 'GBIF Explorer',
                description: 'Explore the nature around you',
                theme_color: '#ffffff',
                icons: [
                    {
                        src: 'favicon-192.png',
                        sizes: '192x192',
                        type: 'image/png'
                    },
                    {
                        src: 'favicon-512.png',
                        sizes: '512x512',
                        type: 'image/png'
                    }
                ]
            },
            manifestFilename: 'manifest.json',
        }),
    ],
    build: {
        sourcemap: true,
    },
    server: {
        allowedHosts: true,
    },
});

export default config;
