/*
 * Audio analysis for the alignment timeline: a min/max peak envelope plus the
 * first audible moment, so you can see exactly where the sound starts.
 */

export interface WaveformData {
  /** interleaved [min, max] per bucket */
  peaks: Float32Array
  bucketsPerSecond: number
  bucketCount: number
  duration: number
  /** seconds to the first audible sample, or null if the file is silent */
  onset: number | null
  /** loudest sample in the file, 0-1 */
  peakLevel: number
}

/** 1ms buckets: fine enough to zoom to a single transient, ~750KB for a 90s take. */
const DEFAULT_BUCKETS_PER_SECOND = 1000

export async function analyzeAudio(
  blob: Blob,
  bucketsPerSecond = DEFAULT_BUCKETS_PER_SECOND
): Promise<WaveformData> {
  const encoded = await blob.arrayBuffer()

  // OfflineAudioContext decodes without touching the autoplay policy
  const ctx = new OfflineAudioContext(1, 1, 44100)
  let audio: AudioBuffer
  try {
    audio = await ctx.decodeAudioData(encoded)
  } catch {
    throw new Error(
      'This browser could not decode that audio. WAV is the safest bet — AIFF and some ' +
        'video codecs are not universally supported.'
    )
  }

  const { sampleRate, duration, numberOfChannels } = audio
  const channels: Float32Array[] = []
  for (let c = 0; c < numberOfChannels; c++) channels.push(audio.getChannelData(c))

  return computeWaveform(channels, sampleRate, duration, bucketsPerSecond)
}

/** The pure half of the analysis, split out so it can be tested without a browser. */
export function computeWaveform(
  channels: Float32Array[],
  sampleRate: number,
  duration: number,
  bucketsPerSecond = DEFAULT_BUCKETS_PER_SECOND
): WaveformData {
  const length = channels[0]?.length ?? 0
  const bucketCount = Math.max(1, Math.ceil(duration * bucketsPerSecond))
  const samplesPerBucket = sampleRate / bucketsPerSecond
  const peaks = new Float32Array(bucketCount * 2)

  let peakLevel = 0
  for (let b = 0; b < bucketCount; b++) {
    const start = Math.floor(b * samplesPerBucket)
    const end = Math.min(Math.floor((b + 1) * samplesPerBucket), length)
    let min = 0
    let max = 0
    for (const data of channels) {
      for (let i = start; i < end; i++) {
        const v = data[i]
        if (v < min) min = v
        if (v > max) max = v
      }
    }
    peaks[b * 2] = min
    peaks[b * 2 + 1] = max
    peakLevel = Math.max(peakLevel, max, -min)
  }

  return {
    peaks,
    bucketsPerSecond,
    bucketCount,
    duration,
    onset: detectOnset(channels, sampleRate, length, peakLevel),
    peakLevel,
  }
}

/**
 * First moment the signal rises meaningfully above the noise floor, found with
 * short RMS windows and a threshold relative to the file's own peak — so it
 * survives room noise and a hot or quiet recording alike.
 */
function detectOnset(
  channels: Float32Array[],
  sampleRate: number,
  length: number,
  peakLevel: number
): number | null {
  if (peakLevel <= 0) return null

  const windowSize = Math.max(1, Math.round(sampleRate * 0.002)) // 2ms
  const windowCount = Math.ceil(length / windowSize)
  const rms = new Float32Array(windowCount)

  let loudest = 0
  for (let w = 0; w < windowCount; w++) {
    const start = w * windowSize
    const end = Math.min(start + windowSize, length)
    let sum = 0
    let count = 0
    for (const data of channels) {
      for (let i = start; i < end; i++) {
        sum += data[i] * data[i]
        count++
      }
    }
    const value = count > 0 ? Math.sqrt(sum / count) : 0
    rms[w] = value
    if (value > loudest) loudest = value
  }

  // 4% of the loudest window (~ -28dB relative), floored so near-silence is not a hit
  const threshold = Math.max(loudest * 0.04, 0.0015)
  for (let w = 0; w < windowCount; w++) {
    if (rms[w] > threshold) return (w * windowSize) / sampleRate
  }
  return null
}
