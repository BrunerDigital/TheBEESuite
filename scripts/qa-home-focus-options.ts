export function homeFocusFilters(args: readonly string[]) {
  const readFilter = (name: string, allowed: readonly string[]) => {
    const index = args.indexOf(name);
    if (index < 0) return undefined;
    const value = args[index + 1];
    if (!value || !allowed.includes(value)) {
      throw new Error(`${name} requires one of: ${allowed.join(", ")}`);
    }
    return value;
  };
  return {
    role: readFilter("--role", ["parent", "teacher", "director", "executive"]),
    width: readFilter("--width", ["390", "1024"]),
    zoom: readFilter("--zoom", ["1", "2"]),
  };
}
