/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: { DEFAULT: '1rem', sm: '1.5rem', lg: '2rem' }, screens: { '2xl': '1360px' } },
    extend: {
      colors: {
        ink: {
          950: '#08080A', 900: '#0E0E10', 800: '#1A1A1E', 700: '#2A2A30', 600: '#45454D',
          500: '#6B6B73', 400: '#9A9AA2', 300: '#C9C9CF', 200: '#E4E4E7', 100: '#EFEEEA', 50: '#F8F7F4',
        },
        gold: {
          100: '#F5EDDC', 200: '#EADBB9', 300: '#DDC593', 400: '#CFB078', 500: '#C2A063',
          600: '#A88449', 700: '#85672F', 800: '#5E4920',
        },
        success: { 50: '#EEF7F0', 600: '#1F7A3A', 700: '#17602D' },
        warning: { 50: '#FDF6E7', 600: '#A35F00', 700: '#7F4A00' },
        danger: { 50: '#FCEEEE', 600: '#B42318', 700: '#912018' },
      },
      fontFamily: {
        display: ['"Archivo Variable"', 'Archivo', 'system-ui', 'sans-serif'],
        sans: ['"Inter Variable"', 'Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        serif: ['"Instrument Serif"', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono Variable"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      borderRadius: { xl: '0.875rem', '2xl': '1.25rem' },
      boxShadow: {
        card: '0 1px 2px rgba(14,14,16,.04), 0 8px 24px -12px rgba(14,14,16,.12)',
        pop: '0 12px 40px -12px rgba(14,14,16,.28)',
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-up': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        'slide-in-right': { from: { transform: 'translateX(100%)' }, to: { transform: 'translateX(0)' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        'word-up': { from: { transform: 'translateY(105%)' }, to: { transform: 'translateY(0)' } },
        'scene-in': { from: { opacity: '0', transform: 'scale(.94)', filter: 'blur(14px)' }, to: { opacity: '1', transform: 'none', filter: 'blur(0)' } },
        grain: {
          '0%, 100%': { transform: 'translate(0, 0)' }, '20%': { transform: 'translate(-3%, 2%)' }, '40%': { transform: 'translate(2%, -3%)' },
          '60%': { transform: 'translate(-2%, -1%)' }, '80%': { transform: 'translate(3%, 3%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in .2s ease-out',
        'slide-up': 'slide-up .3s ease-out both',
        'slide-in-right': 'slide-in-right .28s cubic-bezier(.2,.8,.2,1)',
        shimmer: 'shimmer 1.6s infinite',
        'word-up': 'word-up .9s cubic-bezier(.2,.75,.15,1) both',
        'scene-in': 'scene-in 1.4s cubic-bezier(.2,.75,.15,1) both',
        grain: 'grain .9s steps(5) infinite',
      },
    },
  },
  plugins: [],
}
