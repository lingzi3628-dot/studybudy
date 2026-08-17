/**
 * Seed the admin_users table with the demo admin account.
 * Email: lingzi3628@gmail.com
 * Password: 28362836
 *
 * Run with: bun run scripts/seed-admin.ts
 */
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = "lingzi3628@gmail.com";
  const password = "28362836";

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
