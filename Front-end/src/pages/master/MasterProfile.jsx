import React, { useState, useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { User, Mail, Calendar, Lock, Shield, Coins, RefreshCw, KeyRound, CheckCircle, Camera, Loader2, AlertCircle, X, Check } from 'lucide-react'
import { getMasterProfile, updateAdminProfile, uploadProfileImage } from '../../utils/api'
import { setCredentials } from '../../store/slices/authSlice'
import { motion, AnimatePresence } from 'framer-motion'

export default function MasterProfile() {
  const dispatch = useDispatch()
  const token = useSelector(state => state.auth.token)
  const role = useSelector(state => state.auth.role)
  const adminUser = useSelector(state => state.auth.adminUser)

  // Local state for profile details
  const [profileData, setProfileData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [updatingProfile, setUpdatingProfile] = useState(false)
  const [updatingPassword, setUpdatingPassword] = useState(false)

  // Custom modal states replacing SweetAlert
  const [modalState, setModalState] = useState(null) // null | 'loading' | 'success' | 'error' | 'warning'
  const [modalTitle, setModalTitle] = useState('')
  const [modalMessage, setModalMessage] = useState('')
  const [modalFileName, setModalFileName] = useState('')

  const triggerModal = (state, title, message, filename = '') => {
    setModalState(state)
    setModalTitle(title)
    setModalMessage(message)
    setModalFileName(filename)
  }

  // Form states
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  
  // Password visibility states
  const [showOldPassword, setShowOldPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  const inputStyle = {
    border: 'none',
    background: 'transparent',
    padding: 0,
    margin: 0,
    outline: 'none',
    boxShadow: 'none',
    width: '100%',
  }

  const handleAvatarChange = async (e) => {
    const file = e.target.files[0]
    if (file) {
      if (!file.type.startsWith('image/')) {
        triggerModal('warning', 'Invalid File', 'Please select a valid image file.')
        return
      }
      if (file.size > 2 * 1024 * 1024) {
        triggerModal('warning', 'File Too Large', 'Image size should be less than 2MB.')
        return
      }

      triggerModal('loading', 'Uploading Image', 'Uploading to Cloudinary...', file.name)

      try {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('admin_id', profileData.id)

        const result = await uploadProfileImage(formData)

        if (result.status === 'success') {
          // Update local profile data
          setProfileData(prev => ({
            ...prev,
            profile_image: result.profile_image,
            avatar: result.avatar
          }))

          // Update Redux state so header profile reflects the change
          dispatch(
            setCredentials({
              role: role,
              token: token,
              adminUser: {
                ...adminUser,
                profile_image: result.profile_image,
                avatar: result.avatar
              },
            })
          )

          triggerModal('success', 'Success', 'Profile image uploaded successfully!')
        }
      } catch (err) {
        console.error(err)
        triggerModal('error', 'Upload Failed', err || 'Failed to upload profile image.')
      }
    }
  }

  const fetchProfile = async () => {
    setLoading(true)
    try {
      const data = await getMasterProfile()
      setProfileData(data)
      setUsername(data.username || '')
      setEmail(data.email || '')
      setCompanyName(data.company_name || '')
    } catch (err) {
      console.error(err)
      triggerModal('error', 'Error', err || 'Failed to fetch master admin profile data.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (token) {
      fetchProfile()
    }
  }, [token])

  const handleUpdateProfile = async (e) => {
    e.preventDefault()
    if (!profileData?.id) return

    setUpdatingProfile(true)
    try {
      const response = await updateAdminProfile({
        admin_id: profileData.id,
        username,
        email,
        company_name: companyName,
      })

      if (response.status === 'success') {
        triggerModal('success', 'Success', 'Profile updated successfully!')

        // Update local profile data
        const updatedDoc = {
          ...profileData,
          username,
          email,
          company_name: companyName,
        }
        setProfileData(updatedDoc)

        // Update Redux state and sessionStorage so changes reflect globally
        dispatch(
          setCredentials({
            role: role,
            token: token,
            adminUser: {
              ...adminUser,
              username,
              email,
              company_name: companyName,
            },
          })
        )

        // Update sessionStorage values
        sessionStorage.setItem('adminName', username)
        sessionStorage.setItem('adminEmail', email)
        const cachedUser = sessionStorage.getItem('adminUser')
        if (cachedUser) {
          try {
            const parsed = JSON.parse(cachedUser)
            sessionStorage.setItem(
              'adminUser',
              JSON.stringify({ ...parsed, username, email, company_name: companyName })
            )
          } catch (e) {
            console.error('Failed to update adminUser in sessionStorage', e)
          }
        }
      }
    } catch (err) {
      console.error(err)
      triggerModal('error', 'Update Failed', err || 'Failed to update profile settings.')
    } finally {
      setUpdatingProfile(false)
    }
  }

  const handleUpdatePassword = async (e) => {
    e.preventDefault()
    if (!profileData?.id) return

    if (!oldPassword || !newPassword || !confirmPassword) {
      triggerModal('warning', 'Validation Error', 'All password fields are required.')
      return
    }

    if (newPassword !== confirmPassword) {
      triggerModal('warning', 'Validation Error', 'New passwords do not match.')
      return
    }

    setUpdatingPassword(true)
    try {
      const response = await updateAdminProfile({
        admin_id: profileData.id,
        old_password: oldPassword,
        new_password: newPassword,
      })

      if (response.status === 'success') {
        triggerModal('success', 'Success', 'Password updated successfully!')
        setOldPassword('')
        setNewPassword('')
        setConfirmPassword('')
      }
    } catch (err) {
      console.error(err)
      triggerModal('error', 'Update Failed', err || 'Failed to change administrator password.')
    } finally {
      setUpdatingPassword(false)
    }
  }

  const formatDate = (isoString) => {
    if (!isoString) return 'N/A'
    try {
      return new Date(isoString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    } catch (e) {
      return isoString
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-slate-500 space-y-4">
        <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10">
          <RefreshCw className="animate-spin text-primary h-8 w-8" />
        </div>
        <p className="text-sm font-medium tracking-wide">Loading your profile details...</p>
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-6xl">
      {/* Page Title Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center bg-white p-6 rounded-3xl border border-slate-200/60 shadow-[0_4px_25px_rgba(0,0,0,0.02)] gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 font-sans">My Profile</h2>
          <p className="text-sm text-slate-500 mt-1">View and update your Master Control credentials and security preferences.</p>
        </div>
        <button
          onClick={fetchProfile}
          disabled={loading}
          className="px-4 py-2 bg-white border border-slate-200/80 hover:bg-slate-50 hover:text-primary hover:border-primary/30 text-slate-700 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin text-primary' : 'text-slate-400'} /> Refresh Details
        </button>
      </div>

      {profileData && (
        <div className="grid gap-8 grid-cols-1 lg:grid-cols-12">
          {/* Left: Summary Profile Card */}
          <div className="lg:col-span-4 flex flex-col gap-8">
            <div className="bg-white border border-slate-200/60 p-8 rounded-3xl shadow-[0_4px_25px_rgba(0,0,0,0.02)] flex flex-col items-center text-center">
              <div className="relative mb-6 group cursor-pointer" title="Click to upload profile picture" onClick={() => document.getElementById('avatar-upload-input').click()}>
                <div className="p-1 rounded-full bg-gradient-to-tr from-primary/30 via-slate-100 to-primary/40 transition-all duration-300 group-hover:from-primary/60 group-hover:to-primary/70">
                  <div className="relative w-32 h-32 rounded-full overflow-hidden border-4 border-white shadow-md">
                    <img
                      src={profileData?.profile_image || profileData?.avatar || 'https://i.pravatar.cc/150?u=masteradmin'}
                      alt="Avatar"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-slate-900/60 flex flex-col items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      <Camera className="h-5 w-5 mb-1" />
                      <span className="text-[10px] font-bold tracking-wider uppercase">Upload</span>
                    </div>
                  </div>
                </div>
                <span className="absolute bottom-2 right-2 bg-emerald-500 border-4 border-white w-5.5 h-5.5 rounded-full shadow-sm z-10" title="Active Account" />
                <input
                  type="file"
                  id="avatar-upload-input"
                  accept="image/*"
                  onChange={handleAvatarChange}
                  className="hidden"
                />
              </div>

              <h3 className="font-bold text-lg text-slate-800">{profileData.name || 'Master Admin'}</h3>
              <span className="text-[11px] text-primary font-bold uppercase tracking-wider bg-primary/10 border border-primary/20 px-3.5 py-1 rounded-full mt-2">
                {profileData.role || 'master'}
              </span>

              <div className="w-full border-t border-dashed border-slate-200/80 my-6" />

              <div className="w-full space-y-4 text-left text-sm text-slate-600">
                <div className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50/50 rounded-xl transition-all">
                  <Mail size={16} className="text-slate-400 shrink-0" />
                  <span className="truncate text-slate-700 font-medium" title={profileData.email}>{profileData.email}</span>
                </div>
                <div className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50/50 rounded-xl transition-all">
                  <Shield size={16} className="text-slate-400 shrink-0" />
                  <span className="text-slate-500">Access: <span className="font-semibold text-slate-800">Master Level</span></span>
                </div>
                <div className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50/50 rounded-xl transition-all">
                  <Calendar size={16} className="text-slate-400 shrink-0" />
                  <span className="text-slate-500">Joined: <span className="font-semibold text-slate-800">{formatDate(profileData.created_at)}</span></span>
                </div>
              </div>
            </div>

            {/* Quick Statistics Card */}
            <div className="bg-white border border-slate-200/60 p-6 rounded-3xl shadow-[0_4px_25px_rgba(0,0,0,0.02)] space-y-4">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest px-1">Account Details</h4>
              <div className="grid gap-4">
                <div className="bg-slate-50/60 p-3.5 rounded-2xl border border-slate-100/80 text-center">
                  <div className="text-xs text-slate-400 font-medium">Role / Access Level</div>
                  <div className="text-sm font-bold text-slate-800 capitalize mt-1 truncate" title={profileData.role}>
                    {profileData.role || 'Master'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Detailed Settings Forms */}
          <div className="lg:col-span-8 space-y-8">
            {/* Card 1: Edit Account Details */}
            <div className="bg-white border border-slate-200/60 p-8 rounded-3xl shadow-[0_4px_25px_rgba(0,0,0,0.02)]">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2.5 border-b border-slate-100 pb-4">
                <User size={18} className="text-primary" /> Account Settings
              </h3>

              <form onSubmit={handleUpdateProfile} className="space-y-6 mt-6">
                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Username / ID</label>
                    <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 bg-slate-50/30 transition-all focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10 focus-within:bg-white">
                      <span className="text-slate-400 flex-shrink-0">
                        <User size={16} />
                      </span>
                      <input
                        type="text"
                        required
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        style={inputStyle}
                        className="text-sm text-slate-800 placeholder-slate-400"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Registered Email Address</label>
                    <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 bg-slate-50/30 transition-all focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10 focus-within:bg-white">
                      <span className="text-slate-400 flex-shrink-0">
                        <Mail size={16} />
                      </span>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        style={inputStyle}
                        className="text-sm text-slate-800 placeholder-slate-400"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Workspace / Owner Name</label>
                  <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 bg-slate-50/30 transition-all focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10 focus-within:bg-white">
                    <span className="text-slate-400 flex-shrink-0">
                      <Shield size={16} />
                    </span>
                    <input
                      type="text"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="Enter Workspace Owner Name"
                      style={inputStyle}
                      className="text-sm text-slate-800 placeholder-slate-400"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={updatingProfile}
                    className="px-6 py-3 rounded-xl bg-primary hover:bg-primary-hover active:scale-[0.98] border-none text-white font-bold text-xs cursor-pointer disabled:opacity-50 transition-all shadow-md shadow-primary/10 hover:shadow-primary/20"
                  >
                    {updatingProfile ? 'Saving Details...' : 'Save Profile Changes'}
                  </button>
                </div>
              </form>
            </div>

            {/* Card 2: Security & Password Update */}
            <div className="bg-white border border-slate-200/60 p-8 rounded-3xl shadow-[0_4px_25px_rgba(0,0,0,0.02)]">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2.5 border-b border-slate-100 pb-4">
                <Lock size={18} className="text-primary" /> Security Credentials
              </h3>

              <form onSubmit={handleUpdatePassword} className="space-y-6 mt-6">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Current Password</label>
                  <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 bg-slate-50/30 transition-all focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10 focus-within:bg-white">
                    <span className="text-slate-400 flex-shrink-0">
                      <Lock size={16} />
                    </span>
                    <input
                      type={showOldPassword ? "text" : "password"}
                      placeholder="Enter current master password"
                      value={oldPassword}
                      onChange={(e) => setOldPassword(e.target.value)}
                      style={inputStyle}
                      className="text-sm text-slate-800 placeholder-slate-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShowOldPassword(!showOldPassword)}
                      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showOldPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div className="grid gap-6 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">New Password</label>
                    <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 bg-slate-50/30 transition-all focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10 focus-within:bg-white">
                      <span className="text-slate-400 flex-shrink-0">
                        <KeyRound size={16} />
                      </span>
                      <input
                        type={showNewPassword ? "text" : "password"}
                        placeholder="At least 6 characters"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        style={inputStyle}
                        className="text-sm text-slate-800 placeholder-slate-400"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5 block">Confirm New Password</label>
                    <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 bg-slate-50/30 transition-all focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/10 focus-within:bg-white">
                      <span className="text-slate-400 flex-shrink-0">
                        <KeyRound size={16} />
                      </span>
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="Confirm new password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        style={inputStyle}
                        className="text-sm text-slate-800 placeholder-slate-400"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={updatingPassword}
                    className="px-6 py-3 rounded-xl bg-primary hover:bg-primary-hover active:scale-[0.98] border-none text-white font-bold text-xs cursor-pointer disabled:opacity-50 transition-all shadow-md shadow-primary/10 hover:shadow-primary/20"
                  >
                    {updatingPassword ? 'Updating Password...' : 'Update Password'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
      <AnimatePresence>
        {modalState && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              transition={{ type: 'spring', duration: 0.4 }}
              className="bg-white border border-slate-200/80 rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center relative overflow-hidden"
            >
              {/* Decorative top background gradient */}
              <div className={`absolute top-0 inset-x-0 h-2 bg-gradient-to-r ${
                modalState === 'success' ? 'from-emerald-400 via-teal-500 to-emerald-400' :
                modalState === 'error' ? 'from-rose-400 via-red-500 to-rose-400' :
                modalState === 'warning' ? 'from-amber-400 via-orange-500 to-amber-400' :
                'from-primary/80 via-indigo-500 to-primary/80'
              }`} />

              {modalState === 'loading' && (
                <div className="space-y-6 py-4">
                  <div className="relative flex justify-center">
                    <div className="absolute inset-0 rounded-full bg-primary/10 blur-xl w-16 h-16 mx-auto" />
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                      className="text-primary z-10"
                    >
                      <Loader2 size={48} className="animate-spin" />
                    </motion.div>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">{modalTitle}</h3>
                    {modalFileName && (
                      <p className="text-xs text-slate-400 mt-1 truncate max-w-[280px] mx-auto" title={modalFileName}>
                        {modalFileName}
                      </p>
                    )}
                    <p className="text-sm text-slate-500 mt-3 font-medium">{modalMessage}</p>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <motion.div
                      initial={{ width: '0%' }}
                      animate={{ width: '90%' }}
                      transition={{ duration: 3, ease: 'easeOut' }}
                      className="bg-primary h-full rounded-full"
                    />
                  </div>
                </div>
              )}

              {modalState === 'success' && (
                <div className="space-y-6 py-4">
                  <div className="relative flex justify-center">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', damping: 15 }}
                      className="w-16 h-16 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-500 z-10 shadow-sm"
                    >
                      <Check size={32} strokeWidth={3} />
                    </motion.div>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">{modalTitle}</h3>
                    <p className="text-sm text-slate-500 mt-1.5 font-medium">{modalMessage}</p>
                  </div>
                  <button
                    onClick={() => setModalState(null)}
                    className="w-full py-3 bg-emerald-500 hover:bg-emerald-600 active:scale-[0.98] border-none text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-500/10 cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              )}

              {modalState === 'warning' && (
                <div className="space-y-6 py-4">
                  <div className="relative flex justify-center">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', damping: 15 }}
                      className="w-16 h-16 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-500 z-10 shadow-sm"
                    >
                      <AlertCircle size={32} />
                    </motion.div>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">{modalTitle}</h3>
                    <p className="text-sm text-slate-500 mt-1.5 font-medium">{modalMessage}</p>
                  </div>
                  <button
                    onClick={() => setModalState(null)}
                    className="w-full py-3 bg-amber-500 hover:bg-amber-600 active:scale-[0.98] border-none text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-amber-500/10 cursor-pointer"
                  >
                    Ok
                  </button>
                </div>
              )}

              {modalState === 'error' && (
                <div className="space-y-6 py-4">
                  <div className="relative flex justify-center">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', damping: 15 }}
                      className="w-16 h-16 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-500 z-10 shadow-sm"
                    >
                      <AlertCircle size={32} />
                    </motion.div>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">{modalTitle}</h3>
                    <p className="text-sm text-rose-500/90 mt-2 bg-rose-50/50 border border-rose-100/50 px-3 py-2.5 rounded-xl font-medium text-left text-xs break-words">
                      {modalMessage}
                    </p>
                  </div>
                  <button
                    onClick={() => setModalState(null)}
                    className="w-full py-3 bg-rose-500 hover:bg-rose-600 active:scale-[0.98] border-none text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-rose-500/10 cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
