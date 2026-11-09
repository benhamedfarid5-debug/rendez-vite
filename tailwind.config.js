/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef8f8', 100: '#d6eff0', 200: '#aedfe2', 300: '#7cc8cd',
          400: '#4aaaaF', 500: '#2f8f94', 600: '#257378', 700: '#215c62',
          800: '#1e4b50', 900: '#12384a',
        },
        sand: { 50: '#fbf9f5', 100: '#f4efe6', 200: '#e9e0d0' },
        ink: { 500: '#4b5b63', 700: '#25343b', 900: '#12212a' },
      },
      fontFamily: {
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Tahoma', 'Noto Sans Arabic', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(18,56,74,.06), 0 8px 24px -12px rgba(18,56,74,.18)',
      },
      borderRadius: { xl: '14px', '2xl': '20px' },
    },
  },
  plugins: [],
};
