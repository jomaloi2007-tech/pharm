import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle", // <-- Обязательно: указывает, где лежат ваши SQL-файлы
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
