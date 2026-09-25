import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppProvider, useApp } from './context/AppContext'
import Layout from './components/Layout'
import ProfileSelector from './pages/ProfileSelector'
import Dashboard from './pages/Dashboard'
import ImportExcel from './pages/ImportExcel'
import Taches from './pages/Taches'
import Equipes from './pages/Equipes'
import Affectation from './pages/Affectation'
import Export from './pages/Export'
import Preparation from './pages/Preparation'
import BlocNotes from './pages/BlocNotes'
import Consignes from './pages/Consignes'
import Messagerie from './pages/Messagerie'
import ImportConsignes from './pages/ImportConsignes'
import Admin from './pages/Admin'
import Primes from './pages/Primes'

function AppContent() {
  const { activeProfile, loading, error, isAdmin } = useApp()
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center gap-3">
        <p className="text-slate-500">Chargement…</p>
        {error && <p className="text-sm text-red-600 max-w-md text-center">{error}</p>}
      </div>
    )
  }
  if (!activeProfile) return <ProfileSelector />
  if (isAdmin === null) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center gap-3">
        <p className="text-slate-500">Vérification des droits…</p>
      </div>
    )
  }
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/import" element={<ImportExcel />} />
        <Route path="/taches" element={<Taches />} />
        <Route path="/equipes" element={<Equipes />} />
        <Route path="/affectation" element={<Affectation />} />
        <Route path="/preparation" element={<Preparation />} />
        <Route path="/notes" element={<BlocNotes />} />
        <Route path="/consignes" element={<Consignes />} />
        <Route path="/messagerie" element={<Messagerie />} />
        <Route path="/export" element={<Export />} />
        {isAdmin && <Route path="/admin" element={<Admin />} />}
        {isAdmin && <Route path="/primes" element={<Primes />} />}
        {isAdmin && <Route path="/import-consignes" element={<ImportConsignes />} />}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}

function App() {
  return (
    <AppProvider>
      <HashRouter>
        <AppContent />
      </HashRouter>
    </AppProvider>
  )
}

export default App
