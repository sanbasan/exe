import type { PlainToolSet } from '#agent/assistant/plain-tool';
import type { GBrainSearchPublishContext } from '#agent/assistant/tools/gbrain-tools';
import { publishCallData } from '#agent/data-channel';
import type { Language } from '@exe/domain';
import { z } from 'zod';

// ─── GBrain integration — purgeable (gbrain/PURGE.md). ───
//
// Lets the memory scout share a human-readable digest of what its searches
// turned up. The bullets land on the call screen's GBrain tab as the card
// body, replacing raw snippets no human could read. Scout-only: assistant
// jobs report their findings in speech, so they do not get this tool.

const FINDINGS_BULLET_MAX_CHARS = 160;

const workspaceLanguageName = (language: Language): string =>
  language === 'ja' ? 'Japanese' : 'English';

const buildFindingsParametersSchema = (
  languageName: string
): z.ZodType<{ readonly bullets: readonly string[] }> =>
  z
    .object({
      bullets: z
        .array(z.string().min(1))
        .min(1)
        .max(6)
        .describe(
          `One to four short plain-text lines, each one concrete fact you found. Written in ${languageName} (the workspace language setting), even when the conversation transcript is in another language. Rendered VERBATIM on the call screen: no markdown, no bullet markers, no page slugs or IDs, no speaker labels.`
        ),
    })
    .strict();

// The app renders bullets verbatim (no markdown engine), so defensively strip
// list markers, emphasis marks, and inline code fences the model may emit.
export const sanitizeFindingsBullet = (bullet: string): string => {
  // Emphasis pairs must go before the leading-marker strip: "- **fact**"
  // would otherwise lose its opening "**" to the marker strip and leave the
  // closing pair orphaned in the output.
  const cleaned = bullet
    .replace(/\s+/gu, ' ')
    .replace(/\*\*([^*]*)\*\*/gu, '$1')
    .replace(/__([^_]*)__/gu, '$1')
    .replace(/`([^`]*)`/gu, '$1')
    .replace(/^[-*•#>\s]+/u, '')
    .trim();

  return cleaned.length > FINDINGS_BULLET_MAX_CHARS
    ? `${cleaned.slice(0, FINDINGS_BULLET_MAX_CHARS)}…`
    : cleaned;
};

export const buildScoutFindingsTool = ({
  language,
  publishContext,
  workspaceId,
}: {
  readonly language: Language;
  readonly publishContext: GBrainSearchPublishContext;
  readonly workspaceId: string;
}): PlainToolSet => {
  const languageName = workspaceLanguageName(language);
  const findingsParametersSchema = buildFindingsParametersSchema(languageName);

  return {
    report_findings_to_user: {
      description: `Show the user, on their call screen, a tiny digest of what your memory searches turned up. Call it ONCE after your searches, before your final reply, with 1-4 short plain-text lines in ${languageName} (the workspace language setting — always ${languageName}, even when the call conversation is in another language) — each line one concrete fact (a decision, a date, an open question). The lines are rendered verbatim: no markdown, no bullet markers, no page slugs or IDs, no "User/Agent" labels. Do not call it when nothing relevant was found.`,
      execute: (rawArgs): Promise<string> => {
        const args = findingsParametersSchema.parse(rawArgs);
        const bullets = args.bullets
          .map(sanitizeFindingsBullet)
          .filter((bullet) => bullet.length > 0);

        if (bullets.length === 0) {
          return Promise.resolve(
            'Nothing was shown: every line was empty after formatting. Call again with short plain-text facts, or skip if there is nothing relevant.'
          );
        }

        // Best-effort UI enrichment: a publish failure must not fail the scout.
        void publishCallData({
          message: {
            callSessionId: publishContext.sessionId,
            findings: {
              bullets,
              ...(publishContext.channelId === undefined
                ? {}
                : { channelId: publishContext.channelId }),
              lookupId: publishContext.lookupId,
            },
            type: 'gbrain_lookup_findings',
            workspaceId,
          },
          room: publishContext.room,
          topic: publishContext.topic,
        }).catch((): null => null);

        return Promise.resolve(
          'The digest is now visible on the user call screen. Return your briefing for the voice agent next.'
        );
      },
      parameters: findingsParametersSchema,
    },
  };
};
