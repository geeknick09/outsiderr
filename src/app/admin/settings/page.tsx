import { AdminSettingsPanel } from "@/components/admin/settings-panel";
import { getAllSettings } from "@/modules/shared/server";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin: Settings — Outsiderr" };

export default async function AdminSettingsPage() {
  const settings = await getAllSettings();
  return <AdminSettingsPanel settings={settings} />;
}
