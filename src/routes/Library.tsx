import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Music, Heart } from 'lucide-react'
import { db, type Song, type Category } from '../lib/db'
import { AddSongModal } from '../components/AddSongModal'

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

export function Library() {
  const [songs, setSongs] = useState<Song[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [loading, setLoading] = useState(true)

  const loadSongs = async () => {
    const allSongs = await db.songs.orderBy('updatedAt').reverse().toArray()
    setSongs(allSongs)
    setLoading(false)
  }

  useEffect(() => {
    loadSongs()
  }, [])

  const toggleFavorite = async (song: Song) => {
    await db.songs.update(song.id, { favorite: !song.favorite, updatedAt: new Date() })
    loadSongs()
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold">Library</h2>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-white text-black font-medium rounded-lg hover:bg-zinc-200 transition-colors"
        >
          <Plus size={18} />
          Add Song
        </button>
      </div>

      {/* Song grid */}
      {loading ? (
        <p className="text-zinc-500">Loading...</p>
      ) : songs.length === 0 ? (
        <div className="text-center py-16">
          <Music size={48} className="mx-auto text-zinc-700 mb-4" />
          <p className="text-zinc-400 mb-2">No songs yet</p>
          <p className="text-zinc-500 text-sm">Click "Add Song" to import your first piece</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {songs.map((song) => (
            <div
              key={song.id}
              className="bg-zinc-800/50 border border-zinc-700/50 rounded-lg p-4 hover:bg-zinc-800 transition-colors group relative cursor-pointer"
            >
              <Link to={`/library/${song.id}`} className="absolute inset-0 rounded-lg" />
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-white truncate">{song.title}</h3>
                  {(song.composer || song.source) && (
                    <p className="text-sm text-zinc-400 truncate">
                      {song.composer}
                      {song.composer && song.source && ' · '}
                      {song.source && <span className="text-zinc-500">{song.source}</span>}
                    </p>
                  )}
                </div>
                <button
                  onClick={(e) => {
                    e.preventDefault()
                    toggleFavorite(song)
                  }}
                  className={`p-1 rounded transition-colors relative z-10 ${
                    song.favorite
                      ? 'text-red-400'
                      : 'text-zinc-600 hover:text-zinc-400 opacity-0 group-hover:opacity-100'
                  }`}
                >
                  <Heart size={18} fill={song.favorite ? 'currentColor' : 'none'} />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs px-2 py-0.5 bg-zinc-700 rounded text-zinc-300">
                  {categoryLabels[song.category]}
                </span>
                {song.difficulty && (
                  <span className="text-xs text-zinc-500 capitalize">{song.difficulty}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Song Modal */}
      <AddSongModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSongAdded={loadSongs}
      />
    </div>
  )
}
