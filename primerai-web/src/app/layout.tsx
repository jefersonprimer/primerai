import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PrimerAI — sua IA, em todos os seus dispositivos",
  description: "Entre na sua conta PrimerAI ou baixe os apps para celular e desktop.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
