import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);
  try {
    await migrate(db, { migrationsFolder: "./drizzle" });
    console.log("✅ Migrations applied successfully");
  } catch (e) {
    console.error("❌ Migration failed:", e);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();