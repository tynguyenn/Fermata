import { useState, useRef, useEffect, type ChangeEvent } from 'react'
import { X, ImagePlus } from 'lucide-react'
import { db, type Song, type Category, type Difficulty } from '../lib/db'

interface EditSongModalProps {
  song: Song
  albumArtUrl: string | null
  isOpen: boolean
  onClose: () => void
  onSongUpdated: () => void
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

export function EditSongModal({ song, albumArtUrl, isOpen, onClose, onSongUpdated }: EditSongModalProps) {
  const [title, setTitle] = useState(song.title)
  const [composer, setComposer] = useState(song.composer || '')
  const [category, setCategory] = useState<Category>(song.category)
  const [source, setSource] = useState(song.source || '')
  const [difficulty, setDifficulty] = useState<Difficulty | ''>(song.difficulty || '')
  const [youtubeUrl, setYoutubeUrl] = useState(song.youtubeUrl || '')
  const [keySignature, setKeySignature] = useState(song.key || '')
  const [bpm, setBpm] = useState(song.bpm?.toString() || '')
  const [notes, setNotes] = useState(song.notes || '')
  const [newAlbumArt, setNewAlbumArt] = useState<File | null>(null)
  const [albumArtPreview, setAlbumArtPreview] = useState<string | null>(albumArtUrl)
  const [saving, setSaving] = useState(false)
  const albumArtInputRef = useRef<HTMLInputElement>(null)

  // Reset form when song changes
  useEffect(() => {
    setTitle(song.title)
    setComposer(song.composer || '')
    setCategory(song.category)
    setSource(song.source || '')
    setDifficulty(song.difficulty || '')
    setYoutubeUrl(song.youtubeUrl || '')
    setKeySignature(song.key || '')
    setBpm(song.bpm?.toString() || '')
    setNotes(song.notes || '')
    setNewAlbumArt(null)
    setAlbumArtPreview(albumArtUrl)
  }, [song, albumArtUrl])

  const handleAlbumArtChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f && f.type.startsWith('image/')) {
      setNewAlbumArt(f)
      if (albumArtPreview && albumArtPreview !== albumArtUrl) {
        URL.revokeObjectURL(albumArtPreview)
      }
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
      // Process new album art if provided
      let albumArtData: ArrayBuffer | undefined = song.albumArt
      if (newAlbumArt) {
        albumArtData = await newAlbumArt.arrayBuffer()
      }

      // Update song record
      await db.songs.update(song.id, {
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
        updatedAt: new Date(),
      })

      onSongUpdated()
      onClose()
    } catch (err) {
      console.error('Failed to update song:', err)
      alert('Failed to update song')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this song? This cannot be undone.')) {
      return
    }

    try {
      // Delete associated sheet music
      await db.sheetMusic.where('songId').equals(song.id).delete()
      // Delete associated practice logs
      await db.practiceLogs.where('songId').equals(song.id).delete()
      // Delete associated recordings
      await db.recordings.where('songId').equals(song.id).delete()
      // Delete song tags
      await db.songTags.where('songId').equals(song.id).delete()
      // Delete the song
      await db.songs.delete(song.id)

      onSongUpdated()
      onClose()
    } catch (err) {
      console.error('Failed to delete song:', err)
      alert('Failed to delete song')
    }
  }

  const handleClose = () => {
    if (!saving) {
      if (albumArtPreview && albumArtPreview !== albumArtUrl) {
        URL.revokeObjectURL(albumArtPreview)
      }
      onClose()
    }
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
          <h2 className="text-lg font-semibold">Edit Song</h2>
          <button
            onClick={handleClose}
            className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Album Art */}
          <div className="flex justify-center">
            <div
              onClick={() => albumArtInputRef.current?.click()}
              className="w-40 h-40 border-2 border-dashed border-zinc-700 rounded-lg cursor-pointer hover:border-zinc-600 hover:bg-zinc-800/50 transition-colors overflow-hidden flex items-center justify-center"
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
                  <ImagePlus size={32} className="mx-auto text-zinc-500 mb-2" />
                  <p className="text-sm text-zinc-500">Add Cover</p>
                </div>
              )}
            </div>
          </div>

          {/* Title */}
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

          {/* Source (conditional) */}
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

        {/* Footer */}
        <div className="flex justify-between p-4 border-t border-zinc-800">
          <button
            onClick={handleDelete}
            disabled={saving}
            className="px-4 py-2 text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded-lg transition-colors disabled:opacity-50"
          >
            Delete
          </button>
          <div className="flex gap-3">
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
    </div>
  )
}
