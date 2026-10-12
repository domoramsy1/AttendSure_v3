/**
 * Safely parses Django ISO, UTC, or SQLite date strings into human-readable 12-hour time.
 */
export function formatScanTime(rawDate?: string | null): string {
  if (!rawDate) return '--:--';

  try {
    // Replace space with 'T' to standardize SQLite timestamps: 'YYYY-MM-DD HH:mm:ss' -> ISO
    const standardized = rawDate.includes('T') ? rawDate : rawDate.replace(' ', 'T');
    const parsed = new Date(standardized);

    if (!isNaN(parsed.getTime())) {
      return parsed.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    }

    // Fallback regex if phone runtime timezone fails to parse
    const timeMatch = rawDate.match(/(\d{1,2}):(\d{2})/);
    if (timeMatch) {
      const hours = parseInt(timeMatch[1], 10);
      const minutes = timeMatch[2];
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const formattedHours = hours % 12 || 12;
      return `${formattedHours}:${minutes} ${ampm}`;
    }
  } catch {
    // Return empty fallback instead of crash
  }

  return '--:--';
}

/**
 * Formats distance with appropriate units (meters vs kilometers).
 */
export function formatDistance(meters: number | null | undefined): string {
  if (meters === null || meters === undefined || isNaN(meters)) return 'Determining distance...';
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(2)} km`;
}