import { useState } from 'react'
import { EditorPage } from './pages/EditorPage'
import { HomePage } from './pages/HomePage'
import type { TemplateId } from './templates'
import './App.css'

function App() {
  const [templateId, setTemplateId] = useState<TemplateId | null>(null)

  if (!templateId) {
    return <HomePage onSelectTemplate={setTemplateId} />
  }

  return <EditorPage templateId={templateId} onBack={() => setTemplateId(null)} />
}

export default App
