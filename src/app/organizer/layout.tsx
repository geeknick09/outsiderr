import { OrganizerNav } from "@/modules/organizer";

export default function OrganizerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <OrganizerNav />
      {children}
    </div>
  );
}
