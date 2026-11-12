import { getAppData } from "@/lib/data";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await getAppData(), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Failed to load app data:", error);
    return Response.json({ error: "Не удалось загрузить данные. Попробуйте обновить страницу." }, { status: 500 });
  }
}
