import React, { useState, useEffect } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useDispatch } from 'react-redux'
import { setCredentials } from '../store/slices/authSlice'
import { API_BASE_URL } from '../apiConfig'
import logo from '../assets/logo.png'
import loginHero from '../assets/login_hero.png'
import Swal from 'sweetalert2'
import 'sweetalert2/dist/sweetalert2.min.css'
import axios from 'axios'

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
  *, *::before, *::after { box-sizing: border-box; }

  .lp-root {
    min-height: 100vh; width: 100%;
    background: #080c14;
    background-image:
      radial-gradient(circle at 1px 1px, rgba(255,255,255,0.022) 1px, transparent 0);
    background-size: 36px 36px;
    overflow: hidden; position: relative;
    display: flex; flex-direction: column;
    font-family: 'Inter', -apple-system, sans-serif;
  }

  /* ── Waves: ambient background layer elevated up the page ── */
  .lp-waves-bg {
    position: absolute; bottom: 0; left: 0; right: 0;
    height: 55vh; pointer-events: none; z-index: 1; overflow: hidden;
  }
  .lp-wave {
    position: absolute; bottom: 0; left: 0; width: 220%; line-height: 0;
  }
  .lp-wave svg { display: block; width: 100%; }
  .lp-w1 { animation: wS1 18s linear infinite; opacity: 0.55; }
  .lp-w2 { animation: wS2 24s linear infinite; opacity: 0.38; }
  .lp-w3 { animation: wS3 30s linear infinite; opacity: 0.22; }
  @keyframes wS1 { from { transform: translateX(0); } to { transform: translateX(-50%); } }
  @keyframes wS2 { from { transform: translateX(-50%); } to { transform: translateX(0); } }
  @keyframes wS3 { from { transform: translateX(0); } to { transform: translateX(-50%); } }

  /* ── Page layout ── */
  .lp-content {
    position: relative; z-index: 10; flex: 1;
    display: flex; align-items: center; justify-content: center;
    padding: 48px 24px 80px;
  }
  .lp-grid {
    width: 100%; max-width: 1080px;
    display: grid; grid-template-columns: 1fr 1fr;
    gap: 72px; align-items: center;
  }

  /* ── Left panel ── */
  .lp-left { animation: fadeUp 0.65s cubic-bezier(0.16,1,0.3,1) both; }
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(24px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .lp-brand { margin-bottom: 36px; }
  .lp-headline {
    font-size: clamp(2rem, 3.5vw, 2.65rem); font-weight: 800; color: #ffffff;
    line-height: 1.12; letter-spacing: -0.035em; margin: 0 0 12px;
  }
  .lp-sub {
    font-size: 0.95rem; color: rgba(203,213,225,0.58);
    line-height: 1.65; margin: 0; font-weight: 400;
  }

  /* ── Card ── */
  .lp-card {
    width: 100%;
    max-width: 420px;
    background: linear-gradient(145deg, rgba(22, 22, 32, 0.45) 0%, rgba(10, 10, 15, 0.6) 100%);
    border: 1px solid rgba(255, 255, 255, 0.06);
    border-top: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 20px; 
    padding: 48px;
    backdrop-filter: blur(40px); 
    -webkit-backdrop-filter: blur(40px);
    box-shadow:
      0 4px 6px -1px rgba(0, 0, 0, 0.1),
      0 24px 48px -12px rgba(0, 0, 0, 0.6),
      inset 0 1px 0 rgba(255, 255, 255, 0.05);
    position: relative;
    overflow: hidden;
  }
  
  .lp-card::before {
    content: '';
    position: absolute;
    top: 0; left: -100%; right: 0; bottom: 0;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.03), transparent);
    animation: shine 8s infinite linear;
    pointer-events: none;
  }
  
  @keyframes shine {
    0% { left: -100%; }
    20% { left: 100%; }
    100% { left: 100%; }
  }
  .lp-form { display: flex; flex-direction: column; gap: 20px; }
  .lp-field { display: flex; flex-direction: column; gap: 7px; }
  .lp-label {
    font-size: 0.72rem; font-weight: 700;
    color: rgba(148,163,184,0.75);
    text-transform: uppercase; letter-spacing: 0.09em;
  }
  .lp-input-wrap { position: relative; }
  .lp-input-icon {
    position: absolute; left: 15px; top: 50%; transform: translateY(-50%);
    color: #a78bfa; font-size: 0.88rem; pointer-events: none; line-height: 1;
    z-index: 1;
  }
  .lp-input {
    width: 100%;
    padding: 14px 18px 14px 44px;
    font-size: 0.92rem; font-family: inherit; color: #f1f5f9;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.14);
    border-radius: 12px; outline: none;
    transition: border-color 0.22s ease, background 0.22s ease, box-shadow 0.22s ease;
    box-shadow: 0 2px 8px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.06);
  }
  .lp-input::placeholder { color: rgba(148,163,184,0.5); font-size: 0.88rem; }
  .lp-input:hover {
    border-color: rgba(167,139,250,0.35);
    background: rgba(255,255,255,0.07);
  }
  .lp-input:focus {
    border-color: #7c3aed;
    background: rgba(124,58,237,0.08);
    box-shadow: 0 0 0 3px rgba(124,58,237,0.22), 0 2px 12px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08);
  }
  .lp-input-pr { padding-right: 48px; }
  input:-webkit-autofill, input:-webkit-autofill:focus {
    -webkit-box-shadow: 0 0 0 1000px #0f0c1e inset !important;
    -webkit-text-fill-color: #f1f5f9 !important;
    caret-color: #f1f5f9 !important;
  }
  .lp-eye {
    position: absolute; right: 14px; top: 50%; transform: translateY(-50%);
    background: none; border: none; color: rgba(167,139,250,0.6);
    cursor: pointer; display: flex; align-items: center; padding: 4px;
    transition: color 0.2s;
  }
  .lp-eye:hover { color: #a78bfa; }
  .lp-forgot-row { display: flex; justify-content: flex-end; margin-top: -4px; }
  .lp-forgot {
    background: none; border: none; font-family: inherit;
    font-size: 0.82rem; font-weight: 600; color: #a78bfa; cursor: pointer; padding: 0;
    transition: color 0.2s ease, text-shadow 0.2s ease;
  }
  .lp-forgot:hover { color: #c4b5fd; text-shadow: 0 0 10px rgba(196,181,253,0.45); }
  .lp-error {
    display: flex; align-items: center; gap: 8px;
    background: rgba(239,68,68,0.09); border: 1px solid rgba(239,68,68,0.22);
    color: #fca5a5; font-size: 0.82rem; border-radius: 12px; padding: 12px 14px;
  }
  .lp-error i { color: #f87171; flex-shrink: 0; }

  /* ── Submit button ── */
  .lp-btn {
    width: 100%; padding: 14px 24px; border-radius: 14px; border: none;
    font-family: inherit; font-size: 0.95rem; font-weight: 700; color: #ffffff; cursor: pointer;
    background: linear-gradient(135deg, #6d28d9 0%, #8b5cf6 50%, #a855f7 100%);
    box-shadow: 0 4px 24px rgba(109,40,217,0.38), inset 0 1px 0 rgba(255,255,255,0.18);
    display: flex; align-items: center; justify-content: center; gap: 8px;
    transition: transform 0.18s ease, box-shadow 0.18s ease, opacity 0.18s ease;
    letter-spacing: 0.01em;
  }
  .lp-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 12px 36px rgba(109,40,217,0.55), inset 0 1px 0 rgba(255,255,255,0.22);
  }
  .lp-btn:active:not(:disabled) { transform: translateY(0) scale(0.98); }
  .lp-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .lp-spinner { animation: spin 0.9s linear infinite; width: 16px; height: 16px; }

  /* ── Trust badge ── */
  .lp-trust {
    margin-top: 24px; display: inline-flex; align-items: center; gap: 10px;
    background: rgba(255,255,255,0.025); border: 1px solid rgba(255,255,255,0.06);
    border-radius: 100px; padding: 7px 16px 7px 12px;
  }
  .lp-stars { display: flex; gap: 2px; }
  .lp-trust-text { font-size: 0.78rem; color: rgba(203,213,225,0.55); font-weight: 500; }
  .lp-trust-text strong { color: rgba(203,213,225,0.85); font-weight: 700; }

  /* ── Right panel ── */
  .lp-right {
    display: flex; align-items: center; justify-content: center; position: relative;
    animation: fadeUp 0.8s 0.1s cubic-bezier(0.16,1,0.3,1) both;
  }
  @keyframes heroFloat {
    0%, 100% { transform: translateY(0px); }
    50%       { transform: translateY(-14px); }
  }
  .lp-hero-img {
    width: 100%; max-width: 460px; object-fit: contain; border-radius: 20px;
    position: relative; z-index: 2;
    filter: drop-shadow(0 0 60px rgba(139,92,246,0.35));
    animation: heroFloat 7s ease-in-out infinite;
  }
  .lp-hero-glow {
    position: absolute; width: 380px; height: 380px; border-radius: 50%;
    background: radial-gradient(circle, rgba(139,92,246,0.2) 0%, transparent 70%);
    pointer-events: none; z-index: 1;
  }
  .lp-chip {
    position: absolute; display: flex; align-items: center; gap: 9px;
    background: rgba(10,8,20,0.72); border: 1px solid rgba(167,139,250,0.22);
    border-radius: 14px; padding: 10px 14px;
    backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px);
    box-shadow: 0 12px 32px rgba(0,0,0,0.4); z-index: 3;
  }
  .lp-chip-dot {
    width: 8px; height: 8px; border-radius: 50%; background: #a78bfa; flex-shrink: 0;
    box-shadow: 0 0 10px #a78bfa, 0 0 20px rgba(167,139,250,0.4);
  }
  .lp-chip span { font-size: 0.78rem; font-weight: 600; color: #e2e8f0; white-space: nowrap; }

  /* ── Footer ── */
  .lp-footer {
    position: relative; z-index: 10; height: 48px;
    background: rgba(4,4,10,0.7); border-top: 1px solid rgba(255,255,255,0.04);
    backdrop-filter: blur(16px); display: flex; align-items: center; justify-content: center;
  }
  .lp-footer span { font-size: 0.72rem; color: rgba(203,213,225,0.3); letter-spacing: 0.04em; }

  /* ── Modal ── */
  .lp-modal-backdrop {
    position: fixed; inset: 0; z-index: 999;
    display: flex; align-items: center; justify-content: center;
    background: rgba(0,0,0,0.72); backdrop-filter: blur(10px);
    padding: 16px; animation: fadeIn 0.2s ease;
  }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  .lp-modal {
    position: relative; width: 100%; max-width: 410px;
    background: rgba(9,9,18,0.9); border: 1px solid rgba(139,92,246,0.26);
    border-radius: 24px; padding: 36px;
    box-shadow: 0 40px 100px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.04) inset;
    backdrop-filter: blur(24px); -webkit-backdrop-filter: blur(24px);
    animation: slideUp 0.25s cubic-bezier(0.16,1,0.3,1);
  }
  @keyframes slideUp {
    from { opacity: 0; transform: translateY(20px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
  .lp-modal-close {
    position: absolute; right: 14px; top: 14px; width: 34px; height: 34px;
    display: flex; align-items: center; justify-content: center;
    background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.09);
    border-radius: 10px; color: rgba(203,213,225,0.7); cursor: pointer; font-size: 13px;
    transition: all 0.2s ease;
  }
  .lp-modal-close:hover { background: rgba(255,255,255,0.1); color: #fff; transform: rotate(90deg); }
  .lp-modal-title { font-size: 1.2rem; font-weight: 700; color: #e2e8f0; margin: 0 0 6px; }
  .lp-modal-sub { font-size: 0.82rem; color: rgba(148,163,184,0.6); margin: 0 0 24px; line-height: 1.55; }
  .lp-mfield { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
  .lp-mlabel { font-size: 0.7rem; font-weight: 700; color: rgba(148,163,184,0.6); text-transform: uppercase; letter-spacing: 0.09em; }
  .lp-minput {
    width: 100%; padding: 12px 15px; font-size: 0.88rem; font-family: inherit; color: #f1f5f9;
    background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.09);
    border-radius: 12px; outline: none;
    transition: border-color 0.22s, box-shadow 0.22s, background 0.22s;
  }
  .lp-minput::placeholder { color: rgba(148,163,184,0.35); }
  .lp-minput:focus {
    border-color: rgba(167,139,250,0.55);
    background: rgba(139,92,246,0.05);
    box-shadow: 0 0 0 3px rgba(167,139,250,0.14);
  }
  .lp-otp-input { text-align: center; font-size: 1.6rem; font-weight: 700; letter-spacing: 0.35em; padding: 14px 16px; }
  .lp-modal-btn {
    width: 100%; padding: 13px 20px; border-radius: 13px; border: none;
    font-family: inherit; font-size: 0.9rem; font-weight: 700; color: #fff; cursor: pointer;
    background: linear-gradient(135deg, #6d28d9 0%, #8b5cf6 50%, #a855f7 100%);
    box-shadow: 0 4px 20px rgba(109,40,217,0.35), inset 0 1px 0 rgba(255,255,255,0.18);
    transition: transform 0.18s ease, box-shadow 0.18s ease;
    margin-top: 6px; display: flex; align-items: center; justify-content: center; gap: 8px;
  }
  .lp-modal-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 8px 30px rgba(109,40,217,0.5), inset 0 1px 0 rgba(255,255,255,0.22);
  }
  .lp-modal-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .lp-resend { text-align: center; margin-top: 14px; font-size: 0.8rem; color: rgba(148,163,184,0.5); }
  .lp-resend button {
    background: none; border: none; color: #a78bfa; font-weight: 600;
    font-family: inherit; cursor: pointer; padding: 0; margin-left: 4px; transition: color 0.2s;
  }
  .lp-resend button:hover { color: #c4b5fd; }
  .lp-modal-error {
    display: flex; align-items: center; gap: 8px; margin-top: 14px;
    background: rgba(239,68,68,0.09); border: 1px solid rgba(239,68,68,0.22);
    color: #fca5a5; font-size: 0.8rem; border-radius: 11px; padding: 11px 13px;
  }
  .lp-modal-error i { color: #f87171; flex-shrink: 0; }

  @media (max-width: 768px) {
    .lp-grid { grid-template-columns: 1fr !important; gap: 28px !important; }
    .lp-right { display: none !important; }
    .lp-content { padding: 32px 16px 70px; }
    .lp-card { padding: 28px 24px; }
  }
`

// Wave paths — higher amplitude, starts higher up the page
const W1 = 'M0,40 C200,120 400,-20 600,60 C800,140 1000,0 1200,80 C1300,115 1370,60 1440,80 L1440,160 L0,160 Z'
const W2 = 'M0,80 C150,20 350,140 550,70 C750,0 950,120 1150,60 C1280,30 1380,90 1440,70 L1440,160 L0,160 Z'
const W3 = 'M0,100 C180,50 380,150 580,90 C780,30 980,130 1180,75 C1310,45 1390,100 1440,90 L1440,160 L0,160 Z'

export default function LoginPage() {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState('')
  const [isResetOpen, setIsResetOpen] = useState(false)
  const [resetStep, setResetStep] = useState('identify')
  const [resetUser, setResetUser] = useState('')
  const [resetEmail, setResetEmail] = useState('')
  const [resetOTP, setResetOTP] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [resetLoading, setResetLoading] = useState(false)
  const [resetError, setResetError] = useState('')

  useEffect(() => { document.documentElement.setAttribute('data-theme', 'dark') }, [])

  const handleLogin = async (e) => {
    e.preventDefault()
    if (!username || !password) { setLoginError('Please enter both username and password.'); return }
    setLoginLoading(true); setLoginError('')
    try {
      const response = await axios.post(API_BASE_URL + '/admin/login', { username, password }, { timeout: 10000 })
      const data = response.data
      if (data.status === 'expired' || data.status === 'blocked') { setLoginError(data.message || 'Subscription expired.'); setLoginLoading(false); return }
      const adminId = data.admin_id || data.master_id
      const adminEmail = data.email || ''
      const adminName = data.username || username
      const role = data.role || 'tenant'
      const plan = data.subscription_plan || 'Free Trial'
      const planKey = data.subscription_plan_key || 'trial'
      const planCapabilities = data.plan_capabilities || {}
      let finalRole = role
      if (role === 'super_admin' || role === 'superadmin') finalRole = 'superadmin'
      if (role === 'tenant' || role === 'admin') finalRole = 'admin'
      if (data.token) {
        sessionStorage.setItem('adminToken', data.token)
        dispatch(setCredentials({ role: finalRole, token: data.token, adminUser: data }))
      }
      sessionStorage.setItem('adminId', adminId); sessionStorage.setItem('adminEmail', adminEmail)
      sessionStorage.setItem('adminName', adminName); sessionStorage.setItem('adminRole', finalRole)
      sessionStorage.setItem('adminUser', JSON.stringify(data)); sessionStorage.setItem('subscriptionPlan', plan)
      sessionStorage.setItem('subscriptionPlanKey', planKey); sessionStorage.setItem('planCapabilities', JSON.stringify(planCapabilities))
      sessionStorage.setItem('subscriptionExpiry', data.subscription_expiry || ''); sessionStorage.setItem('subscriptionCredits', data.credits ?? '')
      sessionStorage.setItem('subscriptionWarningMessage', data.subscription_warning_message || ''); sessionStorage.setItem('adminCompany', data.company_name || '')
      if (finalRole === 'superadmin') navigate('/superadmin/super-dashboard')
      else if (finalRole === 'admin') navigate('/admin/dashboard')
      else if (finalRole === 'master') navigate('/master/dashboard')
      else navigate('/login')
    } catch (error) {
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) setLoginError('Request timed out.')
      else setLoginError(error.response?.data?.detail || error.response?.data?.message || 'Cannot connect to server.')
    } finally { setLoginLoading(false) }
  }

  const handleSendOTP = async () => {
    if (!resetUser || !resetEmail) { setResetError('Please fill in all fields.'); return }
    setResetError(''); setResetLoading(true)
    try {
      await axios.post(API_BASE_URL + '/admin/forgot-password', { username: resetUser, email: resetEmail })
      Swal.fire({ title: 'OTP Sent', text: 'OTP sent to your registered email.', icon: 'success', background: '#0d0d1a', color: '#fff' })
      setResetStep('verify')
    } catch (e) { setResetError(e.response?.data?.detail || 'Error sending OTP.') }
    finally { setResetLoading(false) }
  }

  const handleVerifyOTP = async () => {
    if (!resetOTP) { setResetError('Please enter the OTP.'); return }
    setResetError(''); setResetLoading(true)
    try { await axios.post(API_BASE_URL + '/admin/verify-otp', { username: resetUser, otp: resetOTP }); setResetStep('final') }
    catch (e) { setResetError(e.response?.data?.detail || 'Invalid OTP.') }
    finally { setResetLoading(false) }
  }

  const handleFinalizeReset = async () => {
    if (newPassword.length < 6) { setResetError('Password must be at least 6 characters.'); return }
    setResetError(''); setResetLoading(true)
    try {
      await axios.post(API_BASE_URL + '/admin/reset-password', { username: resetUser, otp: resetOTP, new_password: newPassword })
      Swal.fire({ title: 'Success', text: 'Password updated! Please sign in.', icon: 'success', background: '#0d0d1a', color: '#fff' })
      setIsResetOpen(false)
    } catch (e) { setResetError(e.response?.data?.detail || 'Failed to update password.') }
    finally { setResetLoading(false) }
  }

  const openReset = () => {
    setResetStep('identify'); setResetUser(''); setResetEmail('')
    setResetOTP(''); setNewPassword(''); setResetError(''); setIsResetOpen(true)
  }

  return (
    <>
      <style>{CSS}</style>

      <div className="lp-root">

        {/* Waves — elevated ambient background layer */}
        <div className="lp-waves-bg">
          <div className="lp-wave lp-w3">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 160" preserveAspectRatio="none">
              <path d={W3} fill="rgba(100,30,200,0.13)"/>
              <path d={W3} fill="rgba(100,30,200,0.13)" transform="translate(720,0)"/>
            </svg>
          </div>
          <div className="lp-wave lp-w2">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 160" preserveAspectRatio="none">
              <path d={W2} fill="rgba(120,50,210,0.20)"/>
              <path d={W2} fill="rgba(120,50,210,0.20)" transform="translate(720,0)"/>
            </svg>
          </div>
          <div className="lp-wave lp-w1">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1440 160" preserveAspectRatio="none">
              <path d={W1} fill="rgba(139,92,246,0.32)"/>
              <path d={W1} fill="rgba(139,92,246,0.32)" transform="translate(720,0)"/>
            </svg>
          </div>
        </div>

        {/* Main content */}
        <div className="lp-content">
          <div className="lp-grid">

            {/* LEFT: Login Form */}
            <div className="lp-left">
              <div className="lp-brand">
                <img src={logo} alt="Hire IQ" style={{ height: '44px', objectFit: 'contain', display: 'block', marginBottom: '28px', filter: 'brightness(8) saturate(0.2)' }} />
                <h1 className="lp-headline">Welcome back</h1>
                <p className="lp-sub">
                  Sign in to your Hire IQ admin workspace and<br />
                  manage your AI-powered hiring pipeline.
                </p>
              </div>

              <div className="lp-card">
                <form className="lp-form" onSubmit={handleLogin}>

                  <div className="lp-field">
                    <label className="lp-label">Username</label>
                    <div className="lp-input-wrap">
                      <span className="lp-input-icon"><i className="fas fa-user" /></span>
                      <input
                        id="username" type="text" className="lp-input"
                        value={username} onChange={e => setUsername(e.target.value)}
                        placeholder="Enter your username or email"
                        autoComplete="username" required
                      />
                    </div>
                  </div>

                  <div className="lp-field">
                    <label className="lp-label">Password</label>
                    <div className="lp-input-wrap">
                      <span className="lp-input-icon"><i className="fas fa-lock" /></span>
                      <input
                        id="password" type={showPassword ? 'text' : 'password'}
                        className="lp-input lp-input-pr"
                        value={password} onChange={e => setPassword(e.target.value)}
                        placeholder="Enter your password"
                        autoComplete="current-password" required
                      />
                      <button type="button" className="lp-eye" onClick={() => setShowPassword(v => !v)}>
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div className="lp-forgot-row">
                    <button type="button" className="lp-forgot" onClick={openReset}>Forgot Password?</button>
                  </div>

                  {loginError && (
                    <div className="lp-error">
                      <i className="fas fa-exclamation-circle" />{loginError}
                    </div>
                  )}

                  <button type="submit" className="lp-btn" disabled={loginLoading}>
                    {loginLoading ? (
                      <>
                        <svg className="lp-spinner" viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" strokeWidth="3" />
                          <path fill="white" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Signing In...
                      </>
                    ) : 'Sign In →'}
                  </button>

                </form>
              </div>

              <div className="lp-trust">
                <div className="lp-stars">
                  {[...Array(5)].map((_, i) => (
                    <i key={i} className="fas fa-star" style={{ color: '#fbbf24', fontSize: '11px' }} />
                  ))}
                </div>
                <span className="lp-trust-text">
                  Trusted by <strong>1,020+</strong> hiring teams worldwide
                </span>
              </div>
            </div>

            {/* RIGHT: Hero Image */}
            <div className="lp-right">
              <div className="lp-hero-glow" />
              <img src={loginHero} alt="AI Interview Platform" className="lp-hero-img" />

              <div className="lp-chip" style={{ top: '6%', right: '-10px' }}>
                <div className="lp-chip-dot" />
                <span>AI Proctoring Live</span>
              </div>
              <div className="lp-chip" style={{ bottom: '10%', left: '-14px' }}>
                <i className="fas fa-brain" style={{ color: '#c4b5fd', fontSize: '13px', flexShrink: 0 }} />
                <span>Smart Evaluation Engine</span>
              </div>
              <div className="lp-chip" style={{ top: '40%', right: '-22px' }}>
                <i className="fas fa-chart-line" style={{ color: '#34d399', fontSize: '13px', flexShrink: 0 }} />
                <span style={{ color: '#e2e8f0' }}>Real-time Scoring</span>
              </div>
            </div>

          </div>
        </div>

        {/* Footer */}
        <div className="lp-footer">
          <span>© {new Date().getFullYear()} Hire IQ — Built for AI-powered recruiting</span>
        </div>

      </div>

      {/* Forgot Password Modal */}
      {isResetOpen && (
        <div className="lp-modal-backdrop" onClick={e => { if (e.target === e.currentTarget) setIsResetOpen(false) }}>
          <div className="lp-modal">
            <button className="lp-modal-close" onClick={() => setIsResetOpen(false)}>
              <i className="fas fa-times" />
            </button>

            {resetStep === 'identify' && (
              <>
                <h3 className="lp-modal-title">Reset Password</h3>
                <p className="lp-modal-sub">Verify your admin account details to receive a one-time password.</p>
                <div className="lp-mfield">
                  <label className="lp-mlabel">Username</label>
                  <input type="text" className="lp-minput" value={resetUser} onChange={e => setResetUser(e.target.value)} placeholder="Your username" />
                </div>
                <div className="lp-mfield">
                  <label className="lp-mlabel">Email Address</label>
                  <input type="email" className="lp-minput" value={resetEmail} onChange={e => setResetEmail(e.target.value)} placeholder="admin@company.com" />
                </div>
                <button className="lp-modal-btn" onClick={handleSendOTP} disabled={resetLoading}>
                  {resetLoading ? 'Sending...' : 'Send OTP Code'}
                </button>
              </>
            )}

            {resetStep === 'verify' && (
              <>
                <h3 className="lp-modal-title">Check Your Email</h3>
                <p className="lp-modal-sub">We sent a 6-digit verification code. Enter it below to continue.</p>
                <div className="lp-mfield">
                  <label className="lp-mlabel">OTP Code</label>
                  <input type="text" className="lp-minput lp-otp-input"
                    value={resetOTP} onChange={e => setResetOTP(e.target.value)}
                    placeholder="● ● ● ● ● ●" maxLength={6}
                  />
                </div>
                <button className="lp-modal-btn" onClick={handleVerifyOTP} disabled={resetLoading}>
                  {resetLoading ? 'Checking...' : 'Verify & Continue'}
                </button>
                <p className="lp-resend">
                  Didn't receive it? <button onClick={handleSendOTP}>Resend Code</button>
                </p>
              </>
            )}

            {resetStep === 'final' && (
              <>
                <h3 className="lp-modal-title">Set New Password</h3>
                <p className="lp-modal-sub">Choose a strong password for your admin account.</p>
                <div className="lp-mfield">
                  <label className="lp-mlabel">New Password</label>
                  <div style={{ position: 'relative' }}>
                    <input type={showNewPassword ? 'text' : 'password'} className="lp-minput"
                      style={{ paddingRight: '44px' }} value={newPassword}
                      onChange={e => setNewPassword(e.target.value)} placeholder="Minimum 6 characters"
                    />
                    <button type="button"
                      style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'rgba(148,163,184,0.5)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                      onClick={() => setShowNewPassword(v => !v)}
                    >
                      {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
                <button className="lp-modal-btn" onClick={handleFinalizeReset} disabled={resetLoading}>
                  {resetLoading ? 'Saving...' : 'Update Password'}
                </button>
              </>
            )}

            {resetError && (
              <div className="lp-modal-error">
                <i className="fas fa-exclamation-circle" />{resetError}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
