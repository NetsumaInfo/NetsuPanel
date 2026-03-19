/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/app/**/*.{ts,tsx,html}',
    './src/shared/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        ink:     '#0f1117',
        muted:   '#6b7280',
        panel:   '#ffffff',
        border:  '#e5e8ef',
        accent:  '#2563eb',
        success: '#16a34a',
        danger:  '#dc2626',
        warning: '#d97706',
        // Legacy aliases kept for backward compat
        mist:       '#f5f6fa',
        line:       '#e5e8ef',
        accentSoft: '#dbeafe',
      },
      fontFamily: {
        sans: ['"Inter"', '"Segoe UI"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
      },
      boxShadow: {
        sm:    '0 1px 3px rgba(15,17,23,0.06), 0 1px 2px rgba(15,17,23,0.04)',
        panel: '0 4px 24px rgba(15,17,23,0.07)',
      },
      borderRadius: {
        DEFAULT: '10px',
      },
      fontSize: {
        '2xs': ['10px', '14px'],
        xs:    ['11px', '16px'],
        sm:    ['12px', '18px'],
        base:  ['13px', '20px'],
        lg:    ['15px', '22px'],
        xl:    ['17px', '24px'],
        '2xl': ['20px', '28px'],
      },
      spacing: {
        '4.5': '18px',
      },
      animation: {
        'spin-slow': 'spin 2s linear infinite',
        'fade-in': 'fadeIn 0.15s ease-out',
        'slide-down': 'slideDown 0.2s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideDown: {
          '0%': { opacity: '0', transform: 'translateY(-4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
