import { z } from 'zod';

const slackOptionalBooleanSchema = z.boolean().nullable().optional();
const slackOptionalNumberSchema = z.number().nullable().optional();
const slackOptionalStringSchema = z.string().nullable().optional();

// Slack -> iOS pass-through types intentionally keep Slack's field names.  The
// UI may only render a small subset, but the API should relay the received
// Slack payload according to this type instead of shaping it down to display
// fields.
export const slackWorkspaceTeamIconSchema = z
  .object({
    image_102: slackOptionalStringSchema,
    image_132: slackOptionalStringSchema,
    image_230: slackOptionalStringSchema,
    image_34: slackOptionalStringSchema,
    image_44: slackOptionalStringSchema,
    image_68: slackOptionalStringSchema,
    image_88: slackOptionalStringSchema,
    image_default: slackOptionalBooleanSchema,
    image_original: slackOptionalStringSchema,
  })
  .catchall(z.unknown());

export const slackWorkspaceTeamSchema = z
  .object({
    avatar_base_url: slackOptionalStringSchema,
    discoverable: slackOptionalStringSchema,
    domain: slackOptionalStringSchema,
    email_domain: slackOptionalStringSchema,
    enterprise_domain: slackOptionalStringSchema,
    enterprise_id: slackOptionalStringSchema,
    enterprise_name: slackOptionalStringSchema,
    icon: slackWorkspaceTeamIconSchema.nullable().optional(),
    id: slackOptionalStringSchema,
    is_verified: slackOptionalBooleanSchema,
    lob_sales_home_enabled: slackOptionalBooleanSchema,
    name: slackOptionalStringSchema,
    url: slackOptionalStringSchema,
  })
  .catchall(z.unknown());

export const slackWorkspaceMemberEnterpriseUserSchema = z
  .object({
    enterprise_id: slackOptionalStringSchema,
    enterprise_name: slackOptionalStringSchema,
    id: slackOptionalStringSchema,
    is_admin: slackOptionalBooleanSchema,
    is_owner: slackOptionalBooleanSchema,
    is_primary_owner: slackOptionalBooleanSchema,
    teams: z.array(z.string()).nullable().optional(),
  })
  .catchall(z.unknown());

export const slackWorkspaceMemberProfileSchema = z
  .object({
    always_active: slackOptionalBooleanSchema,
    api_app_id: slackOptionalStringSchema,
    avatar_hash: slackOptionalStringSchema,
    bot_id: slackOptionalStringSchema,
    display_name: slackOptionalStringSchema,
    display_name_normalized: slackOptionalStringSchema,
    email: slackOptionalStringSchema,
    fields: z.unknown().optional(),
    first_name: slackOptionalStringSchema,
    guest_expiration_ts: slackOptionalNumberSchema,
    guest_invited_by: slackOptionalStringSchema,
    huddle_state: slackOptionalStringSchema,
    huddle_state_expiration_ts: slackOptionalNumberSchema,
    image_1024: slackOptionalStringSchema,
    image_192: slackOptionalStringSchema,
    image_24: slackOptionalStringSchema,
    image_32: slackOptionalStringSchema,
    image_48: slackOptionalStringSchema,
    image_512: slackOptionalStringSchema,
    image_72: slackOptionalStringSchema,
    image_original: slackOptionalStringSchema,
    is_custom_image: slackOptionalBooleanSchema,
    last_name: slackOptionalStringSchema,
    phone: slackOptionalStringSchema,
    pronouns: slackOptionalStringSchema,
    real_name: slackOptionalStringSchema,
    real_name_normalized: slackOptionalStringSchema,
    skype: slackOptionalStringSchema,
    status_emoji: slackOptionalStringSchema,
    status_emoji_display_info: z.unknown().optional(),
    status_expiration: slackOptionalNumberSchema,
    status_text: slackOptionalStringSchema,
    status_text_canonical: slackOptionalStringSchema,
    team: slackOptionalStringSchema,
    title: slackOptionalStringSchema,
  })
  .catchall(z.unknown());

export const slackWorkspaceMemberSchema = z
  .object({
    color: slackOptionalStringSchema,
    deleted: slackOptionalBooleanSchema,
    enterprise_user: slackWorkspaceMemberEnterpriseUserSchema
      .nullable()
      .optional(),
    has_2fa: slackOptionalBooleanSchema,
    id: slackOptionalStringSchema,
    is_admin: slackOptionalBooleanSchema,
    is_app_user: slackOptionalBooleanSchema,
    is_bot: slackOptionalBooleanSchema,
    is_connector_bot: slackOptionalBooleanSchema,
    is_email_confirmed: slackOptionalBooleanSchema,
    is_invited_user: slackOptionalBooleanSchema,
    is_owner: slackOptionalBooleanSchema,
    is_primary_owner: slackOptionalBooleanSchema,
    is_restricted: slackOptionalBooleanSchema,
    is_ultra_restricted: slackOptionalBooleanSchema,
    is_workflow_bot: slackOptionalBooleanSchema,
    locale: slackOptionalStringSchema,
    name: slackOptionalStringSchema,
    profile: slackWorkspaceMemberProfileSchema.nullable().optional(),
    real_name: slackOptionalStringSchema,
    team_id: slackOptionalStringSchema,
    two_factor_type: slackOptionalStringSchema,
    tz: slackOptionalStringSchema,
    tz_label: slackOptionalStringSchema,
    tz_offset: slackOptionalNumberSchema,
    updated: slackOptionalNumberSchema,
    who_can_share_contact_card: slackOptionalStringSchema,
  })
  .catchall(z.unknown());

export type SlackWorkspaceMember = z.infer<typeof slackWorkspaceMemberSchema>;

export type SlackWorkspaceTeam = z.infer<typeof slackWorkspaceTeamSchema>;
