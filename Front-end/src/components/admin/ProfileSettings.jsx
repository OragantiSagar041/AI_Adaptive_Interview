import React, { useState } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import axios from 'axios'
import Swal from 'sweetalert2'
import 'sweetalert2/dist/sweetalert2.min.css'
import Card from '../Card'
import Input from '../Input'
import Button from '../Button'
import { setCredentials } from '../../store/slices/authSlice'

export default function ProfileSettings() {
  const dispatch = useDispatch()
  const adminUser = useSelector(state => state.auth.adminUser)
  const token = useSelector(state => state.auth.token)
  const role = useSelector(state => state.auth.role)
  const API_BASE_URL = useSelector(state => state.auth.API_BASE_URL)

  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    username: adminUser?.name || adminUser?.username || '',
    email: adminUser?.email || '',
    company_name: adminUser?.company_name || '',
    old_password: '',
    new_password: ''
  })

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const payload = {
        admin_id: adminUser?.admin_id || adminUser?.id || adminUser?._id,
        username: formData.username,
        email: formData.email,
        company_name: formData.company_name
      }
      if (formData.old_password && formData.new_password) {
        payload.old_password = formData.old_password
        payload.new_password = formData.new_password
      }
      
      const res = await axios.post(`${API_BASE_URL}/admin/profile`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      })
      
      // Update local storage and redux state
      const updatedUser = { ...adminUser, name: formData.username, username: formData.username, email: formData.email, company_name: formData.company_name }
      sessionStorage.setItem('adminUser', JSON.stringify(updatedUser))
      dispatch(setCredentials({ role, token, adminUser: updatedUser }))
      
      Swal.fire({
        title: 'Success!',
        text: 'Profile settings updated successfully.',
        icon: 'success',
        confirmButtonColor: '#10b981'
      })
      setFormData(prev => ({ ...prev, old_password: '', new_password: '' }))
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

  return (
    <div className="max-w-2xl mx-auto">
      <Card className="bg-white/82 backdrop-blur-md border border-[#e5edf7] text-slate-800 flex flex-col gap-5">
        <h3 className="text-lg font-bold text-slate-800">Admin Profile Settings</h3>
        <p className="text-xs text-slate-500 -mt-3.5">Update company workspace settings or reset passwords</p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Input
            label="Workspace Owner Name"
            name="username"
            value={formData.username}
            onChange={handleChange}
            required
          />
          <Input
            label="Workspace Admin Email"
            type="email"
            name="email"
            value={formData.email}
            onChange={handleChange}
            required
          />
          <Input
            label="Company Workspace Name"
            name="company_name"
            value={formData.company_name}
            onChange={handleChange}
            required
          />
          <div className="border-t border-[#e5edf7] pt-4 mt-2">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide mb-3">Change Administrator Password</h4>
          </div>
          <Input
            label="Current Password"
            type="password"
            name="old_password"
            value={formData.old_password}
            onChange={handleChange}
            placeholder="Enter current secure password"
          />
          <Input
            label="New Secure Password"
            type="password"
            name="new_password"
            value={formData.new_password}
            onChange={handleChange}
            placeholder="Create new secure password"
          />

          <Button type="submit" variant="primary" className="py-3 mt-4" disabled={loading}>
            {loading ? 'Saving...' : 'Save Console Settings'}
          </Button>
        </form>
      </Card>
    </div>
  )
}
