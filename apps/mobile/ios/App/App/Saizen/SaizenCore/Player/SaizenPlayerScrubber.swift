import UIKit

/// Custom scrubber with buffered/played fills and OP/ED range marks on the track.
final class SaizenPlayerScrubber: UIControl {
  var duration: Double = 0 {
    didSet { setNeedsLayout(); setNeedsDisplay() }
  }

  var currentTime: Double = 0 {
    didSet {
      guard !isDragging else { return }
      setNeedsLayout()
      setNeedsDisplay()
    }
  }

  var bufferedFraction: Double = 0 {
    didSet { setNeedsDisplay() }
  }

  /// Opening / ending intervals in seconds (AniSkip).
  var opRange: (start: Double, end: Double)? {
    didSet { setNeedsDisplay() }
  }

  var edRange: (start: Double, end: Double)? {
    didSet { setNeedsDisplay() }
  }

  var onSeek: ((Double) -> Void)?
  var onDragStart: (() -> Void)?
  var onDragEnd: (() -> Void)?

  private let accent = UIColor(red: 0.91, green: 0.77, blue: 0.47, alpha: 1)
  private let trackHeight: CGFloat = 3.5
  private let thumbSize: CGFloat = 11
  private var isDragging = false
  private var dragTime: Double = 0

  private var displayTime: Double {
    isDragging ? dragTime : currentTime
  }

  override init(frame: CGRect) {
    super.init(frame: frame)
    backgroundColor = .clear
    isOpaque = false
    isAccessibilityElement = true
    accessibilityTraits = .adjustable
    accessibilityLabel = "Playback position"
  }

  @available(*, unavailable)
  required init?(coder _: NSCoder) { fatalError() }

  override var intrinsicContentSize: CGSize {
    CGSize(width: UIView.noIntrinsicMetric, height: 28)
  }

  override func draw(_ rect: CGRect) {
    guard let ctx = UIGraphicsGetCurrentContext() else { return }
    let track = trackRect(in: bounds)
    let radius = trackHeight / 2

    // Base track
    ctx.setFillColor(UIColor.white.withAlphaComponent(0.28).cgColor)
    UIBezierPath(roundedRect: track, cornerRadius: radius).fill()

    // Buffered
    let buf = min(max(bufferedFraction, 0), 1)
    if buf > 0 {
      var buffered = track
      buffered.size.width = track.width * CGFloat(buf)
      ctx.setFillColor(UIColor.white.withAlphaComponent(0.42).cgColor)
      UIBezierPath(roundedRect: buffered, cornerRadius: radius).fill()
    }

    // OP / ED marks (gold segments under played fill)
    drawSkipMark(ctx: ctx, range: opRange, in: track, radius: radius)
    drawSkipMark(ctx: ctx, range: edRange, in: track, radius: radius)

    // Played
    let progress: Double
    if duration > 0 {
      progress = min(max(displayTime / duration, 0), 1)
    } else {
      progress = 0
    }
    if progress > 0 {
      var played = track
      played.size.width = track.width * CGFloat(progress)
      ctx.setFillColor(UIColor.white.cgColor)
      UIBezierPath(roundedRect: played, cornerRadius: radius).fill()
    }

    // Thumb — soft white with gold rim (matches reference chrome)
    let thumbCenter = CGPoint(
      x: track.minX + track.width * CGFloat(progress),
      y: track.midY
    )
    let thumb = CGRect(
      x: thumbCenter.x - thumbSize / 2,
      y: thumbCenter.y - thumbSize / 2,
      width: thumbSize,
      height: thumbSize
    )
    ctx.setFillColor(UIColor.white.cgColor)
    UIBezierPath(ovalIn: thumb).fill()
    ctx.setStrokeColor(accent.withAlphaComponent(0.9).cgColor)
    ctx.setLineWidth(1.5)
    UIBezierPath(ovalIn: thumb.insetBy(dx: 0.5, dy: 0.5)).stroke()
  }

  private func drawSkipMark(
    ctx: CGContext,
    range: (start: Double, end: Double)?,
    in track: CGRect,
    radius: CGFloat
  ) {
    guard let range, duration > 0 else { return }
    let start = min(max(range.start / duration, 0), 1)
    let end = min(max(range.end / duration, 0), 1)
    guard end > start else { return }
    var mark = track
    mark.origin.x = track.minX + track.width * CGFloat(start)
    mark.size.width = track.width * CGFloat(end - start)
    ctx.setFillColor(accent.withAlphaComponent(0.55).cgColor)
    UIBezierPath(roundedRect: mark, cornerRadius: radius).fill()
  }

  private func trackRect(in bounds: CGRect) -> CGRect {
    CGRect(
      x: thumbSize / 2,
      y: bounds.midY - trackHeight / 2,
      width: max(0, bounds.width - thumbSize),
      height: trackHeight
    )
  }

  private func time(at location: CGPoint) -> Double {
    let track = trackRect(in: bounds)
    guard track.width > 0, duration > 0 else { return 0 }
    let x = min(max(location.x - track.minX, 0), track.width)
    return Double(x / track.width) * duration
  }

  override func beginTracking(_ touch: UITouch, with event: UIEvent?) -> Bool {
    isDragging = true
    dragTime = time(at: touch.location(in: self))
    onDragStart?()
    setNeedsDisplay()
    sendActions(for: .valueChanged)
    return true
  }

  override func continueTracking(_ touch: UITouch, with event: UIEvent?) -> Bool {
    dragTime = time(at: touch.location(in: self))
    setNeedsDisplay()
    sendActions(for: .valueChanged)
    return true
  }

  override func endTracking(_ touch: UITouch?, with event: UIEvent?) {
    if let touch {
      dragTime = time(at: touch.location(in: self))
    }
    isDragging = false
    currentTime = dragTime
    onSeek?(dragTime)
    onDragEnd?()
    setNeedsDisplay()
  }

  override func cancelTracking(with event: UIEvent?) {
    isDragging = false
    onDragEnd?()
    setNeedsDisplay()
  }

  override func accessibilityIncrement() {
    guard duration > 0 else { return }
    let next = min(duration, currentTime + 10)
    currentTime = next
    onSeek?(next)
  }

  override func accessibilityDecrement() {
    let next = max(0, currentTime - 10)
    currentTime = next
    onSeek?(next)
  }
}
