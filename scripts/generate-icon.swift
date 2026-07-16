// Generate the OpenDisk app icon: white rounded-square tile (macOS style)
// with a hardcoded DaisyDisk-like sunburst in the center. Outputs 1024x1024 PNG.
import CoreGraphics
import Foundation
import ImageIO

let SIZE = 1024
let out = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "icon-source.png"

// Deterministic LCG so the icon is reproducible.
var seed: UInt64 = 0x0D15EA5E
func rnd() -> Double {
    seed = seed &* 6364136223846793005 &+ 1442695040888963407
    return Double((seed >> 33) & 0xFFFFFF) / Double(0xFFFFFF)
}

func hsl(_ h: Double, _ s: Double, _ l: Double) -> CGColor {
    let c = (1 - abs(2 * l - 1)) * s
    let hp = (h.truncatingRemainder(dividingBy: 360)) / 60
    let x = c * (1 - abs(hp.truncatingRemainder(dividingBy: 2) - 1))
    let (r1, g1, b1): (Double, Double, Double)
    switch Int(hp) {
    case 0: (r1, g1, b1) = (c, x, 0)
    case 1: (r1, g1, b1) = (x, c, 0)
    case 2: (r1, g1, b1) = (0, c, x)
    case 3: (r1, g1, b1) = (0, x, c)
    case 4: (r1, g1, b1) = (x, 0, c)
    default: (r1, g1, b1) = (c, 0, x)
    }
    let m = l - c / 2
    return CGColor(srgbRed: r1 + m, green: g1 + m, blue: b1 + m, alpha: 1)
}

let ctx = CGContext(
    data: nil, width: SIZE, height: SIZE, bitsPerComponent: 8, bytesPerRow: 0,
    space: CGColorSpace(name: CGColorSpace.sRGB)!,
    bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
)!

// --- White rounded-square tile (Apple template: 824pt tile on 1024 canvas) ---
let tile = CGRect(x: 100, y: 100, width: 824, height: 824)
let tilePath = CGPath(roundedRect: tile, cornerWidth: 186, cornerHeight: 186, transform: nil)
ctx.addPath(tilePath)
ctx.setFillColor(CGColor(srgbRed: 1, green: 1, blue: 1, alpha: 1))
ctx.fillPath()
// Subtle top-to-bottom tint for depth.
ctx.saveGState()
ctx.addPath(tilePath)
ctx.clip()
let grad = CGGradient(
    colorsSpace: CGColorSpace(name: CGColorSpace.sRGB)!,
    colors: [
        CGColor(srgbRed: 1, green: 1, blue: 1, alpha: 1),
        CGColor(srgbRed: 0.941, green: 0.949, blue: 0.965, alpha: 1),
    ] as CFArray, locations: [0, 1]
)!
ctx.drawLinearGradient(grad, start: CGPoint(x: 512, y: 924), end: CGPoint(x: 512, y: 100), options: [])
ctx.restoreGState()

// --- Sunburst ---
let cx = 512.0, cy = 512.0
let ringEdges: [Double] = [104, 178, 244, 300, 344] // depth 1..4 radii

func sector(_ a0: Double, _ a1: Double, _ rIn: Double, _ rOut: Double, _ color: CGColor) {
    // Angles in degrees, clockwise from 12 o'clock (screen orientation).
    // CG context is y-up, clockwise-from-top = math angle (90 - a).
    let s = (90 - a1) * .pi / 180
    let e = (90 - a0) * .pi / 180
    ctx.beginPath()
    ctx.addArc(center: CGPoint(x: cx, y: cy), radius: rOut, startAngle: s, endAngle: e, clockwise: false)
    ctx.addArc(center: CGPoint(x: cx, y: cy), radius: rIn, startAngle: e, endAngle: s, clockwise: true)
    ctx.closePath()
    ctx.setFillColor(color)
    ctx.fillPath()
}

// Recursively draw children of a span at the given depth.
func drawChildren(_ a0: Double, _ a1: Double, depth: Int, hue: Double, sat: Double) {
    if depth >= 4 { return }
    let span = a1 - a0
    if span < 2.5 { return }
    let keepRatio = [0.94, 0.82, 0.62][depth - 1]
    let nMax = max(2, Int(span / 9))
    let n = 2 + Int(rnd() * Double(min(nMax, 6) - 1))
    var cursor = a0
    let gap = 1.2
    for i in 0..<n {
        let w = (span - Double(n - 1) * gap) * (0.6 + rnd() * 0.8) / Double(n)
        let end = min(cursor + w, a1)
        if end - cursor < 1.2 { cursor = end + gap; continue }
        if rnd() < keepRatio {
            let l = 0.52 + Double(depth) * 0.085 + rnd() * 0.03
            let gray = rnd() < 0.12 // occasional gray file block, like DaisyDisk
            let col = gray ? hsl(0, 0, 0.32 + rnd() * 0.1) : hsl(hue + rnd() * 10 - 5, sat, l)
            sector(cursor, end, ringEdges[depth], ringEdges[depth + 1], col)
            drawChildren(cursor, end, depth: depth + 1, hue: hue, sat: sat)
        }
        cursor = end + gap
        if cursor >= a1 { break }
    }
}

// Depth-1 sectors: (span°, hue, sat) — hue wheel like DaisyDisk.
let sectors: [(Double, Double, Double)] = [
    (92, 115, 0.72),  // green (dominant)
    (34, 165, 0.70),  // teal
    (30, 200, 0.75),  // sky blue
    (24, 237, 0.72),  // blue-violet
    (30, 270, 0.72),  // purple
    (24, 300, 0.72),  // magenta
    (24, 330, 0.75),  // pink
    (18, 0, 0.0),     // gray (system/other)
    (36, 25, 0.85),   // orange
    (48, 52, 0.80),   // yellow
]
var angle = -8.0
for (span, hue, sat) in sectors {
    let a0 = angle + 0.8
    let a1 = angle + span - 0.8
    let col = sat == 0 ? hsl(0, 0, 0.40) : hsl(hue, sat, 0.52)
    sector(a0, a1, ringEdges[0], ringEdges[1], col)
    drawChildren(a0, a1, depth: 1, hue: hue, sat: sat)
    angle += span
}

// Center disc (dark, like the app's chart center).
ctx.beginPath()
ctx.addArc(center: CGPoint(x: cx, y: cy), radius: ringEdges[0] - 8, startAngle: 0, endAngle: 2 * .pi, clockwise: false)
ctx.setFillColor(CGColor(srgbRed: 0.13, green: 0.14, blue: 0.18, alpha: 1))
ctx.fillPath()

// --- Write PNG ---
let img = ctx.makeImage()!
let url = URL(fileURLWithPath: out) as CFURL
let dest = CGImageDestinationCreateWithURL(url, "public.png" as CFString, 1, nil)!
CGImageDestinationAddImage(dest, img, nil)
CGImageDestinationFinalize(dest)
print("written \(out)")
