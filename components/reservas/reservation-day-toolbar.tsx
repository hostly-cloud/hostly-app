"use client";

import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { HostlyButton, HostlySurface } from "@/components/ui/hostly";

type ReservationDayToolbarProps = {
  dayLabel: string;
  isToday: boolean;
  value: string;
  onChange: (value: string) => void;
  onPrevious: () => void;
  onToday: () => void;
  onNext: () => void;
  onCreate: () => void;
};

export function ReservationDayToolbar({
  dayLabel,
  isToday,
  value,
  onChange,
  onPrevious,
  onToday,
  onNext,
  onCreate,
}: ReservationDayToolbarProps) {
  return (
    <HostlySurface variant="flat" className="hostly-reservations-day-toolbar">
      <div className="hostly-reservations-day-toolbar__copy">
        <span className="hostly-mobile-text-caption">Agenda del día</span>
        <strong className="hostly-reservations-day-toolbar__day">{dayLabel}</strong>
      </div>

      <div className="hostly-reservations-day-toolbar__controls">
        <div className="hostly-reservations-day-stepper" role="group" aria-label="Navegar por los días">
          <HostlyButton
            variant="ghost"
            className="hostly-button-compact"
            icon={<ChevronLeft />}
            onClick={onPrevious}
            aria-label="Ver el día anterior"
          >
            Anterior
          </HostlyButton>
          <HostlyButton
            variant="ghost"
            className="hostly-button-compact"
            onClick={onToday}
            aria-pressed={isToday}
          >
            Hoy
          </HostlyButton>
          <HostlyButton
            variant="ghost"
            className="hostly-button-compact"
            icon={<ChevronRight />}
            onClick={onNext}
            aria-label="Ver el día siguiente"
          >
            Siguiente
          </HostlyButton>
        </div>

        <input
          type="date"
          className="hostly-input hostly-input--toolbar-compact hostly-reservations-day-toolbar__date"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label="Elegir fecha de reservas"
        />
      </div>

      <HostlyButton
        variant="primary"
        className="hostly-button-compact hostly-reservations-day-toolbar__create"
        icon={<Plus />}
        onClick={onCreate}
      >
        Nueva reserva
      </HostlyButton>
    </HostlySurface>
  );
}
