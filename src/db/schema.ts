import { bigint, integer, pgTable, serial, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

export const pharmacies = pgTable("pharmacies", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  code: varchar("code", { length: 40 }).notNull().unique(),
  city: varchar("city", { length: 100 }).notNull().default(""),
  address: text("address").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const products = pgTable("products", {
  id: serial("id").primaryKey(),
  sku: varchar("sku", { length: 60 }).notNull().unique(),
  name: varchar("name", { length: 200 }).notNull(),
  category: varchar("category", { length: 100 }).notNull().default("Другое"),
  manufacturer: varchar("manufacturer", { length: 120 }).notNull().default(""),
  price: integer("price").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const inventory = pgTable("inventory", {
  id: serial("id").primaryKey(),
  pharmacyId: integer("pharmacy_id").notNull().references(() => pharmacies.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  quantity: numeric("quantity", { precision: 10, scale: 3 }).notNull().default("0"),
  minStock: numeric("min_stock", { precision: 10, scale: 3 }).notNull().default("0"),
  abc: varchar("abc", { length: 1 }).notNull().default("B"),
  xyz: varchar("xyz", { length: 1 }).notNull().default("Y"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("inventory_pharmacy_product_unique").on(table.pharmacyId, table.productId)]);

export const transfers = pgTable("transfers", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
  fromPharmacyId: integer("from_pharmacy_id").notNull().references(() => pharmacies.id, { onDelete: "cascade" }),
  toPharmacyId: integer("to_pharmacy_id").notNull().references(() => pharmacies.id, { onDelete: "cascade" }),
  quantity: numeric("quantity", { precision: 10, scale: 3 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("planned"),
  note: text("note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const importBatches = pgTable("import_batches", {
  id: serial("id").primaryKey(),
  filename: varchar("filename", { length: 255 }).notNull(),
  rowsImported: integer("rows_imported").notNull().default(0),
  pharmaciesCount: integer("pharmacies_count").notNull().default(0),
  productsCount: integer("products_count").notNull().default(0),
  totalUnits: numeric("total_units", { precision: 15, scale: 3 }).notNull().default("0"),
  fileSize: integer("file_size").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const importMatrix = pgTable("import_matrix", {
  id: serial("id").primaryKey(),
  batchId: integer("batch_id").notNull().references(() => importBatches.id, { onDelete: "cascade" }),
  pharmacyId: integer("pharmacy_id").notNull().references(() => pharmacies.id, { onDelete: "cascade" }),
  abc: varchar("abc", { length: 1 }).notNull(),
  xyz: varchar("xyz", { length: 1 }).notNull(),
  positions: integer("positions").notNull().default(0),
  units: numeric("units", { precision: 15, scale: 3 }).notNull().default("0"),
}, (table) => [uniqueIndex("import_matrix_batch_store_grade_unique").on(table.batchId, table.pharmacyId, table.abc, table.xyz)]);
