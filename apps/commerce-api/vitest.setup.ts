// Nest's dependency injection reads decorator metadata that only exists once
// this side-effecting import has run. main.ts gets this for free because it
// is the process entry point and imports it first; test files are not
// entry points, so this setup file (loaded by vitest.config.ts before any
// test file) is what gives them the same guarantee.
import "reflect-metadata";
