import { db } from "@/db";
import { importBatches, importMatrix, inventory, pharmacies, products } from "@/db/schema";
import { and, eq, notInArray, sql } from "drizzle-orm";
import { AppError } from "@/lib/actions";
import { getAppData } from "@/lib/data";
import { parseExcel } from "@/lib/excel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file === "string" || !("arrayBuffer" in file)) {
      throw new AppError("Выберите Excel-файл для загрузки");
    }
    const pharmacyName = String(form.get("pharmacyName") ?? "").trim().slice(0, 160);
    const rows = await parseExcel(file as File, pharmacyName);
    const result = await db.transaction(async (tx) => {
      const storeIds = new Map<string, number>();
      const productIds = new Map<string, number>();
      const stock = new Map<string, typeof inventory.$inferInsert>();
      const productsByStore = new Map<number, Set<number>>();

      for (const row of rows) {
        let pharmacyId = storeIds.get(row.pharmacyCode);
        if (!pharmacyId) {
          const [store] = await tx.insert(pharmacies).values({
            code: row.pharmacyCode, name: row.pharmacyName, city: row.city, address: row.address,
          }).onConflictDoUpdate({
            target: pharmacies.code,
            set: {
              name: row.pharmacyName,
              city: sql`case when excluded.city = '' then ${pharmacies.city} else excluded.city end`,
              address: sql`case when excluded.address = '' then ${pharmacies.address} else excluded.address end`,
            },
          }).returning({ id: pharmacies.id });
          pharmacyId = store.id;
          storeIds.set(row.pharmacyCode, pharmacyId);
        }

        let productId = productIds.get(row.sku);
        if (!productId) {
          const [product] = await tx.insert(products).values({
            sku: row.sku, name: row.productName, category: row.category,
            manufacturer: row.manufacturer, price: row.price,
          }).onConflictDoUpdate({
            target: products.sku,
            set: {
              name: row.productName, category: row.category, manufacturer: row.manufacturer,
              price: sql`case when excluded.price = 0 then ${products.price} else excluded.price end`,
            },
          }).returning({ id: products.id });
          productId = product.id;
          productIds.set(row.sku, productId);
        }
        stock.set(`${pharmacyId}:${productId}`, {
  pharmacyId, productId, quantity: String(row.quantity), minStock: String(row.minStock),
  abc: row.abc, xyz: row.xyz, updatedAt: new Date(),
});
        const storeProducts = productsByStore.get(pharmacyId) ?? new Set<number>();
        storeProducts.add(productId);
        productsByStore.set(pharmacyId, storeProducts);
      }

      // Every uploaded pharmacy is a complete snapshot. Other pharmacies are untouched.
      for (const [pharmacyId, storeProducts] of productsByStore) {
        await tx.delete(inventory).where(and(
          eq(inventory.pharmacyId, pharmacyId),
          notInArray(inventory.productId, [...storeProducts]),
        ));
      }
      const values = [...stock.values()];
      for (let index = 0; index < values.length; index += 250) {
        await tx.insert(inventory).values(values.slice(index, index + 250)).onConflictDoUpdate({
          target: [inventory.pharmacyId, inventory.productId],
          set: {
            quantity: sql`excluded.quantity`, minStock: sql`excluded.min_stock`,
            abc: sql`excluded.abc`, xyz: sql`excluded.xyz`, updatedAt: new Date(),
          },
        });
      }

      const totalUnits = values.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0);
      const [batch] = await tx.insert(importBatches).values({
        filename: file.name.slice(0, 255), rowsImported: values.length,
        pharmaciesCount: productsByStore.size,
        productsCount: new Set(values.map((item) => item.productId)).size,
        totalUnits: String(totalUnits), fileSize: file.size,
      }).returning({ id: importBatches.id });

      const matrix = new Map<string, { batchId: number; pharmacyId: number; abc: string; xyz: string; positions: number; units: number }>();
      for (const item of values) {
        const key = `${item.pharmacyId}:${item.abc}:${item.xyz}`;
        const cell = matrix.get(key) ?? {
          batchId: batch.id, pharmacyId: item.pharmacyId!, abc: item.abc!, xyz: item.xyz!, positions: 0, units: 0,
        };
        cell.positions += 1;
        cell.units += item.quantity ?? 0;
        matrix.set(key, cell);
      }
      await tx.insert(importMatrix).values([...matrix.values()]);
      return { imported: values.length, pharmacies: productsByStore.size, units: totalUnits };
    });
    return Response.json({ ok: true, ...result, data: await getAppData() });
  } catch (error) {
    if (error instanceof AppError) return Response.json({ error: error.message }, { status: error.status });
    console.error("Excel import failed:", error);
    return Response.json({ error: "Не удалось импортировать файл. Проверьте данные и попробуйте ещё раз." }, { status: 500 });
  }
}
