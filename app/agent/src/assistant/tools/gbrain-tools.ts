import type { PlainToolSet } from '#agent/assistant/plain-tool';
import { publishCallData, type CallDataRoom } from '#agent/data-channel';
import {
  fetchBrainPage,
  queryBrain,
  type GBrainSearchResult,
} from '#agent/gbrain/client';
import { getGBrainConfig } from '#agent/gbrain/config';
import type { CallDataChannelMessage } from '@exe/domain';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

// GBrain integration — assistant (tool-caller) query side. These plain tools
// let the assistant read the per-workspace brain (minutes/transcripts
// accumulated by the ingest side in index.ts) synchronously and return the
// result directly to the calling agent. When GBrain is not configured
// `buildAssistantGBrainTools` returns an empty tool set, so the tools simply do
// not exist and the assistant runs unchanged. Purge steps: gbrain/PURGE.md.

const SEARCH_RESULT_LIMIT = 5;
const SNIPPET_MAX_CHARS = 600;
const PAGE_MAX_CHARS = 6000;
const PUBLISHED_SNIPPET_MAX_CHARS = 300;

const NO_MATCH_MESSAGE = 'No stored memory matched this query.';

const NO_PAGE_MESSAGE =
  'No memory page exists with this slug. Re-run search_workspace_memory and use an exact slug from its results.';

const SEARCH_HEADER =
  'Workspace memory search results (snippets). Read a full page with read_workspace_memory_page(slug) when a snippet is not enough:';

const truncate = (text: string, maxChars: number, suffix: string): string =>
  text.length > maxChars ? `${text.slice(0, maxChars)}${suffix}` : text;

const snippet = (chunkText: string): string =>
  truncate(chunkText.replace(/[\r\n]+/gu, ' '), SNIPPET_MAX_CHARS, '…');

export const formatSearchResults = (
  results: readonly GBrainSearchResult[]
): string => {
  if (results.length === 0) {
    return NO_MATCH_MESSAGE;
  }

  const lines = results.map((result) =>
    result.chunkText === undefined
      ? `- [${result.slug}]`
      : `- [${result.slug}] ${snippet(result.chunkText)}`
  );

  return [SEARCH_HEADER, ...lines].join('\n');
};

export const formatPage = (markdown: string): string => {
  if (markdown.trim().length === 0) {
    return 'The page exists but has no readable content.';
  }

  return truncate(markdown, PAGE_MAX_CHARS, '\n…(truncated)');
};

// Where to stream in-call search activity so the app's GBrain call tab can
// show it live. Optional: without it the tools work exactly as before.
// `lookupId` groups every search of one agent run (plus its optional
// human-readable findings digest) into a single card in the app.
export interface GBrainSearchPublishContext {
  readonly channelId?: string;
  readonly lookupId: string;
  readonly room: CallDataRoom;
  readonly sessionId: string;
  readonly topic: string;
}

const publishedSnippet = (chunkText: string): string =>
  truncate(
    chunkText.replace(/[\r\n]+/gu, ' '),
    PUBLISHED_SNIPPET_MAX_CHARS,
    '…'
  );

const toPublishedResults = (
  results: readonly GBrainSearchResult[]
): { readonly slug: string; readonly snippet?: string }[] =>
  results.map((result) => ({
    slug: result.slug,
    ...(result.chunkText === undefined
      ? {}
      : { snippet: publishedSnippet(result.chunkText) }),
  }));

// Data-channel push is best-effort UI enrichment: a publish failure (or an
// already-closed room) must never fail the search itself.
const publishSearchEvent = ({
  message,
  publishContext,
}: {
  readonly message: CallDataChannelMessage;
  readonly publishContext: GBrainSearchPublishContext;
}): void => {
  void publishCallData({
    message,
    room: publishContext.room,
    topic: publishContext.topic,
  }).catch((): null => null);
};

const searchParametersSchema = z
  .object({
    query: z
      .string()
      .min(1)
      .describe(
        'Standalone search query in the workspace language. Include concrete names, project or channel names, and keywords; avoid pronouns.'
      ),
  })
  .strict();

const readParametersSchema = z
  .object({
    slug: z
      .string()
      .min(1)
      .describe(
        'Exact page slug from a search_workspace_memory result, for example "meetings/2026-06-15-session-abc".'
      ),
  })
  .strict();

export const buildAssistantGBrainTools = ({
  publishContext,
  workspaceId,
}: {
  readonly publishContext?: GBrainSearchPublishContext;
  readonly workspaceId: string;
}): PlainToolSet => {
  const config = getGBrainConfig();

  if (config === null) {
    return {};
  }

  const runSearch = async (query: string): Promise<string> => {
    if (publishContext === undefined) {
      return formatSearchResults(
        await queryBrain({
          config,
          limit: SEARCH_RESULT_LIMIT,
          query,
          workspaceId,
        })
      );
    }

    const search = {
      ...(publishContext.channelId === undefined
        ? {}
        : { channelId: publishContext.channelId }),
      id: randomUUID(),
      lookupId: publishContext.lookupId,
      query,
    };

    publishSearchEvent({
      message: {
        callSessionId: publishContext.sessionId,
        search,
        type: 'gbrain_search_started',
        workspaceId,
      },
      publishContext,
    });

    /* eslint-disable-next-line functional/no-try-statements -- The completed/error push must mirror the search outcome without swallowing the error for the calling model. */
    try {
      const results = await queryBrain({
        config,
        limit: SEARCH_RESULT_LIMIT,
        query,
        workspaceId,
      });

      publishSearchEvent({
        message: {
          callSessionId: publishContext.sessionId,
          search: {
            ...search,
            results: toPublishedResults(results),
            status: 'ok',
          },
          type: 'gbrain_search_completed',
          workspaceId,
        },
        publishContext,
      });

      return formatSearchResults(results);
    } catch (error: unknown) {
      publishSearchEvent({
        message: {
          callSessionId: publishContext.sessionId,
          search: { ...search, results: [], status: 'error' },
          type: 'gbrain_search_completed',
          workspaceId,
        },
        publishContext,
      });

      throw error;
    }
  };

  return {
    read_workspace_memory_page: {
      description:
        'Read one full page from the workspace long-term memory by its exact slug, as returned by search_workspace_memory. Use it when a search snippet looks relevant but you need the full minutes to answer accurately.',
      execute: async (rawArgs): Promise<string> => {
        const args = readParametersSchema.parse(rawArgs);
        const markdown = await fetchBrainPage({
          config,
          slug: args.slug,
          workspaceId,
        });

        return markdown === null ? NO_PAGE_MESSAGE : formatPage(markdown);
      },
      parameters: readParametersSchema,
    },
    search_workspace_memory: {
      description:
        'Search the workspace long-term memory: minutes and transcripts of past calls in this workspace, accumulated across all users and sessions. Use it when the user refers to something that is not in your agenda — a past call, an earlier decision, "what did we say last time about X". Write the query in the workspace language with concrete names, projects, and keywords. Results are snippets with a page slug; call read_workspace_memory_page with the slug when a snippet is not enough. Do not use it for current tasks and channels — those are already in your agenda.',
      execute: (rawArgs): Promise<string> => {
        const args = searchParametersSchema.parse(rawArgs);

        return runSearch(args.query);
      },
      parameters: searchParametersSchema,
    },
  };
};
