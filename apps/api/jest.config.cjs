module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test'],
  testPathIgnorePatterns: ['\\.integration-spec\\.ts$'],
  passWithNoTests: true,
};
