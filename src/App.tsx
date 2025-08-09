import React, { useState, useEffect } from 'react';
import './App.css';

// Simple Detective Game Interface
function App() {
  const [role, setRole] = useState<'detective' | 'murderer' | null>(null);
  const [gameState, setGameState] = useState<'lobby' | 'playing'>('lobby');
  const [messages, setMessages] = useState<string[]>([]);
  const [question, setQuestion] = useState('');
  const [selectedCharacter, setSelectedCharacter] = useState('');
  
  // Murderer-specific states
  const [controlledCharacter, setControlledCharacter] = useState('');
  const [characterLocked, setCharacterLocked] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState('');
  const [answerText, setAnswerText] = useState('');

  const characters = [
    'Mrs. Bellamy',
    'Mr. Holloway', 
    'Tommy the Janitor',
    'Dr. Adrian Blackwood'
  ];

  const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

  useEffect(() => {
    addMessage('�� Welcome to Detective Game Online!');
    addMessage('Choose your role to begin...');
  }, []);

  const addMessage = (msg: string) => {
    setMessages(prev => [...prev, msg]);
  };

  const joinAsDetective = () => {
    setRole('detective');
    setGameState('playing');
    addMessage('🕵️ You are the Detective! Question the suspects to solve the mystery.');
  };

  const joinAsMurderer = () => {
    setRole('murderer');
    setGameState('playing');
    addMessage('🎭 You are controlling a character! Select which character you want to control.');
  };

  const lockCharacter = () => {
    if (!controlledCharacter) return;
    
    setCharacterLocked(true);
    addMessage(`🔒 You are now controlling ${controlledCharacter} for the rest of the game.`);
    addMessage('🎭 When the detective asks this character questions, you will respond.');
  };

  const askQuestion = async () => {
    if (!question.trim() || !selectedCharacter) return;

    const questionText = `🕵️ You: ${question}`;
    addMessage(questionText);
    const currentQuestion = question;
    setQuestion('');

    try {
      const response = await fetch(`${API_URL}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          character: selectedCharacter,
          question: currentQuestion
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      addMessage(`💬 ${selectedCharacter}: ${data.answer}`);
    } catch (error) {
      console.error('Backend connection error:', error);
      addMessage('❌ Error connecting to backend. Check if server is running.');
      addMessage(`🔗 Trying to connect to: ${API_URL}`);
    }
  };

  if (gameState === 'lobby') {
    return (
      <div style={{minHeight: '100vh', backgroundColor: '#111827', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
        <div style={{textAlign: 'center', padding: '2rem', backgroundColor: '#1f2937', borderRadius: '0.5rem', maxWidth: '28rem'}}>
          <h1 style={{fontSize: '2.25rem', fontWeight: 'bold', marginBottom: '1.5rem', color: '#fbbf24'}}>🕵️ Detective Game</h1>
          <p style={{marginBottom: '2rem', color: '#d1d5db'}}>Choose your role in this multiplayer mystery game</p>
          
          <div style={{marginBottom: '1rem'}}>
            <button 
              onClick={joinAsDetective}
              style={{width: '100%', backgroundColor: '#2563eb', color: 'white', padding: '0.75rem 1.5rem', borderRadius: '0.5rem', fontWeight: '600', border: 'none', cursor: 'pointer', marginBottom: '1rem'}}
            >
              🕵️ Play as Detective
            </button>
            
            <button 
              onClick={joinAsMurderer}
              style={{width: '100%', backgroundColor: '#dc2626', color: 'white', padding: '0.75rem 1.5rem', borderRadius: '0.5rem', fontWeight: '600', border: 'none', cursor: 'pointer'}}
            >
              🎭 Control a Character
            </button>
          </div>

          <div style={{marginTop: '2rem', padding: '1rem', backgroundColor: '#374151', borderRadius: '0.25rem', fontSize: '0.875rem'}}>
            <p><strong>Detective:</strong> Ask questions to solve the mystery</p>
            <p><strong>Character Controller:</strong> Answer as your chosen character</p>
          </div>

          <div style={{marginTop: '1rem', fontSize: '0.75rem', color: '#9ca3af'}}>
            Backend: {API_URL}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{minHeight: '100vh', backgroundColor: '#111827', color: 'white'}}>
      {/* Header */}
      <div style={{backgroundColor: '#1f2937', padding: '1rem'}}>
        <h1 style={{fontSize: '1.5rem', fontWeight: 'bold', color: '#fbbf24'}}>
          🕵️ Detective Game - {role === 'detective' ? 'Detective Mode' : 'Character Controller'}
        </h1>
        <button 
          onClick={() => {setGameState('lobby'); setRole(null); setMessages([]); setCharacterLocked(false); setControlledCharacter('');}}
          style={{marginTop: '0.5rem', fontSize: '0.875rem', backgroundColor: '#4b5563', color: 'white', padding: '0.25rem 0.75rem', borderRadius: '0.25rem', border: 'none', cursor: 'pointer'}}
        >
          ← Back to Lobby
        </button>
      </div>

      <div style={{maxWidth: '64rem', margin: '0 auto', padding: '1rem'}}>
        {/* Game Messages */}
        <div style={{backgroundColor: '#1f2937', borderRadius: '0.5rem', padding: '1rem', height: '24rem', overflowY: 'auto', marginBottom: '1rem'}}>
          {messages.map((msg, i) => (
            <div key={i} style={{marginBottom: '0.5rem', fontSize: '0.875rem'}}>
              {msg}
            </div>
          ))}
        </div>

        {/* Detective Interface */}
        {role === 'detective' && (
          <div style={{backgroundColor: '#1f2937', borderRadius: '0.5rem', padding: '1rem'}}>
            <h3 style={{fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem'}}>🔍 Interrogation</h3>
            
            <div style={{marginBottom: '1rem'}}>
              <label style={{display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem'}}>Select Character to Question:</label>
              <select 
                value={selectedCharacter}
                onChange={(e) => setSelectedCharacter(e.target.value)}
                style={{width: '100%', padding: '0.5rem', backgroundColor: '#374151', borderRadius: '0.25rem', border: '1px solid #4b5563', color: 'white'}}
              >
                <option value="">Choose a character...</option>
                {characters.map(char => (
                  <option key={char} value={char}>{char}</option>
                ))}
              </select>
            </div>

            <div style={{display: 'flex', gap: '0.5rem'}}>
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && askQuestion()}
                placeholder="Ask your question..."
                style={{flex: 1, padding: '0.5rem', backgroundColor: '#374151', borderRadius: '0.25rem', border: '1px solid #4b5563', color: 'white'}}
              />
              <button 
                onClick={askQuestion}
                disabled={!question.trim() || !selectedCharacter}
                style={{backgroundColor: !question.trim() || !selectedCharacter ? '#4b5563' : '#2563eb', color: 'white', padding: '0.5rem 1rem', borderRadius: '0.25rem', fontWeight: '600', border: 'none', cursor: 'pointer'}}
              >
                Ask
              </button>
            </div>
          </div>
        )}

        {/* Murderer Interface */}
        {role === 'murderer' && (
          <div style={{backgroundColor: '#1f2937', borderRadius: '0.5rem', padding: '1rem'}}>
            <h3 style={{fontSize: '1.125rem', fontWeight: '600', marginBottom: '1rem'}}>🎭 Character Control</h3>
            
            {!characterLocked ? (
              <div>
                <p style={{color: '#d1d5db', marginBottom: '1rem'}}>
                  Select which character you want to control. Once selected, this choice is permanent for the game.
                </p>
                
                <div style={{marginBottom: '1rem'}}>
                  <label style={{display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem'}}>Choose Your Character:</label>
                  <select 
                    value={controlledCharacter}
                    onChange={(e) => setControlledCharacter(e.target.value)}
                    style={{width: '100%', padding: '0.5rem', backgroundColor: '#374151', borderRadius: '0.25rem', border: '1px solid #4b5563', color: 'white'}}
                  >
                    <option value="">Select a character...</option>
                    {characters.map(char => (
                      <option key={char} value={char}>{char}</option>
                    ))}
                  </select>
                </div>

                <button 
                  onClick={lockCharacter}
                  disabled={!controlledCharacter}
                  style={{backgroundColor: !controlledCharacter ? '#4b5563' : '#dc2626', color: 'white', padding: '0.5rem 1rem', borderRadius: '0.25rem', fontWeight: '600', border: 'none', cursor: 'pointer'}}
                >
                  🔒 Lock Character Choice
                </button>
              </div>
            ) : (
              <div>
                <div style={{marginBottom: '1rem', padding: '0.75rem', backgroundColor: '#059669', borderRadius: '0.25rem'}}>
                  <p style={{fontSize: '0.875rem', margin: 0}}>
                    <strong>🔒 You are controlling: {controlledCharacter}</strong>
                  </p>
                  <p style={{fontSize: '0.75rem', margin: '0.25rem 0 0 0', opacity: 0.9}}>
                    Character locked for the rest of the game
                  </p>
                </div>
                
                <p style={{color: '#d1d5db', marginBottom: '1rem'}}>
                  Wait for the detective to ask <strong>{controlledCharacter}</strong> a question. 
                  When they do, you'll be able to respond as this character.
                </p>

                {pendingQuestion && (
                  <div style={{marginTop: '1rem', padding: '0.75rem', backgroundColor: '#7c2d12', borderRadius: '0.25rem'}}>
                    <p style={{fontSize: '0.875rem', marginBottom: '0.5rem'}}>
                      <strong>Question for {controlledCharacter}:</strong>
                    </p>
                    <p style={{fontSize: '0.875rem', marginBottom: '1rem', fontStyle: 'italic'}}>
                      "{pendingQuestion}"
                    </p>
                    
                    <div style={{marginBottom: '0.5rem'}}>
                      <label style={{display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem'}}>Your Response as {controlledCharacter}:</label>
                      <textarea
                        value={answerText}
                        onChange={(e) => setAnswerText(e.target.value)}
                        placeholder={`Answer as ${controlledCharacter}...`}
                        style={{width: '100%', padding: '0.5rem', backgroundColor: '#374151', borderRadius: '0.25rem', border: '1px solid #4b5563', color: 'white', minHeight: '4rem', resize: 'vertical'}}
                      />
                    </div>
                    
                    <button 
                      onClick={() => {
                        if (answerText.trim()) {
                          addMessage(`💬 ${controlledCharacter}: ${answerText}`);
                          setPendingQuestion('');
                          setAnswerText('');
                        }
                      }}
                      disabled={!answerText.trim()}
                      style={{backgroundColor: !answerText.trim() ? '#4b5563' : '#059669', color: 'white', padding: '0.5rem 1rem', borderRadius: '0.25rem', fontWeight: '600', border: 'none', cursor: 'pointer'}}
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
    </div>
  );
}

export default App;
