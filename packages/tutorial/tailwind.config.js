/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#243f5f',
        gradient: {
          start: '#667eea',
          end: '#764ba2',
        },
      },
    },
  },
  plugins: [],
};
