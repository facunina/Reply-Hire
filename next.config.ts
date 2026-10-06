import type { NextConfig } from "next";
import fs from "fs";
import path from "path";

// Forzar la carga de .env.local antes de que arranque el servidor, para que
// ANTHROPIC_API_KEY no sea sobreescrita por una variable de entorno vacía
// heredada del proceso padre (p. ej. Claude Code inyecta ANTHROPIC_API_KEY="").
const envLocalPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envLocalPath)) {
  const lines = fs.readFileSync(envLocalPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim();
    if (key && val) process.env[key] = val;
  }
}

const nextConfig: NextConfig = {
  // Excluir de Turbopack estos paquetes CJS para que no rompan el bundling.
  serverExternalPackages: ["pdf-parse", "@anthropic-ai/sdk"],
};

export default nextConfig;
