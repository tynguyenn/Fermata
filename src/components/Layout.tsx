import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { Search, Circle } from 'lucide-react'
import { CircleOfFifthsPopup } from './CircleOfFifthsPopup'

const navItems = [
  { to: '/', label: 'Home' },
  { to: '/library', label: 'Library' },
  { to: '/practice', label: 'Practice' },
]

export function Layout() {
  const [circleOfFifthsOpen, setCircleOfFifthsOpen] = useState(false)

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 overflow-x-hidden">
      {/* Top Header Navigation */}
      <header className="sticky top-0 z-30 bg-zinc-950 border-b border-zinc-800">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center gap-8">
          {/* Logo */}
          <h1 className="text-xl font-semibold">Fermata</h1>

          {/* Nav Links */}
          <nav className="flex items-center gap-10">
            {navItems.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `px-4 py-2 rounded-md text-lg font-bold transition-colors ${
                    isActive
                      ? 'bg-zinc-800 text-white'
                      : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
                  }`
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Search */}
          <div className="relative w-64">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              placeholder="Search..."
              disabled
              className="w-full pl-10 pr-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        <Outlet />
      </main>

      {/* Circle of Fifths Popup */}
      <CircleOfFifthsPopup
        isOpen={circleOfFifthsOpen}
        onClose={() => setCircleOfFifthsOpen(false)}
      />
    </div>
  )
}

/*
 * SIDEBAR LAYOUT (kept for reference)
 *
 * const navItems = [
 *   { to: '/', icon: Home, label: 'Dashboard' },
 *   { to: '/library', icon: Music, label: 'Library' },
 *   { to: '/practice', icon: PlayCircle, label: 'Practice' },
 * ]
 *
 * <div className="flex h-screen bg-zinc-950 text-zinc-100">
 *   <aside className={`${sidebarOpen ? 'w-64' : 'w-20'} p-4 flex flex-col transition-all duration-200 shrink-0`}>
 *     <div className={`flex items-center h-10 mb-4 ${sidebarOpen ? 'justify-between' : 'justify-center'}`}>
 *       {sidebarOpen && <h1 className="text-xl font-semibold px-2">Fermata</h1>}
 *       <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/50 transition-colors">
 *         {sidebarOpen ? <PanelLeftClose size={20} /> : <PanelLeft size={20} />}
 *       </button>
 *     </div>
 *     <nav className="flex flex-col gap-2">
 *       {navItems.map(({ to, icon: Icon, label }) => (
 *         <NavLink key={to} to={to} className={({ isActive }) => `flex items-center gap-3 py-3 rounded-lg transition-colors ${sidebarOpen ? 'px-3' : 'justify-center'} ${isActive ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'}`}>
 *           <Icon size={20} />
 *           {sidebarOpen && <span>{label}</span>}
 *         </NavLink>
 *       ))}
 *     </nav>
 *   </aside>
 *   <div className="flex-1 flex flex-col min-w-0">
 *     <div className="flex-1 flex flex-col py-2 pr-2 min-h-0">
 *       <main className="flex-1 overflow-y-auto overflow-x-hidden rounded-xl bg-zinc-900 p-6">
 *         <Outlet />
 *       </main>
 *     </div>
 *   </div>
 * </div>
 */
