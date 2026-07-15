import React, { useState, useEffect } from 'react';
import { Mail, Briefcase, Calendar, CheckCircle, Trash2, MessageSquare } from 'lucide-react';
import Swal from 'sweetalert2';

export default function DemoRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchRequests = () => {
    setLoading(true);
    // TODO: Replace with real API call when backend is ready
    // fetch(`${API_BASE_URL}/api/demo-requests`).then(...)
    
    setTimeout(() => {
      setRequests([
        {
          id: '1',
          date: new Date().toISOString(),
          firstName: 'Sarah',
          lastName: 'Connor',
          email: 'sarah.connor@sky.net',
          company: 'Cyberdyne Systems',
          message: 'Looking to automate our engineering recruitment process completely.',
          status: 'new'
        },
        {
          id: '2',
          date: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
          firstName: 'Bruce',
          lastName: 'Wayne',
          email: 'bwayne@wayneenterprises.com',
          company: 'Wayne Enterprises',
          message: 'Need a discrete and efficient hiring system for R&D.',
          status: 'contacted'
        },
        {
          id: '3',
          date: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
          firstName: 'Tony',
          lastName: 'Stark',
          email: 'tony@starkindustries.com',
          company: 'Stark Industries',
          message: 'Interested in the AI evaluation capabilities.',
          status: 'new'
        }
      ]);
      setLoading(false);
    }, 800);
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  const handleMarkContacted = (id) => {
    setRequests(requests.map(req => 
      req.id === id ? { ...req, status: 'contacted' } : req
    ));
    Swal.fire({
      toast: true,
      position: 'top-end',
      icon: 'success',
      title: 'Marked as contacted',
      showConfirmButton: false,
      timer: 2000,
      background: '#161c2d',
      color: '#fff',
    });
  };

  const handleDelete = (id) => {
    Swal.fire({
      title: 'Delete Request?',
      text: "You won't be able to revert this!",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#e11d48',
      cancelButtonColor: '#4f46e5',
      confirmButtonText: 'Yes, delete it!',
      background: '#161c2d',
      color: '#fff',
    }).then((result) => {
      if (result.isConfirmed) {
        setRequests(requests.filter(req => req.id !== id));
        Swal.fire({
          toast: true,
          position: 'top-end',
          icon: 'success',
          title: 'Request deleted',
          showConfirmButton: false,
          timer: 2000,
          background: '#161c2d',
          color: '#fff',
        });
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 mb-1">Demo Requests</h2>
          <p className="text-sm text-slate-500">Manage incoming demo requests from the landing page</p>
        </div>
        <button 
          onClick={fetchRequests}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 text-indigo-600 rounded-lg transition-colors text-sm font-semibold disabled:opacity-50 cursor-pointer"
        >
          <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
          Refresh
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 font-semibold">
                <th className="p-4 pl-6">Date</th>
                <th className="p-4">Contact</th>
                <th className="p-4">Company</th>
                <th className="p-4 w-1/3">Message</th>
                <th className="p-4">Status</th>
                <th className="p-4 pr-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6" className="p-12 text-center text-slate-500">
                    <div className="w-8 h-8 border-4 border-[var(--primary-color)] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    Loading demo requests...
                  </td>
                </tr>
              ) : requests.length === 0 ? (
                <tr>
                  <td colSpan="6" className="p-12 text-center text-slate-500">
                    No demo requests found.
                  </td>
                </tr>
              ) : (
                requests.map((req) => (
                  <tr key={req.id} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="p-4 pl-6 text-sm text-slate-600 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-slate-400" />
                        {new Date(req.date).toLocaleDateString()}
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="text-sm font-semibold text-slate-800">{req.firstName} {req.lastName}</div>
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1">
                        <Mail className="w-3 h-3" />
                        {req.email}
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2 text-sm text-slate-700">
                        <Briefcase className="w-4 h-4 text-slate-400" />
                        {req.company}
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-start gap-2 text-sm text-slate-600">
                        <MessageSquare className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                        <span className="line-clamp-2" title={req.message}>{req.message}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      {req.status === 'new' ? (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-600 border border-emerald-200">
                          New
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-indigo-50 text-indigo-600 border border-indigo-200">
                          Contacted
                        </span>
                      )}
                    </td>
                    <td className="p-4 pr-6 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {req.status === 'new' && (
                          <button 
                            onClick={() => handleMarkContacted(req.id)}
                            title="Mark as Contacted"
                            className="p-2 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors cursor-pointer"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                        )}
                        <button 
                          onClick={() => handleDelete(req.id)}
                          title="Delete Request"
                          className="p-2 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
