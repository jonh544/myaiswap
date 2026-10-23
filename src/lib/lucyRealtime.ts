import { fal, type TokenProvider } from '@fal-ai/client'

export const LUCY_ENDPOINT = 'decart/lucy-2-5/realtime'
export const FAL_TOKEN_EXPIRATION_SECONDS = 120

export type LucyInput = {
  prompt: string
  reference_image_url: string | null
  enable_prompt_expansion: boolean
}

type LucyWireMessage = Partial<LucyInput> & {
  type?: string
  sdp?: string
  candidate?: RTCIceCandidateInit | null
  iceServers?: RTCIceServer[]
  ice_servers?: RTCIceServer[]
  iceservers?: RTCIceServer[]
}

type FalRealtimeConnection = {
  send: (input: LucyWireMessage) => void
  close: () => void
}

type LucyConnectionState = 'negotiating' | RTCPeerConnectionState

type ConnectLucyOptions = {
  localStream: MediaStream
  input: LucyInput
  tokenProvider: TokenProvider
  onRemoteStream: (stream: MediaStream) => void
  onStateChange: (state: LucyConnectionState) => void
  onError: (error: Error) => void
}

export type LucySession = {
  send: (input: Partial<LucyInput>) => void
  close: () => void
}

export async function connectLucy(options: ConnectLucyOptions): Promise<LucySession> {
  let connection: FalRealtimeConnection | undefined
  let peer: RTCPeerConnection | undefined
  let closed = false
  let negotiated = false
  let remoteDescriptionSet = false
  let applyingRemoteDescription = false
  let iceGraceTimer: ReturnType<typeof setTimeout> | undefined
  let negotiationTimer: ReturnType<typeof setTimeout> | undefined
  const pendingCandidates: RTCIceCandidateInit[] = []

  let resolveNegotiation!: () => void
  let rejectNegotiation!: (error: Error) => void
  const negotiation = new Promise<void>((resolve, reject) => {
    resolveNegotiation = resolve
    rejectNegotiation = reject
  })
  void negotiation.catch(() => undefined)

  const cleanup = () => {
    if (closed) return
    closed = true
    clearTimeout(iceGraceTimer)
    clearTimeout(negotiationTimer)
    connection?.close()
    peer?.close()
    options.onStateChange('closed')
  }

  const fail = (reason: unknown) => {
    if (closed) return
    const error = reason instanceof Error ? reason : new Error(String(reason))
    if (!negotiated) {
      rejectNegotiation(error)
    } else {
      options.onError(error)
    }
    cleanup()
  }

  const flushCandidates = async () => {
    if (!peer || !remoteDescriptionSet) return
    for (const candidate of pendingCandidates.splice(0)) {
      await peer.addIceCandidate(new RTCIceCandidate(candidate))
    }
  }

  const initializePeer = async (iceServers?: RTCIceServer[]) => {
    if (peer || closed) return
    clearTimeout(iceGraceTimer)
    peer = new RTCPeerConnection({
      iceServers: iceServers ?? [{ urls: 'stun:stun.l.google.com:19302' }],
    })

    for (const track of options.localStream.getVideoTracks()) {
      peer.addTrack(track, options.localStream)
    }

    peer.ontrack = (event) => {
      const stream = event.streams[0] ?? new MediaStream([event.track])
      options.onRemoteStream(stream)
    }
    peer.onicecandidate = (event) => {
      if (event.candidate) {
        connection?.send({
          type: 'icecandidate',
          candidate: {
            candidate: event.candidate.candidate,
            sdpMid: event.candidate.sdpMid,
            sdpMLineIndex: event.candidate.sdpMLineIndex,
          },
        })
      }
    }
    peer.onconnectionstatechange = () => {
      if (!peer) return
      options.onStateChange(peer.connectionState)
      if (peer.connectionState === 'failed') {
        fail(new Error('Lucy WebRTC connection failed. Check network and firewall access.'))
      }
    }

    const offer = await peer.createOffer()
    await peer.setLocalDescription(offer)
    if (!offer.sdp) throw new Error('The browser did not create a WebRTC offer.')
    connection?.send({ type: 'offer', sdp: offer.sdp })
  }

  const handleMessage = async (message: LucyWireMessage) => {
    switch (message.type?.toLowerCase()) {
      case 'ready': {
        const servers = message.iceServers ?? message.ice_servers ?? message.iceservers
        if (servers) {
          await initializePeer(servers)
        } else {
          iceGraceTimer = setTimeout(() => {
            void initializePeer().catch(fail)
          }, 1_000)
        }
        break
      }
      case 'iceservers':
        await initializePeer(message.iceServers ?? message.ice_servers ?? message.iceservers)
        break
      case 'answer':
        if (!peer || !message.sdp || remoteDescriptionSet || applyingRemoteDescription) return
        applyingRemoteDescription = true
        try {
          await peer.setRemoteDescription({ type: 'answer', sdp: message.sdp })
          remoteDescriptionSet = true
          await flushCandidates()
          negotiated = true
          clearTimeout(negotiationTimer)
          resolveNegotiation()
        } finally {
          applyingRemoteDescription = false
        }
        break
      case 'icecandidate':
        if (!message.candidate) return
        if (!peer || !remoteDescriptionSet) {
          pendingCandidates.push(message.candidate)
        } else {
          await peer.addIceCandidate(new RTCIceCandidate(message.candidate))
        }
        break
      case 'error':
        fail(new Error('Lucy reported a realtime signaling error.'))
        break
    }
  }

  options.onStateChange('negotiating')
  negotiationTimer = setTimeout(() => {
    fail(new Error('Lucy did not complete WebRTC negotiation within 20 seconds.'))
  }, 20_000)

  try {
    connection = fal.realtime.connect<LucyWireMessage, LucyWireMessage>(LUCY_ENDPOINT, {
      connectionKey: `lucy-${crypto.randomUUID()}`,
      throttleInterval: 0,
      tokenProvider: options.tokenProvider,
      tokenExpirationSeconds: FAL_TOKEN_EXPIRATION_SECONDS,
      onResult: (message) => {
        void handleMessage(message).catch(fail)
      },
      onError: (error) => fail(new Error(error.message)),
    })
    connection.send(options.input)
    await negotiation
  } catch (error) {
    cleanup()
    throw error instanceof Error ? error : new Error(String(error))
  }

  return {
    send: (input) => {
      if (closed) throw new Error('The Lucy realtime session is closed.')
      connection?.send(input)
    },
    close: cleanup,
  }
}
