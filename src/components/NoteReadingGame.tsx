import { useState, useEffect, useCallback, useRef } from 'react'
import { Settings, X } from 'lucide-react'

const whiteKeys = ['C', 'D', 'E', 'F', 'G', 'A', 'B'] as const
const blackKeys = [
  { note: 'C#', position: 0 },
  { note: 'D#', position: 1 },
  { note: 'F#', position: 3 },
  { note: 'G#', position: 4 },
  { note: 'A#', position: 5 },
] as const

// Full range notes for each clef (3 ledger lines above and below)
const trebleNotes = [
  { note: 'F', octave: 3 },
  { note: 'G', octave: 3 },
  { note: 'A', octave: 3 },
  { note: 'B', octave: 3 },
  { note: 'C', octave: 4 },
  { note: 'D', octave: 4 },
  { note: 'E', octave: 4 },
  { note: 'F', octave: 4 },
  { note: 'G', octave: 4 },
  { note: 'A', octave: 4 },
  { note: 'B', octave: 4 },
  { note: 'C', octave: 5 },
  { note: 'D', octave: 5 },
  { note: 'E', octave: 5 },
  { note: 'F', octave: 5 },
  { note: 'G', octave: 5 },
  { note: 'A', octave: 5 },
  { note: 'B', octave: 5 },
  { note: 'C', octave: 6 },
] as const

const bassNotes = [
  { note: 'A', octave: 1 },
  { note: 'B', octave: 1 },
  { note: 'C', octave: 2 },
  { note: 'D', octave: 2 },
  { note: 'E', octave: 2 },
  { note: 'F', octave: 2 },
  { note: 'G', octave: 2 },
  { note: 'A', octave: 2 },
  { note: 'B', octave: 2 },
  { note: 'C', octave: 3 },
  { note: 'D', octave: 3 },
  { note: 'E', octave: 3 },
  { note: 'F', octave: 3 },
  { note: 'G', octave: 3 },
  { note: 'A', octave: 3 },
  { note: 'B', octave: 3 },
  { note: 'C', octave: 4 },
  { note: 'D', octave: 4 },
  { note: 'E', octave: 4 },
  { note: 'F', octave: 4 },
] as const

// Convert any MIDI note number to note name (works for all octaves)
const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const getMidiNoteName = (midiNote: number): string => noteNames[midiNote % 12]

// Notes that can have accidentals (not E/F or B/C - no black key between them)
const canHaveSharp = (note: string) => ['C', 'D', 'F', 'G', 'A'].includes(note)
const canHaveFlat = (note: string) => ['D', 'E', 'G', 'A', 'B'].includes(note)

// Chord types
type ChordType = 'major' | 'minor'
type Inversion = 0 | 1 | 2 // 0 = root, 1 = 1st inversion, 2 = 2nd inversion

interface ChordNote {
  note: string
  octave: number
}

interface Chord {
  root: string
  type: ChordType
  inversion: Inversion
  notes: ChordNote[] // The 3 notes to play (in order from bottom to top on staff)
  name: string // e.g., "C Major", "A Minor"
}

// All possible root notes for chords (white keys only for simplicity)
const chordRoots = ['C', 'D', 'E', 'F', 'G', 'A', 'B']

// Get note index (0-11) from note name (handles both sharps and flats)
const getNoteIndex = (note: string): number => {
  const map: Record<string, number> = {
    'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5,
    'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11
  }
  return map[note] ?? 0
}

// Convert note name + octave to MIDI note number
const noteToMidi = (note: string, octave: number): number => {
  const noteIndex = getNoteIndex(note)
  return (octave + 1) * 12 + noteIndex
}

// Letter names and their chromatic pitches
const letterNames = ['C', 'D', 'E', 'F', 'G', 'A', 'B']
const letterToPitch: Record<string, number> = {
  'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11
}

// Get proper spelling for a note given the target letter and pitch
const getSpelling = (letter: string, targetPitch: number): string => {
  const naturalPitch = letterToPitch[letter]
  const diff = ((targetPitch - naturalPitch) + 12) % 12
  if (diff === 0) return letter
  if (diff === 1) return letter + '#'
  if (diff === 11) return letter + 'b'
  return letter // fallback
}

// Calculate chord notes with proper enharmonic spelling
// Uses music theory: root, 3rd (2 letters up), 5th (4 letters up)
const calculateChordNotes = (root: string, type: ChordType, inversion: Inversion, baseOctave: number): ChordNote[] => {
  const rootLetterIndex = letterNames.indexOf(root)
  const rootPitch = letterToPitch[root]

  // Calculate letter names (each chord tone is 2 letters apart)
  const thirdLetterIndex = (rootLetterIndex + 2) % 7
  const fifthLetterIndex = (rootLetterIndex + 4) % 7

  const thirdLetter = letterNames[thirdLetterIndex]
  const fifthLetter = letterNames[fifthLetterIndex]

  // Calculate target pitches
  const thirdInterval = type === 'major' ? 4 : 3
  const thirdPitch = (rootPitch + thirdInterval) % 12
  const fifthPitch = (rootPitch + 7) % 12

  // Get proper spellings
  const rootNote = root
  const thirdNote = getSpelling(thirdLetter, thirdPitch)
  const fifthNote = getSpelling(fifthLetter, fifthPitch)

  // Calculate octave offsets (does the note wrap to the next octave?)
  const thirdOctaveOffset = (rootPitch + thirdInterval) >= 12 ? 1 :
    (letterToPitch[thirdLetter] < rootPitch && thirdPitch >= rootPitch) ? 0 :
    (thirdLetterIndex < rootLetterIndex) ? 1 : 0
  const fifthOctaveOffset = (rootPitch + 7) >= 12 ? 1 :
    (fifthLetterIndex < rootLetterIndex) ? 1 : 0

  // Build root position chord
  let chordNotes: { note: string; octaveOffset: number }[] = [
    { note: rootNote, octaveOffset: 0 },
    { note: thirdNote, octaveOffset: thirdOctaveOffset },
    { note: fifthNote, octaveOffset: fifthOctaveOffset },
  ]

  // Apply inversion by moving bottom notes up an octave
  if (inversion === 1) {
    chordNotes[0].octaveOffset += 1
  } else if (inversion === 2) {
    chordNotes[0].octaveOffset += 1
    chordNotes[1].octaveOffset += 1
  }

  // Sort by pitch (octave * 12 + pitch)
  chordNotes.sort((a, b) => {
    const aPitch = a.octaveOffset * 12 + getNoteIndex(a.note)
    const bPitch = b.octaveOffset * 12 + getNoteIndex(b.note)
    return aPitch - bPitch
  })

  return chordNotes.map(n => ({
    note: n.note,
    octave: baseOctave + n.octaveOffset
  }))
}

export function NoteReadingGame() {
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [currentNote, setCurrentNote] = useState<{ note: string; octave: number; accidental?: 'sharp' | 'flat' }>({ note: 'G', octave: 2 })
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null)
  const [streak, setStreak] = useState(0)
  const [displayClef, setDisplayClef] = useState<'treble' | 'bass'>('bass')
  const [midiConnected, setMidiConnected] = useState<boolean | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [accidentalMode, setAccidentalMode] = useState<'off' | 'on' | 'only'>('on') // 'on' = mixed (default)
  const [clef, setClef] = useState<'treble' | 'bass' | 'both'>('both')

  // Chord mode (only available with MIDI)
  const [chordMode, setChordMode] = useState(false)
  const [showChordName, setShowChordName] = useState(true)
  const [currentChord, setCurrentChord] = useState<Chord | null>(null)
  const [pressedChordNotes, setPressedChordNotes] = useState<Set<number>>(new Set()) // MIDI note numbers

  // Ref to track previous note for avoiding duplicates
  const prevNoteRef = useRef<{ note: string; octave: number }>({ note: 'G', octave: 2 })
  // Ref to track cooldown period after answer (prevents held keys from triggering)
  const cooldownRef = useRef(false)
  // Ref to always have access to latest currentNote (fixes stale closure in MIDI handler)
  const currentNoteRef = useRef(currentNote)
  currentNoteRef.current = currentNote

  const lineSpacing = 24
  const staffHeight = lineSpacing * 4
  const paddingY = 90
  const paddingX = 40
  const staffWidth = 700
  const svgWidth = staffWidth + paddingX * 2
  const svgHeight = staffHeight + paddingY * 2

  // Piano dimensions
  const pianoWidth = svgWidth
  const whiteKeyWidth = pianoWidth / 7
  const whiteKeyHeight = 250
  const blackKeyWidth = whiteKeyWidth * 0.6
  const blackKeyHeight = whiteKeyHeight * 0.6

  // Note positions on staff (position 0 = top line, each step down = +0.5)
  // Extended range to support chord inversions (added higher notes)
  const treblePositions: Record<string, number> = {
    // Above staff (ledger lines)
    'G6': -4, 'F6': -3.5, 'E6': -3, 'D6': -2.5,
    'C6': -2, 'B5': -1.5, 'A5': -1, 'G5': -0.5,
    // On staff
    'F5': 0, 'E5': 0.5, 'D5': 1, 'C5': 1.5,
    'B4': 2, 'A4': 2.5, 'G4': 3, 'F4': 3.5,
    'E4': 4,
    // Below staff (ledger lines)
    'D4': 4.5, 'C4': 5, 'B3': 5.5, 'A3': 6, 'G3': 6.5, 'F3': 7,
  }

  const bassPositions: Record<string, number> = {
    // Above staff (ledger lines) - extended for chord inversions
    'A4': -3.5, 'G4': -3, 'F4': -2.5, 'E4': -2, 'D4': -1.5, 'C4': -1, 'B3': -0.5,
    // On staff
    'A3': 0, 'G3': 0.5, 'F3': 1, 'E3': 1.5,
    'D3': 2, 'C3': 2.5, 'B2': 3, 'A2': 3.5,
    'G2': 4,
    // Below staff (ledger lines)
    'F2': 4.5, 'E2': 5, 'D2': 5.5, 'C2': 6, 'B1': 6.5, 'A1': 7,
  }

  const notePositions = displayClef === 'treble' ? treblePositions : bassPositions

  // Calculate which ledger lines are needed for a given position
  const getLedgerLines = (position: number): number[] => {
    const ledgerLines: number[] = []
    if (position >= 5) {
      for (let p = 5; p <= Math.floor(position); p++) {
        ledgerLines.push(p)
      }
    } else if (position <= -1) {
      for (let p = -1; p >= Math.ceil(position); p--) {
        if (p % 1 === 0) ledgerLines.push(p)
      }
      if (position % 1 === 0 && !ledgerLines.includes(position)) {
        ledgerLines.push(position)
      }
    }
    return ledgerLines
  }

  const getNoteY = (note: string, octave: number) => {
    const key = `${note}${octave}`
    const position = notePositions[key] ?? 2
    return paddingY + position * lineSpacing
  }

  // Generate a new random note
  const generateNewNote = useCallback(() => {
    // Select clef based on setting
    let selectedClef: 'treble' | 'bass'
    if (clef === 'both') {
      selectedClef = Math.random() < 0.5 ? 'treble' : 'bass'
    } else {
      selectedClef = clef
    }
    setDisplayClef(selectedClef)

    const notes = selectedClef === 'treble' ? trebleNotes : bassNotes

    // Pick a random note, avoiding the previous one
    let newNote: { note: string; octave: number }
    do {
      const randomIndex = Math.floor(Math.random() * notes.length)
      newNote = notes[randomIndex]
    } while (
      newNote.note === prevNoteRef.current.note &&
      newNote.octave === prevNoteRef.current.octave
    )

    // Maybe add accidental based on mode
    let accidental: 'sharp' | 'flat' | undefined
    const canSharp = canHaveSharp(newNote.note)
    const canFlat = canHaveFlat(newNote.note)

    if (accidentalMode === 'only') {
      // Must have accidental
      if (!canSharp && !canFlat) {
        // Try again with a different note that can have accidentals
        const filteredNotes = notes.filter(n => canHaveSharp(n.note) || canHaveFlat(n.note))
        if (filteredNotes.length > 0) {
          const idx = Math.floor(Math.random() * filteredNotes.length)
          newNote = filteredNotes[idx]
          if (canHaveSharp(newNote.note) && canHaveFlat(newNote.note)) {
            accidental = Math.random() < 0.5 ? 'sharp' : 'flat'
          } else if (canHaveSharp(newNote.note)) {
            accidental = 'sharp'
          } else {
            accidental = 'flat'
          }
        }
      } else {
        if (canSharp && canFlat) {
          accidental = Math.random() < 0.5 ? 'sharp' : 'flat'
        } else if (canSharp) {
          accidental = 'sharp'
        } else {
          accidental = 'flat'
        }
      }
    } else if (accidentalMode === 'on' && Math.random() < 0.3) {
      // Mixed mode: 30% chance of accidental
      if (canSharp && canFlat) {
        accidental = Math.random() < 0.5 ? 'sharp' : 'flat'
      } else if (canSharp) {
        accidental = 'sharp'
      } else if (canFlat) {
        accidental = 'flat'
      }
    }

    prevNoteRef.current = { note: newNote.note, octave: newNote.octave }
    setCurrentNote({ note: newNote.note, octave: newNote.octave, accidental })
  }, [accidentalMode, clef])

  // Generate a new random chord
  const generateNewChord = useCallback(() => {
    // Select clef
    let selectedClef: 'treble' | 'bass'
    if (clef === 'both') {
      selectedClef = Math.random() < 0.5 ? 'treble' : 'bass'
    } else {
      selectedClef = clef
    }
    setDisplayClef(selectedClef)

    // Pick random root, type, and inversion
    const root = chordRoots[Math.floor(Math.random() * chordRoots.length)]
    const type: ChordType = Math.random() < 0.5 ? 'major' : 'minor'
    const inversion: Inversion = Math.floor(Math.random() * 3) as Inversion

    // Base octave depends on clef (to keep chord in comfortable range)
    const baseOctave = selectedClef === 'treble' ? 4 : 2

    const notes = calculateChordNotes(root, type, inversion, baseOctave)
    const inversionNames = ['', ' (1st inv)', ' (2nd inv)']
    const name = `${root} ${type === 'major' ? 'Major' : 'Minor'}${inversionNames[inversion]}`

    setCurrentChord({ root, type, inversion, notes, name })
    setPressedChordNotes(new Set())
  }, [clef])

  // Ref for current chord (to avoid stale closure)
  const currentChordRef = useRef(currentChord)
  currentChordRef.current = currentChord

  // Initialize with a random note or chord
  useEffect(() => {
    if (chordMode) {
      generateNewChord()
    } else {
      generateNewNote()
    }
  }, [generateNewNote, generateNewChord, chordMode])

  // Ref for chord mode to avoid stale closures
  const chordModeRef = useRef(chordMode)
  chordModeRef.current = chordMode

  // Handle single note mode
  const handleSingleNote = useCallback((pressedNote: string) => {
    if (cooldownRef.current) return

    setActiveKey(pressedNote)

    // Use ref to get latest note (avoids stale closure issue with MIDI)
    const note = currentNoteRef.current

    // Calculate expected key
    let expectedKey = note.note
    if (note.accidental === 'sharp') {
      expectedKey = `${note.note}#`
    } else if (note.accidental === 'flat') {
      const flatToSharp: Record<string, string> = {
        'D': 'C#', 'E': 'D#', 'G': 'F#', 'A': 'G#', 'B': 'A#'
      }
      expectedKey = flatToSharp[note.note] || note.note
    }

    const correct = pressedNote === expectedKey
    setIsCorrect(correct)

    if (correct) {
      setStreak(prev => prev + 1)
      cooldownRef.current = true
      setTimeout(() => {
        generateNewNote()
        setActiveKey(null)
        setIsCorrect(null)
      }, 200)
      setTimeout(() => {
        cooldownRef.current = false
      }, 350)
    } else {
      setStreak(0)
      cooldownRef.current = true
      setTimeout(() => {
        setActiveKey(null)
        setIsCorrect(null)
        cooldownRef.current = false
      }, 300)
    }
  }, [generateNewNote])

  // Handle chord note press (MIDI only) - uses MIDI note number for octave accuracy
  const handleChordNoteOn = useCallback((midiNoteNumber: number) => {
    if (cooldownRef.current) return

    const chord = currentChordRef.current
    if (!chord) return

    // Add to pressed notes (using MIDI note number)
    setPressedChordNotes(prev => {
      const newSet = new Set(prev)
      newSet.add(midiNoteNumber)

      // Check if all chord notes are pressed with correct octaves
      const expectedMidiNotes = chord.notes.map(n => noteToMidi(n.note, n.octave))
      const allPressed = expectedMidiNotes.every(midi => newSet.has(midi))

      if (allPressed) {
        // Correct! All notes pressed in correct octaves
        setIsCorrect(true)
        setStreak(s => s + 1)
        cooldownRef.current = true
        setTimeout(() => {
          generateNewChord()
          setIsCorrect(null)
          setPressedChordNotes(new Set())
        }, 300)
        setTimeout(() => {
          cooldownRef.current = false
        }, 450)
      }

      return newSet
    })
  }, [generateNewChord])

  // Handle chord note release (MIDI only)
  const handleChordNoteOff = useCallback((midiNoteNumber: number) => {
    setPressedChordNotes(prev => {
      const newSet = new Set(prev)
      newSet.delete(midiNoteNumber)
      return newSet
    })
  }, [])

  // Combined handler for keyboard clicks (single note mode only)
  const handleKeyClick = useCallback((pressedNote: string) => {
    if (chordModeRef.current) {
      // Chord mode uses MIDI handlers directly
      return
    }
    handleSingleNote(pressedNote)
  }, [handleSingleNote])

  // Keyboard support
  useEffect(() => {
    const keyMap: Record<string, string> = {
      'a': 'C', 's': 'D', 'd': 'E', 'f': 'F',
      'g': 'G', 'h': 'A', 'j': 'B',
      'c': 'C', 'e': 'E', 'b': 'B',
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      const note = keyMap[e.key.toLowerCase()]
      if (note && !e.repeat) {
        handleKeyClick(note)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyClick])

  // MIDI support
  useEffect(() => {
    if (!navigator.requestMIDIAccess) {
      setMidiConnected(false)
      return
    }

    let midiAccess: MIDIAccess | null = null

    const handleMidiMessage = (event: MIDIMessageEvent) => {
      const [status, noteNumber, velocity] = event.data as Uint8Array
      const noteName = getMidiNoteName(noteNumber)

      // Note on (status 144-159 with velocity > 0)
      if (status >= 144 && status <= 159 && velocity > 0) {
        if (chordModeRef.current) {
          // Pass full MIDI note number for chord mode (octave matters)
          handleChordNoteOn(noteNumber)
        } else {
          // Pass just note name for single note mode (octave doesn't matter)
          handleSingleNote(noteName)
        }
      }
      // Note off (status 128-143, or status 144-159 with velocity 0)
      else if (status >= 128 && status <= 143 || (status >= 144 && status <= 159 && velocity === 0)) {
        if (chordModeRef.current) {
          handleChordNoteOff(noteNumber)
        }
      }
    }

    const setupMidiInputs = (access: MIDIAccess) => {
      const inputs = Array.from(access.inputs.values())
      setMidiConnected(inputs.length > 0)

      for (const input of inputs) {
        input.onmidimessage = handleMidiMessage
      }
    }

    navigator.requestMIDIAccess()
      .then((access) => {
        midiAccess = access
        setupMidiInputs(access)
        access.onstatechange = () => setupMidiInputs(access)
      })
      .catch(() => {
        setMidiConnected(false)
      })

    return () => {
      if (midiAccess) {
        for (const input of midiAccess.inputs.values()) {
          input.onmidimessage = null
        }
      }
    }
  }, [handleSingleNote, handleChordNoteOn, handleChordNoteOff])

  const noteY = getNoteY(currentNote.note, currentNote.octave)
  const noteX = svgWidth / 2

  const noteKey = `${currentNote.note}${currentNote.octave}`
  const notePosition = notePositions[noteKey] ?? 2
  const ledgerLines = getLedgerLines(notePosition)

  // Calculate chord note positions and ledger lines
  const chordNoteData = currentChord?.notes.map(n => {
    // Parse note - could be 'C', 'C#', or 'Db'
    const hasSharp = n.note.includes('#')
    const hasFlat = n.note.includes('b')
    const baseNote = hasSharp ? n.note.replace('#', '') : hasFlat ? n.note.replace('b', '') : n.note

    // Use base note for position lookup (C# is at C position, Db is at D position)
    const key = `${baseNote}${n.octave}`
    const pos = notePositions[key] ?? 2

    // Calculate MIDI note number for this chord note
    const midiNote = noteToMidi(n.note, n.octave)

    return {
      note: n.note,           // Full note name (e.g., 'C#' or 'Ab')
      baseNote: baseNote,     // Base note for position (e.g., 'C' or 'A')
      hasSharp: hasSharp,
      hasFlat: hasFlat,
      octave: n.octave,
      y: paddingY + pos * lineSpacing,
      position: pos,
      ledgerLines: getLedgerLines(pos),
      isPressed: pressedChordNotes.has(midiNote)  // Check by MIDI note number
    }
  }) || []

  // Combine all ledger lines from chord notes (deduplicated)
  const allChordLedgerLines = [...new Set(chordNoteData.flatMap(n => n.ledgerLines))]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Note Reading</h2>
        <div className="flex items-center gap-3">
          {/* MIDI Status Indicator */}
          {midiConnected !== null && (
            <div className={`flex items-center gap-1.5 text-xs ${midiConnected ? 'text-green-500' : 'text-zinc-500'}`}>
              <div className={`w-2 h-2 rounded-full ${midiConnected ? 'bg-green-500' : 'bg-zinc-600'}`} />
              {midiConnected ? 'MIDI' : 'No MIDI'}
            </div>
          )}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <Settings size={20} />
          </button>
        </div>
      </div>

      <div className="relative flex flex-col items-center gap-6">
        {/* Streak counter - positioned absolutely */}
        <div className="absolute left-0 top-0 flex flex-col items-center">
          <span className={`text-orange-500 font-bold text-3xl ${streak > 0 ? '' : 'opacity-30'}`}>
            {streak}
          </span>
          <span className="text-zinc-500 text-xs uppercase tracking-wide">Streak</span>
          {/* Show chord name or note answer */}
          {chordMode && currentChord && showChordName ? (
            <div className="text-xs mt-4 text-center">
              <div className="text-zinc-400">{currentChord.name}</div>
              <div className="text-zinc-600 mt-1">
                {currentChord.notes.map(n => `${n.note}${n.octave}`).join(' - ')}
              </div>
              {pressedChordNotes.size > 0 && (
                <div className="text-zinc-500 mt-1">
                  Pressed: {Array.from(pressedChordNotes).map(midi => {
                    const noteName = getMidiNoteName(midi)
                    const octave = Math.floor(midi / 12) - 1
                    return `${noteName}${octave}`
                  }).join(' - ')}
                </div>
              )}
            </div>
          ) : !chordMode && (
            <span className="text-zinc-600 text-xs mt-4">
              Answer: {currentNote.note}{currentNote.accidental === 'sharp' ? '#' : currentNote.accidental === 'flat' ? 'b' : ''}
            </span>
          )}
        </div>

        {/* Staff */}
        <div className="bg-white rounded-xl p-8">
            <svg
              width={svgWidth}
              height={svgHeight}
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            >
              {/* Staff lines */}
              {[0, 1, 2, 3, 4].map((i) => (
                <line
                  key={i}
                  x1={paddingX}
                  y1={paddingY + i * lineSpacing}
                  x2={svgWidth - paddingX}
                  y2={paddingY + i * lineSpacing}
                  stroke="#222"
                  strokeWidth="1.5"
                />
              ))}

              {/* Clef */}
              <text
                x={paddingX}
                y={paddingY + lineSpacing * (displayClef === 'treble' ? 5 : 3.55)}
                fontSize={lineSpacing * (displayClef === 'treble' ? 10.5 : 5.7)}
                fontFamily="Bravura, Leland, serif"
                fill="#222"
                style={{ fontWeight: displayClef === 'bass' ? 300 : 400 }}
              >
                {displayClef === 'treble' ? '𝄞' : '𝄢'}
              </text>

              {/* Ledger lines - single note mode */}
              {!chordMode && ledgerLines.map((pos) => (
                <line
                  key={pos}
                  x1={noteX - 22}
                  y1={paddingY + pos * lineSpacing}
                  x2={noteX + 22}
                  y2={paddingY + pos * lineSpacing}
                  stroke="#222"
                  strokeWidth="1.5"
                />
              ))}

              {/* Ledger lines - chord mode */}
              {chordMode && allChordLedgerLines.map((pos) => (
                <line
                  key={pos}
                  x1={noteX - 22}
                  y1={paddingY + pos * lineSpacing}
                  x2={noteX + 22}
                  y2={paddingY + pos * lineSpacing}
                  stroke="#222"
                  strokeWidth="1.5"
                />
              ))}

              {/* Single note mode */}
              {!chordMode && (
                <>
                  {/* Accidental symbol */}
                  {currentNote.accidental === 'sharp' && (
                    <text
                      x={noteX - 40}
                      y={noteY + 14}
                      fontSize={42}
                      fontFamily="Bravura, Leland, serif"
                      fill="#222"
                    >
                      ♯
                    </text>
                  )}
                  {currentNote.accidental === 'flat' && (
                    <text
                      x={noteX - 50}
                      y={noteY + 10}
                      fontSize={44}
                      fontFamily="Bravura, Leland, serif"
                      fill="#222"
                    >
                      ♭
                    </text>
                  )}

                  {/* The Note (whole note) */}
                  <g transform={`rotate(-20 ${noteX} ${noteY})`}>
                    <ellipse
                      cx={noteX}
                      cy={noteY}
                      rx={14}
                      ry={10}
                      fill="#222"
                    />
                    <ellipse
                      cx={noteX}
                      cy={noteY}
                      rx={8}
                      ry={5}
                      fill="white"
                      transform={`rotate(40 ${noteX} ${noteY})`}
                    />
                  </g>
                </>
              )}

              {/* Chord mode - render all 3 notes */}
              {chordMode && chordNoteData.map((chordNote, idx) => (
                <g key={idx}>
                  {/* Sharp symbol (not rotated) */}
                  {chordNote.hasSharp && (
                    <text
                      x={noteX - 40}
                      y={chordNote.y + 14}
                      fontSize={42}
                      fontFamily="Bravura, Leland, serif"
                      fill="#222"
                    >
                      ♯
                    </text>
                  )}
                  {/* Flat symbol (not rotated) */}
                  {chordNote.hasFlat && (
                    <text
                      x={noteX - 50}
                      y={chordNote.y + 10}
                      fontSize={44}
                      fontFamily="Bravura, Leland, serif"
                      fill="#222"
                    >
                      ♭
                    </text>
                  )}
                  {/* Note (rotated) */}
                  <g transform={`rotate(-20 ${noteX} ${chordNote.y})`}>
                    <ellipse
                      cx={noteX}
                      cy={chordNote.y}
                      rx={14}
                      ry={10}
                      fill={chordNote.isPressed ? '#22c55e' : '#222'}
                    />
                    <ellipse
                      cx={noteX}
                      cy={chordNote.y}
                      rx={8}
                      ry={5}
                      fill="white"
                      transform={`rotate(40 ${noteX} ${chordNote.y})`}
                    />
                  </g>
                </g>
              ))}
            </svg>
          </div>

        {/* Piano Keyboard */}
        <div
          className="relative rounded-lg overflow-hidden"
          style={{ width: pianoWidth, height: whiteKeyHeight }}
        >
          {/* White Keys */}
          <div className="flex h-full">
            {whiteKeys.map((note) => (
              <button
                key={note}
                onClick={() => handleKeyClick(note)}
                className={`
                  flex-1 border border-zinc-300 rounded-b-md
                  flex items-end justify-center pb-3
                  font-medium text-zinc-400 text-sm
                  transition-colors
                  ${activeKey === note && isCorrect === true
                    ? 'bg-green-400 border-green-500'
                    : activeKey === note && isCorrect === false
                    ? 'bg-red-300 border-red-400'
                    : 'bg-white hover:bg-zinc-100'
                  }
                `}
              >
              </button>
            ))}
          </div>

          {/* Black Keys */}
          {blackKeys.map(({ note, position }) => (
            <button
              key={note}
              onClick={() => handleKeyClick(note)}
              className={`
                absolute top-0 rounded-b-md
                flex items-end justify-center pb-2
                font-medium text-zinc-500 text-xs
                transition-colors
                ${activeKey === note && isCorrect === true
                  ? 'bg-green-600'
                  : activeKey === note && isCorrect === false
                  ? 'bg-red-600'
                  : 'bg-zinc-900 hover:bg-zinc-800'
                }
              `}
              style={{
                left: (position + 1) * whiteKeyWidth - blackKeyWidth / 2,
                width: blackKeyWidth,
                height: blackKeyHeight,
              }}
            >
            </button>
          ))}
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowSettings(false)}
          />

          {/* Modal */}
          <div className="relative bg-zinc-900 rounded-xl w-full max-w-sm mx-4 border border-zinc-800">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-zinc-800">
              <h2 className="text-lg font-semibold">Settings</h2>
              <button
                onClick={() => setShowSettings(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="p-4 space-y-5">
              {/* Clef selection */}
              <div>
                <p className="text-sm text-zinc-400 mb-3">Clef</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setClef('treble')}
                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      clef === 'treble'
                        ? 'bg-white text-black'
                        : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                    }`}
                  >
                    Treble
                  </button>
                  <button
                    onClick={() => setClef('bass')}
                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      clef === 'bass'
                        ? 'bg-white text-black'
                        : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                    }`}
                  >
                    Bass
                  </button>
                  <button
                    onClick={() => setClef('both')}
                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      clef === 'both'
                        ? 'bg-white text-black'
                        : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                    }`}
                  >
                    Both
                  </button>
                </div>
              </div>

              {/* Accidentals toggle */}
              <div>
                <p className="text-sm text-zinc-400 mb-3">Accidentals</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setAccidentalMode('off')}
                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      accidentalMode === 'off'
                        ? 'bg-white text-black'
                        : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                    }`}
                  >
                    Off
                  </button>
                  <button
                    onClick={() => setAccidentalMode('on')}
                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      accidentalMode === 'on'
                        ? 'bg-white text-black'
                        : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                    }`}
                  >
                    Mixed
                  </button>
                  <button
                    onClick={() => setAccidentalMode('only')}
                    className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      accidentalMode === 'only'
                        ? 'bg-white text-black'
                        : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                    }`}
                  >
                    Only
                  </button>
                </div>
              </div>

              {/* Chord Mode - only available with MIDI */}
              {midiConnected && (
                <>
                  <div className="border-t border-zinc-800 pt-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-zinc-200">Chord Mode</p>
                        <p className="text-xs text-zinc-500">Practice triads (MIDI only)</p>
                      </div>
                      <button
                        onClick={() => setChordMode(!chordMode)}
                        className={`w-12 h-6 rounded-full transition-colors ${
                          chordMode ? 'bg-green-500' : 'bg-zinc-700'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-full bg-white transition-transform ${
                          chordMode ? 'translate-x-6' : 'translate-x-0.5'
                        }`} />
                      </button>
                    </div>
                  </div>

                  {chordMode && (
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-zinc-200">Show Chord Name</p>
                      </div>
                      <button
                        onClick={() => setShowChordName(!showChordName)}
                        className={`w-12 h-6 rounded-full transition-colors ${
                          showChordName ? 'bg-green-500' : 'bg-zinc-700'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-full bg-white transition-transform ${
                          showChordName ? 'translate-x-6' : 'translate-x-0.5'
                        }`} />
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
