import React, { useEffect, useState } from 'react';
import { API_BASE_URL } from '../../apiConfig';

export default function AICallPage() {
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let timer = null;
    let isMounted = true;

    async function loadWidget() {
      try {
        const token = localStorage.getItem('token') || localStorage.getItem('access_token') || '';
        const res = await fetch(`${API_BASE_URL}/api/admin/widget-config`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        });
        const data = await res.json();
        
        if (!isMounted) return;

        if (!data?.configured || !data?.secret_key) {
          setConfigured(false);
          setLoading(false);
          return;
        }

        setConfigured(true);
        setLoading(false);

        const container = document.getElementById('omni-widget-component');
        // Remove existing script if any to force re-execution on mount
        const existingScript = document.getElementById('omnidimension-web-widget');
        if (existingScript) {
          existingScript.remove();
        }
        if (container) {
          container.innerHTML = '';
        }

        timer = setTimeout(() => {
          if (!isMounted) return;
          const script = document.createElement('script');
          script.id = 'omnidimension-web-widget';
          script.async = true;
          script.src = `https://omnidim.io/web_widget.js?secret_key=${encodeURIComponent(data.secret_key)}&t=${Date.now()}`;
          document.body.appendChild(script);
        }, 100);
      } catch (err) {
        console.error('Failed to load widget config:', err);
        if (isMounted) {
          setConfigured(false);
          setLoading(false);
        }
      }
    }

    loadWidget();

    return () => {
      isMounted = false;
      if (timer) clearTimeout(timer);
      const scriptToRemove = document.getElementById('omnidimension-web-widget');
      if (scriptToRemove) {
        scriptToRemove.remove();
      }
      const container = document.getElementById('omni-widget-component');
      if (container) {
        container.innerHTML = '';
      }
    };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center w-full gap-8 p-6">
      <div className="w-full max-w-4xl space-y-4 text-center">
        <h1 className="text-3xl font-extrabold text-slate-800 dark:text-slate-100 tracking-tight">AI Calls for Candidates</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm">
          Use the widget below to initiate and manage AI calls to candidates and record data.
        </p>
      </div>

      {!loading && !configured && (
        <div className="w-full max-w-md p-6 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-center text-amber-300 text-sm">
          Omnidimension AI calling key is not configured on the backend. Please check your backend environment settings.
        </div>
      )}
      
      <div 
        id="omni-widget-component" 
        className="bg-white dark:bg-slate-800/60 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden" 
        style={{ width: "70%", height: "500px" }}
      ></div>
    </div>
  );
}
