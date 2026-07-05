import {
  countOpenTasksByAssignee,
  getOverloadThreshold,
  isOpenTaskStatus,
  isWorkTask,
  type CallSession,
  type Language,
  type Task,
  type WorkTask,
} from '@exe/domain';

// Composes the agenda triage note for automatically triggered calls. The note
// is rendered verbatim into the voice agent's prompt, so it addresses the
// agent directly. Member references use Slack user IDs; the agent resolves
// display names from its own member list.

const findWorkTask = (
  tasks: readonly Task[],
  taskId: string
): WorkTask | undefined =>
  tasks.filter(isWorkTask).find((task) => task.id === taskId);

const buildBlockerNote = ({
  language,
  session,
  tasks,
}: {
  readonly language: Language;
  readonly session: CallSession;
  readonly tasks: readonly Task[];
}): string | undefined => {
  if (session.focusTaskId === undefined) {
    return undefined;
  }

  const blocker = findWorkTask(tasks, session.focusTaskId);

  if (blocker === undefined) {
    return undefined;
  }

  const blockedTitles = blocker.dependentTaskIds
    .map((taskId) => findWorkTask(tasks, taskId))
    .filter(
      (task): task is WorkTask =>
        task !== undefined && isOpenTaskStatus(task.status)
    )
    .map((task) => `「${task.title}」`);
  const blockedList = blockedTitles.join(language === 'ja' ? '、' : ', ');

  return language === 'ja'
    ? `あなたはタスク「${blocker.title}」が ${String(
        blockedTitles.length
      )} 件のタスク(${blockedList})を待たせていることに気づき、自分の判断でこの電話をかけました。同僚が「あの件、ちょっと気になって」と電話するのと同じトーンで、用件を自然に切り出してください。完了見込み・前倒しの可否・他の人への引き継ぎ可否を会話の流れで確認し、決まったことはタスク更新として記録します。「自動」「システム」「発信理由」のような機械的な言い回しは一切使わないこと — あなた自身が気になって連絡した、それだけです。`
    : `You noticed that the task "${blocker.title}" is keeping ${String(
        blockedTitles.length
      )} other tasks waiting (${blockedList}), and you decided to call about it — the way a colleague rings someone about a thing that's been on their mind. Open naturally with that concern, then work through when it will be done, whether it can be accelerated or handed off, and record what gets decided as task updates. Never use mechanical phrasing like "automated call", "the system", or "reason for this call" — you simply cared enough to call.`;
};

const buildOverloadNote = ({
  language,
  tasks,
}: {
  readonly language: Language;
  readonly tasks: readonly Task[];
}): string | undefined => {
  const counts = countOpenTasksByAssignee({ tasks });
  const threshold = getOverloadThreshold({ counts });
  const loadLines = [...counts.entries()]
    .toSorted((left, right) => right[1] - left[1])
    .map(([slackUserId, count]) => `<@${slackUserId}>: ${String(count)}`)
    .join(', ');

  return language === 'ja'
    ? `あなたはこの人のタスクが積み上がりすぎていることに気づき、少し軽くできないかと思って自分の判断でこの電話をかけました。「最近タスク溜まってません？大丈夫ですか」と気にかける同僚のトーンで自然に切り出してください。参考(あなただけの内部情報、読み上げ禁止): 負荷の目安は ${String(
        threshold
      )} 件、現在の各メンバーの未完了タスク数 — ${loadLines}。タスクを一つずつ見ながら、description を手がかりに「他の人に振れるもの」「手放せるもの」を一緒に探し、担当変更や期日変更を提案してください。無理に全部は動かさず、本人の合意を得ながら。引き継ぎが決まったタスクは、その場で聞き取りをする: 今どこまで進んでいるか、次の一歩、資料やコードの場所、ハマりどころ。背景ノート(GBrain)が不明点を示したらそれも聞く。この会話の内容がそのまま引き継ぎ書になって新しい担当者に渡るので、聞き漏らしは引き継ぎ書の穴になります。「自動」「システム」「過負荷ライン」のような機械的な言い回しは会話で一切使わないこと。`
    : `You noticed this person's task pile has grown too heavy, and you decided to call to see if you can lighten it — open the way a colleague would: "you seem swamped lately, everything okay?". For your eyes only (never read aloud): the load guideline is ${String(
        threshold
      )} open tasks; current per-member counts — ${loadLines}. Walk through their tasks together, using each description to spot what could be handed to someone else or dropped, and propose reassignments or due-date changes — only what they agree to. For every task they agree to hand off, do the handover interview on the spot: current state, the concrete next step, where the materials/code live, the gotchas. If background (GBrain) notes flag unknowns, ask those too. This conversation becomes the handover document for the new assignee, so anything you fail to ask becomes a hole in it. Never use mechanical phrasing like "automated", "the system", or "overload threshold" in conversation.`;
};

export const buildCallTriageNote = ({
  language,
  session,
  tasks,
}: {
  readonly language: Language;
  readonly session: CallSession;
  readonly tasks: readonly Task[];
}): string | undefined => {
  switch (session.trigger) {
    case 'blocker':
      return buildBlockerNote({ language, session, tasks });
    case 'overload':
      return buildOverloadNote({ language, tasks });
    case undefined:
      return undefined;
  }
};
