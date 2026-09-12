import PhotosUI
import QuickLook
import SwiftUI
import UIKit
import UniformTypeIdentifiers

private struct InternalConversation: Identifiable, Hashable {
    let recipientId: String
    let displayName: String
    let avatarData: Data?
    let subject: String
    let preview: String
    let sentAt: String
    let unreadCount: Int

    var id: String { recipientId }
}

struct MessageCenterView: View {
    @EnvironmentObject private var app: AppState
    @State private var searchText = ""
    @State private var showsUnreadOnly = false
    @State private var showsNewMessage = false
    @State private var didRestorePresentation = false
    @State private var previewConversation: InternalConversation?
    @State private var didOpenPreviewConversation = false

    private var currentUserId: String { app.user?.userId ?? "" }
    private var presentationIdentifier: String { app.user?.userId ?? app.user?.loginName ?? "anonymous" }

    private var conversations: [InternalConversation] {
        var groups: [String: [InternalMessage]] = [:]
        for message in app.internalMessages {
            let key = counterpartId(for: message)
            guard !key.isEmpty else { continue }
            groups[key, default: []].append(message)
        }
        return groups.map { key, messages in
            let ordered = messages.sorted { $0.sentAt < $1.sentAt }
            let latest = ordered.last
            let user = app.internalMessageUsers.first { $0.userId == key }
            let fallbackName = latest.flatMap { message in
                message.senderId == currentUserId ? message.recipientName : message.senderName
            }
            let name = key == "__ALL__" ? "全体员工群聊" : (user?.resolvedName ?? fallbackName ?? "同事")
            let unread = ordered.filter {
                $0.received == 1 && $0.viewerStatus == "UNREAD" && $0.senderId != currentUserId
            }.count
            return InternalConversation(
                recipientId: key,
                displayName: name,
                avatarData: app.internalMessageAvatarData[key],
                subject: latest?.subject ?? "站内沟通",
                preview: latest.map(latestPreview) ?? "暂无消息",
                sentAt: latest?.sentAt ?? "",
                unreadCount: unread
            )
        }
        .filter { conversation in
            (!showsUnreadOnly || conversation.unreadCount > 0)
                && (searchText.isEmpty
                    || conversation.displayName.localizedCaseInsensitiveContains(searchText)
                    || conversation.preview.localizedCaseInsensitiveContains(searchText))
        }
        .sorted { $0.sentAt > $1.sentAt }
    }

    var body: some View {
        VStack(spacing: 0) {
            Picker("消息筛选", selection: $showsUnreadOnly) {
                Text("全部").tag(false)
                Text("未读").tag(true)
            }
            .pickerStyle(.segmented)
            .padding(.horizontal)
            .padding(.vertical, 8)

            if app.isLoadingMessages && app.internalMessages.isEmpty {
                Spacer()
                ProgressView("正在读取站内信息")
                Spacer()
            } else if conversations.isEmpty {
                ContentUnavailableView(
                    showsUnreadOnly ? "没有未读信息" : "暂无站内信息",
                    systemImage: "bubble.left.and.bubble.right",
                    description: Text("点击右上角发起与同事的站内沟通")
                )
            } else {
                List(conversations) { conversation in
                    NavigationLink(destination: ChatConversationView(conversation: conversation)) {
                        InternalConversationRow(conversation: conversation)
                    }
                }
                .listStyle(.plain)
                .refreshable { await app.loadInternalMessages() }
            }
        }
        .background(Color(uiColor: .systemBackground))
        .navigationTitle("信息")
        .navigationBarTitleDisplayMode(.inline)
        .searchable(text: $searchText, prompt: "搜索联系人或聊天内容")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button { showsNewMessage = true } label: {
                    Image(systemName: "square.and.pencil")
                }
                .accessibilityLabel("新建站内信息")
            }
        }
        .sheet(isPresented: $showsNewMessage) {
            NewInternalMessageView()
        }
        .navigationDestination(item: $previewConversation) { conversation in
            ChatConversationView(conversation: conversation)
        }
        .onAppear {
            guard !didRestorePresentation else { return }
            searchText = MessagePresentationStore.searchText(identifier: presentationIdentifier)
            showsUnreadOnly = MessagePresentationStore.showsUnreadOnly(identifier: presentationIdentifier)
            didRestorePresentation = true
        }
        .onChange(of: searchText) { _, value in
            guard didRestorePresentation else { return }
            MessagePresentationStore.saveSearchText(value, identifier: presentationIdentifier)
        }
        .onChange(of: showsUnreadOnly) { _, value in
            guard didRestorePresentation else { return }
            MessagePresentationStore.saveShowsUnreadOnly(value, identifier: presentationIdentifier)
        }
        .task {
            await app.loadInternalMessages()
            guard ProcessInfo.processInfo.arguments.contains("-preview-open-conversation"),
                  !didOpenPreviewConversation else { return }
            didOpenPreviewConversation = true
            previewConversation = conversations.first { $0.displayName == "李经理" }
                ?? conversations.first
        }
    }

    private func counterpartId(for message: InternalMessage) -> String {
        if message.recipientId == "__ALL__" { return "__ALL__" }
        return message.senderId == currentUserId ? message.recipientId : message.senderId
    }

    private func latestPreview(_ message: InternalMessage) -> String {
        let value = message.content.trimmingCharacters(in: .whitespacesAndNewlines)
        let content = value.isEmpty
            ? message.attachments.first.map { "[附件] \($0.fileName)" } ?? "暂无消息"
            : value.replacingOccurrences(of: "\n", with: " ")
        return message.senderId == currentUserId ? "我：\(content)" : content
    }
}

private struct InternalConversationRow: View {
    let conversation: InternalConversation

    var body: some View {
        HStack(spacing: 12) {
            ZStack(alignment: .topTrailing) {
                Group {
                    if let avatarData = conversation.avatarData,
                       let image = UIImage(data: avatarData) {
                        Image(uiImage: image)
                            .resizable()
                            .scaledToFill()
                    } else {
                        Text(initials(conversation.displayName))
                            .font(.headline)
                            .foregroundStyle(.white)
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                            .background(Color.quadTeal)
                    }
                }
                .frame(width: 48, height: 48)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                if conversation.unreadCount > 0 {
                    Text("\(conversation.unreadCount)")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(.white)
                        .padding(5)
                        .background(Color.quadRose, in: Circle())
                        .offset(x: 7, y: -7)
                }
            }
            VStack(alignment: .leading, spacing: 5) {
                HStack {
                    Text(conversation.displayName).font(.headline)
                    Spacer()
                    Text(chatTime(conversation.sentAt)).font(.caption2).foregroundStyle(.secondary)
                }
                Text(conversation.preview)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
        .padding(.vertical, 4)
    }

    private func initials(_ value: String) -> String {
        String(value.replacingOccurrences(of: " ", with: "").prefix(2))
    }
}

private struct NewInternalMessageView: View {
    @EnvironmentObject private var app: AppState
    @Environment(\.dismiss) private var dismiss
    @State private var recipientId = ""
    @State private var subject = "站内沟通"
    @State private var content = ""

    var body: some View {
        NavigationStack {
            Form {
                Section("接收人") {
                    Picker("同事", selection: $recipientId) {
                        Text("请选择").tag("")
                        Text("全体员工群聊").tag("__ALL__")
                        ForEach(app.internalMessageUsers) { user in
                            Text(user.resolvedName).tag(user.userId)
                        }
                    }
                    TextField("主题", text: $subject)
                }
                Section("消息内容") {
                    TextEditor(text: $content).frame(minHeight: 150)
                }
            }
            .navigationTitle("新建信息")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: { Image(systemName: "xmark") }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button {
                        Task {
                            if await app.sendInternalMessage(recipientId: recipientId, subject: subject, text: content) {
                                dismiss()
                            }
                        }
                    } label: { Image(systemName: "paperplane.fill") }
                    .buttonStyle(.borderedProminent)
                    .disabled(recipientId.isEmpty || content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }
}

private struct ChatConversationView: View {
    @EnvironmentObject private var app: AppState
    let conversation: InternalConversation

    @StateObject private var voiceRecorder = ChatVoiceRecorder()
    @StateObject private var speechInput = ChatSpeechInput()
    @State private var text = ""
    @State private var usesVoiceMessage = false
    @State private var showsAttachmentTray = false
    @State private var showsFileImporter = false
    @State private var selectedPhoto: PhotosPickerItem?
    @State private var didRestoreDraft = false
    @FocusState private var isTextFocused: Bool

    private var currentUserId: String { app.user?.userId ?? "" }
    private var presentationIdentifier: String { app.user?.userId ?? app.user?.loginName ?? "anonymous" }
    private var bottomAnchorId: String { "conversation-bottom-\(conversation.recipientId)" }
    private var messages: [InternalMessage] {
        app.internalMessages.filter { message in
            if conversation.recipientId == "__ALL__" { return message.recipientId == "__ALL__" }
            return (message.senderId == currentUserId && message.recipientId == conversation.recipientId)
                || (message.senderId == conversation.recipientId && message.recipientId == currentUserId)
        }
        .sorted { $0.sentAt < $1.sentAt }
    }
    private var pendingMessages: [PendingInternalMessage] {
        app.pendingInternalMessages
            .filter { $0.recipientId == conversation.recipientId }
            .sorted { $0.queuedAt < $1.queuedAt }
    }
    private var timelineCount: Int { messages.count + pendingMessages.count }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(spacing: 14) {
                    Text("站内信息受企业账号权限保护")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(Color(uiColor: .systemGray5), in: Capsule())
                    ForEach(messages) { message in
                        ChatMessageRow(
                            message: message,
                            isOutgoing: message.senderId == currentUserId,
                            peerName: conversation.displayName,
                            peerAvatarData: app.internalMessageAvatarData[conversation.recipientId],
                            currentUserName: app.displayedProfileName,
                            currentUserAvatarData: app.profileAvatarData
                                ?? app.internalMessageAvatarData[currentUserId]
                        )
                        .id(message.id)
                    }
                    ForEach(pendingMessages) { message in
                        PendingChatMessageRow(
                            message: message,
                            currentUserName: app.displayedProfileName,
                            currentUserAvatarData: app.profileAvatarData
                                ?? app.internalMessageAvatarData[currentUserId],
                            retry: { app.retryPendingInternalMessage(message.id) }
                        )
                        .id(message.id)
                    }
                    Color.clear.frame(height: 1).id(bottomAnchorId)
                }
                .padding()
            }
            .background(Color(uiColor: .systemGray6))
            .defaultScrollAnchor(.bottom)
            .onChange(of: timelineCount) { _, _ in
                withAnimation { proxy.scrollTo(bottomAnchorId, anchor: .bottom) }
            }
            .task {
                await Task.yield()
                proxy.scrollTo(bottomAnchorId, anchor: .bottom)
                await app.markConversationRead(recipientId: conversation.recipientId)
                try? await Task.sleep(for: .milliseconds(120))
                proxy.scrollTo(bottomAnchorId, anchor: .bottom)
            }
        }
        .navigationTitle(conversation.displayName)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar(.hidden, for: .tabBar)
        .safeAreaInset(edge: .bottom, spacing: 0) { composer }
        .fileImporter(isPresented: $showsFileImporter, allowedContentTypes: [.item]) { result in
            guard case .success(let url) = result else { return }
            Task { await sendFile(url) }
        }
        .onChange(of: selectedPhoto) { _, item in
            guard let item else { return }
            Task { await sendPhoto(item) }
        }
        .onChange(of: speechInput.transcript) { _, value in text = value }
        .onAppear {
            guard !didRestoreDraft else { return }
            text = MessagePresentationStore.draft(
                identifier: presentationIdentifier,
                conversationId: conversation.recipientId
            )
            didRestoreDraft = true
        }
        .onChange(of: text) { _, value in
            guard didRestoreDraft else { return }
            MessagePresentationStore.saveDraft(
                value,
                identifier: presentationIdentifier,
                conversationId: conversation.recipientId
            )
        }
        .onDisappear {
            voiceRecorder.cancel()
            speechInput.stop()
        }
    }

    private var composer: some View {
        VStack(spacing: 8) {
            HStack(alignment: .bottom, spacing: 8) {
                Button {
                    usesVoiceMessage.toggle()
                    showsAttachmentTray = false
                    if usesVoiceMessage { isTextFocused = false } else { isTextFocused = true }
                } label: {
                    Image(systemName: usesVoiceMessage ? "keyboard" : "waveform.circle")
                }
                .buttonStyle(.bordered)
                .buttonBorderShape(.circle)

                if usesVoiceMessage {
                    Button {
                        Task { await toggleVoiceMessage() }
                    } label: {
                        HStack {
                            if voiceRecorder.isRecording { Image(systemName: "waveform") }
                            Text(voiceRecorder.isRecording ? "停止并发送 \(Int(voiceRecorder.elapsed))秒" : "点击开始说话")
                                .fontWeight(.semibold)
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(voiceRecorder.isRecording ? Color.quadRose : Color.quadTeal)
                } else {
                    TextField("输入消息", text: $text, axis: .vertical)
                        .lineLimit(1...4)
                        .textFieldStyle(.roundedBorder)
                        .focused($isTextFocused)
                    Button {
                        Task { await toggleSpeechInput() }
                    } label: {
                        Image(systemName: speechInput.isListening ? "waveform.badge.mic" : "mic.fill")
                    }
                    .buttonStyle(.bordered)
                    .buttonBorderShape(.circle)
                    .tint(speechInput.isListening ? Color.quadRose : Color.quadTeal)
                    .accessibilityLabel("语音转文字输入")
                }

                Button {
                    if text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        showsAttachmentTray.toggle()
                        isTextFocused = false
                    } else {
                        Task { await sendText() }
                    }
                } label: {
                    Image(systemName: text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "plus" : "arrow.up")
                }
                .buttonStyle(.borderedProminent)
                .buttonBorderShape(.circle)
                .accessibilityLabel(text.isEmpty ? "更多发送方式" : "发送文字")
            }

            if showsAttachmentTray {
                HStack(spacing: 30) {
                    PhotosPicker(selection: $selectedPhoto, matching: .images) {
                        AttachmentTrayItem(title: "图片", systemImage: "photo.fill")
                    }
                    Button { showsFileImporter = true } label: {
                        AttachmentTrayItem(title: "文件", systemImage: "folder.fill")
                    }
                    Button {
                        usesVoiceMessage = true
                        showsAttachmentTray = false
                    } label: {
                        AttachmentTrayItem(title: "语音", systemImage: "waveform")
                    }
                }
                .buttonStyle(.plain)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 9)
        .background(.regularMaterial)
    }

    private func sendText() async {
        let draft = text
        if app.queueChatMessage(
            recipientId: conversation.recipientId,
            subject: conversation.subject,
            text: draft
        ) {
            text = ""
        }
    }

    private func toggleVoiceMessage() async {
        do {
            if voiceRecorder.isRecording {
                guard let media = try voiceRecorder.stop() else { return }
                _ = app.queueChatMessage(
                    recipientId: conversation.recipientId,
                    subject: conversation.subject,
                    text: "",
                    media: media
                )
            } else {
                try await voiceRecorder.start()
            }
        } catch {
            app.errorMessage = error.localizedDescription
        }
    }

    private func toggleSpeechInput() async {
        if speechInput.isListening {
            speechInput.stop()
            return
        }
        do {
            try await speechInput.start(localeIdentifier: app.region.localeIdentifier, existingText: text)
        } catch {
            app.errorMessage = error.localizedDescription
        }
    }

    private func sendPhoto(_ item: PhotosPickerItem) async {
        defer { selectedPhoto = nil; showsAttachmentTray = false }
        guard let data = try? await item.loadTransferable(type: Data.self) else {
            app.errorMessage = "图片读取失败"
            return
        }
        let type = item.supportedContentTypes.first ?? .jpeg
        let media = ChatMediaDraft(
            kind: .image,
            data: data,
            fileName: "站内图片-\(Date().ISO8601Format()).\(type.preferredFilenameExtension ?? "jpg")",
            contentType: type.preferredMIMEType ?? "image/jpeg",
            duration: nil
        )
        _ = app.queueChatMessage(
            recipientId: conversation.recipientId,
            subject: conversation.subject,
            text: "",
            media: media
        )
    }

    private func sendFile(_ url: URL) async {
        let allowed = url.startAccessingSecurityScopedResource()
        defer { if allowed { url.stopAccessingSecurityScopedResource() } }
        do {
            let data = try Data(contentsOf: url)
            let type = (try? url.resourceValues(forKeys: [.contentTypeKey]).contentType) ?? .data
            let media = ChatMediaDraft(
                kind: .file,
                data: data,
                fileName: url.lastPathComponent,
                contentType: type.preferredMIMEType ?? "application/octet-stream",
                duration: nil
            )
            _ = app.queueChatMessage(
                recipientId: conversation.recipientId,
                subject: conversation.subject,
                text: "",
                media: media
            )
            showsAttachmentTray = false
        } catch {
            app.errorMessage = "文件读取失败：\(error.localizedDescription)"
        }
    }
}

private struct PendingChatMessageRow: View {
    let message: PendingInternalMessage
    let currentUserName: String
    let currentUserAvatarData: Data?
    let retry: () -> Void

    private var failedReason: String? {
        if case .failed(let reason) = message.status { return reason }
        return nil
    }

    var body: some View {
        HStack(alignment: .top, spacing: 9) {
            Spacer(minLength: 52)
            VStack(alignment: .trailing, spacing: 4) {
                Text(currentUserName)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                VStack(alignment: .leading, spacing: 8) {
                    if !message.content.isEmpty {
                        Text(message.content)
                            .font(.body)
                            .foregroundStyle(Color.black.opacity(0.88))
                    }
                    if let media = message.media {
                        HStack(spacing: 9) {
                            Image(systemName: attachmentIcon(media.contentType))
                                .font(.title3)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(media.fileName)
                                    .font(.subheadline.weight(.semibold))
                                    .lineLimit(1)
                                Text(ByteCountFormatter.string(
                                    fromByteCount: Int64(media.data.count),
                                    countStyle: .file
                                ))
                                .font(.caption2)
                                .foregroundStyle(Color.black.opacity(0.62))
                            }
                        }
                        .foregroundStyle(Color.black.opacity(0.82))
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 9)
                .background(Color.chatOutgoingBubble, in: RoundedRectangle(cornerRadius: 7, style: .continuous))

                Button(action: retry) {
                    HStack(spacing: 4) {
                        if failedReason == nil {
                            ProgressView().controlSize(.mini)
                            Text("正在发送")
                        } else {
                            Image(systemName: "exclamationmark.circle.fill")
                            Text("发送失败，点击重试")
                        }
                    }
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(failedReason == nil ? Color.secondary : Color.red)
                }
                .buttonStyle(.plain)
                .disabled(failedReason == nil)
                .accessibilityHint(failedReason ?? "消息正在后台上传")
            }
            avatar
        }
    }

    @ViewBuilder
    private var avatar: some View {
        if let currentUserAvatarData, let image = UIImage(data: currentUserAvatarData) {
            Image(uiImage: image)
                .resizable()
                .scaledToFill()
                .frame(width: 38, height: 38)
                .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
        } else {
            Text(String(currentUserName.prefix(1)).uppercased())
                .font(.subheadline.weight(.bold))
                .foregroundStyle(.white)
                .frame(width: 38, height: 38)
                .background(Color.quadTeal, in: RoundedRectangle(cornerRadius: 7))
        }
    }

    private func attachmentIcon(_ contentType: String) -> String {
        if contentType.hasPrefix("image/") { return "photo.fill" }
        if contentType.hasPrefix("audio/") { return "waveform" }
        return "doc.fill"
    }
}

private struct ChatMessageRow: View {
    @EnvironmentObject private var app: AppState
    let message: InternalMessage
    let isOutgoing: Bool
    let peerName: String
    let peerAvatarData: Data?
    let currentUserName: String
    let currentUserAvatarData: Data?
    @State private var previewFile: MessagePreviewFile?

    var body: some View {
        HStack(alignment: .top, spacing: 9) {
            if isOutgoing { Spacer(minLength: 52) }
            if !isOutgoing { avatar }
            VStack(alignment: isOutgoing ? .trailing : .leading, spacing: 4) {
                Text(isOutgoing ? currentUserName : (message.senderName ?? peerName))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                VStack(alignment: .leading, spacing: 8) {
                    if !message.content.isEmpty {
                        Text(message.content)
                            .font(.body)
                            .foregroundStyle(isOutgoing ? Color.black.opacity(0.88) : Color.primary)
                    }
                    if let translation = message.aiTranslation,
                       !translation.text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        Divider().overlay(Color.secondary.opacity(0.22))
                        HStack(alignment: .firstTextBaseline, spacing: 6) {
                            Text(translation.label)
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(Color.teal)
                            Text(translation.text)
                                .font(.caption)
                                .foregroundStyle(isOutgoing ? Color.black.opacity(0.68) : Color.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .accessibilityElement(children: .combine)
                    }
                    ForEach(message.attachments) { attachment in
                        Button {
                            Task {
                                if let url = await app.downloadInternalMessageAttachment(attachment) {
                                    previewFile = MessagePreviewFile(url: url)
                                }
                            }
                        } label: {
                            HStack(spacing: 9) {
                                Image(systemName: attachmentIcon(attachment.contentType))
                                    .font(.title3)
                                    .foregroundStyle(isOutgoing ? Color.black.opacity(0.78) : Color.primary)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(attachment.fileName)
                                        .font(.subheadline.weight(.semibold))
                                        .foregroundStyle(isOutgoing ? Color.black.opacity(0.88) : Color.primary)
                                        .lineLimit(1)
                                    Text(ByteCountFormatter.string(fromByteCount: Int64(attachment.sizeBytes), countStyle: .file))
                                        .font(.caption2)
                                        .foregroundStyle(isOutgoing ? Color.black.opacity(0.62) : Color.secondary)
                                }
                                Spacer(minLength: 4)
                                Image(systemName: "chevron.right").font(.caption).foregroundStyle(.tertiary)
                            }
                        }
                        .buttonStyle(.plain)
                        .accessibilityHint("下载并预览附件")
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 9)
                .background(
                    isOutgoing ? Color.chatOutgoingBubble : Color.chatIncomingBubble,
                    in: RoundedRectangle(cornerRadius: 7, style: .continuous)
                )
                Text(chatTime(message.sentAt))
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
            if isOutgoing { avatar }
            if !isOutgoing { Spacer(minLength: 52) }
        }
        .sheet(item: $previewFile) { file in
            MessageAttachmentPreview(url: file.url)
                .ignoresSafeArea()
        }
    }

    @ViewBuilder
    private var avatar: some View {
        if let avatarData = isOutgoing ? currentUserAvatarData : peerAvatarData,
           let image = UIImage(data: avatarData) {
            Image(uiImage: image)
                .resizable()
                .scaledToFill()
                .frame(width: 38, height: 38)
                .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 7, style: .continuous)
                        .stroke(Color.white.opacity(0.7), lineWidth: 1)
                }
                .accessibilityLabel("我的头像")
        } else {
            Text(String((isOutgoing ? currentUserName : peerName).prefix(1)).uppercased())
                .font(.subheadline.weight(.bold))
                .foregroundStyle(.white)
                .frame(width: 38, height: 38)
                .background(isOutgoing ? Color.quadTeal : Color.quadNavy, in: RoundedRectangle(cornerRadius: 7))
                .accessibilityLabel(isOutgoing ? "我的头像" : "\(peerName)的头像")
        }
    }

    private func attachmentIcon(_ contentType: String) -> String {
        if contentType.hasPrefix("image/") { return "photo.fill" }
        if contentType.hasPrefix("audio/") { return "waveform" }
        return "doc.fill"
    }
}

private struct MessagePreviewFile: Identifiable {
    let id = UUID()
    let url: URL
}

private struct MessageAttachmentPreview: UIViewControllerRepresentable {
    let url: URL

    func makeCoordinator() -> Coordinator { Coordinator(url: url) }

    func makeUIViewController(context: Context) -> UINavigationController {
        let controller = QLPreviewController()
        controller.dataSource = context.coordinator
        controller.navigationItem.rightBarButtonItem = UIBarButtonItem(
            barButtonSystemItem: .done,
            target: context.coordinator,
            action: #selector(Coordinator.dismissPreview)
        )
        let navigation = UINavigationController(rootViewController: controller)
        context.coordinator.navigationController = navigation
        return navigation
    }

    func updateUIViewController(_ uiViewController: UINavigationController, context: Context) {}

    final class Coordinator: NSObject, QLPreviewControllerDataSource {
        let url: URL
        weak var navigationController: UINavigationController?

        init(url: URL) { self.url = url }
        func numberOfPreviewItems(in controller: QLPreviewController) -> Int { 1 }
        func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem { url as NSURL }
        @objc func dismissPreview() { navigationController?.dismiss(animated: true) }
    }
}

private struct AttachmentTrayItem: View {
    let title: String
    let systemImage: String

    var body: some View {
        VStack(spacing: 5) {
            Image(systemName: systemImage)
                .font(.title2)
                .frame(width: 48, height: 48)
                .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
            Text(title).font(.caption)
        }
        .foregroundStyle(.primary)
    }
}

@MainActor
private enum MessagePresentationStore {
    private static let defaults = UserDefaults.standard

    static func searchText(identifier: String) -> String {
        defaults.string(forKey: key("search", identifier)) ?? ""
    }

    static func saveSearchText(_ value: String, identifier: String) {
        defaults.set(value, forKey: key("search", identifier))
    }

    static func showsUnreadOnly(identifier: String) -> Bool {
        defaults.bool(forKey: key("unread", identifier))
    }

    static func saveShowsUnreadOnly(_ value: Bool, identifier: String) {
        defaults.set(value, forKey: key("unread", identifier))
    }

    static func draft(identifier: String, conversationId: String) -> String {
        defaults.string(forKey: key("draft", identifier, conversationId)) ?? ""
    }

    static func saveDraft(_ value: String, identifier: String, conversationId: String) {
        let storageKey = key("draft", identifier, conversationId)
        if value.isEmpty { defaults.removeObject(forKey: storageKey) }
        else { defaults.set(value, forKey: storageKey) }
    }

    private static func key(_ parts: String...) -> String {
        let joined = parts.joined(separator: "|")
        let safe = Data(joined.utf8)
            .base64EncodedString()
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "=", with: "")
        return "message.presentation.\(safe)"
    }
}

private func chatTime(_ value: String) -> String {
    guard let date = ISO8601DateFormatter().date(from: value) else { return "" }
    return date.formatted(date: .omitted, time: .shortened)
}
