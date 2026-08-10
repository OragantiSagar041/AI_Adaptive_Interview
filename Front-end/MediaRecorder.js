class VideoRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.stream = null;
    this.isRecording = false;
    this.silenceTimeout = null;
    this.SILENCE_DURATION = 10000;

    this.videoPreview = document.getElementById('videoPreview');
    this.statusDiv = document.getElementById('status');
    this.transcriptionBox = document.getElementById('transcriptionBox');
    this.transcriptionDisplay = document.getElementById('transcription');

    // Accumulated final text from Web Speech API
    this.liveFinalText = "";

    // Speech Recognition setup
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false; // manual restart for stability
      this.recognition.interimResults = true;
      this.recognition.maxAlternatives = 1;

      const langMap = {
        'Hindi': 'hi-IN',
        'Telugu': 'te-IN',
        'Tamil': 'ta-IN',
        'Malayalam': 'ml-IN',
        'Kannada': 'kn-IN',
        'English': 'en-IN'  // en-IN is critical for Indian accent accuracy
      };
      const targetLang = langMap[window.sessionLanguage] || 'en-IN';
      this.recognition.lang = targetLang;

      this.recognition.onstart = () => {
        this.transcriptionDisplay.textContent = "🎤 Listening (Active)...";
      };

      this.recognition.onend = () => {
        if (this.isRecording) {
          try { this.recognition.start(); } catch (e) { }
        } else {
          this.transcriptionDisplay.textContent = "Stopped.";
        }
      };

      this.recognition.onresult = (event) => {
        let finalChunk = '';
        let interimChunk = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalChunk += event.results[i][0].transcript;
          } else {
            interimChunk += event.results[i][0].transcript;
          }
        }

        if (this.silenceTimeout) {
          clearTimeout(this.silenceTimeout);
          this.startSilenceTimer();
        }

        if (finalChunk) {
          this.liveFinalText += finalChunk + ' ';
          this.transcriptionBox.value = this.liveFinalText;
          this.transcriptionBox.scrollTop = this.transcriptionBox.scrollHeight;
          if (typeof window.updateBehavioralFromTranscript === 'function') {
            window.updateBehavioralFromTranscript(this.liveFinalText);
          }
        }

        if (interimChunk) {
          this.transcriptionDisplay.textContent = '... ' + interimChunk;
        }
      };

      this.recognition.onerror = (event) => {
        console.error("Speech error", event.error);
        if (event.error === 'no-speech') return;
        this.transcriptionDisplay.innerText = `Error: ${event.error}`;
      };
    } else {
      this.recognition = null;
    }
  }

  async startRecording() {
    try {
      // HIGH-QUALITY audio constraints for Indian English phonemes
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 48000,        // Capture at 48kHz, let backend downsample to 16kHz
          channelCount: 1,          // Mono is better for speech recognition
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          latency: 0.01,
        },
        video: false
      });

      // Higher bitrate Opus = preserves high-frequency accent details
      const options = {
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 128000  // default is ~96k, bump to 128k
      };
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options.mimeType = 'audio/webm';
      }

      this.mediaRecorder = new MediaRecorder(this.stream, options);
      this.recordedChunks = [];
      this.isRecording = true;
      this.liveFinalText = "";  // Reset accumulated text

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          this.recordedChunks.push(e.data);
        }
      };

      this.transcriptionDisplay.textContent = '🎙 Listening...';
      this.transcriptionBox.value = '';
      const transContainer = document.getElementById('transcriptionContainer');
      if (transContainer) {
        transContainer.classList.remove('hidden');
        transContainer.style.display = 'block';
      }

      // Collect in 1-second chunks
      this.mediaRecorder.start(1000);

      if (this.recognition) {
        try { this.recognition.start(); } catch (e) { }
      }

      this.showStatus('Recording started. Speak clearly.', 'info');
      this.startSilenceTimer();

    } catch (err) {
      console.error(err);
      this.showError('Microphone permission denied.');
      throw err;
    }
  }

  startSilenceTimer() {
    if (this.silenceTimeout) clearTimeout(this.silenceTimeout);
    this.silenceTimeout = setTimeout(() => {
      this.showStatus("Silence detected. Moving to next question...", "warning");
      if (typeof window.nextQuestion === 'function') {
        window.nextQuestion();
      }
    }, this.SILENCE_DURATION);
  }

  async stopRecording() {
    return new Promise((resolve) => {
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
        resolve();
        return;
      }

      this.isRecording = false;
      this.transcriptionDisplay.textContent = "Stopping...";

      if (this.silenceTimeout) {
        clearTimeout(this.silenceTimeout);
        this.silenceTimeout = null;
      }

      if (this.recognition) {
        try { this.recognition.stop(); } catch (e) { }
      }

      this.mediaRecorder.onstop = async () => {
        if (this.stream) {
          this.stream.getTracks().forEach(track => track.stop());
        }

        try {
          await this.uploadRecording(
            window.currentInterviewId,
            window.currentQuestionId
          );
        } catch (err) {
          console.error(err);
          this.showError('Upload failed');
        }

        resolve();
      };

      this.mediaRecorder.stop();

      setTimeout(() => {
        if (this.mediaRecorder && this.mediaRecorder.state === 'inactive') {
          resolve();
        }
      }, 2000);
    });
  }

  async uploadRecording(interviewId, questionId) {
    if (!interviewId || !questionId) {
      throw new Error('Missing interview or question ID');
    }

    const audioBlob = new Blob(this.recordedChunks, { type: 'audio/webm' });
    const formData = new FormData();
    formData.append('audio', audioBlob, `answer_${Date.now()}.webm`);
    formData.append('interview_id', interviewId);
    formData.append('question_id', questionId);
    formData.append('candidate_name', window.candidateName || 'Candidate');
    formData.append('language', window.sessionLanguage || 'English');

    // ⭐ CRITICAL: Send browser's live transcript as fallback
    // If Whisper hallucinates or returns empty, backend uses this.
    const fallbackText = this.liveFinalText.trim();
    if (fallbackText) {
      formData.append('fallback_text', fallbackText);
    }

    const baseUrl = window.API_BASE_URL || '';
    const response = await fetch(`${baseUrl}/transcribe`, {
      method: 'POST',
      body: formData
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data?.detail || 'Transcription failed');
    }

    // ⭐ SMART MERGE: Only replace live text if Whisper gave us something real
    // If backend returned empty/hallucination, keep the browser's live text.
    const whisperText = (data.text || "").trim();

    if (whisperText && whisperText.length > 2) {
      // If Whisper is significantly different from live text, prefer Whisper
      // UNLESS live text is longer and Whisper looks like a fragment.
      const liveLen = fallbackText.length;
      const whisperLen = whisperText.length;

      if (whisperLen >= liveLen * 0.5) {
        // Whisper is substantial; use it
        this.transcriptionBox.value = whisperText;
        this.liveFinalText = whisperText + " ";
        if (typeof window.updateBehavioralFromTranscript === 'function') {
          window.updateBehavioralFromTranscript(whisperText);
        }
      } else if (liveLen > 0) {
        // Whisper is too short compared to live; keep live but append whisper if different
        this.transcriptionBox.value = fallbackText;
      }
    } else {
      // Whisper failed; keep live text (already in box)
      this.transcriptionBox.value = fallbackText || this.transcriptionBox.value;
    }

    this.transcriptionDisplay.textContent = "Processing complete.";
    this.showStatus('Answer transcribed successfully', 'success');
    return data;
  }

  showStatus(msg, type = 'info') {
    if (this.statusDiv) {
      this.statusDiv.textContent = msg;
      this.statusDiv.className = `status ${type}`;
    }
  }

  showError(msg) {
    this.showStatus(msg, 'error');
  }
}

window.VideoRecorder = VideoRecorder;
