const { withAppBuildGradle, withGradleProperties } = require("@expo/config-plugins");

/**
 * Plugin to restrict Android build to specific ABIs and resolve native library conflicts.
 */
module.exports = function withAbiFilters(config) {
  config = withAppBuildGradle(config, (config) => {
    let contents = config.modResults.contents;

    // 1. Add AbiFilters for 32-bit and 64-bit support
    if (!contents.includes('abiFilters "arm64-v8a", "armeabi-v7a"')) {
      contents = contents.replace(
        /(defaultConfig\s*\{)/,
        `$1\n            ndk {\n                abiFilters "arm64-v8a", "armeabi-v7a"\n            }`
      );
    }

    // 2. Add packagingOptions to resolve conflicts that cause crashes on open
    if (!contents.includes("packagingOptions")) {
      contents = contents.replace(
        /(android\s*\{)/,
        `$1\n    packagingOptions {\n        pickFirst '**/libc++_shared.so'\n        pickFirst '**/libfbjni.so'\n        pickFirst '**/libjsi.so'\n        pickFirst '**/libreactnative.so'\n        pickFirst '**/libhermes.so'\n        pickFirst '**/libreact_render*.so'\n        pickFirst '**/libexpo-modules-core.so'\n        pickFirst '**/libfabricjni.so'\n    }`
      );
    }

    config.modResults.contents = contents;
    return config;
  });

  return withGradleProperties(config, (config) => {
    const properties = config.modResults;
    const key = "android.enableBundleCompression";
    const existing = properties.find((property) => property.type === "property" && property.key === key);

    if (existing) {
      existing.value = "true";
    } else {
      properties.push({ type: "property", key, value: "true" });
    }

    return config;
  });
};
