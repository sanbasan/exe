import { dispatcher } from '#slack/utils/dispatcher';
import type { Language } from '@exe/domain';

/**
 * Same-day "reschedule to a later time today" presets surfaced on the
 * scheduled-call DM, modeled after the overdue-notification deadline-change UI.
 * Each preset shifts the run to `now + minutes`.
 */
export const scheduledCallRunReschedulePresets = {
  inNinetyMinutes: 'in_ninety_minutes',
  inOneHour: 'in_one_hour',
  inThirtyMinutes: 'in_thirty_minutes',
  inTwoHours: 'in_two_hours',
} as const;

export type ScheduledCallRunReschedulePreset =
  (typeof scheduledCallRunReschedulePresets)[keyof typeof scheduledCallRunReschedulePresets];

const presetOrder: readonly ScheduledCallRunReschedulePreset[] = [
  scheduledCallRunReschedulePresets.inThirtyMinutes,
  scheduledCallRunReschedulePresets.inOneHour,
  scheduledCallRunReschedulePresets.inNinetyMinutes,
  scheduledCallRunReschedulePresets.inTwoHours,
];

const presetLabel = dispatcher<
  Language,
  [preset: ScheduledCallRunReschedulePreset],
  string
>({
  en: (preset) => {
    switch (preset) {
      case scheduledCallRunReschedulePresets.inThirtyMinutes:
        return 'In 30 minutes';
      case scheduledCallRunReschedulePresets.inOneHour:
        return 'In 1 hour';
      case scheduledCallRunReschedulePresets.inNinetyMinutes:
        return 'In 1.5 hours';
      case scheduledCallRunReschedulePresets.inTwoHours:
        return 'In 2 hours';
    }
  },
  ja: (preset) => {
    switch (preset) {
      case scheduledCallRunReschedulePresets.inThirtyMinutes:
        return '30分後';
      case scheduledCallRunReschedulePresets.inOneHour:
        return '1時間後';
      case scheduledCallRunReschedulePresets.inNinetyMinutes:
        return '1時間半後';
      case scheduledCallRunReschedulePresets.inTwoHours:
        return '2時間後';
    }
  },
});

export const getScheduledCallRunReschedulePresetMinutes = (
  preset: ScheduledCallRunReschedulePreset
): number => {
  switch (preset) {
    case scheduledCallRunReschedulePresets.inThirtyMinutes:
      return 30;
    case scheduledCallRunReschedulePresets.inOneHour:
      return 60;
    case scheduledCallRunReschedulePresets.inNinetyMinutes:
      return 90;
    case scheduledCallRunReschedulePresets.inTwoHours:
      return 120;
  }
};

export const getScheduledCallRunReschedulePresetLabel = ({
  language,
  preset,
}: {
  readonly language: Language;
  readonly preset: ScheduledCallRunReschedulePreset;
}): string => presetLabel(language)(preset);

export const listScheduledCallRunReschedulePresets =
  (): readonly ScheduledCallRunReschedulePreset[] => presetOrder;

export const isScheduledCallRunReschedulePreset = (
  value: string
): value is ScheduledCallRunReschedulePreset =>
  presetOrder.some((preset) => preset === value);
