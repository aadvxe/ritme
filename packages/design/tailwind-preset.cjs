/**
 * Ritme Tailwind preset — GMera Solusi design language with accessibility adjustments.
 * Used by both apps/frontend and apps/extension.
 *
 * GMera source values: accent #5C67F2 (hover #4a55c2), navy #151D48, page #F8FAFC, border #E2E8F0,
 * Poppins, rounded-2xl cards / rounded-xl controls, ease-out-expo motion.
 *
 * Deviations (WCAG 2.2 AA): text-bearing primary uses #4a55c2; muted text is #64748B (not #94A3B8);
 * status colours are dark-on-tint with an icon + word, never colour alone.
 */
const withOpacity = (v) => `rgb(var(${v}) / <alpha-value>)`;

module.exports = {
  theme: {
    extend: {
      fontFamily: {
        sans: ['Poppins', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        primary: {
          DEFAULT: withOpacity('--rt-primary'), // #5C67F2 — accents, rings, large UI
          strong: withOpacity('--rt-primary-strong'), // #4a55c2 — text-bearing buttons / links
          foreground: '#FFFFFF',
        },
        navy: withOpacity('--rt-navy'), // #151D48 — headings
        background: withOpacity('--rt-bg'), // #F8FAFC
        surface: withOpacity('--rt-surface'), // #FFFFFF
        border: withOpacity('--rt-border'), // #E2E8F0
        text: {
          DEFAULT: withOpacity('--rt-text'), // #1E293B
          secondary: withOpacity('--rt-text-secondary'), // #475569
          muted: withOpacity('--rt-text-muted'), // #64748B (AA on white)
        },
        // Status = tint background + strong foreground. Always pair with an icon and a word.
        fact: { DEFAULT: withOpacity('--rt-fact'), fg: withOpacity('--rt-fact-fg') }, // green
        assumption: { DEFAULT: withOpacity('--rt-assumption'), fg: withOpacity('--rt-assumption-fg') }, // amber
        blocker: { DEFAULT: withOpacity('--rt-blocker'), fg: withOpacity('--rt-blocker-fg') }, // orange
        info: { DEFAULT: withOpacity('--rt-info'), fg: withOpacity('--rt-info-fg') }, // indigo
        error: { DEFAULT: withOpacity('--rt-error'), fg: withOpacity('--rt-error-fg') }, // red
      },
      borderRadius: {
        xl: '0.75rem',
        '2xl': '1rem',
        '3xl': '1.5rem',
        showcase: '2rem',
      },
      boxShadow: {
        card: '0 1px 2px rgb(15 23 42 / 0.06)',
        popover: '0 8px 30px rgb(0 0 0 / 0.12)',
        toast: '0 12px 40px rgb(0 0 0 / 0.08)',
        glow: '0 8px 20px rgb(92 103 242 / 0.2)',
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
        overshoot: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      keyframes: {
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(.95) translateY(10px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
        'blob-a': {
          '0%': { transform: 'translate3d(0,0,0) scale(1)' },
          '100%': { transform: 'translate3d(6%,-8%,0) scale(1.12)' },
        },
        'blob-b': {
          '0%': { transform: 'translate3d(0,0,0) scale(1)' },
          '100%': { transform: 'translate3d(-8%,6%,0) scale(1.08)' },
        },
        float: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
      },
      animation: {
        'fade-in-up': 'fade-in-up .3s cubic-bezier(.16,1,.3,1) both',
        'fade-in': 'fade-in .4s cubic-bezier(.16,1,.3,1) both',
        'scale-in': 'scale-in .2s cubic-bezier(.16,1,.3,1) both',
        'blob-a': 'blob-a 25s ease-in-out infinite alternate',
        'blob-b': 'blob-b 30s ease-in-out infinite alternate',
        float: 'float 6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
