import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom'

import { ChatPage } from './features/chat/ChatPage'
import { ConversationSidebar } from './features/chat/ConversationSidebar'
import { CreateConversationDialog } from './features/chat/CreateConversationDialog'
import { WelcomePage } from './features/chat/WelcomePage'
import { KeyGate } from './features/key-gate/KeyGate'
import { SettingsDialog } from './features/settings/SettingsPage'
import { VideoTaskPoller } from './features/video-workbench/VideoTaskPoller'
import { useProviderMetadata } from './hooks/use-provider-metadata'
import { useTheme } from './hooks/use-theme'
import { markInterruptedImageMessages } from './storage/db'
import type { MediaKind } from './storage/settings'

export default function App() {
  useTheme()
  useProviderMetadata()
  useEffect(() => {
    void markInterruptedImageMessages()
  }, [])

  return (
    <BrowserRouter>
      <KeyGate>
        <VideoTaskPoller />
        <AppShell />
      </KeyGate>
    </BrowserRouter>
  )
}

function AppShell() {
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [newKind, setNewKind] = useState<MediaKind>('image')
  const [settingsOpen, setSettingsOpen] = useState(false)

  const openCreate = (kind: MediaKind) => {
    setNewKind(kind)
    setCreateOpen(true)
  }

  return (
    <div className="h-screen overflow-hidden bg-[var(--ds-bg-base)] text-[var(--ds-text-primary)]">
      <ConversationSidebar
        mobileOpen={sidebarOpen}
        onMobileOpenChange={setSidebarOpen}
        onNew={() => openCreate('image')}
        onSettings={() => {
          setSidebarOpen(false)
          setSettingsOpen(true)
        }}
      />
      <main className="h-full min-w-0 lg:ml-[var(--ds-sider-width)]">
        <Routes>
          <Route
            path="/"
            element={
              <WelcomePage
                onOpenSidebar={() => setSidebarOpen(true)}
                onNewImage={() => openCreate('image')}
                onNewVideo={() => openCreate('video')}
              />
            }
          />
          <Route path="/chat/:conversationId" element={<ChatPage onOpenSidebar={() => setSidebarOpen(true)} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <CreateConversationDialog
        open={createOpen}
        initialKind={newKind}
        onOpenChange={setCreateOpen}
        onCreated={(conversation) => void navigate(`/chat/${conversation.id}`)}
      />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  )
}
