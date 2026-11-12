import { getAppData } from "@/lib/data";
import { makeExcel } from "@/lib/excel";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const template = new URL(request.url).searchParams.get("template") === "1";
    const data = template ? null : await getAppData();
    const buffer = await makeExcel(data, template);
    const name = template ? "Шаблон_остатков.xlsx" : "ФармаБаланс_остатки.xlsx";
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${template ? "stock-template.xlsx" : "pharmabalance-stock.xlsx"}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Content-Length": String(buffer.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Excel export failed:", error);
    return Response.json({ error: "Не удалось подготовить Excel-файл" }, { status: 500 });
  }
}
