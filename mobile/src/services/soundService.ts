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
