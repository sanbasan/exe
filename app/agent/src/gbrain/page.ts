/* eslint-disable max-lines -- The page's frontmatter, body, and enrichment helpers are kept together so the meeting-page format is reviewed in one place. */
import type { CallDecisions } from '#agent/gbrain/decisions';
import type { ComposedCallPageSummary } from '#agent/gbrain/summarize';
import type { CallAgenda, CallEvent, CallSession, Language } from '@exe/domain';

// Builds a GBrain "meeting" page from a finished call. Follows GBrain's
// meeting-ingestion format: the agent's summary above the bar, the full
// diarized transcript below it (who said what, when). The slug is derived
// deterministically from the session id so re-ingesting the same call
// overwrites its page rather than duplicating it.

export interface GBrainPage {
  readonly slug: string;
  readonly markdown: string;
}

const DEFAULT_TIMEZONE = 'Asia/Tokyo';

const yamlString = (value: string): string => JSON.stringify(value);

const formatDate = (iso: string, timeZone: string): string => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone,
    year: 'numeric',
  });

  return formatter.format(new Date(iso));
};

const formatTime = (iso: string, timeZone: string): string => {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    second: '2-digit',
    timeZone,
  });

  return formatter.format(new Date(iso));
};

const getEventText = (event: CallEvent): string | null =>
  'text' in event.payload ? event.payload.text : null;

const getSummary = (events: readonly CallEvent[]): string | null => {
  const summaryEvent = events.find((event) => event.type === 'summary');

  if (summaryEvent === undefined || !('summary' in summaryEvent.payload)) {
    return null;
  }

  return summaryEvent.payload.summary;
};

interface PageLabels {
  readonly agentSpeaker: string;
  readonly decisionsHeading: string;
  readonly linksLabel: string;
  readonly noSummary: string;
  readonly participant: string;
  readonly participantFallback: string;
  readonly period: string;
  readonly purpose: string;
  readonly summaryHeading: string;
  readonly titlePrefix: string;
  readonly transcriptHeading: string;
  readonly userSpeaker: string;
}

const getLabels = (language: Language): PageLabels => {
  switch (language) {
    case 'en':
      return {
        agentSpeaker: 'Exe',
        decisionsHeading: 'Decisions',
        linksLabel: 'Links',
        noSummary: '(no summary)',
        participant: 'Participant',
        participantFallback: 'Participant',
        period: 'When',
        purpose: 'Purpose',
        summaryHeading: 'Summary',
        titlePrefix: 'Call',
        transcriptHeading: 'Transcript',
        userSpeaker: 'User',
      };
    case 'ja':
      return {
        agentSpeaker: 'Exe',
        decisionsHeading: '決定事項',
        linksLabel: '関連',
        noSummary: '(サマリなし)',
        participant: '参加者',
        participantFallback: '参加者',
        period: '日時',
        purpose: '目的',
        summaryHeading: 'サマリ',
        titlePrefix: '通話',
        transcriptHeading: '会話ログ',
        userSpeaker: 'ユーザー',
      };
  }
};

const slugifyTag = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/gu, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '');

const buildTags = ({
  decisions,
  purpose,
  resolvedParticipantName,
}: {
  readonly decisions: CallDecisions;
  readonly purpose: string;
  readonly resolvedParticipantName?: string;
}): readonly string[] =>
  [
    ...new Set([
      'exe-call',
      slugifyTag(purpose),
      ...(resolvedParticipantName === undefined
        ? []
        : [slugifyTag(resolvedParticipantName)]),
      ...decisions.channelNames.map(slugifyTag),
      ...decisions.outcomeTags,
    ]),
  ].filter((tag) => tag.length > 0);

// Mirrors the router's read-path slug charset (`/page`), per path segment: the
// engine only reads back ASCII slugs, so non-ASCII entity keys can never resolve.
const isAsciiSlugSegment = (value: string): boolean =>
  /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u.test(value);

export interface GBrainEntityRef {
  readonly kind: 'channel' | 'person';
  readonly slug: string;
  readonly title: string;
}

// Derives the stable entity references a call page links to. Person keys use the
// Slack user id (display names change); channel keys use the slugified name.
// Non-ASCII keys are dropped so every emitted wikilink is readable back.
const buildEntityRefs = ({
  agenda,
  decisions,
  memberNames,
}: {
  readonly agenda: CallAgenda | null;
  readonly decisions: CallDecisions;
  readonly memberNames: ReadonlyMap<string, string>;
}): readonly GBrainEntityRef[] => [
  ...(agenda !== null && isAsciiSlugSegment(agenda.slackUserId)
    ? [
        {
          kind: 'person' as const,
          // Lowercased: `gbrain put` fails on uppercase slugs (the page write
          // and its tag reconcile disagree on the slug key). Slack user IDs
          // are uppercase-only, so lowercasing cannot collide.
          slug: `wiki/people/${agenda.slackUserId.toLowerCase()}`,
          title:
            agenda.speakerName ??
            memberNames.get(agenda.slackUserId) ??
            agenda.slackUserId,
        },
      ]
    : []),
  ...decisions.channelNames.flatMap((name): readonly GBrainEntityRef[] => {
    const slugified = slugifyTag(name);

    return isAsciiSlugSegment(slugified)
      ? [
          {
            kind: 'channel',
            slug: `wiki/channels/${slugified}`,
            title: `#${name}`,
          },
        ]
      : [];
  }),
];

const buildWikilinks = (
  entityRefs: readonly GBrainEntityRef[]
): readonly string[] => entityRefs.map((ref) => `[[${ref.slug}]]`);

// Renders the create-if-absent stub pages for a call's entities. The engine only
// materializes graph edges from wikilinks whose target page already exists, so
// these must be ingested before the call page that links to them.
export const buildEntityPages = ({
  agenda,
  decisions,
  language,
  memberNames,
}: {
  readonly agenda: CallAgenda | null;
  readonly decisions: CallDecisions;
  readonly language: Language;
  readonly memberNames: ReadonlyMap<string, string>;
}): readonly GBrainPage[] => {
  const sentence =
    language === 'ja'
      ? 'Exe の通話記録から自動作成されたエンティティページ。'
      : 'Entity page auto-created from Exe call records.';

  return buildEntityRefs({ agenda, decisions, memberNames }).map((ref) => ({
    markdown: [
      '---',
      `type: ${ref.kind}`,
      `title: ${yamlString(ref.title)}`,
      'tags: ["exe-entity"]',
      'source: exe-call',
      '---',
      '',
      `# ${ref.title}`,
      '',
      sentence,
    ].join('\n'),
    slug: ref.slug,
  }));
};

const buildTranscriptLines = ({
  agenda,
  events,
  labels,
  timeZone,
}: {
  readonly agenda: CallAgenda | null;
  readonly events: readonly CallEvent[];
  readonly labels: PageLabels;
  readonly timeZone: string;
}): readonly string[] =>
  events
    .filter(
      (event) => event.type === 'transcript' || event.type === 'agent_message'
    )
    .map((event) => {
      const text = getEventText(event);

      if (text === null) {
        return null;
      }

      const speaker =
        event.type === 'transcript'
          ? (agenda?.speakerName ?? labels.userSpeaker)
          : labels.agentSpeaker;
      const time = formatTime(event.createdAt, timeZone);

      return `- **${speaker}** (${time}): ${text}`;
    })
    .filter((line): line is string => line !== null);

const resolveParticipantName = ({
  agenda,
  memberNames,
}: {
  readonly agenda: CallAgenda | null;
  readonly memberNames: ReadonlyMap<string, string>;
}): string | undefined =>
  agenda?.speakerName ??
  (agenda === null ? undefined : memberNames.get(agenda.slackUserId));

const buildFrontmatter = ({
  agenda,
  date,
  language,
  resolvedParticipantName,
  session,
  startIso,
  tags,
  title,
}: {
  readonly agenda: CallAgenda | null;
  readonly date: string;
  readonly language: Language;
  readonly resolvedParticipantName?: string;
  readonly session: CallSession;
  readonly startIso: string;
  readonly tags: readonly string[];
  readonly title: string;
}): readonly string[] => [
  '---',
  'type: meeting',
  `title: ${yamlString(title)}`,
  `tags: [${tags.map(yamlString).join(', ')}]`,
  `id: ${yamlString(session.id)}`,
  `date: ${yamlString(date)}`,
  ...(resolvedParticipantName === undefined
    ? []
    : [`participant: ${yamlString(resolvedParticipantName)}`]),
  `user_id: ${yamlString(session.userId)}`,
  ...(agenda?.slackUserId === undefined
    ? []
    : [`slack_user_id: ${yamlString(agenda.slackUserId)}`]),
  `purpose: ${yamlString(session.purpose)}`,
  `language: ${yamlString(language)}`,
  `started_at: ${yamlString(startIso)}`,
  ...(session.endedAt === undefined
    ? []
    : [`ended_at: ${yamlString(session.endedAt)}`]),
  'source: exe-call',
  '---',
];

const buildBody = ({
  date,
  decisions,
  labels,
  participantName,
  session,
  startIso,
  summary,
  title,
  transcriptLines,
  wikilinks,
}: {
  readonly date: string;
  readonly decisions: CallDecisions;
  readonly labels: PageLabels;
  readonly participantName: string;
  readonly session: CallSession;
  readonly startIso: string;
  readonly summary: string;
  readonly title: string;
  readonly transcriptLines: readonly string[];
  readonly wikilinks: readonly string[];
}): readonly string[] => [
  `# ${title}`,
  '',
  `**${labels.participant}:** ${participantName}`,
  `**${labels.period}:** ${startIso}${
    session.endedAt === undefined ? '' : ` 〜 ${session.endedAt}`
  }`,
  `**${labels.purpose}:** ${session.purpose}`,
  '',
  `## ${labels.summaryHeading}`,
  summary,
  '',
  ...(decisions.lines.length === 0
    ? []
    : [`## ${labels.decisionsHeading}`, ...decisions.lines, '']),
  `## ${labels.transcriptHeading}`,
  ...(transcriptLines.length === 0 ? ['—'] : transcriptLines),
  '',
  ...(wikilinks.length === 0
    ? []
    : [`${labels.linksLabel}: ${wikilinks.join(' ')}`, '']),
  `[Source: Exe call ${session.id}, ${date}]`,
];

export const buildCallPage = ({
  agenda,
  composed,
  decisions,
  events,
  language,
  memberNames,
  session,
}: {
  readonly agenda: CallAgenda | null;
  readonly composed: ComposedCallPageSummary | null;
  readonly decisions: CallDecisions;
  readonly events: readonly CallEvent[];
  readonly language: Language;
  readonly memberNames: ReadonlyMap<string, string>;
  readonly session: CallSession;
}): GBrainPage => {
  const labels = getLabels(language);
  const timeZone = agenda?.timezone ?? DEFAULT_TIMEZONE;
  const startIso = session.startedAt ?? session.createdAt;
  const date = formatDate(startIso, timeZone);
  const resolvedParticipantName = resolveParticipantName({
    agenda,
    memberNames,
  });
  const participantName = resolvedParticipantName ?? labels.participantFallback;
  const title =
    composed?.title ?? `${labels.titlePrefix} ${date} — ${participantName}`;
  const summary = composed?.summary ?? getSummary(events) ?? labels.noSummary;

  const tags = buildTags({
    decisions,
    purpose: session.purpose,
    ...(resolvedParticipantName === undefined
      ? {}
      : { resolvedParticipantName }),
  });

  const transcriptLines = buildTranscriptLines({
    agenda,
    events,
    labels,
    timeZone,
  });

  const frontmatter = buildFrontmatter({
    agenda,
    date,
    language,
    ...(resolvedParticipantName === undefined
      ? {}
      : { resolvedParticipantName }),
    session,
    startIso,
    tags,
    title,
  });

  const wikilinks = buildWikilinks(
    buildEntityRefs({ agenda, decisions, memberNames })
  );

  const body = buildBody({
    date,
    decisions,
    labels,
    participantName,
    session,
    startIso,
    summary,
    title,
    transcriptLines,
    wikilinks,
  });

  return {
    markdown: [...frontmatter, '', ...body].join('\n'),
    slug: `meetings/call-${session.id}`,
  };
};
