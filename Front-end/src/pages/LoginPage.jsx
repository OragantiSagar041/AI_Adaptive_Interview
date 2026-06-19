import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_BASE_URL } from '../apiConfig'
import logo from '../assets/logo.png'
import Swal from 'sweetalert2'
import 'sweetalert2/dist/sweetalert2.min.css'

export default function LoginPage() {
  const navigate = useNavigate()

  // State values
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState('')

  // Forgot password flow states
  const [isResetOpen, setIsResetOpen] = useState(false)
  const [resetStep, setResetStep] = useState('identify') // 'identify', 'verify', 'final'
  const [resetUser, setResetUser] = useState('')
  const [resetEmail, setResetEmail] = useState('')
  const [resetOTP, setResetOTP] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [resetLoading, setResetLoading] = useState(false)
  const [resetError, setResetError] = useState('')

  // Theme support FOUC logic
  useEffect(() => {
    const savedTheme = sessionStorage.getItem('adminTheme')
    if (savedTheme === 'light' || !savedTheme) {
      document.documentElement.setAttribute('data-theme', 'light')
    } else if (savedTheme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark')
    }
  }, [])

  const handleLogin = async (e) => {
    e.preventDefault()
    if (!username || !password) {
      setLoginError('Please enter both username and password.')
      return
    }

    setLoginLoading(true)
    setLoginError('')

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)

    try {
      const response = await fetch(`${API_BASE_URL}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
        signal: controller.signal,
      })

      clearTimeout(timeout)

      if (response.ok) {
        const data = await response.json()

        if (data.status === 'expired' || data.status === 'blocked') {
          setLoginError(data.message || 'Your subscription has expired.')
          setLoginLoading(false)
          return
        }

        const adminId = data.admin_id || data.master_id
        const adminEmail = data.email || ''
        const adminName = data.username || username
        const role = data.role || 'tenant'
        const plan = data.subscription_plan || 'Free Trial'
        const planKey = data.subscription_plan_key || 'trial'
        const planCapabilities = data.plan_capabilities || {}

        // Persist session
        if (data.token) {
          sessionStorage.setItem('adminToken', data.token)
        }
        sessionStorage.setItem('adminId', adminId)
        sessionStorage.setItem('adminEmail', adminEmail)
        sessionStorage.setItem('adminName', adminName)
        sessionStorage.setItem('adminRole', role)
        sessionStorage.setItem('adminUser', JSON.stringify(data))
        sessionStorage.setItem('subscriptionPlan', plan)
        sessionStorage.setItem('subscriptionPlanKey', planKey)
        sessionStorage.setItem('planCapabilities', JSON.stringify(planCapabilities))
        sessionStorage.setItem('subscriptionExpiry', data.subscription_expiry || '')
        sessionStorage.setItem('subscriptionCredits', data.credits ?? '')
        sessionStorage.setItem('subscriptionWarningMessage', data.subscription_warning_message || '')
        sessionStorage.setItem('adminCompany', data.company_name || '')

        // Redirect based on role
        if (role === 'master') {
          navigate('/master')
        } else if (role === 'super_admin') {
          navigate('/super-admin')
        } else if (role === 'tenant' || role === 'admin') {
          navigate('/admin')
        } else {
          navigate('/login')
        }
      } else {
        setLoginError('Invalid username or password.')
      }
    } catch (error) {
      console.error('Login error:', error)
      if (error.name === 'AbortError') {
        setLoginError('Request timed out. Server may be starting up — try again.')
      } else {
        setLoginError('Cannot connect to server. Please check if backend is running.')
      }
    } finally {
      setLoginLoading(false)
    }
  }

  // OTP Handlers
  const handleSendOTP = async () => {
    if (!resetUser || !resetEmail) {
      setResetError('Please fill in all fields.')
      return
    }

    setResetError('')
    setResetLoading(true)

    try {
      const res = await fetch(`${API_BASE_URL}/admin/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: resetUser, email: resetEmail }),
      })
      const data = await res.json()
      if (res.ok) {
        Swal.fire({
          title: 'OTP Sent',
          text: 'An OTP has been sent successfully to your registered email.',
          icon: 'success',
          background: '#161c2d',
          color: '#fff',
        })
        setResetStep('verify')
      } else {
        setResetError(data.detail || 'Error sending OTP.')
      }
    } catch (e) {
      setResetError('Network error. Try again.')
    } finally {
      setResetLoading(false)
    }
  }

  const handleVerifyOTP = async () => {
    if (!resetOTP) {
      setResetError('Please enter the OTP.')
      return
    }

    setResetError('')
    setResetLoading(true)

    try {
      const res = await fetch(`${API_BASE_URL}/admin/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: resetUser, otp: resetOTP }),
      })
      if (res.ok) {
        setResetStep('final')
      } else {
        const data = await res.json().catch(() => ({}))
        setResetError(data.detail || 'Invalid OTP.')
      }
    } catch (e) {
      setResetError('Network error. Try again.')
    } finally {
      setResetLoading(false)
    }
  }

  const handleFinalizeReset = async () => {
    if (newPassword.length < 6) {
      setResetError('Password must be at least 6 characters.')
      return
    }

    setResetError('')
    setResetLoading(true)

    try {
      const res = await fetch(`${API_BASE_URL}/admin/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: resetUser, otp: resetOTP, new_password: newPassword }),
      })
      if (res.ok) {
        Swal.fire({
          title: 'Success',
          text: 'Password updated! Please sign in with your new password.',
          icon: 'success',
          background: '#161c2d',
          color: '#fff',
        })
        handleCloseResetModal()
      } else {
        const data = await res.json().catch(() => ({}))
        setResetError(data.detail || 'Failed to update password.')
      }
    } catch (e) {
      setResetError('Network error.')
    } finally {
      setResetLoading(false)
    }
  }

  const handleOpenResetModal = () => {
    setResetStep('identify')
    setResetUser('')
    setResetEmail('')
    setResetOTP('')
    setNewPassword('')
    setResetError('')
    setIsResetOpen(true)
  }

  const handleCloseResetModal = () => {
    setIsResetOpen(false)
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-white text-[#111827] font-sans selection:bg-slate-200 select-none">
      {/* Video Background */}
      <video
        className="absolute inset-0 h-full w-full object-cover scale-y-[-1] z-0"
        autoPlay
        loop
        muted
        playsInline
      >
        <source
          src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260302_085640_276ea93b-d7da-4418-a09b-2aa5b490e838.mp4"
          type="video/mp4"
        />
      </video>

      {/* Overlays */}
      <div
        className="absolute inset-0 z-1 pointer-events-none"
        style={{
          background: 'linear-gradient(to bottom, rgba(255, 255, 255, 0) 26.416%, #ffffff 66.943%)'
        }}
      />

      {/* Main Core Layout Grid */}
      <div className="relative z-10 min-h-screen flex flex-col justify-between">
        {/* Navigation Head */}
        <header className="w-full pt-6 px-6 md:px-12 lg:px-16">
          <div className="flex items-center justify-between gap-4 px-4 py-3 rounded-[5px] bg-[#fcfcfca0] border border-[#11242714] shadow-[0_10px_40px_5px_rgba(194,194,194,0.18)] backdrop-blur-md">
            <a href="#" className="text-[1.125rem] font-medium text-[#111827] tracking-[-0.04em] no-underline">
              Hire IQ
            </a>
          </div>
        </header>

        {/* Hero Section Grid */}
        <main className="flex-1 flex justify-center px-6 md:px-12 lg:px-16 pt-[190px] md:pt-[290px] pb-16">
          <div className="w-full max-w-[1200px] mx-auto grid gap-10 lg:grid-cols-[1.15fr_minmax(360px,420px)] lg:items-start">
            {/* Left Column Text Info */}
            <div className="grid gap-8 max-w-[820px]">
              <h1 className="text-[clamp(3.25rem,7vw,5rem)] lg:text-[80px] font-medium leading-[0.92] tracking-[-0.04em] text-[#111827]">
                Simple <span className="font-serif italic font-normal tracking-[-0.04em] text-[clamp(4rem,8.5vw,6.25rem)]" style={{ fontFamily: "'Instrument Serif', serif" }}>interview</span> management for your hiring team
              </h1>
              <p className="max-w-[554px] text-[1.125rem] leading-[1.65] text-[#373a46cc]">
                Launch mock interviews, schedule candidate windows, send polished invitations, and review AI-guided performance from one calm admin workspace built for fast hiring teams.
              </p>

              <div className="flex flex-col gap-4 items-start">
                <div className="inline-flex items-center gap-3.5 px-4 py-3 rounded-[5px] bg-white/90 border border-black/5 shadow-[0_12px_28px_rgba(194,194,194,0.18)] text-[#111827] flex-wrap">
                  <span className="text-[0.95rem] font-medium">1,020+ Reviews</span>
                  <div className="inline-flex items-center gap-1 text-[#111827] text-xs">
                    <i className="fas fa-star" />
                    <i className="fas fa-star" />
                    <i className="fas fa-star" />
                    <i className="fas fa-star" />
                    <i className="fas fa-star-half-stroke" />
                    <i className="fab fa-google ml-2" />
                    <i className="fab fa-linkedin-in ml-1" />
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column Form Card */}
            <div className="flex justify-center lg:justify-end">
              <div
                className="w-full max-w-[420px] rounded-[5px] p-8 border border-[rgba(17,24,39,0.08)] shadow-[0_18px_50px_rgba(194,194,194,0.22)] backdrop-blur-md"
                style={{
                  background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(255, 255, 255, 0.92))'
                }}
              >
                <div className="flex justify-center mb-8">
                  <img src={logo} alt="Hire IQ Logo" className="h-[90px] w-auto object-contain" />
                </div>

                <form onSubmit={handleLogin} className="space-y-5">
                  <div className="space-y-2">
                    <label htmlFor="username" className="block text-[0.78rem] font-semibold text-[#373a46c0] uppercase tracking-[0.08em]">
                      Username
                    </label>
                    <div className="relative">
                      <span className="absolute left-[14px] top-1/2 -translate-y-1/2 text-slate-500 text-[1.05rem] pointer-events-none">
                        <i className="fas fa-user" />
                      </span>
                      <input
                        type="text"
                        id="username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="Enter work email (username)"
                        className="w-full py-3.5 pl-11 pr-4 text-sm text-[#111827] bg-[#fcfcfae0] border border-black/10 rounded-[5px] outline-none transition-all placeholder-slate-400 focus:border-black/30 focus:shadow-[0_0_0_3px_rgba(17,24,39,0.06)]"
                        autoComplete="username"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label htmlFor="password" className="block text-[0.78rem] font-semibold text-[#373a46c0] uppercase tracking-[0.08em]">
                      Password
                    </label>
                    <div className="relative">
                      <span className="absolute left-[14px] top-1/2 -translate-y-1/2 text-slate-500 text-[1.05rem] pointer-events-none">
                        <i className="fas fa-lock" />
                      </span>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        id="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter password"
                        className="w-full py-3.5 pl-11 pr-11 text-sm text-[#111827] bg-[#fcfcfae0] border border-black/10 rounded-[5px] outline-none transition-all placeholder-slate-400 focus:border-black/30 focus:shadow-[0_0_0_3px_rgba(17,24,39,0.06)]"
                        autoComplete="current-password"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-[12px] top-1/2 -translate-y-1/2 text-slate-500 text-[1.15rem] p-1 rounded hover:text-[#111827] hover:bg-black/5 transition-colors cursor-pointer"
                        title={showPassword ? 'Hide password' : 'Show password'}
                      >
                        <i className={showPassword ? 'fas fa-eye-slash' : 'fas fa-eye'} />
                      </button>
                    </div>
                  </div>

                  <div className="flex justify-end -mt-1 mb-6">
                    <button
                      type="button"
                      onClick={handleOpenResetModal}
                      className="text-[0.85rem] font-medium text-indigo-600 hover:text-indigo-700 hover:underline bg-transparent border-none cursor-pointer outline-none"
                    >
                      Forgot Password?
                    </button>
                  </div>

                  {loginError && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-600 text-xs font-medium rounded-[5px] p-3">
                      {loginError}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loginLoading}
                    className="w-full py-3.5 rounded-[5px] font-medium text-[1rem] text-white border-none outline-none cursor-pointer transition-all disabled:opacity-50"
                    style={{
                      background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0) 42%), linear-gradient(180deg, #2d2d2d 0%, #151515 100%)',
                      boxShadow: 'inset -4px -6px 25px 0 rgba(201, 201, 201, 0.08), inset 4px 4px 10px 0 rgba(29, 29, 29, 0.24), 0 18px 30px rgba(17, 24, 39, 0.15)'
                    }}
                  >
                    {loginLoading ? 'Signing In...' : 'Sign In'}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </main>

        <footer className="w-full text-center text-xs text-slate-400 py-6 border-t border-black/5 relative z-2">
          Hire IQ, built for AI-powered recruiting operations.
        </footer>
      </div>

      {/* Forgot Password Reset Modal */}
      {isResetOpen && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-[fadeIn_0.3s_ease-out]">
          <div className="relative w-full max-w-[450px] bg-white border border-slate-200 rounded-[5px] p-10 shadow-[0_8px_40px_rgba(0,0,0,0.1)] text-[#111827]">
            <button
              onClick={handleCloseResetModal}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-900 bg-none border-none outline-none cursor-pointer text-lg"
            >
              <i className="fas fa-times" />
            </button>

            {resetStep === 'identify' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-bold text-[#111827]">Reset Password</h3>
                  <p className="text-slate-500 text-xs mt-1">Verify your admin account to receive an OTP.</p>
                </div>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[#373a46c0] block mb-2">Username</label>
                    <input
                      type="text"
                      value={resetUser}
                      onChange={(e) => setResetUser(e.target.value)}
                      placeholder="Enter your username"
                      className="w-full rounded-[5px] border border-black/10 bg-[#fcfcfae0] px-4 py-2.5 text-sm text-[#111827] placeholder-slate-400 outline-none focus:border-black/30"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[#373a46c0] block mb-2">Email Address</label>
                    <input
                      type="email"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      placeholder="Enter registered email"
                      className="w-full rounded-[5px] border border-black/10 bg-[#fcfcfae0] px-4 py-2.5 text-sm text-[#111827] placeholder-slate-400 outline-none focus:border-black/30"
                    />
                  </div>
                  <button
                    onClick={handleSendOTP}
                    disabled={resetLoading}
                    className="w-full py-2.5 mt-2 rounded-[5px] text-white font-medium text-sm cursor-pointer border-none disabled:opacity-50"
                    style={{
                      background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0) 42%), linear-gradient(180deg, #2d2d2d 0%, #151515 100%)',
                      boxShadow: 'inset -4px -6px 25px 0 rgba(201, 201, 201, 0.08), inset 4px 4px 10px 0 rgba(29, 29, 29, 0.24), 0 18px 30px rgba(17, 24, 39, 0.15)'
                    }}
                  >
                    {resetLoading ? 'Sending...' : 'Send OTP Code'}
                  </button>
                </div>
              </div>
            )}

            {resetStep === 'verify' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-bold text-[#111827]">Verify OTP</h3>
                  <p className="text-slate-500 text-xs mt-1">Enter the 6-digit code sent to your email.</p>
                </div>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[#373a46c0] block mb-2">OTP Code</label>
                    <input
                      type="text"
                      value={resetOTP}
                      onChange={(e) => setResetOTP(e.target.value)}
                      placeholder="6-digit code"
                      maxLength={6}
                      className="w-full rounded-[5px] border border-black/10 bg-[#fcfcfae0] px-4 py-3 text-center text-xl font-bold tracking-widest text-[#111827] placeholder-slate-300 outline-none focus:border-black/30"
                    />
                  </div>
                  <button
                    onClick={handleVerifyOTP}
                    disabled={resetLoading}
                    className="w-full py-2.5 mt-2 rounded-[5px] text-white font-medium text-sm cursor-pointer border-none disabled:opacity-50"
                    style={{
                      background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0) 42%), linear-gradient(180deg, #2d2d2d 0%, #151515 100%)',
                      boxShadow: 'inset -4px -6px 25px 0 rgba(201, 201, 201, 0.08), inset 4px 4px 10px 0 rgba(29, 29, 29, 0.24), 0 18px 30px rgba(17, 24, 39, 0.15)'
                    }}
                  >
                    {resetLoading ? 'Checking...' : 'Verify & Continue'}
                  </button>
                  <p className="text-center text-xs text-slate-500 pt-2">
                    Didn't get code?{' '}
                    <button
                      onClick={handleSendOTP}
                      className="text-indigo-600 hover:text-indigo-700 font-semibold bg-transparent border-none cursor-pointer outline-none"
                    >
                      Resend
                    </button>
                  </p>
                </div>
              </div>
            )}

            {resetStep === 'final' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-bold text-[#111827]">New Password</h3>
                  <p className="text-slate-500 text-xs mt-1">Choose a strong new password for your account.</p>
                </div>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[#373a46c0] block mb-2">New Password</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Minimum 6 characters"
                      className="w-full rounded-[5px] border border-black/10 bg-[#fcfcfae0] px-4 py-2.5 text-sm text-[#111827] placeholder-slate-400 outline-none focus:border-black/30"
                    />
                  </div>
                  <button
                    onClick={handleFinalizeReset}
                    disabled={resetLoading}
                    className="w-full py-2.5 mt-2 rounded-[5px] text-white font-medium text-sm cursor-pointer border-none disabled:opacity-50"
                    style={{
                      background: 'linear-gradient(180deg, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0) 42%), linear-gradient(180deg, #2d2d2d 0%, #151515 100%)',
                      boxShadow: 'inset -4px -6px 25px 0 rgba(201, 201, 201, 0.08), inset 4px 4px 10px 0 rgba(29, 29, 29, 0.24), 0 18px 30px rgba(17, 24, 39, 0.15)'
                    }}
                  >
                    {resetLoading ? 'Saving...' : 'Update Password'}
                  </button>
                </div>
              </div>
            )}

            {resetError && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-600 text-xs font-medium rounded-[5px] p-3 mt-4">
                {resetError}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

