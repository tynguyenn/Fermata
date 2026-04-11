import { useState, useRef, useEffect, type MouseEvent } from 'react'
import { X, Minimize2, Maximize2 } from 'lucide-react'
import circleOfFifthsSvg from './circleOfFifths.svg'

interface CircleOfFifthsPopupProps {
  isOpen: boolean
  onClose: () => void
}

export function CircleOfFifthsPopup({ isOpen, onClose }: CircleOfFifthsPopupProps) {
  const [position, setPosition] = useState({ x: 100, y: 100 })
  const [size, setSize] = useState({ width: 400, height: 400 })
  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const popupRef = useRef<HTMLDivElement>(null)

  // Handle mouse move and mouse up at document level for smooth dragging/resizing
  useEffect(() => {
    const handleMouseMove = (e: globalThis.MouseEvent) => {
      if (isDragging) {
        setPosition({
          x: e.clientX - dragOffset.current.x,
          y: e.clientY - dragOffset.current.y,
        })
      }
      if (isResizing && popupRef.current) {
        const rect = popupRef.current.getBoundingClientRect()
        setSize({
          width: Math.max(250, e.clientX - rect.left + (size.width - rect.width)),
          height: Math.max(250, e.clientY - rect.top + (size.height - rect.height)),
        })
      }
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      setIsResizing(false)
    }

    if (isDragging || isResizing) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
      return () => {
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [isDragging, isResizing, size.width, size.height])

  const handleDragStart = (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-resize-handle]')) return
    e.preventDefault()
    setIsDragging(true)
    dragOffset.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    }
  }

  const handleResizeStart = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsResizing(true)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-40 pointer-events-none">
      <div
        ref={popupRef}
        className="absolute bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl pointer-events-auto flex flex-col"
        style={{
          left: position.x,
          top: position.y,
          width: size.width,
          height: isMinimized ? 'auto' : size.height,
        }}
      >
        {/* Header - draggable */}
        <div
          className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 cursor-move select-none shrink-0"
          onMouseDown={handleDragStart}
        >
          <span className="text-sm font-medium text-zinc-300">Circle of Fifths</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setIsMinimized(!isMinimized)}
              className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              {isMinimized ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Content */}
        {!isMinimized && (
          <div className="flex-1 overflow-auto p-4 flex items-center justify-center">
            <img
              src={circleOfFifthsSvg}
              alt="Circle of Fifths"
              className="max-w-full max-h-full object-contain"
              draggable={false}
            />
          </div>
        )}

        {/* Resize handle */}
        {!isMinimized && (
          <div
            data-resize-handle
            className="absolute bottom-0 right-0 w-6 h-6 cursor-se-resize hover:bg-zinc-800/50 rounded-br-xl transition-colors"
            onMouseDown={handleResizeStart}
          >
            <svg
              className="absolute bottom-1.5 right-1.5 text-zinc-500"
              width="10"
              height="10"
              viewBox="0 0 10 10"
            >
              <path
                d="M9 1L1 9M9 5L5 9M9 9L9 9"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
        )}
      </div>
    </div>
  )
}
