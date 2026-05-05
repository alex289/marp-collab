export type SessionPayload = {
  user: {
    id: string
    name: string
    email: string
    image: string | null
  }
  session: {
    id: string
    expiresAt: string
  }
}

export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'

export function getWsBaseUrl(): string {
  if (import.meta.env.VITE_WS_BASE_URL) {
    return import.meta.env.VITE_WS_BASE_URL
  }

  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${protocol}://localhost:3000/yjs`
}

function normalizeErrorMessage(value: unknown): string {
  if (!value) {
    return 'Unbekannter Fehler'
  }

  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'object' && value !== null) {
    const withMessage = value as { message?: unknown; error?: { message?: unknown } }

    if (typeof withMessage.message === 'string') {
      return withMessage.message
    }

    if (typeof withMessage.error?.message === 'string') {
      return withMessage.error.message
    }
  }

  return 'Unbekannter Fehler'
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as unknown
    return normalizeErrorMessage(body)
  } catch {
    return `Request failed with status ${response.status}`
  }
}

async function postAuth(path: string, payload?: Record<string, unknown>): Promise<void> {
  const response = await fetch(`${apiBaseUrl}/api/auth/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: payload ? JSON.stringify(payload) : undefined,
  })

  if (!response.ok) {
    throw new Error(await readErrorMessage(response))
  }
}

export async function fetchSession(): Promise<SessionPayload | null> {
  const response = await fetch(`${apiBaseUrl}/api/session`, {
    method: 'GET',
    credentials: 'include',
  })

  if (response.status === 401) {
    return null
  }

  if (!response.ok) {
    throw new Error(await readErrorMessage(response))
  }

  return (await response.json()) as SessionPayload
}

export async function signUpWithEmail(payload: {
  name: string
  email: string
  password: string
}): Promise<void> {
  await postAuth('sign-up/email', payload)
}

export async function signInWithEmail(payload: {
  email: string
  password: string
}): Promise<void> {
  await postAuth('sign-in/email', payload)
}

export async function signOut(): Promise<void> {
  await postAuth('sign-out')
}
