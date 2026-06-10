import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { storeToken } from '../contexts/AuthContext'

export function AuthCallbackPage() {
  const navigate = useNavigate()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    const error = params.get('auth_error')

    if (token) {
      const user = storeToken(token)
      if (user) {
        navigate('/', { replace: true })
        return
      }
    }

    navigate(`/?auth_error=${error ?? 'invalid_token'}`, { replace: true })
  }, [navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-gray-500">Completing login...</p>
      </div>
    </div>
  )
}
