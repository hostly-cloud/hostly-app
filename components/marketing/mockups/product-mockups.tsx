"use client";

import { useState } from "react";
import {
  BarChart3,
  CalendarDays,
  ChefHat,
  CreditCard,
  LayoutGrid,
  Receipt,
  Smartphone,
  Timer,
  Users,
  UtensilsCrossed,
} from "lucide-react";

function MockupChrome({ title }: { title: string }) {
  return (
    <div className="marketing-mockup-chrome">
      <span className="marketing-mockup-dot" />
      <span className="marketing-mockup-dot" />
      <span className="marketing-mockup-dot" />
      <span className="ml-2 min-w-0 truncate text-[11px] font-medium tracking-wide text-[color:var(--hostly-ink-faint)]">{title}</span>
    </div>
  );
}

function StatusPill({ children, tone = "neutral" }: { children: string; tone?: "neutral" | "ok" | "warning" | "danger" }) {
  const toneClass =
    tone === "ok"
      ? "bg-emerald-50 text-emerald-700"
      : tone === "warning"
        ? "bg-amber-50 text-amber-700"
        : tone === "danger"
          ? "bg-red-50 text-red-700"
          : "bg-[color:var(--hostly-ice-50)] text-[color:var(--hostly-ink-muted)]";

  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${toneClass}`}>{children}</span>;
}

function OrderSummary() {
  return (
    <div className="rounded-[16px] border border-[color:var(--hostly-table-divider-soft)] bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--hostly-ink-faint)]">Mesa 12 · 4 pax</div>
          <div className="mt-1 truncate text-[15px] font-semibold tracking-normal">Cuenta activa</div>
        </div>
        <StatusPill tone="ok">En servicio</StatusPill>
      </div>

      <div className="mt-4 space-y-2 text-[12px]">
        {[
          ["2× Ensaladilla", "18,00 €"],
          ["1× Arroz meloso", "22,50 €"],
          ["2× Verdejo copa", "9,00 €"],
        ].map(([name, price]) => (
          <div key={name} className="flex items-center justify-between gap-3">
            <span className="min-w-0 truncate text-[color:var(--hostly-ink-muted)]">{name}</span>
            <span className="shrink-0 font-semibold">{price}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-[color:var(--hostly-table-divider-soft)] pt-3 text-[14px] font-semibold">
        <span>Total</span>
        <span>49,50 €</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-[color:var(--hostly-table-divider-soft)] py-2 text-center text-[11px] font-semibold text-[color:var(--hostly-ink-muted)]">
          Dividir
        </div>
        <div className="rounded-xl bg-[color:var(--hostly-navy-deep)] py-2 text-center text-[11px] font-semibold text-white">
          Cobrar
        </div>
      </div>
    </div>
  );
}

function ProductTiles() {
  const items = [
    ["Bravas", "7,50 €"],
    ["Tartar atún", "16,00 €"],
    ["Burger", "14,50 €"],
    ["Arroz meloso", "22,50 €"],
    ["Tarta queso", "6,50 €"],
    ["Verdejo copa", "4,50 €"],
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {items.map(([item, price], i) => (
        <button
          key={item}
          type="button"
          className={`min-h-[68px] rounded-xl border px-3 py-3 text-left text-[12px] font-semibold transition-colors ${
            i === 3
              ? "border-[color:var(--hostly-accent)] bg-[color:var(--hostly-accent-soft)] text-[color:var(--hostly-navy-deep)]"
              : "border-[color:var(--hostly-table-divider-soft)] bg-white text-[color:var(--hostly-ink-strong)]"
          }`}
        >
          <span className="block truncate">{item}</span>
          <span className="mt-1 block text-[11px] font-medium text-[color:var(--hostly-ink-muted)]">{price}</span>
        </button>
      ))}
    </div>
  );
}

function MiniFloorMap() {
  const tables = [
    { id: "M1", tone: "ok" },
    { id: "M2", tone: "neutral" },
    { id: "M3", tone: "warning" },
    { id: "M4", tone: "neutral" },
    { id: "M5", tone: "danger" },
    { id: "M6", tone: "ok" },
    { id: "M7", tone: "neutral" },
    { id: "M8", tone: "warning" },
  ] as const;

  return (
    <div className="rounded-[16px] border border-[color:var(--hostly-table-divider-soft)] bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-[12px] font-semibold">Plano de sala</span>
        <StatusPill>Terraza</StatusPill>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {tables.map((table) => {
          const tone =
            table.tone === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : table.tone === "warning"
                ? "border-amber-200 bg-amber-50 text-amber-800"
                : table.tone === "danger"
                  ? "border-red-200 bg-red-50 text-red-700"
                  : "border-[color:var(--hostly-table-divider-soft)] bg-[color:var(--hostly-ice-50)] text-[color:var(--hostly-ink-muted)]";

          return (
            <div key={table.id} className={`flex aspect-square items-center justify-center rounded-xl border text-[11px] font-semibold ${tone}`}>
              {table.id}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function KdsQueue() {
  const tickets = [
    { place: "Mesa 8", lines: "2× Burger · 1× Bravas", time: "04:12", tone: "warning" },
    { place: "Barra 2", lines: "3× Gin tonic", time: "01:48", tone: "ok" },
    { place: "Mesa 14", lines: "1× Arroz · 2× Guarnición", time: "07:03", tone: "danger" },
  ] as const;

  return (
    <div className="rounded-[16px] border border-[color:var(--hostly-table-divider-soft)] bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-[12px] font-semibold">KDS cocina / barra</span>
        <ChefHat className="size-4 text-[color:var(--hostly-accent)]" />
      </div>
      <div className="space-y-2">
        {tickets.map((ticket) => (
          <div key={ticket.place} className="rounded-xl border border-[color:var(--hostly-table-divider-soft)] bg-[color:var(--hostly-surface-page-soft)] px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold">{ticket.place}</span>
              <StatusPill tone={ticket.tone}>{ticket.time}</StatusPill>
            </div>
            <p className="mt-1 truncate text-[11px] text-[color:var(--hostly-ink-muted)]">{ticket.lines}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ServicePanel() {
  return (
    <div className="grid gap-4 p-4 lg:grid-cols-[1fr_0.85fr]">
      <div className="space-y-4">
        <div className="rounded-[16px] border border-[color:var(--hostly-table-divider-soft)] bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--hostly-ink-faint)]">TPV táctil</div>
              <div className="mt-1 text-[15px] font-semibold tracking-normal">Añadir a Mesa 12</div>
            </div>
            <StatusPill tone="ok">Servicio activo</StatusPill>
          </div>
          <ProductTiles />
        </div>
        <KdsQueue />
      </div>

      <div className="space-y-4">
        <MiniFloorMap />
        <OrderSummary />
      </div>
    </div>
  );
}

function TpvPanel() {
  return (
    <div className="grid gap-4 p-4 lg:grid-cols-[1fr_260px]">
      <div className="rounded-[16px] border border-[color:var(--hostly-table-divider-soft)] bg-white p-4">
        <div className="mb-3 flex flex-wrap gap-2">
          {["Entrantes", "Principales", "Bebidas", "Postres"].map((category, i) => (
            <span
              key={category}
              className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                i === 1 ? "bg-[color:var(--hostly-navy-deep)] text-white" : "bg-[color:var(--hostly-ice-50)] text-[color:var(--hostly-ink-muted)]"
              }`}
            >
              {category}
            </span>
          ))}
        </div>
        <ProductTiles />
      </div>
      <OrderSummary />
    </div>
  );
}

function FloorMapPanel() {
  return (
    <div className="grid gap-4 p-4 lg:grid-cols-[0.8fr_1.2fr]">
      <div className="space-y-3 rounded-[16px] border border-[color:var(--hostly-table-divider-soft)] bg-white p-4">
        <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--hostly-ink-faint)]">Espacios</div>
        {["Salón principal", "Terraza", "Barra"].map((space, i) => (
          <div
            key={space}
            className={`rounded-xl px-3 py-2 text-[12px] font-semibold ${
              i === 1 ? "bg-[color:var(--hostly-accent-soft)] text-[color:var(--hostly-navy-deep)]" : "bg-[color:var(--hostly-ice-50)] text-[color:var(--hostly-ink-muted)]"
            }`}
          >
            {space}
          </div>
        ))}
      </div>
      <MiniFloorMap />
    </div>
  );
}

function AnalyticsPanel() {
  return (
    <div className="grid gap-4 p-4 md:grid-cols-3">
      {[
        { label: "Ventas hoy", value: "4.820 €", delta: "+12%" },
        { label: "Mesas activas", value: "18/24", delta: "Sala" },
        { label: "Ticket medio", value: "38,40 €", delta: "+4%" },
      ].map((kpi) => (
        <div key={kpi.label} className="rounded-[16px] border border-[color:var(--hostly-table-divider-soft)] bg-white p-4">
          <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[color:var(--hostly-ink-faint)]">{kpi.label}</div>
          <div className="mt-2 text-2xl font-semibold tracking-normal text-[color:var(--hostly-ink-strong)]">{kpi.value}</div>
          <div className="mt-2 text-[11px] font-semibold text-emerald-700">{kpi.delta}</div>
        </div>
      ))}
      <div className="rounded-[16px] border border-[color:var(--hostly-table-divider-soft)] bg-white p-4 md:col-span-3">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-[12px] font-semibold">Ritmo del servicio</span>
          <Timer className="size-4 text-[color:var(--hostly-accent)]" />
        </div>
        <div className="flex h-28 items-end gap-2">
          {[40, 58, 46, 72, 88, 76, 64, 48].map((height, i) => (
            <div key={i} className="flex-1 rounded-md bg-[color:var(--hostly-accent-soft)]" style={{ height: `${height}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function KdsPanel() {
  return (
    <div className="p-4">
      <KdsQueue />
    </div>
  );
}

const heroTabs = [
  { id: "servicio", label: "Servicio", icon: Receipt, panel: ServicePanel },
  { id: "tpv", label: "TPV", icon: UtensilsCrossed, panel: TpvPanel },
  { id: "mesas", label: "Plano", icon: LayoutGrid, panel: FloorMapPanel },
  { id: "kds", label: "KDS", icon: ChefHat, panel: KdsPanel },
] as const;

export function HeroProductMockup() {
  const [active, setActive] = useState<(typeof heroTabs)[number]["id"]>("servicio");
  const current = heroTabs.find((tab) => tab.id === active) ?? heroTabs[0];
  const Panel = current.panel;

  return (
    <div className="marketing-mockup-shell marketing-rise marketing-rise-delay-2">
      <MockupChrome title="Hostly · TPV operativo" />
      <div className="border-b border-[color:var(--hostly-table-divider-soft)] bg-white px-4 py-3">
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
  { id: "servicio", label: "Servicio", icon: Receipt, panel: ServicePanel },
  { id: "tpv", label: "TPV táctil", icon: UtensilsCrossed, panel: TpvPanel },
  { id: "kds", label: "Cocina / Barra", icon: ChefHat, panel: KdsPanel },
  { id: "mesas", label: "Plano visual", icon: LayoutGrid, panel: FloorMapPanel },
  { id: "metricas", label: "Control", icon: BarChart3, panel: AnalyticsPanel },
] as const;

function MobileWaiterMock() {
  return (
    <div className="space-y-3 p-4">
      <div className="rounded-xl bg-[color:var(--hostly-navy-deep)] px-3 py-2 text-[11px] font-semibold text-white">Mesa 7 · Servicio activo</div>
      {[
        ["Entrante listo", "Avisar a sala"],
        ["Bebidas pendientes", "Barra"],
        ["Cuenta solicitada", "Cobrar"],
      ].map(([line, action]) => (
        <div key={line} className="rounded-xl border border-[color:var(--hostly-table-divider-soft)] bg-white px-3 py-2 text-[11px]">
          <div className="font-semibold">{line}</div>
          <div className="mt-1 text-[color:var(--hostly-ink-muted)]">{action}</div>
        </div>
      ))}
    </div>
  );
}

function MobileOrdersMock() {
  return (
    <div className="space-y-2 p-4">
      {[
        ["Bravas ×2", "Servido"],
        ["Arroz meloso", "En cocina"],
        ["Agua sin gas", "Barra"],
      ].map(([item, state], i) => (
        <div key={item} className="flex items-center justify-between gap-2 rounded-xl border border-[color:var(--hostly-table-divider-soft)] bg-white px-3 py-2 text-[11px]">
          <span className="min-w-0 truncate">{item}</span>
          <span className={i === 1 ? "shrink-0 text-amber-700" : "shrink-0 text-emerald-700"}>{state}</span>
        </div>
      ))}
    </div>
  );
}

function MobileReservationsMock() {
  return (
    <div className="space-y-2 p-4">
      {[
        { time: "20:30", name: "García", pax: "4 pax" },
        { time: "21:00", name: "Mesa 12", pax: "Cuenta" },
        { time: "21:15", name: "Terraza", pax: "2 pax" },
      ].map((row) => (
        <div key={`${row.time}-${row.name}`} className="grid grid-cols-[52px_1fr_auto] items-center gap-2 rounded-xl border border-[color:var(--hostly-table-divider-soft)] bg-white px-3 py-2 text-[11px]">
          <span className="font-semibold">{row.time}</span>
          <span className="min-w-0 truncate">{row.name}</span>
          <span className="text-[color:var(--hostly-ink-muted)]">{row.pax}</span>
        </div>
      ))}
    </div>
  );
}

function MobilePaymentMock() {
  return (
    <div className="space-y-3 p-4">
      <div className="rounded-xl border border-[color:var(--hostly-table-divider-soft)] bg-white p-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[color:var(--hostly-ink-faint)]">Cuenta Mesa 12</div>
        <div className="mt-2 text-xl font-semibold tracking-normal">49,50 €</div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[11px] font-semibold">
        <div className="rounded-xl border border-[color:var(--hostly-table-divider-soft)] bg-white py-2 text-center">Efectivo</div>
        <div className="rounded-xl bg-[color:var(--hostly-navy-deep)] py-2 text-center text-white">Tarjeta</div>
      </div>
    </div>
  );
}

const mobileShowcase = [
  { id: "waiter", label: "Sala", icon: Users, panel: MobileWaiterMock },
  { id: "orders", label: "Comandas", icon: Receipt, panel: MobileOrdersMock },
  { id: "reservas", label: "Reservas", icon: CalendarDays, panel: MobileReservationsMock },
  { id: "pagos", label: "Pagos", icon: CreditCard, panel: MobilePaymentMock },
] as const;

export function ProductShowcaseMockups() {
  const [desktopTab, setDesktopTab] = useState<(typeof desktopShowcase)[number]["id"]>("servicio");
  const [mobileTab, setMobileTab] = useState<(typeof mobileShowcase)[number]["id"]>("waiter");

  const DesktopPanel = (desktopShowcase.find((tab) => tab.id === desktopTab) ?? desktopShowcase[0]).panel;
  const MobilePanel = (mobileShowcase.find((tab) => tab.id === mobileTab) ?? mobileShowcase[0]).panel;

  return (
    <div className="grid gap-8 xl:grid-cols-[1.35fr_0.65fr]">
      <div className="marketing-mockup-shell">
        <MockupChrome title="Hostly Desktop · Operación" />
        <div className="border-b border-[color:var(--hostly-table-divider-soft)] bg-white px-4 py-3">
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
                      : "text-[color:var(--hostly-ink-muted)] hover:bg-[color:var(--hostly-ice-50)]"
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
          <div className="overflow-hidden rounded-[22px] border border-white/10 bg-[color:var(--hostly-ice-50)]">
            <div className="flex items-center justify-between border-b border-[color:var(--hostly-table-divider-soft)] bg-white px-4 py-2">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[color:var(--hostly-ink-strong)]">
                <Smartphone className="size-3.5 text-[color:var(--hostly-accent)]" />
                Hostly Mobile
              </div>
              <span className="text-[10px] text-[color:var(--hostly-ink-faint)]">Servicio</span>
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
        <div className="rounded-[16px] border border-dashed border-[color:var(--hostly-accent)] bg-[color:var(--hostly-accent-soft)] p-4 text-center">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[color:var(--hostly-navy-deep)]">Foto de carta</div>
          <div className="mt-3 rounded-xl bg-white/80 px-3 py-6 text-[11px] text-[color:var(--hostly-ink-muted)]">Sube una carta y revisa antes de publicar</div>
        </div>
        <div className="space-y-2">
          {[
            { name: "Ensaladilla Hostly", cat: "Entrantes", price: "9,50 €", state: "Revisar" },
            { name: "Arroz meloso de sepia", cat: "Principales", price: "22,50 €", state: "Listo" },
            { name: "Tarta de queso", cat: "Postres", price: "6,50 €", state: "Listo" },
          ].map((row) => (
            <div key={row.name} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-xl border border-[color:var(--hostly-table-divider-soft)] bg-white px-3 py-2 text-[11px]">
              <div className="min-w-0">
                <div className="truncate font-semibold">{row.name}</div>
                <div className="truncate text-[color:var(--hostly-ink-muted)]">{row.cat}</div>
              </div>
              <span className="shrink-0 font-semibold">{row.price}</span>
              <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">{row.state}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
