import SwiftUI
import UIKit

extension Color {
    static let quadTeal = Color("QuadTeal")
    static let quadPurple = Color("QuadPurple")
    static let quadOrange = Color("QuadOrange")
    static let quadGreen = Color("QuadGreen")
    static let quadRose = Color("QuadRose")
    static let quadNavy = Color("QuadNavy")
    static let chatOutgoingBubble = Color("ChatOutgoingBubble")
    static let chatIncomingBubble = Color("ChatIncomingBubble")
    static let quadCanvas = Color(uiColor: .systemGroupedBackground)
}

extension View {
    func quadCard(padding: CGFloat = 16) -> some View {
        self
            .padding(padding)
            .background(Color(uiColor: .secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(Color(uiColor: .separator).opacity(0.12), lineWidth: 0.5)
            }
    }

    func quadScreen() -> some View {
        self
            .background(Color.quadCanvas.ignoresSafeArea())
            .tint(.quadTeal)
    }
}

struct QuadHero: View {
    let kicker: String?
    let title: String
    let subtitle: String
    var color: Color = .quadTeal
    var badge: String? = nil
    var badgeAction: (() -> Void)? = nil
    var metrics: [(String, String)] = []

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 6) {
                    if let kicker {
                        Text(kicker.uppercased())
                            .font(.caption2.weight(.bold))
                            .tracking(1.2)
                            .foregroundStyle(.white.opacity(0.75))
                    }
                    Text(LocalizedStringKey(title))
                        .font(.title2.weight(.bold))
                        .foregroundStyle(.white)
                    Text(LocalizedStringKey(subtitle))
                        .font(.subheadline)
                        .foregroundStyle(.white.opacity(0.82))
                }
                Spacer(minLength: 8)
                if let badge {
                    if let badgeAction {
                        Button(action: badgeAction) {
                            Text(badge)
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 6)
                        }
                        .buttonStyle(.plain)
                        .background(.white.opacity(0.16), in: Capsule())
                        .accessibilityHint("重新读取手机综合定位")
                    } else {
                        Text(badge)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(.white.opacity(0.16), in: Capsule())
                    }
                }
            }
            if !metrics.isEmpty {
                HStack(spacing: 0) {
                    ForEach(Array(metrics.enumerated()), id: \.offset) { index, metric in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(metric.0).font(.caption2).foregroundStyle(.white.opacity(0.68))
                            Text(metric.1).font(.subheadline.weight(.bold)).foregroundStyle(.white)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        if index < metrics.count - 1 {
                            Rectangle().fill(.white.opacity(0.18)).frame(width: 1, height: 32)
                                .padding(.horizontal, 8)
                        }
                    }
                }
                .padding(.top, 6)
            }
        }
        .padding(18)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(
                colors: [color, color.opacity(0.84)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .shadow(color: color.opacity(0.2), radius: 12, y: 6)
    }
}

struct QuadSectionHeader: View {
    let title: String
    var trailing: String? = nil

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(LocalizedStringKey(title)).font(.headline)
            Spacer()
            if let trailing { Text(trailing).font(.caption).foregroundStyle(.secondary) }
        }
    }
}

struct QuadPrimaryButton: View {
    let title: String
    var systemImage: String? = nil
    var color: Color = .quadTeal
    var isEnabled = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if let systemImage { Image(systemName: systemImage) }
                Text(LocalizedStringKey(title)).fontWeight(.semibold)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 13)
        }
        .buttonStyle(.plain)
        .foregroundStyle(.white)
        .background(isEnabled ? color : Color(uiColor: .systemGray3), in: RoundedRectangle(cornerRadius: 13))
        .disabled(!isEnabled)
    }
}

struct QuadStatusPill: View {
    let title: String
    var color: Color = .quadTeal
    var icon: String? = nil

    var body: some View {
        HStack(spacing: 5) {
            if let icon { Image(systemName: icon) }
            Text(LocalizedStringKey(title))
        }
        .font(.caption.weight(.semibold))
        .foregroundStyle(color)
        .padding(.horizontal, 9)
        .padding(.vertical, 5)
        .background(color.opacity(0.1), in: Capsule())
    }
}

struct QuadMetric: View {
    let value: String
    let label: String
    var color: Color = .quadTeal

    var body: some View {
        VStack(spacing: 3) {
            Text(value).font(.title3.weight(.bold)).foregroundStyle(color)
            Text(label).font(.caption2).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
    }
}

struct CustomerCompactCard<Trailing: View>: View {
    let customer: CustomerSummary
    var rank: Int? = nil
    var color: Color = .quadTeal
    @ViewBuilder let trailing: () -> Trailing

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            if let rank {
                Text("\(rank)")
                    .font(.headline)
                    .foregroundStyle(.white)
                    .frame(width: 34, height: 34)
                    .background(color, in: Circle())
            } else {
                Image(systemName: "building.2.fill")
                    .font(.title3)
                    .foregroundStyle(.white)
                    .frame(width: 42, height: 42)
                    .background(color, in: RoundedRectangle(cornerRadius: 12))
            }
            VStack(alignment: .leading, spacing: 4) {
                Text(customer.customerName).font(.headline)
                Text(customer.address).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                HStack(spacing: 8) {
                    Text(customer.customerType)
                    if !customer.contactName.isEmpty { Text("联系人：\(customer.contactName)") }
                }
                .font(.caption2)
                .foregroundStyle(.secondary)
            }
            Spacer(minLength: 4)
            trailing()
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct VisitPlanRow: View {
    @EnvironmentObject private var app: AppState
    let plan: VisitPlan
    let sequence: Int
    var color: Color = .quadPurple
    var isCompleted = false

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle().fill(isCompleted ? Color.quadGreen : color).frame(width: 34, height: 34)
                Image(systemName: isCompleted ? "checkmark" : "\(sequence).circle.fill")
                    .foregroundStyle(.white)
            }
            VStack(alignment: .leading, spacing: 4) {
                Text(plan.customerName).font(.headline)
                Text(plan.address ?? "尚未填写地址")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 3) {
                Text(plan.scheduledAt.map(app.region.formatTime) ?? "待安排").font(.subheadline.weight(.semibold))
                Text(isCompleted ? "已完成" : "待拜访").font(.caption2).foregroundStyle(isCompleted ? Color.quadGreen : Color.secondary)
            }
        }
    }
}

struct ArtifactChecklistRow: View {
    let title: String
    let detail: String
    var done: Bool = true

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: done ? "checkmark.circle.fill" : "circle")
                .foregroundStyle(done ? Color.quadGreen : Color.secondary)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.subheadline.weight(.semibold))
                Text(detail).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
        }
    }
}

struct SignaturePad: View {
    @Binding var strokes: [[CGPoint]]
    @State private var activeStroke: [CGPoint] = []

    var body: some View {
        Canvas { context, _ in
            for stroke in strokes + (activeStroke.isEmpty ? [] : [activeStroke]) {
                guard let first = stroke.first else { continue }
                var path = Path()
                path.move(to: first)
                for point in stroke.dropFirst() { path.addLine(to: point) }
                context.stroke(path, with: .color(.primary), lineWidth: 2.4)
            }
        }
        .frame(height: 140)
        .background(Color(uiColor: .systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 13))
        .overlay { RoundedRectangle(cornerRadius: 13).stroke(Color(uiColor: .separator)) }
        .gesture(
            DragGesture(minimumDistance: 0)
                .onChanged { value in activeStroke.append(value.location) }
                .onEnded { _ in
                    if !activeStroke.isEmpty { strokes.append(activeStroke) }
                    activeStroke = []
                }
        )
        .accessibilityLabel("客户手写签名区域")
    }
}

struct PhotoPreviewTile: View {
    let data: Data?
    let title: String
    var color: Color = .quadTeal

    var body: some View {
        Group {
            if let data, let image = UIImage(data: data) {
                Image(uiImage: image).resizable().scaledToFill()
            } else {
                VStack(spacing: 7) {
                    Image(systemName: "camera.fill").font(.title2)
                    Text(title).font(.caption2.weight(.medium))
                }
                .foregroundStyle(color)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(color.opacity(0.08))
            }
        }
        .frame(height: 112)
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }
}
