export function SightReadingGame() {
  // Staff dimensions
  const staffWidth = 800
  const lineSpacing = 12 // Space between staff lines
  const staffHeight = lineSpacing * 4 // 5 lines = 4 spaces
  const staffGap = 60 // Gap between treble and bass staves
  const clefWidth = 50

  // Total height for both staves
  const totalHeight = staffHeight * 2 + staffGap + 40

  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">Sight Reading</h2>

      <div className="bg-zinc-900 rounded-xl p-8 border border-zinc-800">
        <svg
          width={staffWidth}
          height={totalHeight}
          viewBox={`0 0 ${staffWidth} ${totalHeight}`}
          className="mx-auto"
        >
          {/* Grand Staff Brace */}
          <path
            d={`M 15 20
                Q 5 ${totalHeight / 2} 15 ${totalHeight - 20}
                Q 10 ${totalHeight / 2} 15 20`}
            fill="none"
            stroke="#a1a1aa"
            strokeWidth="2"
          />

          {/* Treble Staff (5 lines) */}
          {[0, 1, 2, 3, 4].map((i) => (
            <line
              key={`treble-${i}`}
              x1={20}
              y1={20 + i * lineSpacing}
              x2={staffWidth - 20}
              y2={20 + i * lineSpacing}
              stroke="#52525b"
              strokeWidth="1"
            />
          ))}

          {/* Treble Clef (G Clef) */}
          <g transform={`translate(30, ${20 - lineSpacing * 1.5}) scale(0.065)`}>
            <path
              d="M462 1054c0-100-26-207-73-327-9-23-40-109-45-116-2-2-2-4 0-4 15 0 92 80 121 130 34 58 52 131 52 210 0 73-28 143-81 195-39 38-81 62-175 96-18 7-33 13-33 14s17 43 38 94c60 150 88 264 88 366 0 145-55 249-160 304-48 25-90 35-155 35-115 0-203-56-239-153-13-35-13-102 1-140 24-68 69-117 129-142 25-11 78-19 102-16 81 11 136 73 136 153 0 72-48 126-118 133-27 3-28 4-15 15 31 26 90 29 135 6 68-34 102-114 102-240 0-95-21-186-75-335-19-52-36-97-37-99-2-2-25 2-52 9-92 25-174 32-237 19-141-28-227-107-262-242-6-22-8-53-5-68l4-27-31-41c-50-66-100-159-126-236-16-46-23-137-14-180 18-86 64-155 130-195 63-38 163-43 240-12 61 25 110 64 150 120 93 130 89 301-10 394-40 37-99 65-143 65-49 0-122-34-153-72-55-68-59-175-8-246 21-29 79-67 105-67 3 0-2 9-12 20-25 30-39 67-39 108 0 47 14 81 48 115 69 70 180 50 245-42 37-53 49-94 49-169 0-114-44-199-138-264-71-49-188-53-267-10-83 46-133 130-133 227 0 88 47 209 117 302l21 28 21-27c50-63 93-84 160-77 56 6 95 29 125 76 27 42 29 108 4 152-44 76-149 88-211 24-53-55-51-137 4-186 13-11 28-21 33-23 6-2 2 5-8 14-41 39-39 107 4 147 36 34 86 32 129-6 39-33 46-111 14-167-23-42-66-68-115-68-58 0-92 23-142 94l-35 50 11 31c45 122 64 199 71 284 3 40 3 40 22 34 71-24 137-62 170-96 44-47 65-104 65-175z"
              fill="#a1a1aa"
            />
          </g>

          {/* Bass Staff (5 lines) */}
          {[0, 1, 2, 3, 4].map((i) => (
            <line
              key={`bass-${i}`}
              x1={20}
              y1={20 + staffHeight + staffGap + i * lineSpacing}
              x2={staffWidth - 20}
              y2={20 + staffHeight + staffGap + i * lineSpacing}
              stroke="#52525b"
              strokeWidth="1"
            />
          ))}

          {/* Bass Clef (F Clef) */}
          <g transform={`translate(30, ${20 + staffHeight + staffGap - lineSpacing * 0.3}) scale(0.045)`}>
            <path
              d="M557 470c0-163-74-284-220-360-51-26-136-50-171-50-3 0 3 15 14 33 31 49 43 95 43 163 0 113-48 195-139 237-39 18-115 22-155 9-113-37-170-168-127-292 56-162 244-260 449-234 90 11 158 39 231 95 142 109 201 282 173 506-24 195-115 354-278 487-88 72-184 124-345 187l-35 14 30-21c189-133 314-284 374-452 32-90 44-157 49-271 2-45 4-48 7-51z M750 209c0-59-49-109-108-109-60 0-109 49-109 109 0 59 49 108 109 108 59 0 108-49 108-108z M750 442c0-59-49-109-108-109-60 0-109 50-109 109s49 108 109 108c59 0 108-49 108-108z"
              fill="#a1a1aa"
            />
          </g>

          {/* Vertical bar line at the end */}
          <line
            x1={staffWidth - 25}
            y1={20}
            x2={staffWidth - 25}
            y2={20 + staffHeight * 2 + staffGap}
            stroke="#52525b"
            strokeWidth="2"
          />

          {/* Vertical bar line at the start (after clef area) */}
          <line
            x1={clefWidth + 40}
            y1={20}
            x2={clefWidth + 40}
            y2={20 + staffHeight * 2 + staffGap}
            stroke="#52525b"
            strokeWidth="1"
          />
        </svg>
      </div>

      <p className="text-sm text-zinc-500 mt-4 text-center">
        Grand staff with treble and bass clefs
      </p>
    </div>
  )
}
