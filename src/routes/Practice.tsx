import { useState } from 'react'
import { Music, Eye, ArrowLeft, GitCompareArrows } from 'lucide-react'
import { NoteReadingGame } from '../components/NoteReadingGame'
import { SightReadingGame } from '../components/SightReadingGame'
import { IntervalGame } from '../components/IntervalGame'

type GameMode = null | 'note-reading' | 'sight-reading' | 'interval-reading'

export function Practice() {
  const [activeGame, setActiveGame] = useState<GameMode>(null)

  if (activeGame === 'sight-reading') {
    return (
      <div>
        <button
          onClick={() => setActiveGame(null)}
          className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors mb-6"
        >
          <ArrowLeft size={20} />
          Back to Practice
        </button>
        <SightReadingGame />
      </div>
    )
  }

  if (activeGame === 'note-reading') {
    return (
      <div>
        <button
          onClick={() => setActiveGame(null)}
          className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors mb-6"
        >
          <ArrowLeft size={20} />
          Back to Practice
        </button>
        <NoteReadingGame />
      </div>
    )
  }

  if (activeGame === 'interval-reading') {
    return (
      <div>
        <button
          onClick={() => setActiveGame(null)}
          className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors mb-6"
        >
          <ArrowLeft size={20} />
          Back to Practice
        </button>
        <IntervalGame />
      </div>
    )
  }

  return (
    <div>
      <h2 className="text-2xl font-semibold mb-6">Practice Mode</h2>

      <div className="grid gap-4">
        {/* Note Reading - simpler game */}
        <button
          onClick={() => setActiveGame('note-reading')}
          className="flex items-center gap-4 p-6 bg-zinc-900 border border-zinc-800 rounded-xl hover:bg-zinc-800/50 hover:border-zinc-700 transition-colors text-left"
        >
          <div className="w-12 h-12 rounded-lg bg-zinc-800 flex items-center justify-center">
            <Music size={24} className="text-zinc-400" />
          </div>
          <div>
            <h3 className="text-lg font-medium text-white">Note Reading</h3>
            <p className="text-sm text-zinc-500">Learn to identify notes on the staff</p>
          </div>
        </button>

        {/* Sight Reading - scrolling notes game */}
        <button
          onClick={() => setActiveGame('sight-reading')}
          className="flex items-center gap-4 p-6 bg-zinc-900 border border-zinc-800 rounded-xl hover:bg-zinc-800/50 hover:border-zinc-700 transition-colors text-left"
        >
          <div className="w-12 h-12 rounded-lg bg-zinc-800 flex items-center justify-center">
            <Eye size={24} className="text-zinc-400" />
          </div>
          <div>
            <h3 className="text-lg font-medium text-white">Sight Reading</h3>
            <p className="text-sm text-zinc-500">Play scrolling notes in real-time</p>
          </div>
        </button>

        {/* Interval Reading - identify intervals */}
        <button
          onClick={() => setActiveGame('interval-reading')}
          className="flex items-center gap-4 p-6 bg-zinc-900 border border-zinc-800 rounded-xl hover:bg-zinc-800/50 hover:border-zinc-700 transition-colors text-left"
        >
          <div className="w-12 h-12 rounded-lg bg-zinc-800 flex items-center justify-center">
            <GitCompareArrows size={24} className="text-zinc-400" />
          </div>
          <div>
            <h3 className="text-lg font-medium text-white">Interval Training</h3>
            <p className="text-sm text-zinc-500">Learn to identify intervals between notes</p>
          </div>
        </button>
      </div>
    </div>
  )
}
