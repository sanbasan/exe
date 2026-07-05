import type { CallEvent, Language } from '@exe/domain';

const getText = (event: CallEvent): string | null =>
  'text' in event.payload ? event.payload.text : null;

export const buildDeterministicSummary = ({
  events,
  language,
}: {
  readonly events: readonly CallEvent[];
  readonly language: Language;
}): string => {
  const transcriptLines = events
    .filter((event) => event.type === 'transcript')
    .map(getText)
    .filter((text): text is string => text !== null);
  const agentLines = events
    .filter((event) => event.type === 'agent_message')
    .map(getText)
    .filter((text): text is string => text !== null);
  const lastUserLine = transcriptLines.at(-1);
  const lastAgentLine = agentLines.at(-1);

  switch (language) {
    case 'en':
      return [
        'The call has ended.',
        `User utterances: ${String(transcriptLines.length)}`,
        `exe utterances: ${String(agentLines.length)}`,
        ...(lastUserLine === undefined
          ? []
          : [`Last user utterance: ${lastUserLine}`]),
        ...(lastAgentLine === undefined
          ? []
          : [`Last exe utterance: ${lastAgentLine}`]),
      ].join('\n');
    case 'ja':
      return [
        '通話が終了しました。',
        `ユーザー発話: ${String(transcriptLines.length)}件`,
        `exe発話: ${String(agentLines.length)}件`,
        ...(lastUserLine === undefined
          ? []
          : [`最後のユーザー発話: ${lastUserLine}`]),
        ...(lastAgentLine === undefined
          ? []
          : [`最後のexe発話: ${lastAgentLine}`]),
      ].join('\n');
  }
};
