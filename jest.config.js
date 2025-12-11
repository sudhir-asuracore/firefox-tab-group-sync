module.exports = {
  // Ensure the WebExtension mock sets up global `browser`/`chrome` before tests run
  setupFiles: ['jest-webextension-mock'],
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.[jt]sx?$': 'babel-jest',
  },
};
