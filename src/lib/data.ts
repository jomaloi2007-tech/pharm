import { db } from "@/db";
import { importBatches, importMatrix, inventory, pharmacies, products, transfers } from "@/db/schema";
import { asc, desc } from "drizzle-orm";
import { buildRecommendations } from "./recommendations";
import type { AppData, ImportBatch, InventoryItem, MatrixSnapshot, Pharmacy, Product, Transfer } from "./types";

export async function getAppData(): Promise<AppData> {
  const [storeRows, productRows, stockRows, transferRows, importRows, matrixRows] = await Promise.all([
    db.select().from(pharmacies).orderBy(asc(pharmacies.id)),
    db.select().from(products).orderBy(asc(products.name)),
    db.select().from(inventory).orderBy(desc(inventory.updatedAt), desc(inventory.id)),
    db.select().from(transfers).orderBy(desc(transfers.createdAt), desc(transfers.id)),
    db.select().from(importBatches).orderBy(desc(importBatches.createdAt), desc(importBatches.id)),
    db.select().from(importMatrix).orderBy(desc(importMatrix.batchId)),
  ]);
  const stores: Pharmacy[] = storeRows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
  const catalog: Product[] = productRows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
  const stock: InventoryItem[] = stockRows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() }));
  const movements: Transfer[] = transferRows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
  }));
  const imports: ImportBatch[] = importRows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
  const matrixSnapshots: MatrixSnapshot[] = matrixRows;
  return {
    pharmacies: stores,
    products: catalog,
    inventory: stock,
    transfers: movements,
    imports,
    matrixSnapshots,
    recommendations: buildRecommendations(stock, catalog, movements),
  };
}
