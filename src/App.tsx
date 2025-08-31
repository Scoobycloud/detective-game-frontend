import React, { useState, useEffect, useRef, useCallback } from 'react';
import io from 'socket.io-client';
import './App.css';
import { auth, provider, signInWithPopup, onAuthStateChanged, signOut, signInWithRedirect, getRedirectResult } from './firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';

// Real-time Detective Game Interface with Socket.IO
function App() {
  const [role, setRole] = useState<'detective' | 'murderer' | null>(null);
  const [gameState, setGameState] = useState<'lobby' | 'playing'>('lobby');
  const [messages, setMessages] = useState<string[]>([]);
  const [roomCode, setRoomCode] = useState('');
  const [rooms, setRooms] = useState<Array<{ code: string; status?: string; name?: string }>>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [nameBusy, setNameBusy] = useState(false);
  const [nameValid, setNameValid] = useState<boolean | null>(null);
  const [myRoom, setMyRoom] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [question, setQuestion] = useState('');
  const [selectedCharacter, setSelectedCharacter] = useState('');
  const [connected, setConnected] = useState(false);

  // Murderer-specific states
  const [controlledCharacter, setControlledCharacter] = useState('');
  const [characterLocked, setCharacterLocked] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState('');
  const [pendingCorrelationId, setPendingCorrelationId] = useState('');
  const [answerText, setAnswerText] = useState('');
  const [shakeDetective, setShakeDetective] = useState('');
  const [shakeMurderer, setShakeMurderer] = useState('');
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [clues, setClues] = useState<Array<{ text: string; type?: string; source?: string; timestamp?: string }>>([]);
  const [evidence, setEvidence] = useState<Array<{
    id: string;
    title: string;
    type: string;
    location?: string | null;
    is_discovered?: boolean;
    discovered_at?: string | null;
    notes?: string | null;
    created_at?: string;
    // Optional media fields (backend may provide different names)
    thumbnail_url?: string | null;
    thumb_url?: string | null;
    thumbnail?: string | null;
    thumb_path?: string | null;
    media_url?: string | null;
    url?: string | null;
    file_url?: string | null;
    media_path?: string | null;
  }>>([]);
  const [timeline, setTimeline] = useState<Array<{ id: string; tstamp: string; phase: string; label: string; details?: string; created_at?: string }>>([]);
  const [alibis, setAlibis] = useState<Array<{ id: string; character: string; timeframe: string; account: string; credibility_score?: number; created_at?: string }>>([]);
  const [credibility, setCredibility] = useState<{ counts: Array<{ character: string; contradictions: number }>; personality: Array<{ name: string; role: string; personality?: any }> }>({ counts: [], personality: [] });
  const [caseInfo, setCaseInfo] = useState<{ status?: string; seed?: string; narrative?: string } | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profile, setProfile] = useState<{ name?: string; dob?: string; address?: string; image_url?: string; record?: string } | null>(null);
  const [recordText, setRecordText] = useState('');
  const [showCluesModal, setShowCluesModal] = useState(false);
  const [showEvidenceModal, setShowEvidenceModal] = useState(false);
  const [showTimelineModal, setShowTimelineModal] = useState(false);
  const [showAlibisModal, setShowAlibisModal] = useState(false);
  const [showGameMasterPanel, setShowGameMasterPanel] = useState(false);
  const [gameData, setGameData] = useState({
    narrative: '',
    clues: '',
    evidence: '',
    timeline: '',
    alibis: ''
  });
  const [isGenerating, setIsGenerating] = useState(false);
  // DISABLED: Media preview state temporarily removed
  // const [mediaPreview, setMediaPreview] = useState<{ src: string; kind: 'image' | 'video' } | null>(null);
  // const previewBlockUntilRef = useRef<number>(0);
  const [toast, setToast] = useState<{ text: string; type: 'ok' | 'error' } | null>(null);
  const showToast = (text: string, type: 'ok' | 'error' = 'ok') => {
    setToast({ text, type });
    window.clearTimeout((showToast as any)._t);
    (showToast as any)._t = window.setTimeout(() => setToast(null), 2500);
  };
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const audioCtxRef = useRef<any | null>(null);
  const recordTimerRef = useRef<any | null>(null);
  const [musicOn, setMusicOn] = useState<boolean>(() => {
    const v = localStorage.getItem('musicOn');
    return v === null ? true : v === 'true';
  });
  const musicRef = useRef<HTMLAudioElement | null>(null);
  const musicStartedRef = useRef<boolean>(false);

  const goToLobby = () => {
    setGameState('lobby');
    setRole(null);
    setMessages([]);
    setCharacterLocked(false);
    setControlledCharacter('');
    setPendingQuestion('');
    setPendingCorrelationId('');
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    setConnected(false);
    setMyRoom(null);
  };

  const socketRef = useRef<any | null>(null);
  const controlledRef = useRef<string>("");

  const characters = [
    'Mrs. Bellamy',
    'Mr. Holloway',
    'Tommy the Janitor',
    'Dr. Adrian Blackwood'
  ];

  // Optional images (place under public/images/characters)
  const characterImages: Record<string, string> = {
    'Mrs. Bellamy': '/images/characters/mrs_bellamy.png',
    'Mr. Holloway': '/images/characters/mr_holloway.png',
    'Tommy the Janitor': '/images/characters/tommy_the_janitor.png',
    'Dr. Adrian Blackwood': '/images/characters/dr_adrian_blackwood.png',
  };

  const API_URL = process.env.REACT_APP_API_URL || 'https://detective-game-online-z4oe.onrender.com';
  console.log('🔧 API_URL:', API_URL);

  useEffect(() => {
    controlledRef.current = controlledCharacter;
  }, [controlledCharacter]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setUserEmail(user?.email ?? null);
      if (!user) {
        goToLobby();
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    // Handle redirect result for Safari/iOS popup blockers
    getRedirectResult(auth).catch(() => { });
  }, []);

  const handleSignIn = async () => {
    try {
      setAuthBusy(true);
      // Try popup first; if blocked, fall back to redirect
      await signInWithPopup(auth, provider).catch(async (err) => {
        if (err?.code && String(err.code).includes('popup')) {
          await signInWithRedirect(auth, provider);
        } else {
          throw err;
        }
      });
      addMessage('✅ Signed in');
    } catch (e: any) {
      addMessage(`❌ Sign-in failed: ${e?.message || e}`);
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      addMessage('👋 Signed out');
      goToLobby();
    } catch (e: any) {
      addMessage(`❌ Sign-out failed: ${e?.message || e}`);
    }
  };

  useEffect(() => {
    addMessage('🎮 Welcome to Detective Game Online!');
    addMessage('Choose your role to begin...');
  }, []);

  const loadRooms = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/rooms`);
      const data = await res.json();
      if (Array.isArray(data)) setRooms(data);
    } catch { }
  }, [API_URL]);
  useEffect(() => { void loadRooms(); }, [loadRooms]);

  const validateRoomName = async (name: string) => {
    if (!name || name.length < 4 || /[^a-zA-Z0-9]/.test(name)) { setNameValid(false); return; }
    setNameBusy(true);
    try {
      const res = await fetch(`${API_URL}/rooms/name_exists?name=${encodeURIComponent(name)}`);
      const data = await res.json();
      setNameValid(!data?.exists);
    } catch {
      setNameValid(null);
    } finally {
      setNameBusy(false);
    }
  };

  useEffect(() => {
    // Initialize Socket.IO connection
    if (role && myRoom && !socketRef.current) {
      addMessage('🔗 Connecting to game server...');

      socketRef.current = io(API_URL, {
        transports: ['websocket']
      });

      const socket = socketRef.current;

      socket.on('connect', async () => {
        setConnected(true);
        addMessage('✅ Connected to game server!');

        // Join as the selected role in specified room
        const idToken = await auth.currentUser?.getIdToken();
        socket.emit('join_role', { role, room: myRoom, idToken });
        addMessage(`🎭 Joined as ${role}`);
      });

      socket.on('disconnect', () => {
        setConnected(false);
        addMessage('❌ Disconnected from game server');
      });

      socket.on('system', ({ msg }: { msg: string }) => {
        // Filter out system messages that would give away the murderer
        if (!msg.includes('Human now controls:') && !msg.includes('joined')) {
          addMessage(`[system] ${msg}`);
        }
      });

      socket.on('answer', ({ character, answer }: { character: string; answer: string }) => {
        addMessage(`💬 ${character}: ${answer}`);
      });

      socket.on('clues_updated', () => {
        // refetch clues when server tells us they changed
        void fetchClues();
      });

      socket.on('character_locked', ({ character }: { character: string }) => {
        if (role === 'murderer') {
          setCharacterLocked(true);
          addMessage(`🔒 Character locked: ${character}`);
        }
      });

      // Backend sends 'question_for_murderer' when detective asks human-controlled character
      socket.on('question_for_murderer', ({ correlation_id, character, question }: { correlation_id: string; character: string; question: string }) => {
        if (role === 'murderer') {
          const current = controlledRef.current;
          if (!current || current === character) {
            addMessage(`❓ Detective asks ${character}: "${question}"`);
            setPendingQuestion(question);
            setPendingCorrelationId(correlation_id);
            // send debug ack so server can confirm delivery
            socket.emit('murderer_ack', { correlation_id });
          } else {
            addMessage(`[debug] Ignored question for ${character}; currently controlling ${current}`);
          }
        }
      });

      socket.on('error', ({ msg }: { msg: string }) => {
        addMessage(`❌ Error: ${msg}`);
      });

      // Cleanup on unmount
      return () => {
        socket.disconnect();
      };
    }

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, API_URL, myRoom]);

  const addMessage = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setMessages(prev => [...prev, `${timestamp}: ${msg}`]);
  };

  const joinAsDetective = () => {
    if (!myRoom) return addMessage('❌ Enter or create a room first.');
    setRole('detective');
    setGameState('playing');
    addMessage(`🕵️ You are the Detective in room ${myRoom}!`);
  };

  const joinAsMurderer = () => {
    if (!myRoom) return addMessage('❌ Enter or create a room first.');
    setRole('murderer');
    setGameState('playing');
    addMessage(`🎭 You are controlling a character in room ${myRoom}!`);
  };

  // createRoom is no longer used in the simplified UI

  // quickMatch removed per UI simplification

  const lockCharacter = () => {
    if (!controlledCharacter || !socketRef.current) return;

    addMessage(`🔒 You are now controlling ${controlledCharacter} for the rest of the game.`);

    // Tell the server which character is now human-controlled
    socketRef.current.emit('set_human_character', { character: controlledCharacter });
    addMessage('🎭 When the detective asks this character questions, you will respond.');
  };

  const askQuestion = () => {
    if (!question.trim() || !selectedCharacter || !socketRef.current) return;

    const questionText = `🕵️ You asked ${selectedCharacter}: ${question}`;
    addMessage(questionText);

    // Send question via Socket.IO
    socketRef.current.emit('ask', {
      character: selectedCharacter,
      question: question
    });

    setQuestion('');
  };

  const fetchClues = async () => {
    if (!myRoom) return;
    try {
      const res = await fetch(`${API_URL}/rooms/${myRoom}/clues`);
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) setClues(data);
    } catch { }
  };

  const fetchCase = async () => {
    if (!myRoom) return;
    try {
      const res = await fetch(`${API_URL}/rooms/${myRoom}/case`);
      if (!res.ok) return;
      const data = await res.json();
      const c = data?.case || null;
      const narrative = c?.summary?.narrative || '';
      setCaseInfo({ status: c?.status, seed: c?.seed, narrative });
    } catch { }
  };

  const fetchEvidence = async () => {
    if (!myRoom) return;
    try {
      const res = await fetch(`${API_URL}/rooms/${myRoom}/evidence`);
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) setEvidence(data);
    } catch { }
  };

  const fetchTimeline = async () => {
    if (!myRoom) return;
    try {
      const res = await fetch(`${API_URL}/rooms/${myRoom}/timeline`);
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) setTimeline(data);
    } catch { }
  };

  const fetchAlibis = async () => {
    if (!myRoom) return;
    try {
      const res = await fetch(`${API_URL}/rooms/${myRoom}/alibis`);
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) setAlibis(data);
    } catch { }
  };

  const createGameFromStructuredData = async () => {
    if (!myRoom) return;
    setIsGenerating(true);

    // Add timeout to prevent hanging
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    try {
      addMessage(`🎭 Creating game for room: ${myRoom}...`);
      addMessage(`🔗 Using API URL: ${API_URL}`);

      const res = await fetch(`${API_URL}/rooms/${myRoom}/create-structured-game`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(gameData),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      addMessage(`🎭 API call completed with status: ${res.status}`);

      if (!res.ok) {
        let errorMessage = `HTTP ${res.status}: ${res.statusText}`;

        try {
          const errorData = await res.json();
          errorMessage = errorData.detail || errorData.error || errorMessage;
        } catch (parseError) {
          // If we can't parse the error response, use the status text
          try {
            const text = await res.text();
            if (text) errorMessage = text;
          } catch (textError) {
            // Use the default error message
          }
        }

        throw new Error(errorMessage);
      }

      const data = await res.json();
      addMessage(`🎭 Game created successfully! ${data.evidence_count} evidence items, ${data.clues_count} clues created.`);

      // Refresh all data
      await Promise.all([
        fetchEvidence(),
        fetchClues(),
        fetchTimeline(),
        fetchAlibis(),
        fetchCredibility(),
        fetchCase()
      ]);

      setShowGameMasterPanel(false);
      setGameData({
        narrative: '',
        clues: '',
        evidence: '',
        timeline: '',
        alibis: ''
      });

    } catch (error: any) {
      if (error.name === 'AbortError') {
        addMessage(`❌ Game creation timed out after 30 seconds`);
      } else {
        addMessage(`❌ Game creation failed: ${error.message}`);
        console.error('Game creation error:', error);
      }
    } finally {
      setIsGenerating(false);
      clearTimeout(timeoutId);
    }
  };

  const fetchCredibility = async () => {
    if (!myRoom) return;
    try {
      const res = await fetch(`${API_URL}/rooms/${myRoom}/credibility`);
      if (!res.ok) return;
      const data = await res.json();
      if (data) setCredibility({ counts: data.counts || [], personality: data.personality || [] });
    } catch { }
  };

  const searchLocation = async (loc: string) => {
    if (!myRoom || !loc.trim()) return;
    // DISABLED: Media preview calls temporarily removed
    // setMediaPreview(null);
    // previewBlockUntilRef.current = Date.now() + 2000;
    try {
      const res = await fetch(`${API_URL}/rooms/${myRoom}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location: loc })
      });
      const data = await res.json();
      if (data?.found) {
        addMessage(`🔎 Found evidence: ${data.evidence?.title || 'Unknown'}`);
        showToast('Evidence discovered!', 'ok');
        await fetchEvidence();
        setShowEvidenceModal(true);
      } else if (data?.error) {
        addMessage(`❌ Search error: ${data.error}`);
        showToast('Search error', 'error');
      } else {
        addMessage('🔎 No evidence found there.');
        showToast('No evidence found there.', 'error');
      }
    } catch (e: any) {
      addMessage(`❌ Search failed: ${e?.message || e}`);
    }
  };

  useEffect(() => {
    if (!myRoom) return;
    void fetchClues();
    void fetchEvidence();
    void fetchTimeline();
    void fetchAlibis();
    void fetchCredibility();
    void fetchCase();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myRoom]);

  const ensureMusicStarted = useCallback(async () => {
    try {
      if (gameState !== 'lobby') return;
      if (!musicOn) return;
      if (musicStartedRef.current && musicRef.current) {
        if (musicRef.current.paused) await musicRef.current.play().catch(() => { });
        return;
      }
      if (!musicRef.current) {
        const el = new Audio('/lobby.mp3');
        el.loop = true;
        el.volume = 0.2;
        musicRef.current = el;
      }
      await musicRef.current!.play();
      musicStartedRef.current = true;
    } catch {
      // ignore autoplay errors; will retry on next user gesture
    }
  }, [gameState, musicOn]);

  useEffect(() => {
    localStorage.setItem('musicOn', String(musicOn));
    if (!musicOn && musicRef.current) {
      musicRef.current.pause();
    } else if (musicOn) {
      void ensureMusicStarted();
    }
  }, [musicOn, ensureMusicStarted]);

  const playKeyClick = () => {
    try {
      const AC: any = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      if (!audioCtxRef.current) audioCtxRef.current = new AC();
      const ctx = audioCtxRef.current as AudioContext;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.setValueAtTime(1200, now);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.05, now + 0.001);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.035);
    } catch {
      // ignore
    }
  };

  const typeOutRecord = (full: string) => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    const sentences = full.match(/[^.]+[.]?/g) || [full];
    let sentenceIndex = 0;
    let displayed = '';

    const typeSentence = (sentence: string) => {
      let i = 0;
      recordTimerRef.current = setInterval(() => {
        i += 2; // type two chars per tick
        const chunk = sentence.slice(0, i);
        setRecordText(displayed + chunk);
        playKeyClick();
        if (i >= sentence.length) {
          clearInterval(recordTimerRef.current);
          recordTimerRef.current = null;
          displayed += sentence;
          sentenceIndex += 1;
          if (sentenceIndex < sentences.length) {
            // pause 500ms between sentences
            recordTimerRef.current = setTimeout(() => {
              typeSentence(sentences[sentenceIndex]);
            }, 500) as unknown as number;
          }
        }
      }, 20);
    };

    if (sentences.length > 0) {
      typeSentence(sentences[0]);
    }
  };

  const sendAnswer = () => {
    if (!answerText.trim() || !pendingCorrelationId || !socketRef.current) return;

    // Send murderer response via Socket.IO using backend's expected format
    socketRef.current.emit('murderer_answer', {
      correlation_id: pendingCorrelationId,
      answer: answerText
    });

    addMessage(`💬 You (as ${controlledCharacter}): ${answerText}`);

    // Clear pending question
    setPendingQuestion('');
    setPendingCorrelationId('');
    setAnswerText('');
  };

  if (gameState === 'lobby') {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: '#111827', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div onClick={() => void ensureMusicStarted()} style={{ textAlign: 'center', padding: '2rem', backgroundImage: "linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55)), url('/lobbybckgrnd.png?v=3')", backgroundPosition: 'center', backgroundSize: 'cover', backgroundRepeat: 'no-repeat', backgroundColor: '#0a0f16', borderRadius: '0.5rem', border: '1px solid #223041', maxWidth: '28rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span onClick={(e) => { e.stopPropagation(); setMusicOn((v) => !v); }} style={{ cursor: 'pointer', color: '#F5C542', fontWeight: 600, letterSpacing: '0.02em' }}>Music: {musicOn ? 'On' : 'Off'}</span>
            <span onClick={(e) => { e.stopPropagation(); setShowHelp(true); void ensureMusicStarted(); }} style={{ cursor: 'pointer', color: '#F5C542', fontWeight: 600, letterSpacing: '0.02em' }}>❓ How to Play</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1.25rem' }}>
            <img src="/logo.png" alt="Detective Game" style={{ height: '180px', width: 'auto', filter: 'drop-shadow(0 10px 24px rgba(0,0,0,0.6))' }} />
          </div>



          {!userEmail && (
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'grid', gap: '0.5rem' }}>
                <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" style={{ padding: '0.5rem', backgroundColor: '#0E1622', color: '#E5E7EB', border: '1px solid #2A3A4A', borderRadius: '0.375rem' }} />
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" style={{ padding: '0.5rem', backgroundColor: '#0E1622', color: '#E5E7EB', border: '1px solid #2A3A4A', borderRadius: '0.375rem' }} />
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button onClick={async () => { try { setAuthBusy(true); await signInWithEmailAndPassword(auth, email, password); } catch (e: any) { addMessage(`❌ Email sign-in failed: ${e?.message || e}`) } finally { setAuthBusy(false); } }} disabled={authBusy} style={{ flex: 1, backgroundColor: 'transparent', color: '#F5C542', padding: '0.75rem 1.5rem', borderRadius: '0.5rem', border: '1px solid #C7961E', cursor: 'pointer', letterSpacing: '0.02em', fontWeight: 600 }} onClickCapture={() => void ensureMusicStarted()}>Sign in</button>
                  <button onClick={async () => { try { setAuthBusy(true); await createUserWithEmailAndPassword(auth, email, password); } catch (e: any) { addMessage(`❌ Sign-up failed: ${e?.message || e}`) } finally { setAuthBusy(false); } }} disabled={authBusy} style={{ flex: 1, backgroundColor: 'transparent', color: '#F5C542', padding: '0.75rem 1.5rem', borderRadius: '0.5rem', border: '1px solid #C7961E', cursor: 'pointer', letterSpacing: '0.02em', fontWeight: 600 }} onClickCapture={() => void ensureMusicStarted()}>Sign up</button>
                </div>
                <button onClick={(e) => { e.stopPropagation(); void ensureMusicStarted(); void handleSignIn(); }} disabled={authBusy} style={{ width: '100%', backgroundColor: 'transparent', color: '#F5C542', padding: '0.75rem 1.5rem', borderRadius: '0.5rem', border: '1px solid #C7961E', cursor: 'pointer', fontWeight: 600, letterSpacing: '0.02em' }}>
                  {authBusy ? 'Signing in…' : 'Continue with Google'}
                </button>
              </div>
            </div>
          )}

          <div style={{ marginBottom: '1rem', opacity: userEmail ? 1 : 0.5, pointerEvents: userEmail ? 'auto' : 'none' }}>
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              <select
                value={roomCode}
                onChange={(e) => { setRoomCode(e.target.value); setMyRoom(e.target.value || null); if (e.target.value) addMessage(`🔑 Selected room: ${e.target.value}`); }}
                style={{ width: '100%', padding: '0.5rem', backgroundColor: '#0E1622', border: '1px solid #2A3A4A', borderRadius: '0.25rem', color: '#E5E7EB' }}
              >
                <option value="">Select a room…</option>
                {rooms.map((r) => (
                  <option key={r.code} value={r.code}>{r.name ? `${r.name} (${r.code})` : r.code}</option>
                ))}
              </select>
              <button
                onClick={() => { setShowCreate(true); void ensureMusicStarted(); }}
                style={{ width: '100%', backgroundColor: 'transparent', color: '#F5C542', padding: '0.75rem 1.5rem', borderRadius: '0.5rem', border: '1px solid #C7961E', cursor: 'pointer', letterSpacing: '0.02em', fontWeight: 600 }}
              >Create New Room</button>
            </div>
            {myRoom && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#d1d5db' }}>Selected room: {myRoom}</div>
            )}
          </div>

          <div style={{ marginBottom: '1rem', opacity: userEmail ? 1 : 0.5, pointerEvents: userEmail ? 'auto' : 'none' }}>
            <button
              onClick={(e) => { e.stopPropagation(); void ensureMusicStarted(); joinAsDetective(); }}
              style={{ width: '100%', backgroundColor: 'transparent', color: '#F5C542', padding: '0.75rem 1.5rem', borderRadius: '0.5rem', fontWeight: 600, border: '1px solid #C7961E', cursor: 'pointer', marginBottom: '1rem', letterSpacing: '0.02em' }}
            >
              🕵️ Play as Detective
            </button>

            <button
              onClick={(e) => { e.stopPropagation(); void ensureMusicStarted(); joinAsMurderer(); }}
              style={{ width: '100%', backgroundColor: 'transparent', color: '#F5C542', padding: '0.75rem 1.5rem', borderRadius: '0.5rem', fontWeight: '600', border: '1px solid #C7961E', cursor: 'pointer', letterSpacing: '0.02em' }}
            >
              🎭 Control a Character
            </button>
          </div>





          <div style={{ marginTop: '1rem', fontSize: '0.75rem', color: '#9ca3af', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}>
            {userEmail ? (
              <>
                <span>Signed in as {userEmail}</span>
                <span onClick={handleSignOut} style={{ cursor: 'pointer', color: '#F5C542', fontWeight: 600 }}>Sign out</span>
              </>
            ) : (
              <span>Not signed in</span>
            )}
          </div>
        </div>
        {showHelp && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 50 }}>
            <div style={{ backgroundColor: '#1f2937', color: 'white', width: '100%', maxWidth: '42rem', borderRadius: '0.5rem', padding: '1rem', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#fbbf24' }}>How to Play</h2>
                <button onClick={() => setShowHelp(false)} style={{ backgroundColor: '#374151', color: 'white', border: 'none', borderRadius: '0.375rem', padding: '0.375rem 0.75rem', cursor: 'pointer' }}>Close</button>
              </div>
              <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                <p style={{ color: '#d1d5db' }}>Choose a role and either quick-match or share a room code to play with a friend.</p>
                <ul style={{ textAlign: 'left', lineHeight: 1.6 }}>
                  <li><strong>Roles:</strong> Detective asks questions; Character Controller answers as a chosen suspect.</li>
                  <li><strong>Quick Match:</strong> Click Quick Match as Detective/Character to pair automatically.</li>
                  <li><strong>Room Code:</strong> Create a room, share the code, both join it, then select roles.</li>
                  <li><strong>Detective:</strong> Pick a character, type a question, click Ask.</li>
                  <li><strong>Character Controller:</strong> Lock a character. When asked, type and send your response.</li>
                  <li><strong>Tips:</strong> If no human reply, AI will answer. Use Back to Lobby to restart.</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {showCreate && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 60 }}>
            <div style={{ width: '100%', maxWidth: '28rem', backgroundColor: '#0b1220', color: 'white', borderRadius: '0.5rem', border: '1px solid #334155', padding: '1rem' }}>
              <div style={{ fontWeight: 700, marginBottom: '0.75rem' }}>Create Room</div>
              <div style={{ display: 'grid', gap: '0.5rem' }}>
                <input value={newRoomName} onChange={(e) => { const v = e.target.value.replace(/[^a-zA-Z0-9]/g, ''); setNewRoomName(v); void validateRoomName(v); }} placeholder="Room Name (letters/numbers, 4+)" style={{ padding: '0.5rem', backgroundColor: '#0E1622', color: '#E5E7EB', border: '1px solid #2A3A4A', borderRadius: '0.375rem' }} />
                <div style={{ fontSize: '0.75rem', color: nameValid === false ? '#f87171' : '#9ca3af' }}>
                  {nameBusy ? 'Checking…' : nameValid === false ? 'Name invalid or already exists' : 'Only letters and numbers; 4+ chars'}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                  <button onClick={() => { setShowCreate(false); setNewRoomName(''); setNameValid(null); }} style={{ backgroundColor: '#374151', color: 'white', border: 'none', borderRadius: '0.375rem', padding: '0.375rem 0.75rem', cursor: 'pointer' }}>Cancel</button>
                  <button onClick={async () => {
                    if (!nameValid) return;
                    // Get a new code
                    let code = '';
                    try {
                      const r = await fetch(`${API_URL}/rooms/new_code`);
                      const d = await r.json();
                      code = d?.code || '';
                    } catch { }
                    // Create room with preferred code
                    const temp = io(API_URL, { transports: ['websocket'] });
                    temp.on('connect', () => { temp.emit('create_room', code ? { preferred_code: code } : {}); });
                    temp.on('room_created', async ({ room }) => {
                      setMyRoom(room);
                      setRoomCode(room);
                      addMessage(`🏠 Room created: ${room}`);
                      // Set room name
                      try { await fetch(`${API_URL}/rooms/${encodeURIComponent(room)}/name`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newRoomName }) }); } catch { }
                      temp.disconnect();
                      setShowCreate(false);
                      setNewRoomName('');
                      setNameValid(null);
                      void loadRooms();
                    });
                    temp.on('disconnect', () => temp.close());
                  }} disabled={!nameValid} style={{ backgroundColor: !nameValid ? '#4b5563' : '#16a34a', color: 'white', border: 'none', borderRadius: '0.375rem', padding: '0.375rem 0.75rem', cursor: !nameValid ? 'not-allowed' : 'pointer' }}>OK</button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#111827', color: 'white' }}>
      {/* Header aligned with content container */}
      <div style={{ backgroundColor: '#1f2937', padding: '1rem 0' }}>
        <div style={{ maxWidth: '64rem', margin: '0 auto', padding: '0 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button
            onClick={goToLobby}
            style={{ fontSize: '0.875rem', backgroundColor: '#4b5563', color: 'white', padding: '0.25rem 0.75rem', borderRadius: '0.25rem', border: 'none', cursor: 'pointer' }}
          >
            ← Back to Lobby
          </button>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#fbbf24' }}>
            🕵️ Detective Game - {role === 'detective' ? 'Detective Mode' : 'Character Controller'}
          </h1>
        </div>
      </div>

      <div style={{ maxWidth: '64rem', margin: '0 auto', padding: '1rem' }}>
        {/* Briefing */}
        {caseInfo?.narrative && (
          <div style={{ backgroundColor: '#1f2937', borderRadius: '0.5rem', padding: '1rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 600 }}>📖 Briefing</h3>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {caseInfo.status && (
                  <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>status: {caseInfo.status}</span>
                )}
                <button onClick={() => void fetchCase()} style={{ backgroundColor: '#374151', color: 'white', border: 'none', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', cursor: 'pointer', fontSize: '0.875rem' }}>Refresh</button>
              </div>
            </div>
            <div style={{ fontSize: '0.875rem', color: '#d1d5db', whiteSpace: 'pre-wrap' }}>{caseInfo.narrative}</div>
          </div>
        )}
        {/* Game Messages */}
        <div style={{ backgroundColor: '#1f2937', borderRadius: '0.5rem', padding: '1rem', height: '24rem', overflowY: 'auto', marginBottom: '1rem' }}>
          {messages.map((msg, i) => (
            <div key={i} style={{ marginBottom: '0.5rem', fontSize: '0.875rem', fontFamily: 'monospace' }}>
              {msg}
            </div>
          ))}
        </div>

        {/* Detective Interface */}
        {role === 'detective' && (
          <div style={{ backgroundColor: '#1f2937', borderRadius: '0.5rem', padding: '1rem' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '0.75rem' }}>🔍 Interrogation</h3>

            <div style={{ marginBottom: '0.75rem', fontSize: '0.875rem', color: '#d1d5db' }}>Select a suspect by clicking their card:</div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
              {characters.map((char) => {
                const isSelected = selectedCharacter === char;
                return (
                  <button
                    key={char}
                    onClick={() => {
                      setSelectedCharacter(char);
                      setShakeDetective(char);
                      setTimeout(() => setShakeDetective(''), 400);
                    }}
                    onDoubleClick={async () => {
                      setShowProfile(true);
                      setProfileLoading(true);
                      setRecordText('');
                      try {
                        const res = await fetch(`${API_URL}/characters/${encodeURIComponent(char)}/profile`);
                        const data = await res.json();
                        if (!data || data.error) {
                          setProfile({ name: char, dob: 'Unknown', address: 'Unknown', image_url: '', record: '' });
                        } else {
                          setProfile(data);
                        }
                      } catch {
                        setProfile({ name: char, dob: 'Unknown', address: 'Unknown', image_url: '', record: '' });
                      } finally {
                        setProfileLoading(false);
                      }
                    }}
                    style={{
                      backgroundColor: '#111827',
                      border: `2px solid ${isSelected ? '#fbbf24' : '#374151'}`,
                      color: 'white',
                      borderRadius: '0.5rem',
                      padding: '0.5rem',
                      cursor: 'pointer',
                      textAlign: 'center'
                    }}
                    aria-pressed={isSelected}
                  >
                    <div className={shakeDetective === char ? 'tile-shake' : ''} style={{
                      width: '100%',
                      aspectRatio: '1 / 1',
                      backgroundColor: '#1f2937',
                      borderRadius: '0.25rem',
                      marginBottom: '0.5rem',
                      overflow: 'hidden',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      {characterImages[char] ? (
                        <img src={characterImages[char]} alt={char} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ fontSize: '0.875rem', color: '#9ca3af' }}>
                          {char.split(' ').map(w => w[0]).join('').slice(0, 3)}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>{char}</div>
                  </button>
                );
              })}
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    askQuestion();
                  }
                }}
                placeholder={selectedCharacter ? `Ask ${selectedCharacter}...` : 'Select a suspect, then ask your question...'}
                style={{ flex: 1, padding: '0.5rem', backgroundColor: '#374151', borderRadius: '0.25rem', border: '1px solid #4b5563', color: 'white' }}
              />
              <button
                onClick={askQuestion}
                disabled={!question.trim() || !selectedCharacter || !connected}
                style={{ backgroundColor: (!question.trim() || !selectedCharacter || !connected) ? '#4b5563' : '#2563eb', color: 'white', padding: '0.5rem 1rem', borderRadius: '0.25rem', fontWeight: '600', border: 'none', cursor: 'pointer' }}
              >
                Ask
              </button>
            </div>

            <div style={{ marginTop: '0.75rem', display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                placeholder="Search a location (e.g., Study fireplace)"
                ref={searchInputRef}
                onKeyDown={(e: any) => {
                  if (e.key === 'Enter') {
                    const v = String(e.currentTarget.value || '').trim();
                    if (v) { searchLocation(v); e.currentTarget.value = ''; }
                  }
                }}
                style={{ flex: 1, padding: '0.5rem', backgroundColor: '#374151', borderRadius: '0.25rem', border: '1px solid #4b5563', color: 'white' }}
              />
              <button
                onClick={() => {
                  const v = searchInputRef.current ? String(searchInputRef.current.value || '').trim() : '';
                  if (v) { searchLocation(v); if (searchInputRef.current) searchInputRef.current.value = ''; }
                }}
                style={{ backgroundColor: '#1A2530', color: 'white', padding: '0.5rem 1rem', borderRadius: '0.25rem', border: '1px solid #2F3F50', cursor: 'pointer' }}
              >Search</button>
            </div>
          </div>
        )}

        {/* Detective quick controls: open modals */}
        {myRoom && (
          <div style={{ backgroundColor: '#1f2937', borderRadius: '0.5rem', padding: '1rem', marginTop: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-start' }}>
              <button onClick={() => { void fetchClues(); setShowCluesModal(true); }} style={{ backgroundColor: '#374151', color: 'white', border: 'none', padding: '0.5rem 0.75rem', borderRadius: '0.375rem', cursor: 'pointer' }}>🧩 Clues</button>
              <button onClick={() => { void fetchEvidence(); setShowEvidenceModal(true); }} style={{ backgroundColor: '#374151', color: 'white', border: 'none', padding: '0.5rem 0.75rem', borderRadius: '0.375rem', cursor: 'pointer' }}>🧾 Evidence</button>
              <button onClick={() => { void fetchTimeline(); setShowTimelineModal(true); }} style={{ backgroundColor: '#374151', color: 'white', border: 'none', padding: '0.5rem 0.75rem', borderRadius: '0.375rem', cursor: 'pointer' }}>🕰️ Timeline</button>
              <button onClick={() => { void fetchAlibis(); void fetchCredibility(); setShowAlibisModal(true); }} style={{ backgroundColor: '#374151', color: 'white', border: 'none', padding: '0.5rem 0.75rem', borderRadius: '0.375rem', cursor: 'pointer' }}>🧭 Alibis</button>
              <button onClick={() => setShowGameMasterPanel(true)} style={{ backgroundColor: '#7c3aed', color: 'white', border: 'none', padding: '0.5rem 0.75rem', borderRadius: '0.375rem', cursor: 'pointer', fontWeight: 'bold' }}>🎭 Game Master</button>
            </div>
          </div>
        )}

        {/* Evidence/Timeline/Alibis moved to modals via buttons above */}

        {/* Alibis moved to modal */}

        {/* Police Profile Modal */}
        {showProfile && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
            <div style={{ width: '100%', maxWidth: '42rem', backgroundColor: '#0b1220', color: 'white', borderRadius: '0.5rem', border: '1px solid #334155', boxShadow: '0 10px 25px rgba(0,0,0,0.6)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1rem', borderBottom: '1px solid #1f2937' }}>
                <div style={{ fontWeight: 700, color: '#34d399' }}>POLICE COMPUTER // SUBJECT PROFILE</div>
                <button onClick={() => { if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null; } setShowProfile(false); setProfile(null); setRecordText(''); }} style={{ backgroundColor: '#374151', color: 'white', border: 'none', borderRadius: '0.375rem', padding: '0.375rem 0.75rem', cursor: 'pointer' }}>Close</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '10rem 1fr', gap: '1rem', padding: '1rem' }}>
                <div style={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '0.375rem', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '10rem', overflow: 'hidden' }}>
                  {(() => {
                    const fallback = profile?.name ? characterImages[profile.name] : undefined;
                    const src = (profile?.image_url && profile.image_url.trim()) ? profile.image_url : fallback;
                    return src ? (
                      <img src={src} alt={profile?.name || 'Profile'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ color: '#64748b', fontSize: '0.875rem' }}>No Photo</div>
                    );
                  })()}
                </div>
                <div>
                  <div style={{ display: 'grid', gap: '0.25rem', marginBottom: '0.5rem' }}>
                    <div><span style={{ color: '#94a3b8' }}>Name:</span> {profile?.name || '—'}</div>
                    <div><span style={{ color: '#94a3b8' }}>Current Address:</span> {profile?.address || '—'}</div>
                    <div><span style={{ color: '#94a3b8' }}>DOB:</span> {profile?.dob || '—'}</div>
                  </div>
                  <button disabled={profileLoading} onClick={async () => {
                    if (!profile?.record) {
                      // fetch again just in case
                      try {
                        const res = await fetch(`${API_URL}/characters/${encodeURIComponent(profile?.name || '')}/profile`);
                        const data = await res.json();
                        if (data && !data.error) setProfile(data);
                      } catch { }
                    }
                    // teleprompter effect
                    const full = (profile?.record || 'No police record found.').toString();
                    setRecordText('');
                    // prepare audio context
                    try {
                      const AC: any = (window as any).AudioContext || (window as any).webkitAudioContext;
                      if (AC) {
                        if (!audioCtxRef.current) audioCtxRef.current = new AC();
                        if (audioCtxRef.current.state === 'suspended') await audioCtxRef.current.resume();
                      }
                    } catch { }
                    typeOutRecord(full);
                  }} style={{ backgroundColor: '#16a34a', color: 'white', border: 'none', borderRadius: '0.375rem', padding: '0.5rem 0.75rem', cursor: 'pointer', fontWeight: 600 }}>
                    {profileLoading ? 'Loading…' : 'Get police record'}
                  </button>
                </div>
              </div>
              <div style={{ padding: '0 1rem 1rem 1rem' }}>
                <div style={{ backgroundColor: '#00160a', border: '1px solid #14532d', minHeight: '8rem', borderRadius: '0.375rem', padding: '0.75rem', fontFamily: 'monospace', color: '#34d399', whiteSpace: 'pre-wrap' }}>
                  {recordText}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Murderer Interface */}
        {role === 'murderer' && (
          <div style={{ backgroundColor: '#1f2937', borderRadius: '0.5rem', padding: '1rem' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem' }}>🎭 Character Control</h3>

            {!characterLocked ? (
              <div>
                <p style={{ color: '#d1d5db', marginBottom: '0.75rem' }}>
                  Select which character you want to control. Once selected, this choice is permanent for the game.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
                  {characters.map((char) => {
                    const isSelected = controlledCharacter === char;
                    return (
                      <button
                        key={char}
                        onClick={() => {
                          setControlledCharacter(char);
                          setShakeMurderer(char);
                          setTimeout(() => setShakeMurderer(''), 400);
                        }}
                        style={{
                          backgroundColor: '#111827',
                          border: `2px solid ${isSelected ? '#ef4444' : '#374151'}`,
                          color: 'white',
                          borderRadius: '0.5rem',
                          padding: '0.5rem',
                          cursor: 'pointer',
                          textAlign: 'center'
                        }}
                        aria-pressed={isSelected}
                      >
                        <div className={shakeMurderer === char ? 'tile-shake' : ''} style={{
                          width: '100%',
                          aspectRatio: '1 / 1',
                          backgroundColor: '#1f2937',
                          borderRadius: '0.25rem',
                          marginBottom: '0.5rem',
                          overflow: 'hidden',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          {characterImages[char] ? (
                            <img src={characterImages[char]} alt={char} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <div style={{ fontSize: '0.875rem', color: '#9ca3af' }}>
                              {char.split(' ').map(w => w[0]).join('').slice(0, 3)}
                            </div>
                          )}
                        </div>
                        <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>{char}</div>
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={lockCharacter}
                  disabled={!controlledCharacter || !connected}
                  style={{ backgroundColor: (!controlledCharacter || !connected) ? '#4b5563' : '#dc2626', color: 'white', padding: '0.5rem 1rem', borderRadius: '0.25rem', fontWeight: '600', border: 'none', cursor: 'pointer' }}
                >
                  🔒 Lock Character Choice
                </button>
              </div>
            ) : (
              <div>
                <div style={{ marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#059669', borderRadius: '0.25rem' }}>
                  <p style={{ fontSize: '0.875rem', margin: 0 }}>
                    <strong>🔒 You are controlling: {controlledCharacter}</strong>
                  </p>
                  <p style={{ fontSize: '0.75rem', margin: '0.25rem 0 0 0', opacity: 0.9 }}>
                    Character locked for the rest of the game
                  </p>
                </div>

                <p style={{ color: '#d1d5db', marginBottom: '1rem' }}>
                  Wait for the detective to ask <strong>{controlledCharacter}</strong> a question.
                  When they do, you'll be able to respond as this character.
                </p>

                {pendingQuestion && (
                  <div style={{ marginTop: '1rem', padding: '0.75rem', backgroundColor: '#7c2d12', borderRadius: '0.25rem' }}>
                    <p style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>
                      <strong>❓ Question for {controlledCharacter}:</strong>
                    </p>
                    <p style={{ fontSize: '0.875rem', marginBottom: '1rem', fontStyle: 'italic', backgroundColor: '#451a03', padding: '0.5rem', borderRadius: '0.25rem' }}>
                      "{pendingQuestion}"
                    </p>

                    <div style={{ marginBottom: '0.5rem' }}>
                      <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>Your Response as {controlledCharacter}:</label>
                      <textarea
                        value={answerText}
                        onChange={(e) => setAnswerText(e.target.value)}
                        placeholder={`Answer as ${controlledCharacter}...`}
                        style={{ width: '100%', padding: '0.5rem', backgroundColor: '#374151', borderRadius: '0.25rem', border: '1px solid #4b5563', color: 'white', minHeight: '4rem', resize: 'vertical' }}
                      />
                    </div>

                    <button
                      onClick={sendAnswer}
                      disabled={!answerText.trim()}
                      style={{ backgroundColor: !answerText.trim() ? '#4b5563' : '#059669', color: 'white', padding: '0.5rem 1rem', borderRadius: '0.25rem', fontWeight: '600', border: 'none', cursor: 'pointer' }}
                    >
                      Send Response
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      {showHelp && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 50 }}>
          <div style={{ backgroundColor: '#1f2937', color: 'white', width: '100%', maxWidth: '42rem', borderRadius: '0.5rem', padding: '1rem', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#fbbf24' }}>How to Play</h2>
              <button onClick={() => setShowHelp(false)} style={{ backgroundColor: '#374151', color: 'white', border: 'none', borderRadius: '0.375rem', padding: '0.375rem 0.75rem', cursor: 'pointer' }}>Close</button>
            </div>
            <div style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              <p style={{ color: '#d1d5db' }}>Choose a role and either quick-match or share a room code to play with a friend.</p>
              <ul style={{ textAlign: 'left', lineHeight: 1.6 }}>
                <li><strong>Roles:</strong> Detective asks questions; Character Controller answers as a chosen suspect.</li>
                <li><strong>Quick Match:</strong> Click Quick Match as Detective/Character to pair automatically.</li>
                <li><strong>Room Code:</strong> Create a room, share the code, both join it, then select roles.</li>
                <li><strong>Detective:</strong> Pick a character, type a question, click Ask.</li>
                <li><strong>Character Controller:</strong> Lock a character. When asked, type and send your response.</li>
                <li><strong>Tips:</strong> If no human reply, AI will answer. Use Back to Lobby to restart.</li>
              </ul>
            </div>
          </div>
        </div>
      )}
      {/* DISABLED: Media viewer temporarily disabled to fix evidence search issue */}
      {toast && (
        <div style={{ position: 'fixed', bottom: '1rem', left: '50%', transform: 'translateX(-50%)', backgroundColor: toast.type === 'ok' ? '#065f46' : '#7f1d1d', color: 'white', border: '1px solid rgba(255,255,255,0.15)', padding: '0.5rem 0.75rem', borderRadius: '0.375rem', zIndex: 140 }}>
          {toast.text}
        </div>
      )}
      {showAlibisModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 80 }}>
          <div style={{ backgroundColor: '#1f2937', color: 'white', width: '100%', maxWidth: '48rem', borderRadius: '0.5rem', padding: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 600 }}>🧭 Alibis</h3>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => { void fetchCredibility(); }} style={{ backgroundColor: '#374151', color: 'white', border: 'none', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', cursor: 'pointer', fontSize: '0.875rem' }}>Credibility</button>
                <button onClick={() => void fetchAlibis()} style={{ backgroundColor: '#374151', color: 'white', border: 'none', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', cursor: 'pointer', fontSize: '0.875rem' }}>Refresh</button>
                <button onClick={() => setShowAlibisModal(false)} style={{ backgroundColor: '#374151', color: 'white', border: 'none', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', cursor: 'pointer', fontSize: '0.875rem' }}>Close</button>
              </div>
            </div>
            {alibis.length === 0 ? (
              <div style={{ fontSize: '0.875rem', color: '#9ca3af' }}>No alibis recorded yet.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.5rem' }}>
                {alibis.map((a) => (
                  <div key={a.id} style={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '0.375rem', padding: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>{a.character}</span>
                      {typeof a.credibility_score === 'number' && (
                        <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>cred: {a.credibility_score.toFixed(1)}</span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#d1d5db' }}>Time: {a.timeframe}</div>
                    <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>{a.account}</div>
                  </div>
                ))}
              </div>
            )}
            {credibility.counts.length > 0 && (
              <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: '#9ca3af' }}>
                <div style={{ marginBottom: '0.25rem' }}>Contradictions detected:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {credibility.counts.map((c, i) => (
                    <span key={i} style={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '9999px', padding: '0.25rem 0.5rem' }}>
                      {c.character}: {c.contradictions}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {showTimelineModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 80 }}>
          <div style={{ backgroundColor: '#1f2937', color: 'white', width: '100%', maxWidth: '48rem', borderRadius: '0.5rem', padding: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 600 }}>🕰️ Timeline</h3>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => void fetchTimeline()} style={{ backgroundColor: '#374151', color: 'white', border: 'none', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', cursor: 'pointer', fontSize: '0.875rem' }}>Refresh</button>
                <button onClick={() => setShowTimelineModal(false)} style={{ backgroundColor: '#374151', color: 'white', border: 'none', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', cursor: 'pointer', fontSize: '0.875rem' }}>Close</button>
              </div>
            </div>
            {timeline.length === 0 ? (
              <div style={{ fontSize: '0.875rem', color: '#9ca3af' }}>No timeline events yet.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(1, minmax(0, 1fr))', gap: '0.5rem' }}>
                {timeline.map((t) => (
                  <div key={t.id} style={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '0.375rem', padding: '0.5rem', display: 'grid', gridTemplateColumns: '6rem 1fr', gap: '0.5rem' }}>
                    <div style={{ fontSize: '0.875rem', color: '#d1d5db' }}>
                      <div style={{ fontWeight: 600 }}>{t.tstamp}</div>
                      <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{t.phase}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: '0.875rem', fontWeight: 600 }}>{t.label}</div>
                      {t.details && <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>{t.details}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {showEvidenceModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 80 }}>
          <div style={{ backgroundColor: '#1f2937', color: 'white', width: '100%', maxWidth: '48rem', borderRadius: '0.5rem', padding: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 600 }}>🧾 Evidence</h3>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => void fetchEvidence()} style={{ backgroundColor: '#374151', color: 'white', border: 'none', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', cursor: 'pointer', fontSize: '0.875rem' }}>Refresh</button>
                <button onClick={() => setShowEvidenceModal(false)} style={{ backgroundColor: '#374151', color: 'white', border: 'none', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', cursor: 'pointer', fontSize: '0.875rem' }}>Close</button>
              </div>
            </div>
            {evidence.filter(e => e.is_discovered).length === 0 ? (
              <div style={{ fontSize: '0.875rem', color: '#9ca3af' }}>No evidence recorded yet.</div>
            ) : (
              <div style={{ display: 'flex', gap: '0.75rem', overflowX: 'auto', paddingBottom: '0.25rem' }}>
                {evidence.filter(e => e.is_discovered).map((e) => {
                  const thumb = e.thumbnail_url || e.thumb_url || e.thumbnail || e.thumb_path || '';

                  return (
                    <div key={e.id} style={{ minWidth: '14rem', backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '0.375rem', padding: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                        <span style={{ fontSize: '0.875rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.title}</span>
                        <span style={{ fontSize: '0.75rem', color: '#9ca3af', marginLeft: '0.5rem' }}>{e.type}</span>
                      </div>
                      <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 9', backgroundColor: '#0f172a', borderRadius: '0.25rem', overflow: 'hidden', marginBottom: '0.5rem', cursor: 'pointer' }}>
                        {thumb ? (
                          e.type === 'video' ? (
                            <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                              <video
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  objectFit: 'cover',
                                  cursor: 'pointer',
                                  borderRadius: '0.25rem'
                                }}
                                poster={thumb}
                                preload="metadata"
                                onClick={(event) => {
                                  const video = event.currentTarget;
                                  if (video.paused) {
                                    video.play().catch(console.error);
                                  } else {
                                    video.pause();
                                  }
                                }}
                                onError={(event) => {
                                  console.error('Video error:', event);
                                }}
                              >
                                <source src={e.media_url || ''} type="video/mp4" />
                                <div style={{
                                  width: '100%',
                                  height: '100%',
                                  backgroundImage: `url("${thumb}")`,
                                  backgroundSize: 'cover',
                                  backgroundPosition: 'center',
                                  backgroundRepeat: 'no-repeat',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  color: 'white',
                                  fontSize: '0.875rem'
                                }}>
                                  Video not supported
                                </div>
                              </video>
                              <div style={{
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-50%, -50%)',
                                color: 'white',
                                fontSize: '1.5rem',
                                opacity: 0.8,
                                pointerEvents: 'none'
                              }}>
                                ▶
                              </div>
                            </div>
                                                  ) : (
                          <div style={{
                            position: 'relative',
                            width: '100%',
                            height: '100%',
                            borderRadius: '0.25rem',
                            overflow: 'hidden'
                          }}>
                            <img
                              src={thumb}
                              alt={`${e.title} thumbnail`}
                              style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                pointerEvents: 'none',
                                userSelect: 'none',
                                WebkitUserSelect: 'none',
                                MozUserSelect: 'none',
                                msUserSelect: 'none',
                                borderRadius: '0.25rem'
                              }}
                              onError={(event) => {
                                const img = event.currentTarget;
                                img.style.display = 'none';
                                const parent = img.parentElement;
                                if (parent) {
                                  parent.innerHTML = `
                                    <div style="
                                      width: 100%;
                                      height: 100%;
                                      background-color: #374151;
                                      display: flex;
                                      align-items: center;
                                      justify-content: center;
                                      color: #9ca3af;
                                      font-size: 0.75rem;
                                      text-align: center;
                                      padding: 0.25rem;
                                      border-radius: 0.25rem;
                                    ">
                                      Image failed to load<br/>
                                      <small style="color: #64748b;">${thumb}</small>
                                    </div>
                                  `;
                                }
                              }}
                            />
                          </div>
                        )
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: '0.75rem' }}>
                            No preview
                          </div>
                        )}
                      </div>
                      {e.location && (
                        <div style={{ fontSize: '0.75rem', color: '#d1d5db' }}>Location: {e.location}</div>
                      )}
                      {typeof e.is_discovered === 'boolean' && (
                        <div style={{ fontSize: '0.75rem', color: e.is_discovered ? '#10b981' : '#9ca3af' }}>
                          {e.is_discovered ? 'Discovered' : 'Undiscovered'}
                        </div>
                      )}
                      {e.notes && (
                        <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>{e.notes}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
      {showCluesModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 80 }}>
          <div style={{ backgroundColor: '#1f2937', color: 'white', width: '100%', maxWidth: '48rem', borderRadius: '0.5rem', padding: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 600 }}>🧩 Clues</h3>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => void fetchClues()} style={{ backgroundColor: '#374151', color: 'white', border: 'none', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', cursor: 'pointer', fontSize: '0.875rem' }}>Refresh</button>
                <button onClick={() => setShowCluesModal(false)} style={{ backgroundColor: '#374151', color: 'white', border: 'none', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', cursor: 'pointer', fontSize: '0.875rem' }}>Close</button>
              </div>
            </div>
            {clues.length === 0 ? (
              <div style={{ fontSize: '0.875rem', color: '#9ca3af' }}>No clues yet. Ask questions to gather information.</div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.5rem' }}>
                {clues.map((c, idx) => (
                  <div key={idx} style={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '0.375rem', padding: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                      <span style={{ fontSize: '0.75rem', color: '#d1d5db' }}>{c.source || 'Unknown'}</span>
                      <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{c.type || 'FACT'}</span>
                    </div>
                    <div style={{ fontSize: '0.875rem' }}>{c.text}</div>
                    {c.timestamp && (
                      <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>{new Date(c.timestamp).toLocaleString()}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* GameMaster Panel */}
      {showGameMasterPanel && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', zIndex: 100 }}>
          <div style={{ backgroundColor: '#1f2937', color: 'white', width: '100%', maxWidth: '48rem', borderRadius: '0.5rem', padding: '1.5rem', boxShadow: '0 10px 25px rgba(0,0,0,0.5)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#a855f7' }}>🎭 Game Master</h2>
              <button
                onClick={() => setShowGameMasterPanel(false)}
                style={{ backgroundColor: '#374151', color: 'white', border: 'none', borderRadius: '0.375rem', padding: '0.375rem 0.75rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ display: 'grid', gap: '1rem', marginBottom: '1rem' }}>
              {/* Narrative Story */}
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#d1d5db', marginBottom: '0.5rem' }}>
                  📖 Murder Mystery Story
                </label>
                <textarea
                  value={gameData.narrative}
                  onChange={(e) => setGameData({...gameData, narrative: e.target.value})}
                  placeholder="Write the complete murder mystery story. This will be stored as the game's narrative background.

Example: 'Dr. Blackwood was found murdered in his study at 9:15 PM. He was a respected but arrogant physician who had made many enemies...'"
                  style={{
                    width: '100%',
                    minHeight: '120px',
                    padding: '0.75rem',
                    backgroundColor: '#111827',
                    border: '1px solid #374151',
                    borderRadius: '0.375rem',
                    color: 'white',
                    fontSize: '0.875rem',
                    resize: 'vertical',
                    fontFamily: 'inherit'
                  }}
                />
              </div>

              {/* Evidence Items */}
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#d1d5db', marginBottom: '0.5rem' }}>
                  🧾 Evidence Items
                </label>
                <textarea
                  value={gameData.evidence}
                  onChange={(e) => setGameData({...gameData, evidence: e.target.value})}
                  placeholder="List evidence items, one per line. Format: Title | Type | Location | Notes

Examples:
Letter Opener | item | Mrs. Bellamy's Purse | Murder weapon, planted as red herring
Financial Ledger | document | Study Desk | Shows large unpaid debts
Cigar Stub | item | Study Ashtray | Expensive Cuban, victim didn't smoke"
                  style={{
                    width: '100%',
                    minHeight: '100px',
                    padding: '0.75rem',
                    backgroundColor: '#111827',
                    border: '1px solid #374151',
                    borderRadius: '0.375rem',
                    color: 'white',
                    fontSize: '0.875rem',
                    resize: 'vertical',
                    fontFamily: 'inherit'
                  }}
                />
              </div>

              {/* Clues */}
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#d1d5db', marginBottom: '0.5rem' }}>
                  🧩 Clues
                </label>
                <textarea
                  value={gameData.clues}
                  onChange={(e) => setGameData({...gameData, clues: e.target.value})}
                  placeholder="List clues, one per line. Format: Clue Text | Type | Source

Types: IMPORTANT (key facts) or CONTRADICTION (conflicting statements)

Examples:
The window was broken from inside, not outside | IMPORTANT | Forensic Report
Butler claims he was reading, but book was dusty | CONTRADICTION | Detective Observation"
                  style={{
                    width: '100%',
                    minHeight: '100px',
                    padding: '0.75rem',
                    backgroundColor: '#111827',
                    border: '1px solid #374151',
                    borderRadius: '0.375rem',
                    color: 'white',
                    fontSize: '0.875rem',
                    resize: 'vertical',
                    fontFamily: 'inherit'
                  }}
                />
              </div>

              {/* Timeline */}
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#d1d5db', marginBottom: '0.5rem' }}>
                  🕰️ Timeline Events
                </label>
                <textarea
                  value={gameData.timeline}
                  onChange={(e) => setGameData({...gameData, timeline: e.target.value})}
                  placeholder="List timeline events, one per line. Format: Time | Phase | Label | Details

Phases: pre_crime, during_crime, post_discovery

Examples:
2:00 PM | pre_crime | Public Argument | Holloway argues with victim over debts
8:45 PM | during_crime | Suspicious Activity | Tommy sees shadow near kitchen door
9:15 PM | post_discovery | Body Discovery | Housekeeper finds victim"
                  style={{
                    width: '100%',
                    minHeight: '100px',
                    padding: '0.75rem',
                    backgroundColor: '#111827',
                    border: '1px solid #374151',
                    borderRadius: '0.375rem',
                    color: 'white',
                    fontSize: '0.875rem',
                    resize: 'vertical',
                    fontFamily: 'inherit'
                  }}
                />
              </div>

              {/* Alibis */}
              <div>
                <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '600', color: '#d1d5db', marginBottom: '0.5rem' }}>
                  🧭 Character Alibis
                </label>
                <textarea
                  value={gameData.alibis}
                  onChange={(e) => setGameData({...gameData, alibis: e.target.value})}
                  placeholder="List character alibis, one per line. Format: Character | Timeframe | Account | Credibility (0-100)

Examples:
Mrs. Bellamy | 8:00-9:30 PM | Claims to visit sister in next village | 60
Mr. Holloway | 8:00-10:00 PM | Says he was home reading by fire, wife confirms shakily | 45
Dr. Blackwood | 8:30-9:15 PM | Lecture ended at 8:30, whereabouts unknown after | 25"
                  style={{
                    width: '100%',
                    minHeight: '100px',
                    padding: '0.75rem',
                    backgroundColor: '#111827',
                    border: '1px solid #374151',
                    borderRadius: '0.375rem',
                    color: 'white',
                    fontSize: '0.875rem',
                    resize: 'vertical',
                    fontFamily: 'inherit'
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowGameMasterPanel(false)}
                style={{ backgroundColor: '#374151', color: 'white', border: 'none', padding: '0.5rem 1rem', borderRadius: '0.375rem', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={() => createGameFromStructuredData()}
                disabled={!gameData.narrative.trim() || isGenerating}
                style={{
                  backgroundColor: !gameData.narrative.trim() || isGenerating ? '#4b5563' : '#7c3aed',
                  color: 'white',
                  border: 'none',
                  padding: '0.5rem 1rem',
                  borderRadius: '0.375rem',
                  cursor: !gameData.narrative.trim() || isGenerating ? 'not-allowed' : 'pointer',
                  fontWeight: '600'
                }}
              >
                {isGenerating ? '🎭 Creating...' : '🎭 Create Game'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
// Force deployment - Sat Aug  9 20:28:45 BST 2025
/* Fixed Socket.IO import - Sat Aug  9 20:42:12 BST 2025 */

/* ci: trigger vercel deploy */
