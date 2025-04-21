import React, { useState, useEffect, useRef } from 'react';

const UserTranscriptionView = () => {
    const [transcriptions, setTranscriptions] = useState([]);
    const [status, setStatus] = useState('Disconnected');
    const [error, setError] = useState(null);
    const [selectedLanguage, setSelectedLanguage] = useState('ja');
    const wsRef = useRef(null);
    const originalRef = useRef(null);
    const translatedRef = useRef(null);

    const supportedLanguages = {
        'ja': '日本語',
        'ko': 'Korean',
        'ZH-HANT': 'Chinese (Traditional)',
        'es': 'Spanish'
    };

    useEffect(() => {
        connectWebSocket();

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

    const connectWebSocket = () => {
        wsRef.current = new WebSocket('ws://localhost:3001');

        wsRef.current.onopen = () => {
            setStatus('Connected');
            setError(null);
            // Set language preference on connection
            wsRef.current.send(JSON.stringify({ type: 'setLanguage', language: selectedLanguage }));
        };

        wsRef.current.onerror = (error) => {
            console.error('WebSocket error:', error);
            setError('Failed to connect to server');
        };

        wsRef.current.onclose = () => {
            setStatus('Disconnected');
        };

        wsRef.current.onmessage = (event) => {
            const message = JSON.parse(event.data);
            if (message.type === 'transcript') {
                setTranscriptions(prev => [...prev, message.data]);
            }
        };
    };

    const handleLanguageChange = (e) => {
        const newLanguage = e.target.value;
        setSelectedLanguage(newLanguage);
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'setLanguage', language: newLanguage }));
        }
    };

    return (
        <div className="p-4">
            <h1 className="text-2xl font-bold mb-4">Live Transcription View</h1>
            <div className="mb-4 flex items-center">
                <span className="mr-4">Status: {status}</span>
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
            {error && (
                <div className="mb-4 text-red-500">
                    Error: {error}
                </div>
            )}
            <div className="flex space-x-4 mb-4">
                <div className="flex-1 border p-4 h-64 overflow-y-auto rounded" ref={originalRef}>
                    <h2 className="text-l font-semibold mb-2 rounded">Original Transcription</h2>
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
                    <h2 className="text-l font-semibold mb-2 rounded">Translation ({supportedLanguages[selectedLanguage]})</h2>
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
        </div>
    );
};

export default UserTranscriptionView;