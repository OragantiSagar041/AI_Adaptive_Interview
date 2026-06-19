// import React from 'react'
// import Input from '../Input'
// import Button from '../Button'

// export default function LoginPanel({
//   loginForm,
//   loginError,
//   loginLoading,
//   onSubmit,
//   onChange,
// }) {
//   return (
//     <div className="flex justify-center items-center min-h-screen bg-bg-app px-6 py-10">
//       <form onSubmit={onSubmit} className="w-full max-w-md bg-bg-card/70 backdrop-blur-md border border-white/8 rounded-2xl p-6 shadow-[0_8px_32px_0_rgba(0,0,0,0.4)] flex flex-col gap-5">
//         <div className="text-center">
//           <h2 className="text-2xl font-bold text-white tracking-tight">Admin Console Login</h2>
//           <p className="text-slate-400 text-sm mt-1">Enter your workspace credentials</p>
//         </div>
//         {loginError && (
//           <div className="bg-danger/10 text-danger border border-danger rounded-lg px-4 py-2.5 text-sm font-medium">
//             {loginError}
//           </div>
//         )}
//         <Input
//           label="Username"
//           placeholder="Admin username"
//           value={loginForm.username}
//           onChange={(e) => onChange(prev => ({ ...prev, username: e.target.value }))}
//           required
//         />
//         <Input
//           label="Password"
//           type="password"
//           placeholder="Password"
//           value={loginForm.password}
//           onChange={(e) => onChange(prev => ({ ...prev, password: e.target.value }))}
//           required
//         />
//         <Button type="submit" variant="primary" className="w-full py-3 mt-2" loading={loginLoading}>
//           Login
//         </Button>
//       </form>
//     </div>
//   )
// }
