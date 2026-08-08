import React, { useState, useEffect } from 'react';
import { Mail, Briefcase, Calendar, CheckCircle, Trash2, MessageSquare, Send, X, Sparkles, User, Building, PhoneCall } from 'lucide-react';
import Swal from 'sweetalert2';
import 'sweetalert2/dist/sweetalert2.min.css';
import { useSelector } from 'react-redux';
import { API_BASE_URL } from '../../apiConfig';

export default function DemoRequests() {
  const [activeTab, setActiveTab] = useState('demos'); // 'demos' | 'contacts'
  const [demoRequests, setDemoRequests] = useState([]);
  const [contactRequests, setContactRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  // Email modal state
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [selectedReq, setSelectedReq] = useState(null);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);

  const token = useSelector((state) => state.auth.token);

  const fetchAllRequests = async () => {
    setLoading(true);
    try {
      const [demoRes, contactRes] = await Promise.all([
        fetch(`${API_BASE_URL}/master/demo-requests`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${API_BASE_URL}/master/contact-requests`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);

      if (demoRes.ok) {
        const demoData = await demoRes.json();
        setDemoRequests(demoData.data || []);
      }
      if (contactRes.ok) {
        const contactData = await contactRes.json();
        setContactRequests(contactData.data || []);
      }
    } catch (error) {
      console.error("Error fetching requests:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllRequests();
  }, []);

  const currentList = activeTab === 'demos' ? demoRequests : contactRequests;
  const currentEndpoint = activeTab === 'demos' ? 'demo-requests' : 'contact-requests';

  const handleMarkContacted = async (id) => {
    try {
      const response = await fetch(`${API_BASE_URL}/master/${currentEndpoint}/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status: 'CONTACTED' })
      });
      if (response.ok) {
        if (activeTab === 'demos') {
          setDemoRequests(demoRequests.map(req => req.id === id ? { ...req, status: 'CONTACTED' } : req));
        } else {
          setContactRequests(contactRequests.map(req => req.id === id ? { ...req, status: 'CONTACTED' } : req));
        }
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
      }
    } catch (error) {
      console.error("Error updating status:", error);
    }
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
    }).then(async (result) => {
      if (result.isConfirmed) {
        try {
          const response = await fetch(`${API_BASE_URL}/master/${currentEndpoint}/${id}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${token}`
            }
          });
          if (response.ok) {
            if (activeTab === 'demos') {
              setDemoRequests(demoRequests.filter(req => req.id !== id));
            } else {
              setContactRequests(contactRequests.filter(req => req.id !== id));
            }
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
        } catch (error) {
          console.error("Error deleting request:", error);
        }
      }
    });
  };

  const handleOpenEmailModal = (req) => {
    setSelectedReq(req);
    const company = req.company_name || 'your company';
    const name = req.first_name ? `${req.first_name}` : 'there';
    const email = req.work_email || req.company_email;

    if (activeTab === 'demos') {
      setEmailSubject(`HireIQ Platform Demo & Discussion for ${company}`);
      setEmailBody(
`Hi ${name},

Thank you for reaching out and requesting a demo of HireIQ!

We would love to give you a personalized walkthrough of our AI-powered interview & assessment platform, and show how we help teams at ${company} streamline and automate their technical and behavioral hiring workflows.

Please let us know your convenient date and time slot for a 20-minute product demonstration, or reply directly to this email.

Looking forward to connecting with you!

Best regards,
HireIQ Client Success Team`
      );
    } else {
      setEmailSubject(`Thank you for connecting with HireIQ — ${company}`);
      setEmailBody(
`Hi ${name},

Thank you for contacting the HireIQ team regarding: "${req.message || 'your inquiry'}".

We would love to connect and assist you with your requirements. Please let us know the best time to connect, or feel free to reply directly to this email.

Best regards,
HireIQ Client Relations Team`
      );
    }
    setIsEmailModalOpen(true);
  };

  const handleSendEmail = async (e) => {
    e.preventDefault();
    const recipientEmail = selectedReq?.work_email || selectedReq?.company_email;
    if (!selectedReq || !recipientEmail) {
      Swal.fire({
        title: 'Missing Recipient',
        text: 'Recipient email address is missing.',
        icon: 'error',
        background: '#161c2d',
        color: '#fff',
      });
      return;
    }

    if (!emailSubject.trim() || !emailBody.trim()) {
      Swal.fire({
        title: 'Incomplete Email',
        text: 'Please provide both a subject and message body.',
        icon: 'warning',
        background: '#161c2d',
        color: '#fff',
      });
      return;
    }

    setSendingEmail(true);
    try {
      const response = await fetch(`${API_BASE_URL}/master/${currentEndpoint}/${selectedReq.id}/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          recipient_email: recipientEmail,
          recipient_name: `${selectedReq.first_name || ''} ${selectedReq.last_name || ''}`.trim(),
          subject: emailSubject.trim(),
          message: emailBody.trim()
        })
      });

      const data = await response.json();
      if (response.ok && data.status === 'success') {
        if (activeTab === 'demos') {
          setDemoRequests(demoRequests.map(r => r.id === selectedReq.id ? { ...r, status: 'CONTACTED' } : r));
        } else {
          setContactRequests(contactRequests.map(r => r.id === selectedReq.id ? { ...r, status: 'CONTACTED' } : r));
        }
        setIsEmailModalOpen(false);
        Swal.fire({
          title: 'Email Sent!',
          text: `Your message has been delivered to ${recipientEmail}. Marked as CONTACTED.`,
          icon: 'success',
          background: '#161c2d',
          color: '#fff',
        });
      } else {
        throw new Error(data.detail || data.message || 'Failed to send email');
      }
    } catch (error) {
      console.error("Error sending email:", error);
      Swal.fire({
        title: 'Delivery Failed',
        text: error.message || 'Could not send email.',
        icon: 'error',
        background: '#161c2d',
        color: '#fff',
      });
    } finally {
      setSendingEmail(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 mb-1 flex items-center gap-2.5">
            <span>Inquiries & Leads</span>
          </h2>
          <p className="text-sm text-slate-500">Manage incoming demo bookings and "Connect with Us" contact messages</p>
        </div>
        <button 
          onClick={fetchAllRequests}
          disabled={loading}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-xl transition-all shadow-sm text-sm font-semibold disabled:opacity-50 cursor-pointer"
        >
          <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
          Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
        <button
          onClick={() => setActiveTab('demos')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all cursor-pointer ${
            activeTab === 'demos'
              ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span>Book Demo Requests</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
            activeTab === 'demos' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
          }`}>
            {demoRequests.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('contacts')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all cursor-pointer ${
            activeTab === 'contacts'
              ? 'bg-cyan-600 text-white shadow-sm shadow-cyan-200'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <span>Connect with Us Messages</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
            activeTab === 'contacts' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
          }`}>
            {contactRequests.length}
          </span>
        </button>
      </div>

      {/* Table Container */}
      <div className="bg-white border border-slate-200/70 rounded-2xl overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.04)]">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200/80 text-[0.68rem] uppercase tracking-wider text-slate-400 font-bold">
                <th className="p-4 pl-6">Date</th>
                <th className="p-4">Contact</th>
                <th className="p-4">Company</th>
                <th className="p-4 w-1/3">Message</th>
                <th className="p-4 text-center">Status</th>
                <th className="p-4 pr-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan="6" className="p-12 text-center text-slate-500">
                    <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <span className="text-sm font-medium">Loading inquiries...</span>
                  </td>
                </tr>
              ) : currentList.length === 0 ? (
                <tr>
                  <td colSpan="6" className="p-12 text-center text-slate-400">
                    <Mail className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                    <p className="text-sm font-medium">No {activeTab === 'demos' ? 'demo requests' : 'contact inquiries'} received yet.</p>
                  </td>
                </tr>
              ) : (
                currentList.map((req) => {
                  const email = req.work_email || req.company_email;
                  const message = req.help_text || req.message;
                  return (
                    <tr key={req.id} className="hover:bg-slate-50/70 transition-colors group">
                      <td className="p-4 pl-6 text-sm text-slate-600 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-slate-400" />
                          <span className="font-medium">{req.created_at ? new Date(req.created_at).toLocaleDateString() : 'N/A'}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="text-sm font-bold text-slate-800">{req.first_name} {req.last_name}</div>
                        <div className="flex items-center gap-1.5 text-xs text-indigo-600 font-medium mt-1">
                          <Mail className="w-3.5 h-3.5 text-indigo-400" />
                          <span>{email}</span>
                        </div>
                        {req.mobile_number && (
                          <div className="text-[11px] text-slate-400 mt-0.5">
                            📞 {req.mobile_number}
                          </div>
                        )}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                          <Briefcase className="w-4 h-4 text-slate-400" />
                          <span>{req.company_name || 'N/A'}</span>
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="flex items-start gap-2 text-sm text-slate-600 bg-slate-50/60 p-2.5 rounded-xl border border-slate-100">
                          <MessageSquare className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                          <span className="line-clamp-2 text-xs leading-relaxed" title={message}>
                            {message || 'No message provided.'}
                          </span>
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        {req.status === 'NEW' ? (
                          <button
                            onClick={() => handleMarkContacted(req.id)}
                            title="Click to mark as Contacted"
                            className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors cursor-pointer"
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            <span>New Inquiry</span>
                          </button>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700 border border-slate-200">
                            <CheckCircle className="w-3 h-3 text-indigo-500" />
                            <span>Contacted</span>
                          </span>
                        )}
                      </td>
                      <td className="p-4 pr-6 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {/* SEND EMAIL BUTTON */}
                          <button 
                            onClick={() => handleOpenEmailModal(req)}
                            title={`Send Email to ${email}`}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border font-semibold text-xs transition-all shadow-xs cursor-pointer group/btn ${
                              activeTab === 'demos'
                                ? 'bg-indigo-50 hover:bg-indigo-600 text-indigo-600 hover:text-white border-indigo-200 hover:border-indigo-600'
                                : 'bg-cyan-50 hover:bg-cyan-600 text-cyan-600 hover:text-white border-cyan-200 hover:border-cyan-600'
                            }`}
                          >
                            <Send size={13} className="transition-transform group-hover/btn:translate-x-0.5" />
                            <span>Email Client</span>
                          </button>

                          {/* DELETE BUTTON */}
                          <button 
                            onClick={() => handleDelete(req.id)}
                            title="Delete Request"
                            className="p-2 rounded-xl bg-rose-50 text-rose-500 hover:bg-rose-500 hover:text-white border border-rose-100 hover:border-rose-500 transition-all cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: COMPOSE & SEND EMAIL */}
      {isEmailModalOpen && selectedReq && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-2xl bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 text-slate-800 relative">
            
            {/* Header */}
            <div className="flex justify-between items-start border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${activeTab === 'demos' ? 'bg-indigo-50 text-indigo-600' : 'bg-cyan-50 text-cyan-600'}`}>
                  <Mail size={20} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <span>Send Email to Client</span>
                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${
                      activeTab === 'demos' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-cyan-50 text-cyan-600 border-cyan-100'
                    }`}>
                      Direct Mail
                    </span>
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">Reach out directly to answer questions and provide demo information</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEmailModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors cursor-pointer border-none"
              >
                <X size={16} />
              </button>
            </div>

            {/* Recipient info badges */}
            <div className="bg-slate-50 border border-slate-200/70 rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="flex items-center gap-2">
                <User size={14} className="text-slate-400" />
                <span className="text-slate-500">Recipient:</span>
                <span className="font-semibold text-slate-800">{selectedReq.first_name} {selectedReq.last_name}</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail size={14} className={activeTab === 'demos' ? 'text-indigo-500' : 'text-cyan-500'} />
                <span className="text-slate-500">Email:</span>
                <span className={`font-bold ${activeTab === 'demos' ? 'text-indigo-600' : 'text-cyan-600'}`}>
                  {selectedReq.work_email || selectedReq.company_email}
                </span>
              </div>
              <div className="flex items-center gap-2 sm:col-span-2">
                <Building size={14} className="text-slate-400" />
                <span className="text-slate-500">Company:</span>
                <span className="font-semibold text-slate-800">{selectedReq.company_name || 'N/A'}</span>
                {(selectedReq.help_text || selectedReq.message) && (
                  <span className="text-slate-400 text-[11px] ml-auto italic truncate max-w-[260px]">
                    "{selectedReq.help_text || selectedReq.message}"
                  </span>
                )}
              </div>
            </div>

            {/* Compose Form */}
            <form onSubmit={handleSendEmail} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Email Subject</label>
                <input
                  type="text"
                  required
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  placeholder="e.g. HireIQ Platform Demo & Next Steps"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:bg-white transition-all"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Message Body</label>
                  <button
                    type="button"
                    onClick={() => {
                      const company = selectedReq.company_name || 'your team';
                      if (activeTab === 'demos') {
                        setEmailBody(
`Hi ${selectedReq.first_name || 'there'},

Thank you for your interest in HireIQ.

We'd love to schedule a brief 20-minute demo to showcase how our autonomous AI interviewers assess technical, analytical, and communication skills in real-time.

Could you let us know a suitable time for a quick video meeting this week?

Best regards,
HireIQ Demo Team`
                        );
                      } else {
                        setEmailBody(
`Hi ${selectedReq.first_name || 'there'},

Thank you for contacting us regarding "${selectedReq.message || 'your inquiry'}".

We'd be glad to discuss your hiring requirements and assist with any questions you may have.

Best regards,
HireIQ Team`
                        );
                      }
                    }}
                    className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded border border-indigo-100 cursor-pointer transition-colors"
                  >
                    Load Standard Template
                  </button>
                </div>
                <textarea
                  required
                  rows={8}
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  placeholder="Type your message to the client..."
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800 outline-none focus:border-indigo-500 focus:bg-white font-sans leading-relaxed transition-all"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEmailModalOpen(false)}
                  disabled={sendingEmail}
                  className="px-5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 font-semibold text-sm cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sendingEmail}
                  className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-white font-bold text-sm shadow-md cursor-pointer disabled:opacity-50 transition-all border-none ${
                    activeTab === 'demos' ? 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-200' : 'bg-cyan-600 hover:bg-cyan-500 shadow-cyan-200'
                  }`}
                >
                  {sendingEmail ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Sending Email...</span>
                    </>
                  ) : (
                    <>
                      <Send size={15} />
                      <span>Send Email</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

