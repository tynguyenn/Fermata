import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type ReactNode,
} from 'react'
import {
  AudioLines,
  Check,
  ChevronsLeft,
  ChevronsRight,
  Crosshair,
  Film,
  Activity,
  Music4,
  Pause,
  Play,
  RotateCcw,
  Eye,
  EyeOff,
  Maximize,
  Minimize,
  Sliders,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import { db } from '../lib/db'
import {
  extractMidiFromAppleLoop,
  isBlackKey,
  midiToName,
  parseMidi,
  type MidiData,
} from '../lib/midi'
import { PianoRollOverlay } from '../components/PianoRollOverlay'
import { WaveformTimeline } from '../components/WaveformTimeline'
import {
  ANCHOR_DEPTH_LABELS,
  anchorKeyboardPoint,
  buildKeySpans,
  contentRect,
  cornersFromAnchors,
  DEFAULT_SETTINGS,
  effectiveCorners,
  KEYBOARD_PRESETS,
  type KeyAnchor,
  type OverlaySettings,
} from '../lib/overlay'
import { analyzeAudio, type WaveformData } from '../lib/waveform'
import { cornersAt, type TrackSample } from '../lib/tracking'
import { applyHomography, homographyFromCorners } from '../lib/homography'
import { runTrackingPass, spliceTrack } from '../lib/videoTrack'

const PROJECT_ID = 'default'
const CORNER_LABELS = ['Front left', 'Front right', 'Back right', 'Back left']
const FRAME = 1 / 30

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) return '0:00.00'
  const m = Math.floor(seconds / 60)
  const s = seconds - m * 60
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(2)}`
}

function formatSize(bytes: number) {
  if (bytes > 1e9) return `${(bytes / 1e9).toFixed(2)} GB`
  if (bytes > 1e6) return `${(bytes / 1e6).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`
}

/* ---------------------------------------------------------------- upload UI */

interface FileSlotProps {
  icon: ReactNode
  label: string
  hint: string
  accept: string
  fileName?: string
  size?: number
  needsReattach?: boolean
  onFile: (file: File) => void
  onClear: () => void
}

function FileSlot({
  icon,
  label,
  hint,
  accept,
  fileName,
  size,
  needsReattach,
  onFile,
  onClear,
}: FileSlotProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) onFile(f)
  }

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) onFile(f)
    e.target.value = ''
  }

  const filled = !!fileName && !needsReattach

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`relative rounded-xl border p-5 transition-colors ${
        dragging
          ? 'border-sky-500 bg-sky-500/10'
          : filled
            ? 'border-zinc-700 bg-zinc-900'
            : 'border-dashed border-zinc-700 bg-zinc-900/50 hover:border-zinc-600'
      }`}
    >
      <input ref={inputRef} type="file" accept={accept} onChange={handleChange} className="hidden" />

      <div className="flex items-start gap-3">
        <div
          className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
            filled ? 'bg-sky-500/15 text-sky-400' : 'bg-zinc-800 text-zinc-400'
          }`}
        >
          {filled ? <Check size={20} /> : icon}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-medium text-white">{label}</h3>
          {fileName ? (
            <>
              <p className="text-sm text-zinc-400 truncate" title={fileName}>
                {fileName}
                {size ? <span className="text-zinc-600"> · {formatSize(size)}</span> : null}
              </p>
              {needsReattach && (
                <p className="text-xs text-amber-400 mt-1">
                  Not stored in the browser — pick this file again to continue
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-zinc-500">{hint}</p>
          )}
        </div>
        {fileName && (
          <button
            onClick={onClear}
            className="p-1.5 rounded-md text-zinc-500 hover:text-white hover:bg-zinc-800"
            title="Remove"
          >
            <X size={16} />
          </button>
        )}
      </div>

      <button
        onClick={() => inputRef.current?.click()}
        className="mt-4 w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-zinc-800 text-sm text-zinc-200 hover:bg-zinc-700 transition-colors"
      >
        <Upload size={15} />
        {fileName ? 'Replace file' : 'Choose file'}
      </button>
    </div>
  )
}

/* -------------------------------------------------------------- control bits */

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-b border-zinc-800 pb-4 mb-4 last:border-0">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">{title}</h4>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

interface SliderRowProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  format?: (v: number) => string
}

function SliderRow({ label, value, min, max, step, onChange, format }: SliderRowProps) {
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="text-zinc-400">{label}</span>
        <span className="text-zinc-200 tabular-nums">{format ? format(value) : value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-sky-500"
      />
    </div>
  )
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between text-sm cursor-pointer">
      <span className="text-zinc-400">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-sky-500 w-4 h-4"
      />
    </label>
  )
}

/* ------------------------------------------------------------------- route */

export function Creation() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)

  const videoBlobRef = useRef<Blob | null>(null)
  const audioBlobRef = useRef<Blob | null>(null)
  const midiBufferRef = useRef<ArrayBuffer | null>(null)
  const videoUrlRef = useRef<string | null>(null)
  const audioUrlRef = useRef<string | null>(null)

  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [videoName, setVideoName] = useState('')
  const [audioName, setAudioName] = useState('')
  const [midiName, setMidiName] = useState('')
  const [videoSize, setVideoSize] = useState(0)
  const [audioSize, setAudioSize] = useState(0)
  const [midiSize, setMidiSize] = useState(0)
  const [midiData, setMidiData] = useState<MidiData | null>(null)

  const [settings, setSettings] = useState<OverlaySettings>(DEFAULT_SETTINGS)
  const [keepMedia, setKeepMedia] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [duration, setDuration] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [rate, setRate] = useState(1)
  const [showPanel, setShowPanel] = useState(true)
  const [showUploads, setShowUploads] = useState(true)
  const [hideMidi, setHideMidi] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)

  const stageRef = useRef<HTMLDivElement>(null)
  const draggingCornerRef = useRef<number | null>(null)
  const [stageSize, setStageSize] = useState({ w: 0, h: 0 })
  const [videoDims, setVideoDims] = useState({ w: 0, h: 0 })
  const [calibrating, setCalibrating] = useState(false)
  const [activeCorner, setActiveCorner] = useState<number | null>(null)

  const [track, setTrack] = useState<TrackSample[] | null>(null)
  const [tracking, setTracking] = useState(false)
  const [trackProgress, setTrackProgress] = useState(0)
  const [trackStats, setTrackStats] = useState<string | null>(null)
  const trackCancelRef = useRef<{ cancelled: boolean } | null>(null)

  const [recordedWave, setRecordedWave] = useState<WaveformData | null>(null)
  const [cameraWave, setCameraWave] = useState<WaveformData | null>(null)
  const [analyzing, setAnalyzing] = useState<'recorded' | 'camera' | null>(null)
  const [viewDuration, setViewDuration] = useState(30)

  const set = useCallback(
    <K extends keyof OverlaySettings>(key: K, value: OverlaySettings[K]) =>
      setSettings((prev) => ({ ...prev, [key]: value })),
    []
  )

  /* ---- load saved project ---- */
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const row = await db.creations.get(PROJECT_ID)
        if (row && !cancelled) {
          setSettings({ ...DEFAULT_SETTINGS, ...(row.settings as Partial<OverlaySettings>) })
          setKeepMedia(row.keepMedia)
          setVideoName(row.videoName ?? '')
          setAudioName(row.audioName ?? '')
          setMidiName(row.midiName ?? '')
          if (Array.isArray(row.track) && row.track.length > 0) {
            setTrack(row.track as TrackSample[])
          }
          if (row.midiFile) {
            midiBufferRef.current = row.midiFile
            setMidiSize(row.midiFile.byteLength)
            try {
              setMidiData(parseMidi(row.midiFile))
            } catch {
              setMidiName('')
            }
          }
          if (row.video) {
            videoBlobRef.current = row.video
            setVideoSize(row.video.size)
            videoUrlRef.current = URL.createObjectURL(row.video)
            setVideoUrl(videoUrlRef.current)
            setShowUploads(false)
          }
          if (row.audio) {
            audioBlobRef.current = row.audio
            setAudioSize(row.audio.size)
            audioUrlRef.current = URL.createObjectURL(row.audio)
            setAudioUrl(audioUrlRef.current)
          }
        }
      } catch (e) {
        console.error('Failed to load creation project', e)
      } finally {
        if (!cancelled) setLoaded(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  /* ---- revoke object URLs on unmount ---- */
  useEffect(
    () => () => {
      if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current)
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current)
    },
    []
  )

  /* ---- autosave (debounced) ---- */
  useEffect(() => {
    if (!loaded) return
    const handle = setTimeout(() => {
      void (async () => {
        try {
          const existing = await db.creations.get(PROJECT_ID)
          await db.creations.put({
            id: PROJECT_ID,
            title: 'Untitled creation',
            videoName: videoName || undefined,
            audioName: audioName || undefined,
            midiName: midiName || undefined,
            midiFile: midiBufferRef.current ?? undefined,
            video: keepMedia ? (videoBlobRef.current ?? undefined) : undefined,
            audio: keepMedia ? (audioBlobRef.current ?? undefined) : undefined,
            keepMedia,
            track: track ?? undefined,
            settings,
            createdAt: existing?.createdAt ?? new Date(),
            updatedAt: new Date(),
          })
        } catch (e) {
          console.error('Failed to save creation project', e)
          setKeepMedia(false)
          setError(
            'Could not store the media in the browser (likely too large). Settings are still saved — re-pick the files after a reload.'
          )
        }
      })()
    }, 700)
    return () => clearTimeout(handle)
  }, [loaded, settings, keepMedia, videoName, audioName, midiName, track])

  /* ---- file handlers ---- */
  const handleVideo = (file: File) => {
    if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current)
    videoBlobRef.current = file
    videoUrlRef.current = URL.createObjectURL(file)
    setVideoUrl(videoUrlRef.current)
    setVideoName(file.name)
    setVideoSize(file.size)
    setError(null)
  }

  const handleAudio = (file: File) => {
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current)
    audioBlobRef.current = file
    audioUrlRef.current = URL.createObjectURL(file)
    setAudioUrl(audioUrlRef.current)
    setAudioName(file.name)
    setAudioSize(file.size)
    setError(null)
  }

  const handleMidi = async (file: File) => {
    try {
      let buffer: ArrayBuffer
      if (/\.(aif|aiff|aifc)$/i.test(file.name)) {
        // GarageBand Apple Loop — the MIDI rides along inside the AIFF
        const extracted = await extractMidiFromAppleLoop(file)
        if (!extracted) {
          throw new Error(
            'No MIDI inside that AIFF. In GarageBand, drag the green software-instrument region into the loop browser (an audio region makes an audio-only loop).'
          )
        }
        buffer = extracted
      } else {
        buffer = await file.arrayBuffer()
      }
      const data = parseMidi(buffer)
      if (data.notes.length === 0) throw new Error('No notes found in this MIDI file')
      midiBufferRef.current = buffer
      setMidiData(data)
      setMidiName(file.name)
      setMidiSize(file.size)
      setError(null)

      // fit the key range to the recording, snapped outward to octaves
      let low = 127
      let high = 0
      for (const n of data.notes) {
        low = Math.min(low, n.midi)
        high = Math.max(high, n.midi)
      }
      setSettings((prev) => ({
        ...prev,
        lowNote: Math.max(0, low - 2),
        highNote: Math.min(127, high + 2),
        colorMode: data.tracks.length >= 2 ? 'track' : 'pitch',
        hiddenTracks: [],
      }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that MIDI file')
    }
  }

  const clearVideo = () => {
    if (videoUrlRef.current) URL.revokeObjectURL(videoUrlRef.current)
    videoUrlRef.current = null
    videoBlobRef.current = null
    setVideoUrl(null)
    setVideoName('')
    setVideoSize(0)
    setCameraWave(null)
    setTrack(null)
    setTrackStats(null)
    setShowUploads(true)
  }

  const clearAudio = () => {
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current)
    audioUrlRef.current = null
    audioBlobRef.current = null
    setAudioUrl(null)
    setAudioName('')
    setAudioSize(0)
    setRecordedWave(null)
  }

  const clearMidi = () => {
    midiBufferRef.current = null
    setMidiData(null)
    setMidiName('')
    setMidiSize(0)
  }

  /* ---- where the video image sits, so corners can be placed on it ---- */
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const update = () => setStageSize({ w: el.clientWidth, h: el.clientHeight })
    const observer = new ResizeObserver(update)
    observer.observe(el)
    update()
    return () => observer.disconnect()
    // remeasure when the stage mounts, which is gated on having both files
  }, [videoUrl, midiData])

  const frame = useMemo(
    () => contentRect(stageSize.w, stageSize.h, videoDims.w, videoDims.h),
    [stageSize, videoDims]
  )

  const spans = useMemo(
    () => buildKeySpans(settings.lowNote, settings.highNote),
    [settings.lowNote, settings.highNote]
  )
  /** the quad in force: dragged corners, or solved from the key anchors */
  const baseCorners = useMemo(() => effectiveCorners(settings, spans), [settings, spans])
  const anchorsSolvable = useMemo(
    () =>
      settings.calibrationMode !== 'anchors' ||
      cornersFromAnchors(settings.anchors, spans, settings.blackKeyDepth) !== null,
    [settings.calibrationMode, settings.anchors, settings.blackKeyDepth, spans]
  )
  const planePoints = useMemo(
    () =>
      settings.calibrationMode === 'anchors'
        ? settings.anchors
            .map((a) => anchorKeyboardPoint(a, spans, settings.blackKeyDepth))
            .filter((p): p is { u: number; w: number } => p !== null)
        : [],
    [settings.calibrationMode, settings.anchors, settings.blackKeyDepth, spans]
  )

  const anchoredKeys = useMemo(
    () =>
      settings.calibrationMode === 'anchors'
        ? [...new Set(settings.anchors.map((a) => a.midi))]
        : [],
    [settings.calibrationMode, settings.anchors]
  )

  /** the frame the user is looking at — calibration is only valid for this one */
  const stampFrame = useCallback(() => videoRef.current?.currentTime ?? 0, [])

  /** pointer position as a % of the video frame */
  const pointerToPercent = useCallback(
    (clientX: number, clientY: number) => {
      const el = stageRef.current
      if (!el || frame.w <= 0 || frame.h <= 0) return null
      const rect = el.getBoundingClientRect()
      return {
        x: ((clientX - rect.left - frame.x) / frame.w) * 100,
        y: ((clientY - rect.top - frame.y) / frame.h) * 100,
      }
    },
    [frame]
  )

  const moveAnchor = useCallback(
    (index: number, clientX: number, clientY: number) => {
      const point = pointerToPercent(clientX, clientY)
      if (!point) return
      setSettings((prev) => ({
        ...prev,
        calibratedAt: stampFrame(),
        anchors: prev.anchors.map((a, i) =>
          i === index
            ? { ...a, x: Math.max(-25, Math.min(125, point.x)), y: Math.max(-25, Math.min(125, point.y)) }
            : a
        ),
      }))
    },
    [pointerToPercent, stampFrame]
  )

  const updateAnchor = useCallback(
    (index: number, patch: Partial<KeyAnchor>) => {
      setSettings((prev) => ({
        ...prev,
        calibratedAt: stampFrame(),
        anchors: prev.anchors.map((a, i) => (i === index ? { ...a, ...patch } : a)),
      }))
    },
    [stampFrame]
  )

  const moveCorner = useCallback(
    (index: number, x: number, y: number) =>
      setSettings((prev) => {
        const corners = prev.corners.map((c, i) =>
          i === index
            ? { x: Math.max(-25, Math.min(125, x)), y: Math.max(-25, Math.min(125, y)) }
            : c
        )
        return { ...prev, corners, calibratedAt: stampFrame() }
      }),
    [stampFrame]
  )

  const moveCornerTo = useCallback(
    (index: number, clientX: number, clientY: number) => {
      const point = pointerToPercent(clientX, clientY)
      if (point) moveCorner(index, point.x, point.y)
    },
    [pointerToPercent, moveCorner]
  )

  const nudgeCorner = useCallback(
    (index: number, dx: number, dy: number) =>
      setSettings((prev) => {
        const corner = prev.corners[index]
        const corners = prev.corners.map((c, i) =>
          i === index
            ? { x: +(c.x + dx).toFixed(3), y: +(c.y + dy).toFixed(3) }
            : c
        )
        return corner ? { ...prev, corners, calibratedAt: stampFrame() } : prev
      }),
    [stampFrame]
  )

  /**
   * Move the calibration to the frame on screen now, starting from wherever the
   * track currently thinks the keyboard is. You are then correcting a near-miss
   * rather than placing everything from scratch, and the tracking pass that follows
   * keeps every frame before this one.
   */
  const realignHere = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    const now = video.currentTime
    const quadNow =
      settings.useTrack && track && track.length > 0
        ? cornersAt(track, now, baseCorners)
        : baseCorners

    const h = homographyFromCorners(quadNow)
    setSettings((prev) => ({
      ...prev,
      calibratedAt: now,
      corners: quadNow,
      showKeyGuide: true,
      anchors: prev.anchors.map((anchor) => {
        const uw = anchorKeyboardPoint(anchor, spans, prev.blackKeyDepth)
        if (!uw || !h) return anchor
        const p = applyHomography(h, uw.u, uw.w)
        if (!(p.w > 1e-9) || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return anchor
        return { ...anchor, x: p.x, y: p.y }
      }),
    }))
    setCalibrating(true)
    setActiveCorner(0)
  }, [settings.useTrack, track, baseCorners, spans])

  /* ---- keyboard motion tracking ---- */
  const startTracking = async () => {
    const video = videoRef.current
    if (!video || tracking) return
    // calibration describes the plane at one instant, so the pass must start there
    const from = Math.max(0, Math.min(settings.calibratedAt, (video.duration || 0) - 0.25))
    const signal = { cancelled: false }
    trackCancelRef.current = signal
    setTracking(true)
    setTrackProgress(0)
    setTrackStats(null)

    try {
      const result = await runTrackingPass({
        video,
        corners: baseCorners,
        startTime: from,
        planePoints,
        onProgress: (progress) => setTrackProgress(progress.fraction),
        signal,
      })

      const merged = track ? spliceTrack(track, result.samples, from) : result.samples
      setTrack(merged)
      set('useTrack', true)

      const confidences = result.samples.map((sample) => sample.confidence).sort((a, b) => a - b)
      const median = confidences[Math.floor(confidences.length / 2)] ?? 0
      const weak = result.samples.filter((sample) => sample.confidence < 0.35).length

      // how far the keyboard actually moved: if this is ~0 while your head clearly
      // moved, the tracker held still rather than followed, and the numbers say so
      const start = result.samples[0].corners
      let travel = 0
      for (const sample of result.samples) {
        for (let i = 0; i < 4; i++) {
          travel = Math.max(
            travel,
            Math.hypot(sample.corners[i].x - start[i].x, sample.corners[i].y - start[i].y)
          )
        }
      }
      const travelPx = (travel / 100) * (videoRef.current?.videoWidth ?? 0)

      setTrackStats(
        `${result.samples.length} frames · moved ${travel.toFixed(1)}% of frame ` +
          `(~${Math.round(travelPx)}px) · ${Math.round(median * 100)}% median confidence · ` +
          `${result.reAnchors} re-anchors` +
          (weak > 0 ? ` · ${weak} weak` : '') +
          (result.heldFrames > 0 ? ` · ${result.heldFrames} held` : '')
      )
      if (result.samples.length < 5) {
        setError(
          'Tracking only captured a couple of frames — make sure the playhead is before the end of the take.'
        )
      } else if (travel < 0.3) {
        setError(
          'The tracker barely moved the keyboard (' +
            travel.toFixed(2) +
            '% of frame). If your head moves in this footage, tracking is not locking on — try widening the corners slightly so more of the piano body is inside them.'
        )
      }
    } catch (e) {
      setError(e instanceof Error ? `Tracking failed: ${e.message}` : 'Tracking failed')
    } finally {
      trackCancelRef.current = null
      setTracking(false)
    }
  }

  /* ---- waveform analysis ---- */

  // the separate recording is small enough to analyse the moment it lands
  useEffect(() => {
    const blob = audioBlobRef.current
    if (!audioUrl || !blob) {
      setRecordedWave(null)
      return
    }
    let cancelled = false
    setAnalyzing('recorded')
    void analyzeAudio(blob)
      .then((wave) => {
        if (!cancelled) setRecordedWave(wave)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not analyse that audio')
      })
      .finally(() => {
        if (!cancelled) setAnalyzing(null)
      })
    return () => {
      cancelled = true
    }
  }, [audioUrl])

  // the video's own track has to be decoded whole, so it stays opt-in
  const analyzeCameraAudio = async () => {
    const blob = videoBlobRef.current
    if (!blob) return
    setAnalyzing('camera')
    try {
      setCameraWave(await analyzeAudio(blob))
    } catch (e) {
      setError(
        e instanceof Error
          ? `Camera audio: ${e.message}`
          : 'Could not decode the audio inside that video'
      )
    } finally {
      setAnalyzing(null)
    }
  }

  /* ---- playback + audio sync ---- */
  const syncAudio = useCallback(
    (force = false) => {
      const video = videoRef.current
      const audio = audioRef.current
      if (!video || !audio || !audioUrl) return

      if (!settings.useRecordedAudio) {
        if (!audio.paused) audio.pause()
        return
      }
      const target = video.currentTime + settings.audioOffset
      if (target < 0 || (audio.duration && target > audio.duration)) {
        if (!audio.paused) audio.pause()
        return
      }
      audio.playbackRate = video.playbackRate
      if (force || Math.abs(audio.currentTime - target) > 0.08) audio.currentTime = target
      if (!video.paused && audio.paused) void audio.play().catch(() => {})
      if (video.paused && !audio.paused) audio.pause()
    },
    [audioUrl, settings.useRecordedAudio, settings.audioOffset]
  )

  // keep the recorded audio locked to the video while playing
  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => syncAudio(), 400)
    return () => clearInterval(id)
  }, [playing, syncAudio])

  useEffect(() => {
    syncAudio(true)
  }, [syncAudio])

  useEffect(() => {
    if (!playing) return
    const id = setInterval(() => {
      const video = videoRef.current
      if (video) setCurrentTime(video.currentTime)
    }, 100)
    return () => clearInterval(id)
  }, [playing])

  useEffect(() => {
    const video = videoRef.current
    if (video) video.playbackRate = rate
    const audio = audioRef.current
    if (audio) audio.playbackRate = rate
  }, [rate, videoUrl])

  useEffect(() => {
    const audio = audioRef.current
    if (audio) audio.volume = settings.audioVolume
    const video = videoRef.current
    if (video) video.volume = settings.videoVolume
  }, [settings.audioVolume, settings.videoVolume, videoUrl, audioUrl])

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === stageRef.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void stageRef.current?.requestFullscreen()
  }, [])

  const togglePlay = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      syncAudio(true)
      void video.play().catch(() => {})
    } else {
      video.pause()
    }
  }, [syncAudio])

  const seekTo = useCallback(
    (time: number) => {
      const video = videoRef.current
      if (!video) return
      video.currentTime = Math.max(0, Math.min(time, video.duration || time))
      setCurrentTime(video.currentTime)
      syncAudio(true)
    },
    [syncAudio]
  )

  const nudgeSeek = useCallback(
    (delta: number) => {
      const video = videoRef.current
      if (video) seekTo(video.currentTime + delta)
    },
    [seekTo]
  )

  /* ---- keyboard shortcuts ---- */
  useEffect(() => {
    if (!videoUrl) return
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return

      // while calibrating, the arrows drive the selected corner instead of seeking
      if (calibrating && activeCorner !== null && e.key.startsWith('Arrow')) {
        e.preventDefault()
        const step = e.shiftKey ? 0.05 : 0.25
        const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0
        const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0
        if (settings.calibrationMode === 'anchors') {
          const anchor = settings.anchors[activeCorner]
          if (anchor) {
            updateAnchor(activeCorner, {
              x: +(anchor.x + dx).toFixed(3),
              y: +(anchor.y + dy).toFixed(3),
            })
          }
        } else {
          nudgeCorner(activeCorner, dx, dy)
        }
        return
      }

      if (e.key === ' ') {
        e.preventDefault()
        togglePlay()
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        nudgeSeek(e.shiftKey ? -FRAME : -1)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        nudgeSeek(e.shiftKey ? FRAME : 1)
      } else if (e.key === 'f') {
        toggleFullscreen()
      } else if (e.key === '[') {
        setSettings((p) => ({ ...p, midiOffset: +(p.midiOffset - (e.shiftKey ? 0.005 : 0.05)).toFixed(3) }))
      } else if (e.key === ']') {
        setSettings((p) => ({ ...p, midiOffset: +(p.midiOffset + (e.shiftKey ? 0.005 : 0.05)).toFixed(3) }))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    videoUrl,
    togglePlay,
    toggleFullscreen,
    nudgeSeek,
    calibrating,
    activeCorner,
    nudgeCorner,
    updateAnchor,
    settings.calibrationMode,
    settings.anchors,
  ])

  /* ---- derived ---- */
  const notes = useMemo(() => midiData?.notes ?? [], [midiData])
  const firstNoteTime = notes.length ? notes[0].time : 0
  const videoMissing = !!videoName && !videoUrl
  const audioMissing = !!audioName && !audioUrl
  const midiMissing = !!midiName && !midiData
  const ready = !!videoUrl && notes.length > 0

  /* ---- what the track says at the playhead, for the diagnostics readout ---- */
  const trackAtPlayhead = useMemo(() => {
    if (!track || track.length === 0) return { confidence: 0, offset: 0 }
    const here = cornersAt(track, currentTime, settings.corners)
    let offset = 0
    for (let i = 0; i < 4; i++) {
      offset = Math.max(
        offset,
        Math.hypot(here[i].x - settings.corners[i].x, here[i].y - settings.corners[i].y)
      )
    }
    // nearest sample's confidence
    let nearest = track[0]
    for (const sample of track) {
      if (Math.abs(sample.time - currentTime) < Math.abs(nearest.time - currentTime)) nearest = sample
    }
    return { confidence: nearest.confidence, offset }
  }, [track, currentTime, settings.corners])

  /* ---- alignment helper: put the first MIDI note at the playhead ---- */
  const alignFirstNote = () => {
    const video = videoRef.current
    if (!video || !notes.length) return
    set('midiOffset', +(firstNoteTime - video.currentTime).toFixed(3))
  }

  const uploads = (
    <div className="grid gap-4 md:grid-cols-3">
      <FileSlot
        icon={<Film size={20} />}
        label="Video"
        hint="Your Meta glasses recording (mp4, mov, webm)"
        accept="video/*,.mp4,.mov,.webm,.mkv"
        fileName={videoName || undefined}
        size={videoSize}
        needsReattach={videoMissing}
        onFile={handleVideo}
        onClear={clearVideo}
      />
      <FileSlot
        icon={<Music4 size={20} />}
        label="MIDI"
        hint="A .mid file, or a GarageBand Apple Loop (.aif) — drives the roll"
        accept=".mid,.midi,.aif,.aiff,.aifc,audio/midi"
        fileName={midiName || undefined}
        size={midiSize}
        needsReattach={midiMissing}
        onFile={(f) => void handleMidi(f)}
        onClear={clearMidi}
      />
      <FileSlot
        icon={<AudioLines size={20} />}
        label="Audio"
        hint="Your clean recording, played in place of camera audio"
        accept="audio/*,.wav,.mp3,.m4a,.aiff,.flac"
        fileName={audioName || undefined}
        size={audioSize}
        needsReattach={audioMissing}
        onFile={handleAudio}
        onClear={clearAudio}
      />
    </div>
  )

  return (
    <div>
      <div className="flex items-center justify-between mb-6 gap-4">
        <div>
          <h2 className="text-2xl font-semibold">Creation</h2>
          <p className="text-sm text-zinc-500 mt-1">
            Overlay a piano roll on your performance video and tweak it until it lines up.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {ready && (
            <button
              onClick={() => setShowUploads((v) => !v)}
              className="px-3 py-2 rounded-lg text-sm bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800 transition-colors"
            >
              {showUploads ? 'Hide files' : 'Files'}
            </button>
          )}
          {ready && (
            <button
              onClick={() => setHideMidi((v) => !v)}
              className={`px-3 py-2 rounded-lg text-sm border transition-colors flex items-center gap-2 ${
                hideMidi
                  ? 'bg-sky-600 border-sky-500 text-white hover:bg-sky-500'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800'
              }`}
              title={hideMidi ? 'Draw the MIDI overlay again' : 'Hide the MIDI overlay and watch just the video'}
            >
              <Music4 size={15} />
              {hideMidi ? 'Show MIDI' : 'Hide MIDI'}
            </button>
          )}
          {ready && settings.mode === 'perspective' && (
            <button
              onClick={() => {
                if (settings.showKeyGuide) {
                  // previewing: drop the guide and stop positioning
                  setCalibrating(false)
                  setActiveCorner(null)
                }
                set('showKeyGuide', !settings.showKeyGuide)
              }}
              className={`px-3 py-2 rounded-lg text-sm border transition-colors flex items-center gap-2 ${
                settings.showKeyGuide
                  ? 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800'
                  : 'bg-sky-600 border-sky-500 text-white hover:bg-sky-500'
              }`}
              title={
                settings.showKeyGuide
                  ? 'Hide the drawn keys and watch just the falling notes'
                  : 'Show the drawn keys again'
              }
            >
              {settings.showKeyGuide ? <EyeOff size={15} /> : <Eye size={15} />}
              {settings.showKeyGuide ? 'Notes only' : 'Show keys'}
            </button>
          )}
          <button
            onClick={() => setShowPanel((v) => !v)}
            className={`px-3 py-2 rounded-lg text-sm border transition-colors flex items-center gap-2 ${
              showPanel
                ? 'bg-zinc-800 border-zinc-700 text-white'
                : 'bg-zinc-900 border-zinc-800 text-zinc-300 hover:bg-zinc-800'
            }`}
          >
            <Sliders size={15} />
            Tweaks
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-sm text-amber-300">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-amber-400 hover:text-amber-200">
            <X size={16} />
          </button>
        </div>
      )}

      {(showUploads || !ready) && <div className="mb-6">{uploads}</div>}

      {(videoUrl || audioUrl) && (
        <label className="flex items-center gap-2 text-sm text-zinc-400 mb-6 cursor-pointer">
          <input
            type="checkbox"
            checked={keepMedia}
            onChange={(e) => setKeepMedia(e.target.checked)}
            className="accent-sky-500 w-4 h-4"
          />
          Keep video &amp; audio in this browser so the project reopens after a reload
          <span className="text-zinc-600">
            ({formatSize(videoSize + audioSize)} — large videos may fail to store)
          </span>
        </label>
      )}

      {!ready ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-10 text-center text-zinc-500">
          {videoUrl
            ? 'Add the MIDI file to draw the piano roll.'
            : 'Upload your video and MIDI file to get started.'}
        </div>
      ) : (
        <div className={`grid gap-6 ${showPanel ? 'xl:grid-cols-[1fr_20rem]' : ''}`}>
          {/* ---------------- stage ---------------- */}
          <div className="min-w-0">
            <div ref={stageRef} className="relative bg-black rounded-xl overflow-hidden aspect-video">
              <video
                ref={videoRef}
                src={videoUrl ?? undefined}
                className="w-full h-full object-contain"
                playsInline
                muted={settings.useRecordedAudio && !!audioUrl}
                onLoadedMetadata={(e) => {
                  const d = e.currentTarget.duration || 0
                  setDuration(d)
                  if (d > 0) setViewDuration(d) // start zoomed out to the whole take
                  setVideoDims({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight })
                  e.currentTarget.playbackRate = rate
                  e.currentTarget.volume = settings.videoVolume
                }}
                onPlay={() => {
                  setPlaying(true)
                  syncAudio(true)
                }}
                onPause={() => {
                  setPlaying(false)
                  audioRef.current?.pause()
                }}
                onSeeked={() => {
                  setCurrentTime(videoRef.current?.currentTime ?? 0)
                  syncAudio(true)
                }}
                onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                onClick={calibrating ? undefined : togglePlay}
              />
              {(!hideMidi || calibrating) && (
              <PianoRollOverlay
                videoRef={videoRef}
                notes={notes}
                settings={settings}
                track={track}
                calibrating={calibrating}
                activeCorner={settings.calibrationMode === 'corners' ? activeCorner : null}
                corners={baseCorners}
                anchoredKeys={anchoredKeys}
              />
              )}

              {/* keyboard corner handles — drag these onto the real keys */}
              {calibrating &&
                frame.w > 0 &&
                settings.calibrationMode === 'anchors' &&
                settings.anchors.map((anchor, index) => (
                  <button
                    key={anchor.id}
                    onPointerDown={(e) => {
                      e.preventDefault()
                      e.currentTarget.setPointerCapture(e.pointerId)
                      setActiveCorner(index)
                      draggingCornerRef.current = index
                    }}
                    onPointerMove={(e) => {
                      if (draggingCornerRef.current !== index) return
                      moveAnchor(index, e.clientX, e.clientY)
                    }}
                    onPointerUp={(e) => {
                      draggingCornerRef.current = null
                      e.currentTarget.releasePointerCapture(e.pointerId)
                    }}
                    style={{
                      left: frame.x + (frame.w * anchor.x) / 100,
                      top: frame.y + (frame.h * anchor.y) / 100,
                    }}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 w-5 h-5 rounded-sm border-2 rotate-45 touch-none cursor-grab active:cursor-grabbing transition-colors ${
                      activeCorner === index
                        ? 'bg-lime-400/90 border-white'
                        : 'bg-lime-400/40 border-lime-300 hover:bg-lime-400/70'
                    }`}
                    title={`${midiToName(anchor.midi)} ${anchor.side} · ${ANCHOR_DEPTH_LABELS[anchor.depth]}`}
                  >
                    <span className="absolute left-full ml-2 top-1/2 -translate-y-1/2 -rotate-45 text-[10px] whitespace-nowrap text-lime-200 pointer-events-none">
                      {midiToName(anchor.midi)}
                      {anchor.side === 'left' ? '◀' : '▶'}
                    </span>
                  </button>
                ))}

              {calibrating &&
                frame.w > 0 &&
                settings.calibrationMode === 'corners' &&
                settings.corners.map((corner, index) => (
                  <button
                    key={CORNER_LABELS[index]}
                    onPointerDown={(e) => {
                      e.preventDefault()
                      e.currentTarget.setPointerCapture(e.pointerId)
                      setActiveCorner(index)
                      draggingCornerRef.current = index
                    }}
                    onPointerMove={(e) => {
                      if (draggingCornerRef.current !== index) return
                      moveCornerTo(index, e.clientX, e.clientY)
                    }}
                    onPointerUp={(e) => {
                      draggingCornerRef.current = null
                      e.currentTarget.releasePointerCapture(e.pointerId)
                    }}
                    style={{
                      left: frame.x + (frame.w * corner.x) / 100,
                      top: frame.y + (frame.h * corner.y) / 100,
                    }}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 w-6 h-6 rounded-full border-2 touch-none cursor-grab active:cursor-grabbing transition-colors ${
                      activeCorner === index
                        ? 'bg-amber-400/90 border-white'
                        : 'bg-amber-400/40 border-amber-300 hover:bg-amber-400/70'
                    }`}
                    title={`${CORNER_LABELS[index]} — drag, or select and nudge with arrow keys`}
                  >
                    <span className="absolute left-full ml-1 top-1/2 -translate-y-1/2 text-[10px] whitespace-nowrap text-amber-200 pointer-events-none">
                      {CORNER_LABELS[index]}
                    </span>
                  </button>
                ))}
            </div>

            {audioUrl && <audio ref={audioRef} src={audioUrl} preload="auto" />}

            {/* transport */}
            <div className="mt-3 space-y-3">
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.01}
                value={Math.min(currentTime, duration || 0)}
                onChange={(e) => seekTo(Number(e.target.value))}
                className="w-full accent-sky-500"
              />
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={togglePlay}
                  className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center hover:bg-zinc-200 transition-colors"
                >
                  {playing ? <Pause size={18} /> : <Play size={18} className="ml-0.5" />}
                </button>
                <button
                  onClick={() => nudgeSeek(-FRAME)}
                  className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800"
                  title="Back one frame (Shift+←)"
                >
                  <ChevronsLeft size={16} />
                </button>
                <button
                  onClick={() => nudgeSeek(FRAME)}
                  className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800"
                  title="Forward one frame (Shift+→)"
                >
                  <ChevronsRight size={16} />
                </button>
                <span className="text-sm text-zinc-400 tabular-nums">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>

                <div className="flex-1" />

                <div className="flex items-center gap-1">
                  {[0.25, 0.5, 0.75, 1].map((r) => (
                    <button
                      key={r}
                      onClick={() => setRate(r)}
                      className={`px-2 py-1 rounded-md text-xs transition-colors ${
                        rate === r
                          ? 'bg-zinc-700 text-white'
                          : 'bg-zinc-900 border border-zinc-800 text-zinc-400 hover:bg-zinc-800'
                      }`}
                    >
                      {r}×
                    </button>
                  ))}
                </div>
                <button
                  onClick={toggleFullscreen}
                  className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:bg-zinc-800"
                  title={fullscreen ? 'Exit full screen (F or Esc)' : 'Full screen (F)'}
                >
                  {fullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
                </button>
              </div>

              <p className="text-xs text-zinc-600">
                Space play/pause · F full screen · ←/→ seek 1s (hold Shift for one frame) · [ / ] shift the MIDI by
                50ms (Shift for 5ms)
              </p>
            </div>

            {/* ---------------- alignment timeline ---------------- */}
            <div className="mt-4 bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-zinc-800">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  Alignment
                </span>

                {analyzing && (
                  <span className="text-xs text-sky-400">
                    Analysing {analyzing === 'camera' ? 'camera audio' : 'recording'}…
                  </span>
                )}
                {recordedWave?.onset != null && (
                  <span className="text-xs text-zinc-500">
                    recording starts {recordedWave.onset.toFixed(3)}s in
                  </span>
                )}
                {cameraWave?.onset != null && (
                  <span className="text-xs text-zinc-500">
                    · camera hears sound at {cameraWave.onset.toFixed(3)}s
                  </span>
                )}

                <div className="flex-1" />

                {!cameraWave && videoUrl && (
                  <button
                    onClick={() => void analyzeCameraAudio()}
                    disabled={analyzing !== null}
                    className="px-2 py-1 rounded-md bg-zinc-800 text-xs text-zinc-300 hover:bg-zinc-700 disabled:opacity-50"
                    title="Decodes the whole video to read its audio track"
                  >
                    Show camera audio ({formatSize(videoSize)})
                  </button>
                )}
                <div className="flex items-center gap-1">
                  <span className="text-xs text-zinc-600 mr-1">Zoom</span>
                  {[
                    { label: 'Fit', value: duration || 30 },
                    { label: '10s', value: 10 },
                    { label: '2s', value: 2 },
                    { label: '0.5s', value: 0.5 },
                  ].map((z) => (
                    <button
                      key={z.label}
                      onClick={() => setViewDuration(z.value)}
                      className={`px-2 py-1 rounded-md text-xs transition-colors ${
                        Math.abs(viewDuration - z.value) < 0.001
                          ? 'bg-zinc-700 text-white'
                          : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                      }`}
                    >
                      {z.label}
                    </button>
                  ))}
                </div>
              </div>

              <WaveformTimeline
                videoRef={videoRef}
                duration={duration}
                recorded={recordedWave}
                camera={cameraWave}
                notes={notes}
                settings={settings}
                viewDuration={viewDuration}
                onSeek={seekTo}
                height={18 + (cameraWave ? 50 : 0) + 30 + (recordedWave ? 46 : 0)}
              />

              <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-t border-zinc-800">
                <input
                  type="range"
                  min={Math.log10(0.2)}
                  max={Math.log10(Math.max(duration, 1))}
                  step={0.01}
                  value={Math.log10(Math.max(0.2, Math.min(viewDuration, Math.max(duration, 1))))}
                  onChange={(e) => setViewDuration(10 ** Number(e.target.value))}
                  className="w-40 accent-sky-500"
                  title="Zoom"
                />
                <span className="text-xs text-zinc-600 tabular-nums w-20">
                  {viewDuration < 1 ? `${(viewDuration * 1000).toFixed(0)}ms` : `${viewDuration.toFixed(1)}s`} wide
                </span>

                <div className="flex-1" />

                {cameraWave?.onset != null && notes.length > 0 && (
                  <button
                    onClick={() =>
                      set('midiOffset', +(firstNoteTime - (cameraWave.onset ?? 0)).toFixed(3))
                    }
                    className="px-2 py-1 rounded-md bg-sky-600 text-xs text-white hover:bg-sky-500"
                    title="Line the first MIDI note up with the first sound the camera picked up"
                  >
                    MIDI → camera sound
                  </button>
                )}
                {recordedWave?.onset != null && notes.length > 0 && (
                  <button
                    onClick={() =>
                      set(
                        'audioOffset',
                        +(
                          (recordedWave.onset ?? 0) -
                          firstNoteTime +
                          settings.midiOffset
                        ).toFixed(3)
                      )
                    }
                    className="px-2 py-1 rounded-md bg-sky-600 text-xs text-white hover:bg-sky-500"
                    title="Line the recording's first sound up with the first MIDI note"
                  >
                    Recording → MIDI
                  </button>
                )}
                {recordedWave?.onset != null && cameraWave?.onset != null && (
                  <button
                    onClick={() =>
                      set(
                        'audioOffset',
                        +((recordedWave.onset ?? 0) - (cameraWave.onset ?? 0)).toFixed(3)
                      )
                    }
                    className="px-2 py-1 rounded-md bg-zinc-800 text-xs text-zinc-300 hover:bg-zinc-700"
                    title="Line the recording's first sound up with the camera's"
                  >
                    Recording → camera
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ---------------- tweak panel ---------------- */}
          {showPanel && (
            <div className="xl:sticky xl:top-20 xl:self-start bg-zinc-900 border border-zinc-800 rounded-xl p-4 max-h-[80vh] overflow-y-auto">
              <Section title="Sync">
                <SliderRow
                  label="MIDI offset"
                  value={settings.midiOffset}
                  min={-10}
                  max={10}
                  step={0.005}
                  onChange={(v) => set('midiOffset', +v.toFixed(3))}
                  format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(3)}s`}
                />
                <div className="flex gap-2">
                  {[-0.1, -0.01, 0.01, 0.1].map((d) => (
                    <button
                      key={d}
                      onClick={() => set('midiOffset', +(settings.midiOffset + d).toFixed(3))}
                      className="flex-1 py-1 rounded-md bg-zinc-800 text-xs text-zinc-300 hover:bg-zinc-700"
                    >
                      {d > 0 ? '+' : ''}
                      {d}
                    </button>
                  ))}
                </div>
                <button
                  onClick={alignFirstNote}
                  className="w-full py-2 rounded-lg bg-sky-600 text-sm text-white hover:bg-sky-500 transition-colors"
                  title={`First note is at ${firstNoteTime.toFixed(2)}s in the MIDI file`}
                >
                  First note lands here
                </button>
                <p className="text-xs text-zinc-600">
                  Pause on the frame where your first note sounds, then press the button.
                </p>
              </Section>

              {audioUrl && (
                <Section title="Recorded audio">
                  <Toggle
                    label="Use recorded audio"
                    checked={settings.useRecordedAudio}
                    onChange={(v) => set('useRecordedAudio', v)}
                  />
                  <SliderRow
                    label="Audio offset"
                    value={settings.audioOffset}
                    min={-10}
                    max={10}
                    step={0.005}
                    onChange={(v) => set('audioOffset', +v.toFixed(3))}
                    format={(v) => `${v > 0 ? '+' : ''}${v.toFixed(3)}s`}
                  />
                  <div className="flex gap-2">
                    {[-0.1, -0.01, 0.01, 0.1].map((d) => (
                      <button
                        key={d}
                        onClick={() => set('audioOffset', +(settings.audioOffset + d).toFixed(3))}
                        className="flex-1 py-1 rounded-md bg-zinc-800 text-xs text-zinc-300 hover:bg-zinc-700"
                      >
                        {d > 0 ? '+' : ''}
                        {d}
                      </button>
                    ))}
                  </div>
                  <SliderRow
                    label="Audio volume"
                    value={settings.audioVolume}
                    min={0}
                    max={1}
                    step={0.05}
                    onChange={(v) => set('audioVolume', v)}
                    format={(v) => `${Math.round(v * 100)}%`}
                  />
                  <SliderRow
                    label="Camera volume"
                    value={settings.videoVolume}
                    min={0}
                    max={1}
                    step={0.05}
                    onChange={(v) => set('videoVolume', v)}
                    format={(v) => `${Math.round(v * 100)}%`}
                  />
                </Section>
              )}

              <Section title="Look">
                <div className="flex gap-2">
                  {(
                    [
                      { value: 'flat', label: 'Flat' },
                      { value: 'perspective', label: 'On the piano' },
                    ] as const
                  ).map((m) => (
                    <button
                      key={m.value}
                      onClick={() => {
                        set('mode', m.value)
                        // jump straight into calibration — the default quad won't match
                        if (m.value === 'perspective') {
                          setCalibrating(true)
                          setActiveCorner(0)
                        } else {
                          setCalibrating(false)
                        }
                      }}
                      className={`flex-1 py-1.5 rounded-md text-xs transition-colors ${
                        settings.mode === m.value
                          ? 'bg-zinc-700 text-white'
                          : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                {settings.mode === 'perspective' && (
                  <p className="text-xs text-zinc-600">
                    Notes land on the real keys and the real keys light up. No drawn keyboard —
                    the outlines are only a calibration aid.
                  </p>
                )}
              </Section>

              {settings.mode === 'perspective' && (
                <>
                  <Section title="Calibration">
                    <div className="flex gap-2">
                      {(
                        [
                          { value: 'corners', label: 'Whole keyboard' },
                          { value: 'anchors', label: 'Marked keys' },
                        ] as const
                      ).map((m) => (
                        <button
                          key={m.value}
                          onClick={() => {
                            set('calibrationMode', m.value)
                            setActiveCorner(0)
                            setCalibrating(true)
                            set('showKeyGuide', true)
                          }}
                          className={`flex-1 py-1.5 rounded-md text-xs transition-colors ${
                            settings.calibrationMode === m.value
                              ? 'bg-zinc-700 text-white'
                              : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-zinc-600">
                      {settings.calibrationMode === 'corners'
                        ? 'Needs all four corners of the piano in frame.'
                        : 'For shots that crop the ends: pin edges of keys you can identify (tape on C4 helps) and the rest of the keyboard is worked out from them.'}
                    </p>
                    {!anchorsSolvable && (
                      <p className="text-xs text-amber-400">
                        These anchors don&apos;t define a plane yet — you need at least four, and
                        they can&apos;t all sit on one line. Pin two different keys at both the
                        front and the back.
                      </p>
                    )}
                  </Section>

                  {settings.calibrationMode === 'anchors' && (
                    <Section title="Marked keys">
                      <div className="space-y-2">
                        {settings.anchors.map((anchor, index) => (
                          <div
                            key={anchor.id}
                            onClick={() => setActiveCorner(index)}
                            className={`rounded-md border p-2 space-y-1.5 cursor-pointer transition-colors ${
                              activeCorner === index
                                ? 'border-lime-500/60 bg-lime-500/10'
                                : 'border-zinc-800 bg-zinc-800/40 hover:border-zinc-700'
                            }`}
                          >
                            <div className="flex items-center gap-1.5">
                              <select
                                value={anchor.midi}
                                onChange={(e) =>
                                  updateAnchor(index, { midi: Number(e.target.value) })
                                }
                                className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-1.5 py-1 text-xs text-white"
                              >
                                {spans
                                  .slice()
                                  .sort((a, b) => a.midi - b.midi)
                                  .map((k) => (
                                    <option key={k.midi} value={k.midi}>
                                      {midiToName(k.midi)}
                                      {isBlackKey(k.midi) ? ' (black)' : ''}
                                    </option>
                                  ))}
                              </select>
                              {(['left', 'right'] as const).map((side) => (
                                <button
                                  key={side}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    updateAnchor(index, { side })
                                  }}
                                  className={`px-2 py-1 rounded text-xs ${
                                    anchor.side === side
                                      ? 'bg-zinc-600 text-white'
                                      : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-700'
                                  }`}
                                  title={`${side} edge of the key`}
                                >
                                  {side === 'left' ? '◀' : '▶'}
                                </button>
                              ))}
                              {settings.anchors.length > 4 && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setSettings((prev) => ({
                                      ...prev,
                                      anchors: prev.anchors.filter((_, i) => i !== index),
                                    }))
                                    setActiveCorner(null)
                                  }}
                                  className="px-1.5 py-1 rounded text-xs text-red-400 hover:bg-red-500/15"
                                  title="Remove this anchor"
                                >
                                  <X size={12} />
                                </button>
                              )}
                            </div>
                            <select
                              value={anchor.depth}
                              onChange={(e) =>
                                updateAnchor(index, {
                                  depth: e.target.value as KeyAnchor['depth'],
                                })
                              }
                              className="w-full bg-zinc-900 border border-zinc-700 rounded px-1.5 py-1 text-xs text-white"
                            >
                              {(
                                Object.keys(ANCHOR_DEPTH_LABELS) as KeyAnchor['depth'][]
                              ).map((depth) => (
                                <option key={depth} value={depth}>
                                  {ANCHOR_DEPTH_LABELS[depth]}
                                </option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>

                      <button
                        onClick={() =>
                          setSettings((prev) => ({
                            ...prev,
                            anchors: [
                              ...prev.anchors,
                              {
                                ...prev.anchors[prev.anchors.length - 1],
                                id: `a${Date.now().toString(36)}`,
                                y: Math.min(120, prev.anchors[prev.anchors.length - 1].y + 4),
                              },
                            ],
                          }))
                        }
                        className="w-full py-1.5 rounded-md bg-zinc-800 text-xs text-zinc-300 hover:bg-zinc-700"
                      >
                        Add another anchor
                      </button>
                      <p className="text-xs text-zinc-600">
                        Spread them as wide as the shot allows. Two keys an octave or more apart is
                        solid; anchors on neighbouring keys are about 8× less accurate, because the
                        rest of the keyboard has to be extrapolated from a very short baseline.
                      </p>
                    </Section>
                  )}

                  <Section title={settings.calibrationMode === 'anchors' ? 'Positioning' : 'Keyboard corners'}>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          const next = !calibrating
                          setCalibrating(next)
                          setActiveCorner(next ? 0 : null)
                          // the keys have to be visible to position against them
                          if (next) set('showKeyGuide', true)
                        }}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm transition-colors ${
                          calibrating
                            ? 'bg-amber-500 text-black hover:bg-amber-400'
                            : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
                        }`}
                      >
                        <Crosshair size={15} />
                        {calibrating
                          ? 'Done'
                          : settings.calibrationMode === 'anchors'
                            ? 'Move anchors'
                            : 'Move corners'}
                      </button>
                      <button
                        onClick={() => {
                          setCalibrating(false)
                          setActiveCorner(null)
                          set('showKeyGuide', false)
                        }}
                        disabled={!settings.showKeyGuide && !calibrating}
                        className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm bg-zinc-800 text-zinc-200 hover:bg-zinc-700 disabled:opacity-40 transition-colors"
                        title="Hide the drawn keys and watch just the falling notes"
                      >
                        <EyeOff size={15} />
                        Preview
                      </button>
                    </div>
                    {calibrating && (
                      <p className="text-xs text-amber-300/80">
                        Keys are drawn solid while positioning, and follow your{' '}
                        {settings.calibrationMode === 'anchors' ? 'anchors' : 'corners'} as you move
                        them.
                        {track && settings.useTrack
                          ? ' The dashed grey outline is where the motion track had the keyboard.'
                          : ''}
                      </p>
                    )}

                    {calibrating && settings.calibrationMode === 'anchors' && (
                      <>
                        <p className="text-xs text-zinc-500">
                          Drag each lime marker onto the edge it names. Arrow keys nudge the selected
                          one (Shift for fine).
                        </p>
                        <div className="rounded-md bg-zinc-800/60 px-2 py-1.5">
                          <p className="text-[11px] text-zinc-500">
                            Keyboard solved from anchors
                          </p>
                          <p className="text-[11px] text-zinc-300 tabular-nums break-all">
                            {baseCorners
                              .map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`)
                              .join('  ')}
                          </p>
                          <p className="text-[11px] text-zinc-600 mt-1">
                            These must change as you drag. If they don&apos;t, the anchors aren&apos;t
                            solving — check the warning above.
                          </p>
                        </div>
                      </>
                    )}
                    {calibrating && settings.calibrationMode === 'corners' && (
                      <>
                        <p className="text-xs text-zinc-500">
                          Drag each handle onto that corner of your piano. Pause on a frame where
                          the whole keyboard is visible first.
                        </p>
                        <div className="grid grid-cols-2 gap-1">
                          {CORNER_LABELS.map((label, index) => (
                            <button
                              key={label}
                              onClick={() => setActiveCorner(index)}
                              className={`px-2 py-1 rounded-md text-[11px] text-left transition-colors ${
                                activeCorner === index
                                  ? 'bg-amber-500/20 text-amber-200 border border-amber-500/50'
                                  : 'bg-zinc-800 text-zinc-400 border border-transparent hover:bg-zinc-700'
                              }`}
                            >
                              {label}
                              <span className="block text-zinc-600 tabular-nums">
                                {settings.corners[index].x.toFixed(1)},{' '}
                                {settings.corners[index].y.toFixed(1)}
                              </span>
                            </button>
                          ))}
                        </div>
                        <p className="text-xs text-zinc-600">
                          Arrow keys nudge the selected corner (Shift for fine).
                        </p>
                      </>
                    )}

                    <button
                      onClick={() => {
                        // back to a known layout, positioning on, keys visible, and
                        // showing the calibration rather than the track — otherwise
                        // the reset is invisible and looks like nothing happened
                        setSettings((prev) => ({
                          ...prev,
                          anchors: DEFAULT_SETTINGS.anchors,
                          corners: DEFAULT_SETTINGS.corners,
                          showKeyGuide: true,
                          calibratedAt: stampFrame(),
                        }))
                        setCalibrating(true)
                        setActiveCorner(0)
                      }}
                      className="w-full py-1.5 rounded-md bg-zinc-800 text-xs text-zinc-300 hover:bg-zinc-700"
                    >
                      Reset {settings.calibrationMode === 'anchors' ? 'anchors' : 'corners'} to default layout
                    </button>
                  </Section>

                  <Section title="Motion tracking">
                    {tracking ? (
                      <>
                        <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                          <div
                            className="h-full bg-sky-500 transition-[width] duration-200"
                            style={{ width: `${Math.round(trackProgress * 100)}%` }}
                          />
                        </div>
                        <p className="text-xs text-zinc-500">
                          Watching the footage and following the keyboard —
                          {' '}{Math.round(trackProgress * 100)}%
                        </p>
                        <button
                          onClick={() => {
                            if (trackCancelRef.current) trackCancelRef.current.cancelled = true
                          }}
                          className="w-full py-2 rounded-lg bg-zinc-800 text-sm text-zinc-200 hover:bg-zinc-700"
                        >
                          Stop and keep what's tracked
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => void startTracking()}
                        className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-sky-600 text-sm text-white hover:bg-sky-500 transition-colors"
                      >
                        <Activity size={15} />
                        {track
                          ? `Continue tracking from ${formatTime(settings.calibratedAt)}`
                          : 'Track keyboard motion'}
                      </button>
                    )}

                    {!tracking && track && Math.abs(currentTime - settings.calibratedAt) > 0.1 && (
                      <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 space-y-1.5">
                        <p className="text-xs text-amber-200">
                          Overlay drifted off by {formatTime(currentTime)}? Re-align on this frame —
                          the part before it is kept.
                        </p>
                        <button
                          onClick={realignHere}
                          className="w-full py-1.5 rounded-md bg-amber-500 text-xs font-medium text-black hover:bg-amber-400"
                        >
                          Re-align at {formatTime(currentTime)}
                        </button>
                        <p className="text-xs text-amber-200/70">
                          Brings the handles back where the track currently puts them, so you only
                          nudge what&apos;s off.
                        </p>
                      </div>
                    )}

                    {!tracking && (
                      <>
                        {!track && (
                          <p className="text-xs text-amber-400/90">
                            Until you track, the overlay is fixed to the frame you calibrated on — it
                            will not follow your head.
                          </p>
                        )}
                        <p className="text-xs text-zinc-600">
                          Starts at {settings.calibratedAt.toFixed(2)}s — the frame your
                          {settings.calibrationMode === 'anchors' ? ' anchors' : ' corners'} were
                          placed on, not wherever the playhead is.
                        </p>
                        {track && (
                          <p className="text-xs text-zinc-500">
                            Keeps the track from{' '}
                            {formatTime(track[0]?.time ?? 0)}–{formatTime(settings.calibratedAt)},
                            replaces {formatTime(settings.calibratedAt)} onward.
                          </p>
                        )}
                        {settings.calibrationMode === 'anchors' && planePoints.length > 0 && (
                          <p className="text-xs text-zinc-600">
                            Your {planePoints.length} marked spots are tracked as fixed features
                            alongside the automatic ones.
                          </p>
                        )}
                      </>
                    )}

                    {track && track.length > 0 && (
                      <>
                        <Toggle
                          label="Follow the track"
                          checked={settings.useTrack}
                          onChange={(v) => set('useTrack', v)}
                        />
                        <p className="text-xs text-zinc-500">
                          {trackStats ??
                            `${track.length} frames tracked (${track[0].time.toFixed(1)}s–${track[track.length - 1].time.toFixed(1)}s)`}
                        </p>
                        <div className="rounded-md bg-zinc-800/60 px-2 py-1.5 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-zinc-500">At playhead</span>
                            <span className="text-zinc-300 tabular-nums">
                              {(trackAtPlayhead.confidence * 100).toFixed(0)}% conf ·{' '}
                              {trackAtPlayhead.offset.toFixed(2)}% off start
                            </span>
                          </div>
                          <p className="text-zinc-600 mt-1">
                            Scrub the video: this should change as your head moves. The dashed grey
                            outline shows where the corners started.
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            setTrack(null)
                            setTrackStats(null)
                          }}
                          className="w-full py-1.5 rounded-md bg-zinc-800 text-xs text-red-400 hover:bg-red-500/15"
                        >
                          Clear track
                        </button>
                      </>
                    )}
                  </Section>

                  <Section title="Your piano">
                    <p className="text-xs text-zinc-600">
                      Must match the real instrument, or the keys won&apos;t line up.
                    </p>
                    <div className="grid grid-cols-2 gap-1">
                      {KEYBOARD_PRESETS.map((preset) => (
                        <button
                          key={preset.label}
                          onClick={() =>
                            setSettings((p) => ({ ...p, lowNote: preset.low, highNote: preset.high }))
                          }
                          className={`px-2 py-1 rounded-md text-[11px] transition-colors ${
                            settings.lowNote === preset.low && settings.highNote === preset.high
                              ? 'bg-zinc-700 text-white'
                              : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </Section>

                  <Section title="Note highway">
                    <SliderRow
                      label="Angle"
                      value={settings.highwayTilt}
                      min={0}
                      max={1}
                      step={0.02}
                      onChange={(v) => set('highwayTilt', v)}
                      format={(v) =>
                        v < 0.02 ? 'along piano' : v > 0.98 ? 'upright' : `${Math.round(v * 100)}% up`
                      }
                    />
                    {settings.highwayTilt < 0.98 && (
                      <SliderRow
                        label="Depth into scene"
                        value={settings.highwayDepth}
                        min={1}
                        max={14}
                        step={0.2}
                        onChange={(v) => set('highwayDepth', v)}
                        format={(v) => `${v.toFixed(1)}× keys`}
                      />
                    )}
                    {settings.highwayTilt > 0.02 && (
                      <>
                        <SliderRow
                          label="Wall height"
                          value={settings.riseHeight}
                          min={5}
                          max={100}
                          step={1}
                          onChange={(v) => set('riseHeight', v)}
                          format={(v) => `${v}%`}
                        />
                        <SliderRow
                          label="Wall spread"
                          value={settings.riseSpread}
                          min={0.5}
                          max={1.6}
                          step={0.01}
                          onChange={(v) => set('riseSpread', v)}
                          format={(v) => `${v.toFixed(2)}×`}
                        />
                      </>
                    )}
                    <SliderRow
                      label="Fade with distance"
                      value={settings.fadeFar}
                      min={0}
                      max={1}
                      step={0.05}
                      onChange={(v) => set('fadeFar', v)}
                      format={(v) => `${Math.round(v * 100)}%`}
                    />
                  </Section>

                  <Section title="Real keys">
                    <Toggle
                      label="Light up keys"
                      checked={settings.keyHighlight}
                      onChange={(v) => set('keyHighlight', v)}
                    />
                    {settings.keyHighlight && (
                      <SliderRow
                        label="Highlight strength"
                        value={settings.highlightAlpha}
                        min={0.1}
                        max={1}
                        step={0.05}
                        onChange={(v) => set('highlightAlpha', v)}
                        format={(v) => `${Math.round(v * 100)}%`}
                      />
                    )}
                    <Toggle
                      label="Flash on hit"
                      checked={settings.hitFlash}
                      onChange={(v) => set('hitFlash', v)}
                    />
                    <Toggle
                      label="Key outlines (guide)"
                      checked={settings.showKeyGuide}
                      onChange={(v) => set('showKeyGuide', v)}
                    />
                    {settings.showKeyGuide && (
                      <SliderRow
                        label="Guide opacity"
                        value={settings.guideOpacity}
                        min={0.1}
                        max={1}
                        step={0.05}
                        onChange={(v) => set('guideOpacity', v)}
                        format={(v) => `${Math.round(v * 100)}%`}
                      />
                    )}
                    <SliderRow
                      label="Black key start"
                      value={settings.blackKeyDepth}
                      min={0.2}
                      max={0.7}
                      step={0.01}
                      onChange={(v) => set('blackKeyDepth', v)}
                      format={(v) => `${Math.round(v * 100)}%`}
                    />
                  </Section>
                </>
              )}

              {settings.mode === 'flat' && (
              <Section title="Placement">
                <SliderRow
                  label="Left"
                  value={settings.x}
                  min={-20}
                  max={100}
                  step={0.5}
                  onChange={(v) => set('x', v)}
                  format={(v) => `${v}%`}
                />
                <SliderRow
                  label="Top"
                  value={settings.y}
                  min={-20}
                  max={100}
                  step={0.5}
                  onChange={(v) => set('y', v)}
                  format={(v) => `${v}%`}
                />
                <SliderRow
                  label="Width"
                  value={settings.width}
                  min={10}
                  max={150}
                  step={0.5}
                  onChange={(v) => set('width', v)}
                  format={(v) => `${v}%`}
                />
                <SliderRow
                  label="Height"
                  value={settings.height}
                  min={10}
                  max={100}
                  step={0.5}
                  onChange={(v) => set('height', v)}
                  format={(v) => `${v}%`}
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => setSettings((p) => ({ ...p, x: 0, y: 0, width: 100, height: 55 }))}
                    className="flex-1 py-1.5 rounded-md bg-zinc-800 text-xs text-zinc-300 hover:bg-zinc-700"
                  >
                    Top half
                  </button>
                  <button
                    onClick={() =>
                      setSettings((p) => ({ ...p, x: 0, y: 45, width: 100, height: 55 }))
                    }
                    className="flex-1 py-1.5 rounded-md bg-zinc-800 text-xs text-zinc-300 hover:bg-zinc-700"
                  >
                    Bottom half
                  </button>
                  <button
                    onClick={() =>
                      setSettings((p) => ({ ...p, x: 0, y: 0, width: 100, height: 100 }))
                    }
                    className="flex-1 py-1.5 rounded-md bg-zinc-800 text-xs text-zinc-300 hover:bg-zinc-700"
                  >
                    Full
                  </button>
                </div>
              </Section>
              )}

              <Section title="Roll">
                {settings.mode === 'flat' && (
                <div className="flex gap-2">
                  {(['down', 'up'] as const).map((d) => (
                    <button
                      key={d}
                      onClick={() => set('direction', d)}
                      className={`flex-1 py-1.5 rounded-md text-xs capitalize transition-colors ${
                        settings.direction === d
                          ? 'bg-zinc-700 text-white'
                          : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                      }`}
                    >
                      Falls {d}
                    </button>
                  ))}
                </div>
                )}
                <SliderRow
                  label="Seconds visible"
                  value={settings.lookAhead}
                  min={0.5}
                  max={10}
                  step={0.1}
                  onChange={(v) => set('lookAhead', v)}
                  format={(v) => `${v.toFixed(1)}s`}
                />
                <SliderRow
                  label="Opacity"
                  value={settings.opacity}
                  min={0.1}
                  max={1}
                  step={0.05}
                  onChange={(v) => set('opacity', v)}
                  format={(v) => `${Math.round(v * 100)}%`}
                />
                <SliderRow
                  label="Backdrop"
                  value={settings.bgOpacity}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={(v) => set('bgOpacity', v)}
                  format={(v) => `${Math.round(v * 100)}%`}
                />
                {settings.mode === 'flat' && (
                  <>
                    <Toggle
                      label="Keyboard strip"
                      checked={settings.showKeyboard}
                      onChange={(v) => set('showKeyboard', v)}
                    />
                    {settings.showKeyboard && (
                      <SliderRow
                        label="Keyboard height"
                        value={settings.keyboardHeight}
                        min={0.05}
                        max={0.5}
                        step={0.01}
                        onChange={(v) => set('keyboardHeight', v)}
                        format={(v) => `${Math.round(v * 100)}%`}
                      />
                    )}
                    <Toggle
                      label="Hit line"
                      checked={settings.showHitLine}
                      onChange={(v) => set('showHitLine', v)}
                    />
                  </>
                )}
                <Toggle
                  label="Octave lines"
                  checked={settings.showOctaveLines}
                  onChange={(v) => set('showOctaveLines', v)}
                />
                <Toggle label="Glow" checked={settings.glow} onChange={(v) => set('glow', v)} />
                {settings.mode === 'flat' && (
                  <>
                    <SliderRow
                      label="Corner radius"
                      value={settings.noteRadius}
                      min={0}
                      max={12}
                      step={1}
                      onChange={(v) => set('noteRadius', v)}
                      format={(v) => `${v}px`}
                    />
                    <SliderRow
                      label="Note gap"
                      value={settings.noteGap}
                      min={0}
                      max={6}
                      step={0.5}
                      onChange={(v) => set('noteGap', v)}
                      format={(v) => `${v}px`}
                    />
                  </>
                )}
              </Section>

              <Section title="Key range">
                <SliderRow
                  label="Lowest key"
                  value={settings.lowNote}
                  min={12}
                  max={108}
                  step={1}
                  onChange={(v) => set('lowNote', Math.min(v, settings.highNote - 11))}
                  format={midiToName}
                />
                <SliderRow
                  label="Highest key"
                  value={settings.highNote}
                  min={24}
                  max={120}
                  step={1}
                  onChange={(v) => set('highNote', Math.max(v, settings.lowNote + 11))}
                  format={midiToName}
                />
                <button
                  onClick={() => setSettings((p) => ({ ...p, lowNote: 21, highNote: 108 }))}
                  className="w-full py-1.5 rounded-md bg-zinc-800 text-xs text-zinc-300 hover:bg-zinc-700"
                >
                  Full 88 keys (A0–C8)
                </button>
              </Section>

              <Section title="Colors">
                <div className="flex gap-2">
                  {(['pitch', 'track'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => set('colorMode', m)}
                      className={`flex-1 py-1.5 rounded-md text-xs capitalize transition-colors ${
                        settings.colorMode === m
                          ? 'bg-zinc-700 text-white'
                          : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
                      }`}
                    >
                      By {m}
                    </button>
                  ))}
                </div>
                {settings.colorMode === 'pitch' && (
                  <SliderRow
                    label="Hand split"
                    value={settings.splitNote}
                    min={36}
                    max={84}
                    step={1}
                    onChange={(v) => set('splitNote', v)}
                    format={midiToName}
                  />
                )}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-400">
                    {settings.colorMode === 'pitch' ? 'Upper' : 'Track 1'}
                  </span>
                  <input
                    type="color"
                    value={settings.rightColor}
                    onChange={(e) => set('rightColor', e.target.value)}
                    className="w-10 h-7 bg-transparent rounded cursor-pointer"
                  />
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-400">
                    {settings.colorMode === 'pitch' ? 'Lower' : 'Track 2'}
                  </span>
                  <input
                    type="color"
                    value={settings.leftColor}
                    onChange={(e) => set('leftColor', e.target.value)}
                    className="w-10 h-7 bg-transparent rounded cursor-pointer"
                  />
                </div>
              </Section>

              {midiData && midiData.tracks.length > 1 && (
                <Section title="Tracks">
                  {midiData.tracks.map((t) => {
                    const hidden = settings.hiddenTracks.includes(t.index)
                    return (
                      <label
                        key={t.index}
                        className="flex items-center gap-2 text-sm cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={!hidden}
                          onChange={(e) =>
                            set(
                              'hiddenTracks',
                              e.target.checked
                                ? settings.hiddenTracks.filter((i) => i !== t.index)
                                : [...settings.hiddenTracks, t.index]
                            )
                          }
                          className="accent-sky-500 w-4 h-4"
                        />
                        <span className="flex-1 truncate text-zinc-300">
                          {t.name || `Track ${t.index + 1}`}
                        </span>
                        <span className="text-xs text-zinc-600">
                          {t.noteCount} · {midiToName(t.lowNote)}–{midiToName(t.highNote)}
                        </span>
                      </label>
                    )
                  })}
                </Section>
              )}

              <Section title="MIDI">
                <div className="text-xs text-zinc-500 space-y-1">
                  <p>{notes.length} notes</p>
                  <p>Length {formatTime(midiData?.duration ?? 0)}</p>
                  <p>First note at {firstNoteTime.toFixed(2)}s</p>
                </div>
              </Section>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() =>
                    setSettings((p) => ({
                      ...DEFAULT_SETTINGS,
                      lowNote: p.lowNote,
                      highNote: p.highNote,
                    }))
                  }
                  className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-zinc-800 text-xs text-zinc-300 hover:bg-zinc-700"
                >
                  <RotateCcw size={14} />
                  Reset tweaks
                </button>
                <button
                  onClick={() => {
                    if (!confirm('Clear this creation project?')) return
                    clearVideo()
                    clearAudio()
                    clearMidi()
                    setSettings(DEFAULT_SETTINGS)
                    setKeepMedia(false)
                    void db.creations.delete(PROJECT_ID)
                  }}
                  className="flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-zinc-800 text-xs text-red-400 hover:bg-red-500/15"
                >
                  <Trash2 size={14} />
                  Clear
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
