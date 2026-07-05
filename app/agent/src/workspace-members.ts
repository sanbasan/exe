import type { SlackWorkspaceMember } from '@exe/domain';

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0;

// Same display-name precedence as the iOS app (SlackWorkspaceMember.displayName),
// so the agent sees people exactly the way the user does on screen.
const resolveMemberDisplayName = (
  member: SlackWorkspaceMember
): string | null =>
  [
    member.profile?.display_name_normalized,
    member.profile?.display_name,
    member.profile?.real_name_normalized,
    member.profile?.real_name,
    member.real_name,
    member.name,
    member.profile?.email,
  ].find(isNonEmptyString) ?? null;

export const buildMemberNameMap = (
  members: readonly SlackWorkspaceMember[]
): ReadonlyMap<string, string> =>
  new Map(
    members.flatMap((member): readonly (readonly [string, string])[] => {
      const displayName = resolveMemberDisplayName(member);

      return member.id !== undefined &&
        member.id !== null &&
        displayName !== null
        ? [[member.id, displayName]]
        : [];
    })
  );
