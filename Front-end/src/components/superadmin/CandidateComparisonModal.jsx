import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  X, Check, AlertCircle, Briefcase, MapPin, Calendar, User, Eye,
  ArrowUpDown, GitCompare, Sparkles, Building2, Award, Clock, GraduationCap,
  ChevronRight, ChevronLeft, ExternalLink, Filter, CheckCircle2, ChevronDown, ChevronUp,
  Scale, ArrowRight, ArrowLeft, HelpCircle, FileText, Info, TrendingUp
} from 'lucide-react';
import {
  evaluateCandidateMatch,
  getMatchCategory,
  formatCandidateId,
  parseExperienceYears,
  deduplicateCandidatesForComparison,
  evaluateTiedGroupRecommendation
} from '../../utils/candidateMatcher';

// Formats candidate attribute values with fallback to "Not available" when missing
function displayValue(val) {
  if (!val || val === 'Not specified' || val === '—' || String(val).trim() === '') {
    return 'Not available';
  }
  return val;
}

// Analyzes skill differences for a candidate relative to other tied peers
function getSkillDifferences(candItem, allTiedItems) {
  const otherTiedItems = allTiedItems.filter(
    other => (other.candidateId || other.candidate._id || other.candidate.id) !== (candItem.candidateId || candItem.candidate._id || candItem.candidate.id)
  );

  if (otherTiedItems.length === 0) {
    return { uniqueMatched: [], advantageMatched: [], peerPossessedGaps: [] };
  }

  const myMatched = candItem.skillsAlignment?.matchedSkills || [];
  const myMissing = candItem.skillsAlignment?.missingSkills || [];

  // Skills this candidate matched that NO other tied peer matched (unique advantage)
  const uniqueMatched = myMatched.filter(skill => {
    const norm = skill.toLowerCase().trim();
    return otherTiedItems.every(other => !(other.skillsAlignment?.matchedSkills || []).some(s => s.toLowerCase().trim() === norm));
  });

  // Skills this candidate matched that at least one other tied peer missed (peer advantage)
  const advantageMatched = myMatched.filter(skill => {
    const norm = skill.toLowerCase().trim();
    return otherTiedItems.some(other => (other.skillsAlignment?.missingSkills || []).some(s => s.toLowerCase().trim() === norm));
  });

  // Skills this candidate is missing that at least one other tied peer possesses (gap)
  const peerPossessedGaps = myMissing.filter(skill => {
    const norm = skill.toLowerCase().trim();
    return otherTiedItems.some(other => (other.skillsAlignment?.matchedSkills || []).some(s => s.toLowerCase().trim() === norm));
  });

  return {
    uniqueMatched,
    advantageMatched,
    peerPossessedGaps,
  };
}

// Compares a metric across tied candidates (highest, lowest, equal)
function getMetricComparison(metricKey, candItem, allTiedItems) {
  const values = allTiedItems.map(item => item.breakdown[metricKey] || 0);
  const myVal = candItem.breakdown[metricKey] || 0;
  const maxVal = Math.max(...values);
  const minVal = Math.min(...values);

  if (maxVal === minVal) {
    return { status: 'equal', diff: 0, text: 'Equal' };
  }
  if (myVal === maxVal) {
    const diff = myVal - minVal;
    return { status: 'highest', diff, text: `Higher (+${diff}%)` };
  }
  if (myVal === minVal) {
    const diff = maxVal - myVal;
    return { status: 'lowest', diff, text: `Lower (-${diff}%)` };
  }
  return { status: 'mid', diff: 0, text: 'Mid-range' };
}

// Compares numeric experience years across tied candidates
function getExpComparison(candItem, allTiedItems) {
  const expValues = allTiedItems.map(item => parseExperienceYears(item.experience));
  const myExp = parseExperienceYears(candItem.experience);
  const maxExp = Math.max(...expValues);
  const minExp = Math.min(...expValues);

  if (maxExp === minExp) {
    return { status: 'equal', diff: 0, text: 'Equal Experience' };
  }
  if (myExp === maxExp) {
    const diff = Math.round((myExp - minExp) * 10) / 10;
    return { status: 'highest', diff, text: `+${diff} yr${diff !== 1 ? 's' : ''} more` };
  }
  if (myExp === minExp) {
    const diff = Math.round((maxExp - myExp) * 10) / 10;
    return { status: 'lowest', diff, text: `-${diff} yr${diff !== 1 ? 's' : ''} less` };
  }
  return { status: 'mid', diff: 0, text: 'Mid-range' };
}

// Generates key differentiators and factual trade-offs for each tied candidate from resume data
function getCandidateDifferentiators(candItem, allTiedItems, job) {
  const skillDiffs = getSkillDifferences(candItem, allTiedItems);
  const skillsComp = getMetricComparison('skillsScore', candItem, allTiedItems);
  const expComp = getExpComparison(candItem, allTiedItems);
  const roleComp = getMetricComparison('roleScore', candItem, allTiedItems);

  const advantages = [];
  const considerations = [];

  // Skills advantages based on resume evidence
  if (skillDiffs.uniqueMatched.length > 0) {
    advantages.push(`Only candidate with resume matching: ${skillDiffs.uniqueMatched.join(', ')}`);
  } else if (skillDiffs.advantageMatched.length > 0) {
    advantages.push(`Resume matches ${skillDiffs.advantageMatched.join(', ')} (missed by peer)`);
  }

  if (skillsComp.status === 'highest') {
    advantages.push(`Higher mandatory skills alignment (${candItem.breakdown.skillsScore}% vs lowest ${Math.min(...allTiedItems.map(c => c.breakdown.skillsScore))}%)`);
  }

  // Preferred skills advantage
  if (candItem.skillsAlignment?.matchedPreferredSkills?.length > 0) {
    advantages.push(`Matches ${candItem.skillsAlignment.matchedPreferredSkills.length} preferred skill(s): ${candItem.skillsAlignment.matchedPreferredSkills.join(', ')}`);
  }

  // Experience advantages/gaps
  if (expComp.status === 'highest') {
    advantages.push(`More experience indicated in resume (${candItem.experience})`);
  } else if (expComp.status === 'lowest') {
    considerations.push(`Less experience indicated in resume (${candItem.experience})`);
  }

  // Role score advantages/gaps
  if (roleComp.status === 'highest') {
    advantages.push(`Stronger keyword & responsibility alignment with JD (${candItem.breakdown.roleScore}%)`);
  } else if (roleComp.status === 'lowest') {
    considerations.push(`Lower keyword alignment with JD responsibilities (${candItem.breakdown.roleScore}%)`);
  }

  // Skills gaps
  if (skillDiffs.peerPossessedGaps.length > 0) {
    considerations.push(`Missing mandatory skill(s): ${skillDiffs.peerPossessedGaps.join(', ')} (matched by peer)`);
  }

  // Supplementary skills
  if (candItem.skillsAlignment?.additionalSkills?.length > 0) {
    advantages.push(`${candItem.skillsAlignment.additionalSkills.length} supplementary skill(s) found in resume`);
  }

  if (advantages.length === 0) {
    advantages.push('Equivalent core qualification profile in resume');
  }
  if (considerations.length === 0) {
    considerations.push('No significant requirement deficit found in resume');
  }

  return { advantages, considerations };
}

const DEFAULT_EMPTY_SET = new Set();

export default function CandidateComparisonModal({
  isOpen,
  onClose,
  job,
  candidates = [],
  selectedCandidateIds = DEFAULT_EMPTY_SET,
  onViewDetails,
  onScheduleInterview,
}) {
  // Sort state: 'score_desc' (default), 'score_asc', 'name_asc', 'exp_desc'
  const [sortBy, setSortBy] = useState('score_desc');
  // Pagination state: maximum 10 candidates per page in selection row
  const [page, setPage] = useState(1);
  const pageSize = 10;

  // Deduplicate candidates strictly by normalized resume content fingerprint
  // Guarantees each unique resume appears only once in comparison results
  const uniqueCandidates = useMemo(() => {
    return deduplicateCandidatesForComparison(candidates, job);
  }, [candidates, job]);

  // Candidate filter state: set of IDs currently visible in the comparison
  const [activeCandidateIds, setActiveCandidateIds] = useState(() => {
    if (selectedCandidateIds && selectedCandidateIds.size > 0) {
      return new Set(selectedCandidateIds);
    }
    const deduped = deduplicateCandidatesForComparison(candidates, job);
    return new Set(deduped.slice(0, 6).map(c => c._id || c.id));
  });

  // Dedicated Tied Candidates Comparison View active state
  const [isTiedViewOpen, setIsTiedViewOpen] = useState(false);
  // Collapsed by default: Equal Resume Match Scores Detected section toggle state
  const [isTiedScoresExpanded, setIsTiedScoresExpanded] = useState(false);
  // Active tied group score for dedicated comparison section
  const [activeTiedScore, setActiveTiedScore] = useState(null);
  // Set of candidate IDs selected for the dedicated tied comparison table
  const [tiedSelectedCandidateIds, setTiedSelectedCandidateIds] = useState(new Set());

  const jobId = job?.job_id || job?._id;

  // Reset tied view & collapse tied-score groups when modal opens/closes or job changes
  React.useEffect(() => {
    setIsTiedViewOpen(false);
    setActiveTiedScore(null);
    setTiedSelectedCandidateIds(new Set());
    setIsTiedScoresExpanded(false);
  }, [jobId, isOpen]);

  // Keep activeCandidateIds synced when modal opens or job changes
  React.useEffect(() => {
    if (selectedCandidateIds && selectedCandidateIds.size > 0) {
      setActiveCandidateIds(new Set(selectedCandidateIds));
    } else if (uniqueCandidates && uniqueCandidates.length > 0) {
      setActiveCandidateIds(new Set(uniqueCandidates.slice(0, 6).map(c => c._id || c.id)));
    } else {
      setActiveCandidateIds(new Set());
    }
  }, [jobId, isOpen, uniqueCandidates]);

  // Evaluate candidate match data strictly from unique resumes against job requirements
  const evaluatedAll = useMemo(() => {
    return uniqueCandidates.map(c => evaluateCandidateMatch(c, job));
  }, [uniqueCandidates, job]);

  // Sort all evaluated candidates globally across the entire candidate pool
  const sortedEvaluatedAll = useMemo(() => {
    return [...evaluatedAll].sort((a, b) => {
      const aScore = a.overallScore !== null ? a.overallScore : -1;
      const bScore = b.overallScore !== null ? b.overallScore : -1;

      if (sortBy === 'score_desc') {
        if (bScore !== aScore) return bScore - aScore;
        return (a.name || '').localeCompare(b.name || '');
      }
      if (sortBy === 'score_asc') {
        if (aScore !== bScore) return aScore - bScore;
        return (a.name || '').localeCompare(b.name || '');
      }
      if (sortBy === 'name_asc') {
        return (a.name || '').localeCompare(b.name || '');
      }
      if (sortBy === 'exp_desc') {
        return (b.breakdown?.experienceScore || 0) - (a.breakdown?.experienceScore || 0);
      }
      return 0;
    });
  }, [evaluatedAll, sortBy]);

  // Reset pagination to page 1 whenever user changes sort order or job
  React.useEffect(() => {
    setPage(1);
  }, [sortBy, job?.job_id || job?._id]);

  const totalCandidates = sortedEvaluatedAll.length;
  const totalPages = Math.max(1, Math.ceil(totalCandidates / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);

  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalCandidates);

  // Current page candidate slice (max 10 candidates per page)
  const paginatedCandidates = useMemo(() => {
    return sortedEvaluatedAll.slice(startIndex, endIndex);
  }, [sortedEvaluatedAll, startIndex, endIndex]);

  // Helper to determine if a candidate (or any of its merged duplicate IDs) is active
  const isCandidateActive = useCallback((item) => {
    if (!item) return false;
    const cand = item.candidate || item;
    const primaryId = cand._id || cand.id;
    if (primaryId && activeCandidateIds.has(primaryId)) return true;
    if (item.candidateId && activeCandidateIds.has(item.candidateId)) return true;
    if (cand.associatedCandidateIds && Array.isArray(cand.associatedCandidateIds)) {
      return cand.associatedCandidateIds.some(aid => activeCandidateIds.has(aid));
    }
    return false;
  }, [activeCandidateIds]);

  // Filter and sort candidates to compare (preserves selected candidates across pagination)
  const comparedList = useMemo(() => {
    return sortedEvaluatedAll.filter(item => isCandidateActive(item));
  }, [sortedEvaluatedAll, isCandidateActive]);

  // Horizontal scroll ref and navigation states for candidate cards row
  const cardsScrollRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Synchronize scroll button states (disabled at beginning and end)
  const updateCardScrollButtons = useCallback(() => {
    const el = cardsScrollRef.current;
    if (!el) {
      setCanScrollLeft(false);
      setCanScrollRight(false);
      return;
    }
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const maxScroll = scrollWidth - clientWidth;

    // Can scroll left if we have scrolled past start (> 5px)
    setCanScrollLeft(scrollLeft > 5);
    // Can scroll right if there is overflow and we have not reached the end
    setCanScrollRight(maxScroll > 5 && scrollLeft < maxScroll - 5);
  }, []);

  // Smoothly scroll horizontally by approximately one candidate card width + gap (~360px)
  const scrollCardsLeft = useCallback(() => {
    const el = cardsScrollRef.current;
    if (!el) return;
    el.scrollBy({ left: -360, behavior: 'smooth' });
  }, []);

  const scrollCardsRight = useCallback(() => {
    const el = cardsScrollRef.current;
    if (!el) return;
    el.scrollBy({ left: 360, behavior: 'smooth' });
  }, []);

  // Listen for scroll, window resize, wheel, and candidate count updates
  useEffect(() => {
    const el = cardsScrollRef.current;
    if (!el) return;

    // Immediately check bounds and schedule follow-up check after layout settle
    updateCardScrollButtons();
    const timer = setTimeout(updateCardScrollButtons, 150);

    const handleScroll = () => {
      updateCardScrollButtons();
    };
    el.addEventListener('scroll', handleScroll, { passive: true });

    const handleResize = () => {
      updateCardScrollButtons();
    };
    window.addEventListener('resize', handleResize);

    // Mouse wheel handler: allows vertical wheel to scroll candidate cards horizontally when hovering over them
    const handleWheel = (e) => {
      if (el.scrollWidth <= el.clientWidth) return;
      // If predominantly vertical delta without Shift
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        const atStart = el.scrollLeft <= 5 && e.deltaY < 0;
        const atEnd = Math.ceil(el.scrollLeft + el.clientWidth) >= el.scrollWidth - 5 && e.deltaY > 0;
        if (!atStart && !atEnd) {
          e.preventDefault();
          el.scrollBy({ left: e.deltaY, behavior: 'auto' });
        }
      }
    };
    el.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      clearTimeout(timer);
      el.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
      el.removeEventListener('wheel', handleWheel);
    };
  }, [comparedList.length, isTiedViewOpen, isOpen, updateCardScrollButtons]);

  // Identify score counts across all evaluated candidates for this job
  const allScoreCounts = useMemo(() => {
    const counts = {};
    sortedEvaluatedAll.forEach(c => {
      if (c.overallScore !== null && c.isEvaluated) {
        counts[c.overallScore] = (counts[c.overallScore] || 0) + 1;
      }
    });
    return counts;
  }, [sortedEvaluatedAll]);

  // Group candidates with equal resume match scores across all evaluated candidates (>= 2 candidates)
  const tieGroups = useMemo(() => {
    const groups = {};
    sortedEvaluatedAll.forEach(item => {
      if (item.overallScore !== null && item.isEvaluated) {
        const score = item.overallScore;
        if (!groups[score]) {
          groups[score] = [];
        }
        groups[score].push(item);
      }
    });

    return Object.entries(groups)
      .filter(([_, list]) => list.length >= 2)
      .map(([score, list]) => ({
        score: Number(score),
        candidates: list,
      }))
      .sort((a, b) => b.score - a.score);
  }, [sortedEvaluatedAll]);

  // Calculate fair competition rankings where candidates with identical resume match scores share the same rank
  const candidateRanks = useMemo(() => {
    const validScores = sortedEvaluatedAll
      .filter(item => item.overallScore !== null && item.isEvaluated)
      .sort((a, b) => b.overallScore - a.overallScore);

    const ranks = {};
    let currentRank = 1;

    validScores.forEach((item, index) => {
      if (index > 0 && item.overallScore < validScores[index - 1].overallScore) {
        currentRank = index + 1; // Standard competition ranking: 1, 1, 3...
      }
      const id = item.candidateId || item.candidate._id || item.candidate.id;
      const isTied = (allScoreCounts[item.overallScore] || 0) > 1;
      ranks[id] = {
        rankNumber: currentRank,
        isTied,
        rankLabel: isTied ? `Tied #${currentRank}` : `#${currentRank}`,
      };
    });

    // Candidates without evaluation data
    sortedEvaluatedAll.forEach(item => {
      const id = item.candidateId || item.candidate._id || item.candidate.id;
      if (!ranks[id]) {
        ranks[id] = {
          rankNumber: '-',
          isTied: false,
          rankLabel: 'N/A',
        };
      }
    });

    return ranks;
  }, [sortedEvaluatedAll, allScoreCounts]);

  // Keep activeTiedScore synced with available tie groups
  React.useEffect(() => {
    if (tieGroups.length > 0) {
      if (activeTiedScore === null || !tieGroups.some(g => Number(g.score) === Number(activeTiedScore))) {
        setActiveTiedScore(tieGroups[0].score);
      }
    } else {
      setActiveTiedScore(null);
    }
  }, [tieGroups, activeTiedScore]);

  // Keep tiedSelectedCandidateIds synced with activeTiedScore group
  React.useEffect(() => {
    if (activeTiedScore !== null) {
      const group = tieGroups.find(g => Number(g.score) === Number(activeTiedScore));
      if (group) {
        const idSet = new Set();
        group.candidates.forEach(c => {
          if (c.candidateId) idSet.add(c.candidateId);
          if (c.candidate?._id) idSet.add(String(c.candidate._id));
          if (c.candidate?.id) idSet.add(String(c.candidate.id));
        });
        setTiedSelectedCandidateIds(idSet);
      }
    } else {
      setTiedSelectedCandidateIds(new Set());
    }
  }, [activeTiedScore, tieGroups]);

  const activeTiedGroup = useMemo(() => {
    if (activeTiedScore === null) return null;
    return tieGroups.find(g => Number(g.score) === Number(activeTiedScore)) || null;
  }, [activeTiedScore, tieGroups]);

  // Candidates actually displayed in the tied comparison table (filtered by tiedSelectedCandidateIds)
  const comparedTiedCandidates = useMemo(() => {
    if (!activeTiedGroup) return [];
    if (tiedSelectedCandidateIds.size === 0) return activeTiedGroup.candidates;
    const filtered = activeTiedGroup.candidates.filter(c => {
      const cid = c.candidateId;
      const rawId = c.candidate?._id ? String(c.candidate._id) : null;
      const altId = c.candidate?.id ? String(c.candidate.id) : null;
      const associated = c.candidate?.associatedCandidateIds || [];
      return (
        (cid && tiedSelectedCandidateIds.has(cid)) ||
        (rawId && tiedSelectedCandidateIds.has(rawId)) ||
        (altId && tiedSelectedCandidateIds.has(altId)) ||
        associated.some(aid => tiedSelectedCandidateIds.has(String(aid)))
      );
    });
    return filtered.length >= 2 ? filtered : activeTiedGroup.candidates;
  }, [activeTiedGroup, tiedSelectedCandidateIds]);

  // Evaluates empirical recommendation and relative ranking for candidates sharing this tied score
  const tiedRecommendation = useMemo(() => {
    if (!activeTiedGroup || !comparedTiedCandidates || comparedTiedCandidates.length < 2) return null;
    return evaluateTiedGroupRecommendation(comparedTiedCandidates, job);
  }, [activeTiedGroup, comparedTiedCandidates, job]);

  const activeGroupRankNumber = useMemo(() => {
    if (!activeTiedGroup || activeTiedGroup.candidates.length === 0) return 1;
    const firstCand = activeTiedGroup.candidates[0];
    const rankInfo = candidateRanks[firstCand.candidateId || firstCand.candidate._id || firstCand.candidate.id];
    return rankInfo?.rankNumber || 1;
  }, [activeTiedGroup, candidateRanks]);

  // Open the dedicated side-by-side comparison view for candidates sharing this score
  const openTiedComparison = (score) => {
    const numScore = Number(score);
    setActiveTiedScore(numScore);
    const group = tieGroups.find(g => Number(g.score) === numScore);
    if (group) {
      const idSet = new Set();
      group.candidates.forEach(c => {
        if (c.candidateId) idSet.add(c.candidateId);
        if (c.candidate?._id) idSet.add(String(c.candidate._id));
        if (c.candidate?.id) idSet.add(String(c.candidate.id));
        if (c.candidate?.associatedCandidateIds && Array.isArray(c.candidate.associatedCandidateIds)) {
          c.candidate.associatedCandidateIds.forEach(aid => idSet.add(String(aid)));
        }
      });
      setTiedSelectedCandidateIds(idSet);
    }
    setIsTiedViewOpen(true);
  };

  // Switch to another tied score group while inside the dedicated view
  const switchTiedScore = (score) => {
    const numScore = Number(score);
    setActiveTiedScore(numScore);
    const group = tieGroups.find(g => Number(g.score) === numScore);
    if (group) {
      const idSet = new Set();
      group.candidates.forEach(c => {
        if (c.candidateId) idSet.add(c.candidateId);
        if (c.candidate?._id) idSet.add(String(c.candidate._id));
        if (c.candidate?.id) idSet.add(String(c.candidate.id));
        if (c.candidate?.associatedCandidateIds && Array.isArray(c.candidate.associatedCandidateIds)) {
          c.candidate.associatedCandidateIds.forEach(aid => idSet.add(String(aid)));
        }
      });
      setTiedSelectedCandidateIds(idSet);
    }
  };

  // Return to full candidate comparison view (preserves all selections, filters, and sort order)
  const closeTiedComparison = () => {
    setIsTiedViewOpen(false);
  };

  const toggleCandidate = (id, candItem) => {
    const associatedIds = candItem?.candidate?.associatedCandidateIds || [];
    setActiveCandidateIds(prev => {
      const next = new Set(prev);
      const isCurrentlyActive = next.has(id) || associatedIds.some(aid => next.has(aid));
      if (isCurrentlyActive) {
        if (next.size <= 1) return prev; // Keep at least one candidate
        next.delete(id);
        associatedIds.forEach(aid => next.delete(aid));
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleTiedCandidate = (id, candItem) => {
    const associatedIds = candItem?.candidate?.associatedCandidateIds || [];
    setTiedSelectedCandidateIds(prev => {
      const next = new Set(prev);
      const isCurrentlyActive = next.has(id) || associatedIds.some(aid => next.has(aid));
      if (isCurrentlyActive) {
        if (next.size <= 2) return prev; // Keep at least two candidates for comparison
        next.delete(id);
        associatedIds.forEach(aid => next.delete(aid));
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAllCandidates = () => {
    setActiveCandidateIds(new Set(uniqueCandidates.map(c => c._id || c.id)));
  };

  const clearAllCandidates = () => {
    setActiveCandidateIds(new Set());
  };

  const selectCurrentPage = () => {
    setActiveCandidateIds(prev => {
      const next = new Set(prev);
      paginatedCandidates.forEach(item => {
        next.add(item.candidate._id || item.candidate.id);
      });
      return next;
    });
  };

  if (!isOpen || !job) return null;

  const jobTitle = job.title || 'Position';
  const jobCode = job.job_id || 'JOB-001';

  return (
    <div
      className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[110] flex items-center justify-center p-3 sm:p-6 animate-fadeIn"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-2xl sm:rounded-[2rem] shadow-2xl w-full max-w-[96vw] 2xl:max-w-[1536px] h-[92vh] max-h-[92vh] flex flex-col overflow-hidden my-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Modal Header ──────────────────────────────────────────────── */}
        <div className="px-6 sm:px-8 py-5 border-b border-border flex items-center justify-between bg-card shrink-0 flex-wrap gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            {isTiedViewOpen ? (
              <button
                type="button"
                onClick={closeTiedComparison}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-secondary hover:bg-muted text-foreground font-bold text-xs border border-border shadow-2xs transition-all cursor-pointer shrink-0"
                title="Return to full Candidate Comparison view"
              >
                <ArrowLeft size={16} />
                <span>Back to All Candidates</span>
              </button>
            ) : (
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-gradient-to-tr from-indigo-600 via-purple-600 to-pink-500 text-white shadow-lg shadow-indigo-500/25 shrink-0">
                <GitCompare size={22} />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-lg sm:text-xl font-black text-foreground tracking-tight truncate">
                  {isTiedViewOpen ? 'Tied Candidates Comparison' : 'Candidate Comparison'}
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                  {isTiedViewOpen ? 'Side-by-Side Analysis' : 'Resume-to-Job Matching'}
                </span>
                <span className="px-2.5 py-0.5 rounded-md text-xs font-mono font-bold bg-secondary text-foreground border border-border">
                  {jobCode}
                </span>
                {isTiedViewOpen ? (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                    Tied #{activeGroupRankNumber} ({activeTiedScore}% Match)
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-50 dark:bg-teal-950/70 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
                    Comparing {comparedList.length} of {candidates.length}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground font-medium flex-wrap">
                <span className="font-semibold text-slate-700 dark:text-slate-200">{jobTitle}</span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <MapPin size={11} className="text-teal-500" /> {job.location || 'Remote'}
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Clock size={11} className="text-indigo-500" /> {job.workMode || 'Full-time'}
                </span>
                {job.experience && (
                  <>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <Briefcase size={11} className="text-amber-500" /> Req: {job.experience}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Controls: Sort Dropdown & Close Button */}
          <div className="flex items-center gap-3">
            {!isTiedViewOpen && (
              <div className="flex items-center gap-2 bg-secondary/60 rounded-xl px-3 py-1.5 border border-border">
                <ArrowUpDown size={14} className="text-muted-foreground" />
                <span className="text-xs font-bold text-muted-foreground hidden sm:inline">Sort:</span>
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value)}
                  className="bg-transparent text-xs font-bold text-foreground focus:outline-none cursor-pointer border-none"
                >
                  <option value="score_desc">Resume Match (High → Low)</option>
                  <option value="score_asc">Resume Match (Low → High)</option>
                  <option value="name_asc">Candidate Name (A → Z)</option>
                  <option value="exp_desc">Experience Match</option>
                </select>
              </div>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-secondary hover:bg-rose-500/10 text-muted-foreground hover:text-rose-500 border border-border cursor-pointer transition-colors"
              title="Close Comparison"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ── Candidate Inclusion Filter Bar (Single Horizontal Row + 10 Per Page Pagination) ── */}
        {!isTiedViewOpen && (
          <div className="px-6 sm:px-8 py-2.5 bg-secondary/30 border-b border-border shrink-0 space-y-2">
          {/* Top Control Line: Filter Label, Count Badge, Selection Helpers, and Pagination */}
          <div className="flex items-center justify-between gap-3 flex-wrap text-xs">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="font-bold text-muted-foreground flex items-center gap-1.5 uppercase tracking-wider text-[11px]">
                <Filter size={13} className="text-indigo-600 dark:text-indigo-400" /> Compare Candidates:
              </span>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-mono">
                {totalCandidates > 0
                  ? `Showing ${startIndex + 1}–${endIndex} of ${totalCandidates} candidates`
                  : '0 candidates'}
              </span>
              <span className="text-[11px] text-muted-foreground font-medium">
                ({activeCandidateIds.size} selected)
              </span>
            </div>

            <div className="flex items-center gap-3">
              {/* Select All / Select Page / Clear Selection */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={selectCurrentPage}
                  className="text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 font-semibold text-xs cursor-pointer bg-transparent border-none"
                  title="Select all 10 candidates on the current page"
                >
                  Select Page
                </button>
                <span className="text-muted-foreground">•</span>
                {activeCandidateIds.size < evaluatedAll.length ? (
                  <button
                    type="button"
                    onClick={selectAllCandidates}
                    className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline text-xs cursor-pointer bg-transparent border-none"
                    title="Select all candidates across all pages"
                  >
                    Select All ({evaluatedAll.length})
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={clearAllCandidates}
                    className="text-rose-600 dark:text-rose-400 font-bold hover:underline text-xs cursor-pointer bg-transparent border-none"
                    title="Deselect all candidates"
                  >
                    Clear All
                  </button>
                )}
                {activeCandidateIds.size > 0 && activeCandidateIds.size < evaluatedAll.length && (
                  <>
                    <span className="text-muted-foreground">•</span>
                    <button
                      type="button"
                      onClick={clearAllCandidates}
                      className="text-slate-500 hover:text-rose-500 font-medium text-xs cursor-pointer bg-transparent border-none"
                      title="Clear candidate selection"
                    >
                      Clear
                    </button>
                  </>
                )}
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center gap-1 bg-background dark:bg-slate-900 border border-border rounded-xl px-2 py-1 shadow-xs">
                  <button
                    type="button"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={currentPage <= 1}
                    className="p-1 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
                    title="Previous 10 candidates"
                  >
                    <ChevronLeft size={14} />
                  </button>
                  <span className="text-[11px] font-bold font-mono px-2 text-foreground select-none">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage >= totalPages}
                    className="p-1 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
                    title="Next 10 candidates"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Chips Line: Clean Single Horizontal Row (Never Wrap, Horizontal Scroll if Needed) */}
          <div className="relative overflow-hidden">
            <div className="flex items-center gap-2 overflow-x-auto py-1 flex-nowrap no-scrollbar scroll-smooth">
              {paginatedCandidates.map(item => {
                const id = item.candidate._id || item.candidate.id;
                const isChecked = isCandidateActive(item);
                const scoreLabel = item.overallScore !== null ? `${item.overallScore}%` : 'N/A';
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggleCandidate(id, item)}
                    className={`shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-bold text-xs transition-all cursor-pointer border select-none ${
                      isChecked
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm ring-2 ring-indigo-200 dark:ring-indigo-900/60'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-400 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30'
                    }`}
                    title={`${item.name} - ${scoreLabel} Resume Match (${isChecked ? 'Selected - Click to deselect' : 'Click to select for comparison'})`}
                  >
                    <span
                      className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] shrink-0 font-black ${
                        isChecked
                          ? 'bg-white/30 text-white'
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                      }`}
                    >
                      {isChecked ? '✓' : '+'}
                    </span>
                    <span className="truncate max-w-[140px] sm:max-w-[180px]">{item.name}</span>
                    <span
                      className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-bold shrink-0 ${
                        isChecked
                          ? 'bg-white/20 text-white'
                          : 'bg-slate-100 dark:bg-slate-700 text-indigo-600 dark:text-indigo-400'
                      }`}
                    >
                      {scoreLabel}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

        {/* ── Main Comparison Scrollable Area ───────────────────────────── */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 sm:p-6 bg-background custom-scrollbar">
          {!isTiedViewOpen ? (
            <div>
              {/* Quick-Jump Tied Score Alert Banner (Collapsible by default) */}
              {tieGroups.length > 0 && (
                <div className="mb-6 rounded-2xl bg-gradient-to-r from-amber-500/10 via-indigo-500/10 to-purple-500/10 border border-amber-300/60 dark:border-amber-700/60 overflow-hidden shadow-xs transition-all">
                  {/* Banner Heading: Always visible, clickable to toggle expand/collapse */}
                  <div
                    onClick={() => setIsTiedScoresExpanded(prev => !prev)}
                    className="p-4 flex items-center justify-between gap-3 cursor-pointer hover:bg-amber-500/5 select-none transition-colors"
                    title={isTiedScoresExpanded ? 'Click to collapse tied score groups' : 'Click to expand tied score groups'}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-sm">
                        <Scale size={20} />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs sm:text-sm font-black text-foreground flex items-center gap-2 flex-wrap">
                          <span>Equal Resume Match Scores Detected</span>
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 font-mono">
                            {tieGroups.reduce((acc, g) => acc + g.candidates.length, 0)} tied candidates
                          </span>
                          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                            {tieGroups.length} score {tieGroups.length === 1 ? 'group' : 'groups'}
                          </span>
                        </h4>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Candidates with identical resume-to-job match scores share equal rank (e.g. Tied #1). Click to {isTiedScoresExpanded ? 'collapse' : 'view'} tied-score groups and compare differences side-by-side.
                        </p>
                      </div>
                    </div>

                    {/* Small Expand/Collapse Arrow (Chevron) */}
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-bold text-amber-700 dark:text-amber-300 hidden sm:inline">
                        {isTiedScoresExpanded ? 'Collapse' : 'View Groups'}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsTiedScoresExpanded(prev => !prev);
                        }}
                        className="w-8 h-8 rounded-lg flex items-center justify-center bg-white dark:bg-slate-800 border border-amber-300/60 dark:border-amber-700/60 text-amber-700 dark:text-amber-300 hover:bg-amber-100/50 dark:hover:bg-amber-900/40 transition-colors shadow-2xs cursor-pointer"
                        aria-expanded={isTiedScoresExpanded}
                        aria-label={isTiedScoresExpanded ? 'Collapse tied score groups' : 'Expand tied score groups'}
                      >
                        <ChevronDown
                          size={18}
                          className={`transition-transform duration-200 ${isTiedScoresExpanded ? 'rotate-180' : 'rotate-0'}`}
                        />
                      </button>
                    </div>
                  </div>

                  {/* Collapsible Buttons Container: Only rendered when expanded */}
                  {isTiedScoresExpanded && (
                    <div className="px-4 pb-4 pt-2 border-t border-amber-200/60 dark:border-amber-800/60 bg-white/40 dark:bg-slate-900/40 animate-fadeIn">
                      <div className="flex items-center justify-between gap-2 mb-2.5">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                          Available Tied-Score Groups ({tieGroups.length}):
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          Click any group to open dedicated side-by-side comparison
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {tieGroups.map(group => (
                          <button
                            key={group.score}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openTiedComparison(group.score);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black bg-white dark:bg-slate-800 hover:bg-amber-50 dark:hover:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700 shadow-xs transition-all cursor-pointer hover:border-amber-400 active:scale-98"
                            title={`Open side-by-side comparison for ${group.candidates.length} candidates with ${group.score}% match`}
                          >
                            <Scale size={13} className="text-amber-600 dark:text-amber-400 shrink-0" />
                            <span>Compare Tied Candidates ({group.score}%)</span>
                            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-mono bg-amber-100 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200">
                              {group.candidates.length}
                            </span>
                            <ArrowRight size={12} className="opacity-70" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

          {candidates.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <AlertCircle size={36} className="mx-auto text-amber-500 dark:text-amber-400 mb-3" />
              <p className="text-base font-bold text-slate-800 dark:text-slate-100">No Matching Candidates Found</p>
              <p className="text-xs mt-1 text-slate-500 max-w-md mx-auto">
                No candidates in the repository have matching resumes or sufficient profile information for this job description.
              </p>
            </div>
          ) : comparedList.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <GitCompare size={36} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
              <p className="text-base font-bold">No candidates selected for comparison.</p>
              <p className="text-xs mt-1">Select candidates using the pill buttons above.</p>
              <button
                onClick={selectAllCandidates}
                className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold"
              >
                Select All Candidates
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Cards Navigation Bar / Helper Header */}
              <div className="flex items-center justify-between gap-3 px-1 py-0.5 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs sm:text-sm font-extrabold text-foreground flex items-center gap-2">
                    <span>Side-by-Side Candidate Comparison</span>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                      {comparedList.length} {comparedList.length === 1 ? 'candidate' : 'candidates'}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground hidden lg:inline">
                    • Scroll horizontally with navigation arrows, mouse wheel, or drag bottom scrollbar
                  </span>
                </div>

                {/* Top Arrow Navigation Controls */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={scrollCardsLeft}
                    disabled={!canScrollLeft}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed bg-card border-border hover:bg-secondary text-foreground shadow-2xs hover:border-indigo-300"
                    title="Scroll left to previous candidates"
                    aria-label="Scroll left to previous candidates"
                  >
                    <ChevronLeft size={16} />
                    <span className="hidden sm:inline">Previous</span>
                  </button>

                  <button
                    type="button"
                    onClick={scrollCardsRight}
                    disabled={!canScrollRight}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed bg-card border-border hover:bg-secondary text-foreground shadow-2xs hover:border-indigo-300"
                    title="Scroll right to next candidates"
                    aria-label="Scroll right to next candidates"
                  >
                    <span className="hidden sm:inline">Next</span>
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>

              {/* Relative Carousel Container with Side Navigation Floating Arrows */}
              <div className="relative group/cards-carousel">
                {/* Floating Left Arrow Button */}
                <button
                  type="button"
                  onClick={scrollCardsLeft}
                  disabled={!canScrollLeft}
                  aria-label="Scroll left"
                  title={canScrollLeft ? "Scroll left to previous candidates" : "At beginning of candidate list"}
                  className={`absolute left-2 top-48 -translate-y-1/2 z-30 w-11 h-11 rounded-full flex items-center justify-center border shadow-xl backdrop-blur-md transition-all duration-200 ${
                    canScrollLeft
                      ? 'bg-card text-foreground hover:bg-indigo-600 hover:text-white hover:border-indigo-600 dark:hover:bg-indigo-600 border-border cursor-pointer opacity-95 hover:scale-110 active:scale-95 shadow-md'
                      : 'bg-card/70 text-muted-foreground/30 border-border/30 cursor-not-allowed opacity-30 pointer-events-none'
                  }`}
                >
                  <ChevronLeft size={22} className="stroke-[2.5]" />
                </button>

                {/* Floating Right Arrow Button */}
                <button
                  type="button"
                  onClick={scrollCardsRight}
                  disabled={!canScrollRight}
                  aria-label="Scroll right"
                  title={canScrollRight ? "Scroll right to next candidates" : "At end of candidate list"}
                  className={`absolute right-2 top-48 -translate-y-1/2 z-30 w-11 h-11 rounded-full flex items-center justify-center border shadow-xl backdrop-blur-md transition-all duration-200 ${
                    canScrollRight
                      ? 'bg-card text-foreground hover:bg-indigo-600 hover:text-white hover:border-indigo-600 dark:hover:bg-indigo-600 border-border cursor-pointer opacity-95 hover:scale-110 active:scale-95 ring-2 ring-indigo-500/25 shadow-md'
                      : 'bg-card/70 text-muted-foreground/30 border-border/30 cursor-not-allowed opacity-30 pointer-events-none'
                  }`}
                >
                  <ChevronRight size={22} className="stroke-[2.5]" />
                </button>

                {/* Horizontal Scroll Area */}
                <div
                  ref={cardsScrollRef}
                  className="overflow-x-auto overflow-y-visible pb-4 pt-1 custom-scrollbar cards-horizontal-scrollbar scroll-smooth focus:outline-none"
                  tabIndex={0}
                  role="region"
                  aria-label="Candidate Comparison Cards Horizontal View"
                  style={{
                    WebkitOverflowScrolling: 'touch',
                    scrollbarWidth: 'auto',
                  }}
                >
                  <div
                    className="flex items-stretch gap-4 sm:gap-6 flex-nowrap"
                    style={{
                      width: 'max-content',
                      minWidth: '100%',
                    }}
                  >
                    {comparedList.map((item, idx) => {
                      const isTied = (allScoreCounts[item.overallScore] || 0) > 1;
                      const candRank = candidateRanks[item.candidateId || item.candidate._id || item.candidate.id];

                      return (
                        <div
                          key={item.candidateId || idx}
                          className="w-[300px] sm:w-[335px] shrink-0 flex flex-col bg-card border border-border rounded-2xl shadow-sm hover:shadow-md transition-shadow overflow-hidden"
                        >
                    {/* Candidate Card Top Header */}
                    <div className="p-5 border-b border-border bg-slate-50/60 dark:bg-slate-900/60">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-black text-sm flex items-center justify-center shrink-0 shadow">
                            {(item.name || '?')[0].toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-extrabold text-sm sm:text-base text-foreground truncate" title={item.name}>
                              {item.name}
                            </h3>
                            <span className="text-[11px] font-mono font-bold text-muted-foreground">
                              {item.candidateId}
                            </span>
                          </div>
                        </div>

                        {/* Rank / Tie indicator */}
                        <div className="flex flex-col items-end">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${
                              isTied
                                ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                                : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {candRank?.rankLabel || `#${idx + 1}`}
                          </span>
                          {isTied && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openTiedComparison(item.overallScore);
                              }}
                              className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/60 dark:hover:bg-amber-900/60 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700 transition-colors cursor-pointer shadow-2xs"
                              title="Compare tied candidates side-by-side"
                            >
                              <Scale size={10} />
                              <span>Compare Tied</span>
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Contact row */}
                      <div className="mt-3 pt-3 border-t border-border/60 text-xs text-muted-foreground space-y-1">
                        <p className="truncate font-medium" title={item.email}>{displayValue(item.email)}</p>
                        {item.phone && <p className="font-medium">{displayValue(item.phone)}</p>}
                        {item.linkedinUrl && (
                          <a
                            href={item.linkedinUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline font-bold"
                          >
                            <ExternalLink size={10} /> LinkedIn Profile
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Resume-to-Job Match Score Banner */}
                    <div className={`p-4 border-b border-border ${item.matchCategory.bgClass} flex items-center justify-between`}>
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">
                          Resume-to-Job Match
                        </span>
                        <div className="flex items-baseline gap-2 mt-0.5">
                          <span className={`text-2xl sm:text-3xl font-black ${item.matchCategory.colorClass}`}>
                            {item.overallScore !== null ? `${item.overallScore}%` : 'Not available'}
                          </span>
                        </div>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-black uppercase tracking-wider border ${item.matchCategory.badgeClass}`}>
                        {item.matchCategory.label}
                      </span>
                    </div>

                    {/* Score Breakdown Progress Bars */}
                    <div className="p-4 border-b border-border space-y-2.5 text-xs bg-card">
                      <div className="flex items-center justify-between text-muted-foreground font-bold text-[11px] uppercase tracking-wider">
                        <span>Resume Alignment Breakdown</span>
                      </div>

                      {/* Skills alignment bar */}
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-semibold text-foreground">Mandatory Skills</span>
                          <span className="font-bold text-indigo-600 dark:text-indigo-400">{item.breakdown.skillsScore}%</span>
                        </div>
                        <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-600 rounded-full transition-all duration-500"
                            style={{ width: `${item.breakdown.skillsScore}%` }}
                          />
                        </div>
                      </div>

                      {/* Experience bar */}
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-semibold text-foreground">Experience Alignment</span>
                          <span className="font-bold text-emerald-600 dark:text-emerald-400">{item.breakdown.experienceScore}%</span>
                        </div>
                        <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                            style={{ width: `${item.breakdown.experienceScore}%` }}
                          />
                        </div>
                      </div>

                      {/* Role relevance bar */}
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-semibold text-foreground">Role & JD Relevance</span>
                          <span className="font-bold text-purple-600 dark:text-purple-400">{item.breakdown.roleScore}%</span>
                        </div>
                        <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-purple-500 rounded-full transition-all duration-500"
                            style={{ width: `${item.breakdown.roleScore}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Skills Alignment Matrix */}
                    <div className="p-4 border-b border-border space-y-3 flex-1 bg-card">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground">
                            Matched Mandatory ({item.skillsAlignment.matchedSkills.length})
                          </span>
                          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-200 dark:border-emerald-800">
                            {item.skillsAlignment.matchRatio}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {item.skillsAlignment.matchedSkills.length > 0 ? (
                            item.skillsAlignment.matchedSkills.map(s => (
                              <span
                                key={s}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                              >
                                <Check size={11} strokeWidth={3} className="text-emerald-600" /> {s}
                              </span>
                            ))
                          ) : (
                            <span className="text-xs text-muted-foreground italic">No mandatory skills verified in resume</span>
                          )}
                        </div>
                      </div>

                      {/* Missing Mandatory Requirements */}
                      {item.skillsAlignment.missingSkills.length > 0 && (
                        <div>
                          <span className="text-[11px] font-extrabold uppercase tracking-wider text-rose-600 dark:text-rose-400 block mb-2">
                            Missing Mandatory ({item.skillsAlignment.missingSkills.length})
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {item.skillsAlignment.missingSkills.map(s => (
                              <span
                                key={s}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-50 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800"
                              >
                                <X size={11} strokeWidth={2.5} className="text-rose-500" /> {s}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Preferred Skills (if any) */}
                      {item.skillsAlignment.preferredSkills && item.skillsAlignment.preferredSkills.length > 0 && (
                        <div>
                          <span className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 block mb-2">
                            Matched Preferred ({item.skillsAlignment.matchedPreferredSkills?.length || 0})
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {(item.skillsAlignment.matchedPreferredSkills || []).length > 0 ? (
                              item.skillsAlignment.matchedPreferredSkills.map(s => (
                                <span
                                  key={s}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-indigo-50 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800"
                                >
                                  <Check size={10} className="text-indigo-600" /> {s}
                                </span>
                              ))
                            ) : (
                              <span className="text-xs text-muted-foreground italic">No preferred skills in resume</span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Additional Resume Skills */}
                      {item.skillsAlignment.additionalSkills.length > 0 && (
                        <div>
                          <span className="text-[11px] font-extrabold uppercase tracking-wider text-muted-foreground block mb-2">
                            Additional Resume Skills ({item.skillsAlignment.additionalSkills.length})
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {item.skillsAlignment.additionalSkills.slice(0, 5).map(s => (
                              <span
                                key={s}
                                className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-secondary text-foreground border border-border"
                              >
                                {s}
                              </span>
                            ))}
                            {item.skillsAlignment.additionalSkills.length > 5 && (
                              <span className="text-[11px] text-muted-foreground font-semibold self-center">
                                +{item.skillsAlignment.additionalSkills.length - 5} more
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Candidate Attributes Grid */}
                    <div className="p-4 border-b border-border bg-slate-50/50 dark:bg-slate-900/40 space-y-2 text-xs">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="p-2.5 bg-white dark:bg-slate-800 rounded-xl border border-border">
                          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                            Experience
                          </span>
                          <span className="font-bold text-foreground text-xs block mt-0.5 truncate">
                            {displayValue(item.experience)}
                          </span>
                        </div>
                        <div className="p-2.5 bg-white dark:bg-slate-800 rounded-xl border border-border">
                          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                            Education
                          </span>
                          <span className="font-bold text-foreground text-xs block mt-0.5 truncate" title={item.education}>
                            {displayValue(item.education)}
                          </span>
                        </div>
                        <div className="p-2.5 bg-white dark:bg-slate-800 rounded-xl border border-border">
                          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                            Location
                          </span>
                          <span className="font-bold text-foreground text-xs block mt-0.5 truncate" title={item.location}>
                            {displayValue(item.location)}
                          </span>
                        </div>
                        <div className="p-2.5 bg-white dark:bg-slate-800 rounded-xl border border-border">
                          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                            Company
                          </span>
                          <span className="font-bold text-foreground text-xs block mt-0.5 truncate" title={item.currentCompany}>
                            {displayValue(item.currentCompany)}
                          </span>
                        </div>
                        <div className="p-2.5 bg-white dark:bg-slate-800 rounded-xl border border-border col-span-2">
                          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                            Notice Period
                          </span>
                          <span className="font-bold text-foreground text-xs block mt-0.5 truncate">
                            {displayValue(item.noticePeriod)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Resume Strengths & Missing Indicators */}
                    <div className="p-4 border-b border-border space-y-2 text-xs bg-card">
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400 block mb-1">
                          Resume Strengths
                        </span>
                        <ul className="space-y-1">
                          {item.strengths.slice(0, 2).map((str, sIdx) => (
                            <li key={sIdx} className="flex items-start gap-1.5 text-muted-foreground">
                              <CheckCircle2 size={12} className="text-emerald-600 mt-0.5 shrink-0" />
                              <span className="text-[11px] leading-tight">{str}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {item.missingRequirements.length > 0 && (
                        <div className="pt-2 border-t border-border/60">
                          <span className="text-[10px] font-black uppercase tracking-wider text-rose-600 dark:text-rose-400 block mb-1">
                            Missing Requirements in Resume
                          </span>
                          <ul className="space-y-1">
                            {item.missingRequirements.slice(0, 2).map((gap, gIdx) => (
                              <li key={gIdx} className="flex items-start gap-1.5 text-muted-foreground">
                                <AlertCircle size={12} className="text-rose-500 mt-0.5 shrink-0" />
                                <span className="text-[11px] leading-tight">{gap}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    {/* Footer Actions */}
                    <div className="p-4 bg-slate-50 dark:bg-slate-900/60 flex items-center justify-between gap-2 mt-auto">
                      <button
                        type="button"
                        onClick={() => onViewDetails && onViewDetails(item.candidate)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-200 border border-border text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
                        title="View Detailed Resume Breakdown"
                      >
                        <Eye size={13} className="text-indigo-600" /> Details
                      </button>

                      <button
                        type="button"
                        onClick={() => onScheduleInterview && onScheduleInterview(item.candidate)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer whitespace-nowrap"
                        title="Schedule Interview"
                      >
                        <Calendar size={13} /> Schedule
                      </button>
                    </div>
                  </div>
                );
              })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ── Dedicated Side-by-Side Comparison for Tied Candidates ───────── */
        activeTiedGroup && comparedTiedCandidates.length >= 2 ? (
          <div
            id="tied-comparison-section"
            className="space-y-5 sm:space-y-6 max-w-full"
          >
            {/* 1. Comparison Header Card */}
            <div className="bg-card border border-border rounded-2xl p-5 sm:p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                  <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-indigo-600 text-white flex items-center justify-center shrink-0 shadow-md">
                    <Scale size={24} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h3 className="text-base sm:text-lg font-black text-foreground tracking-tight">
                        Side-by-Side Tied Score Analysis (Resume-to-Job Matching)
                      </h3>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 font-mono">
                        Equal Rank: Tied #{activeGroupRankNumber}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-mono">
                        {activeTiedScore}% Resume Match
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-border font-mono">
                        {comparedTiedCandidates.length} Candidates
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                      Comparing candidates sharing an identical overall resume match percentage of {activeTiedScore}%. Evaluated side-by-side using factual evidence from resumes to highlight advantages and trade-offs without arbitrary ranking.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
                  <button
                    type="button"
                    onClick={closeTiedComparison}
                    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-secondary hover:bg-muted text-foreground text-xs font-bold border border-border shadow-2xs transition-colors cursor-pointer"
                    title="Return to full candidate comparison"
                  >
                    <ArrowLeft size={14} />
                    <span>Back to All Candidates</span>
                  </button>
                </div>
              </div>
            </div>

            {/* 2. Dedicated Score Groups Navigation Bar */}
            {tieGroups.length > 1 && (
              <div className="bg-card border border-border rounded-2xl p-4 shadow-sm space-y-2.5">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-foreground">
                      Score Groups ({tieGroups.length}):
                    </span>
                    <span className="text-xs text-muted-foreground hidden sm:inline">
                      Select a score group to compare tied candidates side-by-side
                    </span>
                  </div>
                  <span className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400">
                    Active: {activeTiedScore}% Match ({activeTiedGroup?.candidates?.length || 0} candidates)
                  </span>
                </div>

                {/* Single horizontal row of score group buttons (Never Wrap, Horizontal Scroll if Needed) */}
                <div className="relative overflow-hidden">
                  <div className="flex items-center gap-2 overflow-x-auto py-1 flex-nowrap no-scrollbar scroll-smooth">
                    {tieGroups.map(g => {
                      const isSelected = Number(g.score) === Number(activeTiedScore);
                      return (
                        <button
                          key={g.score}
                          type="button"
                          onClick={() => switchTiedScore(g.score)}
                          className={`shrink-0 whitespace-nowrap inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border select-none ${
                            isSelected
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm ring-2 ring-indigo-200 dark:ring-indigo-900/60 font-black'
                              : 'bg-secondary/70 hover:bg-secondary text-foreground border-border hover:border-indigo-300'
                          }`}
                          title={`Switch comparison to ${g.candidates.length} candidates with ${g.score}% resume match`}
                        >
                          <Scale size={13} className={isSelected ? 'text-white' : 'text-amber-500'} />
                          <span>{g.score}% Match</span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-black ${
                              isSelected
                                ? 'bg-white/20 text-white'
                                : 'bg-card text-muted-foreground border border-border'
                            }`}
                          >
                            {g.candidates.length}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* 3. Multi-Candidate Selection Toggle (if active tied group has > 2 candidates) */}
            {activeTiedGroup.candidates.length > 2 && (
              <div className="bg-card border border-border rounded-2xl p-4 shadow-sm space-y-2.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground">
                    Filter Tied Candidates for Comparison ({comparedTiedCandidates.length} of {activeTiedGroup.candidates.length} displayed):
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Minimum 2 candidates required for side-by-side comparison
                  </span>
                </div>
                <div className="flex items-center gap-2 overflow-x-auto py-1 flex-nowrap no-scrollbar scroll-smooth">
                  {activeTiedGroup.candidates.map(c => {
                    const cid = c.candidateId || c.candidate?._id || c.candidate?.id;
                    const associated = c.candidate?.associatedCandidateIds || [];
                    const isSelected =
                      (c.candidateId && tiedSelectedCandidateIds.has(c.candidateId)) ||
                      (c.candidate?._id && tiedSelectedCandidateIds.has(String(c.candidate._id))) ||
                      (c.candidate?.id && tiedSelectedCandidateIds.has(String(c.candidate.id))) ||
                      associated.some(aid => tiedSelectedCandidateIds.has(String(aid)));
                    return (
                      <button
                        key={cid}
                        type="button"
                        onClick={() => toggleTiedCandidate(cid, c)}
                        className={`shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer border select-none ${
                          isSelected
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                            : 'bg-secondary/60 text-muted-foreground border-border hover:border-indigo-300'
                        }`}
                      >
                        <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] shrink-0 font-black ${
                          isSelected ? 'bg-white/30 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                        }`}>
                          {isSelected ? '✓' : '+'}
                        </span>
                        <span>{c.name}</span>
                        <span className="text-[10px] font-mono opacity-80">({c.candidateId})</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

              {/* ── Differentiator & Trade-off Summary Cards ───────────── */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h4 className="text-xs font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Sparkles size={14} className="text-indigo-600" />
                    Key Resume Differentiators & Trade-off Summary ({activeTiedScore}% Match)
                  </h4>
                  <span className="text-[11px] text-muted-foreground hidden sm:inline">
                    Neutral comparison — factual advantages and gaps from candidate resumes
                  </span>
                </div>
                <div className="overflow-x-auto pb-2 custom-scrollbar">
                  <div
                    className="grid gap-4 sm:gap-6 items-stretch"
                    style={{
                      gridTemplateColumns: `repeat(${comparedTiedCandidates.length}, minmax(320px, 1fr))`,
                      minWidth: `${comparedTiedCandidates.length * 320}px`
                    }}
                  >
                    {comparedTiedCandidates.map(c => {
                      const diffs = getCandidateDifferentiators(c, comparedTiedCandidates, job);
                      return (
                        <div
                          key={c.candidateId}
                          className="bg-card border border-border rounded-2xl p-5 shadow-xs flex flex-col justify-between hover:shadow-sm transition-shadow min-w-[320px]"
                        >
                          <div>
                            <div className="flex items-center justify-between gap-2 pb-3.5 border-b border-border">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-extrabold text-xs flex items-center justify-center shrink-0 shadow-sm">
                                  {(c.name || '?')[0].toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <h4 className="font-extrabold text-sm text-foreground truncate" title={c.name}>{c.name}</h4>
                                  <span className="text-[10px] font-mono text-muted-foreground">{c.candidateId}</span>
                                </div>
                              </div>
                              <div className="flex flex-col items-end gap-1 shrink-0">
                                {(() => {
                                  const rankedItem = tiedRecommendation?.rankedCandidates?.find(
                                    r => (r.candidateId || r.candidate?._id || r.candidate?.id) === (c.candidateId || c.candidate?._id || c.candidate?.id)
                                  );
                                  if (rankedItem) {
                                    return (
                                      <span
                                        className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                                          rankedItem.badgeType === 'winner'
                                            ? 'bg-emerald-500 text-white shadow-2xs'
                                            : rankedItem.badgeType === 'runner_up'
                                            ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
                                            : rankedItem.badgeType === 'third'
                                            ? 'bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
                                            : rankedItem.badgeType === 'fourth'
                                            ? 'bg-sky-50 dark:bg-sky-950 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800'
                                            : 'bg-secondary text-muted-foreground border border-border'
                                        }`}
                                      >
                                        {rankedItem.rankLabel}
                                      </span>
                                    );
                                  }
                                  return null;
                                })()}
                                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                  Tied #{activeGroupRankNumber} ({c.overallScore}%)
                                </span>
                              </div>
                            </div>

                            {/* Advantages */}
                            <div className="mt-3.5 space-y-2">
                              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400 block">
                                Key Resume Advantages
                              </span>
                              <ul className="space-y-1.5 text-xs">
                                {diffs.advantages.length > 0 ? (
                                  diffs.advantages.map((adv, aIdx) => (
                                    <li key={aIdx} className="flex items-start gap-2 text-foreground font-medium">
                                      <CheckCircle2 size={13} className="text-emerald-600 mt-0.5 shrink-0" />
                                      <span className="text-xs leading-relaxed">{adv}</span>
                                    </li>
                                  ))
                                ) : (
                                  <li className="text-xs text-muted-foreground italic">Evenly matched with peers</li>
                                )}
                              </ul>
                            </div>

                            {/* Considerations / Trade-offs */}
                            <div className="mt-3.5 pt-3.5 border-t border-border/60 space-y-2">
                              <span className="text-[10px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-400 block">
                                Resume Trade-offs & Gaps
                              </span>
                              <ul className="space-y-1.5 text-xs">
                                {diffs.considerations.length > 0 ? (
                                  diffs.considerations.map((con, cIdx) => (
                                    <li key={cIdx} className="flex items-start gap-2 text-muted-foreground">
                                      <AlertCircle size={13} className="text-amber-500 mt-0.5 shrink-0" />
                                      <span className="text-xs leading-relaxed">{con}</span>
                                    </li>
                                  ))
                                ) : (
                                  <li className="text-xs text-muted-foreground italic">No notable trade-offs relative to peers</li>
                                )}
                              </ul>
                            </div>
                          </div>

                          <div className="mt-4 pt-3.5 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground gap-2 flex-wrap">
                            <span>Experience: <strong className="text-foreground">{displayValue(c.experience)}</strong></span>
                            <span>Education: <strong className="text-foreground truncate max-w-[150px] inline-block align-bottom" title={displayValue(c.education)}>{displayValue(c.education)}</strong></span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* ── Side-by-Side Detailed Criteria Table ──────────────── */}
              <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full border-collapse text-left text-xs min-w-full">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-900/80 border-b border-border">
                        <th className="p-4 font-black text-muted-foreground uppercase tracking-wider w-56 sm:w-64 min-w-[200px] sticky left-0 bg-slate-50 dark:bg-slate-900 z-10 border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.08)]">
                          Resume Evaluation Criteria
                        </th>
                        {comparedTiedCandidates.map(c => (
                          <th key={c.candidateId} className="p-4 min-w-[300px] sm:min-w-[340px] border-r border-border last:border-r-0 align-top">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 text-white font-extrabold text-xs flex items-center justify-center shrink-0 shadow-2xs">
                                  {(c.name || '?')[0].toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <div className="font-extrabold text-foreground truncate text-sm" title={c.name}>{c.name}</div>
                                  <div className="text-[10px] font-mono text-muted-foreground">{c.candidateId}</div>
                                </div>
                              </div>
                              <span className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 shrink-0 font-mono">
                                Tied #{activeGroupRankNumber}
                              </span>
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {/* Resume-to-Job Match */}
                      <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30">
                        <td className="p-4 font-bold text-foreground sticky left-0 bg-card dark:bg-slate-900 z-10 border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                          Resume-to-Job Match
                        </td>
                        {comparedTiedCandidates.map(c => (
                          <td key={c.candidateId} className="p-4 min-w-[300px] sm:min-w-[340px] border-r border-border last:border-r-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`text-xl font-black ${c.matchCategory.colorClass}`}>
                                {c.overallScore !== null ? `${c.overallScore}%` : 'Not available'}
                              </span>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${c.matchCategory.badgeClass}`}>
                                {c.matchCategory.label}
                              </span>
                            </div>
                            <span className="text-[10px] text-muted-foreground mt-0.5 block">
                              Equal match percentage across compared peers
                            </span>
                          </td>
                        ))}
                      </tr>

                      {/* Skills Alignment */}
                      <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30">
                        <td className="p-4 font-bold text-foreground sticky left-0 bg-card dark:bg-slate-900 z-10 border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                          Mandatory Skills Match
                        </td>
                        {comparedTiedCandidates.map(c => {
                          const metric = getMetricComparison('skillsScore', c, comparedTiedCandidates);
                          return (
                            <td key={c.candidateId} className="p-4 min-w-[300px] sm:min-w-[340px] border-r border-border last:border-r-0">
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-bold text-foreground text-sm">
                                  {c.breakdown.skillsScore}%
                                </span>
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                                  metric.status === 'highest'
                                    ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300'
                                    : metric.status === 'lowest'
                                    ? 'bg-rose-50 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300'
                                    : 'bg-secondary text-muted-foreground border-border'
                                }`}>
                                  {metric.text}
                                </span>
                              </div>
                              <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-indigo-600 rounded-full transition-all duration-300"
                                  style={{ width: `${Math.min(100, Math.max(0, c.breakdown.skillsScore))}%` }}
                                />
                              </div>
                            </td>
                          );
                        })}
                      </tr>

                      {/* Matched Mandatory Skills */}
                      <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30">
                        <td className="p-4 font-bold text-foreground sticky left-0 bg-card dark:bg-slate-900 z-10 border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                          Matched Skills (Resume)
                        </td>
                        {comparedTiedCandidates.map(c => {
                          return (
                            <td key={c.candidateId} className="p-4 min-w-[300px] sm:min-w-[340px] border-r border-border last:border-r-0 align-top">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-[11px] font-bold text-muted-foreground">
                                  {c.skillsAlignment.matchedSkills.length} Matched ({c.skillsAlignment.matchRatio})
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {c.skillsAlignment.matchedSkills.length > 0 ? (
                                  c.skillsAlignment.matchedSkills.map(s => (
                                    <span
                                      key={s}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                                    >
                                      <Check size={11} className="text-emerald-600" />
                                      {s}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-xs text-muted-foreground italic">No required skills matched in resume</span>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>

                      {/* Missing Skills */}
                      <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30">
                        <td className="p-4 font-bold text-foreground sticky left-0 bg-card dark:bg-slate-900 z-10 border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                          Missing Skills
                        </td>
                        {comparedTiedCandidates.map(c => {
                          return (
                            <td key={c.candidateId} className="p-4 min-w-[300px] sm:min-w-[340px] border-r border-border last:border-r-0 align-top">
                              {c.skillsAlignment.missingSkills.length === 0 ? (
                                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 rounded-md border border-emerald-200 dark:border-emerald-800">
                                  <CheckCircle2 size={12} /> None missing (100% matched)
                                </span>
                              ) : (
                                <div className="flex flex-wrap gap-1.5">
                                  {c.skillsAlignment.missingSkills.map(s => (
                                    <span
                                      key={s}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-rose-50 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300 border border-rose-200 dark:border-rose-800"
                                    >
                                      <X size={11} className="text-rose-500" />
                                      {s}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>

                      {/* Preferred Skills (if any exist) */}
                      {comparedTiedCandidates.some(c => c.skillsAlignment?.preferredSkills?.length > 0) && (
                        <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30">
                          <td className="p-4 font-bold text-foreground sticky left-0 bg-card dark:bg-slate-900 z-10 border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                            Preferred Skills
                          </td>
                          {comparedTiedCandidates.map(c => (
                            <td key={c.candidateId} className="p-4 min-w-[300px] sm:min-w-[340px] border-r border-border last:border-r-0 align-top">
                              {(c.skillsAlignment.matchedPreferredSkills || []).length > 0 ? (
                                <div className="flex flex-wrap gap-1.5">
                                  {c.skillsAlignment.matchedPreferredSkills.map(s => (
                                    <span
                                      key={s}
                                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-50 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800"
                                    >
                                      <Check size={10} className="text-indigo-600" /> {s}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground italic">No preferred skills matched</span>
                              )}
                            </td>
                          ))}
                        </tr>
                      )}

                      {/* Additional Skills */}
                      <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30">
                        <td className="p-4 font-bold text-foreground sticky left-0 bg-card dark:bg-slate-900 z-10 border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                          Additional Resume Skills
                        </td>
                        {comparedTiedCandidates.map(c => (
                          <td key={c.candidateId} className="p-4 min-w-[300px] sm:min-w-[340px] border-r border-border last:border-r-0 align-top">
                            {c.skillsAlignment.additionalSkills.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5">
                                {c.skillsAlignment.additionalSkills.map(s => (
                                  <span
                                    key={s}
                                    className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-secondary text-foreground border border-border"
                                  >
                                    {s}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground italic">Not available</span>
                            )}
                          </td>
                        ))}
                      </tr>

                      {/* Experience Match */}
                      <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30">
                        <td className="p-4 font-bold text-foreground sticky left-0 bg-card dark:bg-slate-900 z-10 border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                          Relevant Experience
                        </td>
                        {comparedTiedCandidates.map(c => {
                          const expComp = getExpComparison(c, comparedTiedCandidates);
                          return (
                            <td key={c.candidateId} className="p-4 min-w-[300px] sm:min-w-[340px] border-r border-border last:border-r-0">
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-extrabold text-foreground text-sm">
                                  {displayValue(c.experience)}
                                </span>
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                                  expComp.status === 'highest'
                                    ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300'
                                    : expComp.status === 'lowest'
                                    ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300'
                                    : 'bg-secondary text-muted-foreground border-border'
                                }`}>
                                  {expComp.text}
                                </span>
                              </div>
                              <span className="text-[10px] text-muted-foreground block">
                                Score: {c.breakdown.experienceScore}% (Target: {job.experience || 'Not specified'})
                              </span>
                            </td>
                          );
                        })}
                      </tr>

                      {/* Role & Responsibility Relevance */}
                      <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30">
                        <td className="p-4 font-bold text-foreground sticky left-0 bg-card dark:bg-slate-900 z-10 border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                          Role & JD Relevance
                        </td>
                        {comparedTiedCandidates.map(c => {
                          const roleComp = getMetricComparison('roleScore', c, comparedTiedCandidates);
                          return (
                            <td key={c.candidateId} className="p-4 min-w-[300px] sm:min-w-[340px] border-r border-border last:border-r-0">
                              <div className="flex items-center justify-between mb-1">
                                <span className="font-extrabold text-foreground text-sm">
                                  {c.breakdown.roleScore}%
                                </span>
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                                  roleComp.status === 'highest'
                                    ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300'
                                    : roleComp.status === 'lowest'
                                    ? 'bg-rose-50 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border-rose-300'
                                    : 'bg-secondary text-muted-foreground border-border'
                                }`}>
                                  {roleComp.text}
                                </span>
                              </div>
                              <div className="h-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-purple-500 rounded-full transition-all duration-300"
                                  style={{ width: `${Math.min(100, Math.max(0, c.breakdown.roleScore))}%` }}
                                />
                              </div>
                            </td>
                          );
                        })}
                      </tr>

                      {/* Education & Qualifications */}
                      <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30">
                        <td className="p-4 font-bold text-foreground sticky left-0 bg-card dark:bg-slate-900 z-10 border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                          Education / Qualifications
                        </td>
                        {comparedTiedCandidates.map(c => (
                          <td key={c.candidateId} className="p-4 min-w-[300px] sm:min-w-[340px] border-r border-border last:border-r-0">
                            <span className="font-medium text-foreground text-xs block">
                              {displayValue(c.education)}
                            </span>
                          </td>
                        ))}
                      </tr>

                      {/* Location & Work Mode */}
                      <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30">
                        <td className="p-4 font-bold text-foreground sticky left-0 bg-card dark:bg-slate-900 z-10 border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                          Location & Work Mode
                        </td>
                        {comparedTiedCandidates.map(c => (
                          <td key={c.candidateId} className="p-4 min-w-[300px] sm:min-w-[340px] border-r border-border last:border-r-0">
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5 text-foreground font-medium">
                                <MapPin size={12} className="text-teal-600 shrink-0" />
                                <span>{displayValue(c.location)}</span>
                              </div>
                              <div className="flex items-center gap-1.5 text-muted-foreground text-[11px]">
                                <Clock size={11} className="text-indigo-500 shrink-0" />
                                <span>{displayValue(c.candidate?.workMode || job.workMode)}</span>
                              </div>
                            </div>
                          </td>
                        ))}
                      </tr>

                      {/* Current Company & Notice Period */}
                      <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-900/30">
                        <td className="p-4 font-bold text-foreground sticky left-0 bg-card dark:bg-slate-900 z-10 border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                          Company & Notice Period
                        </td>
                        {comparedTiedCandidates.map(c => (
                          <td key={c.candidateId} className="p-4 min-w-[300px] sm:min-w-[340px] border-r border-border last:border-r-0">
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5 text-foreground font-medium">
                                <Building2 size={12} className="text-slate-500 shrink-0" />
                                <span>{displayValue(c.currentCompany)}</span>
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                Notice: <strong className="text-foreground">{displayValue(c.noticePeriod)}</strong>
                              </div>
                            </div>
                          </td>
                        ))}
                      </tr>

                      {/* Key Resume Differentiator */}
                      <tr className="bg-amber-50/20 dark:bg-amber-950/10">
                        <td className="p-4 font-bold text-foreground sticky left-0 bg-slate-50 dark:bg-slate-900 z-10 border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                          Key Resume Differentiator
                        </td>
                        {comparedTiedCandidates.map(c => {
                          const diffs = getCandidateDifferentiators(c, comparedTiedCandidates, job);
                          return (
                            <td key={c.candidateId} className="p-4 min-w-[300px] sm:min-w-[340px] border-r border-border last:border-r-0 align-top">
                              <div className="space-y-2">
                                <div>
                                  <span className="text-[10px] font-black uppercase text-emerald-700 dark:text-emerald-400 block mb-1">
                                    Resume Advantage:
                                  </span>
                                  <p className="text-xs text-foreground font-semibold leading-relaxed">
                                    {diffs.advantages[0] || 'Comparable core skills profile in resume'}
                                  </p>
                                </div>
                                <div>
                                  <span className="text-[10px] font-black uppercase text-amber-700 dark:text-amber-400 block mb-1">
                                    Consideration / Factor:
                                  </span>
                                  <p className="text-xs text-muted-foreground leading-relaxed">
                                    {diffs.considerations[0] || 'Balanced requirement profile in resume'}
                                  </p>
                                </div>
                              </div>
                            </td>
                          );
                        })}
                      </tr>

                      {/* Row Actions */}
                      <tr className="bg-slate-50/60 dark:bg-slate-900/60">
                        <td className="p-4 font-bold text-foreground sticky left-0 bg-slate-50 dark:bg-slate-900 z-10 border-r border-border shadow-[2px_0_5px_-2px_rgba(0,0,0,0.06)]">
                          Action
                        </td>
                        {comparedTiedCandidates.map(c => (
                          <td key={c.candidateId} className="p-4 min-w-[300px] sm:min-w-[340px] border-r border-border last:border-r-0">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => onViewDetails && onViewDetails(c.candidate)}
                                className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-200 border border-border text-xs font-bold rounded-lg shadow-2xs transition-colors cursor-pointer"
                              >
                                <Eye size={12} className="text-indigo-600" /> Details
                              </button>
                              <button
                                type="button"
                                onClick={() => onScheduleInterview && onScheduleInterview(c.candidate)}
                                className="flex-1 inline-flex items-center justify-center gap-1 px-2.5 py-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-xs font-bold rounded-lg shadow-2xs transition-all cursor-pointer whitespace-nowrap"
                              >
                                <Calendar size={12} /> Schedule
                              </button>
                            </div>
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ── 6. Recommended Candidate Section ───────────────────── */}
              {tiedRecommendation && (
                <div className="space-y-4 pt-2">
                  {/* Section Title & Subtitle */}
                  <div className="flex items-center justify-between gap-3 flex-wrap border-b border-border/80 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center border border-amber-500/20 shadow-2xs">
                        <Award size={20} />
                      </div>
                      <div>
                        <h4 className="text-base font-extrabold text-foreground flex items-center gap-2 flex-wrap">
                          <span>Recommended Candidate</span>
                          <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
                            {activeTiedScore}% Match Group
                          </span>
                        </h4>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Evidence-based candidate recommendation and ranking derived from resume qualifications, mandatory skills coverage, and job requirements.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold px-3 py-1 rounded-full border shadow-2xs ${
                        tiedRecommendation.isClearWinner
                          ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                          : 'bg-amber-50 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                      }`}>
                        {tiedRecommendation.isClearWinner ? '✓ Clear Winner Identified' : '⚖ Equally Recommended'}
                      </span>
                    </div>
                  </div>

                  {/* Recommendation Card: Clear Winner vs. No Clear Winner */}
                  {tiedRecommendation.isClearWinner && tiedRecommendation.bestCandidate ? (
                    <div className="bg-gradient-to-br from-emerald-500/5 via-card to-indigo-500/5 border-2 border-emerald-500/30 dark:border-emerald-500/40 rounded-2xl p-5 sm:p-6 shadow-sm space-y-5">
                      {/* Top Header Row of Recommendation Card */}
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="flex items-center gap-3.5">
                          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center font-black text-lg shadow-sm">
                            {tiedRecommendation.bestCandidate.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="text-lg font-black text-foreground">
                                {tiedRecommendation.bestCandidate.name}
                              </h3>
                              <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-emerald-500 text-white shadow-2xs">
                                #1 Best Choice
                              </span>
                              <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                                {tiedRecommendation.bestCandidate.overallScore}% Resume Match
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap font-medium">
                              <span className="font-mono text-slate-500">ID: {tiedRecommendation.bestCandidate.candidateId}</span>
                              {tiedRecommendation.bestCandidate.experience && (
                                <span className="flex items-center gap-1">
                                  <Briefcase size={12} className="text-muted-foreground" />
                                  {tiedRecommendation.bestCandidate.experience}
                                </span>
                              )}
                              {tiedRecommendation.bestCandidate.currentCompany && tiedRecommendation.bestCandidate.currentCompany !== 'Not specified' && (
                                <span className="flex items-center gap-1">
                                  <Building2 size={12} className="text-muted-foreground" />
                                  {tiedRecommendation.bestCandidate.currentCompany}
                                </span>
                              )}
                              {tiedRecommendation.bestCandidate.education && (
                                <span className="flex items-center gap-1">
                                  <GraduationCap size={12} className="text-muted-foreground" />
                                  {tiedRecommendation.bestCandidate.education}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-2 self-start sm:self-center">
                          <button
                            type="button"
                            onClick={() => onViewDetails && onViewDetails(tiedRecommendation.bestCandidate.candidate)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-200 border border-border text-xs font-bold rounded-xl shadow-2xs transition-colors cursor-pointer"
                          >
                            <Eye size={13} className="text-indigo-600" /> View Details
                          </button>
                          <button
                            type="button"
                            onClick={() => onScheduleInterview && onScheduleInterview(tiedRecommendation.bestCandidate.candidate)}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold rounded-xl shadow-2xs transition-all cursor-pointer"
                          >
                            <Calendar size={13} /> Schedule Interview
                          </button>
                        </div>
                      </div>

                      {/* Explanation of why candidate is a better fit */}
                      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3.5 sm:p-4 text-xs leading-relaxed text-emerald-950 dark:text-emerald-200 flex items-start gap-2.5">
                        <Sparkles size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                        <div>
                          <span className="font-black uppercase tracking-wider text-[11px] block text-emerald-800 dark:text-emerald-300 mb-1">
                            Executive Recommendation Summary
                          </span>
                          <p className="font-medium text-foreground">
                            {tiedRecommendation.fitSummary}
                          </p>
                        </div>
                      </div>

                      {/* 3 Detail Columns: Why Recommended / Key Strengths / Important Gaps */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* 1. Why this candidate is recommended */}
                        <div className="bg-card border border-border rounded-xl p-4 space-y-2.5 shadow-2xs">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 size={15} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                            <h5 className="text-xs font-extrabold uppercase tracking-wider text-foreground">
                              Why This Candidate is Recommended
                            </h5>
                          </div>
                          <ul className="space-y-2">
                            {tiedRecommendation.recommendationReasons.map((reason, idx) => (
                              <li key={idx} className="text-xs text-foreground/90 leading-relaxed flex items-start gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 mt-1.5" />
                                <span>{reason}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* 2. Key strengths compared with other tied candidates */}
                        <div className="bg-card border border-border rounded-xl p-4 space-y-2.5 shadow-2xs">
                          <div className="flex items-center gap-2">
                            <Sparkles size={15} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
                            <h5 className="text-xs font-extrabold uppercase tracking-wider text-foreground">
                              Key Strengths vs. Other Tied Candidates
                            </h5>
                          </div>
                          <ul className="space-y-2">
                            {tiedRecommendation.comparativeStrengths.map((str, idx) => (
                              <li key={idx} className="text-xs text-foreground/90 leading-relaxed flex items-start gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0 mt-1.5" />
                                <span>{str}</span>
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* 3. Important skill or experience gaps */}
                        <div className="bg-card border border-border rounded-xl p-4 space-y-2.5 shadow-2xs">
                          <div className="flex items-center gap-2">
                            <AlertCircle size={15} className="text-amber-600 dark:text-amber-400 shrink-0" />
                            <h5 className="text-xs font-extrabold uppercase tracking-wider text-foreground">
                              Important Gaps & Considerations
                            </h5>
                          </div>
                          <ul className="space-y-2">
                            {tiedRecommendation.candidateGaps.map((gap, idx) => (
                              <li key={idx} className="text-xs text-muted-foreground leading-relaxed flex items-start gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0 mt-1.5" />
                                <span>{gap}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* Fallback: No Clear Winner */
                    <div className="bg-amber-50/50 dark:bg-amber-950/20 border-2 border-amber-300 dark:border-amber-800 rounded-2xl p-5 sm:p-6 shadow-sm space-y-4">
                      <div className="flex items-start gap-3.5">
                        <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-2xs">
                          <Scale size={20} />
                        </div>
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-base font-extrabold text-foreground">
                              No Clear Winner — Equally Recommended Profiles
                            </h3>
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700">
                              Equally Tied ({activeTiedScore}% Match)
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            {tiedRecommendation.fitSummary}
                          </p>
                        </div>
                      </div>

                      {/* Co-recommended candidates */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 pt-2">
                        {tiedRecommendation.coWinners.map(cand => (
                          <div key={cand.candidateId} className="bg-card border border-border rounded-xl p-3.5 space-y-2 shadow-2xs">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-xs text-foreground">{cand.name}</span>
                              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-bold border border-amber-300 dark:border-amber-800">
                                Co-Recommended
                              </span>
                            </div>
                            <div className="text-[11px] text-muted-foreground space-y-1">
                              <div><span className="font-semibold text-foreground">Exp:</span> {cand.experience}</div>
                              <div><span className="font-semibold text-foreground">Skills:</span> {cand.mMatched.slice(0, 3).join(', ')}</div>
                            </div>
                            <div className="pt-1 flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => onScheduleInterview && onScheduleInterview(cand.candidate)}
                                className="w-full inline-flex items-center justify-center gap-1 py-1 px-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold cursor-pointer"
                              >
                                <Calendar size={11} /> Interview
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="bg-card/70 border border-border rounded-xl p-3 text-xs text-muted-foreground flex items-center gap-2">
                        <Info size={14} className="text-indigo-600 shrink-0" />
                        <span>
                          <strong>Recommendation Guidance:</strong> Resume data alone does not provide a definitive differentiator. We advise conducting an initial technical interview with each co-recommended candidate to evaluate hands-on problem solving.
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Relative Ranking Table of All Tied Candidates */}
                  <div className="bg-card border border-border rounded-2xl p-4 sm:p-5 shadow-sm space-y-3">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <TrendingUp size={16} className="text-indigo-600" />
                        <h5 className="text-xs font-black uppercase tracking-wider text-foreground">
                          Tied Group Relative Ranking (#{activeGroupRankNumber} Overall)
                        </h5>
                      </div>
                      <span className="text-[11px] text-muted-foreground">
                        Ranked on empirical resume criteria · Overall resume match scores remain unchanged ({activeTiedScore}%)
                      </span>
                    </div>

                    <div className="overflow-x-auto border border-border rounded-xl">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-muted/50 border-b border-border text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                            <th className="py-2.5 px-3 w-36">Relative Rank</th>
                            <th className="py-2.5 px-3">Candidate</th>
                            <th className="py-2.5 px-3 text-center">Resume Match</th>
                            <th className="py-2.5 px-3">Mandatory Skills</th>
                            <th className="py-2.5 px-3">Experience</th>
                            <th className="py-2.5 px-3">Key Differentiator</th>
                            <th className="py-2.5 px-3 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {tiedRecommendation.rankedCandidates.map(cand => {
                            const isTop = cand.relativeRank === 1;
                            return (
                              <tr
                                key={cand.candidateId}
                                className={`transition-colors ${
                                  isTop
                                    ? 'bg-emerald-50/40 dark:bg-emerald-950/20 font-medium'
                                    : 'hover:bg-muted/30'
                                }`}
                              >
                                <td className="py-3 px-3">
                                  <span
                                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold ${
                                      cand.badgeType === 'winner'
                                        ? 'bg-emerald-500 text-white shadow-2xs'
                                        : cand.badgeType === 'co_winner'
                                        ? 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                                        : cand.badgeType === 'runner_up'
                                        ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
                                        : cand.badgeType === 'third'
                                        ? 'bg-purple-50 dark:bg-purple-950 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
                                        : cand.badgeType === 'fourth'
                                        ? 'bg-sky-50 dark:bg-sky-950 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800'
                                        : 'bg-secondary text-muted-foreground border border-border'
                                    }`}
                                  >
                                    {isTop && cand.badgeType === 'winner' && <Award size={11} />}
                                    {cand.rankLabel}
                                  </span>
                                </td>
                                <td className="py-3 px-3">
                                  <div>
                                    <span className="font-bold text-foreground block">{cand.name}</span>
                                    <span className="font-mono text-[10px] text-muted-foreground">{cand.candidateId}</span>
                                  </div>
                                </td>
                                <td className="py-3 px-3 text-center">
                                  <span className="font-mono font-bold text-xs px-2 py-0.5 rounded-md bg-secondary text-foreground border border-border">
                                    {cand.overallScore}%
                                  </span>
                                </td>
                                <td className="py-3 px-3">
                                  <div className="flex items-center gap-1 flex-wrap">
                                    <span className="font-bold text-xs text-foreground">
                                      {cand.mMatched.length} matched
                                    </span>
                                    {cand.uniqueMatched.length > 0 && (
                                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/60 text-indigo-800 dark:text-indigo-200">
                                        +{cand.uniqueMatched.length} exclusive
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-3 px-3 text-muted-foreground">
                                  {cand.experience}
                                </td>
                                <td className="py-3 px-3 text-foreground font-medium">
                                  {cand.rankRationale}
                                </td>
                                <td className="py-3 px-3 text-right">
                                  <div className="inline-flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => onViewDetails && onViewDetails(cand.candidate)}
                                      className="p-1 rounded-md text-slate-600 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-300 hover:bg-muted transition-colors cursor-pointer"
                                      title="View Candidate Details"
                                    >
                                      <Eye size={13} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => onScheduleInterview && onScheduleInterview(cand.candidate)}
                                      className="px-2 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[11px] transition-all cursor-pointer inline-flex items-center gap-1"
                                    >
                                      <Calendar size={11} /> Schedule
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-20 bg-card border border-border rounded-2xl p-8">
              <Scale size={36} className="mx-auto text-amber-500 mb-3" />
              <h3 className="text-base font-bold text-foreground">No Tied Candidates Available</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                Unable to find at least 2 tied candidates for this score. Return to all candidates comparison.
              </p>
              <button
                type="button"
                onClick={closeTiedComparison}
                className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                Back to All Candidates
              </button>
            </div>
          )
        )}
      </div>

      {/* ── Modal Footer ──────────────────────────────────────────────── */}
      <div className="px-6 sm:px-8 py-4 border-t border-border flex items-center justify-between bg-card shrink-0 flex-wrap gap-3">
        <div className="text-xs text-muted-foreground font-medium max-w-xl">
          {isTiedViewOpen
            ? `Comparing candidates sharing an identical overall resume match percentage of ${activeTiedScore}%. Key advantages and trade-offs are based on resume evidence.`
            : "Resume match scores are evaluated deterministically from candidate resumes and profiles against this job's requirements. Interview scores, AI evaluation ratings, and interview statuses are not used."}
        </div>
        <div className="flex items-center gap-2.5 ml-auto shrink-0">
          {isTiedViewOpen && (
            <button
              type="button"
              onClick={closeTiedComparison}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-secondary hover:bg-muted text-foreground font-bold text-xs sm:text-sm border border-border cursor-pointer transition-colors shadow-2xs"
            >
              <ArrowLeft size={14} />
              <span>Back to All Candidates</span>
            </button>
          )}
          <button
            onClick={onClose}
            className="px-6 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-100 dark:hover:bg-white dark:text-slate-900 font-bold text-xs sm:text-sm cursor-pointer transition-colors shadow-xs"
          >
            Close Comparison
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}
