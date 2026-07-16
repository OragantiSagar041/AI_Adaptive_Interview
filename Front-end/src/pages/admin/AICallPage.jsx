import React, { useEffect } from 'react';

export default function AICallPage() {
  useEffect(() => {
    const container = document.getElementById('omni-widget-component');
    
    // Remove existing script if any to force re-execution on mount
    const existingScript = document.getElementById('omnidimension-web-widget');
    if (existingScript) {
      existingScript.remove();
    }
    
    // Clean up container just in case
    if (container) {
      container.innerHTML = '';
    }
    
    const timer = setTimeout(() => {
      const script = document.createElement('script');
      script.id = 'omnidimension-web-widget';
      script.async = true;
      const secretKey = import.meta.env.VITE_OMNIDIM_SECRET_KEY;
      // Append timestamp to force the browser to execute the script again
      script.src = `https://omnidim.io/web_widget.js?secret_key=${secretKey}&t=${Date.now()}`;
      document.body.appendChild(script);
    }, 100);

    return () => {
      clearTimeout(timer);
      const scriptToRemove = document.getElementById('omnidimension-web-widget');
      if (scriptToRemove) {
        scriptToRemove.remove();
      }
      if (container) {
        container.innerHTML = '';
      }
    };
  }, []);

  return (
    <div className="flex flex-col items-center justify-center w-full gap-8 p-6">
      <div className="w-full max-w-4xl space-y-4 text-center">
        <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">AI Calls for Candidates</h1>
        <p className="text-slate-500 text-sm">
          Use the widget below to initiate and manage AI calls to candidates and record data.
        </p>
      </div>
      
      <div 
        id="omni-widget-component" 
        className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden" 
        style={{ width: "70%", height: "500px" }}
      ></div>
    </div>
  );
}
