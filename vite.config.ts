import { defineConfig } from 'vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';

export default defineConfig({
  plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
  server: {
    port: 5173,
    // La API y las imagenes se sirven desde el mismo origen en desarrollo: sin
    // esto, cada peticion tendria que arrastrar CORS y la URL absoluta del
    // backend. `/media` es imprescindible aqui — las fotos del inventario
    // viven en `uploads/` del servidor, no en un CDN externo.
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET ?? 'http://localhost:3000',
        changeOrigin: true,
      },
      '/media': {
        target: process.env.VITE_API_TARGET ?? 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
