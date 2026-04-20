import { useState, useRef, type DragEvent, type ChangeEvent } from 'react'
import { X, Upload, ChevronDown, ChevronUp, ImagePlus } from 'lucide-react'
import { db, type Category, type Difficulty, type FileType } from '../lib/db'

interface AddSongModalProps {
  isOpen: boolean
  onClose: () => void
  onSongAdded: () => void
}

const categories: { value: Category; label: string }[] = [
  { value: 'classical', label: 'Classical' },
  { value: 'anime', label: 'Anime' },
  { value: 'jazz', label: 'Jazz' },
  { value: 'pop', label: 'Pop' },
  { value: 'film-tv', label: 'Film/TV' },
  { value: 'video-game', label: 'Video Game' },
  { value: 'original', label: 'Original' },
  { value: 'other', label: 'Other' },
]

const sourceLabels: Partial<Record<Category, string>> = {
  anime: 'Anime Title',
  'film-tv': 'Movie / Show',
  'video-game': 'Game Title',
}

const sourcePlaceholders: Partial<Record<Category, string>> = {
  anime: 'e.g., Tokyo Ghoul',
  'film-tv': 'e.g., Interstellar',
  'video-game': 'e.g., Final Fantasy VII',
}

const difficulties: { value: Difficulty; label: string }[] = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'easy', label: 'Easy' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
  { value: 'expert', label: 'Expert' },
]

function parseFilename(filename: string): { title: string; composer?: string } {
  // Remove extension
  const name = filename.replace(/\.[^/.]+$/, '')
  // Replace underscores/dashes with spaces
  const cleaned = name.replace(/[_-]/g, ' ')
  // Try to split by common separators (e.g., "Clair de Lune - Debussy")
  const parts = cleaned.split(/\s+[-–—]\s+/)
  if (parts.length >= 2) {
    return { title: parts[0].trim(), composer: parts[1].trim() }
  }
  return { title: cleaned.trim() }
}

function getFileType(file: File): FileType | null {
  if (file.type === 'application/pdf') return 'pdf'
  if (file.type.startsWith('image/')) return 'image'
  if (file.name.endsWith('.musicxml') || file.name.endsWith('.mxl')) return 'musicxml'
  return null
}

export function AddSongModal({ isOpen, onClose, onSongAdded }: AddSongModalProps) {
  const [title, setTitle] = useState('')
  const [composer, setComposer] = useState('')
  const [category, setCategory] = useState<Category>('other')
  const [source, setSource] = useState('')
  const [difficulty, setDifficulty] = useState<Difficulty | ''>('')
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [keySignature, setKeySignature] = useState('')
  const [bpm, setBpm] = useState('')
  const [notes, setNotes] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [albumArt, setAlbumArt] = useState<File | null>(null)
  const [albumArtPreview, setAlbumArtPreview] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const albumArtInputRef = useRef<HTMLInputElement>(null)

  const handleFile = (f: File) => {
    const fileType = getFileType(f)
    if (!fileType) {
      alert('Please upload a PDF, image, or MusicXML file')
      return
    }
    setFile(f)
    // Auto-fill from filename
    if (!title) {
      const parsed = parseFilename(f.name)
      setTitle(parsed.title)
      if (parsed.composer && !composer) {
        setComposer(parsed.composer)
      }
    }
  }

  const handleDrop = (e: DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) handleFile(f)
  }

  const handleAlbumArtChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f && f.type.startsWith('image/')) {
      setAlbumArt(f)
      setAlbumArtPreview(URL.createObjectURL(f))
    }
  }

  const handleSave = async () => {
    if (!title.trim()) {
      alert('Please enter a title')
      return
    }

    setSaving(true)
    try {
      const songId = crypto.randomUUID()
      const now = new Date()

      // Process album art if provided
      let albumArtData: ArrayBuffer | undefined
      if (albumArt) {
        albumArtData = await albumArt.arrayBuffer()
      }

      // Create song record
      await db.songs.add({
        id: songId,
        title: title.trim(),
        composer: composer.trim() || undefined,
        category,
        source: source.trim() || undefined,
        albumArt: albumArtData,
        difficulty: difficulty || undefined,
        youtubeUrl: youtubeUrl.trim() || undefined,
        key: keySignature.trim() || undefined,
        bpm: bpm ? parseInt(bpm, 10) : undefined,
        notes: notes.trim() || undefined,
        favorite: false,
        createdAt: now,
        updatedAt: now,
      })

      // Add sheet music if file provided
      if (file) {
        const data = await file.arrayBuffer()
        await db.sheetMusic.add({
          id: crypto.randomUUID(),
          songId,
          fileName: file.name,
          fileType: getFileType(file)!,
          data,
          createdAt: now,
        })
      }

      // Reset form
      setTitle('')
      setComposer('')
      setCategory('other')
      setSource('')
      setDifficulty('')
      setYoutubeUrl('')
      setKeySignature('')
      setBpm('')
      setNotes('')
      setFile(null)
      setAlbumArt(null)
      if (albumArtPreview) URL.revokeObjectURL(albumArtPreview)
      setAlbumArtPreview(null)
      setShowMore(false)

      onSongAdded()
      onClose()
    } catch (err) {
      console.error('Failed to save song:', err)
      alert('Failed to save song')
    } finally {
      setSaving(false)
    }
  }

  const handleClose = () => {
    if (!saving) onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative bg-zinc-900 rounded-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto border border-zinc-800">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h2 className="text-lg font-semibold">Add Song</h2>
          <button
            onClick={handleClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Album Art + Sheet Music row */}
          <div className="flex gap-4">
            {/* Album Art */}
            <div
              onClick={() => albumArtInputRef.current?.click()}
              className="w-32 h-32 shrink-0 border-2 border-dashed border-zinc-700 rounded-lg cursor-pointer hover:border-zinc-600 hover:bg-zinc-800/50 transition-colors overflow-hidden flex items-center justify-center"
            >
              <input
                ref={albumArtInputRef}
                type="file"
                accept="image/*"
                onChange={handleAlbumArtChange}
                className="hidden"
              />
              {albumArtPreview ? (
                <img src={albumArtPreview} alt="Album art" className="w-full h-full object-cover" />
              ) : (
                <div className="text-center">
                  <ImagePlus size={24} className="mx-auto text-zinc-500 mb-1" />
                  <p className="text-xs text-zinc-500">Cover</p>
                </div>
              )}
            </div>

            {/* File drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`flex-1 border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                isDragging
                  ? 'border-blue-500 bg-blue-500/10'
                  : file
                  ? 'border-green-500/50 bg-green-500/5'
                  : 'border-zinc-700 hover:border-zinc-600 hover:bg-zinc-800/50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.musicxml,.mxl"
                onChange={handleFileChange}
                className="hidden"
              />
              <Upload size={28} className={`mx-auto mb-2 ${file ? 'text-green-500' : 'text-zinc-500'}`} />
              {file ? (
                <p className="text-green-400 text-sm">{file.name}</p>
              ) : (
                <>
                  <p className="text-zinc-300 text-sm">Drop sheet music here</p>
                  <p className="text-xs text-zinc-500 mt-1">PDF, image, or MusicXML</p>
                </>
              )}
            </div>
          </div>

          {/* Title (required) */}
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">
              Title <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Clair de Lune"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-zinc-500 text-white placeholder-zinc-500"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-zinc-400 mb-1">Category</label>
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value as Category)
                if (!sourceLabels[e.target.value as Category]) {
                  setSource('')
                }
              }}
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-zinc-500 text-white"
            >
              {categories.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          {/* Source (conditional - anime, film/tv, video game) */}
          {sourceLabels[category] && (
            <div>
              <label className="block text-sm font-medium text-zinc-400 mb-1">
                {sourceLabels[category]}
              </label>
              <input
                type="text"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                placeholder={sourcePlaceholders[category]}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-zinc-500 text-white placeholder-zinc-500"
              />
            </div>
          )}

          {/* More Details (collapsible) */}
          <button
            type="button"
            onClick={() => setShowMore(!showMore)}
            className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors"
          >
            {showMore ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            {showMore ? 'Less details' : 'More details'}
          </button>

          {showMore && (
            <div className="space-y-4 pt-2">
              {/* Composer */}
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Composer / Artist</label>
                <input
                  type="text"
                  value={composer}
                  onChange={(e) => setComposer(e.target.value)}
                  placeholder="e.g., Debussy"
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-zinc-500 text-white placeholder-zinc-500"
                />
              </div>

              {/* YouTube URL */}
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">YouTube Reference</label>
                <input
                  type="url"
                  value={youtubeUrl}
                  onChange={(e) => setYoutubeUrl(e.target.value)}
                  placeholder="https://youtube.com/watch?v=..."
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-zinc-500 text-white placeholder-zinc-500"
                />
              </div>

              {/* Key / BPM / Difficulty row */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">Key</label>
                  <input
                    type="text"
                    value={keySignature}
                    onChange={(e) => setKeySignature(e.target.value)}
                    placeholder="C major"
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-zinc-500 text-white placeholder-zinc-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">BPM</label>
                  <input
                    type="number"
                    value={bpm}
                    onChange={(e) => setBpm(e.target.value)}
                    placeholder="120"
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-zinc-500 text-white placeholder-zinc-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-1">Difficulty</label>
                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-zinc-500 text-white"
                  >
                    <option value="">—</option>
                    {difficulties.map((d) => (
                      <option key={d.value} value={d.value}>{d.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-1">Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any personal notes about this piece..."
                  rows={3}
                  className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:border-zinc-500 text-white placeholder-zinc-500 resize-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-4 border-t border-zinc-800">
          <button
            onClick={handleClose}
            disabled={saving}
            className="px-4 py-2 text-zinc-400 hover:text-white transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !title.trim()}
            className="px-4 py-2 bg-white text-black font-medium rounded-lg hover:bg-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
