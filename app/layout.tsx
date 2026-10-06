import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ReplyHire",
  description: "Procesos de selección inteligentes con IA",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // suppressHydrationWarning: algunas extensiones del navegador (autorrelleno
  // de formularios, gestores de contraseñas, Dark Reader, etc.) inyectan
  // atributos en <html>/<body>/<input> antes de que React hidrate, lo que
  // dispara un "Hydration failed". Suprimirlo en la raíz evita el falso error
  // sin afectar el comportamiento de la app.
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body suppressHydrationWarning className="min-h-full flex flex-col">
        {children}
      </body>
    </html>
  );
}
