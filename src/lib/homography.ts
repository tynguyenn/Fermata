/*
 * Planar homography: maps keyboard-plane coordinates onto screen pixels.
 *
 * The keyboard is a flat rectangle in the world, so its image in the video is a
 * projective transform of that rectangle. Once four corners are pinned, the same
 * transform describes the whole plane — including the ground *beyond* the far
 * edge of the keys, which is where the falling notes live. That's why extending
 * the note highway past the keyboard converges toward a real vanishing point
 * instead of needing a fudged fake-3D effect.
 *
 * Keyboard space: u across the keys (0 = lowest key's left edge, 1 = highest
 * key's right edge), w into the scene (0 = near edge nearest the player,
 * 1 = far edge of the keys, >1 = the highway receding away).
 */

export interface Point {
  x: number
  y: number
}

/** Row-major 3x3. */
export type Homography = Float64Array

export interface MappedPoint {
  x: number
  y: number
  /** homogeneous denominator; <= 0 means the point is at or behind the horizon */
  w: number
}

/** Gaussian elimination with partial pivoting. Mutates `a` and `b`. */
function solveLinearSystem(a: number[][], b: number[]): number[] | null {
  const n = b.length
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r
    }
    if (Math.abs(a[pivot][col]) < 1e-12) return null // degenerate (collinear corners)
    if (pivot !== col) {
      const rowTmp = a[col]
      a[col] = a[pivot]
      a[pivot] = rowTmp
      const valTmp = b[col]
      b[col] = b[pivot]
      b[pivot] = valTmp
    }
    const d = a[col][col]
    for (let r = col + 1; r < n; r++) {
      const f = a[r][col] / d
      if (f === 0) continue
      for (let c = col; c < n; c++) a[r][c] -= f * a[col][c]
      b[r] -= f * b[col]
    }
  }
  const x = new Array<number>(n).fill(0)
  for (let r = n - 1; r >= 0; r--) {
    let sum = b[r]
    for (let c = r + 1; c < n; c++) sum -= a[r][c] * x[c]
    x[r] = sum / a[r][r]
  }
  return x
}

/**
 * Homography taking four source points to four destination points.
 * Returns null if the correspondence is degenerate.
 */
export function solveHomography(src: Point[], dst: Point[]): Homography | null {
  if (src.length < 4 || dst.length < 4) return null

  // h33 is fixed at 1, leaving 8 unknowns and 8 equations
  const a: number[][] = []
  const b: number[] = []
  for (let i = 0; i < 4; i++) {
    const { x: u, y: v } = src[i]
    const { x, y } = dst[i]
    a.push([u, v, 1, 0, 0, 0, -u * x, -v * x])
    b.push(x)
    a.push([0, 0, 0, u, v, 1, -u * y, -v * y])
    b.push(y)
  }

  const h = solveLinearSystem(a, b)
  if (!h) return null
  if (!h.every((value) => Number.isFinite(value))) return null

  return Float64Array.of(h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1)
}

const UNIT_SQUARE: Point[] = [
  { x: 0, y: 0 }, // near-left
  { x: 1, y: 0 }, // near-right
  { x: 1, y: 1 }, // far-right
  { x: 0, y: 1 }, // far-left
]

/**
 * Homography from keyboard space (unit square = the keyboard rectangle) to the
 * screen, given the four keyboard corners in screen pixels. Corner order is
 * near-left, near-right, far-right, far-left — the same order the UI handles use.
 */
export function homographyFromCorners(corners: Point[]): Homography | null {
  return solveHomography(UNIT_SQUARE, corners)
}

export function applyHomography(h: Homography, u: number, v: number): MappedPoint {
  const w = h[6] * u + h[7] * v + h[8]
  return {
    x: (h[0] * u + h[1] * v + h[2]) / w,
    y: (h[3] * u + h[4] * v + h[5]) / w,
    w,
  }
}

/**
 * Depth `w` at which the plane crosses the horizon and points blow up.
 * Returns Infinity when the plane never vanishes within the view (a straight-on
 * shot with no convergence). Callers should stop the highway short of this.
 */
export function horizonDepth(h: Homography): number {
  const h31 = h[6]
  const h32 = h[7]
  const h33 = h[8]
  if (Math.abs(h32) < 1e-12) return Infinity

  let nearest = Infinity
  for (const u of [0, 1]) {
    const w = -(h31 * u + h33) / h32
    if (w > 1 && w < nearest) nearest = w
  }
  return nearest
}

/** Largest usable highway depth: short of the horizon, and never past `requested`. */
export function clampDepth(h: Homography, requested: number): number {
  const horizon = horizonDepth(h)
  if (!Number.isFinite(horizon)) return Math.max(1, requested)
  return Math.max(1, Math.min(requested, 1 + (horizon - 1) * 0.85))
}

/** Similarity transform putting points at the centroid with mean distance sqrt(2). */
function normalize(points: Point[]) {
  let cx = 0
  let cy = 0
  for (const p of points) {
    cx += p.x
    cy += p.y
  }
  cx /= points.length
  cy /= points.length
  let mean = 0
  for (const p of points) mean += Math.hypot(p.x - cx, p.y - cy)
  mean /= points.length
  const scale = mean > 1e-9 ? Math.SQRT2 / mean : 1
  return {
    scale,
    cx,
    cy,
    apply: (p: Point) => ({ x: (p.x - cx) * scale, y: (p.y - cy) * scale }),
  }
}

/**
 * Least-squares homography over all correspondences (normalized DLT with h33=1).
 * Used to refine after RANSAC has chosen the inlier set.
 */
export function refineHomography(src: Point[], dst: Point[]): Homography | null {
  const n = Math.min(src.length, dst.length)
  if (n < 4) return null

  const ns = normalize(src)
  const nd = normalize(dst)

  // normal equations for the 8 unknowns
  const ata: number[][] = Array.from({ length: 8 }, () => new Array<number>(8).fill(0))
  const atb: number[] = new Array<number>(8).fill(0)

  const addRow = (row: number[], value: number) => {
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) ata[i][j] += row[i] * row[j]
      atb[i] += row[i] * value
    }
  }

  for (let i = 0; i < n; i++) {
    const s = ns.apply(src[i])
    const d = nd.apply(dst[i])
    addRow([s.x, s.y, 1, 0, 0, 0, -s.x * d.x, -s.y * d.x], d.x)
    addRow([0, 0, 0, s.x, s.y, 1, -s.x * d.y, -s.y * d.y], d.y)
  }

  // reuse the square solver on the normal equations
  const solved = solveSquare(ata, atb)
  if (!solved) return null

  // H_normalized, then undo both normalizations: H = Td^-1 * Hn * Ts
  const hn = [
    [solved[0], solved[1], solved[2]],
    [solved[3], solved[4], solved[5]],
    [solved[6], solved[7], 1],
  ]
  const ts = [
    [ns.scale, 0, -ns.scale * ns.cx],
    [0, ns.scale, -ns.scale * ns.cy],
    [0, 0, 1],
  ]
  const tdInv = [
    [1 / nd.scale, 0, nd.cx],
    [0, 1 / nd.scale, nd.cy],
    [0, 0, 1],
  ]
  const m1 = multiply3(hn, ts)
  const m2 = multiply3(tdInv, m1)
  if (Math.abs(m2[2][2]) < 1e-12) return null
  const k = 1 / m2[2][2]
  return Float64Array.of(
    m2[0][0] * k, m2[0][1] * k, m2[0][2] * k,
    m2[1][0] * k, m2[1][1] * k, m2[1][2] * k,
    m2[2][0] * k, m2[2][1] * k, 1
  )
}

function multiply3(a: number[][], b: number[][]): number[][] {
  const out = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ]
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      let sum = 0
      for (let k = 0; k < 3; k++) sum += a[i][k] * b[k][j]
      out[i][j] = sum
    }
  }
  return out
}

function solveSquare(a: number[][], b: number[]): number[] | null {
  const n = b.length
  const m = a.map((row) => [...row])
  const v = [...b]
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r
    }
    if (Math.abs(m[pivot][col]) < 1e-14) return null
    if (pivot !== col) {
      const t = m[col]
      m[col] = m[pivot]
      m[pivot] = t
      const tv = v[col]
      v[col] = v[pivot]
      v[pivot] = tv
    }
    for (let r = col + 1; r < n; r++) {
      const f = m[r][col] / m[col][col]
      if (f === 0) continue
      for (let c = col; c < n; c++) m[r][c] -= f * m[col][c]
      v[r] -= f * v[col]
    }
  }
  const x = new Array<number>(n).fill(0)
  for (let r = n - 1; r >= 0; r--) {
    let sum = v[r]
    for (let c = r + 1; c < n; c++) sum -= m[r][c] * x[c]
    x[r] = sum / m[r][r]
  }
  return x.every((value) => Number.isFinite(value)) ? x : null
}
