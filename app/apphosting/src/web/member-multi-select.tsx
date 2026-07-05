'use client';

import { useMemo, useRef, useState, type JSX } from 'react';

// Shared member multi-select. Mirrors the iOS `MemberMultiSelect` component:
// selected members render as removable chips, and members are added by
// focusing a search field and picking from an autocomplete list. This is the
// single component used for every member picker in the web app.

export interface MemberOption {
  readonly displayName: string;
  readonly email?: string;
  readonly slackUserId: string;
}

// eslint-disable-next-line functional/no-mixed-types -- Props mix a change callback with data fields, which is intrinsic to a React component prop bag.
export interface MemberMultiSelectProps {
  readonly members: readonly MemberOption[];
  readonly onChange: (next: readonly string[]) => void;
  readonly placeholder?: string;
  readonly selection: readonly string[];
}

const MAX_CANDIDATES = 8;

const graphemes = (value: string): readonly string[] => Array.from(value);

const initials = (name: string): string => {
  const parts = name
    .trim()
    .split(/\s+/u)
    .filter((part) => part.length > 0);
  const [firstPart] = parts;
  if (firstPart === undefined) {
    return '?';
  }
  const [firstChar] = graphemes(firstPart);
  const first = firstChar ?? '';
  const lastPart = parts.length > 1 ? parts[parts.length - 1] : undefined;
  const [secondChar] = lastPart !== undefined ? graphemes(lastPart) : [];
  const second = secondChar ?? '';
  return (first + second).toUpperCase();
};

const hashHue = (seed: string): number =>
  graphemes(seed).reduce(
    (acc, char) => (acc * 31 + (char.codePointAt(0) ?? 0)) % 360,
    7
  );

const avatarStyle = (
  slackUserId: string
): { readonly backgroundColor: string; readonly color: string } => {
  const hue = hashHue(slackUserId);
  return {
    backgroundColor: `hsl(${String(hue)} 58% 82%)`,
    color: `hsl(${String(hue)} 48% 28%)`,
  };
};

const compareByName = (a: MemberOption, b: MemberOption): number =>
  a.displayName.localeCompare(b.displayName, undefined, {
    sensitivity: 'base',
  });

const matchesQuery = (member: MemberOption, query: string): boolean => {
  const haystack = `${member.displayName} ${member.email ?? ''}`.toLowerCase();
  return haystack.includes(query);
};

const Avatar = ({
  member,
  size,
}: {
  readonly member: MemberOption;
  readonly size: number;
}): JSX.Element => (
  <span
    aria-hidden
    className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold"
    style={{
      ...avatarStyle(member.slackUserId),
      fontSize: `${String(Math.round(size * 0.42))}px`,
      height: `${String(size)}px`,
      width: `${String(size)}px`,
    }}
  >
    {initials(member.displayName)}
  </span>
);

export const MemberMultiSelect = ({
  members,
  onChange,
  placeholder = 'Search by name to add',
  selection,
}: MemberMultiSelectProps): JSX.Element => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const [query, setQuery] = useState('');

  const memberById = useMemo(
    () => new Map(members.map((member) => [member.slackUserId, member])),
    [members]
  );

  const selectedMembers = useMemo(
    () =>
      selection
        .map((id) => memberById.get(id))
        .filter((member): member is MemberOption => member !== undefined)
        .toSorted(compareByName),
    [memberById, selection]
  );

  const trimmedQuery = query.trim().toLowerCase();

  const candidates = useMemo(() => {
    if (trimmedQuery === '') {
      return [];
    }
    const selectedIds = new Set(selection);
    return members
      .filter((member) => !selectedIds.has(member.slackUserId))
      .filter((member) => matchesQuery(member, trimmedQuery))
      .toSorted(compareByName)
      .slice(0, MAX_CANDIDATES);
  }, [members, selection, trimmedQuery]);

  const add = (slackUserId: string): void => {
    if (!selection.includes(slackUserId)) {
      onChange([...selection, slackUserId]);
    }
    setQuery('');
    inputRef.current?.focus();
  };

  const remove = (slackUserId: string): void => {
    onChange(selection.filter((id) => id !== slackUserId));
  };

  const close = (): void => {
    setQuery('');
    setFocused(false);
    inputRef.current?.blur();
  };

  const showCandidates = focused && trimmedQuery !== '';

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-2">
        {selectedMembers.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {selectedMembers.map((member) => (
              <span
                className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft py-1 pl-1 pr-1.5 text-xs font-medium text-ink transition"
                key={member.slackUserId}
              >
                <Avatar member={member} size={20} />
                <span className="max-w-40 truncate">{member.displayName}</span>
                <button
                  aria-label={`Remove ${member.displayName}`}
                  className="flex h-4 w-4 items-center justify-center rounded-full text-muted transition hover:text-ink"
                  onClick={() => {
                    remove(member.slackUserId);
                  }}
                  type="button"
                >
                  <svg
                    aria-hidden
                    className="h-3 w-3"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeWidth={2.5}
                    viewBox="0 0 24 24"
                  >
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <div className="flex items-center gap-2 rounded-xl bg-canvas px-3 py-2.5">
          <svg
            aria-hidden
            className="h-4 w-4 shrink-0 text-muted"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted"
            onBlur={() => {
              setFocused(false);
            }}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
            onFocus={() => {
              setFocused(true);
            }}
            placeholder={placeholder}
            ref={inputRef}
            type="text"
            value={query}
          />
          {focused ? (
            <button
              className="shrink-0 text-xs font-bold text-accent"
              onMouseDown={(event) => {
                event.preventDefault();
                close();
              }}
              type="button"
            >
              Close
            </button>
          ) : null}
        </div>
      </div>
      {showCandidates ? (
        candidates.length === 0 ? (
          <p className="px-1 py-1.5 text-xs text-muted">
            No matching candidates
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-line bg-white">
            {candidates.map((member, index) => (
              <button
                className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition hover:bg-canvas ${index > 0 ? 'border-t border-line' : ''}`}
                key={member.slackUserId}
                onClick={() => {
                  add(member.slackUserId);
                }}
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                type="button"
              >
                <Avatar member={member} size={28} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium text-ink">
                    {member.displayName}
                  </span>
                  {member.email !== undefined && member.email !== '' ? (
                    <span className="truncate text-xs text-muted">
                      {member.email}
                    </span>
                  ) : null}
                </span>
                <svg
                  aria-hidden
                  className="h-5 w-5 shrink-0 text-accent"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 8v8M8 12h8" />
                </svg>
              </button>
            ))}
          </div>
        )
      ) : null}
    </div>
  );
};
