import ExeAPIClient
import ExeDomain
import ExeUI
import SwiftUI

struct SignInScreen: View {
    @Environment(AppComposition.self)
    private var composition
    @State
    private var code: String = ""
    @State
    private var email: String = ""
    @State
    private var errorMessage: String?
    @State
    private var isBusy: Bool = false
    @State
    private var phase: Phase = .email

    enum Phase {
        case code
        case email
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Sign in")
                        .font(.largeTitle.weight(.bold))
                    Text(phase == .code ? "Enter the code we sent you." : "Sign in with your email address.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                VStack(spacing: 14) {
                    TextField("Email", text: $email)
                        .textContentType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .keyboardType(.emailAddress)
                        .autocorrectionDisabled()
                        .padding(.horizontal, 18)
                        .frame(height: 56)
                        .exeGlassBackground(shape: .capsule)

                    if phase == .code {
                        TextField("Code", text: $code)
                            .keyboardType(.numberPad)
                            .textContentType(.oneTimeCode)
                            .padding(.horizontal, 18)
                            .frame(height: 56)
                            .exeGlassBackground(shape: .capsule)
                    }
                }

                if let errorMessage {
                    InlineErrorView(errorMessage)
                }

                Button(action: submit) {
                    Group {
                        if isBusy {
                            ProgressView()
                                .tint(canSubmit ? .white : .secondary)
                        } else {
                            Text(buttonTitle)
                                .font(.headline.weight(.semibold))
                        }
                    }
                    .foregroundStyle(canSubmit ? Color.white : Color.secondary)
                    .frame(maxWidth: .infinity)
                    .frame(height: 56)
                    .background {
                        if canSubmit {
                            Capsule()
                                .fill(ExeColors.accent)
                        } else {
                            Capsule()
                                .fill(.ultraThinMaterial)
                        }
                    }
                }
                .buttonStyle(.plain)
                .disabled(isBusy || !canSubmit)
            }
            .padding(.horizontal, 20)
            .padding(.top, 40)
        }
        .background(ExeColors.background.ignoresSafeArea())
        .navigationTitle("Sign in")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var buttonTitle: LocalizedStringKey {
        switch phase {
            case .code:
                "Sign in"
            case .email:
                "Send code"
        }
    }

    private var canSubmit: Bool {
        switch phase {
            case .code:
                !email.isEmpty && code.count == 6
            case .email:
                email.contains("@")
        }
    }

    private func submit() {
        errorMessage = nil
        isBusy = true
        Swift.Task {
            defer { isBusy = false }
            do {
                switch phase {
                    case .code:
                        let token = try await composition.authService.verifyCode(email: email, code: code)
                        try await composition.authService.signIn(customToken: token)
                    case .email:
                        try await composition.authService.sendCode(email: email)
                        phase = .code
                }
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }
}
