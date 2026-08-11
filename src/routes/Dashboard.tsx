import { ChevronDown } from 'lucide-react'

// Piano keyboard pattern: true = black key after this white key
const octavePattern = [true, true, false, true, true, true, false] // C, D, E, F, G, A, B

function PianoKeyboard({ octaves = 2 }: { octaves?: number }) {
  const whiteKeys = octaves * 7 + 1 // +1 for the final C

  return (
    <div className="relative h-56 md:h-72 lg:h-96 select-none">
      {/* White keys */}
      <div className="flex h-full">
        {Array.from({ length: whiteKeys }).map((_, i) => (
          <div
            key={i}
            className="flex-1 bg-white border-x border-zinc-300 rounded-b-lg shadow-lg hover:bg-zinc-100 transition-colors cursor-pointer"
          />
        ))}
      </div>
      {/* Black keys */}
      <div className="absolute inset-0 flex pointer-events-none">
        {Array.from({ length: whiteKeys }).map((_, i) => {
          const patternIndex = i % 7
          const hasBlackKey = octavePattern[patternIndex] && i < whiteKeys - 1

          return (
            <div key={i} className="flex-1 relative">
              {hasBlackKey && (
                <div
                  className="absolute top-0 -right-[20%] w-[40%] h-[60%] bg-zinc-900 rounded-b-md shadow-xl z-10 pointer-events-auto hover:bg-zinc-800 transition-colors cursor-pointer"
                  style={{
                    background: 'linear-gradient(to bottom, #1a1a1a 0%, #0a0a0a 100%)',
                    boxShadow: '0 4px 8px rgba(0,0,0,0.4), inset 0 -2px 4px rgba(0,0,0,0.3)'
                  }}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function Dashboard() {
  return (
    <div className="pt-16 md:pt-24">
      <p className="text-7xl md:text-8xl lg:text-9xl font-light text-emerald-400 mb-2 text-center">Welcome to</p>
      <h1 className="text-[8rem] md:text-[12rem] lg:text-[14rem] font-bold text-white leading-none text-center">Fermata</h1>

      {/* Piano keyboard - breaks out of container */}
      <div
        className="mt-24 md:mt-32 relative left-1/2 -translate-x-1/2"
        style={{ width: '100vw', maxWidth: '100vw', overflow: 'hidden' }}
      >
        <PianoKeyboard octaves={3} />
      </div>

      {/* Scroll indicator */}
      <div className="mt-24 md:mt-100 flex flex-col items-center text-center">
        <h2 className="text-4xl md:text-5xl lg:text-6xl font-semibold text-zinc-300">
          Scores and Practice
        </h2>
        <p className="mt-6 text-lg md:text-xl text-zinc-500 max-w-2xl">
          Your personal music companion. Organize your sheet music, annotate scores with notes and chord symbols, and sharpen your skills with interactive ear training and sight-reading exercises.
        </p>
        <ChevronDown size={64} className="mt-8 text-zinc-500 animate-bounce" />
      </div>
    </div>
  )
}
