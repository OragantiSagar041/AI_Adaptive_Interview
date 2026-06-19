class VideoRecorder {
    constructor() {
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.stream = null;
        this.isRecording = false;

        this.videoPreview = document.getElementById('videoPreview');
        this.statusDiv = document.getElementById('status');
        this.transcriptionBox = document.getElementById('transcriptionBox');
        this.transcriptionDisplay = document.getElementById('transcription');

        // Silence detection variables
        this.silenceTimeout = null;
        this.SILENCE_DURATION = 10000; // 10 seconds

        // Initialize Speech Recognition
        if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            this.recognition = new SpeechRecognition();
            // We use continuous = false and manual restart for better stability & control
            this.recognition.continuous = false;
            this.recognition.interimResults = true;
            const langMap = {
                'Hindi': 'hi-IN',
                'Telugu': 'te-IN',
                'Tamil': 'ta-IN',
                'Malayalam': 'ml-IN',
                'Kannada': 'kn-IN',
                'English': 'en-IN'
            };
            const targetLang = langMap[window.sessionLanguage] || 'en-IN';
            this.recognition.lang = targetLang;

            this.recognition.onstart = () => {
                // console.log("Speech started");
                this.transcriptionDisplay.textContent = "🎤 Listening (Active)...";
                // this.transcriptionBox.value += "[Debug: Listener Started]\n"; 
            };

            this.recognition.onend = () => {
                // console.log("Speech ended");
                if (this.isRecording) {
                    // console.log("Restarting speech...");
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

                // Reset silence timeout whenever speech is detected
                if (this.silenceTimeout) {
                    clearTimeout(this.silenceTimeout);
                    this.startSilenceTimer();
                }

                // 1. Update the MAIN TEXT AREA
                if (finalChunk) {
                    this.transcriptionBox.value += finalChunk + ' ';
                    this.transcriptionBox.scrollTop = this.transcriptionBox.scrollHeight;
                    // ── Behavioral tracking hook ──
                    if (typeof window.updateBehavioralFromTranscript === 'function') {
                        window.updateBehavioralFromTranscript(this.transcriptionBox.value);
                    }
                }

                // 2. Update the STATUS DIV with interim text
                if (interimChunk) {
                    this.transcriptionDisplay.textContent = '... ' + interimChunk;
                }
            };

            this.recognition.onerror = (event) => {
                console.error("Speech error", event.error);
                if (event.error === 'no-speech') {
                    // Common, ignore. Loop will restart it.
                    return;
                }
                this.transcriptionDisplay.innerText = `Error: ${event.error}`;
                // this.transcriptionBox.value += `[Debug: Error ${event.error}]\n`;
            };

            this.recognition.nomatch = () => {
                // console.log("Speech recognition: No match found.");
            };
        } else {
            // console.warn("Web Speech API not supported in this browser.");
            this.recognition = null;
        }
    }

    async startRecording() {
        try {
            // ALWAYS get a dedicated audio stream for recording/speech
            // Reusing the video stream (window.mediaStream) often causes issues with SpeechRecognition
            // because the video track might interfere or the audio track might be optimized for playback.
            // console.log("Requesting dedicated audio stream for best recognition...");
            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: false
            });

            // 🎧 MediaRecorder (AUDIO)
            this.mediaRecorder = new MediaRecorder(this.stream, {
                mimeType: 'audio/webm;codecs=opus'
            });

            this.recordedChunks = [];
            this.isRecording = true;

            this.mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    this.recordedChunks.push(e.data);
                }
            };

            // UI
            this.transcriptionDisplay.textContent = '🎙 Listening...';
            // Don't clear the box if we want to keep history, or clear it for new answer?
            // Usually for a new answer we clear it.
            this.transcriptionBox.value = '';
            document.getElementById('transcriptionContainer').classList.remove('hidden'); // Ensure visible
            document.getElementById('transcriptionContainer').style.display = 'block';

            this.mediaRecorder.start(1000);

            // Start Speech Recognition
            if (this.recognition) {
                try {
                    this.recognition.start();
                } catch (e) {
                    // console.warn("Recognition already started or failed:", e);
                }
            }

            // Start Visualizer
            try {
                this.visualizeAudio(this.stream);
                document.getElementById('audioVisualizer').style.display = 'block';
            } catch(e) { console.error('Visualizer failed', e); }

            this.showStatus('Recording started. Speak clearly.', 'info');

            // Start silence detection timer
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
            // console.log("Silence detected for 10 seconds. Auto-submitting...");
            this.showStatus("Silence detected. Moving to next question...", "warning");
            if (typeof window.nextQuestion === 'function') {
                window.nextQuestion();
            }
        }, this.SILENCE_DURATION);
    }

    visualizeAudio(stream) {
        const canvas = document.getElementById("audioVisualizer");
        const ctx = canvas.getContext("2d");
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        this.visualizerActive = true;

        const draw = () => {
            if (!this.visualizerActive) {
                audioCtx.close();
                // Clear the canvas when stopping
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                document.getElementById('audioVisualizer').style.display = 'none';
                return;
            }

            requestAnimationFrame(draw);
            analyser.getByteFrequencyData(dataArray);

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Draw a smooth, modern waveform
            ctx.lineWidth = 2.5;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            
            // Create gradient
            const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
            gradient.addColorStop(0, 'rgba(99, 102, 241, 0.4)');
            gradient.addColorStop(0.5, 'rgba(79, 70, 229, 1)');
            gradient.addColorStop(1, 'rgba(99, 102, 241, 0.4)');
            ctx.strokeStyle = gradient;

            ctx.beginPath();
            
            // Use a subset of the frequencies for a cleaner look
            const drawLength = Math.floor(bufferLength * 0.6); 
            const sliceWidth = canvas.width / drawLength;
            let x = 0;
            
            for (let i = 0; i < drawLength; i++) {
                // Normalize frequency data
                const v = dataArray[i] / 255.0; // 0.0 to 1.0
                // Center the waveform vertically, scale amplitude
                const amplitude = (canvas.height / 2) * 0.8;
                const y = (canvas.height / 2) + (v * amplitude * (i % 2 === 0 ? 1 : -1));
                
                if (i === 0) {
                    ctx.moveTo(x, canvas.height / 2);
                } else {
                    // Smooth curve
                    ctx.lineTo(x, y);
                }
                x += sliceWidth;
            }
            
            ctx.stroke();
        };
        draw();
    }

    async stopRecording() {
        return new Promise((resolve) => {
            if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') {
                resolve();
                return;
            }

            this.isRecording = false;
            this.visualizerActive = false; // Stop Visualizer Loop
            this.transcriptionDisplay.textContent = "Stopping..."; // Immediate UI Feedback

            if (this.silenceTimeout) {
                clearTimeout(this.silenceTimeout);
                this.silenceTimeout = null;
            }

            // Stop Speech Recognition
            if (this.recognition) {
                try {
                    // console.log("Stopping speech recognition manually...");
                    this.recognition.stop();
                } catch (e) {
                    // console.warn("Recognition already stopped:", e);
                }
            }

            this.mediaRecorder.onstop = async () => {
                // STOP THE TRACKS (Vital since we created a dedicated stream)
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

            // Failsafe: If onstop doesn't fire in 2s, force resolve
            setTimeout(() => {
                if (this.mediaRecorder.state === 'inactive') {
                    // console.log("Force resolving stop promise (failsafe)");
                    resolve();
                }
            }, 2000);
        });
    }

    async uploadRecording(interviewId, questionId) {
        if (!interviewId || !questionId) {
            throw new Error('Missing interview or question ID');
        }

        const audioBlob = new Blob(this.recordedChunks, {
            type: 'audio/webm'
        });

        const formData = new FormData();
        formData.append('audio', audioBlob, `answer_${Date.now()}.webm`);
        formData.append('interview_id', interviewId);
        formData.append('question_id', questionId);
        formData.append('candidate_name', window.candidateName || 'Candidate');

        // Use the globally defined API_BASE_URL if available, else fallback to localhost
        const baseUrl = window.API_BASE_URL;
        const response = await fetch(`${baseUrl}/transcribe`, {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data?.detail || 'Transcription failed');
        }

        if (data.text && data.text !== 'No speech detected') {
            // Only update if we got a valid response
            this.transcriptionBox.value = data.text;
            // ── Behavioral tracking hook (final transcript) ──
            if (typeof window.updateBehavioralFromTranscript === 'function') {
                window.updateBehavioralFromTranscript(data.text);
            }
        } else {
            // console.warn("Backend returned no speech, keeping live text.");
        }

        this.transcriptionDisplay.textContent = "Processing complete.";

        this.showStatus('Answer transcribed successfully', 'success');
        return data;
    }

    showStatus(msg, type = 'info') {
        this.statusDiv.textContent = msg;
        this.statusDiv.className = `status ${type}`;
    }

    showError(msg) {
        this.showStatus(msg, 'error');
    }
}

window.VideoRecorder = VideoRecorder;
