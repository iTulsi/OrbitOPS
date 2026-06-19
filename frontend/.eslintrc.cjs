module.exports = {
    root: true,

    env: {
        browser: true,
        es2022: true,
        node: true,
    },

    extends: [
        'eslint:recommended',
        'plugin:react/recommended',
        'plugin:react-hooks/recommended',
    ],

    parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
            jsx: true,
        },
    },

    plugins: [
        'react-refresh',
    ],

    settings: {
        react: {
            version: 'detect',
        },
    },

    ignorePatterns: [
        'dist/',
        'node_modules/',
        'coverage/',
        '**/*.before-*',
        '**/*.backup.*',
    ],

    rules: {
        'react/react-in-jsx-scope': 'off',
        'react/prop-types': 'off',

        'react-refresh/only-export-components': [
            'warn',
            {
                allowConstantExport: true,
            },
        ],

        'no-unused-vars': [
            'error',
            {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
                caughtErrorsIgnorePattern: '^_',
            },
        ],
    },
};
