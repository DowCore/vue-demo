import { defineConfig } from '@vben/vite-config';

export default defineConfig(async () => {
  return {
    application: {},
    vite: {
      server: {
        hmr: {
          overlay: false,
        },
        proxy: {
          '/connect': {
            changeOrigin: true,
            secure: false,
            target: 'https://localhost:7600',
          },
          '/.well-known': {
            changeOrigin: true,
            secure: false,
            target: 'https://localhost:7600',
          },
          '/api': {
            changeOrigin: true,
            secure: false,
            target: 'https://localhost:7500',
            ws: true,
          },
        },
      },
    },
  };
});
