import React from 'react'

export const CalComIcon = ({ className = "w-7 h-7" }) => (
  <div className={`${className} rounded-lg bg-black text-white font-black text-[0.62rem] flex items-center justify-center tracking-tighter shrink-0 border border-slate-800 shadow-sm`}>
    cal.com
  </div>
)

export const CalendlyIcon = ({ className = "w-7 h-7" }) => (
  <svg className={`${className} shrink-0`} viewBox="0 0 24 24" fill="none">
    <circle cx="12" cy="12" r="10" fill="#006BFF" />
    <path d="M12 6.5A5.5 5.5 0 1 0 17.5 12" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
)

export const CustomApiIcon = ({ className = "w-7 h-7" }) => (
  <div className={`${className} rounded-lg bg-slate-900 text-white font-mono font-black text-[0.65rem] flex items-center justify-center border border-slate-700 shadow-sm shrink-0`}>
    API
  </div>
)

export const SalesforceIcon = ({ className = "w-7 h-7" }) => (
  <svg className={`${className} shrink-0`} viewBox="0 0 24 24" fill="#00A1E0">
    <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/>
  </svg>
)

export const GoogleCalendarIcon = ({ className = "w-7 h-7" }) => (
  <svg className={`${className} shrink-0`} viewBox="0 0 24 24">
    <rect x="3" y="4" width="18" height="18" rx="3.5" fill="#ffffff" stroke="#4285F4" strokeWidth="2"/>
    <path d="M3 8.5h18" stroke="#4285F4" strokeWidth="2"/>
    <rect x="7" y="2" width="2.2" height="4.5" rx="1" fill="#EA4335"/>
    <rect x="14.8" y="2" width="2.2" height="4.5" rx="1" fill="#EA4335"/>
    <text x="12" y="17.5" textAnchor="middle" fontSize="9.5" fontWeight="900" fill="#4285F4" fontFamily="sans-serif">31</text>
  </svg>
)

export const GoogleSheetsIcon = ({ className = "w-7 h-7" }) => (
  <svg className={`${className} shrink-0`} viewBox="0 0 24 24" fill="none">
    <rect x="3" y="3" width="18" height="18" rx="3.5" fill="#0F9D58"/>
    <rect x="7" y="7" width="10" height="10" rx="1" fill="white"/>
    <path d="M7 11h10M7 14h10M12 7v10" stroke="#0F9D58" strokeWidth="1.6"/>
  </svg>
)

export const SlackIcon = ({ className = "w-7 h-7" }) => (
  <svg className={`${className} shrink-0`} viewBox="0 0 24 24">
    <path fill="#E01E5A" d="M6 15a2 2 0 1 1-2-2h2v2zm1 0a2 2 0 1 1 2 2V15H7z"/>
    <path fill="#36C5F0" d="M9 6a2 2 0 1 1 2-2v2H9zm0 1a2 2 0 1 1-2 2h2V7z"/>
    <path fill="#2EB67D" d="M18 9a2 2 0 1 1 2 2h-2V9zm-1 0a2 2 0 1 1-2-2v2h2z"/>
    <path fill="#ECB22E" d="M15 18a2 2 0 1 1-2 2v-2h2zm0-1a2 2 0 1 1 2-2h-2v2z"/>
  </svg>
)

export const HubSpotIcon = ({ className = "w-7 h-7" }) => (
  <svg className={`${className} shrink-0`} viewBox="0 0 24 24" fill="#FF7A59">
    <circle cx="16.5" cy="7.5" r="3.5" />
    <circle cx="7.5" cy="16.5" r="3.5" />
    <circle cx="12" cy="12" r="2.5" />
    <path d="M9.5 14L7.5 16.5M14.5 10L16.5 7.5" stroke="#FF7A59" strokeWidth="2.5" strokeLinecap="round"/>
  </svg>
)

export const GenesysIcon = ({ className = "w-7 h-7" }) => (
  <svg className={`${className} shrink-0`} viewBox="0 0 24 24" fill="#FF4F00">
    <circle cx="7.5" cy="12" r="4.5"/>
    <circle cx="16.5" cy="12" r="3.2"/>
  </svg>
)

export const WhatsAppIcon = ({ className = "w-7 h-7" }) => (
  <svg className={`${className} shrink-0`} viewBox="0 0 24 24" fill="#25D366">
    <path d="M12.012 2C6.48 2 2 6.48 2 12.012c0 1.956.564 3.78 1.536 5.328L2 22l4.824-1.5a10.007 10.007 0 0 0 5.188 1.488C17.532 21.988 22 17.508 22 11.988 22 6.468 17.532 2 12.012 2zm5.7 13.884c-.24.672-1.404 1.284-1.932 1.344-.516.06-1.188.084-3.444-.828-2.892-1.176-4.752-4.116-4.9-4.308-.144-.192-1.188-1.584-1.188-3.024 0-1.44.756-2.148 1.02-2.436.264-.288.576-.36.768-.36.192 0 .384 0 .552.012.18.012.42-.072.66.504.24.576.816 1.992.888 2.136.072.144.12.312.024.504-.096.192-.144.312-.288.48-.144.168-.3.372-.432.504-.144.144-.288.3-.12.588.168.288.744 1.224 1.596 1.98 1.104.972 2.028 1.272 2.316 1.416.288.144.456.12.624-.072.168-.192.72-.84.912-1.128.192-.288.384-.24.648-.144.264.096 1.68.792 1.968.936.288.144.48.216.552.336.072.12.072.696-.168 1.368z"/>
  </svg>
)
