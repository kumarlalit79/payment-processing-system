// This file runs BEFORE any test file is loaded (via bunfig.toml preload)
// Sets NODE_ENV so payment.service.ts skips background processing in tests
process.env.NODE_ENV = "test";
