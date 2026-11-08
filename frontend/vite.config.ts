import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * Em desenvolvimento, o Vite repassa /api/* para o backend (porta 3333).
 * Assim o navegador fala com uma origem só e o backend não precisa de CORS.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        // 127.0.0.1 (e não "localhost"): em alguns sistemas "localhost" vira o IPv6 ::1,
        // e o backend escuta só no IPv4.
        target: 'http://127.0.0.1:3333',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
