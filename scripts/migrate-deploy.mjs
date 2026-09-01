#!/usr/bin/env node
/**
 * Wraps `prisma migrate deploy` for build-time use.
 *
 * - Default: runs `prisma migrate deploy` and streams its output.
 * - P3005 ("The database schema is not empty", i.e. a database created with
 *   the legacy `db push` flow): one-time self-heal — marks the 0_init
 *   baseline as applied via `migrate resolve`, then retries deploy.
 *   See README → Database migrations.
 * - Unreachable DB / missing DATABASE_URL / other failures: warn-only
 *   exit 0 so builds on environments without a reachable database still
 *   succeed (matching the previous `|| echo WARN` behavior).
 */
import { spawnSync } from "node:child_process";

const BASELINE_MIGRATION = "0_init";

function prisma(args) {
  return spawnSync("npx", ["--no-install", "prisma", ...args], {
    encoding: "utf8",
  });
}

const deploy = prisma(["migrate", "deploy"]);
const output = `${deploy.stdout ?? ""}\n${deploy.stderr ?? ""}`;
process.stdout.write(output);

if ((deploy.status ?? 1) === 0) {
  console.log("[migrate-deploy] migrations up to date.");
  process.exit(0);
}

if (/P3005/.test(output)) {
  console.log(
    `[migrate-deploy] P3005 detected — database was created with \`db push\`. ` +
      `Baselining once: marking ${BASELINE_MIGRATION} as applied, then retrying deploy.`
  );
  const resolve = prisma(["migrate", "resolve", "--applied", BASELINE_MIGRATION]);
  process.stdout.write(`${resolve.stdout ?? ""}\n${resolve.stderr ?? ""}\n`);
  if ((resolve.status ?? 1) !== 0) {
    console.warn(
      "[migrate-deploy] WARN: could not record the baseline automatically. " +
        "Run `npx prisma migrate resolve --applied 0_init` manually — see README → Database migrations."
    );
    process.exit(0);
  }
  const retry = prisma(["migrate", "deploy"]);
  process.stdout.write(`${retry.stdout ?? ""}\n${retry.stderr ?? ""}\n`);
  if ((retry.status ?? 1) !== 0) {
    console.warn(
      "[migrate-deploy] WARN: migrate deploy still failing after baseline — see README → Database migrations."
    );
  } else {
    console.log("[migrate-deploy] baseline recorded — migration history is now authoritative.");
  }
  process.exit(0);
}

console.warn(
  "[migrate-deploy] WARN: prisma migrate deploy failed — continuing (baselined DB or missing DATABASE_URL). See README → Database migrations."
);
process.exit(0);
