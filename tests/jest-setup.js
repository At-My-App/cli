// Jest setup file to configure test environment
process.env.NODE_ENV = "test";

// Disable actual worker threads in tests
process.env.DISABLE_WORKERS = "true";
