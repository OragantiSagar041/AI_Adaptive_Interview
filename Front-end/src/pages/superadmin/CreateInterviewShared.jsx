import React from 'react'

export const CustomToggleSwitch = ({ checked, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    onClick={(e) => {
      e.preventDefault();
      e.stopPropagation();
      onChange(!checked);
    }}
    style={{
      width: '42px',
      height: '22px',
      backgroundColor: checked ? '#4f46e5' : '#cbd5e1',
      border: checked ? '1.5px solid #6366f1' : '1.5px solid #94a3b8',
      boxShadow: checked ? '0 0 8px rgba(79, 70, 229, 0.4)' : 'none',
      display: 'inline-flex',
      alignItems: 'center',
      padding: '2px',
      borderRadius: '9999px',
      cursor: 'pointer',
      position: 'relative',
      transition: 'all 0.25s ease',
      flexShrink: 0,
    }}
  >
    <div
      style={{
        width: '14px',
        height: '14px',
        backgroundColor: '#ffffff',
        borderRadius: '9999px',
        transform: checked ? 'translateX(20px)' : 'translateX(0px)',
        transition: 'transform 0.25s ease, background-color 0.25s ease',
        boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: '4px',
          height: '4px',
          backgroundColor: checked ? '#4f46e5' : '#94a3b8',
          borderRadius: '9999px',
        }}
      />
    </div>
  </button>
);

export const FeatureLockOverlay = ({ isLocked, featureName, children }) => {
  if (!isLocked) return children;
  return (
    <div className="relative overflow-hidden rounded-xl h-full w-full">
      <div className="filter blur-[6px] opacity-40 pointer-events-none select-none transition-all duration-300 h-full w-full">
         {children}
      </div>
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/30 dark:bg-slate-900/40 backdrop-blur-[1px] z-10 p-4 text-center">
         <div className="bg-indigo-100 text-indigo-600 w-12 h-12 flex items-center justify-center rounded-full mb-3 shadow-sm border border-indigo-200">
            <i className="fas fa-lock text-xl"></i>
         </div>
         <h3 className="text-[15px] font-extrabold text-slate-800 dark:text-white mb-1">This feature is locked</h3>
         <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-4 max-w-[200px] leading-relaxed">Upgrade your plan to access {featureName}</p>
         <button 
             type="button"
             className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border-2 border-indigo-100 dark:border-indigo-800/60 text-indigo-600 dark:text-indigo-400 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition-colors font-bold text-xs shadow-sm cursor-pointer"
             onClick={(e) => {
               e.preventDefault();
               e.stopPropagation();
               window.location.href = '/superadmin/subscription';
             }}
           >
            <i className="fas fa-crown text-[#f59e0b]"></i> Upgrade Plan
         </button>
      </div>
    </div>
  );
};
