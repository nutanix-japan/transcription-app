import React, { useState, useEffect, useRef, useCallback } from 'react';

const supportedLanguages = {
  'ja': '日本語',
  'ko': 'Korean',
  'ZH-HANT': 'Chinese (Traditional)'
};

const UserTranscriptionView = ({ isMicrophoneActive }) => {
  const [transcriptions, setTranscriptions] = useState([]);
  const [selectedLanguage, setSelectedLanguage] = useState('ja');
  const [status, setStatus] = useState('Disconnected');
  const [showTranscript, setShowTranscript] = useState(true);
  const [showTranslation, setShowTranslation] = useState(true);
  const [hostMicMuted, setHostMicMuted] = useState(false);

  const wsRef = useRef(null);
  const originalRef = useRef(null);
  const translatedRef = useRef(null);

  const connectWebSocket = useCallback(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      return;
    }

    wsRef.current = new WebSocket('ws://localhost:3001');

    wsRef.current.onopen = () => {
      setStatus('Connected');
      // Send the current language to the server when connected
      wsRef.current.send(JSON.stringify({ type: 'setLanguage', language: selectedLanguage }));
    };

    wsRef.current.onclose = () => {
      setStatus('Disconnected');
      // Attempt to reconnect after a short delay
      setTimeout(connectWebSocket, 5000);
    };

    wsRef.current.onmessage = (event) => {
      const message = JSON.parse(event.data);
      console.log('WebSocket message received:', message); // Debug log
      if (message.type === 'transcript') {
        setTranscriptions(prev => [...prev, message.data]);
      } else if (message.type === 'micMuted') {
        console.log('Host mic muted status:', message.muted); // Debug log
        setHostMicMuted(message.muted);
      }
    };
  }, [selectedLanguage]);

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connectWebSocket]); // Add connectWebSocket to the dependency array

  useEffect(() => {
    if (originalRef.current) {
      originalRef.current.scrollTop = originalRef.current.scrollHeight;
    }
    if (translatedRef.current) {
      translatedRef.current.scrollTop = translatedRef.current.scrollHeight;
    }
  }, [transcriptions]);

  useEffect(() => {
    return () => {
      setTranscriptions([]);
      setStatus('Disconnected');
    };
  }, []);

  const handleLanguageChange = (e) => {
    const newLanguage = e.target.value;
    setSelectedLanguage(newLanguage);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'setLanguage', language: newLanguage }));
    }
  };

  const renderContent = (content, type) => {
    if (hostMicMuted) {
      return <p className="text-red-500 italic">Host microphone is muted</p>;
    }
    return content.length > 0 ? (
      content.map((t, index) => (
        <div key={index} className="mb-2">
          <p>{t[type] || 'N/A'}</p>
        </div>
      ))
    ) : (
      `Waiting for ${type === 'original' ? 'transcription' : 'translation'}...`
    );
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Real-time Transcription and Translation</h1>
      <div className="mb-4 flex items-center">
        <span className="mr-4">Status: {status}</span>
        <span className="mr-4">Microphone: {isMicrophoneActive ? 'Active' : 'Muted'}</span>
        <select 
          value={selectedLanguage} 
          onChange={handleLanguageChange}
          className="ml-auto px-4 py-2 text-black border rounded"
        >
          {Object.entries(supportedLanguages).map(([code, name]) => (
            <option key={code} value={code}>{name}</option>
          ))}
        </select>
      </div>
      <div className="mb-4 flex space-x-4">
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={showTranscript}
            onChange={(e) => setShowTranscript(e.target.checked)}
            className="mr-2"
          />
          Show Transcript
        </label>
        <label className="flex items-center">
          <input
            type="checkbox"
            checked={showTranslation}
            onChange={(e) => setShowTranslation(e.target.checked)}
            className="mr-2"
          />
          Show Translation
        </label>
      </div>
      <div className="flex space-x-4 mb-4">
        {showTranscript && (
          <div className="flex-1 border p-4 h-64 overflow-y-auto rounded" ref={originalRef}>
            <h2 className="text-xl font-semibold mb-2 rounded">Original Transcription</h2>
            {renderContent(transcriptions, 'original')}
          </div>
        )}
        {showTranslation && (
          <div className="flex-1 border p-4 h-64 overflow-y-auto rounded" ref={translatedRef}>
            <h2 className="text-xl font-semibold mb-2 rounded">Translation ({supportedLanguages[selectedLanguage]})</h2>
            {renderContent(transcriptions, 'translated')}
          </div>
        )}
      </div>
    </div>
  );
};

export default UserTranscriptionView;
