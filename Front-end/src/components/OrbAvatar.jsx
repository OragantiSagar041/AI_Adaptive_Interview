import React from 'react';

export default function OrbAvatar({ status = 'idle', className = '' }) {
  // status: 'idle' | 'listening' | 'speaking' | 'thinking'
  return (
    <div className={`premium-orb-wrapper ${status} ${className}`}>
      <style>{`
        .premium-orb-wrapper {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          height: 100%;
          border-radius: 50%;
          transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
        }

        /* Core Glowing Orb */
        .orb-core {
          position: relative;
          z-index: 10;
          width: 100%;
          height: 100%;
          border-radius: 50%;
          background: radial-gradient(circle at 35% 35%, rgba(255,255,255,0.9), rgba(99, 102, 241, 0.8) 30%, rgba(76, 29, 149, 0.95) 75%, rgba(15, 23, 42, 1) 100%);
          box-shadow: 
            inset -10px -10px 25px rgba(0,0,0,0.6), 
            inset 10px 10px 20px rgba(255,255,255,0.4),
            0 0 20px rgba(139, 92, 246, 0.5);
          backdrop-filter: blur(12px);
          overflow: hidden;
          transition: all 0.5s ease-in-out;
        }
        
        /* Glassmorphism Highlight */
        .orb-core::after {
          content: '';
          position: absolute;
          top: 15%;
          left: 20%;
          width: 35%;
          height: 35%;
          background: linear-gradient(135deg, rgba(255, 255, 255, 0.8) 0%, rgba(255, 255, 255, 0) 100%);
          border-radius: 50%;
          filter: blur(2px);
          transform: rotate(-45deg);
        }

        /* Status: Speaking */
        .premium-orb-wrapper.speaking .orb-core {
          background: radial-gradient(circle at 35% 35%, rgba(255,255,255,1), rgba(168, 85, 247, 0.9) 30%, rgba(67, 56, 202, 0.95) 75%, rgba(15, 23, 42, 1) 100%);
          box-shadow: 
            inset -10px -10px 25px rgba(0,0,0,0.6), 
            inset 10px 10px 20px rgba(255,255,255,0.4),
            0 0 40px rgba(168, 85, 247, 0.8), 
            0 0 80px rgba(168, 85, 247, 0.4);
          animation: orb-breathe-speak 1.5s ease-in-out infinite, orb-rotate 8s linear infinite;
        }

        /* Status: Listening */
        .premium-orb-wrapper.listening .orb-core {
          background: radial-gradient(circle at 35% 35%, rgba(255,255,255,0.9), rgba(16, 185, 129, 0.8) 30%, rgba(6, 78, 59, 0.95) 75%, rgba(15, 23, 42, 1) 100%);
          box-shadow: 
            inset -10px -10px 25px rgba(0,0,0,0.6), 
            inset 10px 10px 20px rgba(255,255,255,0.4),
            0 0 35px rgba(16, 185, 129, 0.6);
          animation: orb-breathe-listen 2.5s ease-in-out infinite;
        }

        /* Status: Thinking */
        .premium-orb-wrapper.thinking .orb-core {
          background: radial-gradient(circle at 35% 35%, rgba(255,255,255,0.9), rgba(245, 158, 11, 0.8) 30%, rgba(120, 53, 15, 0.95) 75%, rgba(15, 23, 42, 1) 100%);
          box-shadow: 
            inset -10px -10px 25px rgba(0,0,0,0.6), 
            inset 10px 10px 20px rgba(255,255,255,0.4),
            0 0 30px rgba(245, 158, 11, 0.5);
          animation: orb-pulse-think 1.5s ease-in-out infinite alternate;
        }

        /* Expanding/Collapsing Rings */
        .orb-ring {
          position: absolute;
          border-radius: 50%;
          border: 1px solid rgba(139, 92, 246, 0.3);
          pointer-events: none;
          top: 0; left: 0; bottom: 0; right: 0;
          margin: auto;
          transition: all 0.5s ease;
        }

        /* Speaking Rings - Expanding waves */
        .speaking .orb-ring:nth-child(1) { animation: ring-expand 1.5s cubic-bezier(0.25, 1, 0.5, 1) infinite; border-color: rgba(168, 85, 247, 0.6); border-width: 2px; }
        .speaking .orb-ring:nth-child(2) { animation: ring-expand 1.5s cubic-bezier(0.25, 1, 0.5, 1) infinite 0.5s; border-color: rgba(139, 92, 246, 0.4); border-width: 2px; }
        .speaking .orb-ring:nth-child(3) { animation: ring-expand 1.5s cubic-bezier(0.25, 1, 0.5, 1) infinite 1.0s; border-color: rgba(99, 102, 241, 0.2); }

        /* Listening Rings - Rotating and dashed */
        .listening .orb-ring:nth-child(1) { animation: ring-spin 5s linear infinite; border: 2px dashed rgba(16, 185, 129, 0.4); width: 120%; height: 120%; }
        .listening .orb-ring:nth-child(2) { animation: ring-spin-reverse 7s linear infinite; border: 1px dashed rgba(16, 185, 129, 0.2); width: 140%; height: 140%; }
        .listening .orb-ring:nth-child(3) { opacity: 0; }

        /* Thinking Rings - Pulsing */
        .thinking .orb-ring { border-color: rgba(245, 158, 11, 0.3); animation: ring-pulse 2s infinite; width: 110%; height: 110%; }
        .thinking .orb-ring:nth-child(2) { width: 125%; height: 125%; animation-delay: 0.5s; }
        .thinking .orb-ring:nth-child(3) { width: 140%; height: 140%; animation-delay: 1s; }

        /* Sound Wave Particles (Neon streaks) */
        .orb-particle {
          position: absolute;
          background: rgba(255, 255, 255, 0.9);
          border-radius: 50%;
          opacity: 0;
          box-shadow: 0 0 10px rgba(255,255,255,0.8);
          top: 50%; left: 50%;
        }

        .speaking .orb-particle:nth-child(4) { animation: particle-shoot 1.2s cubic-bezier(0.4, 0, 0.2, 1) infinite 0.1s; }
        .speaking .orb-particle:nth-child(5) { animation: particle-shoot 1.2s cubic-bezier(0.4, 0, 0.2, 1) infinite 0.3s; transform-origin: 0 0; transform: rotate(72deg); }
        .speaking .orb-particle:nth-child(6) { animation: particle-shoot 1.2s cubic-bezier(0.4, 0, 0.2, 1) infinite 0.5s; transform-origin: 0 0; transform: rotate(144deg); }
        .speaking .orb-particle:nth-child(7) { animation: particle-shoot 1.2s cubic-bezier(0.4, 0, 0.2, 1) infinite 0.7s; transform-origin: 0 0; transform: rotate(216deg); }
        .speaking .orb-particle:nth-child(8) { animation: particle-shoot 1.2s cubic-bezier(0.4, 0, 0.2, 1) infinite 0.9s; transform-origin: 0 0; transform: rotate(288deg); }

        /* Inner Flowing Energy (Visible when speaking) */
        .inner-energy {
          position: absolute;
          width: 200%; height: 200%;
          background: conic-gradient(from 0deg, transparent 0%, rgba(255,255,255,0.1) 20%, transparent 40%);
          animation: spin-energy 3s linear infinite;
          opacity: 0;
          transition: opacity 0.5s;
        }
        .speaking .inner-energy {
          opacity: 1;
        }

        /* Animations Definitions */
        @keyframes orb-breathe-speak {
          0%, 100% { transform: scale(1); filter: brightness(1); }
          50% { transform: scale(1.08); filter: brightness(1.2); }
        }
        @keyframes orb-breathe-listen {
          0%, 100% { transform: scale(1); filter: brightness(1); }
          50% { transform: scale(1.03); filter: brightness(1.1); }
        }
        @keyframes orb-pulse-think {
          0% { transform: scale(0.97); filter: brightness(0.9); }
          100% { transform: scale(1.03); filter: brightness(1.1); }
        }
        @keyframes orb-rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes ring-expand {
          0% { width: 100%; height: 100%; opacity: 1; }
          100% { width: 220%; height: 220%; opacity: 0; }
        }
        @keyframes ring-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes ring-spin-reverse {
          from { transform: rotate(360deg); }
          to { transform: rotate(0deg); }
        }
        @keyframes ring-pulse {
          0%, 100% { opacity: 0.2; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.05); }
        }
        @keyframes particle-shoot {
          0% { opacity: 1; transform: translate(-50%, -50%) scale(1) translateY(-40px); }
          100% { opacity: 0; transform: translate(-50%, -50%) scale(0) translateY(-120px); }
        }
        @keyframes spin-energy {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

      `}</style>
      
      {/* Concentric Rings */}
      <div className="orb-ring"></div>
      <div className="orb-ring"></div>
      <div className="orb-ring"></div>
      
      {/* Emitting Particles */}
      <div className="orb-particle" style={{ width: '4px', height: '12px', borderRadius: '4px' }}></div>
      <div className="orb-particle" style={{ width: '3px', height: '10px', borderRadius: '3px' }}></div>
      <div className="orb-particle" style={{ width: '5px', height: '15px', borderRadius: '5px' }}></div>
      <div className="orb-particle" style={{ width: '4px', height: '12px', borderRadius: '4px' }}></div>
      <div className="orb-particle" style={{ width: '3px', height: '9px', borderRadius: '3px' }}></div>

      {/* Central Glowing Orb */}
      <div className="orb-core flex items-center justify-center">
        <div className="inner-energy"></div>
        {/* Optional small inner label or icon could go here if needed, but it's cleaner without */}
      </div>
    </div>
  );
}
