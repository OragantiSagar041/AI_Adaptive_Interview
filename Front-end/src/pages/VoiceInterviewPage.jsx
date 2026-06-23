import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

export default function VoiceInterviewPage() {
  const { linkId } = useParams();
  const [status, setStatus] = useState('initializing'); // initializing, listening, thinking, speaking
  const [transcript, setTranscript] = useState('');
  const wsRef = useRef(null);
  
  useEffect(() => {
    // Connect to WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/voice/${linkId}`;
    
    // Fallback for dev mode
    const baseUrl = 'ws://localhost:8000';
    const ws = new WebSocket(`${baseUrl}/ws/voice/${linkId}`);
    wsRef.current = ws;

    ws.onopen = async () => {
      setStatus('listening');
      // Setup MediaRecorder
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) {
             // We can send raw bytes via WebSocket
             // But actually, we need to send the blob or ArrayBuffer
             event.data.arrayBuffer().then(buffer => {
               // Send as binary message
               ws.send(buffer);
             });
          }
        };
        // Record and send in 2-second chunks
        mediaRecorder.start(2000);
        
        ws.onclose = () => {
          mediaRecorder.stop();
          stream.getTracks().forEach(track => track.stop());
          setStatus('disconnected');
        };
      } catch (err) {
        console.error("Microphone access denied or error:", err);
        setTranscript("Please allow microphone access to continue.");
      }
    };

    ws.onmessage = async (event) => {
      // Handle binary audio
      if (event.data instanceof Blob) {
        setStatus('speaking');
        // Play audio
        const audioUrl = URL.createObjectURL(event.data);
        const audio = new Audio(audioUrl);
        audio.onended = () => {
           setStatus('listening');
        };
        audio.play();
        return;
      }

      // Handle JSON state updates
      try {
        const data = JSON.parse(event.data);
        if (data.event === 'state') {
          setStatus(data.status);
        } else if (data.event === 'transcript_update') {
          setTranscript(data.text);
        }
      } catch (e) {
        console.error("Failed to parse WS message", e);
      }
    };

    // Note: onclose is already handled inside onopen to clean up streams
    // Fallback if websocket closes before onopen
    const handleClose = () => {
      setStatus('disconnected');
    };
    ws.addEventListener('close', handleClose);

    return () => {
      ws.close();
    };
  }, [linkId]);

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white font-sans p-6">
      <div className="absolute top-6 left-6 text-2xl font-black tracking-tighter flex items-center gap-2">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-lg">
          <i className="fas fa-brain text-sm"></i>
        </div>
        HireIQ <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400 font-medium tracking-normal text-lg ml-1">Voice AI</span>
      </div>

      <div className="flex flex-col items-center gap-12 w-full max-w-3xl">
        
        {/* Avatar Area */}
        <div className="relative flex items-center justify-center h-64 w-64">
          <div className={`absolute inset-0 rounded-full bg-indigo-500/20 blur-3xl transition-all duration-700 ${status === 'speaking' ? 'scale-150 opacity-100' : 'scale-100 opacity-50'}`}></div>
          
          <div className={`z-10 w-48 h-48 rounded-full flex items-center justify-center shadow-2xl transition-all duration-500 ${
            status === 'listening' ? 'bg-emerald-500/10 border-4 border-emerald-500 shadow-emerald-500/20 scale-100' :
            status === 'thinking' ? 'bg-amber-500/10 border-4 border-amber-500 shadow-amber-500/20 animate-pulse' :
            status === 'speaking' ? 'bg-indigo-500/10 border-4 border-indigo-500 shadow-indigo-500/50 scale-110' :
            'bg-slate-800 border-4 border-slate-700'
          }`}>
            <i className={`fas fa-robot text-6xl ${
              status === 'listening' ? 'text-emerald-400' :
              status === 'thinking' ? 'text-amber-400' :
              status === 'speaking' ? 'text-indigo-400' :
              'text-slate-500'
            }`}></i>
          </div>
        </div>

        {/* Status Indicator */}
        <div className="text-center flex flex-col gap-2">
          <div className={`text-sm font-bold uppercase tracking-widest ${
              status === 'listening' ? 'text-emerald-400' :
              status === 'thinking' ? 'text-amber-400' :
              status === 'speaking' ? 'text-indigo-400' :
              'text-slate-500'
            }`}>
            {status === 'initializing' && 'Connecting...'}
            {status === 'listening' && 'Listening...'}
            {status === 'thinking' && 'Thinking...'}
            {status === 'speaking' && 'Speaking...'}
            {status === 'disconnected' && 'Disconnected'}
          </div>
          
          <div className="h-16 flex items-center justify-center text-xl font-medium text-slate-300 max-w-2xl text-center px-4">
            {transcript || (status === 'listening' ? 'Start speaking...' : '')}
          </div>
        </div>

        {/* Controls */}
        <div className="flex gap-4 mt-8">
          <button className="w-16 h-16 rounded-full bg-rose-500/20 text-rose-500 border border-rose-500/50 hover:bg-rose-500 hover:text-white transition-all flex items-center justify-center shadow-lg">
            <i className="fas fa-phone-slash text-xl"></i>
          </button>
        </div>
      </div>
    </div>
  );
}
