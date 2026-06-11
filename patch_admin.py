with open('forenten/admin.html', 'r', encoding='utf-8') as f:
    content = f.read()

import re

# Block 1 (around line 5942)
old_block1 = """                        ${data.recording_url ? `
                        <div style="flex: 1; min-width: 300px; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 1.25rem;">
                            <strong style="color: var(--text-secondary); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px;"><i class="fas fa-video"></i> Interview Recording</strong>
                            <div style="margin-top: 1rem;">
                                <video controls style="width: 100%; max-height: 250px; border-radius: 8px; background: #000;" onerror="handleVideoError(this)">
                                    <source src="${data.recording_url.startsWith('http') ? data.recording_url : API_BASE + '/' + data.recording_url}" type="video/webm">
                                </video>
                                <div id="videoErrorMsg" style="display:none; margin-top: 1rem; padding: 1rem; background: #fff5f5; border: 1px solid #feb2b2; border-radius: 8px; color: #c53030; font-size: 0.85rem;">
                                    <i class="fas fa-exclamation-triangle"></i> Recording unavailable on server. 
                                    <a href="${data.recording_url.startsWith('http') ? data.recording_url : API_BASE + '/' + data.recording_url}" target="_blank" style="color: #c53030; text-decoration: underline; font-weight: 700;">Try direct link</a>
                                </div>
                                <div style="margin-top: 0.5rem; text-align: right;">
                                    <a href="${data.recording_url.startsWith('http') ? data.recording_url : API_BASE + '/' + data.recording_url}" download="interview_${escapeHtml(data.candidate_name) || 'recording'}.webm" 
                                       style="color: var(--primary); text-decoration: none; font-size: 0.8rem; font-weight: 600;">
                                        <i class="fas fa-download"></i> Download Video
                                    </a>
                                </div>
                            </div>
                        </div>
                        ` : ''}"""

new_block1 = """                        ${data.recording_url ? `
                        <div style="flex: 1; min-width: 300px; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 1.25rem;">
                            <strong style="color: var(--text-secondary); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px;"><i class="fas fa-video"></i> Camera Recording</strong>
                            <div style="margin-top: 1rem;">
                                <video controls style="width: 100%; max-height: 250px; border-radius: 8px; background: #000;" onerror="handleVideoError(this)">
                                    <source src="${data.recording_url.startsWith('http') ? data.recording_url : API_BASE + '/' + data.recording_url}" type="video/webm">
                                </video>
                                <div class="video-error-msg" style="display:none; margin-top: 1rem; padding: 1rem; background: #fff5f5; border: 1px solid #feb2b2; border-radius: 8px; color: #c53030; font-size: 0.85rem;">
                                    <i class="fas fa-exclamation-triangle"></i> Recording unavailable. 
                                    <a href="${data.recording_url.startsWith('http') ? data.recording_url : API_BASE + '/' + data.recording_url}" target="_blank" style="color: #c53030; text-decoration: underline; font-weight: 700;">Try direct link</a>
                                </div>
                                <div style="margin-top: 0.5rem; text-align: right;">
                                    <a href="${data.recording_url.startsWith('http') ? data.recording_url : API_BASE + '/' + data.recording_url}" download="interview_camera_${escapeHtml(data.candidate_name) || 'recording'}.webm" 
                                       style="color: var(--primary); text-decoration: none; font-size: 0.8rem; font-weight: 600;">
                                        <i class="fas fa-download"></i> Download Camera
                                    </a>
                                </div>
                            </div>
                        </div>
                        ` : ''}
                        
                        ${data.screen_recording_url ? `
                        <div style="flex: 1; min-width: 300px; background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 1.25rem;">
                            <strong style="color: var(--text-secondary); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px;"><i class="fas fa-desktop"></i> Screen Recording</strong>
                            <div style="margin-top: 1rem;">
                                <video controls style="width: 100%; max-height: 250px; border-radius: 8px; background: #000;" onerror="handleVideoError(this)">
                                    <source src="${data.screen_recording_url.startsWith('http') ? data.screen_recording_url : API_BASE + '/' + data.screen_recording_url}" type="video/webm">
                                </video>
                                <div class="video-error-msg" style="display:none; margin-top: 1rem; padding: 1rem; background: #fff5f5; border: 1px solid #feb2b2; border-radius: 8px; color: #c53030; font-size: 0.85rem;">
                                    <i class="fas fa-exclamation-triangle"></i> Recording unavailable. 
                                    <a href="${data.screen_recording_url.startsWith('http') ? data.screen_recording_url : API_BASE + '/' + data.screen_recording_url}" target="_blank" style="color: #c53030; text-decoration: underline; font-weight: 700;">Try direct link</a>
                                </div>
                                <div style="margin-top: 0.5rem; text-align: right;">
                                    <a href="${data.screen_recording_url.startsWith('http') ? data.screen_recording_url : API_BASE + '/' + data.screen_recording_url}" download="interview_screen_${escapeHtml(data.candidate_name) || 'recording'}.webm" 
                                       style="color: var(--primary); text-decoration: none; font-size: 0.8rem; font-weight: 600;">
                                        <i class="fas fa-download"></i> Download Screen
                                    </a>
                                </div>
                            </div>
                        </div>
                        ` : ''}"""

if old_block1 in content:
    content = content.replace(old_block1, new_block1)
    print("Replaced admin block 1")
else:
    print("Could not find admin block 1")


# Block 2 (around line 6252)
old_block2 = """                        ${data.recording_url ? `
                        <div style="flex: 1; min-width: 300px; background: var(--bg-input); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 1.25rem;">
                            <strong style="color: var(--text-secondary); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px;"><i class="fas fa-video"></i> Interview Recording</strong>
                            <div style="margin-top: 1rem;">
                                <video controls style="width: 100%; max-height: 360px; border-radius: 8px; background: #000;" onerror="handleVideoError(this)">
                                    <source src="${data.recording_url.startsWith('http') ? data.recording_url : API_BASE + '/' + data.recording_url}" type="video/webm">
                                    Your browser does not support the video tag.
                                </video>
                                <div class="video-error-msg" style="display:none; margin-top: 1rem; padding: 1rem; background: #fff5f5; border: 1px solid #feb2b2; border-radius: 8px; color: #c53030; font-size: 0.85rem;">
                                    <i class="fas fa-exclamation-triangle"></i> Recording unavailable on server. This usually happens if the server restarted and the ephemeral recording was lost.
                                    <br><br>
                                    <a href="${data.recording_url.startsWith('http') ? data.recording_url : API_BASE + '/' + data.recording_url}" target="_blank" style="color: #c53030; text-decoration: underline; font-weight: 700;">Try direct link</a>
                                </div>
                                <div style="margin-top: 0.75rem;">
                                    <a href="${data.recording_url.startsWith('http') ? data.recording_url : API_BASE + '/' + data.recording_url}" download="interview_${data.candidate_name || 'recording'}.webm"
                                       style="color: var(--primary); text-decoration: none; font-weight: 600; font-size: 0.9rem;">
                                        <i class="fas fa-download"></i> Download Video
                                    </a>
                                </div>
                            </div>
                        </div>
                        ` : `
                        <div style="flex: 1; min-width: 300px; background: var(--bg-input); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 1.25rem;">
                            <strong style="color: var(--text-secondary); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px;"><i class="fas fa-video-slash"></i> Interview Recording</strong>
                            <p style="color: var(--text-muted); margin-top: 0.75rem; font-size: 0.9rem;">No recording available for this interview.</p>
                        </div>
                        `}"""

new_block2 = """                        ${data.recording_url ? `
                        <div style="flex: 1; min-width: 300px; background: var(--bg-input); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 1.25rem;">
                            <strong style="color: var(--text-secondary); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px;"><i class="fas fa-video"></i> Camera Recording</strong>
                            <div style="margin-top: 1rem;">
                                <video controls style="width: 100%; max-height: 360px; border-radius: 8px; background: #000;" onerror="handleVideoError(this)">
                                    <source src="${data.recording_url.startsWith('http') ? data.recording_url : API_BASE + '/' + data.recording_url}" type="video/webm">
                                    Your browser does not support the video tag.
                                </video>
                                <div class="video-error-msg" style="display:none; margin-top: 1rem; padding: 1rem; background: #fff5f5; border: 1px solid #feb2b2; border-radius: 8px; color: #c53030; font-size: 0.85rem;">
                                    <i class="fas fa-exclamation-triangle"></i> Recording unavailable on server.
                                    <br><br>
                                    <a href="${data.recording_url.startsWith('http') ? data.recording_url : API_BASE + '/' + data.recording_url}" target="_blank" style="color: #c53030; text-decoration: underline; font-weight: 700;">Try direct link</a>
                                </div>
                                <div style="margin-top: 0.75rem;">
                                    <a href="${data.recording_url.startsWith('http') ? data.recording_url : API_BASE + '/' + data.recording_url}" download="interview_camera_${data.candidate_name || 'recording'}.webm"
                                       style="color: var(--primary); text-decoration: none; font-weight: 600; font-size: 0.9rem;">
                                        <i class="fas fa-download"></i> Download Camera
                                    </a>
                                </div>
                            </div>
                        </div>
                        ` : ''}

                        ${data.screen_recording_url ? `
                        <div style="flex: 1; min-width: 300px; background: var(--bg-input); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 1.25rem;">
                            <strong style="color: var(--text-secondary); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px;"><i class="fas fa-desktop"></i> Screen Recording</strong>
                            <div style="margin-top: 1rem;">
                                <video controls style="width: 100%; max-height: 360px; border-radius: 8px; background: #000;" onerror="handleVideoError(this)">
                                    <source src="${data.screen_recording_url.startsWith('http') ? data.screen_recording_url : API_BASE + '/' + data.screen_recording_url}" type="video/webm">
                                    Your browser does not support the video tag.
                                </video>
                                <div class="video-error-msg" style="display:none; margin-top: 1rem; padding: 1rem; background: #fff5f5; border: 1px solid #feb2b2; border-radius: 8px; color: #c53030; font-size: 0.85rem;">
                                    <i class="fas fa-exclamation-triangle"></i> Recording unavailable on server.
                                    <br><br>
                                    <a href="${data.screen_recording_url.startsWith('http') ? data.screen_recording_url : API_BASE + '/' + data.screen_recording_url}" target="_blank" style="color: #c53030; text-decoration: underline; font-weight: 700;">Try direct link</a>
                                </div>
                                <div style="margin-top: 0.75rem;">
                                    <a href="${data.screen_recording_url.startsWith('http') ? data.screen_recording_url : API_BASE + '/' + data.screen_recording_url}" download="interview_screen_${data.candidate_name || 'recording'}.webm"
                                       style="color: var(--primary); text-decoration: none; font-weight: 600; font-size: 0.9rem;">
                                        <i class="fas fa-download"></i> Download Screen
                                    </a>
                                </div>
                            </div>
                        </div>
                        ` : ''}

                        ${(!data.recording_url && !data.screen_recording_url) ? `
                        <div style="flex: 1; min-width: 300px; background: var(--bg-input); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 1.25rem;">
                            <strong style="color: var(--text-secondary); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 1px;"><i class="fas fa-video-slash"></i> Interview Recording</strong>
                            <p style="color: var(--text-muted); margin-top: 0.75rem; font-size: 0.9rem;">No recording available for this interview.</p>
                        </div>
                        ` : ''}"""

if old_block2 in content:
    content = content.replace(old_block2, new_block2)
    print("Replaced admin block 2")
else:
    print("Could not find admin block 2")

with open('forenten/admin.html', 'w', encoding='utf-8') as f:
    f.write(content)
