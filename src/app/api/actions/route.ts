import { AppError, performAction } from "@/lib/actions";
import { getAppData } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload: unknown = await request.json();
    const action = payload && typeof payload === "object" ? (payload as { type?: unknown }).type : undefined;
    if (!["transfer.create", "transfer.update", "transfer.delete"].includes(String(action))) {
      throw new AppError("Аптеки, товары и остатки загружаются только из Excel. Обновите исходный файл и загрузите его повторно.", 403);
    }
    await performAction(payload);
    return Response.json({ ok: true, data: await getAppData() });
  } catch (error) {
    if (error instanceof AppError) return Response.json({ error: error.message }, { status: error.status });
    if (error instanceof SyntaxError) return Response.json({ error: "Некорректный формат запроса" }, { status: 400 });
    const code = (error as { code?: string; cause?: { code?: string } })?.code
      ?? (error as { cause?: { code?: string } })?.cause?.code;
    if (code === "23505") return Response.json({ error: "Такая запись уже существует." }, { status: 409 });
    if (code === "23503") return Response.json({ error: "Связанный товар или аптека не найдены." }, { status: 400 });
    console.error("Action failed:", error);
    return Response.json({ error: "Не удалось сохранить изменения. Попробуйте ещё раз." }, { status: 500 });
  }
}
