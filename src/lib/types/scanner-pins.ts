// Shared types for scanner PINs (no server-only import — safe for client components)

export interface ScannerPin {
  id: string;
  eventId: string;
  organizerId: string;
  pinCode: string;
  staffName: string;
  staffEmail: string | null;
  staffPhone: string | null;
  isActive: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface ScannerPinWithEvent extends ScannerPin {
  eventTitle?: string;
}
