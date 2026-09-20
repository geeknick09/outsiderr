export function getCronEnvironmentError(): string | null {
  if (!process.env.CRON_SECRET) {
    return "CRON_SECRET is not configured.";
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return "SUPABASE_SERVICE_ROLE_KEY is not configured. This is required for cron jobs.";
  }

  return null;
}
