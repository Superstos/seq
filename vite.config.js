import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [svelte()],
  build: {
    // The audio thread loads engine-processor.js by URL, so it must stay a real file.
    assetsInlineLimit: (filePath) => (filePath.endsWith('engine-processor.js') ? false : undefined),
  },
})
