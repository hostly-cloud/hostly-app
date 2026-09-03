import { redirect } from "next/navigation";

type DashboardProductosPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function DashboardProductosPage({
  searchParams,
}: DashboardProductosPageProps) {
  const currentSearchParams = await searchParams;
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(currentSearchParams)) {
    if (Array.isArray(value)) {
      for (const item of value) query.append(key, item);
      continue;
    }
    if (value !== undefined) query.set(key, value);
  }

  const suffix = query.toString();
  redirect(
    `/dashboard/configuracion/carta/productos${suffix ? `?${suffix}` : ""}`,
  );
}
