// master-utils.js
export const PLAN_CAPABILITY_FALLBACK = {
    // Default capabilities
};

export function normalizePlanKey(planName) {
    return planName.toLowerCase().replace(/\s+/g, '_');
}

export function getPlanCapabilities(planName) {
    // Logic to merge DB caps with FALLBACK
}

export function applyPlanRestrictions(capabilities) {
    // Disables UI elements based on capabilities
}
