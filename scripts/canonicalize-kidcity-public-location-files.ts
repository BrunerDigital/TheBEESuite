import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { canonicalSchoolLocationId } from "@/lib/school-location-identifiers";

type PublicLocation = {
  crmLocationId: string;
  locationId: string;
  [key: string]: unknown;
};

type PublicLocationFile = { locations: PublicLocation[] };

function invariant(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function canonical(value: string) {
  const result = canonicalSchoolLocationId({
    brandName: "Kid City USA",
    brandSlug: "kid-city-usa",
    crmLocationId: value,
  });
  invariant(result, `Invalid Kid City public location ID: ${value}`);
  return result;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const confirmed = process.argv.includes("--confirm-public-location-files");
  if (apply) invariant(confirmed, "Apply mode requires --confirm-public-location-files.");

  const jsonPath = path.join(process.cwd(), "public", "kidcity-locations.json");
  const file = JSON.parse(await readFile(jsonPath, "utf8")) as PublicLocationFile;
  invariant(Array.isArray(file.locations) && file.locations.length >= 66, "The Kid City public location source is incomplete.");
  let jsonChanges = 0;
  for (const location of file.locations) {
    const canonicalId = canonical(location.crmLocationId || location.locationId);
    if (location.crmLocationId !== canonicalId || location.locationId !== canonicalId) jsonChanges += 1;
    location.crmLocationId = canonicalId;
    location.locationId = canonicalId;
  }

  const wordpressDirectory = path.join(process.cwd(), "wordpress-avada");
  const htmlFiles = (await readdir(wordpressDirectory)).filter((name) => name.endsWith(".html"));
  const wordpressChanges: Array<{ file: string; options: number }> = [];
  const rewritten = new Map<string, string>();
  for (const name of htmlFiles) {
    const filePath = path.join(wordpressDirectory, name);
    const input = await readFile(filePath, "utf8");
    let options = 0;
    const output = input.replace(/<option\s+value="([A-Za-z]{2}\s*\|[^"]+)"([^>]*data-location-id="\1"[^>]*)>([^<]+)<\/option>/g, (tag, legacyId: string) => {
      const canonicalId = canonical(legacyId);
      if (canonicalId === legacyId) return tag;
      options += 1;
      return tag.replaceAll(legacyId, canonicalId);
    });
    if (options) {
      wordpressChanges.push({ file: name, options });
      rewritten.set(filePath, output);
    }
  }

  if (apply) {
    await writeFile(jsonPath, `${JSON.stringify(file, null, 2)}\n`, "utf8");
    for (const [filePath, content] of rewritten) await writeFile(filePath, content, "utf8");
  }

  console.log(JSON.stringify({ dryRun: !apply, jsonLocations: file.locations.length, jsonChanges, wordpressChanges }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
