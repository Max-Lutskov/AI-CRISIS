import { defineConfig } from 'vite';

// Відносні шляхи: збірка працює і з кореня домену, і з підпапки GitHub Pages.
export default defineConfig({ base: './' });
