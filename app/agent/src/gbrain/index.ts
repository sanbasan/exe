import { extractFacts, fetchBrainPage, ingestPage } from '#agent/gbrain/client';
import { getGBrainConfig } from '#agent/gbrain/config';
import { buildCallDecisions } from '#agent/gbrain/decisions';
import { buildCallPage, buildEntityPages } from '#agent/gbrain/page';
import { summarizeCallForPage } from '#agent/gbrain/summarize';
import { buildMemberNameMap } from '#agent/workspace-members';
import type { Language } from '@exe/domain';
import { reportServerError, type ServerComposition } from '@exe/server';

export interface GBrainSessionRef {
  readonly language: Language;
  readonly sessionId: string;
  readonly workspaceId: string;
}

// GBrain integration entry point. Called (best-effort) when a call session
// ends; see the marked block in session-handler.ts. Never rejects — any
// failure is reported and swallowed so it can't affect call teardown. When
// GBrain is not configured this is a no-op.
//
// Purge: delete this `gbrain/` folder and the marked block + import in
// session-handler.ts. Nothing else references it. See gbrain/PURGE.md.
export const ingestEndedSessionToGBrain = async ({
  composition,
  metadata,
}: {
  readonly composition: ServerComposition;
  readonly metadata: GBrainSessionRef;
}): Promise<void> => {
  const config = getGBrainConfig();

  if (config === null) {
    return;
  }

  const { language, sessionId, workspaceId } = metadata;

  await Promise.all([
    composition.services.callSession.getById({
      callSessionId: sessionId,
      workspaceId,
    }),
    composition.services.callSession.listEvents({
      callSessionId: sessionId,
      workspaceId,
    }),
    // Agenda enriches the page with the speaker's display name; degrade to the
    // user id if it can't be rebuilt for an ended session.
    composition.services.callSession
      .getAgendaForSession({ callSessionId: sessionId, workspaceId })
      .catch(() => null),
  ])
    .then(async ([session, events, agenda]) => {
      // Roster resolves Slack IDs to display names; degrade to IDs when unavailable.
      const members = await composition.services.workspace
        .listSlackMembersForUser({ userId: session.userId, workspaceId })
        .catch(() => []);
      const memberNames = buildMemberNameMap(members);
      const decisions = buildCallDecisions({
        agenda,
        events,
        language,
        memberNames,
      });
      // Summary/title composition is best-effort: on failure the page falls back
      // to the deterministic title and the in-call summary event.
      const composed = await summarizeCallForPage({
        channelNames: decisions.channelNames,
        decisionLines: decisions.lines,
        events,
        language,
        ...(agenda?.speakerName === undefined
          ? {}
          : { participantName: agenda.speakerName }),
        purpose: session.purpose,
      }).catch((error: unknown) => {
        void reportServerError({
          context: { route: 'agent/gbrain/summarize' },
          error,
        });

        return null;
      });

      // Entity stubs must exist before the call page is written: the engine only
      // materializes graph edges from wikilinks whose target page already exists.
      // Each stub is individually best-effort so one failure can't block the rest
      // (or the main page ingest below).
      const entityPages = buildEntityPages({
        agenda,
        decisions,
        language,
        memberNames,
      });
      await Promise.all(
        entityPages.map((entityPage) =>
          // Create-if-absent: never overwrite a page someone may have curated.
          fetchBrainPage({ config, slug: entityPage.slug, workspaceId })
            .then((existing) =>
              existing === null
                ? ingestPage({ config, page: entityPage, workspaceId })
                : undefined
            )
            .catch((error: unknown) =>
              reportServerError({
                context: { route: 'agent/gbrain/entity_page' },
                error,
              })
            )
        )
      );

      await ingestPage({
        config,
        page: buildCallPage({
          agenda,
          composed,
          decisions,
          events,
          language,
          memberNames,
          session,
        }),
        workspaceId,
      });

      // Hot-memory facts: the distilled summary + decisions (not the raw
      // transcript) is what future calls should recall. Best-effort — the page
      // ingest above already succeeded.
      const factsText = [composed?.summary, ...decisions.lines]
        .filter((part): part is string => part !== undefined && part.length > 0)
        .join('\n');

      if (factsText.length > 0) {
        await extractFacts({
          config,
          sessionId,
          text: factsText,
          workspaceId,
        }).catch((error: unknown) =>
          reportServerError({
            context: { route: 'agent/gbrain/extract_facts' },
            error,
          })
        );
      }
    })
    .catch((error: unknown) =>
      reportServerError({ context: { route: 'agent/gbrain/ingest' }, error })
    );
};
