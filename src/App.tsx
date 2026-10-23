import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { invoke, isTauri } from '@tauri-apps/api/core'
import type { TokenProvider } from '@fal-ai/client'
import {
  Activity,
  AlertCircle,
  ArrowDownToLine,
  ArrowUpRight,
  AudioLines,
  Camera,
  ChevronDown,
  CircleHelp,
  Clock3,
  Cpu,
  ImagePlus,
  LoaderCircle,
  Play,
  Plus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Square,
  Video,
  Wifi,
  X,
} from 'lucide-react'
import {
  connectLucy,
  LUCY_ENDPOINT,
  type LucyInput,
  type LucySession,
} from './lib/lucyRealtime'
import './App.css'

type ScreenName = 'studio' | 'identity' | 'devices' | 'history' | 'settings' | 'diagnostics'
type SessionState = 'disconnected' | 'requesting' | 'connecting' | 'connected' | 'live' | 'error'
type ApiState = 'unchecked' | 'requesting' | 'token-issued' | 'connected' | 'error'

type ReferenceImage = {
  id: string
  name: string
  dataUrl: string
  width: number
  height: number
}

type MediaDeviceOption = {
  id: string
  label: string
}

type HistoryRecord = {
  id: string
  title: string
  detail: string
  status: 'Connected' | 'Stopped' | 'Failed'
  createdAt: string
}

type AppSettings = {
  enablePromptExpansion: boolean
  autoRefreshDevices: boolean
}

const ENDPOINT = 'decart/lucy-2-5/realtime'
const MINIMUM_REFERENCE_DIMENSION = 512
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
const DEFAULT_PROMPT = 'Transform me into the character in the reference image.'
const DEFAULT_SETTINGS: AppSettings = {
  enablePromptExpansion: true,
  autoRefreshDevices: true,
}

const NAV_ITEMS: { id: ScreenName; label: string; icon: typeof Sparkles }[] = [
  { id: 'studio', label: 'Studio', icon: Sparkles },
  { id: 'identity', label: 'Character', icon: ImagePlus },
  { id: 'devices', label: 'Devices', icon: Camera },
  { id: 'history', label: 'Sessions', icon: Clock3 },
  { id: 'settings', label: 'Settings', icon: Settings2 },
  { id: 'diagnostics', label: 'Diagnostics', icon: Activity },
]

const emptyHistory: HistoryRecord[] = []

function formatClock(date = new Date()) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'An unexpected error occurred.'
}

function parseSettings(value: string): AppSettings {
  const parsed = JSON.parse(value) as Partial<AppSettings>
  return {
    enablePromptExpansion: typeof parsed.enablePromptExpansion === 'boolean'
      ? parsed.enablePromptExpansion
      : DEFAULT_SETTINGS.enablePromptExpansion,
    autoRefreshDevices: typeof parsed.autoRefreshDevices === 'boolean'
      ? parsed.autoRefreshDevices
      : DEFAULT_SETTINGS.autoRefreshDevices,
  }
}

function App() {
  const [activeScreen, setActiveScreen] = useState<ScreenName>('studio')
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT)
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [references, setReferences] = useState<ReferenceImage[]>([])
  const [selectedReferenceId, setSelectedReferenceId] = useState('')
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceOption[]>([])
  const [microphoneDevices, setMicrophoneDevices] = useState<MediaDeviceOption[]>([])
  const [selectedCameraId, setSelectedCameraId] = useState('')
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState('')
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)
  const [sessionState, setSessionState] = useState<SessionState>('disconnected')
  const [apiState, setApiState] = useState<ApiState>('unchecked')
  const [permissionStatus, setPermissionStatus] = useState<'not-requested' | 'granted' | 'blocked'>('not-requested')
  const [error, setError] = useState<string | null>(null)
  const [settingsError, setSettingsError] = useState<string | null>(null)
  const [history, setHistory] = useState<HistoryRecord[]>(emptyHistory)
  const [busy, setBusy] = useState(false)
  const [referenceError, setReferenceError] = useState<string | null>(null)
  const [settingsLoaded, setSettingsLoaded] = useState(false)

  const cameraStreamRef = useRef<MediaStream | null>(null)
  const sessionRef = useRef<LucySession | null>(null)
  const imageInputRef = useRef<HTMLInputElement | null>(null)

  const selectedReference = useMemo(
    () => references.find((image) => image.id === selectedReferenceId) ?? null,
    [references, selectedReferenceId],
  )
  const isSessionActive = sessionState === 'requesting' || sessionState === 'connecting' ||
    sessionState === 'connected' || sessionState === 'live'
  const hasValidInputs = Boolean(cameraStream?.getVideoTracks().length) &&
    Boolean(selectedReference) && Boolean(prompt.trim())

  const attachCameraVideo = useCallback((video: HTMLVideoElement | null) => {
    if (!video || !cameraStream) return
    video.srcObject = cameraStream
    void video.play().catch((playError: unknown) => {
      setError(`Camera preview could not start: ${errorMessage(playError)}`)
    })
  }, [cameraStream])

  const attachOutputVideo = useCallback((video: HTMLVideoElement | null) => {
    if (!video || !remoteStream) return
    video.srcObject = remoteStream
    void video.play().catch((playError: unknown) => {
      setError(`Transformed video playback failed: ${errorMessage(playError)}`)
    })
  }, [remoteStream])

  const refreshMediaDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setError('This desktop webview does not expose media-device enumeration.')
      return
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const cameras = devices
        .filter((device) => device.kind === 'videoinput')
        .map((device) => ({ id: device.deviceId, label: device.label || 'Camera' }))
      const microphones = devices
        .filter((device) => device.kind === 'audioinput')
        .map((device) => ({ id: device.deviceId, label: device.label || 'Microphone' }))

      setCameraDevices(cameras)
      setMicrophoneDevices(microphones)
      setSelectedCameraId((current) => current || cameras[0]?.id || '')
      setSelectedMicrophoneId((current) => current || microphones[0]?.id || '')
    } catch (deviceError) {
      setError(`Unable to enumerate camera and microphone devices: ${errorMessage(deviceError)}`)
    }
  }, [])

  const startCameraPreview = useCallback(async (deviceId: string) => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This desktop webview does not support camera capture.')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: deviceId ? { deviceId: { exact: deviceId } } : true,
        audio: false,
      })
      cameraStreamRef.current?.getTracks().forEach((track) => track.stop())
      cameraStreamRef.current = stream
      setCameraStream(stream)
      setError(null)
      if (settings.autoRefreshDevices) await refreshMediaDevices()
    } catch (cameraError) {
      setCameraStream(null)
      setError(`Unable to open the selected camera: ${errorMessage(cameraError)}`)
    }
  }, [refreshMediaDevices, settings.autoRefreshDevices])

  useEffect(() => {
    let cancelled = false
    const loadStoredState = async () => {
      try {
        if (isTauri()) {
          const stored = await invoke<string>('load_app_settings')
          if (!cancelled && stored) {
            setSettings(parseSettings(stored))
          }
        } else {
          const stored = localStorage.getItem('myaiswap-settings')
          if (!cancelled && stored) {
            setSettings(parseSettings(stored))
          }
        }

        const storedHistory = localStorage.getItem('myaiswap-session-history')
        if (!cancelled && storedHistory) {
          setHistory(JSON.parse(storedHistory) as HistoryRecord[])
        }
      } catch (loadError) {
        if (!cancelled) {
          setSettingsError(`Unable to load saved studio settings: ${errorMessage(loadError)}`)
        }
      } finally {
        if (!cancelled) setSettingsLoaded(true)
      }
    }

    void loadStoredState()
    // Device enumeration is asynchronous synchronization with the browser media API.
    // oxlint-disable-next-line react/set-state-in-effect
    void refreshMediaDevices()
    return () => {
      cancelled = true
    }
  }, [refreshMediaDevices])

  useEffect(() => {
    if (!selectedCameraId || isSessionActive) return
    // Camera acquisition synchronizes the selected device with the desktop media API.
    // oxlint-disable-next-line react/set-state-in-effect
    void startCameraPreview(selectedCameraId)
  }, [selectedCameraId, startCameraPreview, isSessionActive])

  useEffect(() => {
    if (!settingsLoaded) return
    const persistSettings = async () => {
      try {
        if (isTauri()) {
          await invoke('save_app_settings', { settings: JSON.stringify(settings) })
        } else {
          localStorage.setItem('myaiswap-settings', JSON.stringify(settings))
        }
        setSettingsError(null)
      } catch (saveError) {
        setSettingsError(`Unable to save studio settings: ${errorMessage(saveError)}`)
      }
    }
    void persistSettings()
  }, [settings, settingsLoaded])

  const requestMediaPermissions = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setPermissionStatus('blocked')
      setError('This desktop webview does not support camera and microphone permissions.')
      return
    }

    try {
      const temporaryStream = await navigator.mediaDevices.getUserMedia({
        video: selectedCameraId ? { deviceId: { exact: selectedCameraId } } : true,
        audio: selectedMicrophoneId ? { deviceId: { exact: selectedMicrophoneId } } : true,
      })
      temporaryStream.getTracks().forEach((track) => track.stop())
      setPermissionStatus('granted')
      setError(null)
      await refreshMediaDevices()
      if (selectedCameraId) await startCameraPreview(selectedCameraId)
    } catch (permissionError) {
      setPermissionStatus('blocked')
      setError(`Camera or microphone permission was denied: ${errorMessage(permissionError)}`)
    }
  }

  const stopCameraPreview = useCallback(() => {
    cameraStreamRef.current?.getTracks().forEach((track) => track.stop())
    cameraStreamRef.current = null
    setCameraStream(null)
  }, [])

  const addHistory = (record: HistoryRecord) => {
    setHistory((previous) => {
      const next = [record, ...previous].slice(0, 50)
      try {
        localStorage.setItem('myaiswap-session-history', JSON.stringify(next))
      } catch (storageError) {
        setError(`Unable to save session history: ${errorMessage(storageError)}`)
      }
      return next
    })
  }

  const recordSessionEvent = (title: string, detail: string, status: HistoryRecord['status']) => {
    addHistory({
      id: crypto.randomUUID(),
      title,
      detail,
      status,
      createdAt: formatClock(),
    })
  }

  const buildInput = (): LucyInput => {
    if (!selectedReference) throw new Error('Select a valid character reference image first.')
    if (!prompt.trim()) throw new Error('Write a prompt describing the desired transformation.')
    return {
      prompt: prompt.trim(),
      reference_image_url: selectedReference.dataUrl,
      enable_prompt_expansion: settings.enablePromptExpansion,
    }
  }

  const tokenProvider: TokenProvider = useCallback(async (app) => {
    if (app !== ENDPOINT) {
      throw new Error('The app requested a token for an unexpected fal endpoint.')
    }
    setApiState('requesting')
    try {
      let token: string
      if (isTauri()) {
        token = await invoke<string>('create_fal_realtime_token')
      } else {
        let response: Response
        try {
          response = await fetch('/api/fal/realtime-token', {
            method: 'POST',
            headers: { Accept: 'application/json' },
          })
        } catch {
          throw new Error('Could not reach the token service. Check your connection or deployment configuration.')
        }
        const body: unknown = await response.json().catch(() => null)
        if (!response.ok) {
          const message = typeof body === 'object' && body !== null && 'error' in body
            && typeof body.error === 'string'
            ? body.error
            : `Token service request failed (HTTP ${response.status}).`
          throw new Error(message)
        }
        if (
          typeof body !== 'object'
          || body === null
          || !('token' in body)
          || typeof body.token !== 'string'
          || !body.token.trim()
        ) {
          throw new Error('Token service returned an invalid response.')
        }
        token = body.token
      }
      setApiState('token-issued')
      return token
    } catch (tokenError) {
      setApiState('error')
      throw new Error(errorMessage(tokenError))
    }
  }, [])

  const connectSession = async () => {
    if (isSessionActive) return
    setError(null)
    setBusy(true)

    try {
      if (!cameraStreamRef.current?.getVideoTracks().length) {
        throw new Error('Select a camera and wait for its local preview before connecting.')
      }
      const input = buildInput()
      setSessionState('requesting')
      const session = await connectLucy({
        localStream: cameraStreamRef.current,
        input,
        tokenProvider,
        onRemoteStream: (stream) => {
          setRemoteStream(stream)
          setSessionState('live')
          setApiState('connected')
        },
        onStateChange: (state) => {
          if (state === 'connected') {
            setSessionState('connected')
            setApiState('connected')
          } else if (state === 'connecting' || state === 'negotiating') {
            setSessionState('connecting')
          } else if (state === 'failed') {
            setSessionState('error')
          } else if (state === 'closed' && sessionRef.current) {
            sessionRef.current = null
            setSessionState('disconnected')
          }
        },
        onError: (sessionError) => {
          setSessionState('error')
          setApiState('error')
          setError(sessionError.message)
          setRemoteStream(null)
          sessionRef.current = null
          recordSessionEvent('Connection failed', sessionError.message, 'Failed')
        },
      })

      sessionRef.current = session
      setSessionState((current) => current === 'live' ? current : 'connected')
      setApiState('connected')
      recordSessionEvent('Lucy session connected', `Connected to ${LUCY_ENDPOINT}.`, 'Connected')
    } catch (connectError) {
      setSessionState('error')
      setApiState('error')
      setError(errorMessage(connectError))
      recordSessionEvent('Connection failed', errorMessage(connectError), 'Failed')
    } finally {
      setBusy(false)
    }
  }

  const startSession = () => {
    try {
      const session = sessionRef.current
      if (!session) throw new Error('Connect to Lucy before starting the session.')
      session.send(buildInput())
      setError(null)
      if (remoteStream) setSessionState('live')
      recordSessionEvent('Transformation inputs sent', `Updated prompt and reference for ${LUCY_ENDPOINT}.`, 'Connected')
    } catch (startError) {
      setError(errorMessage(startError))
    }
  }

  const stopSession = (disconnectCamera = false) => {
    sessionRef.current?.close()
    sessionRef.current = null
    setRemoteStream(null)
    setSessionState('disconnected')
    setApiState('unchecked')
    if (disconnectCamera) stopCameraPreview()
    recordSessionEvent(
      disconnectCamera ? 'Session disconnected' : 'Transformation stopped',
      disconnectCamera ? 'Realtime connection and local camera preview stopped.' : 'Realtime connection closed; local camera preview remains active.',
      'Stopped',
    )
  }

  const handleReferenceUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setReferenceError(null)

    if (!IMAGE_TYPES.has(file.type)) {
      setReferenceError('Choose a PNG, JPEG, or WebP reference image.')
      return
    }

    try {
      const bitmap = await createImageBitmap(file)
      const { width, height } = bitmap
      bitmap.close()
      if (width < MINIMUM_REFERENCE_DIMENSION || height < MINIMUM_REFERENCE_DIMENSION) {
        setReferenceError(`Reference images must be at least ${MINIMUM_REFERENCE_DIMENSION} × ${MINIMUM_REFERENCE_DIMENSION} pixels. This image is ${width} × ${height}.`)
        return
      }

      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = () => reject(new Error('Unable to read the selected image file.'))
        reader.onload = () => {
          if (typeof reader.result === 'string') resolve(reader.result)
          else reject(new Error('The selected image could not be encoded.'))
        }
        reader.readAsDataURL(file)
      })
      const reference: ReferenceImage = {
        id: crypto.randomUUID(),
        name: file.name,
        dataUrl,
        width,
        height,
      }
      setReferences((previous) => [reference, ...previous])
      setSelectedReferenceId(reference.id)
    } catch (imageError) {
      setReferenceError(`Unable to validate the reference image: ${errorMessage(imageError)}`)
    }
  }

  const currentScreenLabel = NAV_ITEMS.find((item) => item.id === activeScreen)?.label ?? 'Studio'
  const statusLabel: Record<SessionState, string> = {
    disconnected: 'Disconnected',
    requesting: 'Requesting token',
    connecting: 'Connecting',
    connected: 'Connected',
    live: 'Live stream',
    error: 'Connection error',
  }
  const statusClass = sessionState === 'live' ? 'is-live'
    : sessionState === 'error' ? 'is-error'
      : isSessionActive ? 'is-connecting' : 'is-idle'

  const renderReferencePicker = (compact = false) => (
    <div className={`reference-picker ${compact ? 'reference-picker-compact' : ''}`}>
      <div className="reference-heading">
        <div>
          <span className="field-overline">Character reference</span>
          <strong>{selectedReference?.name ?? 'No image selected'}</strong>
        </div>
        <button
          type="button"
          className="icon-button"
          onClick={() => imageInputRef.current?.click()}
          aria-label="Upload character reference image"
          title="Upload reference"
        >
          <Plus size={17} />
        </button>
        <input
          ref={imageInputRef}
          className="visually-hidden"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(event) => void handleReferenceUpload(event)}
        />
      </div>
      {references.length > 0 ? (
        <label className="select-wrap">
          <select value={selectedReferenceId} onChange={(event) => setSelectedReferenceId(event.target.value)}>
            {references.map((reference) => (
              <option key={reference.id} value={reference.id}>
                {reference.name} · {reference.width} × {reference.height}
              </option>
            ))}
          </select>
          <ChevronDown size={15} />
        </label>
      ) : null}
      <button
        type="button"
        className={`reference-dropzone ${selectedReference ? 'has-image' : ''}`}
        onClick={() => imageInputRef.current?.click()}
      >
        {selectedReference ? (
          <>
            <img src={selectedReference.dataUrl} alt={`Character reference: ${selectedReference.name}`} />
            <span className="reference-size">{selectedReference.width} × {selectedReference.height}</span>
          </>
        ) : (
          <>
            <span className="upload-symbol"><ArrowDownToLine size={19} /></span>
            <strong>Upload a character image</strong>
            <small>PNG, JPEG or WebP · minimum 512 × 512</small>
          </>
        )}
      </button>
      {referenceError ? <p className="inline-error">{referenceError}</p> : null}
      {selectedReference ? (
        <p className="field-hint">Lucy uses the reference for character swap or virtual try-on.</p>
      ) : null}
    </div>
  )

  const renderStudio = () => (
    <div className="studio-page">
      <section className="studio-intro">
        <div>
          <p className="eyebrow">Realtime video workspace</p>
          <h1>Make the moment <span>yours.</span></h1>
          <p className="intro-copy">Transform your live camera with a character reference and a prompt. The output below is the remote Lucy stream.</p>
        </div>
        <div className="intro-endpoint">
          <span className="endpoint-dot" />
          <div><small>MODEL ENDPOINT</small><strong>{LUCY_ENDPOINT}</strong></div>
          <ArrowUpRight size={15} />
        </div>
      </section>

      <div className="studio-layout">
        <section className="preview-panel">
          <div className="preview-panel-head">
            <div>
              <span className="field-overline">Session preview</span>
              <h2>Live transformation</h2>
            </div>
            <span className={`connection-badge ${statusClass}`}>
              <span className="status-dot" />
              {statusLabel[sessionState]}
            </span>
          </div>

          <div className="preview-stage">
            <div className="video-tile">
              <div className="tile-label"><span className="tile-dot source-dot" /> SOURCE <span>LOCAL</span></div>
              {cameraStream ? (
                <video ref={attachCameraVideo} autoPlay playsInline muted aria-label="Local camera preview" />
              ) : (
                <div className="video-placeholder">
                  <Camera size={24} />
                  <strong>Camera preview</strong>
                  <span>Select a device or grant camera access.</span>
                  <button type="button" className="text-button" onClick={() => void requestMediaPermissions()}>Enable camera</button>
                </div>
              )}
              {cameraStream ? <span className="video-caption">{cameraDevices.find((device) => device.id === selectedCameraId)?.label ?? 'Camera'}</span> : null}
            </div>

            <div className="video-tile output-tile">
              <div className="tile-label"><span className={`tile-dot ${remoteStream ? 'output-dot' : 'waiting-dot'}`} /> TRANSFORMED <span>FAL.AI</span></div>
              {remoteStream ? (
                <video ref={attachOutputVideo} autoPlay playsInline aria-label="Remote transformed video stream" />
              ) : (
                <div className="video-placeholder output-placeholder">
                  {sessionState === 'connecting' || sessionState === 'requesting' ? (
                    <>
                      <LoaderCircle className="spin" size={24} />
                      <strong>Negotiating WebRTC</strong>
                      <span>Waiting for remote transformed media.</span>
                    </>
                  ) : sessionState === 'error' ? (
                    <>
                      <AlertCircle size={24} />
                      <strong>Output unavailable</strong>
                      <span>Review the connection error below, then retry.</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={24} />
                      <strong>Your transformed stream appears here</strong>
                      <span>Connect to Lucy to begin processing live video.</span>
                    </>
                  )}
                </div>
              )}
              {remoteStream ? <span className="video-caption">Remote Lucy output</span> : null}
            </div>
          </div>

          <div className="preview-footer">
            <div className="preview-legend">
              <span><i className="legend-source" /> Local camera</span>
              <span><i className="legend-output" /> Remote transformed stream</span>
            </div>
            <span className="privacy-label"><ShieldCheck size={14} /> No local output substitution</span>
          </div>

          {error ? (
            <div className="error-banner" role="alert">
              <AlertCircle size={17} />
              <span>{error}</span>
              <button type="button" className="icon-button" onClick={() => setError(null)} aria-label="Dismiss error"><X size={16} /></button>
            </div>
          ) : null}

          <div className="session-controls">
            <div className="control-copy">
              <span className="field-overline">Realtime session</span>
              <small>Connect sends the current prompt and reference as Lucy's first model input.</small>
            </div>
            <div className="control-buttons">
              <button
                type="button"
                className="button-secondary"
                onClick={() => void connectSession()}
                disabled={busy || isSessionActive || !hasValidInputs}
              >
                {busy ? <LoaderCircle size={16} className="spin" /> : <Wifi size={16} />}
                Connect
              </button>
              <button
                type="button"
                className="button-primary"
                onClick={startSession}
                disabled={sessionState !== 'connected' && sessionState !== 'live'}
              >
                <Play size={15} fill="currentColor" />
                Start
              </button>
              <button
                type="button"
                className="button-muted"
                onClick={() => stopSession(false)}
                disabled={!isSessionActive}
              >
                <Square size={14} fill="currentColor" />
                Stop
              </button>
              <button
                type="button"
                className="button-muted"
                onClick={() => stopSession(true)}
                disabled={!isSessionActive && !cameraStream}
              >
                Disconnect
              </button>
            </div>
          </div>
        </section>

        <aside className="control-panel">
          <div className="control-panel-heading">
            <div>
              <span className="field-overline">Scene controls</span>
              <h2>Build your look</h2>
            </div>
            <SlidersHorizontal size={18} />
          </div>
          {renderReferencePicker(true)}
          <label className="prompt-field">
            <span className="field-overline">Transformation prompt</span>
            <textarea
              value={prompt}
              maxLength={2000}
              onChange={(event) => setPrompt(event.target.value)}
              placeholder="Describe the character, scene, or visual style you want..."
              rows={5}
            />
            <span className="prompt-count">{prompt.length} / 2000</span>
          </label>
          <div className="prompt-tip"><CircleHelp size={15} /><span>Describe the reference image in words. Lucy 2.5 does not support @-mentions.</span></div>
          {isSessionActive ? (
            <p className="live-update-note">After editing, press <strong>Start</strong> to send the updated prompt and reference over the realtime connection.</p>
          ) : null}
          <button
            type="button"
            className="button-primary wide"
            onClick={startSession}
            disabled={sessionState !== 'connected' && sessionState !== 'live'}
          >
            <Sparkles size={16} />
            Apply prompt &amp; reference
          </button>
          <div className="provider-note">
            <ShieldCheck size={16} />
            <span>Provider watermarking and provenance remain intact.</span>
          </div>
        </aside>
      </div>

      <div className="studio-status-row">
        <div className="status-card">
          <span className="status-card-icon"><Wifi size={16} /></span>
          <div><small>FAL API</small><strong>{apiState === 'connected' ? 'Realtime connected' : apiState === 'token-issued' ? 'Short-lived token issued' : apiState === 'requesting' ? 'Requesting token…' : apiState === 'error' ? 'Connection error' : 'Not connected'}</strong></div>
        </div>
        <div className="status-card">
          <span className="status-card-icon"><Camera size={16} /></span>
          <div><small>CAMERA</small><strong>{cameraStream ? 'Preview active' : 'Not connected'}</strong></div>
        </div>
        <div className="status-card">
          <span className="status-card-icon"><Video size={16} /></span>
          <div><small>REMOTE OUTPUT</small><strong>{remoteStream ? 'Receiving video' : 'Waiting for transformed media'}</strong></div>
        </div>
        <div className="status-card">
          <span className="status-card-icon"><AudioLines size={16} /></span>
          <div><small>MICROPHONE</small><strong>{microphoneDevices.find((device) => device.id === selectedMicrophoneId)?.label ?? 'Not selected'}</strong></div>
        </div>
      </div>
    </div>
  )

  const renderIdentity = () => (
    <section className="page-card identity-page">
      <div className="page-heading">
        <div><p className="eyebrow">Character reference</p><h1>Choose your identity</h1><p>Upload a reference image or switch between images added in this session.</p></div>
        <button type="button" className="button-secondary" onClick={() => imageInputRef.current?.click()}><ImagePlus size={17} /> Upload reference</button>
      </div>
      {renderReferencePicker()}
      <div className="guidance-card"><ShieldCheck size={18} /><span>Lucy accepts PNG, JPEG, and WebP reference images with dimensions of at least 512 × 512 pixels. The image is passed to the model as a reference; it is not used as the output preview.</span></div>
    </section>
  )

  const renderDevices = () => (
    <section className="page-card">
      <div className="page-heading">
        <div><p className="eyebrow">Capture devices</p><h1>Camera &amp; microphone</h1><p>Select local capture devices and check desktop permission status.</p></div>
        <button type="button" className="button-secondary" onClick={() => void refreshMediaDevices()}><RefreshCw size={16} /> Refresh devices</button>
      </div>
      <div className="device-settings-grid">
        <div className="settings-block">
          <label className="field-select">
            <span><Camera size={16} /> Camera</span>
            <select value={selectedCameraId} disabled={isSessionActive} onChange={(event) => setSelectedCameraId(event.target.value)}>
              {cameraDevices.length ? cameraDevices.map((device) => <option key={device.id} value={device.id}>{device.label}</option>) : <option value="">No camera detected</option>}
            </select>
          </label>
          <label className="field-select">
            <span><AudioLines size={16} /> Microphone</span>
            <select value={selectedMicrophoneId} onChange={(event) => setSelectedMicrophoneId(event.target.value)}>
              {microphoneDevices.length ? microphoneDevices.map((device) => <option key={device.id} value={device.id}>{device.label}</option>) : <option value="">No microphone detected</option>}
            </select>
          </label>
          <div className="device-permission-row">
            <div className={`permission-icon ${permissionStatus === 'granted' ? 'permission-ok' : ''}`}><ShieldCheck size={18} /></div>
            <div><strong>{permissionStatus === 'granted' ? 'Media permission granted' : permissionStatus === 'blocked' ? 'Permission blocked' : 'Permission not requested'}</strong><small>Requests camera and microphone access from the desktop webview.</small></div>
            <button type="button" className="button-secondary" onClick={() => void requestMediaPermissions()}>Request access</button>
          </div>
        </div>
        <div className="device-preview-card">
          <div className="device-preview-heading"><span className="field-overline">Local camera check</span><span className={`connection-badge ${cameraStream ? 'is-live' : 'is-idle'}`}>{cameraStream ? 'Preview active' : 'Waiting'}</span></div>
          <div className="device-preview-video">
            {cameraStream ? <video ref={attachCameraVideo} autoPlay playsInline muted aria-label="Device camera test preview" /> : <div className="video-placeholder"><Camera size={23} /><strong>No camera preview</strong></div>}
          </div>
          <div className="notice-box"><AlertCircle size={16} /><span>Lucy 2.5 transforms video only. Microphone selection is available for device management; microphone audio is not sent to this model.</span></div>
        </div>
      </div>
    </section>
  )

  const renderHistory = () => (
    <section className="page-card">
      <div className="page-heading"><div><p className="eyebrow">Local session history</p><h1>Recent activity</h1><p>Connection and control events saved on this device.</p></div></div>
      {history.length ? (
        <div className="history-list">
          {history.map((record) => (
            <article key={record.id} className="history-row">
              <div className={`history-mark ${record.status.toLowerCase()}`}><Clock3 size={16} /></div>
              <div className="history-details"><strong>{record.title}</strong><span>{record.detail}</span></div>
              <span className={`history-state ${record.status.toLowerCase()}`}>{record.status}</span>
              <time>{record.createdAt}</time>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-page-state"><Clock3 size={24} /><strong>No sessions yet</strong><span>Your local connection history will appear here.</span></div>
      )}
    </section>
  )

  const renderSettings = () => (
    <section className="page-card">
      <div className="page-heading"><div><p className="eyebrow">Preferences</p><h1>Studio settings</h1><p>Configure prompt and local device behavior.</p></div></div>
      <div className="settings-list">
        <label className="setting-row"><div><strong>Prompt expansion</strong><small>Allow Lucy to expand or enhance the prompt before applying it.</small></div><input type="checkbox" checked={settings.enablePromptExpansion} onChange={(event) => setSettings((current) => ({ ...current, enablePromptExpansion: event.target.checked }))} /></label>
        <label className="setting-row"><div><strong>Refresh devices after camera connection</strong><small>Update the device list after camera permissions are granted.</small></div><input type="checkbox" checked={settings.autoRefreshDevices} onChange={(event) => setSettings((current) => ({ ...current, autoRefreshDevices: event.target.checked }))} /></label>
      </div>
      <div className="secure-config-card"><ShieldCheck size={19} /><div><strong>API credentials stay in the backend</strong><p>FAL_KEY is read only by the Rust/Tauri process or the Vercel token function. It is never stored in app settings or exposed to frontend code. Configure it in the environment for your runtime.</p></div></div>
      {settingsError ? <div className="error-banner" role="alert"><AlertCircle size={16} /><span>{settingsError}</span></div> : null}
    </section>
  )

  const renderDiagnostics = () => (
    <section className="page-card">
      <div className="page-heading"><div><p className="eyebrow">Runtime health</p><h1>Diagnostics</h1><p>Live state only; credentials are never inspected or displayed.</p></div></div>
      <div className="diagnostic-grid">
        <div className="diagnostic-cell"><span><Wifi size={16} /> Endpoint</span><strong>{ENDPOINT}</strong></div>
        <div className="diagnostic-cell"><span><Activity size={16} /> Session state</span><strong>{statusLabel[sessionState]}</strong></div>
        <div className="diagnostic-cell"><span><ShieldCheck size={16} /> API token</span><strong>{apiState === 'connected' ? 'Short-lived token used' : apiState === 'token-issued' ? 'Token issued (120s)' : apiState === 'requesting' ? 'Request in progress' : apiState === 'error' ? 'Request failed' : 'Not requested'}</strong></div>
        <div className="diagnostic-cell"><span><Camera size={16} /> Camera permission</span><strong>{permissionStatus === 'granted' ? 'Granted' : permissionStatus === 'blocked' ? 'Denied or unavailable' : 'Not requested'}</strong></div>
        <div className="diagnostic-cell"><span><Video size={16} /> Remote video</span><strong>{remoteStream ? 'Remote track received' : 'No remote track received'}</strong></div>
        <div className="diagnostic-cell"><span><Cpu size={16} /> Runtime</span><strong>{isTauri() ? 'Tauri desktop webview' : 'Browser (Vite or Vercel)'}</strong></div>
      </div>
      <div className="notice-box diagnostics-notice"><AlertCircle size={16} /><span>WebRTC operation, camera/microphone permissions, and model output still require real-device testing on macOS and Windows. No virtual camera or virtual audio output is implemented.</span></div>
    </section>
  )

  const screenContent: Record<ScreenName, ReturnType<typeof renderStudio>> = {
    studio: renderStudio(),
    identity: renderIdentity(),
    devices: renderDevices(),
    history: renderHistory(),
    settings: renderSettings(),
    diagnostics: renderDiagnostics(),
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button type="button" className="brand-lockup" onClick={() => setActiveScreen('studio')}>
          <span className="brand-glyph">L<span>F</span></span>
          <span><strong>Lumaform</strong><small>AI VIDEO STUDIO</small></span>
        </button>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="sidebar-nav" aria-label="Studio navigation">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" className={`nav-item ${activeScreen === id ? 'active' : ''}`} onClick={() => setActiveScreen(id)}>
              <Icon size={17} strokeWidth={1.8} /><span>{label}</span>{activeScreen === id ? <span className="active-mark" /> : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-provider">
            <div className="provider-mark"><Sparkles size={15} /></div>
            <div><small>POWERED BY</small><strong>fal.ai · Lucy 2.5</strong></div>
            <span className={`provider-pulse ${apiState === 'connected' ? 'active' : ''}`} />
          </div>
          <div className="sidebar-footnote"><ShieldCheck size={14} /><span>Private credentials · local settings</span></div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb"><span>Workspace</span><span className="breadcrumb-slash">/</span><strong>{currentScreenLabel}</strong></div>
          <div className="topbar-right">
            <div className={`topbar-status ${statusClass}`}><span className="status-dot" />{statusLabel[sessionState]}</div>
            <button type="button" className="topbar-icon" onClick={() => setActiveScreen('diagnostics')} title="Diagnostics" aria-label="Open diagnostics"><Activity size={17} /></button>
            <div className="avatar">LF</div>
          </div>
        </header>
        <div className="page-content">{screenContent[activeScreen]}</div>
        <footer className="app-footer"><span><span className="footer-status-dot" /> LOCAL DESKTOP SESSION</span><span>Lucy 2.5 · WebRTC · fal.ai</span></footer>
      </main>
    </div>
  )
}

export default App
