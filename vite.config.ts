import basicSsl from '@vitejs/plugin-basic-ssl'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vite';

const config = defineConfig({
    plugins: [
        basicSsl(),
        VitePWA(),
    ],
    server: {
        allowedHosts: true,
    },
});

export default config;
