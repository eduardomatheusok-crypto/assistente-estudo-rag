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
        target: 'http://localhost:3333',
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
