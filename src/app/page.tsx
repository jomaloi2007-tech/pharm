import Dashboard from "@/components/dashboard";
import { getAppData } from "@/lib/data";
import type { View } from "@/lib/types";

export const dynamic = "force-dynamic";

const views: View[] = ["overview", "matrix", "recommendations", "inventory", "transfers", "pharmacies", "products", "import"];

export default async function HomePage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const params = await searchParams;
  const initialView = views.includes(params.view as View) ? params.view as View : "overview";
  const initialData = await getAppData();
  return <Dashboard initialData={initialData} initialView={initialView} />;
}
