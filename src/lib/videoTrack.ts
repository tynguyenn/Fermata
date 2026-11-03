/*
 * Browser side of keyboard tracking: pulls frames out of the <video>, feeds them
 * to the plane tracker in lib/tracking.ts, and returns a time-indexed track.
 *
 * Frames come from requestVideoFrameCallback while the video plays, rather than
 * seeking frame by frame — seeking a long recording is far slower than watching
 * it. If processing falls behind, frames are simply missed; the tracker predicts
 * across gaps and the track is interpolated, so a dropped frame costs accuracy
 * rather than correctness.
 */

import type { Point } from './homography'
import {
  createPlaneTracker,
  grayFromRGBA,
  smoothTrack,
  type TrackSample,
  type TrackerOptions,
} from './tracking'

export interface TrackProgress {
  time: number
  fraction: number
  samples: number
  confidence: number
  reAnchors: number
}

export interface TrackPassOptions {
  video: HTMLVideoElement
  /** starting keyboard corners, as % of the video frame */
  corners: Point[]
  startTime?: number
  endTime?: number
  /** width the analysis runs at; height follows the video's aspect (default 512) */
  processingWidth?: number
  playbackRate?: number
  tracker?: TrackerOptions
  /** marked spots in keyboard space, tracked as guaranteed features */
  planePoints?: { u: number; w: number }[]
  onProgress?: (progress: TrackProgress) => void
  /** flip `cancelled` to stop the pass early and keep what was tracked so far */
  signal?: { cancelled: boolean }
}

export interface TrackPassResult {
  samples: TrackSample[]
  reAnchors: number
  /** frames the tracker could not solve and had to hold position through */
  heldFrames: number
  processedFrames: number
}

/** Defaults chosen to stay close to real-time on a 1080p take. */
const DEFAULT_TRACKER_OPTIONS: TrackerOptions = {
  margin: 0.18,
  detect: { cellsX: 10, cellsY: 5, perCell: 2, minQuality: 6 },
  flow: { windowRadius: 5, maxIterations: 8, forwardBackwardTolerance: 1, maxResidual: 45 },
  ransac: { threshold: 2, iterations: 150 },
  minInliers: 12,
  minInlierRatio: 0.35,
  maxJump: 40,
  maxBaseline: 18,
  maxFramesPerKeyframe: 90,
}

type FrameCallback = (now: number, metadata: { mediaTime: number }) => void
type VideoWithFrameCallback = HTMLVideoElement & {
  requestVideoFrameCallback?: (callback: FrameCallback) => number
  cancelVideoFrameCallback?: (handle: number) => void
}

function waitForSeek(video: HTMLVideoElement, time: number) {
  return new Promise<void>((resolve) => {
    if (Math.abs(video.currentTime - time) < 1e-3) {
      resolve()
      return
    }
    const done = () => {
      video.removeEventListener('seeked', done)
      resolve()
    }
    video.addEventListener('seeked', done)
    video.currentTime = time
  })
}

export async function runTrackingPass(options: TrackPassOptions): Promise<TrackPassResult> {
  const {
    video,
    corners,
    startTime = 0,
    processingWidth = 512,
    playbackRate = 1,
    onProgress,
    signal,
  } = options

  const duration = video.duration || 0
  const endTime = Math.min(options.endTime ?? duration, duration || Infinity)
  if (!video.videoWidth || !video.videoHeight) throw new Error('Video is not ready yet')
  if (endTime - startTime < 0.2) {
    throw new Error(
      'Nothing to track from here — move the playhead back to where the keyboard is aligned'
    )
  }

  const width = Math.max(120, Math.round(processingWidth))
  const height = Math.max(80, Math.round((width * video.videoHeight) / video.videoWidth))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Could not get a 2D context for tracking')

  // remember the player's state so the pass is invisible afterwards
  const wasPaused = video.paused
  const originalTime = video.currentTime
  const originalRate = video.playbackRate
  const originalMuted = video.muted

  const toPixels = (point: Point): Point => ({
    x: (point.x / 100) * width,
    y: (point.y / 100) * height,
  })
  const toPercent = (point: Point): Point => ({
    x: (point.x / width) * 100,
    y: (point.y / height) * 100,
  })

  const grab = () => {
    ctx.drawImage(video, 0, 0, width, height)
    const { data } = ctx.getImageData(0, 0, width, height)
    return grayFromRGBA(data, width, height)
  }

  try {
    video.pause()
    await waitForSeek(video, startTime)

    const tracker = createPlaneTracker(corners.map(toPixels), grab(), {
      ...DEFAULT_TRACKER_OPTIONS,
      planePoints: options.planePoints,
      ...options.tracker,
    })

    const samples: TrackSample[] = [
      { time: video.currentTime, corners: corners.map((p) => ({ ...p })), confidence: 1 },
    ]
    let reAnchors = 0
    let heldFrames = 0
    let processedFrames = 0

    const videoWithCallback = video as VideoWithFrameCallback
    const supportsFrameCallback = typeof videoWithCallback.requestVideoFrameCallback === 'function'

    video.muted = true
    video.playbackRate = playbackRate

    await new Promise<void>((resolve) => {
      let finished = false
      const finish = () => {
        if (finished) return
        finished = true
        video.removeEventListener('ended', finish)
        resolve()
      }
      video.addEventListener('ended', finish)

      const handleFrame = (mediaTime: number) => {
        if (finished) return
        if (signal?.cancelled || mediaTime > endTime) {
          finish()
          return
        }

        const step = tracker.step(grab())
        processedFrames++
        if (step.reAnchored) reAnchors++
        if (!step.ok) heldFrames++

        samples.push({
          time: mediaTime,
          corners: step.corners.map(toPercent),
          confidence: step.confidence,
        })

        onProgress?.({
          time: mediaTime,
          fraction:
            endTime > startTime ? (mediaTime - startTime) / (endTime - startTime) : 1,
          samples: samples.length,
          confidence: step.confidence,
          reAnchors,
        })
      }

      if (supportsFrameCallback) {
        const pump = () => {
          videoWithCallback.requestVideoFrameCallback?.((_now, metadata) => {
            handleFrame(metadata.mediaTime)
            if (!finished) pump()
          })
        }
        pump()
      } else {
        // no per-frame callback: sample as fast as animation frames allow
        const pump = () => {
          if (finished) return
          handleFrame(video.currentTime)
          if (!finished) requestAnimationFrame(pump)
        }
        requestAnimationFrame(pump)
      }

      void video.play().catch(() => finish())
    })

    video.pause()
    return {
      samples: smoothTrack(samples, 2),
      reAnchors,
      heldFrames,
      processedFrames,
    }
  } finally {
    video.playbackRate = originalRate
    video.muted = originalMuted
    await waitForSeek(video, originalTime)
    if (!wasPaused) void video.play().catch(() => {})
  }
}

/** Replace the part of an existing track at or after `fromTime` with fresh samples. */
export function spliceTrack(
  existing: TrackSample[],
  fresh: TrackSample[],
  fromTime: number
): TrackSample[] {
  const kept = existing.filter((sample) => sample.time < fromTime - 1e-6)
  return [...kept, ...fresh].sort((a, b) => a.time - b.time)
}
