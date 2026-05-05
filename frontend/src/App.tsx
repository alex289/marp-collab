import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { ShieldCheck, Users } from 'lucide-react'

import { CollabEditor } from '@/components/collab-editor'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  apiBaseUrl,
  fetchSession,
  signInWithEmail,
  signOut,
  signUpWithEmail,
  type SessionPayload,
} from '@/lib/api'

function createGuestName(): string {
  return `Guest-${Math.floor(1000 + Math.random() * 9000)}`
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message
  }

  return 'Etwas ist schiefgelaufen.'
}

function App() {
  const [room, setRoom] = useState('shared-notes')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [session, setSession] = useState<SessionPayload | null>(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [pending, setPending] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const guestName = useMemo(() => createGuestName(), [])
  const activeRoom = room.trim() || 'shared-notes'
  const displayName = session?.user.name || name.trim() || guestName

  const refreshSession = useCallback(async () => {
    try {
      setSessionLoading(true)
      const currentSession = await fetchSession()
      setSession(currentSession)
    } catch (sessionError) {
      setError(toErrorMessage(sessionError))
    } finally {
      setSessionLoading(false)
    }
  }, [])

  useEffect(() => {
    void refreshSession()
  }, [refreshSession])

  const handleSignUp = useCallback(async () => {
    setError(null)
    setFeedback(null)

    if (!name.trim() || !email.trim() || !password.trim()) {
      setError('Bitte Name, E-Mail und Passwort ausfuellen.')
      return
    }

    try {
      setPending(true)
      await signUpWithEmail({
        name: name.trim(),
        email: email.trim(),
        password,
      })

      await refreshSession()
      setFeedback('Account erstellt und automatisch eingeloggt.')
    } catch (signUpError) {
      setError(toErrorMessage(signUpError))
    } finally {
      setPending(false)
    }
  }, [email, name, password, refreshSession])

  const handleSignIn = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      setError(null)
      setFeedback(null)

      if (!email.trim() || !password.trim()) {
        setError('Bitte E-Mail und Passwort angeben.')
        return
      }

      try {
        setPending(true)
        await signInWithEmail({
          email: email.trim(),
          password,
        })

        await refreshSession()
        setFeedback('Erfolgreich eingeloggt.')
      } catch (signInError) {
        setError(toErrorMessage(signInError))
      } finally {
        setPending(false)
      }
    },
    [email, password, refreshSession],
  )

  const handleSignOut = useCallback(async () => {
    setError(null)
    setFeedback(null)

    try {
      setPending(true)
      await signOut()
      await refreshSession()
      setFeedback('Du bist abgemeldet.')
    } catch (signOutError) {
      setError(toErrorMessage(signOutError))
    } finally {
      setPending(false)
    }
  }, [refreshSession])

  return (
    <main className="min-h-screen bg-[radial-gradient(130%_130%_at_5%_0%,#fff2ca_0%,transparent_40%),radial-gradient(130%_130%_at_100%_100%,#daf4ff_0%,#f8fafc_55%)] p-4 sm:p-6 lg:p-10">
      <div className="mx-auto grid w-full max-w-7xl gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="h-fit border-black/10 bg-white/85 shadow-[0_30px_90px_-50px_rgba(0,0,0,0.6)] backdrop-blur">
          <CardHeader className="space-y-4">
            <Badge className="w-fit border-transparent bg-black text-white">Realtime Collaboration</Badge>
            <div>
              <CardTitle className="text-2xl">Monaco + Yjs Playground</CardTitle>
              <CardDescription className="mt-2 leading-relaxed text-black/70">
                Mehrere Nutzer koennen gleichzeitig schreiben. Auth laeuft ueber Better Auth,
                Datenhaltung ueber Drizzle + SQLite.
              </CardDescription>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="room">Room</Label>
              <Input
                id="room"
                value={room}
                onChange={(event) => setRoom(event.target.value)}
                placeholder="shared-notes"
              />
            </div>

            <div className="rounded-2xl border border-black/10 bg-white px-4 py-3">
              <p className="text-xs uppercase tracking-[0.14em] text-black/45">Aktiver Name</p>
              <p className="mt-1 text-sm font-semibold text-black">{displayName}</p>
            </div>

            <div className="flex items-center justify-between rounded-2xl border border-black/10 bg-white px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-black/70">
                <ShieldCheck className="size-4" />
                <span>{session ? 'Authentifiziert' : 'Gastmodus'}</span>
              </div>
              <Badge variant="secondary" className="font-mono text-[10px] uppercase tracking-wider">
                {sessionLoading ? 'loading' : session ? 'online' : 'anonymous'}
              </Badge>
            </div>

            <Separator />

            {session ? (
              <div className="space-y-3">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                  Eingeloggt als <strong>{session.user.email}</strong>
                </div>
                <Button onClick={handleSignOut} disabled={pending} className="w-full">
                  Abmelden
                </Button>
              </div>
            ) : (
              <form className="space-y-3" onSubmit={handleSignIn}>
                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="z. B. Alex"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">E-Mail</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@example.com"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Passwort</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="mindestens 8 Zeichen"
                  />
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <Button type="button" variant="outline" onClick={handleSignUp} disabled={pending}>
                    Registrieren
                  </Button>
                  <Button type="submit" disabled={pending}>
                    Einloggen
                  </Button>
                </div>
              </form>
            )}

            {feedback ? (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                {feedback}
              </p>
            ) : null}

            {error ? (
              <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
                {error}
              </p>
            ) : null}

            <p className="text-xs text-black/45">Backend: {apiBaseUrl}</p>
          </CardContent>
        </Card>

        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-black/10 bg-white/80 px-5 py-4 shadow-[0_20px_70px_-45px_rgba(0,0,0,0.5)] backdrop-blur">
            <div>
              <p className="text-xs uppercase tracking-[0.16em] text-black/45">Live Room</p>
              <h1 className="text-2xl font-semibold tracking-tight text-black">{activeRoom}</h1>
            </div>
            <div className="flex items-center gap-2 text-sm text-black/70">
              <Users className="size-4" />
              <span>Schreib gemeinsam in Echtzeit</span>
            </div>
          </div>

          <CollabEditor room={activeRoom} displayName={displayName} />
        </section>
      </div>
    </main>
  )
}

export default App
