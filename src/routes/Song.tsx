import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Heart, Music, ZoomIn, ZoomOut, Pencil, Columns2, Square, ChevronLeft, ChevronRight } from 'lucide-react'
import { EditSongModal } from '../components/EditSongModal'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { db, type Song as SongType, type SheetMusic, type Category, type Annotation, type StickyColor, type AnnotationType } from '../lib/db'
import { AnnotationLayer } from '../components/AnnotationLayer'
import { AnnotationToolbar } from '../components/AnnotationToolbar'

// Set up PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

interface SheetMusicViewerProps {
  url: string
  songId: string
  sheetMusicId: string
}

// High-quality PDF viewer with horizontal scrolling, 2-page spread, and annotations
function SheetMusicViewer({ url, songId, sheetMusicId }: SheetMusicViewerProps) {
  const [numPages, setNumPages] = useState<number>(0)
  const [zoom, setZoom] = useState<number>(1)
  const [twoPageView, setTwoPageView] = useState<boolean>(false)
  const [currentSpread, setCurrentSpread] = useState<number>(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const targetZoomRef = useRef(1)
  const animationFrameRef = useRef<number | null>(null)
  const [containerHeight, setContainerHeight] = useState<number>(600)

  // Annotation state
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [isAnnotating, setIsAnnotating] = useState(false)
  const [showAnnotations, setShowAnnotations] = useState(true)
  const [activeTool, setActiveTool] = useState<AnnotationType | string | null>(null)
  const [activeColor, setActiveColor] = useState<StickyColor>('yellow')

  // Load annotations
  const loadAnnotations = useCallback(async () => {
    const annots = await db.annotations
      .where('sheetMusicId')
      .equals(sheetMusicId)
      .toArray()
    setAnnotations(annots)
  }, [sheetMusicId])

  useEffect(() => {
    loadAnnotations()
  }, [loadAnnotations])

  // Measure container for responsive sizing
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setContainerHeight(containerRef.current.clientHeight - 120) // Account for controls
      }
    }
    updateSize()
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [])

  // Calculate page dimensions based on container height
  const devicePixelRatio = window.devicePixelRatio || 1
  // In 2-page view, each page is smaller to fit two side by side
  const pageHeight = Math.max(400, containerHeight - 40) * zoom

  const zoomIn = useCallback(() => {
    const newZoom = Math.min(zoom + 0.25, 3)
    targetZoomRef.current = newZoom
    setZoom(newZoom)
  }, [zoom])
  const zoomOut = useCallback(() => {
    const newZoom = Math.max(zoom - 0.25, 0.5)
    targetZoomRef.current = newZoom
    setZoom(newZoom)
  }, [zoom])
  const resetZoom = useCallback(() => {
    targetZoomRef.current = 1
    setZoom(1)
  }, [])

  // Calculate spreads (pairs of pages for 2-page view)
  const spreads = useMemo(() => {
    if (!twoPageView) {
      // Single page view: each page is its own spread
      return Array.from({ length: numPages }, (_, i) => [i + 1])
    }
    // Two page view: pair pages together
    const result: number[][] = []
    for (let i = 1; i <= numPages; i += 2) {
      if (i + 1 <= numPages) {
        result.push([i, i + 1])
      } else {
        result.push([i])
      }
    }
    return result
  }, [numPages, twoPageView])

  const totalSpreads = spreads.length

  const goToPrev = useCallback(() => {
    setCurrentSpread(s => Math.max(0, s - 1))
  }, [])

  const goToNext = useCallback(() => {
    setCurrentSpread(s => Math.min(totalSpreads - 1, s + 1))
  }, [totalSpreads])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        if (e.key === '=' || e.key === '+') {
          e.preventDefault()
          zoomIn()
        } else if (e.key === '-') {
          e.preventDefault()
          zoomOut()
        } else if (e.key === '0') {
          e.preventDefault()
          resetZoom()
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        goToPrev()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        goToNext()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [zoomIn, zoomOut, resetZoom, goToPrev, goToNext])

  // Pinch-to-zoom with trackpad (wheel event with ctrlKey)
  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    const smoothZoom = () => {
      setZoom(currentZoom => {
        const target = targetZoomRef.current
        const diff = target - currentZoom
        // Ease toward target (lerp)
        if (Math.abs(diff) < 0.01) {
          animationFrameRef.current = null
          return target
        }
        animationFrameRef.current = requestAnimationFrame(smoothZoom)
        return currentZoom + diff * 0.15
      })
    }

    const handleWheel = (e: WheelEvent) => {
      // ctrlKey is set when using trackpad pinch gesture
      if (e.ctrlKey) {
        e.preventDefault()
        // Accumulate delta into target zoom
        const delta = -e.deltaY * 0.008
        targetZoomRef.current = Math.max(0.5, Math.min(3, targetZoomRef.current + delta))

        // Start smooth animation if not already running
        if (!animationFrameRef.current) {
          animationFrameRef.current = requestAnimationFrame(smoothZoom)
        }
      }
    }

    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => {
      container.removeEventListener('wheel', handleWheel)
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [])

  // Scroll to current spread when it changes
  useEffect(() => {
    if (scrollContainerRef.current) {
      const spreadWidth = scrollContainerRef.current.scrollWidth / Math.max(1, totalSpreads)
      scrollContainerRef.current.scrollTo({
        left: currentSpread * spreadWidth,
        behavior: 'smooth'
      })
    }
  }, [currentSpread, totalSpreads])

  // Reset to first page when switching view modes
  useEffect(() => {
    setCurrentSpread(0)
  }, [twoPageView])

  // Get current page numbers for display
  const currentPages = spreads[currentSpread] || [1]

  return (
    <div ref={containerRef} className="flex-1 flex flex-col min-h-0">
      {/* Controls - Two rows (constrained width) */}
      <div className="border-b border-zinc-800">
        {/* Top row: Navigation, Zoom, View mode */}
        <div className="flex items-center justify-between px-4 py-2 max-w-7xl mx-auto">
          {/* Left: Page navigation */}
          <div className="flex items-center gap-2">
            <button
              onClick={goToPrev}
              disabled={currentSpread === 0}
              className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-30"
              title="Previous (←)"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="text-sm text-zinc-400 min-w-[80px] text-center">
              {twoPageView && currentPages.length === 2
                ? `${currentPages[0]}-${currentPages[1]}`
                : currentPages[0]
              } / {numPages}
            </span>
            <button
              onClick={goToNext}
              disabled={currentSpread >= totalSpreads - 1}
              className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-30"
              title="Next (→)"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Center: Zoom controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={zoomOut}
              disabled={zoom <= 0.5}
              className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-30"
              title="Zoom out (Cmd -)"
            >
              <ZoomOut size={18} />
            </button>
            <button
              onClick={resetZoom}
              className="px-3 py-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors text-sm min-w-[60px]"
              title="Reset zoom (Cmd 0)"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              onClick={zoomIn}
              disabled={zoom >= 3}
              className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-30"
              title="Zoom in (Cmd +)"
            >
              <ZoomIn size={18} />
            </button>
          </div>

          {/* Right: View mode toggle */}
          <div className="flex items-center gap-1 bg-zinc-800 rounded-lg p-1">
            <button
              onClick={() => setTwoPageView(false)}
              className={`p-1.5 rounded transition-colors ${
                !twoPageView ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'
              }`}
              title="Single page view"
            >
              <Square size={16} />
            </button>
            <button
              onClick={() => setTwoPageView(true)}
              className={`p-1.5 rounded transition-colors ${
                twoPageView ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'
              }`}
              title="Two page view"
            >
              <Columns2 size={16} />
            </button>
          </div>
        </div>

        {/* Bottom row: Annotation toolbar (constrained width) */}
        <div className="flex items-center justify-center px-4 py-2 border-t border-zinc-800/50 max-w-7xl mx-auto">
          <AnnotationToolbar
            isEditing={isAnnotating}
            setIsEditing={setIsAnnotating}
            showAnnotations={showAnnotations}
            setShowAnnotations={setShowAnnotations}
            activeTool={activeTool}
            setActiveTool={setActiveTool}
            activeColor={activeColor}
            setActiveColor={setActiveColor}
            sheetMusicId={sheetMusicId}
            onClearAll={loadAnnotations}
          />
        </div>
      </div>

      {/* PDF Content - horizontal scroll */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-x-auto overflow-y-auto"
        style={{
          scrollSnapType: 'x mandatory',
          scrollbarWidth: 'none', // Firefox
          msOverflowStyle: 'none', // IE/Edge
        }}
      >
        <Document
          file={url}
          onLoadSuccess={({ numPages }) => setNumPages(numPages)}
          loading={
            <div className="flex items-center justify-center h-full min-h-[400px]">
              <p className="text-zinc-500">Loading PDF...</p>
            </div>
          }
          error={
            <div className="flex items-center justify-center h-full min-h-[400px]">
              <p className="text-red-400">Failed to load PDF</p>
            </div>
          }
        >
          <div className="flex h-full">
            {spreads.map((pageNums, spreadIndex) => (
              <div
                key={spreadIndex}
                className="flex-shrink-0 w-full h-full flex items-center justify-center gap-4 px-8 py-6"
                style={{ scrollSnapAlign: 'start' }}
              >
                {pageNums.map((pageNum) => (
                  <div key={pageNum} className="relative overflow-visible">
                    <Page
                      pageNumber={pageNum}
                      height={pageHeight}
                      scale={devicePixelRatio}
                      className="shadow-2xl rounded-lg"
                      renderTextLayer={false}
                      renderAnnotationLayer={false}
                    />
                    {/* Annotation overlay */}
                    {showAnnotations && (
                      <AnnotationLayer
                        songId={songId}
                        sheetMusicId={sheetMusicId}
                        page={pageNum}
                        annotations={annotations}
                        isEditing={isAnnotating}
                        activeTool={activeTool}
                        activeColor={activeColor}
                        onAnnotationsChange={loadAnnotations}
                        onToolUsed={() => setActiveTool(null)}
                        zoom={zoom}
                      />
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Document>
      </div>
    </div>
  )
}

const categoryLabels: Record<Category, string> = {
  classical: 'Classical',
  anime: 'Anime',
  jazz: 'Jazz',
  pop: 'Pop',
  'film-tv': 'Film/TV',
  'video-game': 'Video Game',
  original: 'Original',
  other: 'Other',
}

export function Song() {
  const { songId } = useParams<{ songId: string }>()
  const navigate = useNavigate()
  const [song, setSong] = useState<SongType | null>(null)
  const [sheetMusic, setSheetMusic] = useState<SheetMusic[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [albumArtUrl, setAlbumArtUrl] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      if (!songId) {
        setLoading(false)
        return
      }
      // Reset states for new song
      setAlbumArtUrl(null)

      try {
        const songData = await db.songs.get(songId)
        if (songData) {
          setSong(songData)
          const sheets = await db.sheetMusic.where('songId').equals(songId).toArray()
          setSheetMusic(sheets)
          // Create album art URL if exists
          if (songData.albumArt) {
            const blob = new Blob([songData.albumArt], { type: 'image/jpeg' })
            setAlbumArtUrl(URL.createObjectURL(blob))
          }
          // Update lastOpenedAt to track recent views
          await db.songs.update(songId, { lastOpenedAt: new Date() })
        }
      } catch (err) {
        console.error('Failed to load song:', err)
        setError(err instanceof Error ? err.message : 'Failed to load song')
      }
      setLoading(false)
    }
    load()
  }, [songId])

  const toggleFavorite = async () => {
    if (!song) return
    await db.songs.update(song.id, { favorite: !song.favorite, updatedAt: new Date() })
    setSong({ ...song, favorite: !song.favorite })
  }

  // Create blob URLs for sheet music
  const sheetMusicUrls = useMemo(() => {
    return sheetMusic.map((sheet) => {
      const blob = new Blob([sheet.data], {
        type: sheet.fileType === 'pdf' ? 'application/pdf' : `image/${sheet.fileType}`
      })
      return {
        ...sheet,
        url: URL.createObjectURL(blob)
      }
    })
  }, [sheetMusic])

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      sheetMusicUrls.forEach((sheet) => URL.revokeObjectURL(sheet.url))
      if (albumArtUrl) URL.revokeObjectURL(albumArtUrl)
    }
  }, [sheetMusicUrls, albumArtUrl])

  const reloadSong = async () => {
    if (!songId) return
    const songData = await db.songs.get(songId)
    if (songData) {
      setSong(songData)
      if (albumArtUrl) URL.revokeObjectURL(albumArtUrl)
      if (songData.albumArt) {
        const blob = new Blob([songData.albumArt], { type: 'image/jpeg' })
        setAlbumArtUrl(URL.createObjectURL(blob))
      } else {
        setAlbumArtUrl(null)
      }
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-zinc-500">Loading...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <p className="text-red-400 mb-4">Error: {error}</p>
        <button
          onClick={() => navigate('/library')}
          className="text-sm text-zinc-500 hover:text-white transition-colors"
        >
          Back to Library
        </button>
      </div>
    )
  }

  if (!song) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <Music size={48} className="text-zinc-700 mb-4" />
        <p className="text-zinc-400">Song not found</p>
        <button
          onClick={() => navigate('/library')}
          className="mt-4 text-sm text-zinc-500 hover:text-white transition-colors"
        >
          Back to Library
        </button>
      </div>
    )
  }

  // Get the first PDF sheet music if available
  const pdfSheet = sheetMusicUrls.find(s => s.fileType === 'pdf')

  return (
    <div
      className="flex flex-col h-[calc(100vh-7rem)]"
      style={{
        // Break out of max-w-7xl container
        width: '100vw',
        marginLeft: 'calc(-50vw + 50%)',
        paddingLeft: '1.5rem',
        paddingRight: '1.5rem',
      }}
    >
      {/* Compact Header */}
      <div className="flex items-center gap-4 pb-4 border-b border-zinc-800 shrink-0 max-w-7xl mx-auto w-full">
        <button
          onClick={() => navigate('/library')}
          className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>

        {/* Album Art - smaller */}
        <div className="w-12 h-12 rounded overflow-hidden bg-zinc-800 shrink-0">
          {albumArtUrl ? (
            <img src={albumArtUrl} alt={song.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Music size={20} className="text-zinc-600" />
            </div>
          )}
        </div>

        {/* Title & Info - inline */}
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold truncate">{song.title}</h1>
          {(song.composer || song.source) && (
            <p className="text-sm text-zinc-400 truncate">
              {song.composer}
              {song.composer && song.source && ' · '}
              {song.source}
            </p>
          )}
        </div>

        {/* Quick info pills */}
        <div className="hidden md:flex items-center gap-2">
          <span className="px-2 py-1 bg-zinc-800 rounded text-xs text-zinc-400">
            {categoryLabels[song.category]}
          </span>
          {song.difficulty && (
            <span className="px-2 py-1 bg-zinc-800 rounded text-xs text-zinc-400 capitalize">
              {song.difficulty}
            </span>
          )}
          {song.key && (
            <span className="px-2 py-1 bg-zinc-800 rounded text-xs text-zinc-400">
              {song.key}
            </span>
          )}
        </div>

        {/* Actions */}
        <button
          onClick={() => setIsEditModalOpen(true)}
          className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          title="Edit song"
        >
          <Pencil size={18} />
        </button>
        <button
          onClick={toggleFavorite}
          className={`p-2 rounded-lg transition-colors ${
            song.favorite
              ? 'text-red-400 bg-red-400/10'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
          }`}
        >
          <Heart size={20} fill={song.favorite ? 'currentColor' : 'none'} />
        </button>
      </div>

      {/* Main Content - PDF Viewer */}
      {pdfSheet ? (
        <SheetMusicViewer url={pdfSheet.url} songId={song.id} sheetMusicId={pdfSheet.id} />
      ) : sheetMusicUrls.length > 0 ? (
        // Image sheet music
        <div className="flex-1 overflow-auto py-8">
          <div className="flex flex-col items-center gap-8">
            {sheetMusicUrls.map((sheet) => (
              <img
                key={sheet.id}
                src={sheet.url}
                alt={sheet.fileName}
                className="max-w-full max-h-[80vh] rounded-lg shadow-2xl"
              />
            ))}
          </div>
        </div>
      ) : (
        // No sheet music
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Music size={64} className="mx-auto text-zinc-700 mb-4" />
            <p className="text-zinc-400 mb-2">No sheet music attached</p>
            <button
              onClick={() => setIsEditModalOpen(true)}
              className="text-sm text-zinc-500 hover:text-white transition-colors"
            >
              Add sheet music
            </button>
          </div>
        </div>
      )}

      {/* Edit Song Modal */}
      {song && (
        <EditSongModal
          song={song}
          albumArtUrl={albumArtUrl}
          isOpen={isEditModalOpen}
          onClose={() => setIsEditModalOpen(false)}
          onSongUpdated={reloadSong}
        />
      )}
    </div>
  )
}
