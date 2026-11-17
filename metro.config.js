const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Exclusion list for Metro watcher to prevent ENOENT errors on build folders
config.resolver.blockList = [
  /.*\/node_modules\/.*\/build\/.*/,
];

// Add support for Bible DB, SQL, and WebAssembly
config.resolver.assetExts.push("db", "wasm", "sql");
config.resolver.sourceExts.push("wasm");

module.exports = config;
