module.exports = {
  projects: [
    {
      // Pure logic + DB/sync tests: plain node, real SQLite via better-sqlite3.
      displayName: 'unit',
      preset: 'jest-expo/node',
      testMatch: ['<rootDir>/src/**/__tests__/**/*.test.ts'],
      setupFiles: ['<rootDir>/jest.setup.ts'],
      moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
    },
  ],
};
