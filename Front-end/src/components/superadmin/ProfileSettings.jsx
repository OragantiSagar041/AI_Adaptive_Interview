import React from 'react'
import { useSelector } from 'react-redux'
import Card from '../Card'
import Input from '../Input'
import Button from '../Button'

export default function ProfileSettings() {
  const adminUser = useSelector(state => state.auth.adminUser)
  return (
    <div className="max-w-2xl mx-auto">
      <Card className="bg-white/82 backdrop-blur-md border border-[#e5edf7] text-slate-800 flex flex-col gap-5">
        <h3 className="text-lg font-bold text-slate-800">SuperAdmin Profile Settings</h3>
        <p className="text-xs text-slate-500 -mt-3.5">Update superadmin settings or reset passwords</p>

        <form
          onSubmit={async (e) => {
            e.preventDefault()
            alert("Profile details updated successfully! (Mock confirmation)")
          }}
          className="flex flex-col gap-4"
        >
          <Input
            label="SuperAdmin Owner Name"
            defaultValue={adminUser?.name || 'Super Administrator'}
            required
          />
          <Input
            label="SuperAdmin Email"
            type="email"
            defaultValue={adminUser?.email || 'superadmin@company.com'}
            required
          />
          <Input
            label="Company Workspace Name"
            defaultValue={adminUser?.company_name || 'Acme Corporation'}
            required
          />
          <div className="border-t border-[#e5edf7] pt-4 mt-2">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide mb-3">Change Administrator Password</h4>
          </div>
          <Input
            label="Current Password"
            type="password"
            placeholder="Enter current secure password"
          />
          <Input
            label="New Secure Password"
            type="password"
            placeholder="Create new secure password"
          />

          <Button type="submit" variant="primary" className="py-3 mt-4">
            Save Console Settings
          </Button>
        </form>
      </Card>
    </div>
  )
}
