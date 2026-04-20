import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Plus, Music, Heart, MoreVertical, ChevronUp, ChevronDown } from 'lucide-react'
import { db, type Song, type Category } from '../lib/db'

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
import { AddSongModal } from '../components/AddSongModal'
import { EditSongModal } from '../components/EditSongModal'

// Quarter note SVG as a data URL for default album art
const defaultAlbumArt = `data:image/svg+xml,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" fill="#27272a"/>
  <ellipse cx="35" cy="70" rx="12" ry="9" fill="#52525b" transform="rotate(-20 35 70)"/>
  <rect x="44" y="20" width="4" height="52" fill="#52525b"/>
</svg>
`)}`

export function Library() {
  const [songs, setSongs] = useState<Song[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingSong, setEditingSong] = useState<Song | null>(null)
  const [loading, setLoading] = useState(true)
  const [albumArtUrls, setAlbumArtUrls] = useState<Record<string, string>>({})
  const [sortColumn, setSortColumn] = useState<'title' | 'composer' | 'source' | 'category' | 'difficulty' | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')

  const loadSongs = async () => {
    // Order by lastOpenedAt for recents, falling back to updatedAt for never-opened songs
    const allSongs = await db.songs.toArray()
    allSongs.sort((a, b) => {
      const aTime = a.lastOpenedAt?.getTime() ?? a.updatedAt.getTime()
      const bTime = b.lastOpenedAt?.getTime() ?? b.updatedAt.getTime()
      return bTime - aTime // Most recent first
    })
    setSongs(allSongs)

    // Create blob URLs for album art
    const urls: Record<string, string> = {}
    for (const song of allSongs) {
      if (song.albumArt) {
        const blob = new Blob([song.albumArt], { type: 'image/jpeg' })
        urls[song.id] = URL.createObjectURL(blob)
      }
    }
    setAlbumArtUrls(urls)
    setLoading(false)
  }

  useEffect(() => {
    loadSongs()
    return () => {
      // Cleanup blob URLs on unmount
      Object.values(albumArtUrls).forEach(url => URL.revokeObjectURL(url))
    }
  }, [])

  const toggleFavorite = async (song: Song) => {
    await db.songs.update(song.id, { favorite: !song.favorite, updatedAt: new Date() })
    loadSongs()
  }

  const handleSort = (column: 'title' | 'composer' | 'source' | 'category' | 'difficulty') => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  const difficultyOrder: Record<string, number> = {
    beginner: 1,
    easy: 2,
    intermediate: 3,
    advanced: 4,
    expert: 5,
  }

  const sortedSongs = sortColumn
    ? [...songs].sort((a, b) => {
        let aVal: string | number = ''
        let bVal: string | number = ''

        if (sortColumn === 'difficulty') {
          aVal = a.difficulty ? difficultyOrder[a.difficulty] : 0
          bVal = b.difficulty ? difficultyOrder[b.difficulty] : 0
        } else {
          aVal = (a[sortColumn] || '').toLowerCase()
          bVal = (b[sortColumn] || '').toLowerCase()
        }

        if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
        if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
        return 0
      })
    : songs

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold">Recents</h2>
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
        <div className="flex gap-5 overflow-hidden">
          {songs.map((song) => (
            <div
              key={song.id}
              className="group relative cursor-pointer w-[calc((100%-40px)/3)] sm:w-[calc((100%-60px)/4)] lg:w-[calc((100%-80px)/5)] xl:w-[calc((100%-100px)/6)] shrink-0"
            >
              <Link to={`/library/${song.id}`} className="absolute inset-0 z-10 rounded-lg" />

              {/* Square album art */}
              <div className="aspect-square rounded-lg overflow-hidden mb-3 bg-zinc-800 relative">
                <img
                  src={albumArtUrls[song.id] || defaultAlbumArt}
                  alt={song.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                {/* Edit button */}
                <button
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setEditingSong(song)
                  }}
                  className="absolute top-2 right-2 p-1.5 rounded-full z-20 transition-all text-white bg-black/50 opacity-0 group-hover:opacity-100 hover:bg-black/70"
                >
                  <MoreVertical size={16} />
                </button>
                {/* Favorite button */}
                <button
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    toggleFavorite(song)
                  }}
                  className={`absolute top-2 left-2 p-1.5 rounded-full z-20 transition-all ${
                    song.favorite
                      ? 'text-red-400 bg-black/50'
                      : 'text-white bg-black/50 opacity-0 group-hover:opacity-100'
                  }`}
                >
                  <Heart size={16} fill={song.favorite ? 'currentColor' : 'none'} />
                </button>
              </div>

              {/* Song info */}
              <h3 className="font-medium text-white truncate">{song.title}</h3>
              {(song.composer || song.source) && (
                <p className="text-sm text-zinc-400 mb-6 truncate">
                  {song.composer}
                  {song.composer && song.source && ' · '}
                  {song.source}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Collection */}
      <div className="flex items-center justify-between mb-6 mt-10">
        <h2 className="text-2xl font-semibold">Collection</h2>
      </div>

      {/* Collection Table */}
      {!loading && songs.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800 text-left text-sm text-zinc-500">
                <th className="pb-3 pl-2 w-14"></th>
                <th className="pb-3">
                  <button
                    onClick={() => handleSort('title')}
                    className="flex items-center gap-1 font-medium hover:text-white transition-colors"
                  >
                    Title
                    {sortColumn === 'title' && (
                      sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    )}
                  </button>
                </th>
                <th className="pb-3">
                  <button
                    onClick={() => handleSort('composer')}
                    className="flex items-center gap-1 font-medium hover:text-white transition-colors"
                  >
                    Artist
                    {sortColumn === 'composer' && (
                      sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    )}
                  </button>
                </th>
                <th className="pb-3">
                  <button
                    onClick={() => handleSort('source')}
                    className="flex items-center gap-1 font-medium hover:text-white transition-colors"
                  >
                    Source
                    {sortColumn === 'source' && (
                      sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    )}
                  </button>
                </th>
                <th className="pb-3">
                  <button
                    onClick={() => handleSort('category')}
                    className="flex items-center gap-1 font-medium hover:text-white transition-colors"
                  >
                    Category
                    {sortColumn === 'category' && (
                      sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    )}
                  </button>
                </th>
                <th className="pb-3">
                  <button
                    onClick={() => handleSort('difficulty')}
                    className="flex items-center gap-1 font-medium hover:text-white transition-colors"
                  >
                    Difficulty
                    {sortColumn === 'difficulty' && (
                      sortDirection === 'asc' ? <ChevronUp size={14} /> : <ChevronDown size={14} />
                    )}
                  </button>
                </th>
                <th className="pb-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {sortedSongs.map((song) => (
                <tr
                  key={song.id}
                  className="group border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors"
                >
                  {/* Album Art */}
                  <td className="py-3 pl-2">
                    <Link to={`/library/${song.id}`}>
                      <div className="w-10 h-10 rounded overflow-hidden bg-zinc-800">
                        <img
                          src={albumArtUrls[song.id] || defaultAlbumArt}
                          alt={song.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    </Link>
                  </td>

                  {/* Title */}
                  <td className="py-3">
                    <Link to={`/library/${song.id}`} className="hover:text-white transition-colors">
                      <span className="font-medium text-white">{song.title}</span>
                    </Link>
                  </td>

                  {/* Artist/Composer */}
                  <td className="py-3 text-zinc-400">
                    {song.composer || '—'}
                  </td>

                  {/* Source */}
                  <td className="py-3 text-zinc-400">
                    {song.source || '—'}
                  </td>

                  {/* Category */}
                  <td className="py-3 text-zinc-400">
                    {categoryLabels[song.category]}
                  </td>

                  {/* Difficulty */}
                  <td className="py-3 text-zinc-400 capitalize">
                    {song.difficulty || '—'}
                  </td>

                  {/* Favorite */}
                  <td className="py-3">
                    <button
                      onClick={() => toggleFavorite(song)}
                      className={`p-1.5 rounded-full transition-all ${
                        song.favorite
                          ? 'text-red-400'
                          : 'text-zinc-600 opacity-0 group-hover:opacity-100 hover:text-zinc-400'
                      }`}
                    >
                      <Heart size={16} fill={song.favorite ? 'currentColor' : 'none'} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Song Modal */}
      <AddSongModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSongAdded={loadSongs}
      />

      {/* Edit Song Modal */}
      {editingSong && (
        <EditSongModal
          song={editingSong}
          albumArtUrl={albumArtUrls[editingSong.id] || null}
          isOpen={true}
          onClose={() => setEditingSong(null)}
          onSongUpdated={loadSongs}
        />
      )}
    </div>
    
  )
}
