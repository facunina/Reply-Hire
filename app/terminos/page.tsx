import type { Metadata } from "next";
import Link from "next/link";
import PaginaLegal from "@/components/PaginaLegal";

export const metadata: Metadata = { title: "Términos y condiciones — ReplyHire" };

export default function TerminosPage() {
  return (
    <PaginaLegal titulo="Términos y condiciones" actualizada="16 de noviembre de 2026">
      <p>
        ReplyHire es una plataforma de reclutamiento desarrollada como proyecto académico (Universidad ORT
        Uruguay). Al crear una cuenta o postularte aceptás estos términos.
      </p>

      <h2>Uso de la plataforma</h2>
      <ul>
        <li>La información que cargues (datos y CV) tiene que ser verdadera y tuya.</li>
        <li>Podés postularte una sola vez a cada búsqueda.</li>
        <li>No está permitido subir contenido que intente manipular la evaluación automática.</li>
      </ul>

      <h2>Evaluación con inteligencia artificial</h2>
      <p>
        Tu CV se analiza con IA para comparar tu experiencia con los requisitos del puesto. El resultado es una
        ayuda para el reclutador: la decisión final siempre la toma una persona.
      </p>

      <h2>Datos personales</h2>
      <p>
        El tratamiento de tus datos se describe en la{" "}
        <Link href="/privacidad" className="font-medium text-brand-700 underline">política de privacidad</Link>.
      </p>

      <h2>Disponibilidad</h2>
      <p>
        Al ser un proyecto académico, el servicio se ofrece «tal cual» y puede tener interrupciones o cambios sin
        aviso previo.
      </p>
    </PaginaLegal>
  );
}
