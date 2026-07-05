import { z } from 'zod';

export const slackUrlVerificationSchema = z
  .object({
    challenge: z.string().min(1),
    type: z.literal('url_verification'),
  })
  .loose();

export const slackAppHomeOpenedEventSchema = z
  .object({
    tab: z.string().optional(),
    type: z.literal('app_home_opened'),
    user: z.string().min(1),
  })
  .loose();

const slackMessageFileSchema = z
  .object({
    name: z.string().min(1).optional(),
    title: z.string().min(1).optional(),
  })
  .loose()
  .transform(({ name, title }) => ({
    ...(name === undefined ? {} : { name }),
    ...(title === undefined ? {} : { title }),
  }));

export const slackUserMessageEventSchema = z
  .object({
    bot_id: z.string().min(1).optional(),
    channel: z.string().min(1),
    channel_type: z.string().optional(),
    files: z.array(slackMessageFileSchema).optional(),
    subtype: z.string().min(1).optional(),
    text: z.string().min(1),
    thread_ts: z.string().min(1).optional(),
    ts: z.string().min(1),
    type: z.enum(['app_mention', 'message']),
    user: z.string().min(1),
  })
  .loose();

export type SlackUserMessageEvent = z.infer<typeof slackUserMessageEventSchema>;

export const slackMemberJoinedChannelEventSchema = z
  .object({
    channel: z.string().min(1),
    inviter: z.string().min(1).optional(),
    type: z.literal('member_joined_channel'),
    user: z.string().min(1),
  })
  .loose();

export type SlackMemberJoinedChannelEvent = z.infer<
  typeof slackMemberJoinedChannelEventSchema
>;

export const slackEventCallbackSchema = z
  .object({
    event: z.unknown(),
    team_id: z.string().min(1),
    type: z.literal('event_callback'),
  })
  .loose();

const slackEventUserSchema = z
  .object({
    deleted: z.boolean().optional(),
    id: z.string().min(1),
    is_bot: z.boolean().optional(),
    profile: z
      .object({
        email: z.string().optional(),
      })
      .loose()
      .optional(),
  })
  .loose();

export type SlackEventUser = z.infer<typeof slackEventUserSchema>;

export const slackTeamJoinEventSchema = z
  .object({
    type: z.literal('team_join'),
    user: slackEventUserSchema,
  })
  .loose();

export const slackUserChangeEventSchema = z
  .object({
    type: z.literal('user_change'),
    user: slackEventUserSchema,
  })
  .loose();

export const slackInteractionPayloadSchema = z
  .object({
    type: z.string().min(1),
  })
  .loose();

const slackInteractionOptionSchema = z
  .object({
    value: z.string().min(1),
  })
  .loose();

export const slackBlockActionPayloadSchema = z
  .object({
    actions: z
      .array(
        z.union([
          z
            .object({
              action_id: z.string().min(1),
              block_id: z.string().min(1).optional(),
              type: z.literal('button'),
              value: z.string().min(1).optional(),
            })
            .loose(),
          z
            .object({
              action_id: z.string().min(1),
              block_id: z.string().min(1).optional(),
              selected_option: slackInteractionOptionSchema,
              type: z.literal('static_select'),
            })
            .loose(),
          z
            .object({
              action_id: z.string().min(1),
              block_id: z.string().min(1).optional(),
              selected_option: slackInteractionOptionSchema,
              type: z.literal('overflow'),
            })
            .loose(),
        ])
      )
      .min(1),
    channel: z
      .object({
        id: z.string().min(1),
      })
      .loose()
      .optional(),
    message: z
      .object({
        ts: z.string().min(1),
      })
      .loose()
      .optional(),
    team: z
      .object({
        id: z.string().min(1),
      })
      .loose(),
    trigger_id: z.string().min(1).optional(),
    type: z.literal('block_actions'),
    user: z
      .object({
        id: z.string().min(1),
      })
      .loose(),
    view: z
      .object({
        hash: z.string().min(1).optional(),
        id: z.string().min(1),
      })
      .loose()
      .optional(),
  })
  .loose();

export const slackViewSubmissionPayloadSchema = z
  .object({
    channel: z
      .object({
        id: z.string().min(1),
      })
      .loose()
      .optional(),
    message: z
      .object({
        ts: z.string().min(1),
      })
      .loose()
      .optional(),
    team: z
      .object({
        id: z.string().min(1),
      })
      .loose(),
    type: z.literal('view_submission'),
    user: z
      .object({
        id: z.string().min(1),
      })
      .loose(),
    view: z
      .object({
        callback_id: z.string().min(1),
        private_metadata: z.string().optional(),
        state: z
          .object({
            values: z.unknown(),
          })
          .loose(),
      })
      .loose(),
  })
  .loose();
