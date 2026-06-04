import { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider } from './context/ThemeContext'
import Navbar from './components/Navbar'
import ChatPanel from './components/ChatPanel'
import Welcome from './modules/discovery/pages/Welcome'
import DiscoveryStages from './modules/discovery/pages/DiscoveryStages'
import PatternDetail from './modules/discovery/pages/PatternDetail'
import PatternsList from './modules/discovery/pages/PatternsList'
import ClassifierDetail from './modules/discovery/pages/ClassifierDetail'
import ClassifiersList from './modules/discovery/pages/ClassifiersList'
import IREPage from './modules/discovery/pages/IREPage'
import DiscoveryCredentials from './modules/discovery/pages/DiscoveryCredentials'

export default function App() {
  const [chatOpen, setChatOpen] = useState(false)

  return (
    <ThemeProvider>
      <BrowserRouter>
        <div className="app-shell">
          <Navbar onChatOpen={() => setChatOpen(true)} />
          <main className="app-main">
            <Routes>
              <Route path="/discovery" element={<Welcome />} />
              <Route path="/discovery/patterns" element={<PatternsList />} />
              <Route path="/discovery/patterns/:id" element={<PatternDetail />} />
              <Route path="/discovery/classifiers" element={<ClassifiersList />} />
              <Route path="/discovery/classifiers/:id" element={<ClassifierDetail />} />
              <Route path="/discovery/stages" element={<DiscoveryStages />} />
              <Route path="/discovery/ire" element={<IREPage />} />
              <Route path="/discovery/credentials" element={<DiscoveryCredentials />} />
              <Route path="*" element={<Navigate to="/discovery" replace />} />
            </Routes>
          </main>
        </div>
        <ChatPanel open={chatOpen} onClose={() => setChatOpen(false)} />
      </BrowserRouter>
    </ThemeProvider>
  )
}
