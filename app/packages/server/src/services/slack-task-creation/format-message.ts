import type { SlackMessage } from '#server/ports';
import type { Language } from '@exe/domain';

const SLACK_CODE_BLOCK_PATTERN = /```[\s\S]*?```/gu;
const SLACK_URL_WITH_OPTIONAL_LABEL_PATTERN =
  /<((?:[a-z][a-z0-9+.-]*:[^>|]+|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}[^\s>|]*|www\.[^>|]+))(?:\|([^>]+))?>/giu;
const URI_CANDIDATE_PATTERN =
  /\b(?:[a-z][a-z0-9+.-]*:[^\s<>()]+|www\.[^\s<>()]+)/giu;
const SCHEMELESS_DOMAIN_CANDIDATE_PATTERN =
  /(?<![@\w-])(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?:[/?#][^\s<>()]*)?/giu;
const SCHEMELESS_DOMAIN_PATTERN =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}(?:[/?#][^\s<>()]*)?$/iu;

const nonHierarchicalSchemes = new Set([
  'data',
  'file',
  'geo',
  'mailto',
  'slack',
  'slack-calls',
  'sms',
  'tel',
  'urn',
]);

export interface ConversationMember {
  readonly displayName?: string;
  readonly realName?: string;
  readonly slackUserId: string;
}

const maskCodeBlocksInMessageText = (text: string): string =>
  text.replace(SLACK_CODE_BLOCK_PATTERN, '[CODE]');

const isUriLike = (text: string): boolean =>
  /^(?:[a-z][a-z0-9+.-]*:|www\.)/iu.test(text) ||
  SCHEMELESS_DOMAIN_PATTERN.test(text);

const shouldMaskUriCandidate = (candidate: string): boolean => {
  if (/^www\./iu.test(candidate)) {
    return true;
  }

  const schemeMatch = /^([a-z][a-z0-9+.-]*):(.*)$/iu.exec(candidate);
  if (schemeMatch === null) {
    return false;
  }

  const scheme = schemeMatch[1];
  const remainder = schemeMatch[2];
  if (scheme === undefined || remainder === undefined) {
    return false;
  }

  if (remainder.startsWith('//')) {
    return true;
  }

  return nonHierarchicalSchemes.has(scheme.toLowerCase());
};

const maskUrlsInMessageText = (text: string): string => {
  const withMaskedSlackUrls = text.replace(
    SLACK_URL_WITH_OPTIONAL_LABEL_PATTERN,
    (_match: string, _url: string, label?: string): string => {
      if (
        label === undefined ||
        label.trim() === '' ||
        isUriLike(label.trim())
      ) {
        return '[URL]';
      }

      return `${label.trim()} [URL]`;
    }
  );
  const withMaskedUriCandidates = withMaskedSlackUrls.replace(
    URI_CANDIDATE_PATTERN,
    (candidate: string): string =>
      shouldMaskUriCandidate(candidate) ? '[URL]' : candidate
  );

  return withMaskedUriCandidates.replace(
    SCHEMELESS_DOMAIN_CANDIDATE_PATTERN,
    '[URL]'
  );
};

const maskTaskTitleNoiseInMessageText = (text: string): string =>
  maskUrlsInMessageText(maskCodeBlocksInMessageText(text));

const getAttachmentDisplayName = (
  file: NonNullable<SlackMessage['files']>[number]
): string | null => {
  const candidate = file.name ?? file.title;

  if (candidate === undefined || candidate.trim() === '') {
    return null;
  }

  return candidate.trim();
};

const formatAttachmentSummary = (message: SlackMessage): string | null => {
  const files = message.files ?? [];

  if (files.length === 0) {
    return null;
  }

  const names = files.flatMap((file): readonly string[] => {
    const name = getAttachmentDisplayName(file);

    return name === null ? [] : [name];
  });
  const countLabel =
    files.length === 1 ? '1 file' : `${files.length.toString()} files`;

  return names.length === 0
    ? `Attachments: ${countLabel}`
    : `Attachments: ${countLabel}: ${names.join(', ')}`;
};

const localeForLanguage = (language: Language): string =>
  language === 'ja' ? 'ja-JP' : 'en-US';

export const formatMessageForTaskExtraction = ({
  language,
  members,
  message,
  timezone,
}: {
  readonly language: Language;
  readonly members: readonly ConversationMember[];
  readonly message: SlackMessage;
  readonly timezone: string;
}): string => {
  const user = members.find((member) => member.slackUserId === message.user);
  const name = user?.realName ?? user?.displayName ?? message.user;
  const time = new Date(Number.parseFloat(message.ts) * 1000).toLocaleString(
    localeForLanguage(language),
    { timeZone: timezone === '' ? 'UTC' : timezone }
  );
  const body = `[${time}] ${name}: ${maskTaskTitleNoiseInMessageText(message.text)}`;
  const attachmentSummary = formatAttachmentSummary(message);

  return attachmentSummary === null ? body : `${body}\n${attachmentSummary}`;
};
