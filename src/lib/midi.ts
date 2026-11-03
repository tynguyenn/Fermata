/*
 * Minimal Standard MIDI File parser.
 *
 * Enough to drive a piano-roll overlay: note on/off pairs converted to
 * absolute seconds using the file's tempo map. Handles format 0/1/2,
 * running status, meta/sysex events and SMPTE time division.
 */

export interface MidiNote {
  midi: number // 0-127
  time: number // seconds from start of file
  duration: number // seconds
  velocity: number // 0-1
  track: number // index of the MTrk chunk it came from
  channel: number // 0-15
}

export interface MidiTrackInfo {
  index: number
  name?: string
  noteCount: number
  lowNote: number
  highNote: number
}

export interface MidiData {
  notes: MidiNote[] // sorted by time
  duration: number // seconds, end of last note
  ppq: number // ticks per quarter note (0 for SMPTE timing)
  tracks: MidiTrackInfo[] // only tracks that contain notes
}

class Reader {
  private view: DataView
  private bytes: Uint8Array
  pos = 0

  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer)
    this.bytes = new Uint8Array(buffer)
  }

  get length() {
    return this.bytes.length
  }

  u8() {
    return this.view.getUint8(this.pos++)
  }

  u16() {
    const v = this.view.getUint16(this.pos)
    this.pos += 2
    return v
  }

  u32() {
    const v = this.view.getUint32(this.pos)
    this.pos += 4
    return v
  }

  str(n: number) {
    let s = ''
    for (let i = 0; i < n; i++) s += String.fromCharCode(this.bytes[this.pos + i])
    this.pos += n
    return s
  }

  skip(n: number) {
    this.pos += n
  }

  /** Variable-length quantity (7 bits per byte, high bit = continue) */
  varint() {
    let value = 0
    for (let i = 0; i < 4; i++) {
      const b = this.u8()
      value = (value << 7) | (b & 0x7f)
      if ((b & 0x80) === 0) break
    }
    return value
  }
}

interface TempoEvent {
  tick: number
  usPerQuarter: number
}

interface RawNote {
  midi: number
  channel: number
  track: number
  velocity: number
  startTick: number
  endTick: number
}

/** Builds a tick -> seconds converter from the file's tempo changes. */
function makeTickToSeconds(
  tempos: TempoEvent[],
  ppq: number,
  smpteSecPerTick: number | null
): (tick: number) => number {
  if (smpteSecPerTick !== null) {
    return (tick) => tick * smpteSecPerTick
  }

  const sorted = [...tempos].sort((a, b) => a.tick - b.tick)
  const segments: { tick: number; time: number; secPerTick: number }[] = []

  let usPerQuarter = 500000 // 120bpm default
  let time = 0
  let lastTick = 0

  if (sorted.length === 0 || sorted[0].tick > 0) {
    segments.push({ tick: 0, time: 0, secPerTick: usPerQuarter / 1e6 / ppq })
  }
  for (const t of sorted) {
    const secPerTick = usPerQuarter / 1e6 / ppq
    time += (t.tick - lastTick) * secPerTick
    lastTick = t.tick
    usPerQuarter = t.usPerQuarter
    segments.push({ tick: t.tick, time, secPerTick: usPerQuarter / 1e6 / ppq })
  }

  return (tick) => {
    // last segment starting at or before `tick`
    let lo = 0
    let hi = segments.length - 1
    let idx = 0
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (segments[mid].tick <= tick) {
        idx = mid
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }
    const seg = segments[idx]
    return seg.time + (tick - seg.tick) * seg.secPerTick
  }
}

export function parseMidi(buffer: ArrayBuffer): MidiData {
  const r = new Reader(buffer)

  if (r.str(4) !== 'MThd') throw new Error('Not a MIDI file (missing MThd header)')
  const headerLength = r.u32()
  const headerStart = r.pos
  r.u16() // format — we merge all tracks anyway
  r.u16() // declared track count — we read until EOF instead
  const div0 = r.u8()
  const div1 = r.u8()
  r.pos = headerStart + headerLength

  let ppq = 480
  let smpteSecPerTick: number | null = null
  if (div0 & 0x80) {
    const fps = 256 - div0 // 0xE8 => 24, 0xE7 => 25, ...
    const ticksPerFrame = div1 || 1
    smpteSecPerTick = 1 / (fps * ticksPerFrame)
  } else {
    ppq = ((div0 << 8) | div1) || 480
  }

  const tempos: TempoEvent[] = []
  const rawNotes: RawNote[] = []
  const trackNames = new Map<number, string>()
  let trackIndex = 0

  while (r.pos + 8 <= r.length) {
    const chunkId = r.str(4)
    const chunkLength = r.u32()
    const chunkEnd = Math.min(r.pos + chunkLength, r.length)

    if (chunkId !== 'MTrk') {
      r.pos = chunkEnd
      continue
    }

    const track = trackIndex++
    const pending = new Map<number, RawNote[]>()
    let tick = 0
    let runningStatus = 0

    while (r.pos < chunkEnd) {
      tick += r.varint()
      if (r.pos >= chunkEnd) break

      let status = r.u8()
      if (status < 0x80) {
        // running status: the byte we read is actually data
        r.pos--
        status = runningStatus
        if (!status) break
      } else if (status < 0xf0) {
        runningStatus = status
      }

      const type = status & 0xf0
      const channel = status & 0x0f

      if (type === 0x90 || type === 0x80) {
        const midi = r.u8()
        const velocity = r.u8()
        const key = channel * 128 + midi
        if (type === 0x90 && velocity > 0) {
          const note: RawNote = {
            midi,
            channel,
            track,
            velocity: velocity / 127,
            startTick: tick,
            endTick: tick,
          }
          const list = pending.get(key)
          if (list) list.push(note)
          else pending.set(key, [note])
          rawNotes.push(note)
        } else {
          const list = pending.get(key)
          const note = list?.shift()
          if (note) note.endTick = tick
        }
      } else if (type === 0xa0 || type === 0xb0 || type === 0xe0) {
        r.skip(2)
      } else if (type === 0xc0 || type === 0xd0) {
        r.skip(1)
      } else if (status === 0xff) {
        const metaType = r.u8()
        const len = r.varint()
        const dataStart = r.pos
        if (metaType === 0x51 && len === 3) {
          const usPerQuarter = (r.u8() << 16) | (r.u8() << 8) | r.u8()
          if (usPerQuarter > 0) tempos.push({ tick, usPerQuarter })
        } else if ((metaType === 0x03 || metaType === 0x01) && len > 0 && !trackNames.has(track)) {
          const name = r.str(len).replace(/\0/g, '').trim()
          if (name && metaType === 0x03) trackNames.set(track, name)
        }
        r.pos = dataStart + len
        if (metaType === 0x2f) break // end of track
      } else if (status === 0xf0 || status === 0xf7) {
        const len = r.varint()
        r.skip(len)
      } else {
        // unknown status byte — bail out of this track rather than desync
        break
      }
    }

    // close any notes left hanging at end of track
    for (const list of pending.values()) {
      for (const note of list) if (note.endTick <= note.startTick) note.endTick = tick
    }

    r.pos = chunkEnd
  }

  const tickToSeconds = makeTickToSeconds(tempos, ppq, smpteSecPerTick)

  const notes: MidiNote[] = rawNotes.map((n) => {
    const time = tickToSeconds(n.startTick)
    const end = tickToSeconds(Math.max(n.endTick, n.startTick + 1))
    return {
      midi: n.midi,
      time,
      duration: Math.max(end - time, 0.02),
      velocity: n.velocity,
      track: n.track,
      channel: n.channel,
    }
  })
  notes.sort((a, b) => a.time - b.time || a.midi - b.midi)

  // Renumber tracks so only note-bearing chunks count, in file order: a type-1
  // file usually keeps tempo on chunk 0 and the hands on 1 and 2, and callers
  // want the first hand to be track 0.
  const chunkOrder = [...new Set(rawNotes.map((n) => n.track))].sort((a, b) => a - b)
  const remap = new Map(chunkOrder.map((chunk, i) => [chunk, i]))

  const byTrack = new Map<number, MidiTrackInfo>()
  for (const n of notes) {
    const chunk = n.track
    n.track = remap.get(chunk) ?? 0
    let info = byTrack.get(n.track)
    if (!info) {
      info = {
        index: n.track,
        name: trackNames.get(chunk),
        noteCount: 0,
        lowNote: n.midi,
        highNote: n.midi,
      }
      byTrack.set(n.track, info)
    }
    info.noteCount++
    info.lowNote = Math.min(info.lowNote, n.midi)
    info.highNote = Math.max(info.highNote, n.midi)
  }

  const duration = notes.reduce((max, n) => Math.max(max, n.time + n.duration), 0)

  return {
    notes,
    duration,
    ppq: smpteSecPerTick !== null ? 0 : ppq,
    tracks: [...byTrack.values()].sort((a, b) => a.index - b.index),
  }
}

/**
 * Pulls the standard MIDI file out of a GarageBand software-instrument Apple Loop.
 *
 * GarageBand has no MIDI export, but "Add to Loop Library" on a green region
 * writes an AIFF that carries the performance in a `.mid` chunk alongside the
 * rendered audio. Chunks are walked through Blob slices so a long loop never
 * has to be read into memory whole (the audio can be hundreds of MB).
 *
 * Returns null if the file isn't AIFF or holds no MIDI (e.g. an audio loop).
 */
export async function extractMidiFromAppleLoop(file: Blob): Promise<ArrayBuffer | null> {
  if (file.size < 12) return null

  const tag = (view: DataView, offset: number) =>
    String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3)
    )

  const header = new DataView(await file.slice(0, 12).arrayBuffer())
  if (tag(header, 0) !== 'FORM') return null
  const form = tag(header, 8)
  if (form !== 'AIFF' && form !== 'AIFC') return null

  let pos = 12
  while (pos + 8 <= file.size) {
    const chunk = new DataView(await file.slice(pos, pos + 8).arrayBuffer())
    const id = tag(chunk, 0)
    const size = chunk.getUint32(4)
    const dataStart = pos + 8

    if (id === '.mid') {
      const data = await file.slice(dataStart, Math.min(dataStart + size, file.size)).arrayBuffer()
      // must actually be a standard MIDI file ('MThd')
      if (data.byteLength > 8 && new DataView(data).getUint32(0) === 0x4d546864) return data
      return null
    }

    pos = dataStart + size + (size % 2) // chunks are word-aligned
  }
  return null
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

export function midiToName(midi: number): string {
  return `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`
}

export function isBlackKey(midi: number): boolean {
  return [1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12)
}
