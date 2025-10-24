// CÓDIGO FINAL PARA O ARQUIVO: vite.config.js

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// Importa o pacote que o erro insiste em encontrar
import tailwindcssPostcss from '@tailwindcss/postcss';
import autoprefixer from 'autoprefixer';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // BLOCO CRÍTICO FINAL
  css: {
    postcss: {
      plugins: [
        // Usamos o objeto tailwindcssPostcss para satisfazer o erro.
        // O Autoprefixer continua normal.
        tailwindcssPostcss,
        autoprefixer,
      ],
    },
  },
});