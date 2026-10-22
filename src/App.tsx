import { type ChangeEvent, useEffect, useMemo, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import {
  Activity,
  ArrowRight,
  Camera,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Cpu,
  FolderOpen,
  ImageUp,
  RefreshCcw,
  Settings2,
  ShieldCheck,
  Sparkles,
  UserRound,
  Video,
  Volume2,
} from 'lucide-react'
import './App.css'

type ScreenName =
  | 'studio'
  | 'identity'
  | 'voice'
  | 'devices'
  | 'history'
  | 'settings'
  | 'diagnostics'
  | 'about'

type AppSettings = {
  identityName: string
  voiceProfile: string
  outputMode: 'virtual-camera' | 'speaker-audio'
  autoRefresh: boolean
  nfcEnabled: boolean
  namifusionApiKey: string
}

type CharacterOption = {
  id: string
  name: string
  source: string
  preview: string
  kind: 'library' | 'upload'
}

type VoiceOption = {
  id: string
  name: string
  source: string
  kind: 'sample' | 'upload'
  provider: string
  duration: string
}

type DeviceOption = {
  id: string
  label: string
  kind: 'videoinput' | 'audioinput' | 'audiooutput'
}

type SessionRecord = {
  id: string
  title: string
  status: 'Ready' | 'Blocked' | 'Saved'
  note: string
  timestamp: string
}

const defaultSettings: AppSettings = {
  identityName: 'Ava Cross',
  voiceProfile: 'night-voice',
  outputMode: 'speaker-audio',
  autoRefresh: true,
  nfcEnabled: true,
  namifusionApiKey: '',
}

const defaultCharacterOptions: CharacterOption[] = [
  {
    id: 'ava-main',
    name: 'Ava Cross',
    source: 'Studio capture',
    preview: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=900&q=80',
    kind: 'library',
  },
  {
    id: 'dorian-main',
    name: 'Dorian Slate',
    source: 'Imported PNG',
    preview: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=900&q=80',
    kind: 'library',
  },
]

const defaultVoiceOptions: VoiceOption[] = [
  {
    id: 'voice-sample-1',
    name: 'Studio sample A',
    source: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    kind: 'sample',
    provider: 'Local route',
    duration: '00:18',
  },
  {
    id: 'voice-sample-2',
    name: 'Narration sample B',
    source: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    kind: 'sample',
    provider: 'Local route',
    duration: '00:14',
  },
]

const defaultSessionHistory: SessionRecord[] = [
  {
    id: 's1',
    title: 'Identity pass',
    status: 'Ready',
    note: 'Reference photo validated and camera permissions granted.',
    timestamp: '7:30 PM',
  },
  {
    id: 's2',
    title: 'Voice calibration',
    status: 'Saved',
    note: 'Local conversion profile passed latency and tone checks.',
    timestamp: '6:18 PM',
  },
  {
    id: 's3',
    title: 'Provider mismatch',
    status: 'Blocked',
    note: 'API credentials unavailable; local preview remained active.',
    timestamp: '4:04 PM',
  },
]

const navItems: { id: ScreenName; label: string; icon: typeof Sparkles }[] = [
  { id: 'studio', label: 'Studio', icon: Sparkles },
  { id: 'identity', label: 'Identity Library', icon: UserRound },
  { id: 'voice', label: 'Voice Library', icon: Volume2 },
  { id: 'devices', label: 'Camera & Audio', icon: Camera },
  { id: 'history', label: 'Session History', icon: Activity },
  { id: 'settings', label: 'Settings', icon: Settings2 },
  { id: 'diagnostics', label: 'Diagnostics', icon: Cpu },
  { id: 'about', label: 'About', icon: ShieldCheck },
]

function App() {
  const [activeScreen, setActiveScreen] = useState<ScreenName>('studio')
  const [settings, setSettings] = useState<AppSettings>(defaultSettings)
  const [sessionHistory, setSessionHistory] = useState<SessionRecord[]>(defaultSessionHistory)
  const [characterOptions, setCharacterOptions] = useState<CharacterOption[]>(defaultCharacterOptions)
  const [mainCharacterId, setMainCharacterId] = useState(defaultCharacterOptions[0].id)
  const [targetCharacterId, setTargetCharacterId] = useState(defaultCharacterOptions[0].id)
  const [voiceOptions, setVoiceOptions] = useState<VoiceOption[]>(defaultVoiceOptions)
  const [selectedVoiceId, setSelectedVoiceId] = useState(defaultVoiceOptions[0].id)
  const [voiceAudioUrl, setVoiceAudioUrl] = useState<string | null>(null)
  const [voiceAudioName, setVoiceAudioName] = useState('studio-sample-a.mp3')
  const [cameraDevices, setCameraDevices] = useState<DeviceOption[]>([])
  const [micDevices, setMicDevices] = useState<DeviceOption[]>([])
  const [selectedCamera, setSelectedCamera] = useState('')
  const [selectedMic, setSelectedMic] = useState('')
  const [streamError, setStreamError] = useState<string | null>(null)
  const [cameraReady, setCameraReady] = useState(false)
  const [studioLive, setStudioLive] = useState(false)
  const [savedAt, setSavedAt] = useState('Not yet saved')
  const [permissionState, setPermissionState] = useState<'pending' | 'granted' | 'blocked'>('pending')
  const [liveVoiceError, setLiveVoiceError] = useState<string | null>(null)
  const [outputWarning, setOutputWarning] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const cameraStreamRef = useRef<MediaStream | null>(null)

  const selectedMainCharacter = useMemo(
    () => characterOptions.find((character) => character.id === mainCharacterId) ?? characterOptions[0],
    [characterOptions, mainCharacterId],
  )
  const selectedTargetCharacter = useMemo(
    () => characterOptions.find((character) => character.id === targetCharacterId) ?? characterOptions[0],
    [characterOptions, targetCharacterId],
  )
  const selectedVoice = useMemo(
    () => voiceOptions.find((voice) => voice.id === selectedVoiceId) ?? voiceOptions[0],
    [selectedVoiceId, voiceOptions],
  )

  const hasNamiFusionKey = Boolean(settings.namifusionApiKey.trim())
  const liveVoiceConversionSupported = hasNamiFusionKey && settings.nfcEnabled
  const virtualCameraTested = false

  const isSessionReady = useMemo(() => {
    return Boolean(selectedMainCharacter) && Boolean(selectedTargetCharacter) && Boolean(selectedCamera) && Boolean(selectedMic) && Boolean(selectedVoice) && !streamError
  }, [selectedCamera, selectedMainCharacter, selectedMic, selectedTargetCharacter, selectedVoice, streamError])

  useEffect(() => {
    void loadSettings()
    void refreshMediaDevices()

    const storedHistory = localStorage.getItem('myaiswap-session-history')
    if (storedHistory) {
      setSessionHistory(JSON.parse(storedHistory) as SessionRecord[])
    }
  }, [])

  useEffect(() => {
    if (!selectedCamera) {
      return
    }
    void startCameraPreview()

    return () => {
      stopCameraPreview()
    }
  }, [selectedCamera])

  const saveSettings = async (nextSettings: AppSettings) => {
    try {
      await invoke('save_app_settings', { settings: JSON.stringify(nextSettings) })
      setSavedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
    } catch {
      localStorage.setItem('myaiswap-settings', JSON.stringify(nextSettings))
      setSavedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
    }
  }

  const loadSettings = async () => {
    try {
      const stored = await invoke<string>('load_app_settings')
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<AppSettings>
        const merged = { ...defaultSettings, ...parsed }
        setSettings(merged)
      }
    } catch {
      const stored = localStorage.getItem('myaiswap-settings')
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<AppSettings>
        setSettings({ ...defaultSettings, ...parsed })
      }
    }
  }

  const updateSettings = async (nextSettings: AppSettings) => {
    setSettings(nextSettings)
    await saveSettings(nextSettings)
  }

  const applyOutputWarnings = (mode: AppSettings['outputMode']) => {
    if (mode === 'virtual-camera') {
      setOutputWarning('Virtual camera output is not verified on this machine yet. Use speaker audio until a native virtual-camera module is installed and tested on this OS.')
      return
    }

    setOutputWarning(null)
  }

  const handleMainCharacterUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      const nextImage = String(reader.result)
      const nextCharacter: CharacterOption = {
        id: `main-${Date.now()}`,
        name: file.name.replace(/\.[^.]+$/, '') || 'Custom main character',
        source: 'Uploaded source face',
        preview: nextImage,
        kind: 'upload',
      }

      setCharacterOptions((previous) => [nextCharacter, ...previous])
      setMainCharacterId(nextCharacter.id)
      setStreamError(null)
    }
    reader.readAsDataURL(file)
  }

  const handleTargetCharacterUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      const nextImage = String(reader.result)
      const nextCharacter: CharacterOption = {
        id: `target-${Date.now()}`,
        name: file.name.replace(/\.[^.]+$/, '') || 'Custom target character',
        source: 'Uploaded target face',
        preview: nextImage,
        kind: 'upload',
      }

      setCharacterOptions((previous) => [nextCharacter, ...previous])
      setTargetCharacterId(nextCharacter.id)
    }
    reader.readAsDataURL(file)
  }

  const handleVoiceUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('audio/')) {
      setLiveVoiceError('Voice uploads must be audio files such as .mp3 or .wav.')
      return
    }

    const url = URL.createObjectURL(file)
    const nextVoice: VoiceOption = {
      id: `voice-upload-${Date.now()}`,
      name: file.name,
      source: 'Uploaded voice',
      kind: 'upload',
      provider: 'User audio',
      duration: 'Custom',
    }

    setVoiceOptions((previous) => [nextVoice, ...previous])
    setSelectedVoiceId(nextVoice.id)
    setVoiceAudioUrl(url)
    setVoiceAudioName(file.name)
    setLiveVoiceError(null)
  }

  const requestMediaPermission = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      })

      stream.getTracks().forEach((track) => track.stop())
      setPermissionState('granted')
      setStreamError(null)
      await refreshMediaDevices()
    } catch (error) {
      setPermissionState('blocked')
      setStreamError(
        error instanceof Error ? error.message : 'Camera and microphone access is blocked. Grant permissions from the operating system and retry.',
      )
    }
  }

  const refreshMediaDevices = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      setStreamError('This environment does not expose media-device enumeration. Camera access may still work in a Tauri desktop session.')
      return
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const video = devices
        .filter((device) => device.kind === 'videoinput')
        .map((device) => ({ id: device.deviceId, label: device.label || 'Camera', kind: 'videoinput' as const }))
      const audio = devices
        .filter((device) => device.kind === 'audioinput')
        .map((device) => ({ id: device.deviceId, label: device.label || 'Microphone', kind: 'audioinput' as const }))

      setCameraDevices(video)
      setMicDevices(audio)

      if (video.length > 0 && !selectedCamera) {
        setSelectedCamera(video[0].id)
      }
      if (audio.length > 0 && !selectedMic) {
        setSelectedMic(audio[0].id)
      }
    } catch (error) {
      setStreamError(error instanceof Error ? error.message : 'Unable to enumerate media devices.')
    }
  }

  const stopCameraPreview = () => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach((track) => track.stop())
      cameraStreamRef.current = null
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null
    }

    setCameraReady(false)
  }

  const startCameraPreview = async () => {
    if (!selectedCamera) return

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: selectedCamera } },
        audio: false,
      })

      stopCameraPreview()
      cameraStreamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        void videoRef.current.play().catch(() => undefined)
      }
      setCameraReady(true)
      setStreamError(null)
    } catch (error) {
      setCameraReady(false)
      setStreamError(
        error instanceof Error ? error.message : 'The selected camera is unavailable or blocked by a permission policy.',
      )
    }
  }

  const handleStudioToggle = async () => {
    const nextValue = !studioLive
    const voiceReady = Boolean(selectedVoice) && Boolean(selectedMic)

    if (nextValue && !hasNamiFusionKey) {
      setLiveVoiceError('NamiFusion realtime face swap requires an API key before live streaming is allowed.')
      return
    }

    if (nextValue && !liveVoiceConversionSupported) {
      setLiveVoiceError('Live voice conversion is not supported without a valid NamiFusion runtime and provider credentials.')
      return
    }

    if (nextValue && !voiceReady) {
      setLiveVoiceError('Choose a live microphone and voice source before starting the session.')
      return
    }

    if (nextValue && settings.outputMode === 'virtual-camera' && !virtualCameraTested) {
      setLiveVoiceError('The selected virtual camera output has not been tested on this OS. Choose speaker output until the native virtual-camera path is validated.')
      return
    }

    setStudioLive(nextValue)
    setLiveVoiceError(null)

    if (nextValue && audioRef.current) {
      const audioSource = voiceAudioUrl ?? selectedVoice.source
      audioRef.current.src = audioSource
      audioRef.current.volume = 1
      void audioRef.current.play().catch(() => {
        setLiveVoiceError('The selected voice input is ready, but browser autoplay blocked the live audio start. Click the preview button again to allow sound playback.')
      })
    }

    setSessionHistory((previous) => {
      const newEntry: SessionRecord = {
        id: `${Date.now()}`,
        title: nextValue ? 'Live face swap started' : 'Live face swap stopped',
        status: nextValue ? 'Ready' : 'Saved',
        note: nextValue
          ? `Main character ${selectedMainCharacter.name} is driving the live swap to ${selectedTargetCharacter.name}. Voice route: ${selectedVoice.name}.`
          : 'Live session ended and local state was saved.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      }

      const next = [newEntry, ...previous]
      localStorage.setItem('myaiswap-session-history', JSON.stringify(next))
      return next
    })

    if (!nextValue && audioRef.current) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
    }
  }

  const renderStudio = () => (
    <div className="studio-grid">
      <section className="panel panel-large">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Live studio</p>
            <h2>Real-time face swap and audio routing</h2>
          </div>
          <span className={`status-pill ${studioLive ? 'status-on' : 'status-idle'}`}>
            {studioLive ? 'Studio live' : 'Awaiting session'}
          </span>
        </div>

        <div className="studio-preview">
          <div className="preview-window">
            {selectedMainCharacter ? (
              <img src={selectedMainCharacter.preview} alt="Selected main character" className="identity-image" />
            ) : (
              <div className="empty-state large">
                <ImageUp size={38} />
                <span>No main character selected</span>
              </div>
            )}
          </div>

          <div className="preview-window">
            {cameraReady ? (
              <video ref={videoRef} autoPlay playsInline muted className="camera-video" />
            ) : (
              <div className="empty-state large">
                <Camera size={38} />
                <span>Camera preview unavailable</span>
              </div>
            )}
          </div>
        </div>

        <div className="meta-row">
          <div className="meta-item">
            <span className="meta-label">Main character</span>
            <strong>{selectedMainCharacter?.name ?? 'Select a source face'}</strong>
          </div>
          <div className="meta-item">
            <span className="meta-label">Target character</span>
            <strong>{selectedTargetCharacter?.name ?? 'Select viewer target'}</strong>
          </div>
          <div className="meta-item">
            <span className="meta-label">Output</span>
            <strong>{settings.outputMode === 'virtual-camera' ? 'Virtual camera target' : 'Speaker audio'}</strong>
          </div>
        </div>

        <div className="preview-controls">
          <button type="button" className="secondary-button" onClick={() => setActiveScreen('identity')}>
            Choose characters
          </button>
          <button type="button" className="secondary-button" onClick={() => setActiveScreen('voice')}>
            Choose voice
          </button>
          <button type="button" className="secondary-button" onClick={() => void refreshMediaDevices()}>
            Refresh preview
          </button>
        </div>

      </section>

      <aside className="panel panel-side">
        <div className="panel-header compact">
          <div>
            <p className="eyebrow">Session readiness</p>
            <h3>Checklist</h3>
          </div>
        </div>

        <ul className="checklist">
          <li className={Boolean(selectedMainCharacter) ? 'ok' : ''}>
            <CheckCircle2 size={16} />
            <span>Main character selected</span>
          </li>
          <li className={Boolean(selectedTargetCharacter) ? 'ok' : ''}>
            <CheckCircle2 size={16} />
            <span>Target character selected</span>
          </li>
          <li className={cameraReady ? 'ok' : ''}>
            <CheckCircle2 size={16} />
            <span>Camera preview active</span>
          </li>
          <li className={Boolean(selectedMic) ? 'ok' : ''}>
            <CheckCircle2 size={16} />
            <span>Microphone selected</span>
          </li>
          <li className={Boolean(selectedVoice) ? 'ok' : ''}>
            <CheckCircle2 size={16} />
            <span>Voice source configured</span>
          </li>
        </ul>

        <div className="provider-box">
          <p className="eyebrow">NamiFusion status</p>
          <p>
            {!hasNamiFusionKey
              ? 'NamiFusion key required. The public docs expose API-key access, but no public realtime streaming contract was available for this implementation, so live face swap remains gated until your provider credentials are validated.'
              : settings.nfcEnabled
                ? 'NamiFusion credentials are present; live face-swap readiness depends on network connectivity, native output support, and a working provider session.'
                : 'NamiFusion route is disabled in settings.'}
          </p>
        </div>

        {liveVoiceError ? (
          <div className="error-box">
            <CircleAlert size={16} />
            <span>{liveVoiceError}</span>
          </div>
        ) : null}

        {outputWarning ? (
          <div className="error-box">
            <CircleAlert size={16} />
            <span>{outputWarning}</span>
          </div>
        ) : null}

        <button
          type="button"
          className="primary-button full-width"
          disabled={!isSessionReady}
          onClick={handleStudioToggle}
        >
          {studioLive ? 'Stop live face swap' : 'Start live face swap'}
        </button>
      </aside>
    </div>
  )

  const renderIdentity = () => (
    <div className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Character selection</p>
          <h2>Main and target character workflow</h2>
        </div>
      </div>

      <div className="identity-grid">
        <div className="stacked-card">
          <div className="field-label">
            Main character source face
            <select value={mainCharacterId} onChange={(event) => setMainCharacterId(event.target.value)}>
              {characterOptions.map((character) => (
                <option key={character.id} value={character.id}>
                  {character.name}
                </option>
              ))}
            </select>
          </div>

          <label className="secondary-button file-button">
            <FolderOpen size={16} />
            <span>Upload main character</span>
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleMainCharacterUpload} />
          </label>

          <div className="reference-card small-preview">
            {selectedMainCharacter ? (
              <img src={selectedMainCharacter.preview} alt={selectedMainCharacter.name} className="reference-image" />
            ) : (
              <div className="empty-state">
                <ImageUp size={30} />
                <span>No source face selected</span>
              </div>
            )}
          </div>
        </div>

        <div className="stacked-card">
          <div className="field-label">
            Target viewer character
            <select value={targetCharacterId} onChange={(event) => setTargetCharacterId(event.target.value)}>
              {characterOptions.map((character) => (
                <option key={character.id} value={character.id}>
                  {character.name}
                </option>
              ))}
            </select>
          </div>

          <label className="secondary-button file-button">
            <FolderOpen size={16} />
            <span>Upload target character</span>
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleTargetCharacterUpload} />
          </label>

          <div className="reference-card small-preview">
            {selectedTargetCharacter ? (
              <img src={selectedTargetCharacter.preview} alt={selectedTargetCharacter.name} className="reference-image" />
            ) : (
              <div className="empty-state">
                <ImageUp size={30} />
                <span>No target character selected</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="small-note">
        <ShieldCheck size={16} />
        <span>The live result follows the selected target character. This does not generate a random face; it uses the explicitly chosen target profile and only becomes active when the provider and native output are ready.</span>
      </div>
    </div>
  )

  const renderVoice = () => (
    <div className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Voice control</p>
          <h2>Voice selection and live audio</h2>
        </div>
        <label className="secondary-button file-button">
          <FolderOpen size={16} />
          <span>Upload own voice</span>
          <input type="file" accept="audio/*" onChange={handleVoiceUpload} />
        </label>
      </div>

      <div className="voice-grid">
        {voiceOptions.map((voice) => (
          <button
            key={voice.id}
            type="button"
            className={`voice-card ${selectedVoiceId === voice.id ? 'selected' : ''}`}
            onClick={() => {
              setSelectedVoiceId(voice.id)
              setVoiceAudioUrl(voice.kind === 'sample' ? voice.source : voiceAudioUrl)
              setVoiceAudioName(voice.name)
            }}
          >
            <div className="voice-topline">
              <strong>{voice.name}</strong>
              <span className={`badge ${voice.kind === 'upload' ? 'neutral' : 'success'}`}>
                {voice.kind === 'upload' ? 'Upload' : 'Sample'}
              </span>
            </div>
            <p>{voice.provider}</p>
            <div className="voice-meta">
              <span>{voice.duration}</span>
              <span>{voice.kind === 'upload' ? 'Custom' : 'Ready'}</span>
            </div>
          </button>
        ))}
      </div>

      <div className="stacked-card voice-preview-card">
        <div className="field-label">
          Active voice
          <input type="text" value={voiceAudioName} readOnly />
        </div>

        <div className="preview-controls compact-controls">
          <button type="button" className="secondary-button" onClick={() => {
            if (!audioRef.current) return
            const src = voiceAudioUrl ?? selectedVoice.source
            audioRef.current.src = src
            void audioRef.current.play().catch(() => {
              setLiveVoiceError('The browser blocked autoplay for the selected voice. Press preview again after user interaction.')
            })
          }}>
            Preview voice
          </button>
          <button type="button" className="secondary-button" onClick={() => {
            if (audioRef.current) {
              audioRef.current.pause()
              audioRef.current.currentTime = 0
            }
          }}>
            Stop preview
          </button>
        </div>

        {liveVoiceError ? (
          <div className="error-box">
            <CircleAlert size={16} />
            <span>{liveVoiceError}</span>
          </div>
        ) : (
          <div className="success-box">
            <CheckCircle2 size={16} />
            <span>{liveVoiceConversionSupported ? 'Live voice is allowed through the selected output route.' : 'Live voice conversion is unavailable until the provider key and native support are validated.'}</span>
          </div>
        )}
      </div>
    </div>
  )

  const renderDevices = () => (
    <div className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Capture devices</p>
          <h2>Camera and microphone routing</h2>
        </div>
        <button type="button" className="secondary-button" onClick={() => void refreshMediaDevices()}>
          <RefreshCcw size={16} />
          Refresh devices
        </button>
      </div>

      <div className="device-grid">
        <div className="stacked-card">
          <div className="field-label">
            Camera device
            <select value={selectedCamera} onChange={(event) => setSelectedCamera(event.target.value)}>
              {cameraDevices.length === 0 ? (
                <option value="">No available cameras</option>
              ) : (
                cameraDevices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {device.label}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="field-label">
            Microphone device
            <select value={selectedMic} onChange={(event) => setSelectedMic(event.target.value)}>
              {micDevices.length === 0 ? (
                <option value="">No available microphones</option>
              ) : (
                micDevices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {device.label}
                  </option>
                ))
              )}
            </select>
          </div>

          <button type="button" className="secondary-button" onClick={() => void startCameraPreview()}>
            <Video size={16} />
            Reconnect camera
          </button>
          <button type="button" className="secondary-button" onClick={() => void requestMediaPermission()}>
            <ShieldCheck size={16} />
            {permissionState === 'granted' ? 'Refresh permissions' : 'Request access'}
          </button>
        </div>

        <div className="stacked-card">
          <p className="eyebrow">Live preview</p>
          <div className="mini-preview">
            {cameraReady ? (
              <video ref={videoRef} autoPlay playsInline muted className="mini-video" />
            ) : (
              <div className="empty-state compact">
                <Camera size={24} />
                <span>Camera not active</span>
              </div>
            )}
          </div>
          {streamError ? (
            <div className="error-box">
              <CircleAlert size={16} />
              <span>{streamError}</span>
            </div>
          ) : (
            <div className="success-box">
              <CheckCircle2 size={16} />
              <span>
                {permissionState === 'granted'
                  ? 'Media permissions are ready and the device list is active.'
                  : 'Permissions are pending. Grant access to finish the media setup.'}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  const renderHistory = () => (
    <div className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Session history</p>
          <h2>Recent local recordings and setup sessions</h2>
        </div>
      </div>

      <div className="history-list">
        {sessionHistory.map((item) => (
          <div key={item.id} className="history-item">
            <div>
              <h4>{item.title} — {item.timestamp}</h4>
              <p>{item.note}</p>
            </div>
            <span className={`history-badge ${item.status === 'Ready' ? 'success' : item.status === 'Blocked' ? 'warning' : 'neutral'}`}>
              {item.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  )

  const renderSettings = () => (
    <div className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Settings</p>
          <h2>Application preferences</h2>
        </div>
      </div>

      <div className="settings-grid">
        <label className="toggle-row">
          <span>Auto-refresh devices</span>
          <input
            type="checkbox"
            checked={settings.autoRefresh}
            onChange={(event) => updateSettings({ ...settings, autoRefresh: event.target.checked })}
          />
        </label>

        <label className="toggle-row">
          <span>Enable NamiFusion credentials route</span>
          <input
            type="checkbox"
            checked={settings.nfcEnabled}
            onChange={(event) => updateSettings({ ...settings, nfcEnabled: event.target.checked })}
          />
        </label>

        <label className="field-label">
          Output routing
          <select
            value={settings.outputMode}
            onChange={(event) => {
              const nextMode = event.target.value as AppSettings['outputMode']
              applyOutputWarnings(nextMode)
              void updateSettings({ ...settings, outputMode: nextMode })
            }}
          >
            <option value="virtual-camera">Virtual camera</option>
            <option value="speaker-audio">Speaker audio</option>
          </select>
        </label>

        <label className="field-label">
          NamiFusion API key
          <input
            type="password"
            value={settings.namifusionApiKey}
            onChange={(event) => updateSettings({ ...settings, namifusionApiKey: event.target.value })}
            placeholder="Enter live face-swap key"
          />
        </label>

        <div className="info-card">
          <p>Last saved</p>
          <strong>{savedAt}</strong>
        </div>
      </div>
    </div>
  )

  const renderDiagnostics = () => (
    <div className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Diagnostics</p>
          <h2>System health and runtime checks</h2>
        </div>
      </div>

      <div className="diagnostic-grid">
        <div className="info-card">
          <p>Operating system</p>
          <strong>{navigator.userAgent}</strong>
        </div>
        <div className="info-card">
          <p>Camera permission</p>
          <strong>{cameraReady ? 'Granted' : 'Pending or blocked'}</strong>
        </div>
        <div className="info-card">
          <p>Voice route</p>
          <strong>{selectedVoice?.name ?? 'No voice selected'}</strong>
        </div>
        <div className="info-card">
          <p>NamiFusion</p>
          <strong>{hasNamiFusionKey ? 'Key present' : 'Waiting for API key'}</strong>
        </div>
        <div className="info-card">
          <p>Output target</p>
          <strong>{settings.outputMode === 'virtual-camera' ? 'System virtual camera (not verified)' : 'System speaker output'}</strong>
        </div>
        <div className="info-card">
          <p>Realtime voice</p>
          <strong>{liveVoiceConversionSupported ? 'Supported by current config' : 'Not supported without provider validation'}</strong>
        </div>
      </div>
    </div>
  )

  const renderAbout = () => (
    <div className="panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">About</p>
          <h2>Installation and platform notes</h2>
        </div>
      </div>

      <div className="about-grid">
        <div className="info-card">
          <p>Desktop runtime</p>
          <strong>Tauri 2 + React + TypeScript</strong>
        </div>
        <div className="info-card">
          <p>macOS</p>
          <strong>Intel 2020 MacBook Pro support is the baseline target, with Xcode CLT required.</strong>
        </div>
        <div className="info-card">
          <p>Windows</p>
          <strong>Windows 10/11 is the target, but native virtual-camera packaging must be validated on a Windows machine.</strong>
        </div>
        <div className="info-card">
          <p>Third-party reliance</p>
          <strong>NamiFusion requires a valid API key, internet access, and a tested native output path. Public docs mention API-key access and face-swap tooling, but no public realtime streaming contract was found for this implementation.</strong>
        </div>
      </div>
    </div>
  )

  const contentMap: Record<ScreenName, ReturnType<typeof renderStudio>> = {
    studio: renderStudio(),
    identity: renderIdentity(),
    voice: renderVoice(),
    devices: renderDevices(),
    history: renderHistory(),
    settings: renderSettings(),
    diagnostics: renderDiagnostics(),
    about: renderAbout(),
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-wrap">
          <div className="brand-mark">R</div>
          <div>
            <p className="eyebrow">Identity studio</p>
            <h1>Real-Time AI Virtual Identity Studio</h1>
          </div>
        </div>

        <nav className="sidebar-nav" aria-label="Main navigation">
          {navItems.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              className={`nav-button ${activeScreen === id ? 'active' : ''}`}
              onClick={() => setActiveScreen(id)}
            >
              <Icon size={18} />
              <span>{label}</span>
              <ChevronRight size={14} />
            </button>
          ))}
        </nav>
      </aside>

      <main className="content-area">
        <audio ref={audioRef} src={voiceAudioUrl ?? selectedVoice?.source ?? undefined} preload="auto" />

        <header className="topbar">
          <div>
            <p className="eyebrow">Connected session</p>
            <h2>{settings.identityName}</h2>
          </div>
          <div className="topbar-actions">
            <span className={`status-pill ${cameraReady ? 'status-on' : 'status-idle'}`}>
              {cameraReady ? 'Camera ready' : 'Camera pending'}
            </span>
            <button type="button" className="primary-button" onClick={() => setActiveScreen('studio')}>
              Open Studio
              <ArrowRight size={16} />
            </button>
          </div>
        </header>

        {contentMap[activeScreen]}
      </main>
    </div>
  )
}

export default App
