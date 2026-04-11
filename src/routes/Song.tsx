import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Heart, ExternalLink, Music, Maximize2, X } from 'lucide-react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { db, type Song as SongType, type SheetMusic, type Category } from '../lib/db'

// Set up PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

function PdfViewer({ url }: { url: string }) {
  const [numPages, setNumPages] = useState<number>(0)

  return (
    <Document
      file={url}
      onLoadSuccess={({ numPages }) => setNumPages(numPages)}
      loading={<p className="text-zinc-500">Loading PDF...</p>}
      error={<p className="text-red-400">Failed to load PDF</p>}
      className="w-full"
    >
      <div className="flex gap-4 overflow-x-auto pb-4 w-full">
        {Array.from({ length: numPages }, (_, i) => (
          <Page
            key={i + 1}
            pageNumber={i + 1}
            width={350}
            className="shadow-lg rounded-lg overflow-hidden shrink-0"
          />
        ))}
      </div>
    </Document>
  )
}

function FullscreenPdfViewer({ url, onClose }: { url: string; onClose: () => void }) {
  const [numPages, setNumPages] = useState<number>(0)

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-zinc-800">
        <span className="text-zinc-400">Sheet Music</span>
        <button
          onClick={onClose}
          className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
        >
          <X size={20} />
        </button>
      </div>

      {/* PDF Content */}
      <div className="flex-1 overflow-auto p-6">
        <Document
          file={url}
          onLoadSuccess={({ numPages }) => setNumPages(numPages)}
          loading={<p className="text-zinc-500">Loading PDF...</p>}
          error={<p className="text-red-400">Failed to load PDF</p>}
        >
          <div className="flex flex-col items-center gap-6">
            {Array.from({ length: numPages }, (_, i) => (
              <Page
                key={i + 1}
                pageNumber={i + 1}
                scale={1.5}
                className="shadow-lg rounded-lg overflow-hidden"
              />
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
  const [fullscreenUrl, setFullscreenUrl] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      if (!songId) {
        setLoading(false)
        return
      }
      try {
        const songData = await db.songs.get(songId)
        if (songData) {
          setSong(songData)
          const sheets = await db.sheetMusic.where('songId').equals(songId).toArray()
          setSheetMusic(sheets)
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
    }
  }, [sheetMusicUrls])

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

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/library')}
          className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">{song.title}</h1>
          {(song.composer || song.source) && (
            <p className="text-zinc-400">
              {song.composer}
              {song.composer && song.source && ' · '}
              {song.source}
            </p>
          )}
        </div>
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

      {/* Metadata */}
      <div className="flex flex-wrap gap-2 mb-8">
        <span className="px-3 py-1 bg-zinc-800 rounded-full text-sm text-zinc-300">
          {categoryLabels[song.category]}
        </span>
        {song.difficulty && (
          <span className="px-3 py-1 bg-zinc-800 rounded-full text-sm text-zinc-300 capitalize">
            {song.difficulty}
          </span>
        )}
        {song.key && (
          <span className="px-3 py-1 bg-zinc-800 rounded-full text-sm text-zinc-300">
            {song.key}
          </span>
        )}
        {song.bpm && (
          <span className="px-3 py-1 bg-zinc-800 rounded-full text-sm text-zinc-300">
            {song.bpm} BPM
          </span>
        )}
      </div>

      {/* Actions */}
      {song.youtubeUrl && (
        <div className="flex gap-3 mb-8">
          <a
            href={song.youtubeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 text-white rounded-lg hover:bg-zinc-700 transition-colors"
          >
            <ExternalLink size={18} />
            Reference
          </a>
        </div>
      )}

      {/* Sheet Music Display */}
      <section className="mb-8 min-w-0">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wide">
            Sheet Music
          </h2>
          {sheetMusicUrls.length > 0 && sheetMusicUrls[0].fileType === 'pdf' && (
            <button
              onClick={() => setFullscreenUrl(sheetMusicUrls[0].url)}
              className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white transition-colors"
            >
              <Maximize2 size={16} />
            </button>
          )}
        </div>
        {sheetMusicUrls.length === 0 ? (
          <p className="text-zinc-500">No sheet music attached</p>
        ) : (
          <div className="space-y-6">
            {sheetMusicUrls.map((sheet) => (
              <div key={sheet.id}>
                {sheet.fileType === 'pdf' ? (
                  <PdfViewer url={sheet.url} />
                ) : (
                  <img
                    src={sheet.url}
                    alt={sheet.fileName}
                    className="max-w-full rounded-lg shadow-lg"
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Fullscreen PDF Viewer */}
      {fullscreenUrl && (
        <FullscreenPdfViewer
          url={fullscreenUrl}
          onClose={() => setFullscreenUrl(null)}
        />
      )}

      {/* Notes */}
      {song.notes && (
        <section>
          <h2 className="text-sm font-medium text-zinc-400 uppercase tracking-wide mb-4">
            Notes
          </h2>
          <p className="text-zinc-300 whitespace-pre-wrap">{song.notes}</p>
        </section>
      )}
    </div>
  )
}
