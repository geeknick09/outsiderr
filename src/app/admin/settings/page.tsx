import { AdminSettingsPanel } from "@/components/admin/settings-panel";
import { getAllSettings } from "@/lib/data/platform-settings";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin: Settings — Outsiderr" };

export default async function AdminSettingsPage() {
  const settings = await getAllSettings();
  return <AdminSettingsPanel settings={settings} />;
}
