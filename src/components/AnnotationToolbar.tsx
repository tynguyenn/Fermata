import { useState } from 'react'
import {
  StickyNote,
  Eye,
  EyeOff,
  Pencil,
  X,
  ChevronDown,
  Trash2,
} from 'lucide-react'
import type { StickyColor, AnnotationType } from '../lib/db'
import { db } from '../lib/db'

interface AnnotationToolbarProps {
  isEditing: boolean
  setIsEditing: (editing: boolean) => void
  showAnnotations: boolean
  setShowAnnotations: (show: boolean) => void
  activeTool: AnnotationType | string | null
  setActiveTool: (tool: AnnotationType | string | null) => void
  activeColor: StickyColor
  setActiveColor: (color: StickyColor) => void
  sheetMusicId: string
  onClearAll: () => void
}

const musicSymbols = [
  { symbol: '♩', name: 'Quarter Note' },
  { symbol: '♪', name: 'Eighth Note' },
  { symbol: '♫', name: 'Beamed Notes' },
  { symbol: '♬', name: 'Sixteenth Notes' },
  { symbol: '𝄐', name: 'Fermata' },
  { symbol: '♭', name: 'Flat' },
  { symbol: '♯', name: 'Sharp' },
  { symbol: '♮', name: 'Natural' },
  { symbol: '𝄞', name: 'Treble Clef' },
  { symbol: '𝄢', name: 'Bass Clef' },
  { symbol: '𝆏', name: 'Piano (p)' },
  { symbol: '𝆐', name: 'Mezzo (m)' },
  { symbol: '𝆑', name: 'Forte (f)' },
  { symbol: '𝄌', name: 'Breath Mark' },
  { symbol: '𝄎', name: 'Caesura' },
]

const stickyColors: { color: StickyColor; bg: string; name: string }[] = [
  { color: 'yellow', bg: 'bg-yellow-300', name: 'Yellow' },
  { color: 'pink', bg: 'bg-pink-300', name: 'Pink' },
  { color: 'blue', bg: 'bg-blue-300', name: 'Blue' },
  { color: 'green', bg: 'bg-green-300', name: 'Green' },
]

export function AnnotationToolbar({
  isEditing,
  setIsEditing,
  showAnnotations,
  setShowAnnotations,
  activeTool,
  setActiveTool,
  activeColor,
  setActiveColor,
  sheetMusicId,
  onClearAll,
}: AnnotationToolbarProps) {
  const [showSymbolPicker, setShowSymbolPicker] = useState(false)
  const [showColorPicker, setShowColorPicker] = useState(false)

  const currentColorBg = stickyColors.find((c) => c.color === activeColor)?.bg || 'bg-yellow-300'

  const handleClearAll = async () => {
    if (confirm('Delete all annotations on this sheet music?')) {
      await db.annotations.where('sheetMusicId').equals(sheetMusicId).delete()
      onClearAll()
    }
  }

  return (
    <div className="flex items-center gap-2">
      {/* Toggle annotations visibility */}
      <button
        onClick={() => setShowAnnotations(!showAnnotations)}
        className={`p-2 rounded-lg transition-colors ${
          showAnnotations
            ? 'text-white bg-zinc-700'
            : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
        }`}
        title={showAnnotations ? 'Hide annotations' : 'Show annotations'}
      >
        {showAnnotations ? <Eye size={18} /> : <EyeOff size={18} />}
      </button>

      {/* Divider */}
      <div className="w-px h-6 bg-zinc-700" />

      {/* Edit mode toggle */}
      <button
        onClick={() => {
          setIsEditing(!isEditing)
          if (isEditing) setActiveTool(null)
        }}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${
          isEditing
            ? 'text-white bg-blue-600 hover:bg-blue-500'
            : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
        }`}
      >
        <Pencil size={16} />
        <span className="text-sm">{isEditing ? 'Done' : 'Annotate'}</span>
      </button>

      {/* Tools - only visible when editing */}
      {isEditing && (
        <>
          {/* Divider */}
          <div className="w-px h-6 bg-zinc-700" />

          {/* Sticky note with color picker */}
          <div className="relative">
            <div className="flex">
              <button
                onClick={() => setActiveTool('sticky')}
                className={`p-2 rounded-l-lg transition-colors ${
                  activeTool === 'sticky'
                    ? 'text-white bg-zinc-700'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`}
                title="Sticky note"
              >
                <StickyNote size={18} />
              </button>
              <button
                onClick={() => setShowColorPicker(!showColorPicker)}
                className={`p-2 rounded-r-lg border-l border-zinc-700 transition-colors ${
                  showColorPicker
                    ? 'text-white bg-zinc-700'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`}
              >
                <div className={`w-3 h-3 rounded-sm ${currentColorBg}`} />
              </button>
            </div>

            {/* Color picker dropdown */}
            {showColorPicker && (
              <div className="absolute top-full left-0 mt-1 p-2 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50">
                <div className="flex gap-1">
                  {stickyColors.map(({ color, bg, name }) => (
                    <button
                      key={color}
                      onClick={() => {
                        setActiveColor(color)
                        setShowColorPicker(false)
                        setActiveTool('sticky')
                      }}
                      className={`w-6 h-6 rounded ${bg} ${
                        activeColor === color ? 'ring-2 ring-white ring-offset-1 ring-offset-zinc-800' : ''
                      }`}
                      title={name}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Music symbols picker */}
          <div className="relative">
            <button
              onClick={() => setShowSymbolPicker(!showSymbolPicker)}
              className={`flex items-center gap-1 px-2 py-1.5 rounded-lg transition-colors ${
                showSymbolPicker || (typeof activeTool === 'string' && musicSymbols.some(s => s.symbol === activeTool))
                  ? 'text-white bg-zinc-700'
                  : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
              }`}
              title="Music symbols"
            >
              <span className="text-lg">♪</span>
              <ChevronDown size={14} />
            </button>

            {/* Symbol picker dropdown */}
            {showSymbolPicker && (
              <div className="absolute top-full left-0 mt-1 p-2 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 min-w-[200px]">
                <div className="grid grid-cols-5 gap-1">
                  {musicSymbols.map(({ symbol, name }) => (
                    <button
                      key={symbol}
                      onClick={() => {
                        setActiveTool(symbol)
                        setShowSymbolPicker(false)
                      }}
                      className={`w-9 h-9 flex items-center justify-center text-xl rounded hover:bg-zinc-700 transition-colors ${
                        activeTool === symbol ? 'bg-zinc-700 text-white' : 'text-zinc-300'
                      }`}
                      title={name}
                    >
                      {symbol}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Clear tool selection */}
          {activeTool && (
            <button
              onClick={() => setActiveTool(null)}
              className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              title="Deselect tool"
            >
              <X size={18} />
            </button>
          )}

          {/* Divider */}
          <div className="w-px h-6 bg-zinc-700" />

          {/* Clear all annotations */}
          <button
            onClick={handleClearAll}
            className="p-2 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-zinc-800 transition-colors"
            title="Clear all annotations"
          >
            <Trash2 size={18} />
          </button>
        </>
      )}
    </div>
  )
}
