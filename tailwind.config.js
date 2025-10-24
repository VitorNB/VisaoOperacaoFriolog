/** @type {import('tailwindcss').Config} */
export default {
  content: [
    // CRUCIAL: Deve incluir a pasta src e o tipo de arquivos
    "./index.html", 
    "./src/**/*.{js,ts,jsx,tsx}", 
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}