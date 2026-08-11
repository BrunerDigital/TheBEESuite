export function terminalStoreEnabled() {
  return process.env.NEXT_PUBLIC_TERMINAL_STORE_ENABLED === "true"
    && process.env.NEXT_PUBLIC_TERMINAL_STORE_RELEASE_APPROVED === "true";
}

export type TerminalStoreReturnState = "success" | "cancelled";

export function terminalStoreReturnState(value: unknown): TerminalStoreReturnState | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate === "success" || candidate === "cancelled" ? candidate : null;
}
