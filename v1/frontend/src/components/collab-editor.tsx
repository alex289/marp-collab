import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import type { editor as MonacoEditor } from 'monaco-editor'
import { MonacoBinding } from 'y-monaco'
import { WebsocketProvider } from 'y-websocket'
import * as Y from 'yjs'

import { Badge } from '@/components/ui/badge'
import { getWsBaseUrl } from '@/lib/api'
import '@/lib/monaco'
import { cn } from '@/lib/utils'

type ConnectionState = 'connecting' | 'connected' | 'disconnected'

type CollabEditorProps = {
  room: string
  displayName: string
}

function createUserColor(input: string): string {
  let hash = 0

  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index)
    hash |= 0
  }

  const hue = Math.abs(hash) % 360
  return `hsl(${hue} 72% 46%)`
}

export function CollabEditor({ room, displayName }: CollabEditorProps) {
  const [status, setStatus] = useState<ConnectionState>('connecting')
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null)
  const docRef = useRef<Y.Doc | null>(null)
  const providerRef = useRef<WebsocketProvider | null>(null)
  const bindingRef = useRef<MonacoBinding | null>(null)

  const wsBaseUrl = useMemo(() => getWsBaseUrl(), [])
  const userColor = useMemo(() => createUserColor(displayName), [displayName])

  const destroyBinding = useCallback(() => {
    bindingRef.current?.destroy()
    providerRef.current?.destroy()
    docRef.current?.destroy()

    bindingRef.current = null
    providerRef.current = null
    docRef.current = null
  }, [])

  const connectRoom = useCallback(() => {
    const editor = editorRef.current
    if (!editor) {
      return
    }

    const model = editor.getModel()
    if (!model) {
      return
    }

    destroyBinding()

    const yDoc = new Y.Doc()
    const provider = new WebsocketProvider(wsBaseUrl, room, yDoc)

    provider.on('status', (event: { status: ConnectionState }) => {
      setStatus(event.status)
    })

    provider.awareness.setLocalStateField('user', {
      name: displayName,
      color: userColor,
    })

    const yText = yDoc.getText('monaco')
    const binding = new MonacoBinding(yText, model, new Set([editor]), provider.awareness)

    docRef.current = yDoc
    providerRef.current = provider
    bindingRef.current = binding
    setStatus('connecting')
  }, [destroyBinding, displayName, room, userColor, wsBaseUrl])

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor
    connectRoom()
  }

  useEffect(() => {
    if (editorRef.current) {
      connectRoom()
    }

    return () => {
      destroyBinding()
    }
  }, [connectRoom, destroyBinding])

  return (
    <div className="flex h-full min-h-[60vh] flex-col overflow-hidden rounded-3xl border border-black/10 bg-white shadow-[0_20px_70px_-40px_rgba(0,0,0,0.45)]">
      <div className="flex items-center justify-between border-b border-black/10 px-4 py-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-black/55">Room</p>
          <p className="font-mono text-sm text-black/80">{room}</p>
        </div>
        <Badge
          className={cn(
            'border-transparent text-white',
            status === 'connected' && 'bg-emerald-600',
            status === 'connecting' && 'bg-amber-500',
            status === 'disconnected' && 'bg-rose-600',
          )}
        >
          {status}
        </Badge>
      </div>

      <div className="relative flex-1">
        <Editor
          height="100%"
          defaultLanguage="markdown"
          theme="light"
          onMount={handleMount}
          loading={<div className="p-4 text-sm text-black/60">Editor wird geladen...</div>}
          options={{
            automaticLayout: true,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            fontSize: 14,
            minimap: { enabled: false },
            smoothScrolling: true,
            scrollBeyondLastLine: false,
            tabSize: 2,
            lineNumbersMinChars: 3,
            wordWrap: 'on',
            padding: { top: 16, bottom: 16 },
          }}
        />
      </div>
    </div>
  )
}
