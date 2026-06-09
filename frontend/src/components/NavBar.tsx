import { Link, useLocation } from 'react-router-dom'

export function NavBar() {
  const location = useLocation()
  const isHome = location.pathname === '/'

  return (
    <nav className="bg-slate-900 border-b border-slate-700">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-4">
        <Link to="/" className="flex items-center gap-2 text-white font-semibold tracking-tight">
          <span className="text-blue-400 text-lg">⚙</span>
          <span>DevOps Control Plane</span>
        </Link>

        {!isHome && (
          <span className="text-slate-500 text-sm select-none">
            /
          </span>
        )}

        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-slate-400 font-mono bg-slate-800 px-2 py-1 rounded">
            MVP · Rollback
          </span>
        </div>
      </div>
    </nav>
  )
}
