import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  // `process.env` no ve el .env del proyecto: Vite lo carga para el cliente,
  // no para el proceso que evalua esta config. Sin `loadEnv`, VITE_API_TARGET
  // se ignoraba en silencio y el proxy siempre iba a localhost:3000.
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_API_TARGET || 'http://localhost:3000';
  const proxy = { target, changeOrigin: true };

  return {
    plugins: [react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      port: 5173,
      // La API y las imagenes se sirven desde el mismo origen en desarrollo: sin
      // esto, cada peticion tendria que arrastrar CORS y la URL absoluta del
      // backend. `/media` es imprescindible aqui — las fotos del inventario
      // viven en `uploads/` del servidor, no en un CDN externo.
      proxy: { '/api': proxy, '/media': proxy },
    },
  };
});
