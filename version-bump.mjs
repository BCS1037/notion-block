import { readFileSync, writeFileSync } from "fs";

const targetVersion = process.env.npm_package_version;
if (!targetVersion) {
  console.error("Error: npm_package_version env variable is missing. Run this via 'npm version <major|minor|patch>'");
  process.exit(1);
}

// 1. Read manifest.json and bump its version to target version
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, "\t") + "\n");
console.log(`[Version Bump] manifest.json version bumped to: ${targetVersion}`);

// 2. Read versions.json and map target version to minAppVersion
const versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[targetVersion] = minAppVersion;

// Keep versions.json formatted with tabs and sorted/ordered
writeFileSync("versions.json", JSON.stringify(versions, null, "\t") + "\n");
console.log(`[Version Bump] versions.json updated with version: ${targetVersion} -> minAppVersion: ${minAppVersion}`);
