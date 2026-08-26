import CanonicalMermasSection from "@/app/dashboard/mermas/canonical-mermas-section";

/**
 * Mermas — inventario central canónico.
 * El histórico local anterior se conserva en modo solo lectura dentro del cliente,
 * pero las nuevas operaciones ya no escriben ni revierten stock en localStorage.
 */
export default function MermasPage() {
  return <CanonicalMermasSection />;
}
