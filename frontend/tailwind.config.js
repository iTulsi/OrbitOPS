/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            colors: {
                space: {
                    black: '#0a0a1a',
                    dark: '#050510',
                    light: '#1a1a2e',
                },
                neon: {
                    cyan: '#00ffff',
                    purple: '#8b5cf6',
                    pink: '#d946ef',
                    red: '#ff0000',
                }
            },
            fontFamily: {
                orbitron: ['Orbitron', 'sans-serif'],
                inter: ['Inter', 'sans-serif'],
            },
            backgroundImage: {
                'grid-pattern': "linear-gradient(to right, #1a1a2e 1px, transparent 1px), linear-gradient(to bottom, #1a1a2e 1px, transparent 1px)",
            }
        },
    },
    plugins: [],
}
