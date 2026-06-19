// master-profile.js
import { MasterAPI } from './master-api.js';

export function showMyProfileModal() {
    // Displays the profile modal component
}

export function showAccountSettingsModal() {
    // Displays account settings
}

export async function saveAccountSettings(formData) {
    await MasterAPI.updateProfile(formData);
}
