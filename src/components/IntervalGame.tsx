import { useState, useEffect, useCallback, useRef } from 'react'
import { Settings, X } from 'lucide-react'

// Interval definitions with semitone count
const intervals = [
  { name: 'Minor 2nd', short: 'm2', semitones: 1 },
  { name: 'Major 2nd', short: 'M2', semitones: 2 },
  { name: 'Minor 3rd', short: 'm3', semitones: 3 },
  { name: 'Major 3rd', short: 'M3', semitones: 4 },
  { name: 'Perfect 4th', short: 'P4', semitones: 5 },
  { name: 'Tritone', short: 'TT', semitones: 6 },
  { name: 'Perfect 5th', short: 'P5', semitones: 7 },
  { name: 'Minor 6th', short: 'm6', semitones: 8 },
  { name: 'Major 6th', short: 'M6', semitones: 9 },
  { name: 'Minor 7th', short: 'm7', semitones: 10 },
  { name: 'Major 7th', short: 'M7', semitones: 11 },
  { name: 'Octave', short: 'P8', semitones: 12 },
]

// Notes and their semitone values
const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const naturalNotes = ['C', 'D', 'E', 'F', 'G', 'A', 'B']

// Get note index (0-11) from note name
const getNoteIndex = (note: string): number => {
  const map: Record<string, number> = {
    'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5,
    'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11
  }
  return map[note] ?? 0
}

// Full range notes for each clef
const trebleNotes = [
  { note: 'C', octave: 4 }, { note: 'D', octave: 4 }, { note: 'E', octave: 4 },
  { note: 'F', octave: 4 }, { note: 'G', octave: 4 }, { note: 'A', octave: 4 },
  { note: 'B', octave: 4 }, { note: 'C', octave: 5 }, { note: 'D', octave: 5 },
  { note: 'E', octave: 5 }, { note: 'F', octave: 5 }, { note: 'G', octave: 5 },
]

const bassNotes = [
  { note: 'C', octave: 2 }, { note: 'D', octave: 2 }, { note: 'E', octave: 2 },
  { note: 'F', octave: 2 }, { note: 'G', octave: 2 }, { note: 'A', octave: 2 },
  { note: 'B', octave: 2 }, { note: 'C', octave: 3 }, { note: 'D', octave: 3 },
  { note: 'E', octave: 3 }, { note: 'F', octave: 3 }, { note: 'G', octave: 3 },
]

export function IntervalGame() {
  const [bottomNote, setBottomNote] = useState<{ note: string; octave: number }>({ note: 'C', octave: 4 })
  const [topNote, setTopNote] = useState<{ note: string; octave: number }>({ note: 'E', octave: 4 })
  const [currentInterval, setCurrentInterval] = useState(4) // semitones
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null)
  const [streak, setStreak] = useState(0)
  const [displayClef, setDisplayClef] = useState<'treble' | 'bass'>('treble')
  const [showSettings, setShowSettings] = useState(false)
  const [clef, setClef] = useState<'treble' | 'bass' | 'both'>('treble')
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null)
  const [direction, setDirection] = useState<'ascending' | 'descending' | 'both'>('ascending')

  // Enabled intervals (all enabled by default)
  const [enabledIntervals, setEnabledIntervals] = useState<Set<number>>(
    new Set(intervals.map(i => i.semitones))
  )

  const cooldownRef = useRef(false)

  const lineSpacing = 24
  const staffHeight = lineSpacing * 4
  const paddingY = 90
  const paddingX = 40
  const staffWidth = 700
  const svgWidth = staffWidth + paddingX * 2
  const svgHeight = staffHeight + paddingY * 2

  // Note positions on staff
  const treblePositions: Record<string, number> = {
    'G6': -4, 'F6': -3.5, 'E6': -3, 'D6': -2.5, 'C6': -2, 'B5': -1.5, 'A5': -1, 'G5': -0.5,
    'F5': 0, 'E5': 0.5, 'D5': 1, 'C5': 1.5, 'B4': 2, 'A4': 2.5, 'G4': 3, 'F4': 3.5,
    'E4': 4, 'D4': 4.5, 'C4': 5, 'B3': 5.5, 'A3': 6, 'G3': 6.5, 'F3': 7,
  }

  const bassPositions: Record<string, number> = {
    'A4': -3.5, 'G4': -3, 'F4': -2.5, 'E4': -2, 'D4': -1.5, 'C4': -1, 'B3': -0.5,
    'A3': 0, 'G3': 0.5, 'F3': 1, 'E3': 1.5, 'D3': 2, 'C3': 2.5, 'B2': 3, 'A2': 3.5,
    'G2': 4, 'F2': 4.5, 'E2': 5, 'D2': 5.5, 'C2': 6, 'B1': 6.5, 'A1': 7,
  }

  const notePositions = displayClef === 'treble' ? treblePositions : bassPositions

  // Calculate ledger lines needed
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

  // Generate a new interval
  const generateNewInterval = useCallback(() => {
    // Select clef
    let selectedClef: 'treble' | 'bass'
    if (clef === 'both') {
      selectedClef = Math.random() < 0.5 ? 'treble' : 'bass'
    } else {
      selectedClef = clef
    }
    setDisplayClef(selectedClef)

    const notes = selectedClef === 'treble' ? trebleNotes : bassNotes

    // Get enabled intervals as array
    const enabledList = intervals.filter(i => enabledIntervals.has(i.semitones))
    if (enabledList.length === 0) return

    // Pick random interval
    const intervalData = enabledList[Math.floor(Math.random() * enabledList.length)]
    const semitones = intervalData.semitones

    // Pick random starting note (leaving room for the interval)
    const maxStartIndex = notes.length - Math.ceil(semitones / 2) - 1
    const startIndex = Math.floor(Math.random() * Math.max(1, maxStartIndex))
    const startNote = notes[startIndex]

    // Calculate end note
    const startMidi = (startNote.octave + 1) * 12 + getNoteIndex(startNote.note)

    // Determine direction
    let actualDirection: 'ascending' | 'descending'
    if (direction === 'both') {
      actualDirection = Math.random() < 0.5 ? 'ascending' : 'descending'
    } else {
      actualDirection = direction
    }

    const endMidi = actualDirection === 'ascending'
      ? startMidi + semitones
      : startMidi - semitones

    const endOctave = Math.floor(endMidi / 12) - 1
    const endNoteIndex = endMidi % 12
    const endNoteName = noteNames[endNoteIndex]

    // For display, use natural note name if possible
    const displayNote = naturalNotes.includes(endNoteName) ? endNoteName : endNoteName

    if (actualDirection === 'ascending') {
      setBottomNote(startNote)
      setTopNote({ note: displayNote, octave: endOctave })
    } else {
      setTopNote(startNote)
      setBottomNote({ note: displayNote, octave: endOctave })
    }

    setCurrentInterval(semitones)
    setSelectedAnswer(null)
    setIsCorrect(null)
  }, [clef, enabledIntervals, direction])

  // Initialize
  useEffect(() => {
    generateNewInterval()
  }, [generateNewInterval])

  // Handle answer selection
  const handleAnswer = (semitones: number, shortName: string) => {
    if (cooldownRef.current) return

    setSelectedAnswer(shortName)
    const correct = semitones === currentInterval
    setIsCorrect(correct)

    if (correct) {
      setStreak(prev => prev + 1)
      cooldownRef.current = true
      setTimeout(() => {
        generateNewInterval()
        cooldownRef.current = false
      }, 500)
    } else {
      setStreak(0)
      cooldownRef.current = true
      setTimeout(() => {
        setSelectedAnswer(null)
        setIsCorrect(null)
        cooldownRef.current = false
      }, 800)
    }
  }

  // Toggle interval enabled
  const toggleInterval = (semitones: number) => {
    setEnabledIntervals(prev => {
      const newSet = new Set(prev)
      if (newSet.has(semitones)) {
        // Don't allow disabling all intervals
        if (newSet.size > 1) {
          newSet.delete(semitones)
        }
      } else {
        newSet.add(semitones)
      }
      return newSet
    })
  }

  // Get note positions and ledger lines
  const bottomNoteKey = `${bottomNote.note.replace('#', '').replace('b', '')}${bottomNote.octave}`
  const topNoteKey = `${topNote.note.replace('#', '').replace('b', '')}${topNote.octave}`
  const bottomPosition = notePositions[bottomNoteKey] ?? 4
  const topPosition = notePositions[topNoteKey] ?? 2

  const bottomLedgerLines = getLedgerLines(bottomPosition)
  const topLedgerLines = getLedgerLines(topPosition)
  const allLedgerLines = [...new Set([...bottomLedgerLines, ...topLedgerLines])]

  const noteX = svgWidth / 2

  // Check if notes need accidentals
  const bottomHasSharp = bottomNote.note.includes('#')
  const bottomHasFlat = bottomNote.note.includes('b')
  const topHasSharp = topNote.note.includes('#')
  const topHasFlat = topNote.note.includes('b')

  // Get the correct answer for display
  const correctInterval = intervals.find(i => i.semitones === currentInterval)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Interval Training</h2>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
        >
          <Settings size={20} />
        </button>
      </div>

      <div className="relative flex flex-col items-center gap-6">
        {/* Streak counter */}
        <div className="absolute left-0 top-0 flex flex-col items-center">
          <span className={`text-orange-500 font-bold text-3xl ${streak > 0 ? '' : 'opacity-30'}`}>
            {streak}
          </span>
          <span className="text-zinc-500 text-xs uppercase tracking-wide">Streak</span>
          {/* Show answer after wrong guess */}
          {isCorrect === false && correctInterval && (
            <span className="text-zinc-400 text-sm mt-4">
              Answer: {correctInterval.name}
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

            {/* Ledger lines */}
            {allLedgerLines.map((pos) => (
              <line
                key={pos}
                x1={noteX - 25}
                y1={paddingY + pos * lineSpacing}
                x2={noteX + 25}
                y2={paddingY + pos * lineSpacing}
                stroke="#222"
                strokeWidth="1.5"
              />
            ))}

            {/* Bottom note */}
            <g>
              {bottomHasSharp && (
                <text
                  x={noteX - 40}
                  y={getNoteY(bottomNote.note.replace('#', ''), bottomNote.octave) + 14}
                  fontSize={42}
                  fontFamily="Bravura, Leland, serif"
                  fill="#222"
                >
                  ♯
                </text>
              )}
              {bottomHasFlat && (
                <text
                  x={noteX - 50}
                  y={getNoteY(bottomNote.note.replace('b', ''), bottomNote.octave) + 10}
                  fontSize={44}
                  fontFamily="Bravura, Leland, serif"
                  fill="#222"
                >
                  ♭
                </text>
              )}
              <g transform={`rotate(-20 ${noteX} ${getNoteY(bottomNote.note.replace('#', '').replace('b', ''), bottomNote.octave)})`}>
                <ellipse
                  cx={noteX}
                  cy={getNoteY(bottomNote.note.replace('#', '').replace('b', ''), bottomNote.octave)}
                  rx={14}
                  ry={10}
                  fill="#222"
                />
                <ellipse
                  cx={noteX}
                  cy={getNoteY(bottomNote.note.replace('#', '').replace('b', ''), bottomNote.octave)}
                  rx={8}
                  ry={5}
                  fill="white"
                  transform={`rotate(40 ${noteX} ${getNoteY(bottomNote.note.replace('#', '').replace('b', ''), bottomNote.octave)})`}
                />
              </g>
            </g>

            {/* Top note */}
            <g>
              {topHasSharp && (
                <text
                  x={noteX - 40}
                  y={getNoteY(topNote.note.replace('#', ''), topNote.octave) + 14}
                  fontSize={42}
                  fontFamily="Bravura, Leland, serif"
                  fill="#222"
                >
                  ♯
                </text>
              )}
              {topHasFlat && (
                <text
                  x={noteX - 50}
                  y={getNoteY(topNote.note.replace('b', ''), topNote.octave) + 10}
                  fontSize={44}
                  fontFamily="Bravura, Leland, serif"
                  fill="#222"
                >
                  ♭
                </text>
              )}
              <g transform={`rotate(-20 ${noteX} ${getNoteY(topNote.note.replace('#', '').replace('b', ''), topNote.octave)})`}>
                <ellipse
                  cx={noteX}
                  cy={getNoteY(topNote.note.replace('#', '').replace('b', ''), topNote.octave)}
                  rx={14}
                  ry={10}
                  fill="#222"
                />
                <ellipse
                  cx={noteX}
                  cy={getNoteY(topNote.note.replace('#', '').replace('b', ''), topNote.octave)}
                  rx={8}
                  ry={5}
                  fill="white"
                  transform={`rotate(40 ${noteX} ${getNoteY(topNote.note.replace('#', '').replace('b', ''), topNote.octave)})`}
                />
              </g>
            </g>
          </svg>
        </div>

        {/* Interval buttons */}
        <div className="grid grid-cols-6 gap-2 max-w-2xl">
          {intervals.map((interval) => (
            <button
              key={interval.short}
              onClick={() => handleAnswer(interval.semitones, interval.short)}
              disabled={!enabledIntervals.has(interval.semitones)}
              className={`
                px-4 py-3 rounded-lg font-medium text-sm transition-all
                ${!enabledIntervals.has(interval.semitones)
                  ? 'bg-zinc-800/50 text-zinc-600 cursor-not-allowed'
                  : selectedAnswer === interval.short && isCorrect === true
                  ? 'bg-green-500 text-white scale-105'
                  : selectedAnswer === interval.short && isCorrect === false
                  ? 'bg-red-500 text-white'
                  : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700 hover:scale-105'
                }
              `}
            >
              <div className="font-bold">{interval.short}</div>
              <div className="text-xs opacity-75">{interval.name}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowSettings(false)}
          />
          <div className="relative bg-zinc-900 rounded-xl w-full max-w-md mx-4 border border-zinc-800">
            <div className="flex items-center justify-between p-4 border-b border-zinc-800">
              <h2 className="text-lg font-semibold">Settings</h2>
              <button
                onClick={() => setShowSettings(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-4 space-y-5">
              {/* Clef selection */}
              <div>
                <p className="text-sm text-zinc-400 mb-3">Clef</p>
                <div className="flex gap-2">
                  {(['treble', 'bass', 'both'] as const).map((c) => (
                    <button
                      key={c}
                      onClick={() => setClef(c)}
                      className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
                        clef === c
                          ? 'bg-white text-black'
                          : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              {/* Direction selection */}
              <div>
                <p className="text-sm text-zinc-400 mb-3">Direction</p>
                <div className="flex gap-2">
                  {(['ascending', 'descending', 'both'] as const).map((d) => (
                    <button
                      key={d}
                      onClick={() => setDirection(d)}
                      className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
                        direction === d
                          ? 'bg-white text-black'
                          : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              {/* Interval selection */}
              <div>
                <p className="text-sm text-zinc-400 mb-3">Intervals to practice</p>
                <div className="grid grid-cols-4 gap-2">
                  {intervals.map((interval) => (
                    <button
                      key={interval.short}
                      onClick={() => toggleInterval(interval.semitones)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        enabledIntervals.has(interval.semitones)
                          ? 'bg-white text-black'
                          : 'bg-zinc-800 text-zinc-500 hover:bg-zinc-700'
                      }`}
                    >
                      {interval.short}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
