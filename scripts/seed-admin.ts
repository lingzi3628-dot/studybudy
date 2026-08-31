/**
 * Seed the admin_users table with the initial admin account.
 *
 * Credentials come from env vars (same ones the auto-seed on login uses):
 *   ADMIN_INITIAL_EMAIL + ADMIN_INITIAL_PASSWORD
 *
 * Run with: ADMIN_INITIAL_EMAIL=... ADMIN_INITIAL_PASSWORD=... bun run scripts/seed-admin.ts
 */
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_INITIAL_EMAIL;
  const password = process.env.ADMIN_INITIAL_PASSWORD;

  if (!email || !password) {
    console.error("✗ Set ADMIN_INITIAL_EMAIL and ADMIN_INITIAL_PASSWORD env vars first.");
    console.error("  Never commit real credentials to the repo.");
    process.exit(1);
  }

  const passwordHash = bcrypt.hashSync(password, 10);

  const admin = await prisma.adminUser.upsert({
    where: { email },
    create: { email, passwordHash, name: "Admin" },
    update: { passwordHash }, // re-hash on re-run so password can be reset by re-running
  });

  console.log(`✓ Admin user upserted:`);
  console.log(`  id:    ${admin.id}`);
  console.log(`  email: ${admin.email}`);
  console.log(`  hash:  ${admin.passwordHash.slice(0, 20)}…`);
  process.exit(0);
}

main().catch((e) => {
  console.error("Failed to seed admin:", e);
  process.exit(1);
});
