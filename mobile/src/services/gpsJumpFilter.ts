export type TeacherLocationReading = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  recordedAtMs: number;
};

export type LocationFilterStatus =
  | "OK"
  | "CONFIRMED_AFTER_JUMP"
  | "INVALID_LOCATION"
  | "OLD_READING"
  | "LOW_ACCURACY"
  | "SUDDEN_JUMP_WAITING";

export type LocationFilterDecision = {
  allowSend: boolean;
  status: LocationFilterStatus;
  message: string;
  movedMeters: number;
  speedMetersPerSecond: number;
};

export type GpsJumpFilterConfig = {
  maxReadingAgeMs: number;
  maxFutureClockMs: number;
  maxAllowedAccuracyMeters: number;
  suspiciousJumpDistanceMeters: number;
  maxNormalSpeedMetersPerSecond: number;
  confirmMatchDistanceMeters: number;
  confirmWindowMs: number;
};

const DEFAULT_FILTER_CONFIG: GpsJumpFilterConfig = {
  // Ignore old cached readings from the phone older than 30 seconds
  maxReadingAgeMs: 30_000,
  // Allow up to 15 seconds of small clock difference
  maxFutureClockMs: 15_000,
  // Ignore blurry readings worse than 60 meters
  maxAllowedAccuracyMeters: 60,
  // Check for sudden glitches when a reading jumps at least 150 meters
  suspiciousJumpDistanceMeters: 150,
  // 45 m/s is 162 km/h, faster than normal travel on city roads
  maxNormalSpeedMetersPerSecond: 45,
  // A second reading within 100 meters confirms the teacher really moved there
  confirmMatchDistanceMeters: 100,
  // Keep a waiting jump for up to 2 minutes before clearing it
  confirmWindowMs: 120_000,
};

const EARTH_RADIUS_METERS = 6_371_000;

export function measureDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const latDiff = toRadians(lat2 - lat1);
  const lonDiff = toRadians(lon2 - lon1);

  const sinLat = Math.sin(latDiff / 2);
  const sinLon = Math.sin(lonDiff / 2);

  const rawPart =
    sinLat * sinLat +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      sinLon *
      sinLon;

  const safePart = Math.min(1, Math.max(0, rawPart));
  return 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(safePart), Math.sqrt(1 - safePart));
}

export function isValidLocationReading(
  reading: TeacherLocationReading,
  nowMs: number,
  maxFutureClockMs: number
): boolean {
  if (!reading) {
    return false;
  }

  const { latitude, longitude, accuracyMeters, recordedAtMs } = reading;

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    !Number.isFinite(accuracyMeters) ||
    !Number.isFinite(recordedAtMs)
  ) {
    return false;
  }

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return false;
  }

  // Reject empty default phone coordinates (0, 0)
  if (latitude === 0 && longitude === 0) {
    return false;
  }

  if (accuracyMeters < 0) {
    return false;
  }

  if (recordedAtMs <= 0 || recordedAtMs > nowMs + maxFutureClockMs) {
    return false;
  }

  return true;
}

export class TeacherGpsJumpFilter {
  private readonly config: GpsJumpFilterConfig;
  private lastTrustedReading: TeacherLocationReading | null = null;
  private waitingJumpReading: TeacherLocationReading | null = null;

  constructor(customConfig: Partial<GpsJumpFilterConfig> = {}) {
    this.config = {
      ...DEFAULT_FILTER_CONFIG,
      ...customConfig,
    };
  }

  public checkReading(
    reading: TeacherLocationReading,
    nowMs: number = Date.now()
  ): LocationFilterDecision {
    if (!isValidLocationReading(reading, nowMs, this.config.maxFutureClockMs)) {
      return {
        allowSend: false,
        status: "INVALID_LOCATION",
        message: "Location numbers from the phone are not valid.",
        movedMeters: 0,
        speedMetersPerSecond: 0,
      };
    }

    const readingAgeMs = nowMs - reading.recordedAtMs;
    if (readingAgeMs > this.config.maxReadingAgeMs) {
      return {
        allowSend: false,
        status: "OLD_READING",
        message: "Ignored an old saved location from the phone.",
        movedMeters: 0,
        speedMetersPerSecond: 0,
      };
    }

    if (reading.accuracyMeters > this.config.maxAllowedAccuracyMeters) {
      return {
        allowSend: false,
        status: "LOW_ACCURACY",
        message: "GPS signal is too weak right now. Waiting for a clearer lock.",
        movedMeters: 0,
        speedMetersPerSecond: 0,
      };
    }

    if (!this.lastTrustedReading) {
      this.lastTrustedReading = { ...reading };
      this.waitingJumpReading = null;
      return {
        allowSend: true,
        status: "OK",
        message: "First location reading saved.",
        movedMeters: 0,
        speedMetersPerSecond: 0,
      };
    }

    if (reading.recordedAtMs < this.lastTrustedReading.recordedAtMs) {
      return {
        allowSend: false,
        status: "OLD_READING",
        message: "Ignored a delayed location that arrived out of order.",
        movedMeters: 0,
        speedMetersPerSecond: 0,
      };
    }

    const movedMeters = measureDistanceMeters(
      this.lastTrustedReading.latitude,
      this.lastTrustedReading.longitude,
      reading.latitude,
      reading.longitude
    );

    const elapsedSeconds = Math.max(
      1,
      (reading.recordedAtMs - this.lastTrustedReading.recordedAtMs) / 1000
    );
    const speedMetersPerSecond = movedMeters / elapsedSeconds;

    const looksLikeSuddenJump =
      movedMeters >= this.config.suspiciousJumpDistanceMeters &&
      speedMetersPerSecond > this.config.maxNormalSpeedMetersPerSecond;

    if (looksLikeSuddenJump) {
      if (this.waitingJumpReading) {
        const waitingAgeMs = reading.recordedAtMs - this.waitingJumpReading.recordedAtMs;
        const gapFromWaitingMeters = measureDistanceMeters(
          this.waitingJumpReading.latitude,
          this.waitingJumpReading.longitude,
          reading.latitude,
          reading.longitude
        );

        const isSecondMatchingReading =
          waitingAgeMs >= 0 &&
          waitingAgeMs <= this.config.confirmWindowMs &&
          gapFromWaitingMeters <= this.config.confirmMatchDistanceMeters;

        if (isSecondMatchingReading) {
          this.lastTrustedReading = { ...reading };
          this.waitingJumpReading = null;
          return {
            allowSend: true,
            status: "CONFIRMED_AFTER_JUMP",
            message: "Second matching reading confirmed the teacher's new location.",
            movedMeters: Math.round(movedMeters),
            speedMetersPerSecond: Number(speedMetersPerSecond.toFixed(1)),
          };
        }
      }

      this.waitingJumpReading = { ...reading };
      return {
        allowSend: false,
        status: "SUDDEN_JUMP_WAITING",
        message: "Sudden GPS jump detected. Waiting for one more reading to confirm.",
        movedMeters: Math.round(movedMeters),
        speedMetersPerSecond: Number(speedMetersPerSecond.toFixed(1)),
      };
    }

    this.waitingJumpReading = null;
    this.lastTrustedReading = { ...reading };

    return {
      allowSend: true,
      status: "OK",
      message: "Location reading is normal.",
      movedMeters: Math.round(movedMeters),
      speedMetersPerSecond: Number(speedMetersPerSecond.toFixed(1)),
    };
  }

  public getLastTrustedReading(): TeacherLocationReading | null {
    if (!this.lastTrustedReading) {
      return null;
    }
    return { ...this.lastTrustedReading };
  }

  public reset(): void {
    this.lastTrustedReading = null;
    this.waitingJumpReading = null;
  }
}

export const teacherGpsJumpFilter = new TeacherGpsJumpFilter();