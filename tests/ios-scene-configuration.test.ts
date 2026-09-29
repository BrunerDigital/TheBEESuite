import assert from "node:assert/strict";
import test from "node:test";
import { assertSceneConfiguration } from "../scripts/ios-scene-configuration.mjs";

function sceneInfo(compiled = false) {
  return { UIApplicationSceneManifest: {
    UIApplicationSupportsMultipleScenes: false,
    UISceneConfigurations: { UIWindowSceneSessionRoleApplication: [{
      UISceneConfigurationName: "Default Configuration",
      UISceneDelegateClassName: compiled ? "App.SceneDelegate" : "$(PRODUCT_MODULE_NAME).SceneDelegate",
      UISceneStoryboardFile: "Main",
    }] },
  } };
}

test("native release accepts source and expanded single-window scene configurations", () => {
  assert.doesNotThrow(() => assertSceneConfiguration(sceneInfo()));
  assert.doesNotThrow(() => assertSceneConfiguration(sceneInfo(true), { compiled: true }));
});

test("native release rejects the legacy lifecycle that crashes on iOS 27", () => {
  assert.throws(() => assertSceneConfiguration({}), /Scene lifecycle adoption/);
  for (const configurations of [undefined, {}, { UIWindowSceneSessionRoleApplication: [] }]) {
    assert.throws(() => assertSceneConfiguration({ UIApplicationSceneManifest: {
      UIApplicationSupportsMultipleScenes: false, UISceneConfigurations: configurations,
    } }));
  }
});

test("native release rejects unresolved delegates, absent bridge storyboards and extra windows", () => {
  for (const compiled of [false, true]) {
    const valid = sceneInfo(compiled);
    const manifest = valid.UIApplicationSceneManifest;
    const configuration = manifest.UISceneConfigurations.UIWindowSceneSessionRoleApplication[0];
    for (const changes of [
      { UISceneDelegateClassName: undefined },
      { UISceneDelegateClassName: "Other.SceneDelegate" },
      { UISceneDelegateClassName: compiled ? "$(PRODUCT_MODULE_NAME).SceneDelegate" : "App.SceneDelegate" },
      { UISceneStoryboardFile: undefined },
      { UISceneStoryboardFile: "LaunchScreen" },
      { UISceneConfigurationName: "Other" },
    ]) {
      assert.throws(() => assertSceneConfiguration({ UIApplicationSceneManifest: { ...manifest,
        UISceneConfigurations: { UIWindowSceneSessionRoleApplication: [{ ...configuration, ...changes }] },
      } }, { compiled }));
    }
    assert.throws(() => assertSceneConfiguration({ UIApplicationSceneManifest: { ...manifest,
      UIApplicationSupportsMultipleScenes: true,
    } }, { compiled }));
    assert.throws(() => assertSceneConfiguration({ UIApplicationSceneManifest: { ...manifest,
      UISceneConfigurations: { UIWindowSceneSessionRoleApplication: [configuration, configuration] },
    } }, { compiled }));
  }
});
