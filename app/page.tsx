import { redirect } from "next/navigation";

// La raíz del sitio es la interfaz pública del postulante.
// El reclutador usa una interfaz separada en /dashboard.
export default function Home() {
  redirect("/postular");
}
