import ExeDomain
import ExeUI
import SwiftUI

/// Slack `multi_users_select` に相当する共通メンバー選択コンポーネント。
///
/// - 選択済みは chip で表示し、× で外せる（`lockedIds` は外せない）。
/// - 追加はフィールドにフォーカスして検索する autocomplete 方式。
///   Slack user ID を直接入力させたり、全候補を常時羅列したりはしない。
/// - `disabledIds` は候補に出さない（例: 既に管理者の人を編集者候補から除外）。
///
/// メンバー選択 UI はすべてこのコンポーネントに統一する
/// （権限管理 / チャンネル担当者 / タスクの依頼者・担当者）。
struct MemberMultiSelect: View {
    let members: [SlackWorkspaceMember]
    @Binding
    var selection: Set<SlackUserID>
    var lockedIds: Set<SlackUserID> = []
    var disabledIds: Set<SlackUserID> = []
    var currentUserId: SlackUserID?
    var placeholder: String = .init(localized: "Search by name to add")
    @FocusState
    private var isSearchFocused: Bool
    @State
    private var query: String = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            selectionField
            if isSearchFocused {
                candidateList
            }
        }
        .animation(.snappy(duration: 0.18), value: isSearchFocused)
        .animation(.snappy(duration: 0.18), value: selection)
    }

    private var selectionField: some View {
        VStack(alignment: .leading, spacing: 8) {
            if !selectedMembers.isEmpty || !selectionIdsMissingMembers.isEmpty {
                FlowLayout(spacing: 6) {
                    ForEach(selectedMembers) { member in
                        chip(for: member)
                    }
                    ForEach(selectionIdsMissingMembers, id: \.self) { id in
                        rawChip(for: id)
                    }
                }
            }
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                TextField(placeholder, text: $query)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .focused($isSearchFocused)
                if isSearchFocused {
                    Button("Close") {
                        query = ""
                        isSearchFocused = false
                    }
                    .font(.caption.weight(.semibold))
                    .buttonStyle(.plain)
                    .foregroundStyle(.tint)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(
                Color(uiColor: .tertiarySystemGroupedBackground),
                in: RoundedRectangle(cornerRadius: 12, style: .continuous)
            )
        }
    }

    @ViewBuilder
    private var candidateList: some View {
        if trimmedQuery.isEmpty {
        } else if candidates.isEmpty {
            Text("No matching candidates")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .padding(.vertical, 6)
        } else {
            VStack(spacing: 0) {
                ForEach(Array(candidates.enumerated()), id: \.element.id) { index, member in
                    Button {
                        add(member)
                    } label: {
                        candidateRow(member)
                    }
                    .buttonStyle(.plain)
                    if index < candidates.count - 1 {
                        Divider()
                    }
                }
            }
            .background(
                Color(uiColor: .secondarySystemGroupedBackground),
                in: RoundedRectangle(cornerRadius: 12, style: .continuous)
            )
        }
    }
}

private extension MemberMultiSelect {
    private func candidateRow(_ member: SlackWorkspaceMember) -> some View {
        HStack(spacing: 10) {
            MemberAvatarView(member: member, size: 28)
            VStack(alignment: .leading, spacing: 1) {
                Text(displayName(for: member))
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(.primary)
                if let email = member.email {
                    Text(email)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 0)
            Image(systemName: "plus.circle.fill")
                .foregroundStyle(.tint)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
        .contentShape(Rectangle())
    }

    private func chip(for member: SlackWorkspaceMember) -> some View {
        let id = member.slackId ?? ""
        let locked = lockedIds.contains(id)
        return HStack(spacing: 6) {
            MemberAvatarView(member: member, size: 20)
            Text(displayName(for: member))
                .font(.caption.weight(.medium))
                .lineLimit(1)
            if !locked {
                Button {
                    remove(id)
                } label: {
                    Image(systemName: "xmark")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.leading, 4)
        .padding(.trailing, locked ? 10 : 6)
        .padding(.vertical, 4)
        .background(ExeColors.accentSoft, in: Capsule())
    }

    private func rawChip(for id: SlackUserID) -> some View {
        let locked = lockedIds.contains(id)
        return HStack(spacing: 6) {
            Image(systemName: "person.crop.circle")
                .foregroundStyle(.secondary)
            Text("Selected member")
                .font(.caption.weight(.medium))
                .lineLimit(1)
            if !locked {
                Button {
                    remove(id)
                } label: {
                    Image(systemName: "xmark")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(.secondary)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.leading, 8)
        .padding(.trailing, locked ? 10 : 6)
        .padding(.vertical, 4)
        .background(.quaternary, in: Capsule())
    }

    private var selectedMembers: [SlackWorkspaceMember] {
        members
            .filter { member in
                guard let id = member.slackId else { return false }
                return selection.contains(id)
            }
            .sorted { displayName(for: $0).localizedCaseInsensitiveCompare(displayName(for: $1)) == .orderedAscending }
    }

    private var selectionIdsMissingMembers: [SlackUserID] {
        let known = Set(members.compactMap(\.slackId))
        return selection.subtracting(known).sorted()
    }

    private var candidates: [SlackWorkspaceMember] {
        guard !trimmedQuery.isEmpty else {
            return []
        }

        return members
            .filter { member in
                guard let id = member.slackId else { return false }
                return !selection.contains(id) && !disabledIds.contains(id)
            }
            .filter { $0.searchText.contains(trimmedQuery) }
            .sorted { displayName(for: $0).localizedCaseInsensitiveCompare(displayName(for: $1)) == .orderedAscending }
            .prefix(8)
            .map(\.self)
    }

    private var trimmedQuery: String {
        query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    private func displayName(for member: SlackWorkspaceMember) -> String {
        if member.slackId == currentUserId {
            return String(localized: "\(member.displayName) (You)")
        }
        return member.displayName
    }

    private func add(_ member: SlackWorkspaceMember) {
        guard let id = member.slackId else { return }
        selection.insert(id)
        query = ""
    }

    private func remove(_ id: SlackUserID) {
        guard !lockedIds.contains(id) else { return }
        selection.remove(id)
    }
}
