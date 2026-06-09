import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { NavBar } from './components/NavBar'
import { PreviewEnvsPage } from './pages/PreviewEnvsPage'
import { RollbackPreviewPage } from './pages/RollbackPreviewPage'
import { ServiceDetailPage } from './pages/ServiceDetailPage'
import { ServicesPage } from './pages/ServicesPage'

export function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <NavBar />
        <Routes>
          <Route path="/" element={<ServicesPage />} />
          <Route path="/services/:id" element={<ServiceDetailPage />} />
          <Route path="/rollback/preview" element={<RollbackPreviewPage />} />
          <Route path="/preview-env" element={<PreviewEnvsPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  )
}
