import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();

const apps = [
  {
    key: "parent",
    roleLabel: "PARENT PORTAL",
    iconSource: "public/brand/the-bee-suite/app-icon-yellow.png",
    background: "#05070a",
    accent: "#ffcf40",
    iconBackground: "#ffcf40",
    iosPath: "ios",
    exportPath: "output/app-store/ios/app-icon-1024-no-alpha.png",
  },
  {
    key: "teacher",
    roleLabel: "TEACHER PORTAL",
    iconSource: "public/brand/the-bee-suite/app-icon-dark.png",
    background: "#151515",
    accent: "#ffcf40",
    iconBackground: "#151515",
    iosPath: "ios-teacher",
    exportPath: "output/app-store/ios-teacher/app-icon-1024-no-alpha.png",
  },
];

function absolute(relativePath) {
  return path.join(root, relativePath);
}

function splashCopy(roleLabel, accent) {
  return Buffer.from(`
    <svg width="2732" height="2732" viewBox="0 0 2732 2732" xmlns="http://www.w3.org/2000/svg">
      <style>
        .brand { font: 800 190px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; letter-spacing: -7px; }
        .role { font: 700 72px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; letter-spacing: 18px; }
      </style>
      <text x="1366" y="1850" text-anchor="middle" fill="#ffffff" class="brand">THE BEE SUITE</text>
      <rect x="893" y="1950" width="946" height="142" rx="71" fill="${accent}"/>
      <text x="1366" y="2047" text-anchor="middle" fill="#111111" class="role">${roleLabel}</text>
    </svg>
  `);
}

for (const app of apps) {
  const iconTarget = absolute(`${app.iosPath}/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`);
  const splashDirectory = absolute(`${app.iosPath}/App/App/Assets.xcassets/Splash.imageset`);
  const exportTarget = absolute(app.exportPath);

  await mkdir(path.dirname(exportTarget), { recursive: true });

  const iconPipeline = () => sharp(absolute(app.iconSource))
    .resize(1024, 1024, { fit: "cover" })
    .flatten({ background: app.iconBackground })
    .removeAlpha()
    .png({ compressionLevel: 9 });

  await iconPipeline().toFile(iconTarget);
  await iconPipeline().toFile(exportTarget);

  const splashIcon = await sharp(absolute(app.iconSource))
    .resize(780, 780, { fit: "contain" })
    .png()
    .toBuffer();

  const splash = await sharp({
    create: {
      width: 2732,
      height: 2732,
      channels: 3,
      background: app.background,
    },
  })
    .composite([
      { input: splashIcon, left: 976, top: 630 },
      { input: splashCopy(app.roleLabel, app.accent), left: 0, top: 0 },
    ])
    .flatten({ background: app.background })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toBuffer();

  for (const filename of [
    "splash-2732x2732-2.png",
    "splash-2732x2732-1.png",
    "splash-2732x2732.png",
  ]) {
    await sharp(splash).toFile(path.join(splashDirectory, filename));
  }

  console.log(`Generated ${app.key} App Store icon and native launch assets.`);
}
