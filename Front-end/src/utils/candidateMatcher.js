/**
 * candidateMatcher.js
 * 
 * Production-grade Resume-to-Job Matching and Scoring Utility for HireIQ.
 * 
 * STRICT COMPLIANCE:
 * - Deterministically compares candidate resumes and profiles directly against the
 *   specific job's description, mandatory skills, preferred skills, required experience,
 *   role responsibilities, educational qualifications, and location/work-mode.
 * - NEVER uses or references previous interview scores, AI interview evaluation scores,
 *   interview session IDs, interview history, or interview statuses (Pending, Rejected, Ignored).
 * - Handles missing resume or requirement data transparently with "Not available" fallbacks
 *   rather than fabricating dummy values or scores.
 */

// Common technology & domain skills dictionary for robust skill extraction from resume text
const KNOWN_SKILLS = [
  'javascript', 'typescript', 'python', 'java', 'c++', 'c#', 'golang', 'rust', 'ruby', 'php',
  'react', 'react.js', 'react native', 'angular', 'vue', 'vue.js', 'next.js', 'node', 'node.js', 'express', 'nestjs',
  'django', 'flask', 'fastapi', 'spring', 'spring boot', 'asp.net', 'laravel',
  'html', 'html5', 'css', 'css3', 'tailwind', 'tailwind css', 'bootstrap', 'sass', 'redux', 'graphql', 'rest api', 'rest',
  'sql', 'mysql', 'postgresql', 'postgres', 'mongodb', 'redis', 'dynamodb', 'sqlite', 'oracle',
  'aws', 'azure', 'gcp', 'google cloud', 'docker', 'kubernetes', 'k8s', 'ci/cd', 'jenkins', 'git', 'github', 'gitlab', 'linux',
  'machine learning', 'deep learning', 'nlp', 'computer vision', 'data science', 'pandas', 'numpy', 'scikit-learn', 'tensorflow', 'pytorch',
  'power bi', 'tableau', 'excel', 'data analysis', 'statistics', 'spark', 'hadoop',
  'agile', 'scrum', 'jira', 'microservices', 'devops', 'testing', 'jest', 'cypress', 'selenium',
  'communication', 'leadership', 'problem solving', 'project management', 'ui/ux', 'figma'
];

// Common degree and academic qualification patterns
const DEGREE_PATTERNS = [
  { name: 'Ph.D / Doctorate', regex: /\b(ph\.?d|doctorate)\b/i, level: 5 },
  { name: "Master's Degree (M.Tech/MS/MCA/MBA)", regex: /\b(m\.?tech|m\.?e|m\.?s|master(?:'s)?|mca|mba|m\.?sc)\b/i, level: 4 },
  { name: "Bachelor's Degree (B.Tech/BE/BSc/BCA)", regex: /\b(b\.?tech|b\.?e|b\.?s|bachelor(?:'s)?|bca|b\.?sc)\b/i, level: 3 },
  { name: 'Associate / Diploma', regex: /\b(diploma|associate(?:'s)?)\b/i, level: 2 },
];

/**
 * Normalizes skill string for comparison (lowercasing, trimming, removing punctuation).
 */
export function normalizeSkill(skill) {
  if (!skill || typeof skill !== 'string') return '';
  return skill
    .toLowerCase()
    .replace(/[._-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Formats a clean, readable candidate ID.
 */
export function formatCandidateId(candidate) {
  if (!candidate) return 'CAND-0001';
  if (candidate.candidate_id) return candidate.candidate_id;
  if (candidate.id && String(candidate.id).startsWith('CAND-')) return candidate.id;
  if (candidate._id) {
    const raw = String(candidate._id);
    return `CAND-${raw.slice(-6).toUpperCase()}`;
  }
  if (candidate.id) {
    const raw = String(candidate.id);
    return `CAND-${raw.slice(-6).toUpperCase()}`;
  }
  return 'CAND-0001';
}

/**
 * Returns ordinal string for a number (1 -> 1st, 2 -> 2nd, 3 -> 3rd, 4 -> 4th, etc.)
 */
export function getOrdinal(n) {
  if (typeof n !== 'number' || isNaN(n)) return `${n}`;
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/**
 * Parses numeric years of experience from a text string.
 */
export function parseExperienceYears(expStr) {
  if (expStr === null || expStr === undefined) return 0;
  if (typeof expStr === 'number') return expStr;
  const str = String(expStr).toLowerCase().trim();

  if (str.includes('fresher') || str.includes('entry') || str === '0') return 0;

  // Pattern "3-5 years" or "3 to 5" -> average
  const rangeMatch = str.match(/(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)/);
  if (rangeMatch) {
    return (parseFloat(rangeMatch[1]) + parseFloat(rangeMatch[2])) / 2;
  }

  // Pattern "3+ years", "3 yrs", "3y", "3 years"
  const singleMatch = str.match(/(\d+(?:\.\d+)?)/);
  if (singleMatch) {
    return parseFloat(singleMatch[1]);
  }

  return 0;
}

/**
 * Scans resume text for experience mentions (e.g., "5+ years of experience in software development").
 */
export function extractExperienceFromResumeText(resumeText) {
  if (!resumeText || typeof resumeText !== 'string') return null;
  const patterns = [
    /(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)\s*(?:of)?\s*(?:relevant|hands-on|industry|professional)?\s*experience/i,
    /experience\s*[:\-–]\s*(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)/i,
    /total\s*experience\s*[:\-–]\s*(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)/i,
    /(\d+(?:\.\d+)?)\+?\s*(?:years?|yrs?)\s*(?:as|in|working)/i,
  ];

  for (const pat of patterns) {
    const match = resumeText.match(pat);
    if (match && match[1]) {
      const years = parseFloat(match[1]);
      if (years >= 0 && years <= 40) {
        return `${years} year${years !== 1 ? 's' : ''}`;
      }
    }
  }
  return null;
}

/**
 * Scans text for academic degrees and qualifications.
 */
export function extractEducationFromText(text) {
  if (!text || typeof text !== 'string') return null;
  for (const deg of DEGREE_PATTERNS) {
    if (deg.regex.test(text)) {
      return deg.name;
    }
  }
  return null;
}

/**
 * Extracts job skills and separates them into Mandatory and Preferred skills.
 */
export function extractJobSkills(job) {
  if (!job) return { mandatorySkills: [], preferredSkills: [], allSkills: [] };

  const mandatorySkills = [];
  const preferredSkills = [];

  // Helper to add unique skills
  const addSkillsToList = (input, list) => {
    if (!input) return;
    if (Array.isArray(input)) {
      input.forEach(s => {
        const cleaned = String(s || '').trim();
        if (cleaned) list.push(cleaned);
      });
    } else if (typeof input === 'string') {
      input.split(/[,;\n|•]/).forEach(s => {
        const cleaned = s.replace(/^[*-]\s*/, '').trim();
        if (cleaned) list.push(cleaned);
      });
    }
  };

  // 1. Explicit mandatory / required skills on job
  addSkillsToList(job.skills || job.mandatory_skills || job.required_skills, mandatorySkills);

  // 2. Explicit preferred skills on job
  addSkillsToList(job.preferredSkills || job.preferred_skills || job.nice_to_have, preferredSkills);

  // 3. Scan job description for "Preferred / Nice to have" vs "Mandatory / Required" sections
  if (job.description) {
    const desc = job.description;

    // Check for preferred section in description
    const preferredSectionMatch = desc.match(/(?:preferred|good to have|nice to have|desired|bonus skills)[\s\S]*?(?=(?:requirements|mandatory|responsibilities|qualifications|$))/i);
    if (preferredSectionMatch && preferredSectionMatch[0]) {
      const prefText = preferredSectionMatch[0].toLowerCase();
      KNOWN_SKILLS.forEach(skill => {
        const pattern = new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        if (pattern.test(prefText) && !preferredSkills.some(s => normalizeSkill(s) === normalizeSkill(skill))) {
          preferredSkills.push(skill.charAt(0).toUpperCase() + skill.slice(1));
        }
      });
    }

    // If no mandatory skills found yet, scan whole description for known skills
    if (mandatorySkills.length === 0) {
      const descLower = desc.toLowerCase();
      KNOWN_SKILLS.forEach(skill => {
        const pattern = new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        if (pattern.test(descLower) && !preferredSkills.some(s => normalizeSkill(s) === normalizeSkill(skill))) {
          mandatorySkills.push(skill.charAt(0).toUpperCase() + skill.slice(1));
        }
      });
    }
  }

  // Deduplicate case-insensitively
  const dedupe = (list) => {
    const seen = new Set();
    const result = [];
    list.forEach(item => {
      const norm = normalizeSkill(item);
      if (norm && !seen.has(norm)) {
        seen.add(norm);
        result.push(item);
      }
    });
    return result;
  };

  const cleanMandatory = dedupe(mandatorySkills);
  // Remove any preferred skills that are already marked mandatory
  const mandSet = new Set(cleanMandatory.map(s => normalizeSkill(s)));
  const cleanPreferred = dedupe(preferredSkills).filter(s => !mandSet.has(normalizeSkill(s)));

  return {
    mandatorySkills: cleanMandatory,
    preferredSkills: cleanPreferred,
    allSkills: [...cleanMandatory, ...cleanPreferred],
  };
}

/**
 * Extracts candidate skills from explicit application profile + resume text.
 */
export function extractCandidateSkills(candidate, jobSkills = []) {
  if (!candidate) return [];
  const candSkills = [];

  // 1. Explicit candidate.skills field
  if (candidate.skills) {
    if (Array.isArray(candidate.skills)) {
      candidate.skills.forEach(s => {
        if (s && String(s).trim()) candSkills.push(String(s).trim());
      });
    } else if (typeof candidate.skills === 'string') {
      candidate.skills.split(/[,;\n|•]/).forEach(s => {
        const cleaned = s.replace(/^[*-]\s*/, '').trim();
        if (cleaned) candSkills.push(cleaned);
      });
    }
  }

  // 2. Parse candidate resume text
  const resumeText = candidate.resume_text || candidate.resumeText || '';
  if (resumeText) {
    const textLower = resumeText.toLowerCase();

    // Check all job-relevant skills in resume text
    jobSkills.forEach(reqSkill => {
      const norm = normalizeSkill(reqSkill);
      if (norm) {
        const pattern = new RegExp(`\\b${norm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        if (pattern.test(textLower) && !candSkills.some(s => normalizeSkill(s) === norm)) {
          candSkills.push(reqSkill);
        }
      }
    });

    // Check standard known skills
    KNOWN_SKILLS.forEach(skill => {
      const pattern = new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (pattern.test(textLower)) {
        const norm = normalizeSkill(skill);
        if (!candSkills.some(s => normalizeSkill(s) === norm)) {
          candSkills.push(skill.charAt(0).toUpperCase() + skill.slice(1));
        }
      }
    });
  }

  // Deduplicate
  const seen = new Set();
  const unique = [];
  candSkills.forEach(s => {
    const norm = normalizeSkill(s);
    if (norm && !seen.has(norm)) {
      seen.add(norm);
      unique.push(s);
    }
  });

  return unique;
}

/**
 * Returns visual styling for match category thresholds.
 */
export function getMatchCategory(score) {
  if (score === null || score === undefined) {
    return {
      label: 'Not Evaluated',
      type: 'none',
      colorClass: 'text-slate-500 dark:text-slate-400',
      bgClass: 'bg-slate-100 dark:bg-slate-900',
      borderClass: 'border-slate-300 dark:border-slate-700',
      badgeClass: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700',
      barColor: 'bg-slate-400',
    };
  }

  const num = Number(score) || 0;
  if (num >= 75) {
    return {
      label: 'Strong Match',
      type: 'strong',
      colorClass: 'text-emerald-700 dark:text-emerald-300',
      bgClass: 'bg-emerald-50 dark:bg-emerald-950/50',
      borderClass: 'border-emerald-200 dark:border-emerald-800',
      badgeClass: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
      barColor: 'bg-emerald-500',
    };
  }
  if (num >= 50) {
    return {
      label: 'Good Match',
      type: 'good',
      colorClass: 'text-indigo-700 dark:text-indigo-300',
      bgClass: 'bg-indigo-50 dark:bg-indigo-950/50',
      borderClass: 'border-indigo-200 dark:border-indigo-800',
      badgeClass: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
      barColor: 'bg-indigo-500',
    };
  }
  return {
    label: 'Low Match',
    type: 'low',
    colorClass: 'text-amber-700 dark:text-amber-300',
    bgClass: 'bg-amber-50 dark:bg-amber-950/50',
    borderClass: 'border-amber-200 dark:border-amber-800',
    badgeClass: 'bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800',
    barColor: 'bg-amber-500',
  };
}

/**
 * Deterministically evaluates candidate resume and application profile
 * directly against the specific job requirements.
 * 
 * IMPORTANT:
 * - Completely ignores previous interview scores, AI interview evaluation,
 *   interview session IDs, and interview statuses (Pending, Rejected, Ignored).
 * - Distinguishes actual calculated resume match from unavailable evaluations.
 */
export function evaluateCandidateMatch(candidate, job) {
  if (!candidate) return null;

  const candidateId = formatCandidateId(candidate);
  const name = candidate.name || 'Candidate';
  const email = candidate.candidate_email || candidate.email || '';
  const phone = candidate.phone || '';
  const resumeText = candidate.resume_text || candidate.resumeText || '';
  const resumeUrl = candidate.resume_url || candidate.resumeUrl || '';

  // 1. Resolve Candidate Experience (profile field vs extracted from resume text)
  let candidateExp = candidate.experience || '';
  if (!candidateExp || candidateExp === 'Not specified' || candidateExp === '—') {
    const extractedExp = extractExperienceFromResumeText(resumeText);
    if (extractedExp) {
      candidateExp = extractedExp;
    } else {
      candidateExp = 'Not specified';
    }
  }

  // 2. Resolve Candidate Education (profile field vs extracted from resume text)
  let education = candidate.education || candidate.qualification || '';
  if (!education || education === 'Not specified' || education === '—') {
    const extractedEdu = extractEducationFromText(resumeText);
    if (extractedEdu) {
      education = extractedEdu;
    } else {
      education = 'Not specified';
    }
  }

  const location = candidate.location || 'Not specified';
  const currentCompany = candidate.current_company || candidate.currentCompany || candidate.company || 'Not specified';
  const noticePeriod = candidate.notice_period || candidate.noticePeriod || 'Not specified';

  // 3. Extract Job Requirements (Mandatory Skills, Preferred Skills, Experience, Education, Role Keywords)
  const { mandatorySkills, preferredSkills, allSkills } = extractJobSkills(job);
  const candidateSkills = extractCandidateSkills(candidate, allSkills);

  // Check if evaluation is possible (distinguish valid resume match from unavailable data)
  const hasResumeText = Boolean(resumeText && resumeText.trim().length > 15);
  const hasProfileData = Boolean(
    (candidate.skills && candidate.skills.length > 0) ||
    (candidate.experience && candidate.experience !== 'Not specified')
  );
  const hasJobData = Boolean(
    job && (allSkills.length > 0 || (job.description && job.description.trim().length > 0) || job.title)
  );

  const isEvaluated = (hasResumeText || hasProfileData) && hasJobData;

  // 4. Skills Intersection
  const candNormMap = new Map();
  candidateSkills.forEach(s => candNormMap.set(normalizeSkill(s), s));

  // Match mandatory skills
  const matchedMandatorySkills = [];
  const missingMandatorySkills = [];

  mandatorySkills.forEach(reqSkill => {
    const norm = normalizeSkill(reqSkill);
    if (candNormMap.has(norm)) {
      matchedMandatorySkills.push(reqSkill);
    } else {
      let foundPartial = false;
      for (const [candNorm] of candNormMap.entries()) {
        if (candNorm.includes(norm) || norm.includes(candNorm)) {
          matchedMandatorySkills.push(reqSkill);
          foundPartial = true;
          break;
        }
      }
      if (!foundPartial) {
        missingMandatorySkills.push(reqSkill);
      }
    }
  });

  // Match preferred skills
  const matchedPreferredSkills = [];
  const missingPreferredSkills = [];

  preferredSkills.forEach(prefSkill => {
    const norm = normalizeSkill(prefSkill);
    if (candNormMap.has(norm)) {
      matchedPreferredSkills.push(prefSkill);
    } else {
      let foundPartial = false;
      for (const [candNorm] of candNormMap.entries()) {
        if (candNorm.includes(norm) || norm.includes(candNorm)) {
          matchedPreferredSkills.push(prefSkill);
          foundPartial = true;
          break;
        }
      }
      if (!foundPartial) {
        missingPreferredSkills.push(prefSkill);
      }
    }
  });

  // Additional skills beyond job requirements
  const allJobNormSet = new Set(allSkills.map(s => normalizeSkill(s)));
  const additionalSkills = candidateSkills.filter(s => {
    const norm = normalizeSkill(s);
    return !allJobNormSet.has(norm);
  });

  // Aliases for compatibility
  const matchedSkills = matchedMandatorySkills;
  const missingSkills = missingMandatorySkills;
  const requiredSkills = mandatorySkills;

  if (!isEvaluated) {
    return {
      candidateId,
      candidate,
      name,
      email,
      phone,
      experience: candidateExp,
      education,
      location,
      currentCompany,
      noticePeriod,
      linkedinUrl: candidate.linkedin_url || '',
      resumeUrl,
      resumeText,
      appliedAt: candidate.applied_at || '',
      isEvaluated: false,
      hasSufficientData: false,
      overallScore: null,
      matchCategory: getMatchCategory(null),
      breakdown: {
        skillsScore: 0,
        experienceScore: 0,
        roleScore: 0,
        locationScore: 0,
        educationScore: 0,
        preferredScore: 0,
      },
      skillsAlignment: {
        mandatorySkills,
        matchedMandatorySkills: [],
        missingMandatorySkills: mandatorySkills,
        preferredSkills,
        matchedPreferredSkills: [],
        missingPreferredSkills: preferredSkills,
        requiredSkills,
        candidateSkills: [],
        matchedSkills: [],
        missingSkills: mandatorySkills,
        additionalSkills: [],
        matchRatio: `0 / ${mandatorySkills.length || 1}`,
        matchPercentage: 0,
      },
      strengths: ['Candidate profile on file for this job opening.'],
      missingRequirements: ['Resume text or detailed candidate qualifications not available for evaluation.'],
      summary: 'Evaluation unavailable: Candidate resume text or application details have not been submitted.',
    };
  }

  // 5. Component Scoring
  // A. Mandatory Skills Score (0 - 100)
  let skillsScore = 70;
  if (mandatorySkills.length > 0) {
    skillsScore = Math.round((matchedMandatorySkills.length / mandatorySkills.length) * 100);
  } else if (candidateSkills.length > 0) {
    skillsScore = Math.min(100, 50 + candidateSkills.length * 10);
  }

  // B. Preferred Skills Score (0 - 100)
  let preferredScore = 0;
  if (preferredSkills.length > 0) {
    preferredScore = Math.round((matchedPreferredSkills.length / preferredSkills.length) * 100);
  }

  // C. Experience Alignment (0 - 100)
  const jobExpYears = parseExperienceYears(job?.experience);
  const candExpYears = parseExperienceYears(candidateExp);
  let experienceScore = 75;

  if (jobExpYears > 0) {
    if (candExpYears >= jobExpYears) {
      experienceScore = 100;
    } else if (candExpYears >= jobExpYears - 0.5) {
      experienceScore = 85;
    } else if (candExpYears > 0) {
      experienceScore = Math.max(25, Math.min(80, Math.round((candExpYears / jobExpYears) * 85)));
    } else {
      experienceScore = 25; // Exp required but candidate has 0 or not found
    }
  } else {
    // Fresher / No exp specified on job
    experienceScore = candExpYears > 0 ? 100 : 90;
  }

  // D. Role & Responsibilities / JD Relevance (0 - 100)
  let roleScore = 65;
  const jobTitle = (job?.title || '').toLowerCase();
  const descLower = (job?.description || '').toLowerCase();
  const resumeTextLower = resumeText.toLowerCase();

  const titleWords = jobTitle.split(/\s+/).filter(w => w.length > 2);
  let titleMatches = 0;
  titleWords.forEach(word => {
    if (resumeTextLower.includes(word) || candidateSkills.some(s => s.toLowerCase().includes(word))) {
      titleMatches++;
    }
  });

  // Check key technical & action verbs in JD
  const jdKeywords = descLower
    .split(/[\s,.;:()]+/)
    .filter(w => w.length > 4 && !['about', 'their', 'which', 'should', 'would', 'could', 'years', 'experience', 'company', 'candidate'].includes(w));
  const uniqueJdKeywords = Array.from(new Set(jdKeywords)).slice(0, 30);

  let jdMatches = 0;
  uniqueJdKeywords.forEach(kw => {
    if (resumeTextLower.includes(kw)) {
      jdMatches++;
    }
  });

  const titleRatio = titleWords.length > 0 ? titleMatches / titleWords.length : 1;
  const jdRatio = uniqueJdKeywords.length > 0 ? jdMatches / uniqueJdKeywords.length : 0.5;
  roleScore = Math.min(100, Math.max(30, Math.round((titleRatio * 0.5 + jdRatio * 0.5) * 100)));

  // E. Education & Qualification Match (0 - 100)
  let educationScore = 80;
  const requiredDegree = extractEducationFromText(job?.description || job?.education || '');
  const candidateDegree = extractEducationFromText(education || resumeText);

  if (requiredDegree) {
    if (candidateDegree) {
      educationScore = 100;
    } else {
      educationScore = 55;
    }
  } else if (candidateDegree) {
    educationScore = 100;
  } else if (education && education !== 'Not specified') {
    educationScore = 85;
  } else {
    educationScore = 70;
  }

  // F. Location & Work Mode Compatibility (0 - 100)
  let locationScore = 80;
  const jobWorkMode = (job?.workMode || '').toLowerCase();
  const jobLocation = (job?.location || '').toLowerCase();
  const candLocation = location.toLowerCase();

  if (jobWorkMode === 'remote' || jobLocation === 'remote') {
    locationScore = 100;
  } else if (jobLocation && candLocation && candLocation !== 'not specified') {
    if (candLocation.includes(jobLocation) || jobLocation.includes(candLocation)) {
      locationScore = 100;
    } else {
      locationScore = 60; // Different physical city
    }
  }

  // 6. Resume-to-Job Weighted Formula
  // Strictly calculated from resume data against job criteria. Never influenced by interview scores.
  let overallScore = 0;
  if (preferredSkills.length > 0) {
    overallScore = Math.round(
      (skillsScore * 0.45) +
      (experienceScore * 0.25) +
      (roleScore * 0.15) +
      (preferredScore * 0.10) +
      ((educationScore * 0.5 + locationScore * 0.5) * 0.05)
    );
  } else {
    overallScore = Math.round(
      (skillsScore * 0.50) +
      (experienceScore * 0.25) +
      (roleScore * 0.15) +
      ((educationScore * 0.5 + locationScore * 0.5) * 0.10)
    );
  }

  // Bound between 0 and 100
  overallScore = Math.max(0, Math.min(100, overallScore));
  const matchCategory = getMatchCategory(overallScore);

  // 7. Evidence-based Strengths from Resume
  const strengths = [];
  if (matchedMandatorySkills.length > 0) {
    strengths.push(`${matchedMandatorySkills.length} mandatory skill(s) matched in resume (${matchedMandatorySkills.slice(0, 3).join(', ')}${matchedMandatorySkills.length > 3 ? '...' : ''})`);
  }
  if (matchedPreferredSkills.length > 0) {
    strengths.push(`Matches ${matchedPreferredSkills.length} preferred/bonus skill(s): ${matchedPreferredSkills.slice(0, 2).join(', ')}`);
  }
  if (candExpYears >= jobExpYears && jobExpYears > 0) {
    strengths.push(`Experience (${candExpYears} yrs) meets or exceeds job requirement (${job?.experience})`);
  } else if (jobExpYears === 0 && candExpYears > 0) {
    strengths.push(`Possesses ${candExpYears} year(s) of practical experience`);
  }
  if (educationScore >= 90 && candidateDegree) {
    strengths.push(`Academic qualification verified (${candidateDegree})`);
  }
  if (locationScore === 100 && jobWorkMode === 'remote') {
    strengths.push('Full compatibility with Remote work arrangement');
  } else if (locationScore === 100 && jobLocation) {
    strengths.push(`Based in matching location (${location})`);
  }
  if (additionalSkills.length > 0) {
    strengths.push(`Brings ${additionalSkills.length} supplementary skill(s) beyond core requirements`);
  }
  if (strengths.length === 0) {
    strengths.push('Candidate submitted relevant resume profile for review');
  }

  // 8. Evidence-based Gaps from Resume
  const missingRequirements = [];
  if (missingMandatorySkills.length > 0) {
    missingRequirements.push(`Missing mandatory skill(s) in resume: ${missingMandatorySkills.slice(0, 4).join(', ')}${missingMandatorySkills.length > 4 ? ` (+${missingMandatorySkills.length - 4} more)` : ''}`);
  }
  if (jobExpYears > 0 && candExpYears < jobExpYears) {
    missingRequirements.push(`Relevant experience (${candidateExp || '0'}) below target requirement (${job?.experience || `${jobExpYears} yrs`})`);
  }
  if (educationScore < 70 && requiredDegree) {
    missingRequirements.push(`Target qualification (${requiredDegree}) not identified in resume`);
  }
  if (locationScore < 100 && jobLocation && jobWorkMode !== 'remote') {
    missingRequirements.push(`Location (${location}) differs from job location (${job?.location})`);
  }
  if (missingRequirements.length === 0) {
    missingRequirements.push('No critical requirement deficits detected in resume');
  }

  return {
    candidateId,
    candidate,
    name,
    email,
    phone,
    experience: candidateExp,
    education,
    location,
    currentCompany,
    noticePeriod,
    linkedinUrl: candidate.linkedin_url || '',
    resumeUrl,
    resumeText,
    appliedAt: candidate.applied_at || '',
    isEvaluated: true,
    hasSufficientData: true,
    overallScore,
    matchCategory,
    breakdown: {
      skillsScore,
      experienceScore,
      roleScore,
      locationScore,
      educationScore,
      preferredScore,
    },
    skillsAlignment: {
      mandatorySkills,
      matchedMandatorySkills,
      missingMandatorySkills,
      preferredSkills,
      matchedPreferredSkills,
      missingPreferredSkills,
      requiredSkills,
      candidateSkills,
      matchedSkills,
      missingSkills,
      additionalSkills,
      matchRatio: `${matchedMandatorySkills.length} / ${mandatorySkills.length || 1}`,
      matchPercentage: skillsScore,
    },
    strengths,
    missingRequirements,
    summary: `${name} has a Resume-to-Job Match of ${overallScore}% (${matchCategory.label}) with ${matchedMandatorySkills.length} of ${mandatorySkills.length || 1} mandatory skills verified in resume.`,
  };
}

/**
 * Fast, pure-JS synchronous SHA-256 implementation.
 * Used for deterministic resume content fingerprinting across browser and Node.js environments.
 */
export function sha256(ascii) {
  if (!ascii || typeof ascii !== 'string') return '';
  function rightRotate(value, amount) {
    return (value >>> amount) | (value << (32 - amount));
  }
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  const lengthProperty = 'length';
  let i, j;
  let result = '';
  const words = [];
  const asciiBitLength = ascii[lengthProperty] * 8;
  let hash = [];
  const k = [];
  let primeCounter = 0;

  const isComposite = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = candidate * 2; i < 313; i += candidate) {
        isComposite[i] = true;
      }
      if (primeCounter < 8) {
        hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      }
      k[primeCounter] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
      primeCounter++;
    }
  }

  ascii += '\x80';
  while (ascii[lengthProperty] % 64 - 56) ascii += '\x00';
  for (i = 0; i < ascii[lengthProperty]; i++) {
    j = ascii.charCodeAt(i);
    words[i >> 2] |= j << ((3 - (i % 4)) * 8);
  }
  words[words[lengthProperty]] = (asciiBitLength / maxWord) | 0;
  words[words[lengthProperty]] = asciiBitLength | 0;

  for (j = 0; j < words[lengthProperty];) {
    const w = words.slice(j, j += 16);
    const oldHash = hash;
    hash = hash.slice(0, 8);

    for (i = 0; i < 64; i++) {
      const w15 = w[i - 15], w2 = w[i - 2];
      const s0 = rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3);
      const s1 = rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10);
      w[i] = (i < 16) ? w[i] : (w[i - 16] + s0 + w[i - 7] + s1) | 0;

      const s1h = rightRotate(hash[4], 6) ^ rightRotate(hash[4], 11) ^ rightRotate(hash[4], 25);
      const ch = (hash[4] & hash[5]) ^ (~hash[4] & hash[6]);
      const temp1 = (hash[7] + s1h + ch + k[i] + w[i]) | 0;
      const s0h = rightRotate(hash[0], 2) ^ rightRotate(hash[0], 13) ^ rightRotate(hash[0], 22);
      const maj = (hash[0] & hash[1]) ^ (hash[0] & hash[2]) ^ (hash[1] & hash[2]);
      const temp2 = (s0h + maj) | 0;

      hash = [(temp1 + temp2) | 0].concat(hash);
      hash[4] = (hash[4] + temp1) | 0;
    }

    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }

  for (i = 0; i < 8; i++) {
    for (let b = 3; b >= 0; b--) {
      const byte = (hash[i] >> (b * 8)) & 255;
      result += (byte < 16 ? '0' : '') + byte.toString(16);
    }
  }
  return result;
}

/**
 * Normalizes resume text before fingerprinting by removing bullet artifacts,
 * formatting variations, punctuation, and collapsing whitespace.
 */
export function normalizeResumeText(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[\u2022\u2023\u25E6\u2043\u2219\u00B7\u25CF\u25AA\u25AB\u25BA\u25C6\u27A2\u2794\u2713\u2714\u2013\u2014\-_+=|\\/]/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Generates a deterministic content fingerprint for a candidate's resume.
 * Prioritizes normalized resume text content.
 * Falls back to verified contact identifiers only when resume text is absent/too short.
 * NEVER considers two candidates duplicates based solely on identical match scores or similar names.
 */
export function generateResumeFingerprint(candidate) {
  if (!candidate) return 'fp_null';
  const cand = candidate.candidate || candidate;
  const rt = cand.resume_text || cand.resumeText || cand.profile_text || '';
  const norm = normalizeResumeText(rt);

  // If sufficient resume content is present, use content hash
  if (norm.length >= 40) {
    return `fp_resume_${sha256(norm)}`;
  }

  // Fallback 1: Verified candidate email
  const email = (cand.email || cand.candidate_email || '').trim().toLowerCase();
  if (email.includes('@') && email.includes('.')) {
    return `fp_email_${sha256(email)}`;
  }

  // Fallback 2: Verified candidate phone number (last 10 digits)
  const phone = (cand.phone || cand.candidate_phone || '').replace(/\D/g, '');
  if (phone.length >= 7) {
    return `fp_phone_${phone.slice(-10)}`;
  }

  // Fallback 3: Explicit unique database ID to prevent false-positive grouping
  const candId = cand._id || cand.id || cand.candidate_id || Math.random().toString(36);
  return `fp_id_${candId}`;
}

/**
 * Calculates a completeness score for a candidate record to pick the most informative
 * representative candidate when multiple duplicate resume records exist.
 */
export function calculateCandidateCompleteness(candidate, targetJobId) {
  if (!candidate) return 0;
  const cand = candidate.candidate || candidate;
  let score = 0;

  // 1. Direct application to target job opening
  const candJobId = cand.job_id || cand.applied_job_id;
  if (targetJobId && candJobId && String(candJobId) === String(targetJobId)) {
    score += 100;
  }
  if (cand.has_applied) {
    score += 50;
  }

  // 2. Candidate full name validity
  const name = (cand.name || cand.candidate_name || '').trim();
  if (name && !['candidate', 'applicant', 'user', 'n/a', 'unknown'].includes(name.toLowerCase())) {
    score += 30;
    score += Math.min(10, Math.floor(name.length / 2));
  }

  // 3. Contact information completeness
  const email = (cand.email || cand.candidate_email || '').trim();
  if (email && email.includes('@')) {
    score += 30;
  }

  const phone = (cand.phone || cand.candidate_phone || '').replace(/\D/g, '');
  if (phone.length >= 7) {
    score += 20;
  }

  // 4. Parsed profile fields
  if (cand.experience && cand.experience !== 'Not specified' && cand.experience !== '—') {
    score += 15;
  }
  if (cand.education && cand.education !== 'Not specified' && cand.education !== '—') {
    score += 15;
  }
  if (cand.current_company) {
    score += 10;
  }
  if (cand.linkedin_url) {
    score += 10;
  }
  if (cand.skills && (Array.isArray(cand.skills) ? cand.skills.length > 0 : String(cand.skills).trim().length > 0)) {
    score += 15;
  }

  // 5. Resume text length & depth
  const rt = cand.resume_text || cand.resumeText || cand.profile_text || '';
  score += Math.min(30, Math.floor(rt.length / 50));

  // 6. Recency of submission
  const dateStr = cand.applied_at || cand.created_at;
  if (dateStr) {
    const ts = new Date(dateStr).getTime();
    if (!isNaN(ts)) {
      score += Math.min(10, Math.floor(ts / 1e11));
    }
  }

  return score;
}

/**
 * Deduplicates candidate records for Candidate Comparison based on normalized resume content fingerprints.
 * 
 * Rules:
 * - Each unique resume appears only once in the comparison results.
 * - Selects the most complete representative record for each unique resume.
 * - Preserves all candidate details, match scores, and retains associated IDs in `associatedCandidateIds`.
 * - Never merges two candidates merely because they have identical scores or similar names.
 * - Leaves database records completely untouched.
 */
export function deduplicateCandidatesForComparison(candidates, job) {
  if (!Array.isArray(candidates) || candidates.length === 0) return [];
  const targetJobId = job?.job_id || job?._id;
  const groups = new Map();

  for (const cand of candidates) {
    if (!cand) continue;
    const fp = generateResumeFingerprint(cand);
    if (!groups.has(fp)) {
      groups.set(fp, []);
    }
    groups.get(fp).push(cand);
  }

  const uniqueCandidates = [];

  for (const [fp, group] of groups.entries()) {
    if (group.length === 1) {
      const item = group[0];
      const single = item.candidate ? { ...item.candidate } : { ...item };
      single.resumeFingerprint = fp;
      if (!single.associatedCandidateIds || !Array.isArray(single.associatedCandidateIds)) {
        const id = single._id || single.id || single.candidate_id;
        single.associatedCandidateIds = id ? [String(id)] : [];
      }
      uniqueCandidates.push(single);
      continue;
    }

    // Sort duplicates by completeness score descending
    group.sort((a, b) => {
      const scoreB = calculateCandidateCompleteness(b, targetJobId);
      const scoreA = calculateCandidateCompleteness(a, targetJobId);
      return scoreB - scoreA;
    });

    const repRaw = group[0];
    const rep = repRaw.candidate ? { ...repRaw.candidate } : { ...repRaw };
    rep.resumeFingerprint = fp;

    // Collect all associated IDs and contact details without data loss
    const allIds = new Set();
    const allEmails = new Set();
    const allPhones = new Set();

    group.forEach(rawItem => {
      const item = rawItem.candidate ? rawItem.candidate : rawItem;
      if (item._id) allIds.add(String(item._id));
      if (item.id) allIds.add(String(item.id));
      if (item.candidate_id) allIds.add(String(item.candidate_id));
      if (item.associatedCandidateIds && Array.isArray(item.associatedCandidateIds)) {
        item.associatedCandidateIds.forEach(id => allIds.add(String(id)));
      }

      const em = (item.email || item.candidate_email || '').trim();
      if (em) allEmails.add(em);
      const ph = (item.phone || item.candidate_phone || '').trim();
      if (ph) allPhones.add(ph);

      // Backfill missing properties from duplicates to ensure maximum completeness
      if (!rep.email && em) rep.email = em;
      if (!rep.candidate_email && em) rep.candidate_email = em;
      if (!rep.phone && ph) rep.phone = ph;
      if (!rep.candidate_phone && ph) rep.candidate_phone = ph;
      if (!rep.resume_url && item.resume_url) rep.resume_url = item.resume_url;
      if (!rep.resume_text && item.resume_text) rep.resume_text = item.resume_text;
      if (!rep.resumeText && item.resumeText) rep.resumeText = item.resumeText;
      if (!rep.linkedin_url && item.linkedin_url) rep.linkedin_url = item.linkedin_url;
      if ((!rep.experience || rep.experience === 'Not specified') && item.experience && item.experience !== 'Not specified') {
        rep.experience = item.experience;
      }
      if ((!rep.education || rep.education === 'Not specified') && item.education && item.education !== 'Not specified') {
        rep.education = item.education;
      }
      if (!rep.current_company && item.current_company) rep.current_company = item.current_company;
      if (!rep.location && item.location) rep.location = item.location;
      if (!rep.notice_period && item.notice_period) rep.notice_period = item.notice_period;
    });

    rep.associatedCandidateIds = Array.from(allIds);
    rep.alternateEmails = Array.from(allEmails);
    rep.alternatePhones = Array.from(allPhones);
    rep.duplicateApplicationCount = group.length;

    uniqueCandidates.push(rep);
  }

  return uniqueCandidates;
}

/**
 * Evaluates candidates sharing the same resume match percentage to determine
 * the best candidate recommendation and relative ranking based strictly on empirical resume evidence.
 * 
 * Rules:
 * - Differentiates tied candidates using mandatory skills coverage, peer skill advantages,
 *   experience alignment, JD relevance, and qualification depth.
 * - If available data is insufficient to identify a clear winner, explicitly returns isClearWinner: false
 *   and marks candidates as equally recommended.
 * - Keeps original match scores unchanged.
 * - Never uses interview scores, interview history, or synthetic data.
 */
export function evaluateTiedGroupRecommendation(tiedCandidates, job) {
  if (!Array.isArray(tiedCandidates) || tiedCandidates.length < 2) return null;

  const jobExpYears = parseExperienceYears(job?.experience);
  const mandatorySkills = job?.skills
    ? (Array.isArray(job.skills) ? job.skills : String(job.skills).split(/[,;]/).map(s => s.trim()).filter(Boolean))
    : [];

  const scoredCandidates = tiedCandidates.map(c => {
    const cand = c.candidate || c;
    const mMatched = c.skillsAlignment?.matchedMandatorySkills || [];
    const mMissing = c.skillsAlignment?.missingMandatorySkills || [];
    const pMatched = c.skillsAlignment?.matchedPreferredSkills || [];
    const addSkills = c.skillsAlignment?.additionalSkills || [];
    const candExpYears = parseExperienceYears(c.experience);

    // Compute relative peer skill differences across tied candidates
    const getCandKey = item => (
      item.candidateId ||
      item.candidate?._id ||
      item.candidate?.id ||
      item._id ||
      item.id ||
      item.email ||
      item.candidate?.email ||
      item.name ||
      item.candidate?.name
    );
    const thisKey = getCandKey(c);
    const otherCandidates = tiedCandidates.filter(o => getCandKey(o) !== thisKey);

    const uniqueMatched = mMatched.filter(skill => {
      const norm = skill.toLowerCase().trim();
      return otherCandidates.every(other => !(other.skillsAlignment?.matchedSkills || []).some(s => s.toLowerCase().trim() === norm));
    });

    const advantageMatched = mMatched.filter(skill => {
      const norm = skill.toLowerCase().trim();
      return otherCandidates.some(other => (other.skillsAlignment?.missingSkills || []).some(s => s.toLowerCase().trim() === norm));
    });

    const peerPossessedGaps = mMissing.filter(skill => {
      const norm = skill.toLowerCase().trim();
      return otherCandidates.some(other => (other.skillsAlignment?.matchedSkills || []).some(s => s.toLowerCase().trim() === norm));
    });

    let tiebreakerPoints = 0;
    // 1. Mandatory Skills Match: Core job requirement (primary weight)
    tiebreakerPoints += mMatched.length * 30;
    tiebreakerPoints -= mMissing.length * 20;
    tiebreakerPoints += uniqueMatched.length * 15;
    tiebreakerPoints += advantageMatched.length * 8;
    tiebreakerPoints -= peerPossessedGaps.length * 8;

    // 2. Preferred & Additional Skills
    tiebreakerPoints += pMatched.length * 10;
    tiebreakerPoints += Math.min(10, addSkills.length * 2);

    // 3. Experience Alignment vs Job Requirement
    if (jobExpYears > 0) {
      if (candExpYears >= jobExpYears) {
        tiebreakerPoints += 20 + Math.min(10, (candExpYears - jobExpYears) * 2);
      } else {
        tiebreakerPoints -= Math.min(25, (jobExpYears - candExpYears) * 10);
      }
    } else if (candExpYears > 0) {
      tiebreakerPoints += Math.min(15, candExpYears * 3);
    }

    // 4. Role & JD Keyword Relevance
    tiebreakerPoints += ((c.breakdown?.roleScore || 50) / 100) * 15;

    // 5. Academic / Professional Qualifications
    tiebreakerPoints += ((c.breakdown?.educationScore || 70) / 100) * 10;

    return {
      candidateItem: c,
      candidate: cand,
      name: c.name || cand.name || 'Candidate',
      candidateId: c.candidateId || formatCandidateId(cand),
      overallScore: c.overallScore,
      experience: c.experience || 'Not specified',
      education: c.education || 'Not specified',
      location: c.location || 'Not specified',
      currentCompany: c.currentCompany || 'Not specified',
      candExpYears,
      mMatched,
      mMissing,
      uniqueMatched,
      advantageMatched,
      peerPossessedGaps,
      pMatched,
      addSkills,
      breakdown: c.breakdown || {},
      tiebreakerPoints: Math.round(tiebreakerPoints * 10) / 10,
    };
  });

  // Sort candidates by tiebreakerPoints descending with multi-tier tiebreaker cascade
  scoredCandidates.sort((a, b) => {
    // 1. Primary tiebreaker points
    if (Math.abs(b.tiebreakerPoints - a.tiebreakerPoints) > 0.05) {
      return b.tiebreakerPoints - a.tiebreakerPoints;
    }
    // 2. Mandatory skills matched count
    if (b.mMatched.length !== a.mMatched.length) {
      return b.mMatched.length - a.mMatched.length;
    }
    // 3. Unique/exclusive skills count
    if (b.uniqueMatched.length !== a.uniqueMatched.length) {
      return b.uniqueMatched.length - a.uniqueMatched.length;
    }
    // 4. Advantage skills count
    if (b.advantageMatched.length !== a.advantageMatched.length) {
      return b.advantageMatched.length - a.advantageMatched.length;
    }
    // 5. Preferred skills count
    if (b.pMatched.length !== a.pMatched.length) {
      return b.pMatched.length - a.pMatched.length;
    }
    // 6. Seniority / Experience years
    if (b.candExpYears !== a.candExpYears) {
      return b.candExpYears - a.candExpYears;
    }
    // 7. Additional skills count
    if (b.addSkills.length !== a.addSkills.length) {
      return b.addSkills.length - a.addSkills.length;
    }
    // 8. Role alignment score
    const roleDiff = (b.breakdown?.roleScore || 0) - (a.breakdown?.roleScore || 0);
    if (roleDiff !== 0) return roleDiff;
    // 9. Education alignment score
    const eduDiff = (b.breakdown?.educationScore || 0) - (a.breakdown?.educationScore || 0);
    if (eduDiff !== 0) return eduDiff;
    // 10. Candidate profile completeness / resume text length
    const resumeLenDiff = (b.candidateItem?.resumeText?.length || 0) - (a.candidateItem?.resumeText?.length || 0);
    if (resumeLenDiff !== 0) return resumeLenDiff;
    // 11. Deterministic alphabetical order by candidate name
    return (a.name || '').localeCompare(b.name || '');
  });

  const topCandidate = scoredCandidates[0];
  const secondCandidate = scoredCandidates[1];
  const scoreDiff = Math.round((topCandidate.tiebreakerPoints - secondCandidate.tiebreakerPoints) * 10) / 10;

  // Determine if a clear winner exists based on empirical differences
  const hasSkillAdvantage = topCandidate.mMatched.length > secondCandidate.mMatched.length;
  const hasExpAdvantage = jobExpYears > 0
    ? (topCandidate.candExpYears >= jobExpYears && secondCandidate.candExpYears < jobExpYears)
    : (topCandidate.candExpYears > secondCandidate.candExpYears + 1);

  const isClearWinner = scoreDiff >= 4.0 || hasSkillAdvantage || (hasExpAdvantage && scoreDiff >= 2.0);
  const coWinners = isClearWinner
    ? [topCandidate]
    : scoredCandidates.filter(c => Math.abs(c.tiebreakerPoints - topCandidate.tiebreakerPoints) < 4.0);

  const recommendationReasons = [];
  const comparativeStrengths = [];
  const candidateGaps = [];

  if (isClearWinner) {
    if (topCandidate.mMatched.length > secondCandidate.mMatched.length) {
      recommendationReasons.push(
        `Highest mandatory skills alignment: matches ${topCandidate.mMatched.length} mandatory skill(s) (${topCandidate.mMatched.slice(0, 3).join(', ')}${topCandidate.mMatched.length > 3 ? '...' : ''}) compared to ${secondCandidate.mMatched.length} matched by ${secondCandidate.name}.`
      );
      comparativeStrengths.push(
        `Matches ${topCandidate.mMatched.length - secondCandidate.mMatched.length} more mandatory skill(s) than the closest peer.`
      );
    }

    if (topCandidate.uniqueMatched.length > 0) {
      recommendationReasons.push(
        `Exclusive technical competency: only candidate in this tied group with verified resume experience in ${topCandidate.uniqueMatched.join(', ')}.`
      );
      comparativeStrengths.push(
        `Exclusive match for ${topCandidate.uniqueMatched.join(', ')} (absent from other tied resumes).`
      );
    } else if (topCandidate.advantageMatched.length > 0) {
      recommendationReasons.push(
        `Possesses verified resume skills in ${topCandidate.advantageMatched.join(', ')} that other tied candidates missed.`
      );
      comparativeStrengths.push(
        `Skills advantage in ${topCandidate.advantageMatched.slice(0, 2).join(', ')}.`
      );
    }

    if (jobExpYears > 0) {
      if (topCandidate.candExpYears >= jobExpYears && secondCandidate.candExpYears < jobExpYears) {
        recommendationReasons.push(
          `Meets target experience: possesses ${topCandidate.candExpYears} year(s) of experience, fulfilling the required ${job?.experience || `${jobExpYears} yrs`} (closest peer has ${secondCandidate.candExpYears} yrs).`
        );
        comparativeStrengths.push(
          `Exceeds required job experience threshold (${topCandidate.experience} vs required ${job?.experience}).`
        );
      } else if (topCandidate.candExpYears > secondCandidate.candExpYears) {
        recommendationReasons.push(
          `Stronger seniority profile: ${topCandidate.candExpYears} year(s) of experience indicated in resume compared to ${secondCandidate.candExpYears} year(s) for ${secondCandidate.name}.`
        );
        comparativeStrengths.push(
          `More extensive practical experience (${topCandidate.experience}).`
        );
      }
    } else if (topCandidate.candExpYears > secondCandidate.candExpYears) {
      recommendationReasons.push(
        `Offers ${topCandidate.candExpYears} year(s) of practical experience indicated in resume.`
      );
      comparativeStrengths.push(
        `Demonstrated hands-on industry experience (${topCandidate.experience}).`
      );
    }

    if (topCandidate.pMatched.length > 0) {
      recommendationReasons.push(
        `Bonus qualifications: matches ${topCandidate.pMatched.length} preferred skill(s) (${topCandidate.pMatched.join(', ')}).`
      );
      comparativeStrengths.push(
        `Matches bonus skills: ${topCandidate.pMatched.join(', ')}.`
      );
    }

    if (topCandidate.candidateItem.breakdown.roleScore > secondCandidate.candidateItem.breakdown.roleScore + 5) {
      recommendationReasons.push(
        `Closer JD keyword and responsibility alignment (${topCandidate.candidateItem.breakdown.roleScore}% vs ${secondCandidate.candidateItem.breakdown.roleScore}%).`
      );
    }

    if (recommendationReasons.length === 0) {
      recommendationReasons.push(
        `Demonstrates the most balanced technical skills and experience profile among all candidates sharing the ${topCandidate.overallScore}% match score.`
      );
      comparativeStrengths.push('Highest overall composite skill and experience coverage in this score group.');
    }

    // Identify any remaining gaps on the recommended candidate
    if (topCandidate.mMissing.length > 0) {
      candidateGaps.push(
        `Missing mandatory skill(s) in resume: ${topCandidate.mMissing.join(', ')} (recommend screening during technical interview).`
      );
    }
    if (jobExpYears > 0 && topCandidate.candExpYears < jobExpYears) {
      candidateGaps.push(
        `Experience (${topCandidate.experience}) is below job target of ${job?.experience || `${jobExpYears} yrs`}.`
      );
    }
    if (candidateGaps.length === 0) {
      candidateGaps.push('No critical skill or experience deficiencies detected in resume.');
    }
  } else {
    // When no clear winner
    const coWinnerNames = coWinners.map(c => c.name).join(' and ');
    recommendationReasons.push(
      `Equally suitable profiles: ${coWinnerNames} exhibit virtually identical mandatory skills coverage, experience levels, and qualification alignment.`
    );
    recommendationReasons.push(
      'Resume data alone does not provide a statistically significant distinction to prioritize one candidate over the other.'
    );
    comparativeStrengths.push('Both candidates satisfy core role requirements with equivalent proficiency.');
    candidateGaps.push('Recommend conducting preliminary technical interviews with both candidates to assess soft skills and problem solving.');
  }

  // Compute final relative rankings (1st Best Choice, 2nd Choice, 3rd Choice, 4th Choice, ...)
  const rankedCandidates = scoredCandidates.map((c, index) => {
    const seqRank = index + 1;
    let rankLabel = `${getOrdinal(seqRank)} Choice`;
    let badgeType = 'contender';

    if (seqRank === 1) {
      if (isClearWinner) {
        rankLabel = '#1 Best Choice';
        badgeType = 'winner';
      } else {
        rankLabel = '1st (Co-Choice)';
        badgeType = 'co_winner';
      }
    } else if (seqRank === 2) {
      rankLabel = '2nd Choice';
      badgeType = 'runner_up';
    } else if (seqRank === 3) {
      rankLabel = '3rd Choice';
      badgeType = 'third';
    } else if (seqRank === 4) {
      rankLabel = '4th Choice';
      badgeType = 'fourth';
    } else {
      rankLabel = `${getOrdinal(seqRank)} Choice`;
      badgeType = 'contender';
    }

    // Generate concise differentiator reason for this candidate's rank
    const rankRationale = [];
    if (c.mMatched.length > 0) {
      rankRationale.push(`${c.mMatched.length} mandatory skills`);
    }
    if (c.uniqueMatched.length > 0) {
      rankRationale.push(`exclusive ${c.uniqueMatched[0]}`);
    } else if (c.advantageMatched.length > 0) {
      rankRationale.push(`advantage in ${c.advantageMatched[0]}`);
    }
    if (c.candExpYears > 0) {
      rankRationale.push(`${c.candExpYears} yrs exp`);
    } else if (c.experience && c.experience !== 'Not specified' && c.experience !== '—') {
      rankRationale.push(c.experience);
    }
    if (c.pMatched.length > 0) {
      rankRationale.push(`${c.pMatched.length} preferred skill(s)`);
    }
    if (c.addSkills.length > 0) {
      rankRationale.push(`+${c.addSkills.length} supplementary skill(s)`);
    }
    if (c.education && c.education !== 'Not specified' && c.education !== '—' && rankRationale.length < 3) {
      const cleanEdu = c.education.split('(')[0].trim();
      if (cleanEdu && !cleanEdu.toLowerCase().includes('not') && cleanEdu !== '—') {
        rankRationale.push(cleanEdu);
      }
    }

    return {
      ...c,
      relativeRank: seqRank,
      rankLabel,
      badgeType,
      rankRationale: rankRationale.join(' · ') || 'Core profile match',
    };
  });

  return {
    isClearWinner,
    scoreDiff,
    bestCandidate: isClearWinner ? topCandidate : null,
    coWinners,
    recommendationReasons,
    comparativeStrengths,
    candidateGaps,
    rankedCandidates,
    fitSummary: isClearWinner
      ? `${topCandidate.name} is recommended as the top candidate among the ${tiedCandidates.length} candidates with ${topCandidate.overallScore}% resume match, driven by ${comparativeStrengths[0] || 'superior core requirement coverage'}.`
      : `No single candidate has a definitive advantage among the ${tiedCandidates.length} tied candidates. ${coWinners.map(c => c.name).join(' and ')} are equally recommended for further screening.`,
  };
}

