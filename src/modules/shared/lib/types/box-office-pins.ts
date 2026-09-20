// Shared types for box office PINs (no server-only import — safe for client components)

export interface BoxOfficePin {
  id: string;
  eventId: string;
  organizerId: string | null;
  pinCode: string;
  staffName: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface BoxOfficePinWithEvent extends BoxOfficePin {
  eventTitle?: string;
}
