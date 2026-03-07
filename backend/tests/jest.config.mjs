/** @type {import('jest').Config} */
export default {
    testEnvironment: 'jsdom',
    roots: ['<rootDir>'],
    setupFilesAfterEnv: ['<rootDir>/unit/setup.mjs'],
    modulePaths: [],
    moduleDirectories: ['node_modules'],
    testMatch: ['**/*.spec.js', '**/*.spec.mjs'],
    transform: {
        '^.+\\.js$': ['babel-jest', { configFile: './babel.config.js' }],
    },
};