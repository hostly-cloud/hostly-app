"use client";

import { useState, type FormEvent } from "react";

export function MarketingLeadForm() {
  const [state, setState] = useState<"idle" | "sending" | "success" | "error">("idle");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "sending") return;

    const form = event.currentTarget;
    const data = new FormData(form);
    const params = new URLSearchParams(window.location.search);

    setState("sending");
    try {
      const response = await fetch("/api/marketing/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: data.get("name"),
          email: data.get("email"),
          business: data.get("business"),
          city: data.get("city"),
          businessType: data.get("businessType"),
          website: data.get("website"),
          consent: data.get("consent") === "on",
          utmSource: params.get("utm_source") ?? "",
          utmMedium: params.get("utm_medium") ?? "",
          utmCampaign: params.get("utm_campaign") ?? "",
          utmContent: params.get("utm_content") ?? "",
          utmTerm: params.get("utm_term") ?? "",
        }),
      });

      if (!response.ok) throw new Error("lead request failed");

      window.gtag?.("event", "generate_lead", {
        placement: "early_access_form",
      });
      window.fbq?.("track", "Lead");
      form.reset();
      setState("success");
    } catch {
      setState("error");
    }
  }

  return (
    <form onSubmit={submit} className="mt-8 grid gap-3 md:grid-cols-2" aria-label="Solicitar acceso anticipado">
      <input
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
      />
      <label className="grid gap-1.5 text-xs font-medium text-white/75">
        Tu nombre
        <input
          required
          name="name"
          autoComplete="name"
          maxLength={100}
          className="min-h-11 rounded-xl border border-white/20 bg-white/10 px-3 text-sm text-white outline-none placeholder:text-white/40 focus:border-white/50"
          placeholder="Nombre"
        />
      </label>
      <label className="grid gap-1.5 text-xs font-medium text-white/75">
        Email de trabajo
        <input
          required
          type="email"
          name="email"
          autoComplete="email"
          maxLength={180}
          className="min-h-11 rounded-xl border border-white/20 bg-white/10 px-3 text-sm text-white outline-none placeholder:text-white/40 focus:border-white/50"
          placeholder="tu@restaurante.com"
        />
      </label>
      <label className="grid gap-1.5 text-xs font-medium text-white/75">
        Restaurante o negocio
        <input
          required
          name="business"
          autoComplete="organization"
          maxLength={140}
          className="min-h-11 rounded-xl border border-white/20 bg-white/10 px-3 text-sm text-white outline-none placeholder:text-white/40 focus:border-white/50"
          placeholder="Nombre del negocio"
        />
      </label>
      <label className="grid gap-1.5 text-xs font-medium text-white/75">
        Ciudad
        <input
          name="city"
          autoComplete="address-level2"
          maxLength={100}
          className="min-h-11 rounded-xl border border-white/20 bg-white/10 px-3 text-sm text-white outline-none placeholder:text-white/40 focus:border-white/50"
          placeholder="Madrid, Ibiza, Valencia…"
        />
      </label>
      <label className="grid gap-1.5 text-xs font-medium text-white/75 md:col-span-2">
        Tipo de negocio
        <select
          name="businessType"
          defaultValue="restaurant"
          className="min-h-11 rounded-xl border border-white/20 bg-[color:var(--hostly-navy-deep)] px-3 text-sm text-white outline-none focus:border-white/50"
        >
          <option value="restaurant">Restaurante</option>
          <option value="bar_cafe">Bar / cafetería</option>
          <option value="terrace_beach_club">Terraza / beach club</option>
          <option value="group">Grupo de restauración</option>
          <option value="other">Otro negocio de hostelería</option>
        </select>
      </label>
      <label className="flex items-start gap-2 text-xs leading-5 text-white/65 md:col-span-2">
        <input required type="checkbox" name="consent" className="mt-1" />
        <span>Acepto que Hostly use estos datos para contactar conmigo sobre una demo o acceso anticipado. No se usarán para operar datos del restaurante.</span>
      </label>
      <div className="md:col-span-2">
        <button
          type="submit"
          disabled={state === "sending" || state === "success"}
          className="inline-flex min-h-[46px] items-center justify-center rounded-[14px] border border-white bg-white px-5 py-3 text-sm font-semibold text-[color:var(--hostly-navy-deep)] transition hover:bg-[color:var(--hostly-ice-50)] disabled:cursor-not-allowed disabled:opacity-65"
        >
          {state === "sending" ? "Enviando…" : state === "success" ? "Solicitud recibida" : "Solicitar acceso anticipado"}
        </button>
        {state === "success" ? (
          <p className="mt-3 text-sm text-white/80" role="status">Perfecto. Hemos guardado tu solicitud y podremos contactarte cuando abramos las primeras demos.</p>
        ) : null}
        {state === "error" ? (
          <p className="mt-3 text-sm text-white/80" role="alert">No hemos podido guardar la solicitud. Puedes escribirnos directamente a hola@hostlyapp.app.</p>
        ) : null}
      </div>
    </form>
  );
}
