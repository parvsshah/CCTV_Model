import User, { hashPassword } from "./models/User.js";

/**
 * Seeds a default admin user if the users collection is empty.
 * Called once on server startup after MongoDB connection is established.
 * Credentials are read from environment variables.
 */
export async function seedDefaultAdmin(): Promise<void> {
  const count = await User.countDocuments();
  if (count > 0) {
    console.log("[Seed] Users collection already has data — skipping seed");
    return;
  }

  const email = process.env.DEFAULT_ADMIN_EMAIL ?? "admin@example.com";
  const password = process.env.DEFAULT_ADMIN_PASSWORD ?? "password";
  const name = process.env.DEFAULT_ADMIN_NAME ?? "Admin User";

  const passwordHash = await hashPassword(password);

  await User.create({
    name,
    email,
    passwordHash,
    role: "admin",
  });

  console.log(`[Seed] Default admin user created: ${email}`);
}
