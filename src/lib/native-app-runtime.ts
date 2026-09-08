"use client";

import { Capacitor } from "@capacitor/core";
import { useSyncExternalStore } from "react";

const subscribeNativeRuntime = () => () => undefined;

export function isNativeAppRuntime() {
  return Capacitor.isNativePlatform();
}

export function useNativeAppRuntime() {
  return useSyncExternalStore(
    subscribeNativeRuntime,
    isNativeAppRuntime,
    () => false,
  );
}
