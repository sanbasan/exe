import type { PlainToolSet } from '#agent/assistant/plain-tool';
import type { CallSchedule } from '@exe/domain';
import type { CallScheduleService, PutCallScheduleInput } from '@exe/server';
import { z } from 'zod';

interface CallScheduleToolComposition {
  readonly services: {
    readonly callSchedule: Pick<
      CallScheduleService,
      'getForSlackUser' | 'putForSlackUser'
    >;
  };
}

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u)
  .describe('Local date in YYYY-MM-DD format in the schedule timezone.');

const timeOfDaySchema = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u)
  .describe('Local time in 24-hour HH:mm format, for example "09:30".');

const weekdaySchema = z
  .number()
  .int()
  .min(0)
  .max(6)
  .describe('Weekday number: 0=Sunday, 1=Monday, ..., 6=Saturday.');

const updateCallScheduleParametersSchema = z
  .object({
    addExcludedDates: z
      .array(dateOnlySchema)
      .optional()
      .describe(
        'Dates to newly skip. Use this when the user asks to skip/cancel regular calls on specific local dates.'
      ),
    enabled: z
      .boolean()
      .optional()
      .describe('Whether the regular review call schedule is enabled.'),
    preNotifyMinutes: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe('Minutes before the call to send a pre-notification.'),
    removeExcludedDates: z
      .array(dateOnlySchema)
      .optional()
      .describe(
        'Skipped dates to unregister/remove so calls can run on those dates again.'
      ),
    timeOfDay: timeOfDaySchema.optional(),
    timezone: z
      .string()
      .min(1)
      .optional()
      .describe('IANA timezone name, for example "Asia/Tokyo".'),
    weekdays: z
      .array(weekdaySchema)
      .optional()
      .describe(
        'Full set of weekdays when regular review calls should run. Only pass this when the user wants to change the weekly pattern.'
      ),
  })
  .strict();

type UpdateCallScheduleParameters = z.infer<
  typeof updateCallScheduleParametersSchema
>;

const formatWeekdays = (weekdays: readonly number[]): string =>
  weekdays.length === 0 ? '(none)' : weekdays.join(',');

const formatDates = (dates: readonly string[]): string =>
  dates.length === 0 ? '(none)' : dates.join(',');

const formatSchedule = (schedule: CallSchedule): string =>
  [
    `enabled=${String(schedule.enabled)}`,
    `timeOfDay=${schedule.timeOfDay}`,
    `timezone=${schedule.timezone}`,
    `weekdays=${formatWeekdays(schedule.weekdays)}`,
    `preNotifyMinutes=${String(schedule.preNotifyMinutes)}`,
    `excludedDates=${formatDates(schedule.excludedDates)}`,
    `nextRunAt=${schedule.nextRunAt ?? '(none)'}`,
  ].join('\n');

const mergeExcludedDates = ({
  addExcludedDates,
  existingDates,
  removeExcludedDates,
}: {
  readonly addExcludedDates?: readonly string[];
  readonly existingDates: readonly string[];
  readonly removeExcludedDates?: readonly string[];
}): readonly string[] => {
  const removeSet = new Set(removeExcludedDates ?? []);

  return [
    ...new Set([
      ...existingDates.filter((date) => !removeSet.has(date)),
      ...(addExcludedDates ?? []),
    ]),
  ].sort();
};

export const buildCallScheduleUpdateInput = ({
  args,
  current,
}: {
  readonly args: UpdateCallScheduleParameters;
  readonly current: CallSchedule;
}): PutCallScheduleInput => ({
  enabled: args.enabled ?? current.enabled,
  excludedDates: mergeExcludedDates({
    ...(args.addExcludedDates === undefined
      ? {}
      : { addExcludedDates: args.addExcludedDates }),
    existingDates: current.excludedDates,
    ...(args.removeExcludedDates === undefined
      ? {}
      : { removeExcludedDates: args.removeExcludedDates }),
  }),
  preNotifyMinutes: args.preNotifyMinutes ?? current.preNotifyMinutes,
  timeOfDay: args.timeOfDay ?? current.timeOfDay,
  timezone: args.timezone ?? current.timezone,
  weekdays: args.weekdays ?? current.weekdays,
});

const hasScheduleUpdate = (args: UpdateCallScheduleParameters): boolean =>
  args.addExcludedDates !== undefined ||
  args.enabled !== undefined ||
  args.preNotifyMinutes !== undefined ||
  args.removeExcludedDates !== undefined ||
  args.timeOfDay !== undefined ||
  args.timezone !== undefined ||
  args.weekdays !== undefined;

export const buildAssistantCallScheduleTools = ({
  composition,
  slackUserId,
  workspaceId,
}: {
  readonly composition: CallScheduleToolComposition;
  readonly slackUserId: string;
  readonly workspaceId: string;
}): PlainToolSet => ({
  get_my_call_schedule: {
    description:
      'Check the regular review call schedule for the Slack user currently talking to exe. Use this when the user asks about their own regular meeting/call schedule, time, skipped days, next run, or whether it is enabled. This does not require workspace admin permission.',
    execute: async (): Promise<string> => {
      const schedule = await composition.services.callSchedule.getForSlackUser({
        slackUserId,
        workspaceId,
      });

      return `Current regular review call schedule:\n${formatSchedule(schedule)}`;
    },
  },
  update_my_call_schedule: {
    description:
      'Update the regular review call schedule for the Slack user currently talking to exe. Use this for their own schedule changes: changing call time, enabling/disabling regular calls, changing weekdays, adding skipped dates, or unregistering/removing skipped dates. This updates only the current user’s schedule and does not require workspace admin permission. Ask a short clarification before calling if the target date/time or requested change is ambiguous.',
    execute: async (rawArgs): Promise<string> => {
      const args = updateCallScheduleParametersSchema.parse(rawArgs);

      if (!hasScheduleUpdate(args)) {
        return 'No schedule change was provided. Ask the user which schedule setting to change.';
      }

      const current = await composition.services.callSchedule.getForSlackUser({
        slackUserId,
        workspaceId,
      });
      const updated = await composition.services.callSchedule.putForSlackUser({
        input: buildCallScheduleUpdateInput({ args, current }),
        slackUserId,
        workspaceId,
      });

      return `Regular review call schedule was updated:\n${formatSchedule(updated)}`;
    },
    parameters: updateCallScheduleParametersSchema,
  },
});
