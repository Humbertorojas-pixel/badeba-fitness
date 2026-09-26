import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      // En desarrollo, /api va al servidor Python. Si no está corriendo, se responde
      // "IA no disponible" (el juego sigue con reglas y diálogo local) en lugar de un 502.
      '/api': {
        target: 'http://127.0.0.1:8765',
        configure: (proxy) => {
          proxy.on('error', (_err, _req, res) => {
            if (res.headersSent) return;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ laya: 'unavailable', claude: 'unavailable', offline: true }));
          });
        },
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 2000,
  },
});
