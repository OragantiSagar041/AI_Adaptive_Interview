import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import {
  X, Sparkles, Trophy, GitCompare, ShieldCheck, AlertTriangle,
  Search, CheckCircle2, ChevronRight, User, ExternalLink,
  SlidersHorizontal, Check, RefreshCw, Zap, ArrowRight, Layers,
  Award, ThumbsUp, Eye, FileText, Clock
} from 'lucide-react';
import Button from '../Button';

// Safe Alert Parser - Extracts exact breakdown of Tab Switches, Face Alerts, and Audio Alerts
const getAlertBreakdown = (c) => {
  const violationsList = c.violations || c.alerts || [];
  const tabTypes = ['tab_switch', 'screen_casting', 'screen_share_detected', 'screen_recording', 'screenshare_stopped', 'multiple_displays', 'multi_monitor', 'fullscreen_exit', 'window_blur'];
  const noiseTypes = ['noise_alert', 'background_noise', 'noise'];

  let tabSwitches = Number(c.integrity?.total_tab_switches || 0);
  let faceAlerts = Number(c.integrity?.total_face_alerts || 0);
  let noiseAlerts = Number(c.integrity?.total_noise_alerts || 0);

  if (violationsList.length > 0) {
    const screenCount = violationsList.filter(v => tabTypes.includes(v.type || v.violation_type)).length;
    const noiseCount = violationsList.filter(v => noiseTypes.includes(v.type || v.violation_type)).length;
    const trueFaceCount = violationsList.filter(v => !tabTypes.includes(v.type || v.violation_type) && !noiseTypes.includes(v.type || v.violation_type)).length;

    if (screenCount > 0) tabSwitches = Math.max(tabSwitches, screenCount);
    if (trueFaceCount > 0) faceAlerts = Math.max(faceAlerts, trueFaceCount);
    if (noiseCount > 0) noiseAlerts = Math.max(noi  seAlerts, noiseCount);
  }

  // Fallback to top-level fields
  if (tabSwitches === 0 && c.tab_switches) tabSwitches = Number(c.tab_switches) || 0;
  if (faceAlerts === 0 && c.face_alerts) faceAlerts = Number(c.face_alerts) || 0;
  if (noiseAlerts === 0 && c.noise_alerts) noiseAlerts = Number(c.noise_alerts) || 0;

  // Single number alert fallback
  if (tabSwitches === 0 && faceAlerts === 0 && noiseAlerts === 0 && c.proctoring_alerts) {
    const parsed = parseInt(c.proctoring_alerts, 10);
    if (!isNaN(parsed) && parsed > 0) {
      tabSwitches = parsed; // default to tab switches
    }
  }

  const total = tabSwitches + faceAlerts + noiseAlerts;
  return {
    tabSwitches: isNaN(tabSwitches) ? 0 : tabSwitches,
    faceAlerts: isNaN(faceAlerts) ? 0 : faceAlerts,
    noiseAlerts: isNaN(noiseAlerts) ? 0 : noiseAlerts,
    total: isNaN(total) ? 0 : total
  };
};

// Compute Comprehensive Composite Fit Score
// Balances Interview Score (35%), Technical Score (40%), and ATS Resume Match (25%)
const computeCompositeScore = (c) => {
  const interviewScore = parseFloat(c.score ?? c.avg_score ?? 0);
  const techScore = parseFloat(c.skills_score ?? c.scores?.technical_skills ?? (interviewScore > 0 ? interviewScore : 0));
  const atsScore = parseFloat(c.ats_match_percentage ?? c.ats_score ?? 0);

  if (atsScore === 0) {
    const blended = (interviewScore * 0.5) + (techScore * 0.5);
    return Math.round(blended * 10) / 10;
  }

  const composite = (interviewScore * 0.35) + (techScore * 0.40) + (atsScore * 0.25);
  return Math.round(composite * 10) / 10;
};

// Score Badge Helper
const getScorePill = (score, status) => {
  const num = parseFloat(score || 0);
  const st = (status || '').toLowerCase();

  if (st === 'pending' || (num === 0 && st !== 'completed')) {
    return {
      bg: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-300 dark:border-slate-700',
      label: 'Pending',
      text: '0%'
    };
  }
  if (num >= 75) {
    return {
      bg: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30',
      label: 'Strong Hire',
      text: `${num}%`
    };
  }
  if (num >= 60) {
    return {
      bg: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border border-blue-500/30',
      label: 'Recommended',
      text: `${num}%`
    };
  }
  if (num >= 45) {
    return {
      bg: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30',
      label: 'Consider',
      text: `${num}%`
    };
  }
  return {
    bg: 'bg-rose-500/15 text-rose-700 dark:text-rose-400 border border-rose-500/30',
    label: num > 0 ? 'Under Review' : 'Incomplete',
    text: `${num}%`
  };
};

export default function CandidateComparisonModal({
  isOpen,
  onClose,
  candidates = [],
  preselectedIds = [],
  API_BASE_URL,
  token,
  onSelectCandidate
}) {
  const [activeMode, setActiveMode] = useState('grid'); // 'grid' or 'versus'
  const [rankingMode, setRankingMode] = useState('composite'); // 'composite', 'tech', 'ats', 'interview'
  const [selectedIds, setSelectedIds] = useState([]);
  const [detailedCandidates, setDetailedCandidates] = useState({});
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Versus mode candidate selections
  const [versusIdA, setVersusIdA] = useState('');
  const [versusIdB, setVersusIdB] = useState('');

  // Initialize selected candidate IDs
  useEffect(() => {
    if (preselectedIds && preselectedIds.length > 0) {
      setSelectedIds(preselectedIds);
      if (preselectedIds.length >= 2) {
        setVersusIdA(preselectedIds[0]);
        setVersusIdB(preselectedIds[1]);
      }
    } else if (candidates.length > 0) {
      const allIds = candidates.map(c => c.link_id || c.id);
      setSelectedIds(allIds);
      if (allIds.length >= 2) {
        setVersusIdA(allIds[0]);
        setVersusIdB(allIds[1]);
      }
    }
  }, [preselectedIds, candidates]);

  // Fetch full details for candidates in background
  useEffect(() => {
    if (!isOpen || selectedIds.length === 0 || !API_BASE_URL || !token) return;

    const idsToFetch = selectedIds.filter(id => !detailedCandidates[id] && !id.startsWith('ai_call_omni_'));
    if (idsToFetch.length === 0) return;

    setLoadingDetails(true);
    Promise.allSettled(
      idsToFetch.map(id =>
        axios.get(`${API_BASE_URL}/admin/interview/${id}`, {
          headers: { Authorization: `Bearer ${token}` }
        }).then(r => ({ id, data: r.data }))
      )
    ).then(results => {
      const newDetails = {};
      results.forEach(res => {
        if (res.status === 'fulfilled' && res.value?.data) {
          newDetails[res.value.id] = res.value.data;
        }
      });
      setDetailedCandidates(prev => ({ ...prev, ...newDetails }));
    }).finally(() => {
      setLoadingDetails(false);
    });
  }, [isOpen, selectedIds, API_BASE_URL, token]);

  if (!isOpen) return null;

  // Check if string is a failed error text from backend
  const isInvalidSummary = (text) => {
    if (!text) return true;
    const t = text.trim().toLowerCase();
    return (
      t.includes('summary generation failed') ||
      t.includes('review individual scores') ||
      t.includes('no summary available') ||
      t === 'n/a' ||
      t.length < 5
    );
  };

  // Merge candidate data and attach composite score
  const candidateList = selectedIds.map(id => {
    const basic = candidates.find(c => (c.link_id || c.id) === id) || {};
    const detailed = detailedCandidates[id] || {};
    const merged = { ...basic, ...detailed, id };
    const compScore = computeCompositeScore(merged);
    return { ...merged, compositeScore: compScore };
  });

  // Extract clean, intelligent strengths (Never showing raw system errors)
  const getStrengths = (c) => {
    if (!isInvalidSummary(c.strengths_summary)) {
      return c.strengths_summary.trim();
    }
    if (!isInvalidSummary(c.summary) && c.summary.length > 10) {
      return c.summary.trim();
    }
    const tech = parseFloat(c.skills_score ?? c.scores?.technical_skills ?? 0);
    const comm = parseFloat(c.communication_score ?? c.scores?.communication ?? 0);
    const ats = parseFloat(c.ats_match_percentage ?? c.ats_score ?? 0);

    if (tech >= 75) {
      return `Outstanding technical competency (${tech}/100) demonstrated across core evaluation tasks.`;
    }
    if (ats >= 80) {
      return `High resume match (${ats}%) with direct alignment to role requirements and technology stack.`;
    }
    if (comm >= 65) {
      return `Clear, articulate communication and structured problem explanation during the session.`;
    }
    if (Array.isArray(c.matched_skills) && c.matched_skills.length > 0) {
      return `Verified domain skills: ${c.matched_skills.slice(0, 4).join(', ')}.`;
    }
    if (c.experience && c.experience !== 'N/A') {
      return `Experienced background with ${c.experience} in ${c.interview_title || 'target discipline'}.`;
    }
    const score = parseFloat(c.score ?? c.avg_score ?? 0);
    if (score > 50) {
      return `Consistent performance with an interview score of ${score}%.`;
    }
    return 'Candidate participated in interview screening; review question breakdown for topic details.';
  };

  // Extract clean, intelligent weaknesses (Never showing raw system errors)
  const getWeaknesses = (c) => {
    if (!isInvalidSummary(c.weaknesses_summary)) {
      return c.weaknesses_summary.trim();
    }
    const ats = parseFloat(c.ats_match_percentage ?? c.ats_score ?? 0);
    const tech = parseFloat(c.skills_score ?? c.scores?.technical_skills ?? 0);
    const comm = parseFloat(c.communication_score ?? c.scores?.communication ?? 0);

    if (ats === 0) {
      return 'Resume has 0% direct keyword match with the job description; verify core stack prerequisites.';
    }
    if (comm > 0 && comm < 50) {
      return `Communication clarity scored ${comm}/100; several answers were overly brief or fragmented.`;
    }
    if (tech > 0 && tech < 60) {
      return `Technical problem-solving scored ${tech}/100; needs further depth in complex system questions.`;
    }
    if (Array.isArray(c.missing_skills) && c.missing_skills.length > 0) {
      return `Missing key job criteria: ${c.missing_skills.slice(0, 3).join(', ')}.`;
    }
    if (c.rejection_reason && !isInvalidSummary(c.rejection_reason)) {
      return c.rejection_reason.trim();
    }
    return 'Could elaborate with deeper architectural context and end-to-end edge case coverage.';
  };

  // Sort candidates based on selected ranking mode
  const rankedCandidates = candidateList
    .filter(c => {
      const q = searchQuery.toLowerCase();
      return (c.candidate_name || '').toLowerCase().includes(q) ||
             (c.candidate_email || '').toLowerCase().includes(q) ||
             (c.interview_title || '').toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (rankingMode === 'composite') {
        return b.compositeScore - a.compositeScore;
      }
      if (rankingMode === 'tech') {
        const aTech = parseFloat(a.skills_score ?? a.scores?.technical_skills ?? 0);
        const bTech = parseFloat(b.skills_score ?? b.scores?.technical_skills ?? 0);
        return bTech - aTech;
      }
      if (rankingMode === 'ats') {
        const aAts = parseFloat(a.ats_match_percentage ?? a.ats_score ?? 0);
        const bAts = parseFloat(b.ats_match_percentage ?? b.ats_score ?? 0);
        return bAts - aAts;
      }
      if (rankingMode === 'interview') {
        const aScore = parseFloat(a.score ?? a.avg_score ?? 0);
        const bScore = parseFloat(b.score ?? b.avg_score ?? 0);
        return bScore - aScore;
      }
      return 0;
    });

  // Top Highlights
  const topCandidate = rankedCandidates.length > 0 ? rankedCandidates[0] : null;
  const bestTechCandidate = [...rankedCandidates].sort((a, b) => {
    const aT = parseFloat(a.skills_score ?? a.scores?.technical_skills ?? 0);
    const bT = parseFloat(b.skills_score ?? b.scores?.technical_skills ?? 0);
    return bT - aT;
  })[0];
  const bestAtsCandidate = [...rankedCandidates].sort((a, b) => {
    const aA = parseFloat(a.ats_match_percentage ?? a.ats_score ?? 0);
    const bA = parseFloat(b.ats_match_percentage ?? b.ats_score ?? 0);
    return bA - aA;
  })[0];

  // Versus mode candidates
  const candA = candidateList.find(c => c.id === versusIdA) || rankedCandidates[0] || {};
  const candB = candidateList.find(c => c.id === versusIdB) || (rankedCandidates[1] && rankedCandidates[1].id !== candA.id ? rankedCandidates[1] : rankedCandidates[0]) || {};

  const handleLaunchVersus = (id) => {
    setVersusIdA(topCandidate?.id !== id ? topCandidate?.id : rankedCandidates[1]?.id || id);
    setVersusIdB(id);
    setActiveMode('versus');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-5 overflow-hidden">
      <div className="relative w-full max-w-6xl h-[92vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl flex flex-col border border-slate-200 dark:border-slate-800 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* ============================================================== */}
        {/* TOP HEADER BAR                                                 */}
        {/* ============================================================== */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/70 gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
              <GitCompare size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Candidate Comparison Intelligence
                </h2>
                <span className="text-[11px] font-bold bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 px-2.5 py-0.5 rounded-full">
                  {rankedCandidates.length} Selected
                </span>
                {loadingDetails && (
                  <span className="text-[11px] text-indigo-600 flex items-center gap-1 ml-2">
                    <RefreshCw size={11} className="animate-spin" /> Analyzing scorecards...
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Multi-factor candidate ranking, detailed integrity tracking, and final hiring decision.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View Mode Switcher */}
            <div className="flex bg-slate-200/80 dark:bg-slate-800 p-0.5 rounded-lg text-xs font-semibold">
              <button
                onClick={() => setActiveMode('grid')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${
                  activeMode === 'grid'
                    ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <Layers size={14} />
                <span>All Candidates ({rankedCandidates.length})</span>
              </button>
              <button
                onClick={() => setActiveMode('versus')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all ${
                  activeMode === 'versus'
                    ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <GitCompare size={14} />
                <span>Side-by-Side Matchup</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg ml-2"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* ============================================================== */}
        {/* INTELLIGENT RANKING CRITERIA & SUMMARY TOOLBAR                 */}
        {/* ============================================================== */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-2.5 bg-indigo-50/40 dark:bg-indigo-950/20 border-b border-indigo-100 dark:border-indigo-950/40 text-xs shrink-0">
          
          {/* Key Leader Highlights */}
          <div className="flex flex-wrap items-center gap-4">
            {topCandidate && (
              <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                <span className="text-amber-500 font-bold flex items-center gap-1">
                  <Trophy size={14} /> Leader:
                </span>
                <strong className="text-slate-900 dark:text-white">{topCandidate.candidate_name || 'Candidate'}</strong>
                <span className="text-indigo-600 font-bold">({topCandidate.compositeScore}% Fit)</span>
              </div>
            )}

            {bestTechCandidate && parseFloat(bestTechCandidate.skills_score ?? bestTechCandidate.scores?.technical_skills ?? 0) > 0 && (
              <div className="hidden sm:flex items-center gap-1.5 text-slate-700 dark:text-slate-300 border-l pl-4 border-slate-300 dark:border-slate-700">
                <span className="text-indigo-600 font-bold">💻 Best Tech:</span>
                <span>{bestTechCandidate.candidate_name} ({bestTechCandidate.skills_score ?? bestTechCandidate.scores?.technical_skills}/100)</span>
              </div>
            )}

            {bestAtsCandidate && parseFloat(bestAtsCandidate.ats_match_percentage ?? bestAtsCandidate.ats_score ?? 0) > 0 && (
              <div className="hidden md:flex items-center gap-1.5 text-slate-700 dark:text-slate-300 border-l pl-4 border-slate-300 dark:border-slate-700">
                <span className="text-emerald-600 font-bold">📄 Top Resume Fit:</span>
                <span>{bestAtsCandidate.candidate_name} ({bestAtsCandidate.ats_match_percentage ?? bestAtsCandidate.ats_score}%)</span>
              </div>
            )}
          </div>

          {/* Ranking Mode Selector + Search */}
          <div className="flex items-center gap-3 ml-auto">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 font-semibold text-[11px]">Rank By:</span>
              <select
                value={rankingMode}
                onChange={(e) => setRankingMode(e.target.value)}
                className="py-1 px-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md font-bold text-xs text-indigo-600 focus:outline-hidden"
              >
                <option value="composite">⭐ Overall Fit (Interview + Tech + ATS)</option>
                <option value="tech">💻 Technical Skills Score</option>
                <option value="ats">📄 ATS Resume Match %</option>
                <option value="interview">🎙️ Raw Interview Score Only</option>
              </select>
            </div>

            {activeMode === 'grid' && (
              <div className="relative w-40 sm:w-48">
                <Search className="absolute left-2.5 top-2 text-slate-400" size={12} />
                <input
                  type="text"
                  placeholder="Filter name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-7 pr-2.5 py-1 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md focus:outline-hidden"
                />
              </div>
            )}
          </div>
        </div>

        {/* ============================================================== */}
        {/* VIEW 1: CLEAN PROFILE CARDS                                    */}
        {/* ============================================================== */}
        {activeMode === 'grid' && (
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 bg-slate-50/60 dark:bg-slate-900/40">
            {rankedCandidates.length === 0 ? (
              <div className="py-20 text-center text-slate-500">
                No candidates found.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {rankedCandidates.map((c, idx) => {
                  const id = c.id || c.link_id;
                  const interviewScore = parseFloat(c.score ?? c.avg_score ?? 0);
                  const ats = parseFloat(c.ats_match_percentage ?? c.ats_score ?? 0);
                  const tech = parseFloat(c.skills_score ?? c.scores?.technical_skills ?? 0);
                  const comm = parseFloat(c.communication_score ?? c.scores?.communication ?? 0);
                  const alertsInfo = getAlertBreakdown(c);
                  const isTop = idx === 0;
                  const pill = getScorePill(c.compositeScore, c.status);
                  const strengthsText = getStrengths(c);
                  const weaknessesText = getWeaknesses(c);

                  // Differentiator tags
                  const isTechLeader = bestTechCandidate && bestTechCandidate.id === id && tech > 60;
                  const isAtsLeader = bestAtsCandidate && bestAtsCandidate.id === id && ats > 70;
                  const hasAtsZero = ats === 0;
                  const isImmediate = (c.notice_period || '').toLowerCase().includes('immediate');

                  return (
                    <div
                      key={id || idx}
                      className={`relative bg-white dark:bg-slate-800 rounded-2xl border p-5 shadow-xs flex flex-col justify-between transition-all hover:shadow-md ${
                        isTop
                          ? 'border-amber-400/90 ring-1 ring-amber-400/30'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {/* Top Rank Badge */}
                      {isTop && (
                        <div className="absolute -top-3 left-4 bg-amber-500 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full shadow-xs flex items-center gap-1">
                          <Trophy size={11} /> #1 TOP FIT
                        </div>
                      )}

                      {/* Header */}
                      <div>
                        <div className="flex items-start justify-between gap-2 mt-1">
                          <div className="min-w-0 flex-1">
                            <span className="text-[11px] font-bold text-slate-400">RANK #{idx + 1}</span>
                            <h3 className="font-bold text-slate-900 dark:text-white text-base truncate" title={c.candidate_name}>
                              {c.candidate_name || 'Candidate'}
                            </h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              {c.candidate_email}
                            </p>
                          </div>
                          
                          {/* Composite Fit Gauge */}
                          <div className="text-right shrink-0">
                            <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-black ${pill.bg}`}>
                              {c.compositeScore}% Fit
                            </span>
                            <div className="text-[9.5px] text-slate-400 font-semibold mt-0.5">
                              {pill.label}
                            </div>
                          </div>
                        </div>

                        {/* Special Differentiator Pills */}
                        <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                          {isTechLeader && (
                            <span className="text-[10px] font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded-md border border-indigo-200/50">
                              💻 Tech Leader ({tech}/100)
                            </span>
                          )}
                          {isAtsLeader && (
                            <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-200/50">
                              📄 Perfect ATS ({ats}%)
                            </span>
                          )}
                          {hasAtsZero && (
                            <span className="text-[10px] font-bold text-rose-700 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 px-2 py-0.5 rounded-md border border-rose-200/50">
                              ⚠️ 0% Resume Match
                            </span>
                          )}
                          {isImmediate && (
                            <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-md border border-emerald-200/50">
                              ⚡ Immediate Joiner
                            </span>
                          )}
                          <span className="text-[10px] font-medium text-slate-500 bg-slate-100 dark:bg-slate-700/60 px-2 py-0.5 rounded-md truncate max-w-[130px]">
                            {c.interview_title || c.job_applied || 'Candidate'}
                          </span>
                        </div>

                        {/* Core Metric Grid */}
                        <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/60 text-center">
                          <div className="bg-slate-50 dark:bg-slate-900/50 p-2 rounded-xl">
                            <div className="text-[10px] text-slate-400 font-medium">ATS Match</div>
                            <div className={`text-xs font-bold mt-0.5 ${ats === 0 ? 'text-rose-600' : 'text-slate-800 dark:text-slate-200'}`}>
                              {ats}%
                            </div>
                          </div>
                          <div className="bg-slate-50 dark:bg-slate-900/50 p-2 rounded-xl">
                            <div className="text-[10px] text-slate-400 font-medium">Interview</div>
                            <div className="text-xs font-bold text-indigo-600 mt-0.5">
                              {interviewScore}%
                            </div>
                          </div>
                          <div className="bg-slate-50 dark:bg-slate-900/50 p-2 rounded-xl">
                            <div className="text-[10px] text-slate-400 font-medium">Notice</div>
                            <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-0.5 truncate">
                              {c.notice_period || 'Immediate'}
                            </div>
                          </div>
                        </div>

                        {/* Detailed Sub-Scores & Integrity Breakdown */}
                        <div className="space-y-2 mt-3 pt-2 text-[11px]">
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500 font-medium">Technical Competency</span>
                            <strong className="text-slate-800 dark:text-slate-200">{tech > 0 ? `${tech}/100` : '—'}</strong>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500 font-medium">Communication Skills</span>
                            <strong className="text-slate-800 dark:text-slate-200">{comm > 0 ? `${comm}/100` : '—'}</strong>
                          </div>

                          {/* EXACT INTEGRITY ALERT BREAKDOWN (WHAT ALERTS DID THEY GET) */}
                          <div className="flex items-center justify-between pt-1">
                            <span className="text-slate-500 font-medium">Integrity Audit</span>
                            {alertsInfo.total === 0 ? (
                              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-600 font-semibold bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-200/50">
                                <ShieldCheck size={12} /> Clean (0 Alerts)
                              </span>
                            ) : (
                              <div className="flex flex-wrap items-center gap-1 justify-end">
                                <span className="text-[10px] font-bold text-amber-700 bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-200/50 flex items-center gap-1">
                                  <AlertTriangle size={10} /> {alertsInfo.total} Alerts:
                                </span>
                                {alertsInfo.tabSwitches > 0 && (
                                  <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700/60 px-1.5 py-0.5 rounded" title="Candidate switched tabs or windows">
                                    📑 {alertsInfo.tabSwitches} Tab
                                  </span>
                                )}
                                {alertsInfo.faceAlerts > 0 && (
                                  <span className="text-[10px] font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 px-1.5 py-0.5 rounded" title="Face not visible or multiple faces detected">
                                    👤 {alertsInfo.faceAlerts} Face
                                  </span>
                                )}
                                {alertsInfo.noiseAlerts > 0 && (
                                  <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.5 rounded" title="Secondary background noise or voices detected">
                                    🎙️ {alertsInfo.noiseAlerts} Audio
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Qualitative Strengths & Improvement Areas */}
                        <div className="space-y-2 mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/60">
                          <div className="bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/60 p-2.5 rounded-xl">
                            <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide block mb-0.5">
                              Key Strength
                            </span>
                            <p className="text-xs text-slate-700 dark:text-slate-300 font-medium leading-relaxed">
                              {strengthsText}
                            </p>
                          </div>

                          <div className="bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200/60 p-2.5 rounded-xl">
                            <span className="text-[10px] font-bold text-rose-700 dark:text-rose-400 uppercase tracking-wide block mb-0.5">
                              Area to Improve
                            </span>
                            <p className="text-xs text-slate-700 dark:text-slate-300 font-medium leading-relaxed">
                              {weaknessesText}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Card Actions */}
                      <div className="flex items-center gap-2 mt-5 pt-3 border-t border-slate-100 dark:border-slate-700/60">
                        <button
                          onClick={() => handleLaunchVersus(id)}
                          className="flex-1 py-1.5 px-3 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs rounded-lg transition-colors flex items-center justify-center gap-1"
                          title="Compare side-by-side with another candidate"
                        >
                          <GitCompare size={13} />
                          <span>Compare 1-on-1</span>
                        </button>

                        <button
                          onClick={() => onSelectCandidate && onSelectCandidate(c)}
                          className="flex-1 py-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-lg shadow-2xs transition-colors"
                        >
                          Select / Offer
                        </button>
                      </div>

                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ============================================================== */}
        {/* VIEW 2: 1-ON-1 HEAD-TO-HEAD SHOWDOWN                          */}
        {/* Clear category winners and AI hiring recommendation verdict    */}
        {/* ============================================================== */}
        {activeMode === 'versus' && (
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 bg-slate-50/60 dark:bg-slate-900/40">
            <div className="max-w-4xl mx-auto space-y-6">
              
              {/* Candidate Dropdown Pickers */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xs">
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase block mb-1.5">Candidate 1</label>
                  <select
                    value={candA.id || ''}
                    onChange={(e) => setVersusIdA(e.target.value)}
                    className="w-full py-2 px-3 text-sm font-semibold bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                  >
                    {rankedCandidates.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.candidate_name} ({c.compositeScore}% Fit · Tech: {c.skills_score ?? c.scores?.technical_skills ?? 0})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase block mb-1.5">Candidate 2</label>
                  <select
                    value={candB.id || ''}
                    onChange={(e) => setVersusIdB(e.target.value)}
                    className="w-full py-2 px-3 text-sm font-semibold bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl"
                  >
                    {rankedCandidates.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.candidate_name} ({c.compositeScore}% Fit · Tech: {c.skills_score ?? c.scores?.technical_skills ?? 0})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* AI Head-to-Head Hiring Verdict Banner */}
              {(() => {
                const aTech = parseFloat(candA.skills_score ?? candA.scores?.technical_skills ?? 0);
                const bTech = parseFloat(candB.skills_score ?? candB.scores?.technical_skills ?? 0);
                const aAts = parseFloat(candA.ats_match_percentage ?? candA.ats_score ?? 0);
                const bAts = parseFloat(candB.ats_match_percentage ?? candB.ats_score ?? 0);
                const aName = candA.candidate_name || 'Candidate 1';
                const bName = candB.candidate_name || 'Candidate 2';

                let winnerName = aName;
                let reason = '';

                if (candA.compositeScore > candB.compositeScore) {
                  winnerName = aName;
                  reason = `${aName} leads with a ${candA.compositeScore}% overall fit score. ${aTech > bTech ? `Demonstrated superior technical ability (${aTech}/100 vs ${bTech}/100).` : `Has higher resume match (${aAts}% vs ${bAts}%).`}`;
                } else if (candB.compositeScore > candA.compositeScore) {
                  winnerName = bName;
                  reason = `${bName} leads with a ${candB.compositeScore}% overall fit score. ${bTech > aTech ? `Demonstrated superior technical ability (${bTech}/100 vs ${aTech}/100).` : `Has higher resume match (${bAts}% vs ${aAts}%).`}`;
                } else {
                  winnerName = 'Tied Evaluation';
                  reason = `${aName} and ${bName} have matching overall fit scores. Review specific interview answers to decide.`;
                }

                return (
                  <div className="bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-indigo-500/10 border border-indigo-200 dark:border-indigo-800 p-4 rounded-2xl flex items-start gap-3">
                    <Sparkles className="text-indigo-600 shrink-0 mt-0.5" size={20} />
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white text-sm">
                        AI Head-to-Head Recommendation: <span className="text-indigo-600 dark:text-indigo-400">{winnerName}</span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 leading-relaxed">
                        {reason}
                      </p>
                    </div>
                  </div>
                );
              })()}

              {/* Side-by-Side Matchup Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[candA, candB].map((c, i) => {
                  const other = i === 0 ? candB : candA;
                  const isOverallWinner = c.compositeScore > other.compositeScore;
                  const pill = getScorePill(c.compositeScore, c.status);
                  const ats = parseFloat(c.ats_match_percentage ?? c.ats_score ?? 0);
                  const otherAts = parseFloat(other.ats_match_percentage ?? other.ats_score ?? 0);
                  const tech = parseFloat(c.skills_score ?? c.scores?.technical_skills ?? 0);
                  const otherTech = parseFloat(other.skills_score ?? other.scores?.technical_skills ?? 0);
                  const comm = parseFloat(c.communication_score ?? c.scores?.communication ?? 0);
                  const otherComm = parseFloat(other.communication_score ?? other.scores?.communication ?? 0);
                  const alertsInfo = getAlertBreakdown(c);

                  return (
                    <div
                      key={c.id || i}
                      className={`bg-white dark:bg-slate-800 rounded-2xl border p-6 shadow-xs flex flex-col justify-between space-y-5 ${
                        isOverallWinner
                          ? 'border-indigo-500/80 ring-2 ring-indigo-500/20'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <div>
                        {isOverallWinner && (
                          <span className="inline-flex items-center gap-1 bg-indigo-600 text-white text-[10px] font-black px-2.5 py-0.5 rounded-full mb-2">
                            <Trophy size={11} /> HIGHER OVERALL MATCH
                          </span>
                        )}
                        <h3 className="font-bold text-slate-900 dark:text-white text-lg">
                          {c.candidate_name || 'Candidate'}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{c.candidate_email}</p>
                        
                        {/* Overall Composite Score Box */}
                        <div className="mt-5 p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 flex items-center justify-between">
                          <div>
                            <span className="text-xs font-semibold text-slate-500">Overall Fit Score</span>
                            <div className="text-2xl font-black text-slate-900 dark:text-white mt-0.5">
                              {c.compositeScore}%
                            </div>
                          </div>
                          <span className={`px-3 py-1 rounded-full text-xs font-bold ${pill.bg}`}>
                            {pill.label}
                          </span>
                        </div>

                        {/* Metric-by-Metric Winner Indicators */}
                        <div className="space-y-3 mt-5 text-sm">
                          {/* Technical Competency */}
                          <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-700">
                            <span className="text-slate-500 text-xs">Technical Competency</span>
                            <div className="flex items-center gap-2">
                              <strong className="text-slate-800 dark:text-slate-200">{tech > 0 ? `${tech}/100` : '—'}</strong>
                              {tech > otherTech && tech > 0 && (
                                <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-1.5 py-0.2 rounded">
                                  WINNER 🏆
                                </span>
                              )}
                            </div>
                          </div>

                          {/* ATS Resume Fit */}
                          <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-700">
                            <span className="text-slate-500 text-xs">ATS Resume Match</span>
                            <div className="flex items-center gap-2">
                              <strong className={ats === 0 ? 'text-rose-600' : 'text-slate-800 dark:text-slate-200'}>
                                {ats}%
                              </strong>
                              {ats > otherAts && ats > 0 && (
                                <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-1.5 py-0.2 rounded">
                                  WINNER 🏆
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Communication */}
                          <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-700">
                            <span className="text-slate-500 text-xs">Communication Skills</span>
                            <div className="flex items-center gap-2">
                              <strong className="text-slate-800 dark:text-slate-200">{comm > 0 ? `${comm}/100` : '—'}</strong>
                              {comm > otherComm && comm > 0 && (
                                <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-1.5 py-0.2 rounded">
                                  WINNER 🏆
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Logistics */}
                          <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-700">
                            <span className="text-slate-500 text-xs">Experience</span>
                            <strong className="text-slate-800 dark:text-slate-200">{c.experience || 'Fresher'}</strong>
                          </div>
                          <div className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-700">
                            <span className="text-slate-500 text-xs">Notice Period</span>
                            <strong className="text-indigo-600">{c.notice_period || 'Immediate'}</strong>
                          </div>

                          {/* DETAILED INTEGRITY AUDIT BREAKDOWN */}
                          <div className="py-2 border-b border-slate-100 dark:border-slate-700">
                            <div className="flex items-center justify-between">
                              <span className="text-slate-500 text-xs">Integrity Audit</span>
                              {alertsInfo.total === 0 ? (
                                <span className="text-emerald-600 font-semibold flex items-center gap-1 text-xs">
                                  <ShieldCheck size={13} /> Clean (0 Alerts)
                                </span>
                              ) : (
                                <span className="text-amber-600 font-bold flex items-center gap-1 text-xs">
                                  <AlertTriangle size={13} /> {alertsInfo.total} Alerts Detected
                                </span>
                              )}
                            </div>
                            {alertsInfo.total > 0 && (
                              <div className="flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/60 p-2 rounded-lg mt-2 justify-between">
                                <span>📑 Tab Switches: <strong>{alertsInfo.tabSwitches}</strong></span>
                                <span>👤 Face Alerts: <strong>{alertsInfo.faceAlerts}</strong></span>
                                <span>🎙️ Audio Noise: <strong>{alertsInfo.noiseAlerts}</strong></span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Qualitative Bullets */}
                        <div className="space-y-2 mt-5">
                          <div className="p-3 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/50 rounded-xl text-xs">
                            <strong className="text-emerald-700 dark:text-emerald-400 block mb-1 font-bold">Key Strength</strong>
                            <p className="text-slate-700 dark:text-slate-300 leading-relaxed">{getStrengths(c)}</p>
                          </div>
                          <div className="p-3 bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200/50 rounded-xl text-xs">
                            <strong className="text-rose-700 dark:text-rose-400 block mb-1 font-bold">Growth Area</strong>
                            <p className="text-slate-700 dark:text-slate-300 leading-relaxed">{getWeaknesses(c)}</p>
                          </div>
                        </div>
                      </div>

                      {/* Select Action */}
                      <button
                        onClick={() => onSelectCandidate && onSelectCandidate(c)}
                        className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors"
                      >
                        Select & Make Offer
                      </button>

                    </div>
                  );
                })}
              </div>

            </div>
          </div>
        )}

        {/* ============================================================== */}
        {/* FOOTER BAR                                                     */}
        {/* ============================================================== */}
        <div className="px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/80 flex items-center justify-between text-xs text-slate-400 shrink-0">
          <span>HireIQ Decision Intelligence · Multi-Factor Evaluation</span>
          <button
            onClick={onClose}
            className="text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-slate-900"
          >
            Close Comparison
          </button>
        </div>

      </div>
    </div>
  );
}
