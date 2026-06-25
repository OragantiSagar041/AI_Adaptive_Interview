import React, { useState, useEffect } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { User, Mail, Calendar, Lock, Shield, Coins, RefreshCw, KeyRound, CheckCircle, Eye, EyeOff } from 'lucide-react'
import Swal from 'sweetalert2'
import 'sweetalert2/dist/sweetalert2.min.css'
import { getMasterProfile, updateAdminProfile } from '../../utils/api'
import { setCredentials } from '../../store/slices/authSlice'

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
      Swal.fire({
        title: 'Error',
        text: err || 'Failed to fetch master admin profile data.',
        icon: 'error',
        background: '#161c2d',
        color: '#fff',
      })
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
        Swal.fire({
          title: 'Success',
          text: 'Profile updated successfully!',
          icon: 'success',
          background: '#161c2d',
          color: '#fff',
        })

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
      Swal.fire({
        title: 'Update Failed',
        text: err || 'Failed to update profile settings.',
        icon: 'error',
        background: '#161c2d',
        color: '#fff',
      })
    } finally {
      setUpdatingProfile(false)
    }
  }

  const handleUpdatePassword = async (e) => {
    e.preventDefault()
    if (!profileData?.id) return

    if (!oldPassword || !newPassword || !confirmPassword) {
      Swal.fire({
        title: 'Validation Error',
        text: 'All password fields are required.',
        icon: 'warning',
        background: '#161c2d',
        color: '#fff',
      })
      return
    }

    if (newPassword !== confirmPassword) {
      Swal.fire({
        title: 'Validation Error',
        text: 'New passwords do not match.',
        icon: 'warning',
        background: '#161c2d',
        color: '#fff',
      })
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
        Swal.fire({
          title: 'Success',
          text: 'Password updated successfully!',
          icon: 'success',
          background: '#161c2d',
          color: '#fff',
        })
        setOldPassword('')
        setNewPassword('')
        setConfirmPassword('')
      }
    } catch (err) {
      console.error(err)
      Swal.fire({
        title: 'Update Failed',
        text: err || 'Failed to change administrator password.',
        icon: 'error',
        background: '#161c2d',
        color: '#fff',
      })
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
      <div className="py-24 text-center text-slate-500">
        <RefreshCw className="animate-spin text-indigo-600 inline mr-2 h-6 w-6" /> Loading your profile details...
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Page Title Header */}
      <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-slate-200/60 shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
        <div>
          <h2 className="text-xl font-bold text-slate-800">My Profile</h2>
          <p className="text-sm text-slate-500">View and update your Master Control credentials and security preferences.</p>
        </div>
        <button
          onClick={fetchProfile}
          disabled={loading}
          className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-sm font-semibold transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh Details
        </button>
      </div>

      {profileData && (
        <div className="grid gap-6 md:grid-cols-[320px_1fr]">
          {/* Left: Summary Profile Card */}
          <div className="flex flex-col gap-6">
            <div className="bg-white border border-slate-200/60 p-6 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.04)] flex flex-col items-center text-center">
              <div className="relative mb-4">
                <img
                  src="https://i.pravatar.cc/150?u=masteradmin"
                  alt="Avatar"
                  className="w-24 h-24 rounded-full object-cover border-4 border-indigo-50 shadow-sm"
                />
                <span className="absolute bottom-1 right-1 bg-emerald-500 border-2 border-white w-4.5 h-4.5 rounded-full flex items-center justify-center" title="Active Account" />
              </div>

              <h3 className="font-bold text-lg text-slate-800">{profileData.name || 'Master Admin'}</h3>
              <p className="text-xs text-indigo-600 font-semibold uppercase tracking-wider bg-indigo-50 px-2.5 py-0.5 rounded-full mt-1.5">
                {profileData.role || 'master'}
              </p>

              <hr className="w-full border-slate-100 my-5" />

              <div className="w-full space-y-3.5 text-left text-sm text-slate-600">
                <div className="flex items-center gap-2.5">
                  <Mail size={16} className="text-slate-400 shrink-0" />
                  <span className="truncate" title={profileData.email}>{profileData.email}</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Shield size={16} className="text-slate-400 shrink-0" />
                  <span>Access: <span className="font-medium text-slate-700">Master Level</span></span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Calendar size={16} className="text-slate-400 shrink-0" />
                  <span>Joined: <span className="font-medium text-slate-700">{formatDate(profileData.created_at)}</span></span>
                </div>
              </div>
            </div>

            {/* Quick Statistics Card */}
            <div className="bg-white border border-slate-200/60 p-6 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.04)] space-y-4">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Account Details</h4>
              <div className="grid gap-4">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-center">
                 
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-center">
                  <div className="text-xs text-slate-400 font-medium">Plan</div>
                  <div className="text-sm font-bold text-slate-800 capitalize mt-1 truncate" title={profileData.subscription_plan}>
                    {profileData.subscription_plan || 'Master'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right: Detailed Settings Forms */}
          <div className="space-y-6">
            {/* Card 1: Edit Account Details */}
            <div className="bg-white border border-slate-200/60 p-6 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-3">
                <User size={18} className="text-indigo-600" /> Account Settings
              </h3>

              <form onSubmit={handleUpdateProfile} className="space-y-4 mt-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-500">Username / ID</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 pointer-events-none">
                        <User size={14} />
                      </span>
                      <input
                        type="text"
                        required
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-3 text-sm text-slate-800 outline-none focus:border-indigo-500 transition-colors"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-500">Registered Email Address</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 pointer-events-none">
                        <Mail size={14} />
                      </span>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 py-3 text-sm text-slate-800 outline-none focus:border-indigo-500 transition-colors"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500">Workspace / Owner Name</label>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="Enter Workspace Owner Name"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none focus:border-indigo-500 transition-colors"
                  />
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={updatingProfile}
                    className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 border-none text-white font-bold text-xs cursor-pointer disabled:opacity-50 transition-colors shadow-sm"
                  >
                    {updatingProfile ? 'Saving Details...' : 'Save Profile Changes'}
                  </button>
                </div>
              </form>
            </div>

            {/* Card 2: Security & Password Update */}
            <div className="bg-white border border-slate-200/60 p-6 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-3">
                <Lock size={18} className="text-indigo-600" /> Security Credentials
              </h3>

              <form onSubmit={handleUpdatePassword} className="space-y-4 mt-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-slate-500">Current Password</label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 pointer-events-none">
                      <Lock size={14} />
                    </span>
                    <input
                      type={showOldPassword ? "text" : "password"}
                      placeholder="Enter current master password"
                      value={oldPassword}
                      onChange={(e) => setOldPassword(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-10 py-3 text-sm text-slate-800 outline-none focus:border-indigo-500 transition-colors"
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

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-500">New Password</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 pointer-events-none">
                        <KeyRound size={14} />
                      </span>
                      <input
                        type={showNewPassword ? "text" : "password"}
                        placeholder="At least 6 characters"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-10 py-3 text-sm text-slate-800 outline-none focus:border-indigo-500 transition-colors"
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
                    <label className="text-xs font-semibold text-slate-500">Confirm New Password</label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-400 pointer-events-none">
                        <KeyRound size={14} />
                      </span>
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        placeholder="Confirm new password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-10 py-3 text-sm text-slate-800 outline-none focus:border-indigo-500 transition-colors"
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
                    className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 border-none text-white font-bold text-xs cursor-pointer disabled:opacity-50 transition-colors shadow-sm"
                  >
                    {updatingPassword ? 'Updating Password...' : 'Update Password'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
