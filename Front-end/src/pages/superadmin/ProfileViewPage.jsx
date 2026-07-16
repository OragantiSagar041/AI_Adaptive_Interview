// import React, { useEffect, useState } from 'react'
// import { useParams, useNavigate } from 'react-router-dom'
// import { useSelector } from 'react-redux'
// import axios from 'axios'
// import { ArrowLeft, User, FileText, Loader2, Download } from 'lucide-react'

// export default function ProfileViewPage() {
//   const { id } = useParams()
//   const navigate = useNavigate()
//   const token = useSelector(state => state.auth.token)
//   const API_BASE_URL = useSelector(state => state.auth.API_BASE_URL)

//   const [loading, setLoading] = useState(true)
//   const [error, setError] = useState(null)
//   const [candidate, setCandidate] = useState(null)

//   useEffect(() => {
//     const fetchCandidate = async () => {
//       try {
//         setLoading(true)
//         const response = await axios.get(`${API_BASE_URL}/admin/interview/${id}`, {
//           headers: { Authorization: `Bearer ${token}` }
//         })
//         setCandidate(response.data)
//       } catch (err) {
//         console.error("Error fetching candidate profile", err)
//         setError("Failed to load candidate profile.")
//       } finally {
//         setLoading(false)
//       }
//     }
//     fetchCandidate()
//   }, [id, token, API_BASE_URL])

//   if (loading) {
//     return (
//       <div className="flex h-screen items-center justify-center bg-slate-50">
//         <Loader2 className="animate-spin text-indigo-500" size={48} />
//       </div>
//     )
//   }

//   if (error || !candidate) {
//     return (
//       <div className="flex flex-col h-screen items-center justify-center bg-slate-50 gap-4">
//         <div className="text-rose-500 bg-rose-50 p-4 rounded-xl border border-rose-100 font-medium">
//           {error || "Candidate not found"}
//         </div>
//         <button onClick={() => navigate(-1)} className="px-4 py-2 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 flex items-center gap-2">
//           <ArrowLeft size={16} /> Go Back
//         </button>
//       </div>
//     )
//   }

//   const cName = candidate.candidate_name || candidate.name || "Candidate"
//   const resumeUrl = candidate.resume_url
//   const resumeText = candidate.resume_text || candidate.profile_text || "No resume text available."

//   return (
//     <div className="min-h-screen bg-slate-50 flex flex-col">
//       {/* Header */}
//       <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm">
//         <div className="flex items-center gap-4">
//           <button
//             onClick={() => navigate(-1)}
//             className="p-2 hover:bg-slate-100 text-slate-500 hover:text-slate-700 rounded-full transition-colors"
//           >
//             <ArrowLeft size={20} />
//           </button>
//           <div>
//             <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
//               <User size={20} className="text-indigo-500" />
//               {cName}'s Profile
//             </h1>
//             <p className="text-sm text-slate-500 mt-0.5">ID: {id}</p>
//           </div>
//         </div>

//         {resumeUrl && (
//           <a
//             href={resumeUrl}
//             target="_blank"
//             rel="noreferrer"
//             className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-medium rounded-lg transition-colors border border-indigo-100"
//           >
//             <Download size={16} /> Download Original Resume
//           </a>
//         )}
//       </header>

//       {/* Content */}
//       <main className="flex-1 p-6 max-w-5xl w-full mx-auto">
//         <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
//           <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
//             <FileText size={18} className="text-slate-500" />
//             <span className="font-bold text-slate-700">Resume / Profile Text</span>
//           </div>
//           <div className="p-8">
//             <pre className="whitespace-pre-wrap font-sans text-slate-700 leading-relaxed text-sm max-w-none">
//               {resumeText}
//             </pre>
//           </div>
//         </div>
//       </main>
//     </div>
//   )
// }
