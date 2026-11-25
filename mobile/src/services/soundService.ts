/**
 * AttendSure - Safe Tactile & Web Audio Feedback Service
 * File: mobile/src/services/soundService.ts
 *
 * Uses built-in React Native Vibration on native devices and pure Web Audio
 * tone synthesis on web with zero external CDN dependencies or missing packages.
 */

import { Vibration, Platform } from 'react-native';

type FeedbackType = 'success' | 'warning' | 'error';

interface MinimalOscillator {
  type: string;
  frequency: {
    setValueAtTime: (frequency: number, startTime: number) => void;
  };
  connect: (destination: unknown) => void;
  start: (when?: number) => void;
  stop: (when?: number) => void;
}

interface MinimalGainNode {
  gain: {
    setValueAtTime: (value: number, startTime: number) => void;
    exponentialRampToValueAtTime: (value: number, endTime: number) => void;
  };
  connect: (destination: unknown) => void;
}

interface MinimalAudioContext {
  currentTime: number;
  destination: unknown;
  createOscillator: () => MinimalOscillator;
  createGain: () => MinimalGainNode;
  close?: () => Promise<void> | void;
}

type AudioContextCtor = new () => MinimalAudioContext;

const TONE_PROFILES: Record<
  FeedbackType,
  { notes: number[]; durationSec: number; wave: string }
> = {
  success: { notes: [880, 1175], durationSec: 0.09, wave: 'sine' },
  warning: { notes: [520, 440], durationSec: 0.14, wave: 'triangle' },
  error: { notes: [280, 210], durationSec: 0.16, wave: 'sawtooth' },
};

function playWebAudioTone(type: FeedbackType): void {
  if (Platform.OS !== 'web') return;

  try {
    const scope = globalThis as unknown as {
      AudioContext?: AudioContextCtor;
      webkitAudioContext?: AudioContextCtor;
    };
    const Ctor = scope.AudioContext || scope.webkitAudioContext;
    if (!Ctor) return;

    const ctx = new Ctor();
    const profile = TONE_PROFILES[type];
    let offset = ctx.currentTime;

    for (const freq of profile.notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = profile.wave;
      osc.frequency.setValueAtTime(freq, offset);

      gain.gain.setValueAtTime(0.08, offset);
      gain.gain.exponentialRampToValueAtTime(0.001, offset + profile.durationSec);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(offset);
      osc.stop(offset + profile.durationSec);
      offset += profile.durationSec + 0.03;
    }

    const totalMs = Math.ceil((profile.notes.length * (profile.durationSec + 0.03) + 0.1) * 1000);
    setTimeout(() => {
      try {
        ctx.close?.();
      } catch {}
    }, totalMs);
  } catch {
    // Web Audio may be blocked before user gesture; ignore safely
  }
}

function triggerFeedback(type: FeedbackType, vibratePattern: number | number[]): void {
  if (Platform.OS === 'web') {
    playWebAudioTone(type);
    return;
  }

  try {
    Vibration.vibrate(vibratePattern);
  } catch {
    // Ignore devices without vibration hardware or permission
  }
}

export const playScanSuccessSound = async (): Promise<void> => {
  triggerFeedback('success', 70);
};

export const playScanWarningSound = async (): Promise<void> => {
  triggerFeedback('warning', [0, 150, 80, 150]);
};

export const playScanErrorSound = async (): Promise<void> => {
  triggerFeedback('error', [0, 200, 100, 200]);
};

export type AlarmToneKind = 'TIME_IN' | 'TIME_OUT' | 'CLASS_PERIOD';

const ALARM_TONE_PROFILES: Record<
  AlarmToneKind,
  { notes: number[]; durationSec: number; wave: string; vibrate: number[] }
> = {
  TIME_IN: {
    notes: [587.33, 739.99, 880, 1174.66],
    durationSec: 0.16,
    wave: 'triangle',
    vibrate: [0, 450, 180, 450, 180, 650],
  },
  TIME_OUT: {
    notes: [1046.5, 880, 783.99, 523.25],
    durationSec: 0.17,
    wave: 'sine',
    vibrate: [0, 500, 220, 500, 220, 500],
  },
  CLASS_PERIOD: {
    notes: [880, 1108.73, 880, 1318.51, 1318.51],
    durationSec: 0.15,
    wave: 'triangle',
    vibrate: [0, 350, 150, 350, 150, 350, 150, 600],
  },
};

let activeAlarmTimer: ReturnType<typeof setInterval> | null = null;

function playWebAlarmNotes(kind: AlarmToneKind): void {
  if (Platform.OS !== 'web') return;
  try {
    const scope = globalThis as unknown as {
      AudioContext?: AudioContextCtor;
      webkitAudioContext?: AudioContextCtor;
    };
    const Ctor = scope.AudioContext || scope.webkitAudioContext;
    if (!Ctor) return;

    const ctx = new Ctor();
    const profile = ALARM_TONE_PROFILES[kind] || ALARM_TONE_PROFILES.CLASS_PERIOD;
    let offset = ctx.currentTime + 0.02;

    for (const freq of profile.notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = profile.wave;
      osc.frequency.setValueAtTime(freq, offset);

      gain.gain.setValueAtTime(0.22, offset);
      gain.gain.exponentialRampToValueAtTime(0.001, offset + profile.durationSec);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(offset);
      osc.stop(offset + profile.durationSec);
      offset += profile.durationSec + 0.05;
    }

    const totalMs = Math.ceil((profile.notes.length * (profile.durationSec + 0.05) + 0.15) * 1000);
    setTimeout(() => {
      try {
        ctx.close?.();
      } catch {}
    }, totalMs);
  } catch {}
}

export const playScheduleAlarmOnce = (kind: AlarmToneKind): void => {
  const profile = ALARM_TONE_PROFILES[kind] || ALARM_TONE_PROFILES.CLASS_PERIOD;
  if (Platform.OS === 'web') {
    playWebAlarmNotes(kind);
    return;
  }
  try {
    Vibration.vibrate(profile.vibrate, false);
  } catch {}
};

export const startScheduleAlarmLoop = (kind: AlarmToneKind): void => {
  stopScheduleAlarmLoop();
  const profile = ALARM_TONE_PROFILES[kind] || ALARM_TONE_PROFILES.CLASS_PERIOD;
  if (Platform.OS === 'web') {
    playWebAlarmNotes(kind);
    activeAlarmTimer = setInterval(() => {
      playWebAlarmNotes(kind);
    }, 3400);
    return;
  }
  try {
    Vibration.vibrate(profile.vibrate, true);
  } catch {}
};

export const stopScheduleAlarmLoop = (): void => {
  if (activeAlarmTimer) {
    clearInterval(activeAlarmTimer);
    activeAlarmTimer = null;
  }
  if (Platform.OS !== 'web') {
    try {
      Vibration.cancel();
    } catch {}
  }
};
