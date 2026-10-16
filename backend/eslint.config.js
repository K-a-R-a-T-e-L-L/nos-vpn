const eslintPlugin = require('@typescript-eslint/eslint-plugin')
const tsParser = require('@typescript-eslint/parser')
const eslintConfigPrettier = require('eslint-config-prettier')
const importPlugin = require('eslint-plugin-import')

const tsFiles = ['src/**/*.ts', 'common/**/*.ts', 'test/**/*.ts', '*.ts']

module.exports = [
    {
        ignores: [
            '**/node_modules/**',
            '**/dist/**',
            '**/coverage/**',
            '**/generated/**',
            '**/vendor/**',
            '**/tmp/**',
            '**/temp/**',
        ],
    },
    {
        files: tsFiles,

        languageOptions: {
            parser: tsParser,
            parserOptions: {
                project: 'tsconfig.json',
                tsconfigRootDir: __dirname,
                sourceType: 'module',
            },
            globals: {
                __dirname: 'readonly',
                process: 'readonly',
                module: 'readonly',
                require: 'readonly',
                jest: 'readonly',
                test: 'readonly',
                expect: 'readonly',
            },
        },

        plugins: {
            '@typescript-eslint': eslintPlugin,
            import: importPlugin,
        },

        settings: {
            'import/resolver': {
                typescript: {
                    project: 'tsconfig.json',
                },
                node: {
                    extensions: ['.js', '.json', '.ts'],
                },
            },
        },

        rules: {
            '@typescript-eslint/interface-name-prefix': 'off',
            '@typescript-eslint/explicit-function-return-type': 'off',
            '@typescript-eslint/explicit-module-boundary-types': 'off',
            '@typescript-eslint/no-explicit-any': 'off',

            'sort-imports': [
                'error',
                {
                    ignoreCase: false,
                    ignoreDeclarationSort: true,
                    ignoreMemberSort: false,
                    memberSyntaxSortOrder: ['none', 'all', 'multiple', 'single'],
                    allowSeparatedGroups: true,
                },
            ],
            'import/no-unresolved': 'error',
            'import/order': [
                'error',
                {
                    groups: ['builtin', 'external', 'internal', ['sibling', 'parent'], 'index', 'unknown'],
                    'newlines-between': 'always',
                    alphabetize: {
                        order: 'asc',
                        caseInsensitive: true,
                    },
                },
            ],
        },
    },
    {
        ...eslintConfigPrettier,
        files: tsFiles,
    },
]
