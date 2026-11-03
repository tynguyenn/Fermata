/*
 * Planar motion tracking for the keyboard overlay.
 *
 * The piano is a rigid plane, so its apparent motion between two video frames is
 * exactly a homography — no matter how the head moves. That makes tracking a
 * two-step problem per frame: follow a spread of feature points with pyramidal
 * Lucas-Kanade optical flow, then fit the one homography that most of them agree
 * on with RANSAC. Points on the player's hands move differently from the plane,
 * so they fall out as outliers rather than dragging the overlay with them.
 *
 * Everything here is pure so it can be verified against synthetic motion in Node;
 * the browser-side frame pump lives in videoTrack.ts.
 */

import {
  applyHomography,
  homographyFromCorners,
  refineHomography,
  solveHomography,
  type Homography,
  type Point,
} from './homography'

export interface Gray {
  data: Float32Array // luma 0-255
  width: number
  height: number
}

export interface Quad {
  corners: Point[] // 4 points
}

/* ----------------------------------------------------------------- image prep */

export function grayFromRGBA(rgba: Uint8ClampedArray, width: number, height: number): Gray {
  const data = new Float32Array(width * height)
  for (let i = 0, p = 0; i < data.length; i++, p += 4) {
    // Rec. 601 luma
    data[i] = 0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2]
  }
  return { data, width, height }
}

/** Blur with a [1 2 1] kernel and drop every other pixel. */
export function downsample(g: Gray): Gray {
  const w = Math.max(1, g.width >> 1)
  const h = Math.max(1, g.height >> 1)
  const out = new Float32Array(w * h)
  const at = (x: number, y: number) => {
    const cx = x < 0 ? 0 : x >= g.width ? g.width - 1 : x
    const cy = y < 0 ? 0 : y >= g.height ? g.height - 1 : y
    return g.data[cy * g.width + cx]
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = x * 2
      const sy = y * 2
      const sum =
        at(sx - 1, sy - 1) + 2 * at(sx, sy - 1) + at(sx + 1, sy - 1) +
        2 * at(sx - 1, sy) + 4 * at(sx, sy) + 2 * at(sx + 1, sy) +
        at(sx - 1, sy + 1) + 2 * at(sx, sy + 1) + at(sx + 1, sy + 1)
      out[y * w + x] = sum / 16
    }
  }
  return { data: out, width: w, height: h }
}

export function buildPyramid(g: Gray, levels: number): Gray[] {
  const pyramid = [g]
  for (let i = 1; i < levels; i++) {
    const prev = pyramid[i - 1]
    if (prev.width < 24 || prev.height < 24) break
    pyramid.push(downsample(prev))
  }
  return pyramid
}

/** Bilinear sample, clamped at the border. */
function sample(g: Gray, x: number, y: number): number {
  const { data, width, height } = g
  if (x < 0) x = 0
  if (y < 0) y = 0
  if (x > width - 1) x = width - 1
  if (y > height - 1) y = height - 1
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const x1 = x0 + 1 > width - 1 ? width - 1 : x0 + 1
  const y1 = y0 + 1 > height - 1 ? height - 1 : y0 + 1
  const fx = x - x0
  const fy = y - y0
  const a = data[y0 * width + x0]
  const b = data[y0 * width + x1]
  const c = data[y1 * width + x0]
  const d = data[y1 * width + x1]
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy
}

/* ------------------------------------------------------------ feature picking */

/** Is p inside the convex quad? Corner order must be consistent (it is: ours winds one way). */
export function pointInQuad(p: Point, quad: Point[]): boolean {
  let sign = 0
  for (let i = 0; i < 4; i++) {
    const a = quad[i]
    const b = quad[(i + 1) % 4]
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
    if (cross === 0) continue
    const s = cross > 0 ? 1 : -1
    if (sign === 0) sign = s
    else if (s !== sign) return false
  }
  return true
}

/** Expand a quad outward from its centroid — cheap way to include the piano body. */
export function expandQuad(quad: Point[], margin: number): Point[] {
  const cx = quad.reduce((s, p) => s + p.x, 0) / quad.length
  const cy = quad.reduce((s, p) => s + p.y, 0) / quad.length
  return quad.map((p) => ({
    x: cx + (p.x - cx) * (1 + margin),
    y: cy + (p.y - cy) * (1 + margin),
  }))
}

export interface DetectOptions {
  /** only keep features inside this polygon */
  quad?: Point[]
  cellsX?: number
  cellsY?: number
  perCell?: number
  minQuality?: number
}

/**
 * Shi-Tomasi corners, capped per grid cell so the features spread across the
 * whole plane instead of clumping on the highest-contrast few keys. Spread is
 * what keeps RANSAC honest when hands cover the middle of the keyboard.
 */
export function detectFeatures(g: Gray, options: DetectOptions = {}): Point[] {
  const { quad, cellsX = 12, cellsY = 8, perCell = 3, minQuality = 8 } = options
  const { width, height } = g
  const border = 8

  // bounding box of the region of interest
  let x0 = border
  let y0 = border
  let x1 = width - border - 1
  let y1 = height - border - 1
  if (quad) {
    x0 = Math.max(x0, Math.floor(Math.min(...quad.map((p) => p.x))))
    x1 = Math.min(x1, Math.ceil(Math.max(...quad.map((p) => p.x))))
    y0 = Math.max(y0, Math.floor(Math.min(...quad.map((p) => p.y))))
    y1 = Math.min(y1, Math.ceil(Math.max(...quad.map((p) => p.y))))
  }
  if (x1 <= x0 || y1 <= y0) return []

  const cellW = (x1 - x0) / cellsX
  const cellH = (y1 - y0) / cellsY
  const best: { x: number; y: number; q: number }[][] = Array.from(
    { length: cellsX * cellsY },
    () => []
  )

  const idx = (x: number, y: number) => y * width + x
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (quad && !pointInQuad({ x, y }, quad)) continue

      // structure tensor over a 5x5 window
      let sxx = 0
      let sxy = 0
      let syy = 0
      for (let wy = -2; wy <= 2; wy++) {
        for (let wx = -2; wx <= 2; wx++) {
          const px = x + wx
          const py = y + wy
          if (px <= 0 || py <= 0 || px >= width - 1 || py >= height - 1) continue
          const ix = (g.data[idx(px + 1, py)] - g.data[idx(px - 1, py)]) * 0.5
          const iy = (g.data[idx(px, py + 1)] - g.data[idx(px, py - 1)]) * 0.5
          sxx += ix * ix
          sxy += ix * iy
          syy += iy * iy
        }
      }
      // smaller eigenvalue of the 2x2 tensor
      const trace = sxx + syy
      const det = sxx * syy - sxy * sxy
      const disc = Math.sqrt(Math.max(0, trace * trace / 4 - det))
      const quality = trace / 2 - disc
      if (quality < minQuality) continue

      const cx = Math.min(cellsX - 1, Math.floor((x - x0) / cellW))
      const cy = Math.min(cellsY - 1, Math.floor((y - y0) / cellH))
      const cell = best[cy * cellsX + cx]
      cell.push({ x, y, q: quality })
      if (cell.length > perCell * 4) {
        cell.sort((a, b) => b.q - a.q)
        cell.length = perCell
      }
    }
  }

  const features: Point[] = []
  for (const cell of best) {
    cell.sort((a, b) => b.q - a.q)
    for (const f of cell.slice(0, perCell)) features.push({ x: f.x, y: f.y })
  }
  return features
}

/* ------------------------------------------------------- Lucas-Kanade tracking */

export interface FlowOptions {
  windowRadius?: number
  maxIterations?: number
  /** reject a track whose forward-backward round trip misses by more than this */
  forwardBackwardTolerance?: number
  /** reject a track whose mean absolute residual exceeds this (0-255 luma) */
  maxResidual?: number
}

interface FlowResult {
  point: Point | null
  residual: number
}

/** One point, coarse-to-fine (Bouguet). Returns null when the track is unreliable. */
function trackPoint(
  prev: Gray[],
  next: Gray[],
  start: Point,
  options: FlowOptions,
  initialFlow?: Point
): FlowResult {
  const radius = options.windowRadius ?? 5
  const maxIterations = options.maxIterations ?? 12
  const maxResidual = options.maxResidual ?? 40

  const levels = Math.min(prev.length, next.length)
  // Start the search from the motion we already expect rather than from zero.
  // Searching from zero biases every result toward "nothing moved", which is
  // invisible frame to frame and ruins a long take.
  const coarseScale = 1 << (levels - 1)
  let gx = (initialFlow?.x ?? 0) / coarseScale
  let gy = (initialFlow?.y ?? 0) / coarseScale
  let residual = 0
  let solvedAnyLevel = false

  for (let level = levels - 1; level >= 0; level--) {
    const scale = 1 << level
    const p = prev[level]
    const n = next[level]
    const px = start.x / scale
    const py = start.y / scale

    if (px < radius || py < radius || px > p.width - radius - 1 || py > p.height - radius - 1) {
      // no support for the window here — fall through to finer levels
      if (level > 0) {
        gx *= 2
        gy *= 2
      }
      continue
    }

    // gradients and template are fixed for this level
    const size = radius * 2 + 1
    const template = new Float32Array(size * size)
    const gradX = new Float32Array(size * size)
    const gradY = new Float32Array(size * size)
    let sxx = 0
    let sxy = 0
    let syy = 0
    for (let wy = -radius, k = 0; wy <= radius; wy++) {
      for (let wx = -radius; wx <= radius; wx++, k++) {
        const x = px + wx
        const y = py + wy
        template[k] = sample(p, x, y)
        const ix = (sample(p, x + 1, y) - sample(p, x - 1, y)) * 0.5
        const iy = (sample(p, x, y + 1) - sample(p, x, y - 1)) * 0.5
        gradX[k] = ix
        gradY[k] = iy
        sxx += ix * ix
        sxy += ix * iy
        syy += iy * iy
      }
    }
    const det = sxx * syy - sxy * sxy
    const trace = sxx + syy
    const minEigen = trace / 2 - Math.sqrt(Math.max(0, (trace * trace) / 4 - det))
    if (det <= 1e-6 || minEigen < 1e-3) {
      // flat or edge-only patch: no usable constraint at this level
      if (level > 0) {
        gx *= 2
        gy *= 2
      }
      continue
    }

    let dx = 0
    let dy = 0
    for (let iter = 0; iter < maxIterations; iter++) {
      let bx = 0
      let by = 0
      let absSum = 0
      for (let wy = -radius, k = 0; wy <= radius; wy++) {
        for (let wx = -radius; wx <= radius; wx++, k++) {
          const diff = template[k] - sample(n, px + gx + dx + wx, py + gy + dy + wy)
          bx += diff * gradX[k]
          by += diff * gradY[k]
          absSum += Math.abs(diff)
        }
      }
      residual = absSum / (size * size)
      const incX = (syy * bx - sxy * by) / det
      const incY = (sxx * by - sxy * bx) / det
      dx += incX
      dy += incY
      if (Math.abs(incX) < 0.02 && Math.abs(incY) < 0.02) break
      if (Math.abs(dx) > p.width || Math.abs(dy) > p.height) return { point: null, residual }
    }

    solvedAnyLevel = true
    gx = (gx + dx) * (level > 0 ? 2 : 1)
    gy = (gy + dy) * (level > 0 ? 2 : 1)
  }

  // never solved anywhere: the "flow" would just be zero, which is a lie
  if (!solvedAnyLevel) return { point: null, residual }
  if (residual > maxResidual) return { point: null, residual }
  const result = { x: start.x + gx, y: start.y + gy }
  if (!Number.isFinite(result.x) || !Number.isFinite(result.y)) return { point: null, residual }
  return { point: result, residual }
}

export interface Correspondence {
  from: Point
  to: Point
}

/** Track a set of points, keeping only those that survive a forward-backward check. */
export function trackPoints(
  prev: Gray[],
  next: Gray[],
  points: Point[],
  options: FlowOptions = {},
  /** predicted position of each point in `next`, when the caller knows roughly */
  predictions?: Point[]
): Correspondence[] {
  const tolerance = options.forwardBackwardTolerance ?? 1
  const out: Correspondence[] = []
  for (let i = 0; i < points.length; i++) {
    const point = points[i]
    const predicted = predictions?.[i]
    const guess = predicted ? { x: predicted.x - point.x, y: predicted.y - point.y } : undefined

    const forward = trackPoint(prev, next, point, options, guess)
    if (!forward.point) continue
    if (tolerance > 0) {
      // the return trip starts from the inverse of what we just measured
      const back = trackPoint(next, prev, forward.point, options, {
        x: point.x - forward.point.x,
        y: point.y - forward.point.y,
      })
      if (!back.point) continue
      if (Math.hypot(back.point.x - point.x, back.point.y - point.y) > tolerance) continue
    }
    out.push({ from: point, to: forward.point })
  }
  return out
}

/* ------------------------------------------------------- homography estimation */

export interface RansacOptions {
  threshold?: number // inlier distance in pixels
  iterations?: number
  seed?: number
}

export interface RansacResult {
  homography: Homography
  inliers: boolean[]
  inlierCount: number
}

/** Deterministic PRNG — a tracking pass must give the same answer twice. */
function makeRandom(seed: number) {
  let state = seed >>> 0 || 1
  return () => {
    state ^= state << 13
    state >>>= 0
    state ^= state >> 17
    state ^= state << 5
    state >>>= 0
    return state / 4294967296
  }
}

export function ransacHomography(
  correspondences: Correspondence[],
  options: RansacOptions = {}
): RansacResult | null {
  const threshold = options.threshold ?? 2
  const maxIterations = options.iterations ?? 300
  const n = correspondences.length
  if (n < 4) return null

  const random = makeRandom(options.seed ?? 0x9e3779b9)
  const src = correspondences.map((c) => c.from)
  const dst = correspondences.map((c) => c.to)
  const threshSq = threshold * threshold

  let bestInliers: boolean[] | null = null
  let bestCount = 0

  const pick4 = () => {
    const chosen: number[] = []
    let guard = 0
    while (chosen.length < 4 && guard++ < 64) {
      const i = Math.min(n - 1, Math.floor(random() * n))
      if (!chosen.includes(i)) chosen.push(i)
    }
    return chosen.length === 4 ? chosen : null
  }

  for (let iter = 0; iter < maxIterations; iter++) {
    const chosen = pick4()
    if (!chosen) break
    const h = solveHomography(
      chosen.map((i) => src[i]),
      chosen.map((i) => dst[i])
    )
    if (!h) continue

    const inliers = new Array<boolean>(n).fill(false)
    let count = 0
    for (let i = 0; i < n; i++) {
      const p = applyHomography(h, src[i].x, src[i].y)
      if (p.w <= 1e-9 || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue
      const dx = p.x - dst[i].x
      const dy = p.y - dst[i].y
      if (dx * dx + dy * dy <= threshSq) {
        inliers[i] = true
        count++
      }
    }
    if (count > bestCount) {
      bestCount = count
      bestInliers = inliers
      // adaptive early exit once the consensus is overwhelming
      if (count > n * 0.95) break
    }
  }

  if (!bestInliers || bestCount < 4) return null

  const inlierSrc: Point[] = []
  const inlierDst: Point[] = []
  for (let i = 0; i < n; i++) {
    if (!bestInliers[i]) continue
    inlierSrc.push(src[i])
    inlierDst.push(dst[i])
  }
  const refined = refineHomography(inlierSrc, inlierDst) ?? solveHomography(inlierSrc.slice(0, 4), inlierDst.slice(0, 4))
  if (!refined) return null

  return { homography: refined, inliers: bestInliers, inlierCount: bestCount }
}

/* ------------------------------------------------------------ the plane tracker */

export interface TrackerOptions {
  pyramidLevels?: number
  /** how far past the keyboard to look for features, as a fraction of quad size */
  margin?: number
  detect?: DetectOptions
  flow?: FlowOptions
  ransac?: RansacOptions
  /** below this many agreeing points, look for a better keyframe */
  minInliers?: number
  minInlierRatio?: number
  /**
   * Largest believable corner movement between adjacent frames, in pixels.
   * A repeating pattern like a keyboard can produce a *confidently wrong* fit —
   * dozens of points agreeing on a solution one key-width off. Inlier ratio can't
   * see that, but a physical limit on how far a head can move in 1/30s can.
   */
  maxJump?: number
  /** how many stored keyframes to keep for re-use */
  maxKeyframes?: number
  /** how many keyframes to try per frame before giving up */
  maxCandidates?: number
  /** hard cap on how many frames a single keyframe may serve before refreshing */
  maxFramesPerKeyframe?: number
  /**
   * Jump and baseline limits also scale with the quad's own size. Calibrating from
   * key anchors can put the keyboard's implied corners far outside the frame, where
   * a small change in the plane moves them a long way — a fixed pixel limit would
   * reject perfectly good solves.
   */
  maxJumpFraction?: number
  maxBaselineFraction?: number
  /**
   * Points in keyboard space (u across the keys, w into the scene) that should
   * always be tracked — the physical marks on the piano. They are distinctive and
   * they are exactly the spots whose alignment matters, so every keyframe re-derives
   * their screen positions from its own quad and tracks them alongside the
   * automatically detected features.
   */
  planePoints?: { u: number; w: number }[]
  /**
   * Largest mean corner distance allowed between a frame and its keyframe.
   * Optical flow degrades quietly at long baselines — surviving points drift toward
   * "no motion", so the fit still looks confident while the overlay lags further
   * and further behind. Capping the baseline keeps flow in its reliable regime.
   */
  maxBaseline?: number
}

export interface TrackerStep {
  corners: Point[]
  confidence: number
  /** the reference frame was moved forward on this step */
  reAnchored: boolean
  /** false when the frame could not be solved at all and the last quad was held */
  ok: boolean
}

/**
 * Tracks the keyboard plane through a sequence of frames.
 *
 * Each frame is matched against a *reference* frame rather than its predecessor.
 * Chaining frame-to-frame looks fine over a second and then ruins a long take:
 * every frame contributes a fraction of a pixel of bias and it all adds up. With
 * a fixed reference the error stays bounded, and features hidden by the hands come
 * back when they reappear instead of being lost for good. The reference only moves
 * forward when matching to it starts failing — so a steady shot may keep one
 * reference for hundreds of frames and drift essentially not at all.
 */
interface Keyframe {
  pyramid: Gray[]
  quad: Point[]
  features: Point[]
  lastUsed: number
}

/** Rough scale of a quad: the mean of its two diagonals. */
const quadScale = (quad: Point[]) =>
  (Math.hypot(quad[2].x - quad[0].x, quad[2].y - quad[0].y) +
    Math.hypot(quad[3].x - quad[1].x, quad[3].y - quad[1].y)) /
  2

const meanCornerDistance = (a: Point[], b: Point[]) => {
  let sum = 0
  for (let i = 0; i < a.length; i++) sum += Math.hypot(a[i].x - b[i].x, a[i].y - b[i].y)
  return sum / a.length
}

export function createPlaneTracker(
  initialQuad: Point[],
  firstFrame: Gray,
  options: TrackerOptions = {}
) {
  const levels = options.pyramidLevels ?? 3
  const margin = options.margin ?? 0.15
  const minInliers = options.minInliers ?? 20
  const minInlierRatio = options.minInlierRatio ?? 0.4
  const maxJump = options.maxJump ?? 40
  const maxJumpFraction = options.maxJumpFraction ?? 0.08
  const maxKeyframes = options.maxKeyframes ?? 8
  const maxCandidates = options.maxCandidates ?? 3
  const maxBaseline = options.maxBaseline ?? 20
  const maxBaselineFraction = options.maxBaselineFraction ?? 0.035
  const maxFramesPerKeyframe = options.maxFramesPerKeyframe ?? 90

  const makeKeyframe = (pyramid: Gray[], quad: Point[], clock: number): Keyframe => {
    const features = detectFeatures(pyramid[0], {
      quad: expandQuad(quad, margin),
      ...options.detect,
    })

    // the marked spots, projected into this keyframe through its own geometry
    const planePoints = options.planePoints
    if (planePoints?.length) {
      const h = homographyFromCorners(quad)
      if (h) {
        const border = 8
        for (const { u, w } of planePoints) {
          const p = applyHomography(h, u, w)
          if (p.w <= 1e-9 || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue
          if (
            p.x < border ||
            p.y < border ||
            p.x > pyramid[0].width - border ||
            p.y > pyramid[0].height - border
          ) {
            continue
          }
          features.unshift({ x: p.x, y: p.y })
        }
      }
    }

    return { pyramid, quad: quad.map((p) => ({ ...p })), features, lastUsed: clock }
  }

  let clock = 0
  // keyframes[0] is the user's calibrated frame and is never evicted
  const keyframes: Keyframe[] = [
    makeKeyframe(buildPyramid(firstFrame, levels), initialQuad, clock),
  ]
  let current = 0

  let lastPyramid: Gray[] | null = null
  let lastQuad: Point[] = keyframes[0].quad
  let currentQuad = keyframes[0].quad
  let framesOnKeyframe = 0

  const solveAgainst = (keyframe: Keyframe, pyramid: Gray[]) => {
    if (keyframe.features.length < 4) return null

    // The quad we already have IS an estimate of the plane transform, so it
    // predicts where each of the keyframe's features should have moved to.
    const predictor = solveHomography(keyframe.quad, currentQuad)
    const predictions = predictor
      ? keyframe.features.map((f) => {
          const p = applyHomography(predictor, f.x, f.y)
          return p.w > 1e-9 && Number.isFinite(p.x) && Number.isFinite(p.y)
            ? { x: p.x, y: p.y }
            : f
        })
      : undefined

    const correspondences = trackPoints(
      keyframe.pyramid,
      pyramid,
      keyframe.features,
      options.flow,
      predictions
    )
    if (correspondences.length < 4) return null
    const result = ransacHomography(correspondences, options.ransac)
    if (!result) return null
    const corners = warpQuad(result.homography, keyframe.quad)
    if (!corners) return null
    return {
      corners,
      ratio: result.inlierCount / correspondences.length,
      inliers: result.inlierCount,
    }
  }

  const acceptable = (attempt: { corners: Point[]; ratio: number; inliers: number } | null) => {
    if (!attempt) return false
    if (attempt.inliers < minInliers || attempt.ratio < minInlierRatio) return false
    // a head cannot move this far in one frame: a "confident" fit that says
    // otherwise matched the wrong keys, so throw it out
    const limit = Math.max(maxJump, quadScale(currentQuad) * maxJumpFraction)
    return meanCornerDistance(attempt.corners, currentQuad) <= limit
  }

  return {
    get quad() {
      return currentQuad
    },
    get keyframeCount() {
      return keyframes.length
    },

    step(frame: Gray): TrackerStep {
      const pyramid = buildPyramid(frame, levels)
      clock++
      let reAnchored = false

      // Try the keyframe whose stored pose is closest to where we are now: the
      // shortest baseline is the most reliable match. Head motion at a piano is
      // bounded and oscillatory, so this also snaps back onto an older keyframe
      // when the head returns — which resets drift instead of accumulating it.
      const byProximity = keyframes
        .map((keyframe, i) => ({ i, d: meanCornerDistance(keyframe.quad, currentQuad) }))
        .sort((a, b) => a.d - b.d)
        .map((entry) => entry.i)
      const order = [current, ...byProximity.filter((i) => i !== current)]

      let best: { corners: Point[]; ratio: number; inliers: number } | null = null
      let bestIndex = current
      for (const index of order.slice(0, maxCandidates)) {
        const attempt = solveAgainst(keyframes[index], pyramid)
        if (acceptable(attempt)) {
          best = attempt
          bestIndex = index
          break
        }
      }

      if (!best && lastPyramid) {
        // nothing stored matches: promote the last good frame to a new keyframe
        const keyframe = makeKeyframe(lastPyramid, lastQuad, clock)
        if (keyframes.length >= maxKeyframes) {
          // evict the stalest, never the user's calibration frame
          let stalest = 1
          for (let i = 2; i < keyframes.length; i++) {
            if (keyframes[i].lastUsed < keyframes[stalest].lastUsed) stalest = i
          }
          keyframes[stalest] = keyframe
          bestIndex = stalest
        } else {
          keyframes.push(keyframe)
          bestIndex = keyframes.length - 1
        }
        reAnchored = true
        const attempt = solveAgainst(keyframes[bestIndex], pyramid)
        if (acceptable(attempt)) best = attempt
      }

      if (!best) {
        // hold position rather than snapping somewhere wrong
        return { corners: currentQuad, confidence: 0, reAnchored, ok: false }
      }

      if (bestIndex !== current) framesOnKeyframe = 0
      current = bestIndex
      keyframes[bestIndex].lastUsed = clock
      currentQuad = best.corners
      lastPyramid = pyramid
      lastQuad = best.corners

      // baseline has stretched past the reliable range: store this frame (which we
      // just solved successfully) as a keyframe so the next frame matches a close one
      framesOnKeyframe++
      const baselineLimit = Math.max(
        maxBaseline,
        quadScale(currentQuad) * maxBaselineFraction
      )
      if (
        meanCornerDistance(currentQuad, keyframes[current].quad) > baselineLimit ||
        framesOnKeyframe > maxFramesPerKeyframe
      ) {
        const fresh = makeKeyframe(pyramid, currentQuad, clock)
        if (keyframes.length >= maxKeyframes) {
          let stalest = 1
          for (let i = 2; i < keyframes.length; i++) {
            if (keyframes[i].lastUsed < keyframes[stalest].lastUsed) stalest = i
          }
          keyframes[stalest] = fresh
          current = stalest
        } else {
          keyframes.push(fresh)
          current = keyframes.length - 1
        }
        framesOnKeyframe = 0
        reAnchored = true
      }

      return { corners: best.corners, confidence: best.ratio, reAnchored, ok: true }
    },
  }
}

/* ------------------------------------------------------------- track container */

export interface TrackSample {
  time: number
  corners: Point[]
  /** fraction of tracked points that agreed with the plane, 0-1 */
  confidence: number
}

/** Corners at a given time, linearly interpolated between samples. */
export function cornersAt(track: TrackSample[], time: number, fallback: Point[]): Point[] {
  if (track.length === 0) return fallback
  if (time <= track[0].time) return track[0].corners
  const last = track[track.length - 1]
  if (time >= last.time) return last.corners

  let lo = 0
  let hi = track.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (track[mid].time <= time) lo = mid
    else hi = mid
  }
  const a = track[lo]
  const b = track[hi]
  const span = b.time - a.time
  const t = span > 1e-9 ? (time - a.time) / span : 0
  return a.corners.map((corner, i) => ({
    x: corner.x + (b.corners[i].x - corner.x) * t,
    y: corner.y + (b.corners[i].y - corner.y) * t,
  }))
}

/**
 * Centered moving average over the corner trajectories. Offline tracking can use
 * a symmetric filter, so jitter goes away without introducing lag.
 */
export function smoothTrack(track: TrackSample[], radius = 2): TrackSample[] {
  if (radius <= 0 || track.length < 3) return track
  return track.map((sample, i) => {
    const from = Math.max(0, i - radius)
    const to = Math.min(track.length - 1, i + radius)
    const count = to - from + 1
    const corners = sample.corners.map((_, c) => {
      let x = 0
      let y = 0
      for (let k = from; k <= to; k++) {
        x += track[k].corners[c].x
        y += track[k].corners[c].y
      }
      return { x: x / count, y: y / count }
    })
    return { ...sample, corners }
  })
}

/** Apply a homography to the four corners of a quad. */
export function warpQuad(h: Homography, corners: Point[]): Point[] | null {
  const out: Point[] = []
  for (const corner of corners) {
    const p = applyHomography(h, corner.x, corner.y)
    if (p.w <= 1e-9 || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null
    out.push({ x: p.x, y: p.y })
  }
  return out
}
