// This tells Jest to replace the real 'src/config.js' module
// with our fake version whenever it's imported in a test.
jest.mock('../src/constants.ts', () => ({
  // We need this property when mocking ES Modules
  IS_TEST_ENV: true,
}));