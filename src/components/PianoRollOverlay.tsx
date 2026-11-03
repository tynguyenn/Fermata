import { useEffect, useRef } from 'react'
import { midiToName, type MidiNote } from '../lib/midi'
import {
  buildKeySpans,
  contentRect,
  noteColor,
  withAlpha,
  type KeySpan,
  type OverlaySettings,
} from '../lib/overlay'
import {
  applyHomography,
  clampDepth,
  homographyFromCorners,
  type Homography,
  type MappedPoint,
  type Point,
} from '../lib/homography'
import { cornersAt, type TrackSample } from '../lib/tracking'

type Rect = { x: number; y: number; w: number; h: number }

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  if (radius > 0 && typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, radius)
  } else {
    ctx.rect(x, y, w, h)
  }
  ctx.fill()
}

function quadPath(ctx: CanvasRenderingContext2D, pts: Point[]) {
  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y)
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y)
  ctx.closePath()
}

const lerpPoint = (a: Point, b: Point, t: number): Point => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
})

const finitePoint = (p: MappedPoint) => p.w > 1e-9 && Number.isFinite(p.x) && Number.isFinite(p.y)

/* -------------------------------------------------------------- flat renderer */

function drawFlat(
  ctx: CanvasRenderingContext2D,
  frame: Rect,
  s: OverlaySettings,
  spans: KeySpan[],
  notes: MidiNote[],
  t: number
) {
  const ox = frame.x + (frame.w * s.x) / 100
  const oy = frame.y + (frame.h * s.y) / 100
  const ow = (frame.w * s.width) / 100
  const oh = (frame.h * s.height) / 100
  if (ow <= 2 || oh <= 2) return

  const kbHeight = s.showKeyboard ? oh * s.keyboardHeight : 0
  const rollHeight = Math.max(0, oh - kbHeight)
  const down = s.direction === 'down'
  const rollTop = down ? oy : oy + kbHeight
  const hitLine = down ? oy + rollHeight : oy + kbHeight
  const kbTop = down ? oy + rollHeight : oy
  const hidden = new Set(s.hiddenTracks)

  const keyOf = new Map(spans.map((k) => [k.midi, k]))
  const px = (k: KeySpan) => ({ x: ox + k.u0 * ow, w: (k.u1 - k.u0) * ow })

  if (s.bgOpacity > 0 && rollHeight > 0) {
    ctx.fillStyle = `rgba(0, 0, 0, ${s.bgOpacity})`
    ctx.fillRect(ox, rollTop, ow, rollHeight)
  }

  if (s.showOctaveLines && rollHeight > 0) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)'
    ctx.lineWidth = 1
    for (const k of spans) {
      if (k.black || k.midi % 12 !== 0) continue
      const x = Math.round(px(k).x) + 0.5
      ctx.beginPath()
      ctx.moveTo(x, rollTop)
      ctx.lineTo(x, rollTop + rollHeight)
      ctx.stroke()
    }
  }

  const active = new Map<number, string>()
  if (rollHeight > 0 && s.lookAhead > 0) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(ox, rollTop, ow, rollHeight)
    ctx.clip()

    const pxPerSecond = rollHeight / s.lookAhead
    for (const n of notes) {
      if (n.time > t + s.lookAhead) break
      const end = n.time + n.duration
      if (end < t || hidden.has(n.track)) continue
      const key = keyOf.get(n.midi)
      if (!key) continue

      const color = noteColor(n, s)
      const { x, w } = px(key)
      const noteLength = Math.max(n.duration * pxPerSecond, 2)
      const distance = (n.time - t) * pxPerSecond
      const top = down ? hitLine - distance - noteLength : hitLine + distance
      const gap = Math.min(s.noteGap, w / 3)

      ctx.fillStyle = withAlpha(color, 0.55 + 0.45 * n.velocity)
      if (s.glow) {
        ctx.shadowColor = withAlpha(color, 0.9)
        ctx.shadowBlur = 12
      }
      roundedRect(ctx, x + gap, top, Math.max(1, w - gap * 2), noteLength, s.noteRadius)
      ctx.shadowBlur = 0

      if (n.time <= t && end >= t) active.set(n.midi, color)
    }
    ctx.restore()
  }

  if (s.showHitLine) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(ox, hitLine)
    ctx.lineTo(ox + ow, hitLine)
    ctx.stroke()
  }

  if (s.showKeyboard && kbHeight > 1) {
    const blackHeight = kbHeight * 0.62
    const blackTop = down ? kbTop : kbTop + (kbHeight - blackHeight)
    for (const k of spans) {
      if (k.black) continue
      const { x, w } = px(k)
      const hit = active.get(k.midi)
      ctx.fillStyle = hit ? withAlpha(hit, 0.95) : 'rgba(245, 245, 245, 0.85)'
      ctx.fillRect(x, kbTop, w, kbHeight)
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.45)'
      ctx.lineWidth = 1
      ctx.strokeRect(x, kbTop, w, kbHeight)
    }
    for (const k of spans) {
      if (!k.black) continue
      const { x, w } = px(k)
      const hit = active.get(k.midi)
      ctx.fillStyle = hit ? withAlpha(hit, 0.95) : 'rgba(15, 15, 18, 0.92)'
      ctx.fillRect(x, blackTop, w, blackHeight)
    }
  }
}

/* ------------------------------------------------------- perspective renderer */

const FLASH_SECONDS = 0.15

interface CalibrationAid {
  calibrating: boolean
  activeCorner: number | null
  /** the untracked corners, drawn as a ghost so track movement is visible */
  ghost: Point[] | null
  /** keys carrying an anchor — drawn distinctly so they can be verified */
  anchoredKeys: number[] | null
}

const GUIDE_C4 = 'rgba(34, 211, 238, 0.6)'
const GUIDE_END = 'rgba(244, 63, 94, 0.5)'
const GUIDE_ANCHOR = 'rgba(163, 230, 53, 0.6)'

function drawPerspective(
  ctx: CanvasRenderingContext2D,
  frame: Rect,
  s: OverlaySettings,
  spans: KeySpan[],
  notes: MidiNote[],
  t: number,
  quad: Point[],
  aid: CalibrationAid
) {
  const { calibrating, activeCorner, ghost, anchoredKeys } = aid
  // the keyboard's corners for this frame, in screen pixels
  const corners = quad.map((c) => ({
    x: frame.x + (frame.w * c.x) / 100,
    y: frame.y + (frame.h * c.y) / 100,
  }))
  const keyboard = homographyFromCorners(corners)
  if (!keyboard) return // degenerate quad — nothing sensible to draw

  const kbFarLeft = corners[3]
  const kbFarRight = corners[2]

  // Far edge of the note highway: either receding along the piano's own plane,
  // or standing straight up off the back of the keys. `highwayTilt` blends them.
  const tilt = Math.max(0, Math.min(1, s.highwayTilt))
  const depth = clampDepth(keyboard, 1 + Math.max(0.2, s.highwayDepth))
  const flatLeft = applyHomography(keyboard, 0, depth)
  const flatRight = applyHomography(keyboard, 1, depth)

  const rise = (frame.h * s.riseHeight) / 100
  const centerX = (kbFarLeft.x + kbFarRight.x) / 2
  const vertLeft = {
    x: centerX + (kbFarLeft.x - centerX) * s.riseSpread,
    y: kbFarLeft.y - rise,
  }
  const vertRight = {
    x: centerX + (kbFarRight.x - centerX) * s.riseSpread,
    y: kbFarRight.y - rise,
  }

  const usable = finitePoint(flatLeft) && finitePoint(flatRight)
  const farLeft = usable ? lerpPoint(flatLeft, vertLeft, tilt) : vertLeft
  const farRight = usable ? lerpPoint(flatRight, vertRight, tilt) : vertRight

  // highway space: u across the keys, v from 0 at the back of the keys to 1 at the far end
  const highway = homographyFromCorners([kbFarLeft, kbFarRight, farRight, farLeft])
  if (!highway) return

  const hw = (u: number, v: number) => applyHomography(highway, u, v)
  const kb = (u: number, w: number) => applyHomography(keyboard, u, w)
  const keyOf = new Map(spans.map((k) => [k.midi, k]))
  const hidden = new Set(s.hiddenTracks)

  ctx.globalAlpha = s.opacity

  // ---- highway backdrop, fading out with distance ----
  if (s.bgOpacity > 0) {
    const nearMid = hw(0.5, 0)
    const farMid = hw(0.5, 1)
    if (finitePoint(nearMid) && finitePoint(farMid)) {
      const gradient = ctx.createLinearGradient(nearMid.x, nearMid.y, farMid.x, farMid.y)
      gradient.addColorStop(0, `rgba(0, 0, 0, ${s.bgOpacity})`)
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
      const quad = [hw(0, 0), hw(1, 0), hw(1, 1), hw(0, 1)]
      if (quad.every(finitePoint)) {
        quadPath(ctx, quad)
        ctx.fillStyle = gradient
        ctx.fill()
      }
    }
  }

  // ---- lane lines at each C ----
  if (s.showOctaveLines) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)'
    ctx.lineWidth = 1
    for (const k of spans) {
      if (k.black || k.midi % 12 !== 0) continue
      const a = hw(k.u0, 0)
      const b = hw(k.u0, 1)
      if (!finitePoint(a) || !finitePoint(b)) continue
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
    }
  }

  // ---- notes, far ones first so nearer notes overlap them ----
  const active = new Map<number, string>()
  const flashes: { key: KeySpan; color: string; age: number }[] = []
  const visible: { n: MidiNote; v0: number; v1: number; key: KeySpan }[] = []

  for (const n of notes) {
    const v0 = (n.time - t) / s.lookAhead
    if (v0 > 1) break // sorted by time
    const end = n.time + n.duration
    const v1 = (end - t) / s.lookAhead
    if (v1 < 0 || hidden.has(n.track)) continue
    const key = keyOf.get(n.midi)
    if (!key) continue

    if (n.time <= t && end >= t) {
      const color = noteColor(n, s)
      active.set(n.midi, color)
      const age = t - n.time
      if (s.hitFlash && age < FLASH_SECONDS) flashes.push({ key, color, age })
    }
    if (v1 > 0) visible.push({ n, v0: Math.max(0, v0), v1: Math.min(1, v1), key })
  }

  for (let i = visible.length - 1; i >= 0; i--) {
    const { n, key, v0 } = visible[i]
    const v1 = Math.max(visible[i].v1, v0 + 0.004) // keep very short notes visible
    const quad = [hw(key.u0, v0), hw(key.u1, v0), hw(key.u1, v1), hw(key.u0, v1)]
    if (!quad.every(finitePoint)) continue

    const color = noteColor(n, s)
    const alpha = (0.55 + 0.45 * n.velocity) * (1 - s.fadeFar * v0)
    ctx.fillStyle = withAlpha(color, Math.max(0.05, alpha))
    if (s.glow) {
      ctx.shadowColor = withAlpha(color, 0.9 * (1 - v0))
      ctx.shadowBlur = 14 * (1 - v0)
    }
    quadPath(ctx, quad)
    ctx.fill()
    ctx.shadowBlur = 0
  }

  // ---- light up the real keys ----
  if (s.keyHighlight && active.size > 0) {
    for (const black of [false, true]) {
      for (const k of spans) {
        if (k.black !== black) continue
        const color = active.get(k.midi)
        if (!color) continue
        const back = black ? s.blackKeyDepth : 0
        const quad = [kb(k.u0, back), kb(k.u1, back), kb(k.u1, 1), kb(k.u0, 1)]
        if (!quad.every(finitePoint)) continue
        quadPath(ctx, quad)
        ctx.fillStyle = withAlpha(color, s.highlightAlpha)
        ctx.fill()
      }
    }
  }

  // ---- burst at the moment of the hit ----
  for (const { key, color, age } of flashes) {
    const center = kb((key.u0 + key.u1) / 2, key.black ? (s.blackKeyDepth + 1) / 2 : 0.5)
    const edge = kb(key.u1, 0.5)
    if (!finitePoint(center) || !finitePoint(edge)) continue
    const radius = Math.max(6, Math.hypot(edge.x - center.x, edge.y - center.y) * 3)
    const strength = 1 - age / FLASH_SECONDS
    const gradient = ctx.createRadialGradient(center.x, center.y, 0, center.x, center.y, radius)
    gradient.addColorStop(0, withAlpha(color, 0.75 * strength))
    gradient.addColorStop(0.4, withAlpha(color, 0.3 * strength))
    gradient.addColorStop(1, withAlpha(color, 0))
    ctx.fillStyle = gradient
    ctx.beginPath()
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2)
    ctx.fill()
  }

  // ---- the drawn keys, over the real ones ----
  // While positioning corners this goes near-solid: you are matching drawn keys to
  // real keys, and you cannot line up what you can barely see. Outside calibration
  // it stays a faint guide, and the Preview toggle removes it altogether.
  if (s.showKeyGuide || calibrating) {
    const solid = calibrating
    const a = s.guideOpacity
    const previousAlpha = ctx.globalAlpha
    if (solid) ctx.globalAlpha = 1

    for (const k of spans) {
      if (k.black) continue
      const cell = [kb(k.u0, 0), kb(k.u1, 0), kb(k.u1, 1), kb(k.u0, 1)]
      if (!cell.every(finitePoint)) continue
      quadPath(ctx, cell)
      if (solid) {
        ctx.fillStyle = 'rgba(248, 248, 250, 0.72)'
        ctx.fill()
        quadPath(ctx, cell)
      }
      ctx.strokeStyle = solid ? 'rgba(18, 18, 24, 0.85)' : `rgba(255, 255, 255, ${0.45 * a})`
      ctx.lineWidth = solid ? 1.5 : 1
      ctx.stroke()
    }

    for (const k of spans) {
      if (!k.black) continue
      const cell = [
        kb(k.u0, s.blackKeyDepth),
        kb(k.u1, s.blackKeyDepth),
        kb(k.u1, 1),
        kb(k.u0, 1),
      ]
      if (!cell.every(finitePoint)) continue
      quadPath(ctx, cell)
      ctx.fillStyle = solid ? 'rgba(9, 9, 13, 0.92)' : `rgba(0, 0, 0, ${0.45 * a})`
      ctx.fill()
      quadPath(ctx, cell)
      ctx.strokeStyle = solid ? 'rgba(228, 228, 235, 0.45)' : `rgba(255, 255, 255, ${0.3 * a})`
      ctx.lineWidth = 1
      ctx.stroke()
    }

    // landmark keys: middle C plus the two ends, so there is something
    // unmistakable to line the drawn keyboard up against
    if (solid) {
      const white = spans.filter((k) => !k.black)
      const lowest = white.reduce((a2, b) => (a2.u0 < b.u0 ? a2 : b))
      const highest = white.reduce((a2, b) => (a2.u1 > b.u1 ? a2 : b))
      const landmarks: { key: KeySpan; color: string; label: string }[] = [
        { key: lowest, color: GUIDE_END, label: midiToName(lowest.midi) },
        { key: highest, color: GUIDE_END, label: midiToName(highest.midi) },
      ]
      const middleC = spans.find((k) => k.midi === 60 && !k.black)
      if (middleC) landmarks.push({ key: middleC, color: GUIDE_C4, label: 'C4' })

      // the keys you pinned: verify the drawn key really is the key you marked
      for (const midi of anchoredKeys ?? []) {
        const key = spans.find((k) => k.midi === midi)
        if (key) landmarks.push({ key, color: GUIDE_ANCHOR, label: midiToName(midi) })
      }

      for (const { key, color, label } of landmarks) {
        const cell = [kb(key.u0, 0), kb(key.u1, 0), kb(key.u1, 1), kb(key.u0, 1)]
        if (!cell.every(finitePoint)) continue
        quadPath(ctx, cell)
        ctx.fillStyle = color
        ctx.fill()
        quadPath(ctx, cell)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)'
        ctx.lineWidth = 1.5
        ctx.stroke()

        const tag = kb((key.u0 + key.u1) / 2, 0.55)
        if (finitePoint(tag)) {
          ctx.font = 'bold 12px ui-sans-serif, system-ui, sans-serif'
          ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
          ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)'
          ctx.lineWidth = 3
          ctx.strokeText(label, tag.x - 9, tag.y)
          ctx.fillText(label, tag.x - 9, tag.y)
        }
      }

      // front and back edges of the lowest key, with ticks — this is the pair
      // that tells you whether the key *depth* is right, not just the width
      const edges: { w: number; label: string; dash: number[] }[] = [
        { w: 0, label: 'FRONT of keys', dash: [] },
        { w: 1, label: 'BACK of keys', dash: [6, 4] },
      ]
      for (const edge of edges) {
        const left = kb(0, edge.w)
        const right = kb(1, edge.w)
        if (!finitePoint(left) || !finitePoint(right)) continue
        ctx.save()
        ctx.setLineDash(edge.dash)
        ctx.strokeStyle = 'rgba(251, 191, 36, 0.95)'
        ctx.lineWidth = 2.5
        ctx.beginPath()
        ctx.moveTo(left.x, left.y)
        ctx.lineTo(right.x, right.y)
        ctx.stroke()
        ctx.restore()

        // tick across the lowest key's edge
        const tickA = kb(lowest.u0, edge.w)
        const tickB = kb(lowest.u1, edge.w)
        if (finitePoint(tickA) && finitePoint(tickB)) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)'
          ctx.lineWidth = 3
          ctx.beginPath()
          ctx.moveTo(tickA.x, tickA.y)
          ctx.lineTo(tickB.x, tickB.y)
          ctx.stroke()
        }
        ctx.font = 'bold 10px ui-sans-serif, system-ui, sans-serif'
        ctx.fillStyle = 'rgba(251, 191, 36, 0.95)'
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)'
        ctx.lineWidth = 3
        const at = kb(0, edge.w)
        ctx.strokeText(edge.label, at.x + 4, at.y - 4)
        ctx.fillText(edge.label, at.x + 4, at.y - 4)
      }
    }

    // keyboard outline + C labels
    quadPath(ctx, corners)
    ctx.strokeStyle = solid ? 'rgba(251, 191, 36, 1)' : `rgba(251, 191, 36, ${0.9 * a})`
    ctx.lineWidth = solid ? 3 : 2
    ctx.stroke()

    // crosshair through the corner being moved, to judge it against the frame
    if (solid && activeCorner !== null && corners[activeCorner]) {
      const c = corners[activeCorner]
      ctx.save()
      ctx.setLineDash([4, 4])
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(frame.x, c.y)
      ctx.lineTo(frame.x + frame.w, c.y)
      ctx.moveTo(c.x, frame.y)
      ctx.lineTo(c.x, frame.y + frame.h)
      ctx.stroke()
      ctx.restore()
    }

    // where the corners started, so a working track visibly separates from it
    if (ghost) {
      const ghostPx = ghost.map((c) => ({
        x: frame.x + (frame.w * c.x) / 100,
        y: frame.y + (frame.h * c.y) / 100,
      }))
      ctx.save()
      ctx.setLineDash([3, 5])
      ctx.strokeStyle = 'rgba(160, 160, 170, 0.75)'
      ctx.lineWidth = 1
      quadPath(ctx, ghostPx)
      ctx.stroke()
      ctx.restore()
    }

    ctx.font = solid
      ? 'bold 11px ui-sans-serif, system-ui, sans-serif'
      : '10px ui-sans-serif, system-ui, sans-serif'
    for (const k of spans) {
      if (k.black || k.midi % 12 !== 0) continue
      const label = kb((k.u0 + k.u1) / 2, 0.12)
      if (!finitePoint(label)) continue
      ctx.fillStyle = solid ? 'rgba(120, 60, 0, 0.95)' : `rgba(251, 191, 36, ${0.95 * a})`
      ctx.fillText(midiToName(k.midi), label.x - 8, label.y)
    }

    ctx.globalAlpha = previousAlpha
  }

  ctx.globalAlpha = 1
}

/* ------------------------------------------------------------------ component */

interface PianoRollOverlayProps {
  videoRef: React.RefObject<HTMLVideoElement | null>
  notes: MidiNote[]
  settings: OverlaySettings
  /** tracked keyboard motion; when present and enabled it overrides the fixed corners */
  track?: TrackSample[] | null
  /** draw the keys near-solid so corners can be placed accurately */
  calibrating?: boolean
  /** corner currently being moved — gets a crosshair */
  activeCorner?: number | null
  /** the keyboard quad in force (from corners or solved from key anchors) */
  corners?: Point[]
  /** keys referenced by anchors, highlighted while calibrating */
  anchoredKeys?: number[]
}

export function PianoRollOverlay({
  videoRef,
  notes,
  settings,
  track,
  calibrating = false,
  activeCorner = null,
  corners,
  anchoredKeys,
}: PianoRollOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // the animation loop reads notes/settings through refs so it never restarts
  const notesRef = useRef(notes)
  const settingsRef = useRef(settings)
  const trackRef = useRef(track)
  const calibratingRef = useRef(calibrating)
  const activeCornerRef = useRef(activeCorner)
  const cornersRef = useRef(corners)
  const anchoredRef = useRef(anchoredKeys)

  useEffect(() => {
    notesRef.current = notes
    settingsRef.current = settings
    trackRef.current = track
    calibratingRef.current = calibrating
    activeCornerRef.current = activeCorner
    cornersRef.current = corners
    anchoredRef.current = anchoredKeys
  }, [notes, settings, track, calibrating, activeCorner, corners, anchoredKeys])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let raf = 0
    let cssWidth = 0
    let cssHeight = 0
    let spans: KeySpan[] = []
    let spanKey = ''

    const resize = () => {
      const parent = canvas.parentElement
      if (!parent) return
      const dpr = window.devicePixelRatio || 1
      cssWidth = parent.clientWidth
      cssHeight = parent.clientHeight
      canvas.width = Math.max(1, Math.round(cssWidth * dpr))
      canvas.height = Math.max(1, Math.round(cssHeight * dpr))
    }

    const observer = new ResizeObserver(resize)
    if (canvas.parentElement) observer.observe(canvas.parentElement)
    resize()

    const draw = () => {
      raf = requestAnimationFrame(draw)
      const video = videoRef.current
      const s = settingsRef.current
      const dpr = window.devicePixelRatio || 1

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, cssWidth, cssHeight)
      if (!video) return

      const key = `${s.lowNote}:${s.highNote}`
      if (key !== spanKey) {
        spans = buildKeySpans(s.lowNote, s.highNote)
        spanKey = key
      }
      if (spans.length === 0) return

      const frame = contentRect(cssWidth, cssHeight, video.videoWidth, video.videoHeight)
      const t = video.currentTime + s.midiOffset

      if (s.mode === 'perspective') {
        // the track is indexed by video time, not by the MIDI-shifted time
        const stored = trackRef.current
        const base = cornersRef.current ?? s.corners
        const following = s.useTrack && !!stored && stored.length > 0
        const calibrating = calibratingRef.current
        const tracked = following ? cornersAt(stored, video.currentTime, base) : null

        // While calibrating, draw what the CALIBRATION says, never what the track
        // says — otherwise moving a corner or anchor changes nothing on screen and
        // you are placing handles blind. The track's own idea of the keyboard
        // becomes the ghost, so you can see how far off it had drifted.
        const quad = calibrating ? base : (tracked ?? base)
        const ghost = calibrating ? tracked : following ? base : null

        drawPerspective(ctx, frame, s, spans, notesRef.current, t, quad, {
          calibrating,
          activeCorner: activeCornerRef.current,
          ghost,
          anchoredKeys: anchoredRef.current ?? null,
        })
      } else {
        ctx.globalAlpha = s.opacity
        drawFlat(ctx, frame, s, spans, notesRef.current, t)
        ctx.globalAlpha = 1
      }
    }

    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [videoRef])

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
}

export type { Homography }
