import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "./matrix.css";
import "./onboarding.css";

export const metadata: Metadata = {
  title: "ФармаБаланс — управление запасами аптек",
  description: "Умное перераспределение товаров между аптеками по ABC/XYZ-анализу. Импорт и экспорт Excel, контроль остатков и перемещений.",
  applicationName: "ФармаБаланс",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="ru"><body>{children}</body></html>;
}
