import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

export const apiHttpMethods = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;

export type ApiHttpMethod = (typeof apiHttpMethods)[number];

export type ApiRouteSpec = {
  filePath: string;
  routePath: string;
  methods: ApiHttpMethod[];
};

const methodPattern = new RegExp(
  `export\\s+(?:(?:async\\s+)?function\\s+(${apiHttpMethods.join("|")})\\b|const\\s+(${apiHttpMethods.join("|")})\\b)`,
  "g",
);

function walkRouteFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...walkRouteFiles(fullPath));
      continue;
    }
    if (entry === "route.ts") files.push(fullPath);
  }
  return files.sort();
}

export function apiRoutePathFromFile(filePath: string, root = process.cwd()) {
  const apiRoot = join(root, "src", "app", "api");
  const relativePath = relative(apiRoot, filePath);
  const segments = relativePath.split(sep).slice(0, -1).map((segment) => {
    if (segment.startsWith("[...") && segment.endsWith("]")) return "test-slug";
    if (segment.startsWith("[") && segment.endsWith("]")) return "test-id";
    return segment;
  });
  return `/api/${segments.join("/")}`;
}

export function exportedRouteMethods(source: string): ApiHttpMethod[] {
  const methods = new Set<ApiHttpMethod>();
  for (const match of source.matchAll(methodPattern)) {
    methods.add((match[1] ?? match[2]) as ApiHttpMethod);
  }
  return Array.from(methods).sort((a, b) => apiHttpMethods.indexOf(a) - apiHttpMethods.indexOf(b));
}

export function discoverApiRouteSpecs(root = process.cwd()): ApiRouteSpec[] {
  const apiRoot = join(root, "src", "app", "api");
  return walkRouteFiles(apiRoot).map((filePath) => ({
    filePath,
    routePath: apiRoutePathFromFile(filePath, root),
    methods: exportedRouteMethods(readFileSync(filePath, "utf8")),
  }));
}
