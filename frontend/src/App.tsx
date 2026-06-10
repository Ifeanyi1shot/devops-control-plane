import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { NavBar } from './components/NavBar'
import { AuthProvider } from './contexts/AuthContext'
import { AuditLogPage } from './pages/AuditLogPage'
import { AuthCallbackPage } from './pages/AuthCallbackPage'
import { PreviewEnvsPage } from './pages/PreviewEnvsPage'
import { RollbackPreviewPage } from './pages/RollbackPreviewPage'
import { ServiceDetailPage } from './pages/ServiceDetailPage'
import { ServicesPage } from './pages/ServicesPage'

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-gray-50">
          <NavBar />
          <Routes>
            <Route path="/" element={<ServicesPage />} />
            <Route path="/services/:id" element={<ServiceDetailPage />} />
            <Route path="/rollback/preview" element={<RollbackPreviewPage />} />
            <Route path="/preview-env" element={<PreviewEnvsPage />} />
            <Route path="/audit" element={<AuditLogPage />} />
            <Route path="/auth/callback" element={<AuthCallbackPage />} />
          </Routes>
        </div>
      </BrowserRouter>
    </AuthProvider>
  )
}
