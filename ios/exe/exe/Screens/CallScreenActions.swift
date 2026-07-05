import ExeAPIClient
import ExeDomain
import ExeLiveKit
import SwiftUI

extension CallScreen {
    private static let agentSafetyNetDelayNanoseconds: UInt64 = 12_000_000_000
    private static let connectRetryDelayNanoseconds: UInt64 = 2_000_000_000
    private static let connectRetryLimitNanoseconds: UInt64 = 60_000_000_000

    func connect() async {
        phase = .connecting
        errorMessage = nil
        do {
            let token = try await composition.liveKitTokenRepository.createToken(
                workspaceId: workspaceId,
                callSessionId: callSessionId
            )
            session = token.session
            try await joinLiveKitWithRetry(token: token.token)
            phase = .active
            scheduleAgentSafetyNet()
        } catch {
            phase = .lobby
            errorMessage = error.localizedDescription
        }
    }

    func endCall() {
        callKitManager?.endActiveCall()
        Swift.Task {
            await liveKitManager.disconnect()
            do {
                session = try await composition.callRepository.transitionSession(
                    workspaceId: workspaceId,
                    callSessionId: callSessionId,
                    status: .ended
                )
            } catch {
                errorMessage = error.localizedDescription
            }
            phase = .ended
        }
    }

    func load() async {
        do {
            async let sessionResult = composition.callRepository.getSession(
                workspaceId: workspaceId,
                callSessionId: callSessionId
            )
            async let memberResult = loadMembers()
            let loaded = try await sessionResult
            members = await memberResult
            session = loaded
            if
                loaded.status == .ended || loaded.status == .failed || loaded.status == .missed || loaded
                    .status == .skipped
            {
                phase = .ended
            } else {
                await connect()
            }
        } catch {
            phase = .error
            errorMessage = error.localizedDescription
        }
    }

    func loadMembers() async -> [SlackWorkspaceMember] {
        do {
            return try await composition.workspaceRepository.listSlackMembers(workspaceId: workspaceId)
        } catch {
            return []
        }
    }

    private func joinLiveKitWithRetry(token: String) async throws {
        var waitedNanoseconds: UInt64 = 0
        let context = LiveKitCallContext(
            workspaceId: workspaceId,
            callSessionId: callSessionId
        )

        while true {
            do {
                try await liveKitManager.join(
                    url: composition.liveKitWsURL.absoluteString,
                    token: token,
                    context: context
                )
                return
            } catch {
                guard waitedNanoseconds < Self.connectRetryLimitNanoseconds else {
                    throw error
                }
                try await Swift.Task.sleep(nanoseconds: Self.connectRetryDelayNanoseconds)
                waitedNanoseconds += Self.connectRetryDelayNanoseconds
            }
        }
    }

    private func scheduleAgentSafetyNet() {
        guard !didRequestAgentSafetyNet else { return }

        Swift.Task {
            try? await Swift.Task.sleep(nanoseconds: Self.agentSafetyNetDelayNanoseconds)

            guard phase == .active, !liveKitManager.isAgentConnected else { return }
            didRequestAgentSafetyNet = true

            do {
                session = try await composition.liveKitTokenRepository.ensureAgent(
                    workspaceId: workspaceId,
                    callSessionId: callSessionId
                )
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }
}
