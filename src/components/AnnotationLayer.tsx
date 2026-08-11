import { useState, useRef, useEffect } from 'react'
import { X, GripHorizontal, Plus, Minus, Eye, Square } from 'lucide-react'
import { db, type Annotation, type StickyColor, type AnnotationType } from '../lib/db'

interface AnnotationLayerProps {
  songId: string
  sheetMusicId: string
  page: number
  annotations: Annotation[]
  isEditing: boolean
  activeTool: AnnotationType | string | null
  activeColor: StickyColor
  textFontSize?: number
  onAnnotationsChange: () => void
  onToolUsed?: () => void
  zoom?: number
}

// Comic book speech bubble component
function SpeechBubble({
  annotation,
  isEditing,
  onUpdate,
  onDelete,
  zoom = 1,
}: {
  annotation: Annotation
  isEditing: boolean
  onUpdate: (updates: Partial<Annotation>) => void
  onDelete: () => void
  zoom?: number
}) {
  const [isDraggingBubble, setIsDraggingBubble] = useState(false)
  const [isDraggingTail, setIsDraggingTail] = useState(false)
  const [isDraggingResize, setIsDraggingResize] = useState(false)
  const [isTextEditing, setIsTextEditing] = useState(false)
  const [localContent, setLocalContent] = useState(annotation.content)
  const dragStartPos = useRef({ x: 0, y: 0, elemX: 0, elemY: 0, width: 0, height: 0 })
  const bubbleRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Bubble properties with defaults
  const bubbleWidth = annotation.width ?? 160
  const bubbleHeight = annotation.height ?? 80
  const fontSize = annotation.fontSize ?? 16
  const opacity = annotation.opacity ?? 1
  const borderless = annotation.borderless ?? false

  // Tail anchor point (where the tail points to)
  const tailX = annotation.x2 ?? annotation.x - 5
  const tailY = annotation.y2 ?? annotation.y + 12

  const colorStyles: Record<StickyColor, { bg: string; border: string; text: string }> = {
    yellow: { bg: '#fef08a', border: '#fde047', text: '#713f12' },
    pink: { bg: '#fbcfe8', border: '#f9a8d4', text: '#831843' },
    blue: { bg: '#bfdbfe', border: '#93c5fd', text: '#1e3a8a' },
    green: { bg: '#bbf7d0', border: '#86efac', text: '#14532d' },
  }

  const colors = colorStyles[annotation.color || 'yellow']

  // Scale WITH zoom
  const scale = Math.max(0.4, Math.min(2, zoom))

  const handleBubbleMouseDown = (e: React.MouseEvent) => {
    if (!isEditing || isTextEditing) return
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingBubble(true)
    dragStartPos.current = {
      x: e.clientX,
      y: e.clientY,
      elemX: annotation.x,
      elemY: annotation.y,
      width: bubbleWidth,
      height: bubbleHeight,
    }
  }

  const handleTailMouseDown = (e: React.MouseEvent) => {
    if (!isEditing) return
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingTail(true)
    dragStartPos.current = {
      x: e.clientX,
      y: e.clientY,
      elemX: tailX,
      elemY: tailY,
      width: bubbleWidth,
      height: bubbleHeight,
    }
  }

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    if (!isEditing) return
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingResize(true)
    dragStartPos.current = {
      x: e.clientX,
      y: e.clientY,
      elemX: annotation.x,
      elemY: annotation.y,
      width: bubbleWidth,
      height: bubbleHeight,
    }
  }

  useEffect(() => {
    if (!isDraggingBubble && !isDraggingTail && !isDraggingResize) return

    const handleMouseMove = (e: MouseEvent) => {
      const parent = containerRef.current?.parentElement
      if (!parent) return

      const rect = parent.getBoundingClientRect()

      if (isDraggingBubble) {
        const deltaX = ((e.clientX - dragStartPos.current.x) / rect.width) * 100
        const deltaY = ((e.clientY - dragStartPos.current.y) / rect.height) * 100
        // No constraints - free movement
        const newX = dragStartPos.current.elemX + deltaX
        const newY = dragStartPos.current.elemY + deltaY
        const tailDeltaX = newX - annotation.x
        const tailDeltaY = newY - annotation.y
        onUpdate({
          x: newX,
          y: newY,
          x2: tailX + tailDeltaX,
          y2: tailY + tailDeltaY,
        })
      } else if (isDraggingTail) {
        const deltaX = ((e.clientX - dragStartPos.current.x) / rect.width) * 100
        const deltaY = ((e.clientY - dragStartPos.current.y) / rect.height) * 100
        // No constraints - free movement
        const newX2 = dragStartPos.current.elemX + deltaX
        const newY2 = dragStartPos.current.elemY + deltaY
        onUpdate({ x2: newX2, y2: newY2 })
      } else if (isDraggingResize) {
        const deltaX = (e.clientX - dragStartPos.current.x) / scale
        const deltaY = (e.clientY - dragStartPos.current.y) / scale
        // Allow very small sizes for minimal padding around text
        const newWidth = Math.max(30, dragStartPos.current.width + deltaX)
        const newHeight = Math.max(20, dragStartPos.current.height + deltaY)

        // Adjust position to keep top-left corner anchored (since bubble is centered)
        const widthChange = newWidth - dragStartPos.current.width
        const heightChange = newHeight - dragStartPos.current.height
        // Convert pixel change to percentage of parent
        const xAdjust = (widthChange * scale / 2 / rect.width) * 100
        const yAdjust = (heightChange * scale / 2 / rect.height) * 100

        onUpdate({
          width: newWidth,
          height: newHeight,
          x: dragStartPos.current.elemX + xAdjust,
          y: dragStartPos.current.elemY + yAdjust,
        })
      }
    }

    const handleMouseUp = () => {
      setIsDraggingBubble(false)
      setIsDraggingTail(false)
      setIsDraggingResize(false)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDraggingBubble, isDraggingTail, isDraggingResize, onUpdate, annotation.x, annotation.y, tailX, tailY, scale])

  const handleBlur = () => {
    setIsTextEditing(false)
    if (localContent !== annotation.content) {
      onUpdate({ content: localContent })
    }
  }

  const increaseFontSize = (e: React.MouseEvent) => {
    e.stopPropagation()
    onUpdate({ fontSize: Math.min(32, fontSize + 2) })
  }

  const decreaseFontSize = (e: React.MouseEvent) => {
    e.stopPropagation()
    onUpdate({ fontSize: Math.max(10, fontSize - 2) })
  }

  const cycleOpacity = (e: React.MouseEvent) => {
    e.stopPropagation()
    // Cycle through opacity levels: 1 -> 0.7 -> 0.4 -> 0.15 -> 1
    const levels = [1, 0.7, 0.4, 0.15]
    const currentIndex = levels.findIndex(l => Math.abs(l - opacity) < 0.05)
    const nextIndex = (currentIndex + 1) % levels.length
    onUpdate({ opacity: levels[nextIndex] })
  }

  const toggleBorder = (e: React.MouseEvent) => {
    e.stopPropagation()
    onUpdate({ borderless: !borderless })
  }

  // Convert hex to rgba with opacity
  const hexToRgba = (hex: string, alpha: number) => {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return `rgba(${r}, ${g}, ${b}, ${alpha})`
  }

  // Calculate control point for the curved tail
  const midX = (annotation.x + tailX) / 2
  const midY = (annotation.y + tailY) / 2
  const dx = tailX - annotation.x
  const dy = tailY - annotation.y
  const len = Math.sqrt(dx * dx + dy * dy) || 1
  const perpX = -dy / len * 3
  const perpY = dx / len * 3
  const ctrlX = midX + perpX
  const ctrlY = midY + perpY

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none overflow-visible" style={{ zIndex: isDraggingBubble || isDraggingTail || isDraggingResize ? 100 : 10, overflow: 'visible' }}>
      {/* SVG for the tail - hidden when borderless */}
      {!borderless && (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={{ overflow: 'visible' }}
        >
          <path
            d={`M ${annotation.x} ${annotation.y + 3}
                Q ${ctrlX} ${ctrlY}
                ${tailX} ${tailY}`}
            fill="none"
            stroke={hexToRgba(colors.border, Math.min(1, opacity + 0.2))}
            strokeWidth={1.5}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={`M ${annotation.x} ${annotation.y + 3}
                Q ${ctrlX} ${ctrlY}
                ${tailX} ${tailY}`}
            fill="none"
            stroke={hexToRgba(colors.bg, opacity)}
            strokeWidth={0.8}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      )}

      {/* Tail anchor point - hidden when borderless */}
      {!borderless && (
        <div
          className={`absolute pointer-events-auto ${isEditing ? 'cursor-move' : 'pointer-events-none'}`}
          style={{
            left: `${tailX}%`,
            top: `${tailY}%`,
            transform: 'translate(-50%, -50%)',
          }}
          onMouseDown={handleTailMouseDown}
        >
          <div
            className={`rounded-full border-2 shadow-md transition-all ${
              isDraggingTail ? 'scale-150' : isEditing ? 'hover:scale-125' : ''
            }`}
            style={{
              width: 16,
              height: 16,
              backgroundColor: hexToRgba(colors.bg, opacity),
              borderColor: hexToRgba(colors.border, Math.min(1, opacity + 0.2)),
            }}
          />
        </div>
      )}

      {/* Speech bubble body */}
      <div
        ref={bubbleRef}
        className={`absolute pointer-events-auto group ${
          isDraggingBubble ? 'cursor-grabbing' : isEditing && !isTextEditing ? 'cursor-grab' : 'cursor-default'
        }`}
        style={{
          left: `${annotation.x}%`,
          top: `${annotation.y}%`,
          transform: `translate(-50%, -50%) scale(${scale})`,
          transformOrigin: 'center center',
        }}
        onMouseDown={handleBubbleMouseDown}
      >
        <div
          className={`relative ${borderless ? '' : 'shadow-lg'}`}
          style={{
            backgroundColor: hexToRgba(colors.bg, opacity),
            borderColor: borderless ? 'transparent' : hexToRgba(colors.border, Math.min(1, opacity + 0.2)),
            borderWidth: borderless ? 0 : 3,
            borderStyle: 'solid',
            width: bubbleWidth,
            minHeight: bubbleHeight,
            // Smaller border radius for compact bubbles
            borderRadius: Math.min(24, Math.min(bubbleWidth, bubbleHeight) / 3),
          }}
        >
          {/* Delete button */}
          {isEditing && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDelete()
              }}
              className="absolute -top-3 -right-3 opacity-0 group-hover:opacity-100
                w-7 h-7 flex items-center justify-center rounded-full shadow-lg transition-opacity z-10"
              style={{ backgroundColor: colors.border, color: colors.text }}
            >
              <X size={16} strokeWidth={3} />
            </button>
          )}

          {/* Font size & opacity controls */}
          {isEditing && (
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
              <button
                onClick={decreaseFontSize}
                className="w-6 h-6 flex items-center justify-center rounded-full shadow-lg"
                style={{ backgroundColor: colors.border, color: colors.text }}
                title="Decrease font size"
              >
                <Minus size={14} strokeWidth={3} />
              </button>
              <button
                onClick={increaseFontSize}
                className="w-6 h-6 flex items-center justify-center rounded-full shadow-lg"
                style={{ backgroundColor: colors.border, color: colors.text }}
                title="Increase font size"
              >
                <Plus size={14} strokeWidth={3} />
              </button>
              <button
                onClick={cycleOpacity}
                className="w-6 h-6 flex items-center justify-center rounded-full shadow-lg"
                style={{ backgroundColor: colors.border, color: colors.text }}
                title={`Opacity: ${Math.round(opacity * 100)}%`}
              >
                <Eye size={14} strokeWidth={3} />
              </button>
              <button
                onClick={toggleBorder}
                className="w-6 h-6 flex items-center justify-center rounded-full shadow-lg"
                style={{ backgroundColor: colors.border, color: colors.text }}
                title={borderless ? 'Show border' : 'Hide border'}
              >
                <Square size={14} strokeWidth={borderless ? 1 : 3} />
              </button>
            </div>
          )}

          {/* Content - minimal padding for compact notes */}
          <div className="p-2">
            {isTextEditing ? (
              <textarea
                value={localContent}
                onChange={(e) => setLocalContent(e.target.value)}
                onBlur={handleBlur}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setLocalContent(annotation.content)
                    setIsTextEditing(false)
                  }
                }}
                autoFocus
                className="w-full h-full bg-transparent resize-none outline-none font-comic leading-tight text-left"
                style={{
                  color: colors.text,
                  fontSize: fontSize,
                  minHeight: Math.max(0, bubbleHeight - 16),
                }}
                onClick={(e) => e.stopPropagation()}
              />
            ) : (
              <p
                className="whitespace-pre-wrap font-comic leading-tight text-left"
                style={{
                  color: colors.text,
                  fontSize: fontSize,
                }}
                onDoubleClick={() => isEditing && setIsTextEditing(true)}
              >
                {annotation.content || (isEditing ? '...' : '')}
              </p>
            )}
          </div>

          {/* Resize handle */}
          {isEditing && (
            <div
              className="absolute bottom-1 right-1 cursor-se-resize opacity-50 hover:opacity-100 transition-opacity"
              style={{ color: colors.text }}
              onMouseDown={handleResizeMouseDown}
            >
              <GripHorizontal size={20} className="rotate-[-45deg]" />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// Music symbol component
function MusicSymbol({
  annotation,
  isEditing,
  onUpdate,
  onDelete,
  zoom = 1,
}: {
  annotation: Annotation
  isEditing: boolean
  onUpdate: (updates: Partial<Annotation>) => void
  onDelete: () => void
  zoom?: number
}) {
  const [isDragging, setIsDragging] = useState(false)
  const [showComment, setShowComment] = useState(false)
  const [localComment, setLocalComment] = useState(annotation.comment || '')
  const dragStartPos = useRef({ x: 0, y: 0, elemX: 0, elemY: 0 })
  const symbolRef = useRef<HTMLDivElement>(null)

  // Scale WITH zoom
  const scale = Math.max(0.4, Math.min(2, zoom))

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isEditing) return
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
    dragStartPos.current = {
      x: e.clientX,
      y: e.clientY,
      elemX: annotation.x,
      elemY: annotation.y,
    }
  }

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const parent = symbolRef.current?.parentElement
      if (!parent) return

      const rect = parent.getBoundingClientRect()
      const deltaX = ((e.clientX - dragStartPos.current.x) / rect.width) * 100
      const deltaY = ((e.clientY - dragStartPos.current.y) / rect.height) * 100

      // No constraints - free movement
      const newX = dragStartPos.current.elemX + deltaX
      const newY = dragStartPos.current.elemY + deltaY

      onUpdate({ x: newX, y: newY })
    }

    const handleMouseUp = () => setIsDragging(false)

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, onUpdate])

  const handleSaveComment = () => {
    onUpdate({ comment: localComment })
    setShowComment(false)
  }

  return (
    <div
      ref={symbolRef}
      className={`absolute group ${isDragging ? 'cursor-grabbing z-50' : isEditing ? 'cursor-grab' : 'cursor-default'}`}
      style={{
        left: `${annotation.x}%`,
        top: `${annotation.y}%`,
        transform: `translate(-50%, -50%) scale(${scale})`,
        transformOrigin: 'center center',
      }}
      onMouseDown={handleMouseDown}
    >
      <div
        className={`text-4xl select-none text-blue-800 drop-shadow-md
          ${isEditing ? 'hover:scale-110' : ''} transition-transform`}
        onClick={(e) => {
          e.stopPropagation()
          if (!isDragging) setShowComment(!showComment)
        }}
      >
        {annotation.content}
      </div>

      {isEditing && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100
            p-1 bg-blue-800 text-white rounded-full shadow transition-opacity"
        >
          <X size={12} />
        </button>
      )}

      {annotation.comment && !showComment && (
        <div className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 rounded-full" />
      )}

      {showComment && (
        <div
          className="absolute top-full left-0 mt-1 bg-zinc-800 border border-zinc-700
            rounded-lg shadow-xl p-2 min-w-[200px] z-50"
          style={{ transform: `scale(${1 / scale})`, transformOrigin: 'top left' }}
          onClick={(e) => e.stopPropagation()}
        >
          {isEditing ? (
            <>
              <textarea
                value={localComment}
                onChange={(e) => setLocalComment(e.target.value)}
                placeholder="Add a comment..."
                className="w-full bg-zinc-900 text-white text-sm p-2 rounded border border-zinc-700
                  resize-none outline-none focus:border-zinc-500 min-h-[60px]"
                autoFocus
              />
              <div className="flex justify-end gap-2 mt-2">
                <button
                  onClick={() => setShowComment(false)}
                  className="px-2 py-1 text-xs text-zinc-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveComment}
                  className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-500"
                >
                  Save
                </button>
              </div>
            </>
          ) : (
            <p className="text-sm text-zinc-300">{annotation.comment}</p>
          )}
        </div>
      )}
    </div>
  )
}

// Text annotation for chords (Times New Roman, transparent)
function TextAnnotation({
  annotation,
  isEditing,
  isActive,
  onUpdate,
  onDelete,
  onStartEditing,
  onStopEditing,
  zoom = 1,
}: {
  annotation: Annotation
  isEditing: boolean
  isActive: boolean
  onUpdate: (updates: Partial<Annotation>) => void
  onDelete: () => void
  onStartEditing: () => void
  onStopEditing: () => void
  zoom?: number
}) {
  const [isDragging, setIsDragging] = useState(false)
  const [isTextEditing, setIsTextEditing] = useState(!annotation.content) // Auto-edit if empty
  const [localContent, setLocalContent] = useState(annotation.content)
  const dragStartPos = useRef({ x: 0, y: 0, elemX: 0, elemY: 0 })
  const textRef = useRef<HTMLDivElement>(null)

  const scale = Math.max(0.4, Math.min(2, zoom))
  const fontSize = annotation.fontSize || 16

  // Notify parent when we start editing
  useEffect(() => {
    if (isTextEditing) {
      onStartEditing()
    }
  }, [isTextEditing, onStartEditing])

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isEditing || isTextEditing) return
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
    dragStartPos.current = {
      x: e.clientX,
      y: e.clientY,
      elemX: annotation.x,
      elemY: annotation.y,
    }
  }

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      const parent = textRef.current?.parentElement
      if (!parent) return

      const rect = parent.getBoundingClientRect()
      const deltaX = ((e.clientX - dragStartPos.current.x) / rect.width) * 100
      const deltaY = ((e.clientY - dragStartPos.current.y) / rect.height) * 100

      const newX = dragStartPos.current.elemX + deltaX
      const newY = dragStartPos.current.elemY + deltaY

      onUpdate({ x: newX, y: newY })
    }

    const handleMouseUp = () => setIsDragging(false)

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, onUpdate])

  const handleBlur = () => {
    setIsTextEditing(false)
    onStopEditing()
    if (localContent !== annotation.content) {
      onUpdate({ content: localContent })
    }
    // Delete if empty
    if (!localContent.trim()) {
      onDelete()
    }
  }

  const increaseFontSize = (e: React.MouseEvent) => {
    e.stopPropagation()
    onUpdate({ fontSize: Math.min(48, fontSize + 2) })
  }

  const decreaseFontSize = (e: React.MouseEvent) => {
    e.stopPropagation()
    onUpdate({ fontSize: Math.max(12, fontSize - 2) })
  }

  return (
    <div
      ref={textRef}
      className={`absolute group ${isDragging ? 'cursor-grabbing z-50' : isEditing && !isTextEditing ? 'cursor-grab' : 'cursor-default'}`}
      style={{
        left: `${annotation.x}%`,
        top: `${annotation.y}%`,
        transform: `translate(-50%, -50%) scale(${scale})`,
        transformOrigin: 'center center',
        zIndex: isActive ? 50 : 10,
      }}
      onMouseDown={handleMouseDown}
    >
      <div className="relative">
        {/* Delete button */}
        {isEditing && !isTextEditing && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100
              w-5 h-5 flex items-center justify-center rounded-full bg-zinc-800 text-white shadow transition-opacity z-10"
          >
            <X size={12} />
          </button>
        )}

        {/* Font size controls - shown when text is being edited */}
        {isTextEditing && (
          <div className="absolute -top-7 left-1/2 -translate-x-1/2 flex items-center gap-0.5 bg-zinc-800 rounded-lg shadow-lg px-1 py-0.5">
            <button
              onMouseDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                decreaseFontSize(e as unknown as React.MouseEvent)
              }}
              className="p-1 text-zinc-300 hover:text-white transition-colors"
              title="Decrease font size"
            >
              <Minus size={12} />
            </button>
            <span className="text-xs text-zinc-400 w-5 text-center">{fontSize}</span>
            <button
              onMouseDown={(e) => {
                e.preventDefault()
                e.stopPropagation()
                increaseFontSize(e as unknown as React.MouseEvent)
              }}
              className="p-1 text-zinc-300 hover:text-white transition-colors"
              title="Increase font size"
            >
              <Plus size={12} />
            </button>
          </div>
        )}

        {isTextEditing ? (
          <input
            type="text"
            value={localContent}
            onChange={(e) => setLocalContent(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleBlur()
              } else if (e.key === 'Escape') {
                setLocalContent(annotation.content)
                setIsTextEditing(false)
                onStopEditing()
                // Delete if was empty (new annotation)
                if (!annotation.content.trim()) {
                  onDelete()
                }
              }
            }}
            autoFocus
            placeholder="Cmaj7..."
            className="bg-transparent border-b-2 border-blue-500 px-1 py-0.5 text-zinc-900 placeholder-zinc-400 focus:outline-none min-w-[40px] text-center"
            style={{
              fontFamily: 'Times New Roman, serif',
              fontSize: fontSize,
              fontWeight: 500,
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <div
            className={`px-1 text-zinc-900 whitespace-nowrap ${isEditing ? 'hover:bg-zinc-200/50 rounded cursor-pointer' : ''}`}
            style={{
              fontFamily: 'Times New Roman, serif',
              fontSize: fontSize,
              fontWeight: 500,
            }}
            onClick={(e) => {
              if (isEditing) {
                e.stopPropagation()
                setIsTextEditing(true)
              }
            }}
          >
            {annotation.content}
          </div>
        )}
      </div>
    </div>
  )
}

const stickyColors: { color: StickyColor; bg: string; name: string }[] = [
  { color: 'yellow', bg: '#fef08a', name: 'Yellow' },
  { color: 'pink', bg: '#fbcfe8', name: 'Pink' },
  { color: 'blue', bg: '#bfdbfe', name: 'Blue' },
  { color: 'green', bg: '#bbf7d0', name: 'Green' },
]

export function AnnotationLayer({
  songId,
  sheetMusicId,
  page,
  annotations,
  isEditing,
  activeTool,
  activeColor,
  textFontSize = 16,
  onAnnotationsChange,
  onToolUsed,
  zoom = 1,
}: AnnotationLayerProps) {
  const layerRef = useRef<HTMLDivElement>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; percentX: number; percentY: number } | null>(null)
  const [editingTextId, setEditingTextId] = useState<string | null>(null)

  const pageAnnotations = annotations.filter((a) => a.page === page)

  // Close context menu when clicking elsewhere
  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null)
    if (contextMenu) {
      window.addEventListener('click', handleClickOutside)
      return () => window.removeEventListener('click', handleClickOutside)
    }
  }, [contextMenu])

  const handleContextMenu = (e: React.MouseEvent) => {
    if (!isEditing) return
    e.preventDefault()

    const rect = layerRef.current?.getBoundingClientRect()
    if (!rect) return

    const percentX = ((e.clientX - rect.left) / rect.width) * 100
    const percentY = ((e.clientY - rect.top) / rect.height) * 100

    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      percentX,
      percentY,
    })
  }

  const handleAddNoteFromContextMenu = async (color: StickyColor) => {
    if (!contextMenu) return

    const newAnnotation: Annotation = {
      id: crypto.randomUUID(),
      songId,
      sheetMusicId,
      page,
      type: 'sticky',
      x: contextMenu.percentX,
      y: contextMenu.percentY,
      x2: contextMenu.percentX - 5,
      y2: contextMenu.percentY + 10,
      content: '',
      color,
      width: 160,
      height: 80,
      fontSize: 16,
      opacity: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    await db.annotations.add(newAnnotation)
    onAnnotationsChange()
    setContextMenu(null)
  }

  const handleClick = async (e: React.MouseEvent) => {
    // Close context menu if open
    if (contextMenu) {
      setContextMenu(null)
      return
    }
    if (!isEditing || !activeTool) return

    const rect = layerRef.current?.getBoundingClientRect()
    if (!rect) return

    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100

    if (activeTool === 'sticky') {
      const newAnnotation: Annotation = {
        id: crypto.randomUUID(),
        songId,
        sheetMusicId,
        page,
        type: 'sticky',
        x,
        y,
        x2: x - 5,
        y2: y + 10,
        content: '',
        color: activeColor,
        width: 160,
        height: 80,
        fontSize: 16,
        opacity: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      await db.annotations.add(newAnnotation)
      onAnnotationsChange()
      onToolUsed?.()
      return
    }

    if (activeTool === 'text') {
      // Don't create new text if one is being edited
      if (editingTextId) return

      const newId = crypto.randomUUID()
      const newAnnotation: Annotation = {
        id: newId,
        songId,
        sheetMusicId,
        page,
        type: 'text',
        x,
        y,
        content: '',
        fontSize: textFontSize,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      await db.annotations.add(newAnnotation)
      setEditingTextId(newId)
      onAnnotationsChange()
      return
    }

    if (typeof activeTool === 'string' && activeTool.length <= 2) {
      const newAnnotation: Annotation = {
        id: crypto.randomUUID(),
        songId,
        sheetMusicId,
        page,
        type: 'symbol',
        x,
        y,
        content: activeTool,
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      await db.annotations.add(newAnnotation)
      onAnnotationsChange()
      onToolUsed?.()
    }
  }

  const handleUpdateAnnotation = async (id: string, updates: Partial<Annotation>) => {
    await db.annotations.update(id, { ...updates, updatedAt: new Date() })
    onAnnotationsChange()
  }

  const handleDeleteAnnotation = async (id: string) => {
    await db.annotations.delete(id)
    onAnnotationsChange()
  }

  return (
    <>
      <div
        ref={layerRef}
        className={`absolute inset-0 overflow-visible ${isEditing && activeTool ? 'cursor-crosshair' : ''}`}
        style={{ overflow: 'visible' }}
        onClick={handleClick}
        onContextMenu={handleContextMenu}
      >
        {pageAnnotations.map((annotation) => {
          if (annotation.type === 'sticky') {
            return (
              <SpeechBubble
                key={annotation.id}
                annotation={annotation}
                isEditing={isEditing}
                onUpdate={(updates) => handleUpdateAnnotation(annotation.id, updates)}
                onDelete={() => handleDeleteAnnotation(annotation.id)}
                zoom={zoom}
              />
            )
          }
          if (annotation.type === 'symbol') {
            return (
              <MusicSymbol
                key={annotation.id}
                annotation={annotation}
                isEditing={isEditing}
                onUpdate={(updates) => handleUpdateAnnotation(annotation.id, updates)}
                onDelete={() => handleDeleteAnnotation(annotation.id)}
                zoom={zoom}
              />
            )
          }
          if (annotation.type === 'text') {
            return (
              <TextAnnotation
                key={annotation.id}
                annotation={annotation}
                isEditing={isEditing}
                isActive={editingTextId === annotation.id}
                onUpdate={(updates) => handleUpdateAnnotation(annotation.id, updates)}
                onDelete={() => {
                  handleDeleteAnnotation(annotation.id)
                  if (editingTextId === annotation.id) setEditingTextId(null)
                }}
                onStartEditing={() => setEditingTextId(annotation.id)}
                onStopEditing={() => setEditingTextId(null)}
                zoom={zoom}
              />
            )
          }
          return null
        })}
      </div>

      {/* Right-click context menu */}
      {contextMenu && isEditing && (
        <div
          className="fixed bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl py-2 z-[200]"
          style={{
            left: contextMenu.x,
            top: contextMenu.y,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1 text-xs text-zinc-400 font-medium">Add Note</div>
          <div className="flex gap-2 px-3 py-2">
            {stickyColors.map(({ color, bg, name }) => (
              <button
                key={color}
                onClick={() => handleAddNoteFromContextMenu(color)}
                className="w-8 h-8 rounded-lg border-2 border-transparent hover:border-white transition-all hover:scale-110"
                style={{ backgroundColor: bg }}
                title={name}
              />
            ))}
          </div>
        </div>
      )}
    </>
  )
}
