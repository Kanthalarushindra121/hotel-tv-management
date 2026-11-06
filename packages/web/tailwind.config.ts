import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Brand
        primary: {
          DEFAULT: '#6366F1',
          50: '#EEEEFF',
          100: '#E0E1FF',
          200: '#C7C8FE',
          300: '#A5A6FC',
          400: '#8183F9',
          500: '#6366F1',
          600: '#4F46E5',
          700: '#4338CA',
          800: '#3730A3',
          900: '#312E81',
          950: '#1E1B4B',
        },
        navy: {
          DEFAULT: '#0F0F23',
          50: '#E8E8F0',
          100: '#C5C5DB',
          200: '#9F9FC0',
          300: '#7878A5',
          400: '#5A5A91',
          500: '#3D3D7E',
          600: '#2E2E6B',
          700: '#1E1E52',
          800: '#141430',
          900: '#0F0F23',
        },
        surface: {
          DEFAULT: '#1A1A2E',
          light: '#F8F9FC',
        },
        // Semantic
        background: '#F8F9FC',
        foreground: '#0F172A',
        muted: {
          DEFAULT: '#64748B',
          foreground: '#94A3B8',
        },
        border: '#E2E8F0',
        input: '#E2E8F0',
        ring: '#6366F1',
        // Status
        success: {
          DEFAULT: '#10B981',
          light: '#D1FAE5',
          dark: '#065F46',
        },
        warning: {
          DEFAULT: '#F59E0B',
          light: '#FEF3C7',
          dark: '#92400E',
        },
        danger: {
          DEFAULT: '#EF4444',
          light: '#FEE2E2',
          dark: '#991B1B',
        },
        online: {
          DEFAULT: '#22C55E',
          light: '#DCFCE7',
        },
        offline: {
          DEFAULT: '#94A3B8',
          light: '#F1F5F9',
        },
        // Card/Panel
        card: {
          DEFAULT: '#FFFFFF',
          foreground: '#0F172A',
        },
        popover: {
          DEFAULT: '#FFFFFF',
          foreground: '#0F172A',
        },
        secondary: {
          DEFAULT: '#F1F5F9',
          foreground: '#475569',
        },
        accent: {
          DEFAULT: '#F1F5F9',
          foreground: '#0F172A',
        },
        destructive: {
          DEFAULT: '#EF4444',
          foreground: '#FFFFFF',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '0.875rem' }],
      },
      borderRadius: {
        lg: '0.75rem',
        md: '0.5rem',
        sm: '0.375rem',
        xl: '1rem',
        '2xl': '1.25rem',
      },
      boxShadow: {
        'card': '0 1px 3px 0 rgba(0, 0, 0, 0.06), 0 1px 2px -1px rgba(0, 0, 0, 0.06)',
        'card-hover': '0 4px 6px -1px rgba(0, 0, 0, 0.08), 0 2px 4px -2px rgba(0, 0, 0, 0.06)',
        'modal': '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
        'sidebar': '1px 0 0 0 #E2E8F0',
        'inner-sm': 'inset 0 1px 2px 0 rgba(0, 0, 0, 0.05)',
        'glow': '0 0 0 3px rgba(99, 102, 241, 0.15)',
        'glow-success': '0 0 0 3px rgba(16, 185, 129, 0.15)',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-in-out',
        'fade-up': 'fadeUp 0.3s ease-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'slide-in-left': 'slideInLeft 0.3s ease-out',
        'pulse-soft': 'pulseSoft 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow': 'spin 3s linear infinite',
        'bounce-soft': 'bounceSoft 1s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        fadeUp: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(16px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        slideInLeft: {
          '0%': { opacity: '0', transform: 'translateX(-16px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
        bounceSoft: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
        },
      },
      backgroundImage: {
        'gradient-brand': 'linear-gradient(135deg, #0F0F23 0%, #1A1A2E 50%, #2D2D5E 100%)',
        'gradient-accent': 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
        'gradient-mesh': 'radial-gradient(at 40% 20%, hsla(240,100%,74%,0.15) 0px, transparent 50%), radial-gradient(at 80% 0%, hsla(263,100%,77%,0.1) 0px, transparent 50%)',
        'gradient-card': 'linear-gradient(145deg, #ffffff 0%, #f8f9fc 100%)',
      },
      transitionDuration: {
        '250': '250ms',
      },
      spacing: {
        '18': '4.5rem',
        '68': '17rem',
        '72': '18rem',
        '84': '21rem',
        '96': '24rem',
      },
    },
  },
  plugins: [
    require('tailwindcss-animate'),
  ],
}

export default config
