import React, { useState } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import axios from 'axios'
import Swal from 'sweetalert2'
import 'sweetalert2/dist/sweetalert2.min.css'
import { setCredentials } from '../../store/slices/authSlice'
import { User, Lock, Mail, Shield, Calendar, RefreshCw } from 'lucide-react'

export default function ProfileSettings() {
  const dispatch = useDispatch()
  const adminUser = useSelector(state => state.auth.adminUser)
  const token = useSelector(state => state.auth.token)
  const role = useSelector(state => state.auth.role)
  const API_BASE_URL = useSelector(state => state.auth.API_BASE_URL)

  const [loading, setLoading] = useState(false)
  const [pwdLoading, setPwdLoading] = useState(false)
  const [imgLoading, setImgLoading] = useState(false)
  const fileInputRef = React.useRef(null)

  const [formData, setFormData] = useState({
    username: adminUser?.name || adminUser?.username || '',
    email: adminUser?.email || '',
    company_name: adminUser?.company_name || '',
  })

  const [pwdData, setPwdData] = useState({
    old_password: '',
    new_password: '',
    confirm_password: ''
  })

  // Format joined date
  const joinDate = adminUser?.created_at
    ? new Date(adminUser.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'May 5, 2026'

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  const handlePwdChange = (e) => {
    setPwdData({ ...pwdData, [e.target.name]: e.target.value })
  }

  const handleRefresh = () => {
    Swal.fire({
      title: 'Refreshed',
      text: 'Details are up to date.',
      icon: 'success',
      timer: 1500,
      showConfirmButton: false
    })
  }

  const handleSaveProfile = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const payload = {
        admin_id: adminUser?.admin_id || adminUser?.id || adminUser?._id,
        username: formData.username,
        email: formData.email,
        company_name: formData.company_name
      }

      await axios.post(`${API_BASE_URL}/admin/profile`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      })

      const updatedUser = {
        ...adminUser,
        name: formData.username,
        username: formData.username,
        email: formData.email,
        company_name: formData.company_name
      }
      sessionStorage.setItem('adminUser', JSON.stringify(updatedUser))
      dispatch(setCredentials({ role, token, adminUser: updatedUser }))

      Swal.fire({
        title: 'Success!',
        text: 'Profile settings updated successfully.',
        icon: 'success',
        confirmButtonColor: '#0070F3'
      })
    } catch (err) {
      let errorMsg = err.response?.data?.detail || err.response?.data?.message || err.message || 'Failed to update profile'
      if (Array.isArray(errorMsg)) {
        errorMsg = errorMsg.map(e => e.msg).join(', ')
      } else if (typeof errorMsg === 'object') {
        errorMsg = JSON.stringify(errorMsg)
      }
      Swal.fire('Error', errorMsg, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    const formData = new FormData()
    formData.append('file', file)
    formData.append('admin_id', adminUser?.admin_id || adminUser?.id || adminUser?._id)

    setImgLoading(true)
    try {
      const endpoint = role === 'master'
        ? `${API_BASE_URL}/master/profile/image`
        : (role === 'super_admin' || role === 'superadmin')
          ? `${API_BASE_URL}/superadmin/profile/image`
          : `${API_BASE_URL}/admin/profile/image`

      const res = await axios.post(endpoint, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      })

      const newImageUrl = res.data.profile_image || res.data.secure_url
      const updatedUser = {
        ...adminUser,
        profile_image: newImageUrl,
        avatar: newImageUrl
      }
      sessionStorage.setItem('adminUser', JSON.stringify(updatedUser))
      dispatch(setCredentials({ role, token, adminUser: updatedUser }))

      Swal.fire({
        title: 'Success!',
        text: 'Profile picture updated successfully.',
        icon: 'success',
        timer: 2000,
        showConfirmButton: false
      })
    } catch (err) {
      console.error(err)
      Swal.fire('Error', 'Failed to upload profile picture', 'error')
    } finally {
      setImgLoading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleUpdatePassword = async (e) => {
    e.preventDefault()
    if (pwdData.new_password !== pwdData.confirm_password) {
      Swal.fire('Error', 'New passwords do not match', 'error')
      return
    }
    if (!pwdData.old_password || !pwdData.new_password) {
      Swal.fire('Error', 'Please enter current and new password', 'error')
      return
    }

    setPwdLoading(true)
    try {
      const payload = {
        admin_id: adminUser?.admin_id || adminUser?.id || adminUser?._id,
        username: formData.username,
        email: formData.email,
        company_name: formData.company_name,
        old_password: pwdData.old_password,
        new_password: pwdData.new_password
      }

      await axios.post(`${API_BASE_URL}/admin/profile`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      })

      Swal.fire({
        title: 'Success!',
        text: 'Password updated successfully.',
        icon: 'success',
        confirmButtonColor: '#0070F3'
      })
      setPwdData({ old_password: '', new_password: '', confirm_password: '' })
    } catch (err) {
      let errorMsg = err.response?.data?.detail || err.response?.data?.message || err.message || 'Failed to update password'
      if (Array.isArray(errorMsg)) {
        errorMsg = errorMsg.map(e => e.msg).join(', ')
      } else if (typeof errorMsg === 'object') {
        errorMsg = JSON.stringify(errorMsg)
      }
      Swal.fire('Error', errorMsg, 'error')
    } finally {
      setPwdLoading(false)
    }
  }

  return (
    <div className="max-w-[1000px] mx-auto space-y-6 pb-12 font-sans">
      {/* Header section */}
      <div className="bg-card rounded-[20px] p-6 shadow-sm border border-border dark:border-slate-700/90 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-foreground">My Profile</h2>
          <p className="text-sm text-muted-foreground mt-1">View and update your Administrator credentials and security preferences.</p>
        </div>
        <button
          onClick={handleRefresh}
          className="flex items-center gap-2 px-4 py-2 border border-border dark:border-slate-700 bg-secondary rounded-xl text-sm font-semibold text-foreground hover:bg-muted transition-colors w-fit cursor-pointer"
        >
          <RefreshCw size={15} className="text-muted-foreground" />
          Refresh Details
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column */}
        <div className="lg:col-span-1 space-y-6">
          {/* Profile Card */}
          <div className="bg-card rounded-[20px] p-8 shadow-sm border border-border dark:border-slate-700/90 flex flex-col items-center relative">
            <div className="relative group cursor-pointer" onClick={() => !imgLoading && fileInputRef.current?.click()}>
              <div className="w-28 h-28 rounded-full p-1 border-2 border-border dark:border-slate-700 relative overflow-hidden bg-muted flex items-center justify-center">
                {imgLoading ? (
                  <RefreshCw className="animate-spin text-muted-foreground w-8 h-8" />
                ) : (
                  <img
                    src={adminUser?.profile_image || adminUser?.avatar || "https://ui-avatars.com/api/?name=Admin&background=random"}
                    alt="Avatar"
                    className="w-full h-full rounded-full object-cover"
                  />
                )}

                {/* Upload Overlay */}
                {!imgLoading && (
                  <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-full">
                    <span className="text-[10px] text-white font-bold tracking-wider uppercase">Upload</span>
                  </div>
                )}
              </div>
              <div className="absolute bottom-2 right-2 w-4 h-4 bg-emerald-500 rounded-full border-2 border-background"></div>
            </div>

            {/* Hidden File Input */}
            <input
              type="file"
              accept="image/*"
              ref={fileInputRef}
              onChange={handleImageUpload}
              className="hidden"
            />

            <h3 className="mt-4 text-xl font-bold text-foreground">{adminUser?.name || adminUser?.username || 'admin'}</h3>
            <div className="mt-2 px-4 py-1 bg-indigo-100 dark:bg-indigo-950/80 text-indigo-800 dark:text-indigo-200 text-xs font-black rounded-full uppercase tracking-widest border border-indigo-300 dark:border-indigo-500/60">
              {(role === 'super_admin' || role === 'superadmin') ? 'SUPER ADMIN' : role || 'ADMIN'}
            </div>

            <div className="w-full border-t border-border dark:border-slate-700 border-dashed my-6"></div>

            <div className="w-full space-y-4">
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <Mail size={16} className="text-muted-foreground shrink-0" />
                <span className="truncate">{adminUser?.email || 'admin@example.com'}</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <Shield size={16} className="text-muted-foreground shrink-0" />
                <span>Access: <strong className="text-foreground font-semibold">
                  {role === 'master' ? 'Master Level' : (role === 'super_admin' || role === 'superadmin') ? 'Super Admin Level' : 'Admin Level'}
                </strong></span>
              </div >
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <Calendar size={16} className="text-muted-foreground shrink-0" />
                <span>Joined: <strong className="text-foreground font-semibold">{joinDate}</strong></span>
              </div>
            </div >
          </div >

          {/* Account Details Card */}
          < div className="bg-card rounded-[20px] p-6 shadow-sm border border-border dark:border-slate-700/90" >
            <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-4">Account Details</h4>
            <div className="bg-secondary/70 rounded-2xl p-4 text-center border border-border dark:border-slate-700">
              <div className="text-[11px] text-muted-foreground font-bold uppercase tracking-wider mb-1">Role / Access Level</div>
              <div className="text-sm font-bold text-foreground capitalize">{role || 'Admin'}</div>
            </div>
          </div >
        </div >

        {/* Right Column */}
        < div className="lg:col-span-2 space-y-6" >
          {/* Account Settings */}
          < div className="bg-card rounded-[20px] p-6 shadow-sm border border-border dark:border-slate-700/90" >
            <div className="flex items-center gap-2.5 mb-6">
              <User size={18} className="text-indigo-500" />
              <h3 className="text-base font-bold text-foreground">Account Settings</h3>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Username / ID</label>
                  <div className="relative">
                    <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      name="username"
                      value={formData.username}
                      onChange={handleChange}
                      className="w-full pl-10 pr-4 py-2.5 bg-background border border-border dark:border-slate-700 rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                      required
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Registered Email Address</label>
                  <div className="relative">
                    <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      className="w-full pl-10 pr-4 py-2.5 bg-background border border-border dark:border-slate-700 rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                      required
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Workspace / Owner Name</label>
                <div className="relative">
                  <Shield size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    name="company_name"
                    value={formData.company_name}
                    onChange={handleChange}
                    className="w-full pl-10 pr-4 py-2.5 bg-background border border-border dark:border-slate-700 rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                    required
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={loading}
                  style={{ backgroundColor: '#4f46e5', color: '#ffffff' }}
                  className="px-6 py-3 rounded-xl font-extrabold text-sm shadow-md transition-all disabled:opacity-70 cursor-pointer border border-indigo-600 hover:opacity-90"
                >
                  {loading ? 'Saving...' : 'Save Profile Changes'}
                </button>
              </div>
            </form>
          </div >

          {/* Security Credentials */}
          < div className="bg-card rounded-[20px] p-6 shadow-sm border border-border dark:border-slate-700/90" >
            <div className="flex items-center gap-2.5 mb-6">
              <Lock size={18} className="text-indigo-500" />
              <h3 className="text-base font-bold text-foreground">Security Credentials</h3>
            </div>

            <form onSubmit={handleUpdatePassword} className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Current Password</label>
                <div className="relative">
                  <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="password"
                    name="old_password"
                    value={pwdData.old_password}
                    onChange={handlePwdChange}
                    placeholder="Enter current administrator password"
                    className="w-full pl-10 pr-4 py-2.5 bg-background border border-border dark:border-slate-700 rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">New Password</label>
                  <div className="relative">
                    <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="password"
                      name="new_password"
                      value={pwdData.new_password}
                      onChange={handlePwdChange}
                      placeholder="At least 6 characters"
                      className="w-full pl-10 pr-4 py-2.5 bg-background border border-border dark:border-slate-700 rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Confirm New Password</label>
                  <div className="relative">
                    <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="password"
                      name="confirm_password"
                      value={pwdData.confirm_password}
                      onChange={handlePwdChange}
                      placeholder="Confirm new password"
                      className="w-full pl-10 pr-4 py-2.5 bg-background border border-border dark:border-slate-700 rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={pwdLoading}
                  style={{ backgroundColor: '#4f46e5', color: '#ffffff' }}
                  className="px-6 py-3 rounded-xl font-extrabold text-sm shadow-md transition-all disabled:opacity-70 cursor-pointer border border-indigo-600 hover:opacity-90"
                >
                  {pwdLoading ? 'Updating...' : 'Update Password'}
                </button>
              </div>
            </form>
          </div >
        </div >
      </div >
    </div >
  )
}
