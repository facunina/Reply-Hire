import type { Metadata } from "next";
import Link from "next/link";
import PaginaLegal from "@/components/PaginaLegal";
import { CV_MAX_MB } from "@/lib/reglas";

export const metadata: Metadata = { title: "Política de privacidad — ReplyHire" };

/** Política de privacidad (Ley 18.331 de Protección de Datos Personales, Uruguay). */
export default function PrivacidadPage() {
  return (
    <PaginaLegal titulo="Política de privacidad" actualizada="16 de noviembre de 2026">
      <p>
        ReplyHire es una plataforma de reclutamiento desarrollada como proyecto académico (Universidad ORT
        Uruguay). Esta política explica qué datos personales tratamos, para qué y cuáles son tus derechos, de
        acuerdo con la Ley N.º 18.331 de Protección de Datos Personales.
      </p>

      <h2>Qué datos recolectamos</h2>
      <ul>
        <li>Datos de tu cuenta: nombre, email y teléfono.</li>
        <li>Tu CV en PDF (hasta {CV_MAX_MB} MB) y el texto que contiene.</li>
        <li>El mensaje opcional que le dejás al reclutador.</li>
        <li>Las búsquedas a las que te postulaste, su estado y las búsquedas que guardaste.</li>
      </ul>

      <h2>Para qué los usamos</h2>
      <ul>
        <li>Gestionar tu postulación y comunicarte su resultado por email.</li>
        <li>
          Analizar tu CV con inteligencia artificial para comparar tu experiencia con los requisitos del puesto.
          La IA <strong>asiste</strong> al reclutador pero <strong>no decide</strong>: toda decisión la toma una
          persona.
        </li>
        <li>Coordinar entrevistas (por ejemplo, enviarte una invitación de calendario).</li>
      </ul>
      <p>
        La evaluación considera únicamente competencias profesionales. Nunca se tienen en cuenta sexo, género,
        etnia, nacionalidad, edad, estado civil, religión, salud ni apariencia.
      </p>

      <h2>Con quién se comparten</h2>
      <p>No vendemos ni cedemos tus datos. Usamos estos proveedores para operar el servicio:</p>
      <ul>
        <li>Supabase: base de datos, cuentas y almacenamiento de los CVs.</li>
        <li>Vercel: alojamiento de la aplicación.</li>
        <li>Google (Gemini): análisis del CV con IA.</li>
        <li>Resend: envío de emails.</li>
        <li>Google Calendar: invitaciones a entrevistas.</li>
      </ul>
      <p>
        Mientras el proyecto use el plan gratuito de Gemini, Google puede utilizar el contenido enviado para
        mejorar sus servicios. Antes de un uso real con candidatos se pasaría a un plan pago, donde esto no ocurre.
      </p>

      <h2>Cómo los protegemos</h2>
      <ul>
        <li>Los CVs se guardan en un almacenamiento privado; solo el equipo de selección puede abrirlos, con un link que vence en 5 minutos.</li>
        <li>La base de datos no es accesible desde el navegador: solo el servidor accede a ella.</li>
        <li>Las contraseñas las gestiona Supabase de forma cifrada; ReplyHire nunca las ve.</li>
        <li>Se hace un respaldo cifrado diario que se conserva 30 días.</li>
      </ul>

      <h2>Cuánto tiempo los guardamos</h2>
      <p>
        Mientras exista tu cuenta o sea necesario para el proceso de selección. Podés pedir que se eliminen en
        cualquier momento.
      </p>

      <h2>Tus derechos</h2>
      <p>
        Tenés derecho a acceder, rectificar, actualizar y suprimir tus datos. Podés ver y editar tus datos y tus
        postulaciones desde <Link href="/mi-cuenta" className="font-medium text-brand-700 underline">Mi cuenta</Link>,
        y pedir la eliminación al equipo de ReplyHire. También podés presentar un reclamo ante la Unidad Reguladora
        y de Control de Datos Personales (URCDP).
      </p>
    </PaginaLegal>
  );
}
