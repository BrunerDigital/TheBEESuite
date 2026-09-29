import assert from "node:assert/strict";

// iOS 27 rejects apps built with its SDK before launch if scenes are omitted.
// Validate both the source plist and the plist produced by Xcode expansion.
export function assertSceneConfiguration(info, { compiled = false } = {}) {
  const manifest = info.UIApplicationSceneManifest;
  assert.ok(manifest, "Scene lifecycle adoption is required for iOS 27 launch");
  assert.equal(manifest.UIApplicationSupportsMultipleScenes, false, "Portals use one window");
  const configurations = manifest.UISceneConfigurations?.UIWindowSceneSessionRoleApplication;
  assert.ok(Array.isArray(configurations), "Application window scene configuration is required");
  assert.equal(configurations.length, 1, "Exactly one portal scene configuration is required");
  const configuration = configurations[0];
  assert.equal(configuration.UISceneConfigurationName, "Default Configuration");
  assert.equal(configuration.UISceneDelegateClassName,
    compiled ? "App.SceneDelegate" : "$(PRODUCT_MODULE_NAME).SceneDelegate",
    "Scene delegate must resolve to the compiled App module");
  assert.equal(configuration.UISceneStoryboardFile, "Main", "Scene must create the existing Capacitor bridge storyboard");
}
