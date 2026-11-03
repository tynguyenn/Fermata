import { isBlackKey } from './midi'
import {
  applyHomography,
  refineHomography,
  solveHomography,
  type Homography,
  type Point,
} from './homography'

export interface OverlaySettings {
  /**
   * 'flat' draws a Synthesia-style rectangle with its own drawn keyboard.
   * 'perspective' maps the roll onto the real piano in the video: notes land on
   * the actual keys and the real keys light up. See lib/homography.ts.
   */
  mode: 'flat' | 'perspective'

  /**
   * 'corners' pins the four corners of the whole keyboard — only possible when the
   * whole instrument is in frame. 'anchors' pins individual identified key edges
   * instead, so a shot that crops the ends still calibrates: four known key edges
   * determine the same plane, and the off-screen ends are extrapolated from it.
   */
  calibrationMode: 'corners' | 'anchors'

  // ---- perspective: the real keyboard's four corners, % of the video frame,
  //      ordered near-left, near-right, far-right, far-left ----
  corners: Point[]
  /** identified key edges, used when calibrationMode is 'anchors' */
  anchors: KeyAnchor[]
  /**
   * Video time the corners/anchors were placed against. Calibration only describes
   * the plane at one instant, so motion tracking has to start from this frame —
   * seeding it from an arbitrary playhead would start with the wrong geometry.
   */
  calibratedAt: number
  /** 0 = notes recede along the piano's plane, 1 = notes fall down a vertical wall */
  highwayTilt: number
  /** flat end of the blend: how many keyboard-lengths of highway are visible */
  highwayDepth: number
  /** vertical end of the blend: how far the wall rises, % of frame height */
  riseHeight: number
  /** widen (>1) or narrow (<1) the top of the wall to match the camera */
  riseSpread: number
  /** follow the tracked keyboard motion instead of the fixed corners */
  useTrack: boolean
  /** outline the computed keys over the real ones — the calibration aid */
  showKeyGuide: boolean
  guideOpacity: number
  /** light up the real keys as they are played */
  keyHighlight: boolean
  highlightAlpha: number
  /** brief burst on the key at the moment a note lands */
  hitFlash: boolean
  /** how much notes dim as they approach the far end, 0-1 */
  fadeFar: number
  /** black keys start this far back along the key length (0 = front, 1 = far edge) */
  blackKeyDepth: number

  // ---- sync ----
  midiOffset: number // seconds: midiTime = videoTime + midiOffset
  audioOffset: number // seconds: audioTime = videoTime + audioOffset
  useRecordedAudio: boolean
  videoVolume: number
  audioVolume: number

  // ---- placement, as % of the video frame ----
  x: number
  y: number
  width: number
  height: number

  // ---- roll ----
  lookAhead: number // seconds of music visible in the roll
  direction: 'down' | 'up'
  opacity: number // 0-1, whole overlay
  bgOpacity: number // 0-1, dark backdrop behind the roll
  showKeyboard: boolean
  keyboardHeight: number // fraction of overlay height
  showHitLine: boolean
  showOctaveLines: boolean
  lowNote: number
  highNote: number
  noteRadius: number // px
  noteGap: number // px shaved off each side of a note
  glow: boolean

  // ---- colors ----
  colorMode: 'pitch' | 'track'
  splitNote: number // pitch mode: notes >= this are "right hand"
  rightColor: string
  leftColor: string

  hiddenTracks: number[]
}

/** A point on the keyboard whose musical identity is known. */
export interface KeyAnchor {
  id: string
  /** which key this sits on */
  midi: number
  /** which vertical edge of that key */
  side: 'left' | 'right'
  /**
   * how far into the keyboard: the front lip of the white keys, the front edge of
   * the black keys (often the clearest line in a low camera angle), or the back of
   * the keys where they meet the fallboard.
   */
  depth: 'front' | 'blackFront' | 'back'
  /** position in the video frame, % */
  x: number
  y: number
}

export const ANCHOR_DEPTH_LABELS: Record<KeyAnchor['depth'], string> = {
  front: 'Front lip',
  blackFront: 'Black-key front',
  back: 'Back of keys',
}

export const DEFAULT_SETTINGS: OverlaySettings = {
  mode: 'flat',
  calibrationMode: 'corners',

  // a plausible POV starting quad — the user drags these onto the real keys
  corners: [
    { x: 8, y: 90 },
    { x: 92, y: 90 },
    { x: 80, y: 70 },
    { x: 20, y: 70 },
  ],
  // two keys, two octaves apart, each pinned front and back: a wide baseline in
  // both directions, which is what keeps the extrapolation to the ends stable
  anchors: [
    { id: 'a1', midi: 48, side: 'left', depth: 'front', x: 28, y: 88 },
    { id: 'a2', midi: 48, side: 'left', depth: 'back', x: 31, y: 74 },
    { id: 'a3', midi: 72, side: 'right', depth: 'front', x: 72, y: 88 },
    { id: 'a4', midi: 72, side: 'right', depth: 'back', x: 69, y: 74 },
  ],
  calibratedAt: 0,
  highwayTilt: 1,
  highwayDepth: 6,
  riseHeight: 45,
  riseSpread: 1,
  useTrack: true,
  showKeyGuide: true,
  guideOpacity: 0.5,
  keyHighlight: true,
  highlightAlpha: 0.55,
  hitFlash: true,
  fadeFar: 0.55,
  blackKeyDepth: 0.42,

  midiOffset: 0,
  audioOffset: 0,
  useRecordedAudio: true,
  videoVolume: 1,
  audioVolume: 1,

  x: 0,
  y: 0,
  width: 100,
  height: 55,

  lookAhead: 3,
  direction: 'down',
  opacity: 0.9,
  bgOpacity: 0.25,
  showKeyboard: true,
  keyboardHeight: 0.16,
  showHitLine: true,
  showOctaveLines: true,
  lowNote: 36,
  highNote: 96,
  noteRadius: 4,
  noteGap: 1,
  glow: true,

  colorMode: 'pitch',
  splitNote: 60,
  rightColor: '#38bdf8',
  leftColor: '#34d399',

  hiddenTracks: [],
}

const TRACK_PALETTE = ['#38bdf8', '#34d399', '#f59e0b', '#a855f7', '#f472b6', '#facc15']

/** Colour a note the same way in the video overlay and the alignment timeline. */
export function noteColor(
  note: { midi: number; track: number },
  settings: OverlaySettings
): string {
  if (settings.colorMode === 'track') {
    // track 0 and 1 are usually the two hands; anything beyond gets a palette slot
    if (note.track === 0) return settings.rightColor
    if (note.track === 1) return settings.leftColor
    return TRACK_PALETTE[note.track % TRACK_PALETTE.length]
  }
  return note.midi >= settings.splitNote ? settings.rightColor : settings.leftColor
}

/** `#rrggbb` -> `rgba(...)`, passing through anything else untouched. */
export function withAlpha(hex: string, alpha: number): string {
  const m = /^#?([\da-f]{6})$/i.exec(hex.trim())
  if (!m) return hex
  const int = parseInt(m[1], 16)
  return `rgba(${(int >> 16) & 255}, ${(int >> 8) & 255}, ${int & 255}, ${alpha})`
}

/** Where the video image sits inside its (object-fit: contain) box. */
export function contentRect(cw: number, ch: number, vw: number, vh: number) {
  if (!vw || !vh) return { x: 0, y: 0, w: cw, h: ch }
  const scale = Math.min(cw / vw, ch / vh)
  const w = vw * scale
  const h = vh * scale
  return { x: (cw - w) / 2, y: (ch - h) / 2, w, h }
}

export interface KeySpan {
  midi: number
  /** left edge across the keyboard, 0-1 */
  u0: number
  /** right edge across the keyboard, 0-1 */
  u1: number
  black: boolean
}

/**
 * Key edges in normalised keyboard space, in real piano proportions: white keys
 * of equal width, black keys 62% as wide straddling the seam between them. Used
 * for the drawn keyboard, the perspective key quads and the note lanes alike, so
 * all three agree by construction.
 */
export function buildKeySpans(lowNote: number, highNote: number): KeySpan[] {
  let low = Math.min(lowNote, highNote)
  let high = Math.max(lowNote, highNote)
  while (isBlackKey(low) && low > 0) low--
  while (isBlackKey(high) && high < 127) high++

  const whites: number[] = []
  for (let m = low; m <= high; m++) if (!isBlackKey(m)) whites.push(m)
  if (whites.length === 0) return []

  const whiteWidth = 1 / whites.length
  const spans: KeySpan[] = []
  const whiteLeft = new Map<number, number>()
  whites.forEach((m, i) => {
    const u0 = i * whiteWidth
    whiteLeft.set(m, u0)
    spans.push({ midi: m, u0, u1: u0 + whiteWidth, black: false })
  })

  const blackWidth = whiteWidth * 0.62
  for (let m = low; m <= high; m++) {
    if (!isBlackKey(m)) continue
    const nextWhite = whiteLeft.get(m + 1)
    if (nextWhite === undefined) continue
    spans.push({ midi: m, u0: nextWhite - blackWidth / 2, u1: nextWhite + blackWidth / 2, black: true })
  }

  return spans
}

/** Common physical keyboard sizes — the quad must span the whole instrument. */
export const KEYBOARD_PRESETS: { label: string; low: number; high: number }[] = [
  { label: '88 (A0-C8)', low: 21, high: 108 },
  { label: '76 (E1-G7)', low: 28, high: 103 },
  { label: '73 (E1-E7)', low: 28, high: 100 },
  { label: '61 (C2-C7)', low: 36, high: 96 },
  { label: '49 (C2-C6)', low: 36, high: 84 },
  { label: '37 (C3-C6)', low: 48, high: 84 },
]

/** Where an anchor sits in keyboard space, or null if its key is out of range. */
export function anchorKeyboardPoint(
  anchor: KeyAnchor,
  spans: KeySpan[],
  blackKeyDepth: number
): { u: number; w: number } | null {
  const span = spans.find((k) => k.midi === anchor.midi)
  if (!span) return null
  const u = anchor.side === 'left' ? span.u0 : span.u1
  // a black key has no front lip, so treat that choice as its own front edge
  const depth = span.black && anchor.depth === 'front' ? 'blackFront' : anchor.depth
  const w = depth === 'front' ? 0 : depth === 'back' ? 1 : blackKeyDepth
  return { u, w }
}

/**
 * Solve the keyboard plane from identified key edges, then report the implied
 * corners of the whole instrument — which may well sit outside the frame. The rest
 * of the pipeline (rendering, tracking) keeps working on corners, so this is the
 * only place that needs to know anchors exist.
 */
export function cornersFromAnchors(
  anchors: KeyAnchor[],
  spans: KeySpan[],
  blackKeyDepth: number
): Point[] | null {
  const src: Point[] = []
  const dst: Point[] = []
  for (const anchor of anchors) {
    const point = anchorKeyboardPoint(anchor, spans, blackKeyDepth)
    if (!point) continue
    src.push({ x: point.u, y: point.w })
    dst.push({ x: anchor.x, y: anchor.y })
  }
  if (src.length < 4) return null

  const h: Homography | null =
    src.length === 4 ? solveHomography(src, dst) : refineHomography(src, dst)
  if (!h) return null

  const corners: Point[] = []
  for (const [u, w] of [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ]) {
    const p = applyHomography(h, u, w)
    if (!(p.w > 1e-9) || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return null
    corners.push({ x: p.x, y: p.y })
  }
  return corners
}

/** The corners actually in force, given the calibration mode. */
export function effectiveCorners(settings: OverlaySettings, spans: KeySpan[]): Point[] {
  if (settings.calibrationMode !== 'anchors') return settings.corners
  return cornersFromAnchors(settings.anchors, spans, settings.blackKeyDepth) ?? settings.corners
}
