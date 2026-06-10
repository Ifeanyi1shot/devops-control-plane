import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const NAV_LINKS = [
  { to: '/', label: 'Services', exact: true },
  { to: '/audit', label: 'Audit Log', exact: false },
  { to: '/metrics', label: 'Metrics', exact: false },
]

export function NavBar() {
  const location = useLocation()
  const { user, logout } = useAuth()

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
          {user ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <img
                  src={user.avatarUrl}
                  alt={user.name}
                  className="w-7 h-7 rounded-full border border-slate-600"
                />
                <div className="hidden sm:block">
                  <p className="text-xs text-white font-medium leading-none">{user.name}</p>
                  <p className="text-xs text-slate-400 leading-none mt-0.5">{user.role}</p>
                </div>
              </div>
              <button
                onClick={logout}
                className="text-xs text-slate-400 hover:text-white transition-colors"
              >
                Sign out
              </button>
            </div>
          ) : (
            <a
              href="/auth/github"
              className="flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded bg-white text-gray-900 hover:bg-gray-100 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>
              Login with GitHub
            </a>
          )}
        </div>
      </div>
    </nav>
  )
}
