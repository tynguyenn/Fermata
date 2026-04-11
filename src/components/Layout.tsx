import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Home, Music, PlayCircle, PanelLeftClose, PanelLeft, Search, Circle } from 'lucide-react'
import { CircleOfFifthsPopup } from './CircleOfFifthsPopup'

const navItems = [
  { to: '/', icon: Home, label: 'Dashboard' },
  { to: '/library', icon: Music, label: 'Library' },
  { to: '/practice', icon: PlayCircle, label: 'Practice' },
]

export function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [circleOfFifthsOpen, setCircleOfFifthsOpen] = useState(false)

  return (
    <div className="flex h-screen bg-zinc-950 text-zinc-100">
      {/* Sidebar - part of the outer shell */}
      <aside
        className={`${
          sidebarOpen ? 'w-64' : 'w-20'
        } p-4 flex flex-col transition-all duration-200 shrink-0`}
      >
        <div className={`flex items-center h-10 mb-4 ${sidebarOpen ? 'justify-between' : 'justify-center'}`}>
          {sidebarOpen && <h1 className="text-xl font-semibold px-2">Fermata</h1>}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/50 transition-colors"
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {sidebarOpen ? <PanelLeftClose size={20} /> : <PanelLeft size={20} />}
          </button>
        </div>
        <nav className="flex flex-col gap-2">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              title={sidebarOpen ? undefined : label}
              className={({ isActive }) =>
                `flex items-center gap-3 py-3 rounded-lg transition-colors ${
                  sidebarOpen ? 'px-3' : 'justify-center'
                } ${
                  isActive
                    ? 'bg-zinc-800 text-white'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
                }`
              }
            >
              <Icon size={20} />
              {sidebarOpen && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Right side - top bar + content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar with search - part of the shell */}
        <div className="h-10 flex items-center gap-3 px-4 py-4 mt-4">
          <div className="relative flex-1 max-w-md">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Search..."
              disabled
              className="w-full pl-10 pr-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          {/* Circle of Fifths button */}
          <button
            onClick={() => setCircleOfFifthsOpen(true)}
            className={`p-2 rounded-lg transition-colors ${
              circleOfFifthsOpen
                ? 'bg-zinc-800 text-white'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
            }`}
            title="Circle of Fifths"
          >
            <Circle size={20} />
          </button>
        </div>

        {/* Content panel - inset effect */}
        <div className="flex-1 flex flex-col py-2 pr-2 min-h-0">
          <main className="flex-1 overflow-y-auto overflow-x-hidden rounded-xl bg-zinc-900 p-6">
            <Outlet />
          </main>
        </div>
      </div>

      {/* Circle of Fifths Popup */}
      <CircleOfFifthsPopup
        isOpen={circleOfFifthsOpen}
        onClose={() => setCircleOfFifthsOpen(false)}
      />
    </div>
  )
}
