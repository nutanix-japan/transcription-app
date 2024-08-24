import React, { useState, useEffect, useRef } from 'react';

const TranscriptionApp = () => {
  const [transcription, setTranscription] = useState('');
  const [status, setStatus] = useState('Disconnected');
  const [error, setError] = useState('');
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [debugLogs, setDebugLogs] = useState([]);
  const [micAccess, setMicAccess] = useState('unchecked');
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  const addDebugLog = (message) => {
    setDebugLogs(prev => [...prev, `${new Date().toISOString()}: ${message}`]);
  };

  const checkMicrophoneAccess = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      setMicAccess('granted');
      addDebugLog('Microphone access granted');
    } catch (err) {
      setMicAccess('denied');
      setError('Microphone access denied. Please grant microphone permissions and refresh the page.');
      addDebugLog(`Microphone access error: ${err.message}`);
    }
  };

  const connectWebSocket = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      addDebugLog('WebSocket is already connected');
      return;
    }

    addDebugLog('Attempting to connect WebSocket');
    wsRef.current = new WebSocket('ws://localhost:3001');

    wsRef.current.onopen = () => {
      addDebugLog('WebSocket connection established');
      setStatus('Connecting to Deepgram...');
      setError('');
      setIsReconnecting(false);
    };

    wsRef.current.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === 'transcript') {
        setTranscription(prev => prev + ' ' + message.data);
        addDebugLog(`Received transcript: ${message.data}`);
      } else if (message.type === 'error') {
        setError(message.data);
        addDebugLog(`Error received: ${message.data}`);
      } else if (message.type === 'status') {
        setStatus(message.data);
        addDebugLog(`Status update: ${message.data}`);
      } else if (message.type === 'debug') {
        addDebugLog(`Server debug: ${message.data}`);
      }
    };

    wsRef.current.onclose = (event) => {
      addDebugLog(`WebSocket connection closed. Code: ${event.code}, Reason: ${event.reason || 'No reason provided'}, Clean: ${event.wasClean}`);
      setStatus('Disconnected');
      setError(`Connection closed. Code: ${event.code}, Reason: ${event.reason || 'No reason provided'}`);
      
      if (!isReconnecting) {
        setIsReconnecting(true);
        addDebugLog('Scheduling reconnection attempt in 5 seconds');
        reconnectTimeoutRef.current = setTimeout(() => {
          addDebugLog('Attempting to reconnect...');
          connectWebSocket();
        }, 5000);
      }
    };

    wsRef.current.onerror = (error) => {
      addDebugLog(`WebSocket error occurred: ${error.message}`);
      setError('WebSocket error occurred. Check debug logs for details.');
    };
  };

  useEffect(() => {
    checkMicrophoneAccess();
    connectWebSocket();

    return () => {
      if (wsRef.current) {
        addDebugLog('Closing WebSocket due to component unmount');
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        addDebugLog('Clearing reconnection timeout due to component unmount');
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  const handleReconnect = () => {
    addDebugLog('Manual reconnection initiated');
    if (wsRef.current) {
      wsRef.current.close();
    }
    setIsReconnecting(true);
    connectWebSocket();
  };

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Real-time Transcription</h1>
      <div className="mb-4">
        Status: {status}
        {status === 'Disconnected' && (
          <button 
            onClick={handleReconnect} 
            className="ml-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Reconnect
          </button>
        )}
      </div>
      <div className="mb-4">
        Microphone Access: {micAccess}
        {micAccess === 'denied' && (
          <button 
            onClick={checkMicrophoneAccess} 
            className="ml-4 px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
          >
            Request Microphone Access
          </button>
        )}
      </div>
      {error && (
        <div className="mb-4 text-red-500">
          Error: {error}
        </div>
      )}
      <div className="border p-4 h-64 overflow-y-auto mb-4">
        {transcription || 'Waiting for transcription...'}
      </div>
      <div className="border p-4 h-64 overflow-y-auto">
        <h2 className="text-xl font-semibold mb-2">Debug Logs</h2>
        {debugLogs.map((log, index) => (
          <div key={index} className="text-sm">{log}</div>
        ))}
      </div>
    </div>
  );
};

export default TranscriptionApp;