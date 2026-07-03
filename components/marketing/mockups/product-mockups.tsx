"use client";

import { useState } from "react";
import {
  BarChart3,
  CalendarDays,
  ChefHat,
  LayoutGrid,
  Receipt,
  Smartphone,
  TrendingUp,
  Users,
} from "lucide-react";

function MockupChrome({ title }: { title: string }) {
  return (
    <div className="marketing-mockup-chrome">
      <span className="marketing-mockup-dot" />
      <span className="marketing-mockup-dot" />
      <span className="marketing-mockup-dot" />
      <span className="ml-2 text-[11px] font-medium tracking-wide text-[color:var(--hostly-ink-faint)]">{title}</span>
    </div>
  );
}

function AnalyticsPanel() {
  return (
    <div className="grid gap-4 p-5 md:grid-cols-[180px_1fr]">
      <div className="space-y-2">
        {["Resumen", "Ventas", "Productos", "Equipo"].map((item, i) => (
          <div
            key={item}
            className={`rounded-xl px-3 py-2 text-[12px] font-medium ${
              i === 0
                ? "bg-[color:var(--hostly-accent-soft)] text-[color:var(--hostly-navy-deep)]"
                : "text-[color:var(--hostly-ink-muted)]"
            }`}
          >
            {item}
          </div>
        ))}
      </div>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { label: "Ventas hoy", value: "€4.820", delta: "+12%" },
            { label: "Ticket medio", value: "€38,40", delta: "+4%" },
            { label: "Margen", value: "61,2%", delta: "+2,1pp" },
          ].map((kpi) => (
            <div key={kpi.label} className="rounded-xl border border-[color:var(--hostly-table-divider-soft)] bg-white p-3">
              <div className="text-[10px] uppercase tracking-[0.08em] text-[color:var(--hostly-ink-faint)]">{kpi.label}</div>
              <div className="mt-1 text-lg font-semibold tracking-tight">{kpi.value}</div>
              <div className="mt-1 text-[11px] font-semibold text-emerald-700">{kpi.delta}</div>
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-[color:var(--hostly-table-divider-soft)] bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[12px] font-semibold">Ventas por franja</span>
            <TrendingUp className="size-4 text-[color:var(--hostly-accent)]" />
          </div>
          <div className="flex h-28 items-end gap-2">
            {[38, 52, 44, 68, 82, 74, 58, 46].map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-md bg-[color:var(--hostly-accent-soft)]"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TpvPanel() {
  return (
    <div className="grid gap-4 p-5 lg:grid-cols-[1fr_220px]">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {["Bruschetta", "Pasta tartufo", "Salmón", "Tarta queso", "Vino tinto", "Agua"].map((item, i) => (
          <button
            key={item}
            type="button"
            className={`rounded-xl border px-3 py-3 text-left text-[12px] font-medium ${
              i === 1
                ? "border-[color:var(--hostly-accent)] bg-[color:var(--hostly-accent-soft)]"
                : "border-[color:var(--hostly-table-divider-soft)] bg-white"
            }`}
          >
            <div>{item}</div>
            <div className="mt-1 text-[11px] text-[color:var(--hostly-ink-muted)]">€{(12 + i * 3).toFixed(2)}</div>
          </button>
        ))}
      </div>
      <div className="rounded-xl border border-[color:var(--hostly-table-divider-soft)] bg-white p-4">
        <div className="text-[11px] uppercase tracking-[0.08em] text-[color:var(--hostly-ink-faint)]">Mesa 12 · 4 pax</div>
        <div className="mt-3 space-y-2 text-[12px]">
          <div className="flex justify-between"><span>Pasta tartufo</span><span>€18,00</span></div>
          <div className="flex justify-between"><span>Vino tinto</span><span>€24,00</span></div>
        </div>
        <div className="mt-4 border-t border-[color:var(--hostly-table-divider-soft)] pt-3 flex justify-between font-semibold">
          <span>Total</span><span>€42,00</span>
        </div>
        <div className="mt-3 rounded-xl bg-[color:var(--hostly-navy-deep)] py-2 text-center text-[12px] font-semibold text-white">
          Cobrar
        </div>
      </div>
    </div>
  );
}

function KdsPanel() {
  const tickets = [
    { table: "Mesa 8", items: "2× Bruschetta · 1× Salmón", time: "04:12", tone: "warning" },
    { table: "Barra 2", items: "3× Gin tonic · 1× Tarta", time: "01:48", tone: "ok" },
    { table: "Mesa 14", items: "1× Entrecot · 2× Guarnición", time: "07:03", tone: "danger" },
  ] as const;

  return (
    <div className="grid gap-3 p-5 md:grid-cols-3">
      {tickets.map((ticket) => (
        <div key={ticket.table} className="rounded-xl border border-[color:var(--hostly-table-divider-soft)] bg-white p-4">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold">{ticket.table}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                ticket.tone === "danger"
                  ? "bg-red-50 text-red-700"
                  : ticket.tone === "warning"
                    ? "bg-amber-50 text-amber-700"
                    : "bg-emerald-50 text-emerald-700"
              }`}
            >
              {ticket.time}
            </span>
          </div>
          <p className="mt-3 text-[12px] leading-relaxed text-[color:var(--hostly-ink-muted)]">{ticket.items}</p>
        </div>
      ))}
    </div>
  );
}

function FloorMapPanel() {
  return (
    <div className="p-5">
      <div className="mb-4 flex flex-wrap gap-2">
        {["Salón", "Terraza", "Barra"].map((zone, i) => (
          <span
            key={zone}
            className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
              i === 0 ? "bg-[color:var(--hostly-accent-soft)] text-[color:var(--hostly-navy-deep)]" : "bg-white border border-[color:var(--hostly-table-divider-soft)] text-[color:var(--hostly-ink-muted)]"
            }`}
          >
            {zone}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-3 rounded-xl border border-[color:var(--hostly-table-divider-soft)] bg-white p-4">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className={`flex aspect-square items-center justify-center rounded-xl border text-[11px] font-semibold ${
              i % 4 === 0
                ? "border-[color:var(--hostly-accent)] bg-[color:var(--hostly-accent-soft)]"
                : i % 3 === 0
                  ? "border-amber-200 bg-amber-50 text-amber-800"
                  : "border-[color:var(--hostly-table-divider-soft)] bg-[color:var(--hostly-ice-50)] text-[color:var(--hostly-ink-muted)]"
            }`}
          >
            M{i + 1}
          </div>
        ))}
      </div>
    </div>
  );
}

const heroTabs = [
  { id: "analytics", label: "Operación", icon: BarChart3, panel: AnalyticsPanel },
  { id: "tpv", label: "TPV", icon: Receipt, panel: TpvPanel },
  { id: "kds", label: "Cocina", icon: ChefHat, panel: KdsPanel },
  { id: "mesas", label: "Mapa visual", icon: LayoutGrid, panel: FloorMapPanel },
] as const;

export function HeroProductMockup() {
  const [active, setActive] = useState<(typeof heroTabs)[number]["id"]>("analytics");
  const current = heroTabs.find((tab) => tab.id === active) ?? heroTabs[0];
  const Panel = current.panel;

  return (
    <div className="marketing-mockup-shell marketing-rise marketing-rise-delay-2">
      <MockupChrome title="Hostly · Sistema visual" />
      <div className="border-b border-[color:var(--hostly-table-divider-soft)] bg-white/80 px-4 py-3">
        <div className="flex flex-wrap gap-2">
          {heroTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = tab.id === active;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActive(tab.id)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                  isActive
                    ? "bg-[color:var(--hostly-navy-deep)] text-white"
                    : "bg-[color:var(--hostly-ice-50)] text-[color:var(--hostly-ink-muted)] hover:text-[color:var(--hostly-ink-strong)]"
                }`}
              >
                <Icon className="size-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
      <Panel />
    </div>
  );
}

const desktopShowcase = [
  { id: "analytics", label: "Operación", icon: BarChart3, panel: AnalyticsPanel },
  { id: "tpv", label: "TPV táctil", icon: Receipt, panel: TpvPanel },
  { id: "kds", label: "Cocina / Barra", icon: ChefHat, panel: KdsPanel },
  { id: "mesas", label: "Mapa visual", icon: LayoutGrid, panel: FloorMapPanel },
] as const;

function MobileWaiterMock() {
  return (
    <div className="space-y-3 p-4">
      <div className="rounded-xl bg-[color:var(--hostly-navy-deep)] px-3 py-2 text-[11px] font-semibold text-white">Mesa 7 · Servicio activo</div>
      {["Entrante listo", "Bebidas pendientes", "Postre sugerido"].map((line, i) => (
        <div key={line} className="rounded-xl border border-[color:var(--hostly-table-divider-soft)] bg-white px-3 py-2 text-[11px]">
          <div className="font-semibold">{line}</div>
          <div className="mt-1 text-[color:var(--hostly-ink-muted)]">{i === 0 ? "Enviar aviso cocina" : "Añadir al pedido"}</div>
        </div>
      ))}
    </div>
  );
}

function MobileOrdersMock() {
  return (
    <div className="space-y-2 p-4">
      {["Bruschetta ×2", "Salmón marinado", "Agua sin gas"].map((item, i) => (
        <div key={item} className="flex items-center justify-between rounded-xl border border-[color:var(--hostly-table-divider-soft)] bg-white px-3 py-2 text-[11px]">
          <span>{item}</span>
          <span className={i === 1 ? "text-amber-700" : "text-emerald-700"}>{i === 1 ? "En cocina" : "Servido"}</span>
        </div>
      ))}
    </div>
  );
}

function MobileReservationsMock() {
  return (
    <div className="space-y-2 p-4">
      {[
        { time: "M12", name: "Salón", pax: "4 pax" },
        { time: "M7", name: "Terraza", pax: "Cuenta" },
        { time: "B2", name: "Barra", pax: "Activo" },
      ].map((row) => (
        <div key={row.time} className="grid grid-cols-[52px_1fr_auto] items-center gap-2 rounded-xl border border-[color:var(--hostly-table-divider-soft)] bg-white px-3 py-2 text-[11px]">
          <span className="font-semibold">{row.time}</span>
          <span>{row.name}</span>
          <span className="text-[color:var(--hostly-ink-muted)]">{row.pax}</span>
        </div>
      ))}
    </div>
  );
}

function MobileMetricsMock() {
  return (
    <div className="grid grid-cols-2 gap-2 p-4">
      {[
        { label: "Cobros", value: "€1.240" },
        { label: "Mesas", value: "18/24" },
        { label: "Ticket", value: "€41" },
        { label: "Tiempo", value: "42m" },
      ].map((item) => (
        <div key={item.label} className="rounded-xl border border-[color:var(--hostly-table-divider-soft)] bg-white p-3">
          <div className="text-[10px] uppercase tracking-[0.08em] text-[color:var(--hostly-ink-faint)]">{item.label}</div>
          <div className="mt-1 text-sm font-semibold">{item.value}</div>
        </div>
      ))}
    </div>
  );
}

const mobileShowcase = [
  { id: "waiter", label: "Camarero", icon: Users, panel: MobileWaiterMock },
  { id: "orders", label: "Comandas", icon: Receipt, panel: MobileOrdersMock },
  { id: "reservas", label: "Mesas", icon: CalendarDays, panel: MobileReservationsMock },
  { id: "metrics", label: "Métricas", icon: BarChart3, panel: MobileMetricsMock },
] as const;

export function ProductShowcaseMockups() {
  const [desktopTab, setDesktopTab] = useState<(typeof desktopShowcase)[number]["id"]>("analytics");
  const [mobileTab, setMobileTab] = useState<(typeof mobileShowcase)[number]["id"]>("waiter");

  const DesktopPanel = (desktopShowcase.find((t) => t.id === desktopTab) ?? desktopShowcase[0]).panel;
  const MobilePanel = (mobileShowcase.find((t) => t.id === mobileTab) ?? mobileShowcase[0]).panel;

  return (
    <div className="grid gap-8 xl:grid-cols-[1.35fr_0.65fr]">
      <div className="marketing-mockup-shell">
        <MockupChrome title="Hostly Desktop" />
        <div className="border-b border-[color:var(--hostly-table-divider-soft)] px-4 py-3">
          <div className="flex flex-wrap gap-2">
            {desktopShowcase.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setDesktopTab(tab.id)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                    desktopTab === tab.id
                      ? "bg-[color:var(--hostly-accent-soft)] text-[color:var(--hostly-navy-deep)]"
                      : "text-[color:var(--hostly-ink-muted)] hover:bg-white"
                  }`}
                >
                  <Icon className="size-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
        <DesktopPanel />
      </div>

      <div className="mx-auto w-full max-w-[320px]">
        <div className="rounded-[28px] border border-[color:var(--hostly-line-strong)] bg-[color:var(--hostly-navy-deep)] p-2 shadow-[var(--hostly-shadow-float)]">
          <div className="rounded-[22px] border border-white/10 bg-[color:var(--hostly-ice-50)] overflow-hidden">
            <div className="flex items-center justify-between border-b border-[color:var(--hostly-table-divider-soft)] bg-white px-4 py-2">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[color:var(--hostly-ink-strong)]">
                <Smartphone className="size-3.5 text-[color:var(--hostly-accent)]" />
                Hostly Mobile
              </div>
              <span className="text-[10px] text-[color:var(--hostly-ink-faint)]">Operativa</span>
            </div>
            <div className="border-b border-[color:var(--hostly-table-divider-soft)] bg-white px-2 py-2">
              <div className="grid grid-cols-2 gap-1">
                {mobileShowcase.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setMobileTab(tab.id)}
                    className={`rounded-lg px-2 py-1.5 text-[10px] font-semibold ${
                      mobileTab === tab.id
                        ? "bg-[color:var(--hostly-navy-deep)] text-white"
                        : "bg-[color:var(--hostly-ice-50)] text-[color:var(--hostly-ink-muted)]"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
            <MobilePanel />
          </div>
        </div>
      </div>
    </div>
  );
}

export function AiVisualMockup() {
  return (
    <div className="marketing-mockup-shell">
      <MockupChrome title="Hostly IA · Carta asistida" />
      <div className="grid gap-4 p-5 lg:grid-cols-[220px_1fr]">
        <div className="rounded-xl border border-dashed border-[color:var(--hostly-accent)] bg-[color:var(--hostly-accent-soft)] p-4 text-center">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--hostly-navy-deep)]">Foto de carta</div>
          <div className="mt-3 rounded-lg bg-white/80 px-3 py-6 text-[11px] text-[color:var(--hostly-ink-muted)]">Arrastra o sube tu carta</div>
        </div>
        <div className="space-y-2">
          {[
            { name: "Bruschetta tomate & albahaca", cat: "Entrantes", price: "€9,50", conf: "98%" },
            { name: "Vitello tonnato", cat: "Entrantes", price: "€14,00", conf: "96%" },
            { name: "Salmón marinado", cat: "Principales", price: "€22,00", conf: "94%" },
          ].map((row) => (
            <div key={row.name} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-xl border border-[color:var(--hostly-table-divider-soft)] bg-white px-3 py-2 text-[11px]">
              <div>
                <div className="font-semibold">{row.name}</div>
                <div className="text-[color:var(--hostly-ink-muted)]">{row.cat}</div>
              </div>
              <span className="font-semibold">{row.price}</span>
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">{row.conf}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
