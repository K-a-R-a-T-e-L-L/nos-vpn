import { pathsToModuleNameMapper } from 'ts-jest'

import { compilerOptions } from './tsconfig.json'


export default {
    moduleFileExtensions: ['js', 'json', 'ts'],
    rootDir: '.',
    testEnvironment: 'node',
    roots: ['<rootDir>'],
    modulePaths: ['<rootDir>'],
    preset: 'ts-jest/presets/js-with-ts',
    transform: {
        '^.+\\.(t|j)s$': 'ts-jest',
    },
    moduleNameMapper: {
        ...pathsToModuleNameMapper(compilerOptions.paths),
    },
}
