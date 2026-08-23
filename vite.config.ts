import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  // Relative asset paths keep the build portable across GitHub Pages
  // subpaths, Vercel, Netlify and plain local static servers.
  base: './',
  plugins: [react(), tailwindcss()],
});
