import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react'
import type { MidiNote } from '../lib/midi'
import { noteColor, withAlpha, type OverlaySettings } from '../lib/overlay'
import type { WaveformData } from '../lib/waveform'

/**
 * DAW-style alignment timeline. Everything is drawn in *video time*, so the
 * camera waveform stays put, the recorded take slides with `audioOffset`, and
 * the MIDI onsets slide with `midiOffset` — line the three up and you're synced.
 */

const RULER_HEIGHT = 18
const LANE_GAP = 4
const MIDI_LANE_HEIGHT = 26
const WAVE_LANE_HEIGHT = 46

const TICK_STEPS = [0.01, 0.02, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120]

function pickTickStep(viewDuration: number) {
  for (const step of TICK_STEPS) if (viewDuration / step <= 12) return step
  return TICK_STEPS[TICK_STEPS.length - 1]
}

function formatTick(seconds: number, step: number) {
  if (step < 1) return `${seconds.toFixed(step < 0.1 ? 2 : 1)}s`
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds - m * 60)
  return `${m}:${s < 10 ? '0' : ''}${s}`
}

export interface WaveformTimelineProps {
  videoRef: React.RefObject<HTMLVideoElement | null>
  duration: number
  /** the separate recording — moves with settings.audioOffset */
  recorded: WaveformData | null
  /** the video's own audio — fixed to video time, the reference for what you see */
  camera: WaveformData | null
  notes: MidiNote[]
  settings: OverlaySettings
  /** seconds visible across the full width */
  viewDuration: number
  onSeek: (time: number) => void
  height: number
}

export function WaveformTimeline(props: WaveformTimelineProps) {
  const { videoRef, height } = props
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const propsRef = useRef(props)
  const viewStartRef = useRef(0)
  const viewDurationRef = useRef(props.viewDuration)

  useEffect(() => {
    propsRef.current = props
  }, [props])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const cache = document.createElement('canvas')
    const cacheCtx = cache.getContext('2d')
    if (!cacheCtx) return

    let raf = 0
    let cssWidth = 0
    let cacheKey = ''

    const resize = () => {
      const parent = canvas.parentElement
      if (!parent) return
      const dpr = window.devicePixelRatio || 1
      cssWidth = parent.clientWidth
      canvas.width = Math.max(1, Math.round(cssWidth * dpr))
      canvas.height = Math.max(1, Math.round(height * dpr))
      cache.width = canvas.width
      cache.height = canvas.height
      cacheKey = ''
    }

    const observer = new ResizeObserver(resize)
    if (canvas.parentElement) observer.observe(canvas.parentElement)
    resize()

    /** min/max envelope for one waveform, sampled per screen column */
    const drawWave = (
      target: CanvasRenderingContext2D,
      wf: WaveformData,
      offset: number,
      top: number,
      laneHeight: number,
      color: string,
      viewStart: number,
      viewDuration: number
    ) => {
      const mid = top + laneHeight / 2
      const half = laneHeight / 2 - 1
      const secondsPerPixel = viewDuration / cssWidth

      target.strokeStyle = 'rgba(255, 255, 255, 0.10)'
      target.lineWidth = 1
      target.beginPath()
      target.moveTo(0, Math.round(mid) + 0.5)
      target.lineTo(cssWidth, Math.round(mid) + 0.5)
      target.stroke()

      target.strokeStyle = color
      target.lineWidth = 1
      target.beginPath()
      for (let x = 0; x < cssWidth; x++) {
        // this column covers [t0, t1) of video time -> the matching audio window
        const t0 = viewStart + x * secondsPerPixel + offset
        const t1 = t0 + secondsPerPixel
        let from = Math.floor(t0 * wf.bucketsPerSecond)
        let to = Math.floor(t1 * wf.bucketsPerSecond)
        if (to < 0 || from >= wf.bucketCount) continue
        from = Math.max(0, from)
        to = Math.min(wf.bucketCount - 1, Math.max(from, to))

        let min = 0
        let max = 0
        for (let b = from; b <= to; b++) {
          const lo = wf.peaks[b * 2]
          const hi = wf.peaks[b * 2 + 1]
          if (lo < min) min = lo
          if (hi > max) max = hi
        }
        const yTop = mid - max * half
        const yBottom = mid - min * half
        target.moveTo(x + 0.5, yTop)
        target.lineTo(x + 0.5, Math.max(yBottom, yTop + 0.75))
      }
      target.stroke()
    }

    const drawOnsetMarker = (
      target: CanvasRenderingContext2D,
      videoTime: number,
      top: number,
      laneHeight: number,
      label: string,
      viewStart: number,
      viewDuration: number
    ) => {
      const x = ((videoTime - viewStart) / viewDuration) * cssWidth
      if (x < -40 || x > cssWidth + 40) return
      target.save()
      target.strokeStyle = 'rgba(251, 191, 36, 0.9)'
      target.lineWidth = 1
      target.setLineDash([3, 3])
      target.beginPath()
      target.moveTo(x + 0.5, top)
      target.lineTo(x + 0.5, top + laneHeight)
      target.stroke()
      target.setLineDash([])
      target.fillStyle = 'rgba(251, 191, 36, 0.95)'
      target.font = '9px ui-sans-serif, system-ui, sans-serif'
      target.fillText(label, Math.min(x + 3, cssWidth - 60), top + 9)
      target.restore()
    }

    const drawStatic = (p: WaveformTimelineProps, viewStart: number, viewDuration: number) => {
      const dpr = window.devicePixelRatio || 1
      cacheCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
      cacheCtx.clearRect(0, 0, cssWidth, height)

      const timeToX = (t: number) => ((t - viewStart) / viewDuration) * cssWidth

      // ---- ruler ----
      const step = pickTickStep(viewDuration)
      cacheCtx.font = '9px ui-sans-serif, system-ui, sans-serif'
      cacheCtx.fillStyle = 'rgba(161, 161, 170, 0.9)'
      cacheCtx.strokeStyle = 'rgba(255, 255, 255, 0.10)'
      cacheCtx.lineWidth = 1
      const firstTick = Math.ceil(viewStart / step) * step
      for (let t = firstTick; t <= viewStart + viewDuration; t += step) {
        const x = Math.round(timeToX(t)) + 0.5
        cacheCtx.beginPath()
        cacheCtx.moveTo(x, 0)
        cacheCtx.lineTo(x, height)
        cacheCtx.stroke()
        cacheCtx.fillText(formatTick(t, step), x + 3, 10)
      }

      let top = RULER_HEIGHT

      // ---- camera audio (fixed to video time) ----
      if (p.camera) {
        cacheCtx.fillStyle = 'rgba(113, 113, 122, 0.9)'
        cacheCtx.fillText('CAMERA', 4, top + 9)
        drawWave(
          cacheCtx,
          p.camera,
          0,
          top,
          WAVE_LANE_HEIGHT,
          'rgba(161, 161, 170, 0.85)',
          viewStart,
          viewDuration
        )
        if (p.camera.onset !== null) {
          drawOnsetMarker(
            cacheCtx,
            p.camera.onset,
            top,
            WAVE_LANE_HEIGHT,
            'first sound',
            viewStart,
            viewDuration
          )
        }
        top += WAVE_LANE_HEIGHT + LANE_GAP
      }

      // ---- MIDI onsets (slide with midiOffset) ----
      const midiTop = top
      cacheCtx.fillStyle = 'rgba(113, 113, 122, 0.9)'
      cacheCtx.fillText('MIDI', 4, midiTop + 9)
      cacheCtx.fillStyle = 'rgba(255, 255, 255, 0.04)'
      cacheCtx.fillRect(0, midiTop, cssWidth, MIDI_LANE_HEIGHT)
      const hidden = new Set(p.settings.hiddenTracks)
      for (const n of p.notes) {
        const videoTime = n.time - p.settings.midiOffset
        if (videoTime < viewStart - 1) continue
        if (videoTime > viewStart + viewDuration + 1) break
        if (hidden.has(n.track)) continue
        const x = timeToX(videoTime)
        const tickHeight = 6 + (MIDI_LANE_HEIGHT - 10) * n.velocity
        cacheCtx.fillStyle = withAlpha(noteColor(n, p.settings), 0.9)
        cacheCtx.fillRect(x, midiTop + MIDI_LANE_HEIGHT - tickHeight - 2, 1.5, tickHeight)
      }
      // the first note gets a labelled marker — it's the anchor you align to
      if (p.notes.length > 0) {
        drawOnsetMarker(
          cacheCtx,
          p.notes[0].time - p.settings.midiOffset,
          midiTop,
          MIDI_LANE_HEIGHT,
          'first note',
          viewStart,
          viewDuration
        )
      }
      top += MIDI_LANE_HEIGHT + LANE_GAP

      // ---- recorded audio (slides with audioOffset) ----
      if (p.recorded) {
        cacheCtx.fillStyle = 'rgba(113, 113, 122, 0.9)'
        cacheCtx.fillText('RECORDED', 4, top + 9)
        drawWave(
          cacheCtx,
          p.recorded,
          p.settings.audioOffset,
          top,
          WAVE_LANE_HEIGHT,
          'rgba(56, 189, 248, 0.9)',
          viewStart,
          viewDuration
        )
        if (p.recorded.onset !== null) {
          drawOnsetMarker(
            cacheCtx,
            p.recorded.onset - p.settings.audioOffset,
            top,
            WAVE_LANE_HEIGHT,
            'first sound',
            viewStart,
            viewDuration
          )
        }
      }
    }

    const draw = () => {
      raf = requestAnimationFrame(draw)
      const p = propsRef.current
      const video = videoRef.current
      const dpr = window.devicePixelRatio || 1
      const total = p.duration || 0
      const playhead = video?.currentTime ?? 0

      const viewDuration = Math.max(0.05, Math.min(p.viewDuration, total || p.viewDuration))
      viewDurationRef.current = viewDuration

      // page the view when the playhead runs off the edge, rather than scrolling every frame
      let viewStart = viewStartRef.current
      const maxStart = Math.max(0, total - viewDuration)
      if (viewDuration >= total) {
        viewStart = 0
      } else if (playhead < viewStart + viewDuration * 0.05 || playhead > viewStart + viewDuration * 0.9) {
        viewStart = playhead - viewDuration * 0.35
      }
      viewStart = Math.max(0, Math.min(viewStart, maxStart))
      viewStartRef.current = viewStart

      const key = [
        cssWidth,
        height,
        dpr,
        viewStart.toFixed(4),
        viewDuration.toFixed(4),
        p.settings.audioOffset,
        p.settings.midiOffset,
        p.settings.colorMode,
        p.settings.splitNote,
        p.settings.rightColor,
        p.settings.leftColor,
        p.settings.hiddenTracks.join(','),
        p.notes.length,
        p.recorded ? p.recorded.bucketCount : 0,
        p.camera ? p.camera.bucketCount : 0,
      ].join('|')

      if (key !== cacheKey) {
        drawStatic(p, viewStart, viewDuration)
        cacheKey = key
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(cache, 0, 0)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // playhead
      const x = ((playhead - viewStart) / viewDuration) * cssWidth
      if (x >= 0 && x <= cssWidth) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(Math.round(x) + 0.5, 0)
        ctx.lineTo(Math.round(x) + 0.5, height)
        ctx.stroke()
        ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
        ctx.beginPath()
        ctx.moveTo(x - 4, 0)
        ctx.lineTo(x + 4, 0)
        ctx.lineTo(x, 5)
        ctx.closePath()
        ctx.fill()
      }
    }

    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [videoRef, height])

  const seekFromEvent = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = (e.clientX - rect.left) / rect.width
    propsRef.current.onSeek(viewStartRef.current + ratio * viewDurationRef.current)
  }

  return (
    <canvas
      ref={canvasRef}
      style={{ height }}
      className="w-full block cursor-col-resize touch-none"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        seekFromEvent(e)
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) seekFromEvent(e)
      }}
      onPointerUp={(e) => e.currentTarget.releasePointerCapture(e.pointerId)}
    />
  )
}
