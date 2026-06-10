import { Link, useLocation } from 'react-router-dom'

const NAV_LINKS = [
  { to: '/', label: 'Services', exact: true },
  { to: '/audit', label: 'Audit Log', exact: false },
]

export function NavBar() {
  const location = useLocation()

  function isActive(to: string, exact: boolean) {
    return exact ? location.pathname === to : location.pathname.startsWith(to)
  }

  return (
    <nav className="bg-slate-900 border-b border-slate-700">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-6">
        <Link to="/" className="flex items-center gap-2 text-white font-semibold tracking-tight shrink-0">
          <span className="text-blue-400 text-lg">⚙</span>
          <span>DevOps Control Plane</span>
        </Link>

        <div className="flex items-center gap-1">
          {NAV_LINKS.map(({ to, label, exact }) => (
            <Link
              key={to}
              to={to}
              className={`text-sm px-3 py-1.5 rounded transition-colors ${
                isActive(to, exact)
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              {label}
            </Link>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-slate-400 font-mono bg-slate-800 px-2 py-1 rounded">
            MVP · Rollback
          </span>
        </div>
      </div>
    </nav>
  )
}
