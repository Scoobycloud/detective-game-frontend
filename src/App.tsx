import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import './App.css';
import { auth, provider, signInWithPopup, onAuthStateChanged, signOut } from './firebase';

// Real-time Detective Game Interface with Socket.IO
function App() {
  const [role, setRole] = useState<'detective' | 'murderer' | null>(null);
  const [gameState, setGameState] = useState<'lobby' | 'playing'>('lobby');
  const [messages, setMessages] = useState<string[]>([]);
  const [roomCode, setRoomCode] = useState('');
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

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

  useEffect(() => {
    controlledRef.current = controlledCharacter;
  }, [controlledCharacter]);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setUserEmail(user?.email ?? null);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    addMessage('🎮 Welcome to Detective Game Online!');
    addMessage('Choose your role to begin...');
  }, []);

  useEffect(() => {
    // Initialize Socket.IO connection
    if (role && myRoom && !socketRef.current) {
      addMessage('🔗 Connecting to game server...');

      socketRef.current = io(API_URL, {
        transports: ['websocket'],
        auth: async (cb: any) => {
          try {
            const token = await auth.currentUser?.getIdToken();
            cb({ idToken: token });
          } catch {
            cb({});
          }
        }
      });

      const socket = socketRef.current;

      socket.on('connect', () => {
        setConnected(true);
        addMessage('✅ Connected to game server!');

        // Join as the selected role in specified room
        socket.emit('join_role', { role, room: myRoom });
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

  const createRoom = () => {
    if (socketRef.current) {
      socketRef.current.emit('create_room', {});
      socketRef.current.on('room_created', ({ room }: { room: string }) => {
        setMyRoom(room);
        addMessage(`🏠 Room created: ${room}`);
      });
    } else {
      // Create a transient socket just to create a room, then close
      const temp = io(API_URL, { transports: ['websocket'] });
      temp.on('connect', () => {
        temp.emit('create_room', {});
      });
      temp.on('room_created', ({ room }: { room: string }) => {
        setMyRoom(room);
        addMessage(`🏠 Room created: ${room}`);
        temp.disconnect();
      });
      temp.on('disconnect', () => temp.close());
    }
  };

  const quickMatch = (asRole: 'detective' | 'murderer') => {
    const temp = io(API_URL, { transports: ['websocket'] });
    temp.on('connect', () => {
      temp.emit('queue_for_role', { role: asRole });
      addMessage(`⏳ Queued for matchmaking as ${asRole}...`);
    });
    temp.on('matched', ({ room }: { room: string }) => {
      setMyRoom(room);
      setRole(asRole);
      setGameState('playing');
      addMessage(`✅ Matched! Room: ${room}`);
      temp.disconnect();
    });
    temp.on('error', ({ msg }: { msg: string }) => addMessage(`❌ Error: ${msg}`));
    temp.on('disconnect', () => temp.close());
  };

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
        <div style={{ textAlign: 'center', padding: '2rem', backgroundColor: '#1f2937', borderRadius: '0.5rem', maxWidth: '28rem' }}>
          <h1 style={{ fontSize: '2.25rem', fontWeight: 'bold', marginBottom: '1.5rem', color: '#fbbf24' }}>🕵️ Detective Game</h1>
          <button
            onClick={() => setShowHelp(true)}
            style={{ backgroundColor: '#4b5563', color: 'white', padding: '0.375rem 0.75rem', borderRadius: '0.375rem', border: 'none', cursor: 'pointer', marginBottom: '1rem', fontWeight: 600 }}
          >❓ How to Play</button>
          <p style={{ marginBottom: '2rem', color: '#d1d5db' }}>Real-time multiplayer mystery game</p>

          <div style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="Enter room code"
                style={{ flex: 1, padding: '0.5rem', backgroundColor: '#374151', borderRadius: '0.25rem', border: '1px solid #4b5563', color: 'white' }}
              />
              <button
                onClick={() => {
                  if (!roomCode.trim()) return;
                  setMyRoom(roomCode.trim());
                  addMessage(`🔑 Set room: ${roomCode.trim()}`);
                }}
                style={{ backgroundColor: '#4b5563', color: 'white', padding: '0.5rem 0.75rem', borderRadius: '0.25rem', border: 'none', cursor: 'pointer' }}
              >Join</button>
            </div>
            <button
              onClick={createRoom}
              style={{ marginTop: '0.5rem', width: '100%', backgroundColor: '#059669', color: 'white', padding: '0.5rem 1rem', borderRadius: '0.25rem', border: 'none', cursor: 'pointer' }}
            >Create New Room</button>
            {myRoom && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: '#d1d5db' }}>Selected room: {myRoom}</div>
            )}
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <button
              onClick={joinAsDetective}
              style={{ width: '100%', backgroundColor: '#2563eb', color: 'white', padding: '0.75rem 1.5rem', borderRadius: '0.5rem', fontWeight: '600', border: 'none', cursor: 'pointer', marginBottom: '1rem' }}
            >
              🕵️ Play as Detective
            </button>

            <button
              onClick={joinAsMurderer}
              style={{ width: '100%', backgroundColor: '#dc2626', color: 'white', padding: '0.75rem 1.5rem', borderRadius: '0.5rem', fontWeight: '600', border: 'none', cursor: 'pointer' }}
            >
              🎭 Control a Character
            </button>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <button
              onClick={() => quickMatch('detective')}
              style={{ width: '100%', backgroundColor: '#1d4ed8', color: 'white', padding: '0.5rem 1rem', borderRadius: '0.5rem', fontWeight: 600 as any, border: 'none', cursor: 'pointer', marginBottom: '0.5rem' }}
            >
              🔀 Quick Match as Detective
            </button>
            <button
              onClick={() => quickMatch('murderer')}
              style={{ width: '100%', backgroundColor: '#b91c1c', color: 'white', padding: '0.5rem 1rem', borderRadius: '0.5rem', fontWeight: 600 as any, border: 'none', cursor: 'pointer' }}
            >
              🔀 Quick Match as Character
            </button>
          </div>

          <div style={{ marginTop: '2rem', padding: '1rem', backgroundColor: '#374151', borderRadius: '0.25rem', fontSize: '0.875rem' }}>
            <p><strong>Detective:</strong> Ask questions to solve the mystery</p>
            <p><strong>Character Controller:</strong> Answer as your chosen character</p>
          </div>

          <div style={{ marginTop: '1rem', fontSize: '0.75rem', color: '#9ca3af' }}>
            Backend: {API_URL}
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
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#111827', color: 'white' }}>
      {/* Header aligned with content container */}
      <div style={{ backgroundColor: '#1f2937', padding: '1rem 0' }}>
        <div style={{ maxWidth: '64rem', margin: '0 auto', padding: '0 1rem' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#fbbf24' }}>
            🕵️ Detective Game - {role === 'detective' ? 'Detective Mode' : 'Character Controller'}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.5rem' }}>
            <div style={{ marginRight: 'auto', fontSize: '0.875rem', color: '#d1d5db' }}>
              {userEmail ? `Signed in as ${userEmail}` : 'Not signed in'}
            </div>
            <button
              onClick={() => {
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
              }}
              style={{ fontSize: '0.875rem', backgroundColor: '#4b5563', color: 'white', padding: '0.25rem 0.75rem', borderRadius: '0.25rem', border: 'none', cursor: 'pointer' }}
            >
              ← Back to Lobby
            </button>
            <div style={{ fontSize: '0.875rem', color: connected ? '#10b981' : '#ef4444' }}>
              {connected ? '🟢 Connected' : '🔴 Disconnected'}
            </div>
            <button
              onClick={() => setShowHelp(true)}
              style={{ fontSize: '0.875rem', backgroundColor: '#4b5563', color: 'white', padding: '0.25rem 0.75rem', borderRadius: '0.25rem', border: 'none', cursor: 'pointer' }}
            >❓ How to Play</button>
            {userEmail ? (
              <button onClick={() => signOut(auth)} style={{ fontSize: '0.875rem', backgroundColor: '#374151', color: 'white', padding: '0.25rem 0.75rem', borderRadius: '0.25rem', border: 'none', cursor: 'pointer' }}>Sign out</button>
            ) : (
              <button onClick={() => signInWithPopup(auth, provider)} style={{ fontSize: '0.875rem', backgroundColor: '#059669', color: 'white', padding: '0.25rem 0.75rem', borderRadius: '0.25rem', border: 'none', cursor: 'pointer' }}>Sign in</button>
            )}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '64rem', margin: '0 auto', padding: '1rem' }}>
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
                onKeyPress={(e) => e.key === 'Enter' && askQuestion()}
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
    </div>
  );
}

export default App;
// Force deployment - Sat Aug  9 20:28:45 BST 2025
/* Fixed Socket.IO import - Sat Aug  9 20:42:12 BST 2025 */

/* ci: trigger vercel deploy */
