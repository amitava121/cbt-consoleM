import { eq } from "drizzle-orm";
import { db } from "../db.js";
import { users, institutions } from "../schemas/index.js";
import { hashPassword } from "../../services/auth.js";

const seed = async () => {
  const [existing] = await db.select().from(users).where(eq(users.email, "admin@cbe.local")).limit(1);
  if (existing) {
    console.log("Super admin already exists. Skipping seed.");
    return;
  }

  const [institution] = await db
    .insert(institutions)
    .values({
      name: "CBE Default Institution",
      code: "CBE-DEFAULT",
      isActive: true,
    })
    .returning();

  const passwordHash = await hashPassword("Admin@123");

  await db.insert(users).values({
    institutionId: institution.id,
    email: "admin@cbe.local",
    passwordHash,
    fullName: "System Administrator",
    role: "super_admin",
    isActive: true,
  });

  console.log("Seeded super admin: admin@cbe.local / Admin@123");
};

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
