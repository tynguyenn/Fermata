import Dexie, { type EntityTable } from 'dexie'

// Enums
export type Difficulty = 'beginner' | 'easy' | 'intermediate' | 'advanced' | 'expert'
export type Category =
  | 'classical'
  | 'anime'
  | 'jazz'
  | 'pop'
  | 'film-tv'
  | 'video-game'
  | 'original'
  | 'other'
export type FileType = 'pdf' | 'image' | 'musicxml'

// Core entity
export interface Song {
  id: string
  title: string
  composer?: string
  source?: string // e.g., anime title, movie name, game title
  key?: string
  timeSignature?: string
  bpm?: number
  difficulty?: Difficulty
  category: Category
  youtubeUrl?: string
  notes?: string
  favorite: boolean
  createdAt: Date
  updatedAt: Date
}

// Sheet music files attached to a song
export interface SheetMusic {
  id: string
  songId: string
  fileName: string
  fileType: FileType
  data: ArrayBuffer
  pageCount?: number
  createdAt: Date
}

// Practice session logs
export interface PracticeLog {
  id: string
  songId: string
  date: Date
  duration: number // in seconds
  bpm?: number
  notes?: string
  rating?: number // 1-5
}

// Audio recordings
export interface Recording {
  id: string
  songId: string
  fileName: string
  data: ArrayBuffer
  date: Date
  duration: number // in seconds
  notes?: string
}

// Flexible tags
export interface Tag {
  id: string
  name: string
}

// Junction table for Song <-> Tag (many-to-many)
export interface SongTag {
  songId: string
  tagId: string
}

// Database instance with typed tables
const db = new Dexie('FermataDB') as Dexie & {
  songs: EntityTable<Song, 'id'>
  sheetMusic: EntityTable<SheetMusic, 'id'>
  practiceLogs: EntityTable<PracticeLog, 'id'>
  recordings: EntityTable<Recording, 'id'>
  tags: EntityTable<Tag, 'id'>
  songTags: EntityTable<SongTag, 'songId'>
}

db.version(1).stores({
  songs: 'id, title, composer, category, difficulty, favorite, createdAt, updatedAt',
  sheetMusic: 'id, songId, fileType, createdAt',
  practiceLogs: 'id, songId, date, rating',
  recordings: 'id, songId, date',
  tags: 'id, &name', // unique name
  songTags: '[songId+tagId], songId, tagId', // composite primary key
})

export { db }
