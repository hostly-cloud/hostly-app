"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { HostlyButton } from "@/components/ui/hostly";
import { useHostlyCapabilities } from "@/hooks/useHostlyCapabilities";
import {
  HOSTLY_HELP_INTENTS,
  findHostlyHelpIntent,
  shouldShowHostlyHelpAssistant,
  type HostlyHelpIntent,
} from "@/lib/assistant/hostly-help-intents";

const NO_MATCH_MESSAGE =
  "Todavía no tengo una guía segura para esa pregunta. Prueba con impresoras, fotos de productos, importación de carta, TPV, Cocina o reservas.";

export function HostlyHelpAssistant() {
  const { can } = useHostlyCapabilities();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<HostlyHelpIntent | null>(null);
  const [searched, setSearched] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const runQuery = (nextQuery: string) => {
    setQuery(nextQuery);
    setResult(findHostlyHelpIntent(nextQuery, can));
    setSearched(true);
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    runQuery(query);
  };

  const quickIntents = HOSTLY_HELP_INTENTS.filter(
    (intent) => !intent.capability || can(intent.capability),
  ).slice(0, 3);

  if (!shouldShowHostlyHelpAssistant(pathname)) return null;

  return (
    <>
      <HostlyButton
        ref={triggerRef}
        variant="primary"
        size="touch"
        aria-expanded={open}
        aria-controls="hostly-help-panel"
        data-hostly-help-trigger
        onClick={() => setOpen((value) => !value)}
        className="fixed bottom-4 right-4 z-[70] inline-flex min-h-12 items-center gap-2 rounded-full border border-[var(--hostly-navy-deep)] bg-[var(--hostly-navy-deep)] px-4 text-sm font-semibold text-white shadow-[var(--hostly-shadow-card)] hover:bg-[var(--hostly-navy-mid)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--hostly-accent)] sm:bottom-6 sm:right-6"
      >
        <span aria-hidden className="text-base">✦</span>
        <span className="hostly-help-trigger__label">Ayuda</span>
      </HostlyButton>

      {open ? (
        <section
          id="hostly-help-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="hostly-help-title"
          className="fixed inset-x-3 bottom-[76px] z-[69] box-border max-h-[min(72dvh,620px)] overflow-y-auto rounded-[20px] border border-[var(--hostly-line-strong)] bg-white p-4 shadow-[0_24px_70px_rgba(11,31,48,.22)] sm:inset-x-auto sm:bottom-[88px] sm:right-6 sm:w-[390px] sm:p-5"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="hostly-section-label">Asistente Hostly</p>
              <h2 id="hostly-help-title" className="mt-1 text-lg font-semibold text-[var(--hostly-navy-deep)]">
                ¿Qué necesitas hacer?
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-[var(--hostly-ink-muted)]">
                Te explico el camino y te llevo a la pantalla correcta. No ejecuto cambios por ti.
              </p>
            </div>
            <HostlyButton
              variant="icon"
              iconOnlyLabel="Cerrar ayuda"
              onClick={close}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-[var(--hostly-line)] text-xl text-[var(--hostly-ink-muted)] hover:bg-[var(--hostly-ice-50)]"
            >
              ×
            </HostlyButton>
          </div>

          <form onSubmit={onSubmit} className="mt-4 flex gap-2">
            <label htmlFor="hostly-help-query" className="sr-only">Pregunta a Hostly</label>
            <input
              ref={inputRef}
              id="hostly-help-query"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ej.: ¿Cómo enlazo la impresora?"
              className="min-h-12 min-w-0 flex-1 rounded-[14px] border border-[var(--hostly-line-strong)] bg-white px-3 text-sm text-[var(--hostly-ink)] outline-none focus:border-[var(--hostly-accent)] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--hostly-accent)_18%,transparent)]"
            />
            <HostlyButton type="submit" variant="primary" size="touch" className="min-h-12 shrink-0 px-4">
              Preguntar
            </HostlyButton>
          </form>

          {!searched ? (
            <div className="mt-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--hostly-ink-faint)]">
                Preguntas rápidas
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {quickIntents.map((intent) => (
                  <HostlyButton
                    key={intent.id}
                    variant="chip"
                    size="touch"
                    onClick={() => runQuery(intent.keywords[0])}
                    className="min-h-11 rounded-full border border-[var(--hostly-line)] bg-[var(--hostly-ice-50)] px-3 text-left text-xs font-semibold text-[var(--hostly-navy-deep)] hover:border-[var(--hostly-accent)]"
                  >
                    {intent.title}
                  </HostlyButton>
                ))}
              </div>
            </div>
          ) : null}

          {searched ? (
            <div aria-live="polite" className="mt-4 rounded-[16px] border border-[var(--hostly-line)] bg-[var(--hostly-ice-50)] p-4">
              {result ? (
                <>
                  <p className="text-sm font-semibold text-[var(--hostly-navy-deep)]">{result.title}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-[var(--hostly-ink-muted)]">{result.answer}</p>
                  <Link href={result.href} onClick={() => setOpen(false)} className="hostly-button-primary mt-4 inline-flex min-h-11 items-center no-underline">
                    {result.actionLabel}
                  </Link>
                </>
              ) : (
                <p className="text-sm leading-relaxed text-[var(--hostly-ink-muted)]">{NO_MATCH_MESSAGE}</p>
              )}
            </div>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
