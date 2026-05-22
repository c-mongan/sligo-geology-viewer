import { defineConfig } from 'vite';
import { resolve } from 'path';
import { existsSync, statSync, createReadStream } from 'fs';

export default defineConfig({
  root: 'src/viewer',
  base: '/viewer/',
  build: {
    outDir: resolve(__dirname, 'output/viewer'),
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 600, // Three.js vendor chunk is ~574KB — unavoidable
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'vendor-three';
        },
      },
    },
  },
  server: {
    port: 9090,
  },
  plugins: [{
    name: 'serve-data-files',
    configureServer(server) {
      // In dev mode, serve /json/ and /ontology/ from output/
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0];
        if (!url) return next();

        let filePath = null;
        if (url.startsWith('/json/')) {
          filePath = resolve(__dirname, 'output', url.slice(1));
        } else if (url.startsWith('/viewer/json/')) {
          filePath = resolve(__dirname, 'output', url.replace(/^\/viewer\//, ''));
        } else if (url.startsWith('/ontology/')) {
          filePath = resolve(__dirname, 'output', url.slice(1));
        } else if (url.startsWith('/viewer/ontology/')) {
          filePath = resolve(__dirname, 'output', url.replace(/^\/viewer\//, ''));
        }

        if (filePath && existsSync(filePath) && statSync(filePath).isFile()) {
          const ext = filePath.split('.').pop();
          const mimeMap = { json: 'application/json', geojson: 'application/json', html: 'text/html' };
          res.setHeader('Content-Type', mimeMap[ext] || 'application/octet-stream');
          res.setHeader('Access-Control-Allow-Origin', '*');
          createReadStream(filePath).pipe(res);
        } else if (filePath) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.end('Not found');
        } else {
          next();
        }
      });
    }
  }],
});
