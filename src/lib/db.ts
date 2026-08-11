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
  albumArt?: ArrayBuffer // album art image data
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
  lastOpenedAt?: Date // track when song was last viewed
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

// Annotation types for PDF markup
export type AnnotationType = 'sticky' | 'symbol' | 'arrow' | 'text'

// Text notes (margin notes, separate from annotations)
export interface TextNote {
  id: string
  sheetMusicId: string
  x: number  // percentage position
  y: number  // percentage position
  content: string
  createdAt: Date
  updatedAt: Date
}
export type StickyColor = 'yellow' | 'pink' | 'blue' | 'green'

// Annotations on sheet music
export interface Annotation {
  id: string
  songId: string
  sheetMusicId: string
  page: number
  type: AnnotationType
  x: number           // percentage 0-100 of page width
  y: number           // percentage 0-100 of page height
  content: string     // text content or symbol character
  comment?: string    // optional comment (for symbols)
  color?: StickyColor // for sticky notes
  // For arrows / tail anchor
  x2?: number         // end point x percentage
  y2?: number         // end point y percentage
  // For resizable bubbles
  width?: number      // width in pixels
  height?: number     // height in pixels
  fontSize?: number   // font size in pixels
  opacity?: number    // background opacity 0-1
  borderless?: boolean // hide border
  createdAt: Date
  updatedAt: Date
}

// Database instance with typed tables
const db = new Dexie('FermataDB') as Dexie & {
  songs: EntityTable<Song, 'id'>
  sheetMusic: EntityTable<SheetMusic, 'id'>
  practiceLogs: EntityTable<PracticeLog, 'id'>
  recordings: EntityTable<Recording, 'id'>
  tags: EntityTable<Tag, 'id'>
  songTags: EntityTable<SongTag, 'songId'>
  annotations: EntityTable<Annotation, 'id'>
  textNotes: EntityTable<TextNote, 'id'>
}

db.version(4).stores({
  songs: 'id, title, composer, category, difficulty, favorite, createdAt, updatedAt, lastOpenedAt',
  sheetMusic: 'id, songId, fileType, createdAt',
  practiceLogs: 'id, songId, date, rating',
  recordings: 'id, songId, date',
  tags: 'id, &name', // unique name
  songTags: '[songId+tagId], songId, tagId', // composite primary key
  annotations: 'id, songId, sheetMusicId, page, type, createdAt',
  textNotes: 'id, sheetMusicId, createdAt',
})

export { db }
