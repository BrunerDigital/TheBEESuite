export function honeyglassUiEnabled() {
  return process.env.NEXT_PUBLIC_HONEYGLASS_UI_ENABLED === "true";
}

export function dataReadinessCenterEnabled() {
  return process.env.NEXT_PUBLIC_DATA_READINESS_ENABLED !== "false";
}

export const HONEYGLASS_ROLLBACK_FLAGS = {
  ui: "NEXT_PUBLIC_HONEYGLASS_UI_ENABLED=false",
  readiness: "NEXT_PUBLIC_DATA_READINESS_ENABLED=false",
} as const;
