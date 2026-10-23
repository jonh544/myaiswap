import type { IncomingMessage, ServerResponse } from 'node:http'

const FAL_ENDPOINT = 'decart/lucy-2-5/realtime'
const TOKEN_DURATION_SECONDS = 120

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(body))
}

export async function handleRealtimeTokenRequest(
  request: IncomingMessage,
  response: ServerResponse,
  falKey = process.env.FAL_KEY,
) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    sendJson(response, 405, { error: 'Use POST to request a realtime token.' })
    return
  }

  const origin = request.headers.origin
  const host = request.headers.host
  if (typeof origin !== 'string' || !host) {
    sendJson(response, 403, { error: 'A same-origin request is required.' })
    return
  }

  try {
    if (new URL(origin).host !== host) {
      sendJson(response, 403, { error: 'A same-origin request is required.' })
      return
    }
  } catch {
    sendJson(response, 403, { error: 'A valid same-origin request is required.' })
    return
  }

  if (!falKey?.trim()) {
    sendJson(response, 500, { error: 'FAL_KEY is not configured for this deployment.' })
    return
  }

  let falResponse: Response
  try {
    falResponse = await fetch('https://rest.fal.ai/tokens/realtime', {
      method: 'POST',
      headers: {
        Authorization: `Key ${falKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        allowed_apps: [FAL_ENDPOINT],
        duration: TOKEN_DURATION_SECONDS,
      }),
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    sendJson(response, 502, { error: 'Could not reach fal.ai to request a realtime token.' })
    return
  }

  if (!falResponse.ok) {
    sendJson(response, 502, {
      error: `fal.ai rejected the token request (HTTP ${falResponse.status}). Verify FAL_KEY and account access.`,
    })
    return
  }

  let tokenResponse: unknown
  try {
    tokenResponse = await falResponse.json()
  } catch {
    sendJson(response, 502, { error: 'fal.ai returned an invalid token response.' })
    return
  }

  if (
    typeof tokenResponse !== 'object'
    || tokenResponse === null
    || !('token' in tokenResponse)
    || typeof tokenResponse.token !== 'string'
    || !tokenResponse.token.trim()
  ) {
    sendJson(response, 502, { error: 'fal.ai returned an invalid token response.' })
    return
  }

  sendJson(response, 200, { token: tokenResponse.token })
}

export default function realtimeToken(request: IncomingMessage, response: ServerResponse) {
  return handleRealtimeTokenRequest(request, response)
}
