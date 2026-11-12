import { db } from "@/db";
import { inventory, transfers } from "@/db/schema";
import { and, eq, gte, ne, sql } from "drizzle-orm";

export class AppError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AppError("Некорректные данные запроса");
  return value as Record<string, unknown>;
}

function text(value: unknown, field: string, max = 1000): string {
  const result = typeof value === "string" ? value.trim() : "";
  if (result.length > max) throw new AppError(`Поле «${field}» слишком длинное`);
  return result;
}

function positive(value: unknown, field: string): number {
  const number = Number(value);
  if (value === null || value === "" || !Number.isSafeInteger(number) || number < 1 || number > 10000000) {
    throw new AppError(`Укажите корректное значение поля «${field}»`);
  }
  return number;
}

async function reservedQuantity(productId: number, pharmacyId: number, exceptId?: number) {
  const rows = await db.select({ quantity: transfers.quantity }).from(transfers).where(and(
    eq(transfers.productId, productId),
    eq(transfers.fromPharmacyId, pharmacyId),
    eq(transfers.status, "planned"),
    exceptId ? ne(transfers.id, exceptId) : undefined,
  ));
  return rows.reduce((sum, row) => sum + row.quantity, 0);
}

async function completeTransfer(id: number) {
  await db.transaction(async (tx) => {
    const [movement] = await tx.select().from(transfers).where(eq(transfers.id, id)).for("update").limit(1);
    if (!movement) throw new AppError("Перемещение не найдено", 404);
    if (movement.status !== "planned") throw new AppError("Завершить можно только запланированное перемещение");
    const [source] = await tx.update(inventory)
      .set({ quantity: sql`${inventory.quantity} - ${movement.quantity}`, updatedAt: new Date() })
      .where(and(
        eq(inventory.productId, movement.productId),
        eq(inventory.pharmacyId, movement.fromPharmacyId),
        gte(inventory.quantity, movement.quantity),
      ))
      .returning();
    if (!source) throw new AppError("Недостаточно товара в аптеке-отправителе. Проверьте остатки.");

    await tx.insert(inventory).values({
      pharmacyId: movement.toPharmacyId,
      productId: movement.productId,
      quantity: movement.quantity,
      minStock: 0,
      abc: "B",
      xyz: "Y",
    }).onConflictDoUpdate({
      target: [inventory.pharmacyId, inventory.productId],
      set: { quantity: sql`${inventory.quantity} + ${movement.quantity}`, updatedAt: new Date() },
    });
    await tx.update(transfers).set({ status: "completed", completedAt: new Date() }).where(eq(transfers.id, id));
  });
}

export async function performAction(payload: unknown) {
  const input = record(payload);
  const type = input.type;
  const data = input.data === undefined ? {} : record(input.data);
  const id = input.id === undefined ? 0 : positive(input.id, "ID");

  switch (type) {
    case "transfer.create": {
      const productId = positive(data.productId, "Товар");
      const fromPharmacyId = positive(data.fromPharmacyId, "Откуда");
      const toPharmacyId = positive(data.toPharmacyId, "Куда");
      const quantity = positive(data.quantity, "Количество");
      if (fromPharmacyId === toPharmacyId) throw new AppError("Выберите разные аптеки для перемещения");
      const [source] = await db.select().from(inventory).where(and(
        eq(inventory.productId, productId), eq(inventory.pharmacyId, fromPharmacyId),
      )).limit(1);
      if (!source || source.quantity - await reservedQuantity(productId, fromPharmacyId) < quantity) {
        throw new AppError("Свободного остатка недостаточно: часть товара уже запланирована к перемещению");
      }
      await db.insert(transfers).values({
        productId, fromPharmacyId, toPharmacyId, quantity,
        note: text(data.note, "Комментарий"), status: "planned",
      });
      return;
    }
    case "transfer.update": {
      if (data.status === "completed") {
        await completeTransfer(id);
        return;
      }
      const [existing] = await db.select().from(transfers).where(eq(transfers.id, id)).limit(1);
      if (!existing) throw new AppError("Перемещение не найдено", 404);
      if (existing.status !== "planned") throw new AppError("Изменить можно только запланированное перемещение");
      if (data.status === "cancelled") {
        await db.update(transfers).set({ status: "cancelled" }).where(eq(transfers.id, id));
        return;
      }
      const quantity = positive(data.quantity, "Количество");
      const [source] = await db.select().from(inventory).where(and(
        eq(inventory.productId, existing.productId), eq(inventory.pharmacyId, existing.fromPharmacyId),
      )).limit(1);
      if (!source || source.quantity - await reservedQuantity(existing.productId, existing.fromPharmacyId, id) < quantity) {
        throw new AppError("Свободного остатка недостаточно: часть товара уже запланирована к перемещению");
      }
      await db.update(transfers).set({ quantity, note: text(data.note, "Комментарий") }).where(eq(transfers.id, id));
      return;
    }
    case "transfer.delete": {
      const [existing] = await db.select().from(transfers).where(eq(transfers.id, id)).limit(1);
      if (!existing) throw new AppError("Перемещение не найдено", 404);
      if (existing.status === "completed") throw new AppError("Завершённое перемещение нельзя удалить: оно уже изменило остатки");
      await db.delete(transfers).where(eq(transfers.id, id));
      return;
    }
    default:
      throw new AppError("Неизвестное действие");
  }
}
