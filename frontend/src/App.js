import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import UserTranscriptionView from './UserTranscriptionView';

const supportedLanguages = {
  'ja': '日本語',
  'ko': 'Korean',
  'ZH-HANT': 'Chinese (Traditional)',
  'es': 'Spanish'
};

const TranscriptionApp = () => {
  const [transcriptions, setTranscriptions] = useState([]);
  const [status, setStatus] = useState('Disconnected');
  const [error, setError] = useState(null);
  const [debugLogs, setDebugLogs] = useState([]);
  const [selectedLanguage, setSelectedLanguage] = useState('ja');
  const [audioDevices, setAudioDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState('');

  const wsRef = useRef(null);
  const originalRef = useRef(null);
  const translatedRef = useRef(null);
  const debugLogsRef = useRef(null);

  useEffect(() => {
    connectWebSocket();
    getAudioDevices();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    if (originalRef.current) {
      originalRef.current.scrollTop = originalRef.current.scrollHeight;
    }
    if (translatedRef.current) {
      translatedRef.current.scrollTop = translatedRef.current.scrollHeight;
    }
  }, [transcriptions]);

  useEffect(() => {
    if (debugLogsRef.current) {
      debugLogsRef.current.scrollTop = debugLogsRef.current.scrollHeight;
    }
  }, [debugLogs]);

  useEffect(() => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'setLanguage', language: selectedLanguage }));
      addDebugLog(`Language changed to ${supportedLanguages[selectedLanguage]}`);
    }
  }, [selectedLanguage, wsRef]);

  const getAudioDevices = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputDevices = devices.filter(device => device.kind === 'audioinput');
      setAudioDevices(audioInputDevices);
      if (audioInputDevices.length > 0) {
        setSelectedDevice(audioInputDevices[0].deviceId);
      }
    } catch (error) {
      setError('Error getting audio devices');
      addDebugLog(`Error getting audio devices: ${error.message}`);
    }
  };

  const handleDeviceChange = (e) => {
    const newDevice = e.target.value;
    setSelectedDevice(newDevice);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'setAudioDevice', deviceId: newDevice }));
      addDebugLog(`Audio device changed to ${newDevice}`);
    }
  };

  const connectWebSocket = () => {
    wsRef.current = new WebSocket('ws://localhost:3001');

    wsRef.current.onopen = () => {
      setStatus('Connected');
      addDebugLog('WebSocket connected');
    };

    wsRef.current.onclose = () => {
      setStatus('Disconnected');
      addDebugLog('WebSocket disconnected');
    };

    wsRef.current.onerror = (error) => {
      setError('WebSocket error occurred');
      addDebugLog(`WebSocket error: ${error.message}`);
    };

    wsRef.current.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === 'transcript') {
        setTranscriptions(prev => [...prev, message.data]);
        addDebugLog(`Received transcript: ${message.data.original}`);
        addDebugLog(`Translated text (${message.data.language}): ${message.data.translated}`);
      } else if (message.type === 'debug') {
        addDebugLog(`Server debug: ${message.data}`);
      }
    };
  };

  const handleReconnect = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    connectWebSocket();
  };

  const addDebugLog = (log) => {
    setDebugLogs(prev => [...prev, log]);
  };

  const handleLanguageChange = (e) => {
    const newLanguage = e.target.value;
    setSelectedLanguage(newLanguage);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'setLanguage', language: newLanguage }));
      addDebugLog(`Language changed to ${supportedLanguages[newLanguage]}`);
    }
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Real-time Transcription and Translation</h1>
      <div className="mb-4 flex items-center">
        <span className="mr-4">Status: {status}</span>
        {status === 'Disconnected' && (
          <button 
            onClick={handleReconnect} 
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Reconnect
          </button>
        )}
        <select 
          value={selectedLanguage} 
          onChange={handleLanguageChange}
          className="ml-auto px-4 py-2 text-black border rounded"
        >
          {Object.entries(supportedLanguages).map(([code, name]) => (
            <option key={code} value={code}>{name}</option>
          ))}
        </select>
        <select 
          value={selectedDevice} 
          onChange={handleDeviceChange}
          className="ml-4 px-4 py-2 text-black border rounded"
        >
          {audioDevices.map((device) => (
            <option key={device.deviceId} value={device.deviceId}>{device.label || `Microphone ${device.deviceId}`}</option>
          ))}
        </select>
      </div>
      {error && (
        <div className="mb-4 text-red-500">
          Error: {error}
        </div>
      )}
      <div className="flex space-x-4 mb-4">
        <div className="flex-1 border p-4 h-64 overflow-y-auto rounded" ref={originalRef}>
          <h2 className="text-xl font-semibold mb-2 rounded">Original Transcription</h2>
          {transcriptions.length > 0 ? (
            transcriptions.map((t, index) => (
              <div key={index} className="mb-2">
                <p>{t.original || 'N/A'}</p>
              </div>
            ))
          ) : (
            'Waiting for transcription...'
          )}
        </div>
        <div className="flex-1 border p-4 h-64 overflow-y-auto rounded" ref={translatedRef}>
          <h2 className="text-xl font-semibold mb-2 rounded">Translation ({supportedLanguages[selectedLanguage]})</h2>
          {transcriptions.length > 0 ? (
            transcriptions.map((t, index) => (
              <div key={index} className="mb-2">
                <p>{t.translated || 'N/A'}</p>
              </div>
            ))
          ) : (
            'Waiting for translation...'
          )}
        </div>
      </div>
      <div className="border p-4 h-64 overflow-y-auto rounded" ref={debugLogsRef}>
        <h2 className="text-xl font-semibold mb-2 rounded">Debug Logs</h2>
        {debugLogs.map((log, index) => (
          <div key={index} className="text-sm">{log}</div>
        ))}
      </div>
    </div>
  );
};

const App = () => {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<TranscriptionApp />} />
        <Route path="/user" element={<UserTranscriptionView />} />
      </Routes>
    </Router>
  );
};

export default App;