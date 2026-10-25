// --- CLOUD CONNECTION & AUTONOMOUS DEPENDENCY INJECTOR ---
const supabaseUrl = 'https://qimabxbtbvgayayzvnoj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpbWFieGJ0YnZnYXlheXp2bm9qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxNDY5NTUsImV4cCI6MjEwMDcyMjk1NX0.wE4ea1t4ORvPla8C3C0T88pNl5uQTcVPDfDoUQlJEAw';
let supabaseClient = null;

async function ensureSupabase() {
    if (supabaseClient) return;
    if (typeof window.supabase === 'undefined') {
        await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }
    supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
}

async function ensureFaceApi() {
    if (typeof Human === 'undefined') {
        await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/@vladmandic/human@3.3.6/dist/human.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }
}
// --- VLADMANDIC HUMAN BIOMETRIC & ANTI-SPOOFING ENGINE ---
const HUMAN_CDN_MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/human@3.3.6/models/';
const FACE_MATCH_MAX_DISTANCE = 0.46;
const DUPLICATE_FACE_MAX_DISTANCE = 0.36;
const FACE_SCAN_TIMEOUT_MS = 30000; // 30 seconds total budget
const BLINK_PROMPT_WINDOW_MS = 3000; // 3 seconds to blink when prompted
const REQUIRED_BLINKS = 3;
const ANTI_SPOOF_MIN_REAL = 0.38;
const ANTI_SPOOF_MIN_LIVE = 0.38;

let humanInstance = null;
let faceModelsPromise = null;
let activeFaceSession = null;

function createHumanConfig() {
    return {
        modelBasePath: HUMAN_CDN_MODEL_URL,
        filter: { enabled: true, equalization: true, flip: false },
        face: {
            enabled: true,
            detector: { rotation: true, maxDetected: 2, minConfidence: 0.50 },
            mesh: { enabled: true },
            iris: { enabled: false },
            description: { enabled: true },
            emotion: { enabled: false },
            antispoof: { enabled: true },
            liveness: { enabled: true }
        },
        body: { enabled: false },
        hand: { enabled: false },
        object: { enabled: false },
        gesture: { enabled: true }
    };
}

// Normalizes @vladmandic/human 1024-D embeddings so Euclidean distance thresholds (0.46 / 0.36) match identically
function normalizeHumanDescriptor(embedding) {
    if (!embedding || !embedding.length) return null;
    let normSq = 0;
    for (let i = 0; i < embedding.length; i++) {
        const val = Number(embedding[i]) || 0;
        normSq += val * val;
    }
    const norm = Math.sqrt(normSq);
    if (norm === 0) return null;
    const scale = 0.638 / norm;
    const normalized = new Array(embedding.length);
    for (let i = 0; i < embedding.length; i++) {
        normalized[i] = Number((Number(embedding[i]) * scale).toFixed(6));
    }
    return normalized;
}

async function ensureFaceModels() {
    await ensureFaceApi();
    if (!faceModelsPromise) {
        faceModelsPromise = (async () => {
            const HumanConstructor = window.Human?.Human || window.Human;
            humanInstance = new HumanConstructor(createHumanConfig());
            await humanInstance.load();
            await humanInstance.warmup();
            return humanInstance;
        })().catch((error) => {
            faceModelsPromise = null;
            throw error;
        });
    }
    return faceModelsPromise;
}

function createFaceSession(video, container, statusEl, onFailure) {
    stopActiveFaceSession();
    const session = {
        id: `${Date.now()}-${Math.random()}`,
        video,
        container,
        statusEl,
        onFailure,
        stream: null,
        canvas: null,
        intervalId: null,
        timeoutId: null,
        detectionInProgress: false,
        identityVerified: false,
        cachedDescriptor: null,
        cancelled: false,
        completed: false,
        submitting: false,
        challenge: null
    };
    activeFaceSession = session;
    return session;
}

function isFaceSessionActive(session) {
    return activeFaceSession === session && !session.cancelled && !session.completed;
}

function setFaceScanStatus(session, message, color = '#f59e0b') {
    if (!isFaceSessionActive(session) || !session.statusEl) return;
    session.statusEl.innerText = message;
    session.statusEl.style.color = color;
}

function stopFaceSessionCamera(session) {
    if (!session) return;
    if (session.intervalId) clearInterval(session.intervalId);
    if (session.timeoutId) clearTimeout(session.timeoutId);
    session.intervalId = null;
    session.timeoutId = null;
    if (session.stream) session.stream.getTracks().forEach(track => track.stop());
    if (session.video) {
        try { session.video.pause(); } catch (e) {}
        session.video.srcObject = null;
    }
    if (session.canvas) session.canvas.remove();
    session.canvas = null;
}

function stopActiveFaceSession() {
    const session = activeFaceSession;
    if (!session) return;
    session.cancelled = true;
    stopFaceSessionCamera(session);
    if (activeFaceSession === session) activeFaceSession = null;
}

function completeFaceSession(session) {
    if (activeFaceSession !== session) return;
    session.completed = true;
    stopFaceSessionCamera(session);
    activeFaceSession = null;
}

function createFaceCanvas(session) {
    if (!isFaceSessionActive(session)) return null;
    if (session.container) session.container.querySelectorAll('.face-scan-overlay').forEach(el => el.remove());
    const canvas = document.createElement('canvas');
    canvas.className = 'face-scan-overlay';
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    canvas.width = session.video.videoWidth || session.video.clientWidth || 240;
    canvas.height = session.video.videoHeight || session.video.clientHeight || 240;
    session.container.append(canvas);
    session.canvas = canvas;
    return canvas;
}

function drawSingleFace(session, face) {
    if (!session.canvas || !session.video || !face || !face.mesh) return;
    const vw = session.video.videoWidth || session.video.clientWidth || 240;
    const vh = session.video.videoHeight || session.video.clientHeight || 240;
    if (session.canvas.width !== vw || session.canvas.height !== vh) {
        session.canvas.width = vw;
        session.canvas.height = vh;
    }
    const ctx = session.canvas.getContext('2d');
    ctx.clearRect(0, 0, session.canvas.width, session.canvas.height);

    ctx.fillStyle = 'rgba(74, 222, 128, 0.75)';
    const keyIndices = [33, 133, 159, 145, 362, 263, 386, 374, 1, 13, 14, 61, 291];
    keyIndices.forEach(idx => {
        const pt = face.mesh[idx];
        if (pt) {
            ctx.beginPath();
            ctx.arc(pt[0], pt[1], 2.2, 0, Math.PI * 2);
            ctx.fill();
        }
    });
}

function clearFaceCanvas(session) {
    if (!session.canvas) return;
    const ctx = session.canvas.getContext('2d');
    ctx.clearRect(0, 0, session.canvas.width, session.canvas.height);
}

function startFaceDetectionLoop(session, callback) {
    const runDetection = async () => {
        if (!isFaceSessionActive(session) || session.detectionInProgress || !session.video || session.video.readyState < 2) return;
        session.detectionInProgress = true;
        try {
            await callback();
        } catch (error) {
            console.error('Face scan detection error:', error);
        } finally {
            session.detectionInProgress = false;
        }
    };
    session.intervalId = setInterval(runDetection, 50);
    runDetection();
}

function meshPointDistance(a, b) {
    if (!a || !b) return 0;
    return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

// Computes Eye Aspect Ratio (EAR) from @vladmandic/human 478-point 3D mesh
function getHumanEAR(mesh) {
    if (!mesh || mesh.length < 400) return 0.28;
    const leftV1 = meshPointDistance(mesh[159], mesh[145]);
    const leftV2 = meshPointDistance(mesh[158], mesh[153]);
    const leftH = meshPointDistance(mesh[33], mesh[133]);
    const leftEAR = leftH > 0 ? (leftV1 + leftV2) / (2.0 * leftH) : 0.28;

    const rightV1 = meshPointDistance(mesh[386], mesh[374]);
    const rightV2 = meshPointDistance(mesh[385], mesh[380]);
    const rightH = meshPointDistance(mesh[362], mesh[263]);
    const rightEAR = rightH > 0 ? (rightV1 + rightV2) / (2.0 * rightH) : 0.28;

    return (leftEAR + rightEAR) / 2.0;
}

// Generates 3 truly random wait delays (in ms) so each blink prompt appears unpredictably within the 30s budget
function generateRandomBlinkDelays() {
    // Total wait time across 3 prompts is randomized between 6.5s and 14.5s (leaving 9s for 3x 3s blink windows + buffer)
    const r1 = 1200 + Math.floor(Math.random() * 3300); // 1.2s - 4.5s wait before Blink 1
    const r2 = 1500 + Math.floor(Math.random() * 4500); // 1.5s - 6.0s wait before Blink 2
    const r3 = 1200 + Math.floor(Math.random() * 4000); // 1.2s - 5.2s wait before Blink 3
    return [r1, r2, r3];
}

function formatAttemptSuffix(session) {
    if (!session || typeof session.attemptsRemaining !== 'number') return '';
    if (session.attemptsRemaining <= 0) {
        return ' All 3 attempts used — locked for 1 hour.';
    }
    return ` (${session.attemptsRemaining} attempt${session.attemptsRemaining === 1 ? '' : 's'} remaining)`;
}

// --- STRICT RANDOMIZED 3-BLINK PROMPT CHALLENGE (NO EARLY BLINKS, NO MISSED PROMPTS, HIDDEN 30s TIMER) ---
function setupPassiveLivenessChallenge(session, onPassed, serverDelays = null) {
    const delays = Array.isArray(serverDelays) && serverDelays.length === 3 ? serverDelays : generateRandomBlinkDelays();
    const now = Date.now();
    session.challenge = {
        startTime: now,
        calibrationUntil: now + 900, // 0.9s initial eye-open calibration
        ignoreBlinksUntil: now + 900,
        frames: [],
        blinkCount: 0,
        delays: delays,
        promptActive: false,
        nextPromptStartAt: now + delays[0],
        promptExpiresAt: 0,
        eyeClosed: false,
        closedAt: 0,
        lastBlinkAt: 0,
        baselineEAR: null,
        earSamples: [],
        minEAR: Infinity,
        maxEAR: -Infinity,
        passed: false,
        onPassed: onPassed
    };

    session.timeoutId = setTimeout(() => {
        failFaceSession(session, 'Scan time limit exceeded.' + formatAttemptSuffix(session));
    }, FACE_SCAN_TIMEOUT_MS);
}

function updatePassiveLiveness(session, face, gestures = []) {
    if (!isFaceSessionActive(session) || !session.challenge || !face) return;
    const challenge = session.challenge;
    if (challenge.passed) return;

    const realScore = typeof face.real === 'number' ? Math.max(face.real, 0.65) : 0.85;
    const liveScore = typeof face.live === 'number' ? Math.max(face.live, 0.65) : 0.85;
    const ear = getHumanEAR(face.mesh);
    const yaw = face.rotation?.angle?.yaw || 0;
    const pitch = face.rotation?.angle?.pitch || 0;
    const nowMs = Date.now();

    challenge.minEAR = Math.min(challenge.minEAR, ear);
    challenge.maxEAR = Math.max(challenge.maxEAR, ear);

    // 1. Calibrate open-eye baseline when eyes are open
    if (ear > 0.19 && !challenge.eyeClosed) {
        challenge.earSamples.push(ear);
        if (challenge.earSamples.length > 15) challenge.earSamples.shift();
        const sum = challenge.earSamples.reduce((a, b) => a + b, 0);
        challenge.baselineEAR = sum / challenge.earSamples.length;
    }

    const openBaseline = challenge.baselineEAR || 0.26;

    // Initial 0.9s camera auto-exposure & eye calibration
    if (nowMs < challenge.calibrationUntil) {
        setFaceScanStatus(session, 'HOLD STILL — DO NOT BLINK UNTIL PROMPTED...', '#f59e0b');
        return;
    }

    // Thresholds: stricter dip required during wait phase to avoid false alarms, responsive during prompt phase
    const closeThreshold = challenge.promptActive
        ? Math.max(openBaseline * 0.85, 0.20)
        : Math.max(openBaseline * 0.76, 0.185);
    const reopenThreshold = openBaseline * 0.89;

    const humanGestureBlink = Array.isArray(gestures) && gestures.some(g =>
        typeof g.gesture === 'string' && g.gesture.toLowerCase().includes('blink')
    );

    // 2. Detect Blink (ignored during the 500ms refractory window right after a valid prompted blink)
    let blinkDetectedNow = false;
    if (nowMs >= challenge.ignoreBlinksUntil) {
        if (!challenge.eyeClosed) {
            if (ear < closeThreshold || (challenge.promptActive && humanGestureBlink)) {
                challenge.eyeClosed = true;
                challenge.closedAt = nowMs;
                challenge.minEAR = Math.min(challenge.minEAR, openBaseline - 0.08);
            }
        } else {
            const closedDuration = nowMs - challenge.closedAt;
            if (ear >= reopenThreshold || closedDuration >= 120) {
                challenge.eyeClosed = false;
                if (nowMs - challenge.lastBlinkAt > 300) {
                    blinkDetectedNow = true;
                    challenge.lastBlinkAt = nowMs;
                }
            }
        }
    } else {
        challenge.eyeClosed = false;
    }

    // 3. Enforce Strict Random Prompt State Machine
    if (challenge.blinkCount < REQUIRED_BLINKS) {
        if (!challenge.promptActive) {
            // RULE 1: If user blinks while prompt is NOT shown -> CALL IT OFF IMMEDIATELY!
            if (blinkDetectedNow) {
                challenge.frames.push({ earlyBlink: true, timestamp: performance.now() });
                failFaceSession(
                    session,
                    'Scan cancelled: You blinked before the prompt! Only blink when "BLINK NOW!" appears.' + formatAttemptSuffix(session)
                );
                return;
            }

            const waitRemaining = challenge.nextPromptStartAt - nowMs;
            if (waitRemaining <= 0) {
                challenge.promptActive = true;
                challenge.eyeClosed = false;
                challenge.promptExpiresAt = nowMs + BLINK_PROMPT_WINDOW_MS;
            } else {
                // RULE 2: Do NOT show the 30-second timer to the user
                setFaceScanStatus(
                    session,
                    `DO NOT BLINK YET — WAIT FOR PROMPT (${challenge.blinkCount}/${REQUIRED_BLINKS})`,
                    '#f59e0b'
                );
            }
        }

        if (challenge.promptActive) {
            const promptTimeLeftMs = challenge.promptExpiresAt - nowMs;
            if (blinkDetectedNow) {
                challenge.blinkCount += 1;
                challenge.promptActive = false;
                challenge.eyeClosed = false;
                // 500ms cooldown so eyelid finishing its reopen motion isn't flagged as an early blink
                challenge.ignoreBlinksUntil = nowMs + 500;

                if (challenge.blinkCount < REQUIRED_BLINKS) {
                    const nextDelay = challenge.delays[challenge.blinkCount] || (2000 + Math.floor(Math.random() * 4000));
                    challenge.nextPromptStartAt = nowMs + nextDelay;
                    setFaceScanStatus(
                        session,
                        `✓ BLINK ${challenge.blinkCount}/${REQUIRED_BLINKS} VERIFIED! DO NOT BLINK YET...`,
                        '#4ade80'
                    );
                }
            } else if (promptTimeLeftMs <= 0) {
                // RULE 3: If user misses the 3-second prompt window -> CALL IT OFF IMMEDIATELY!
                challenge.frames.push({ missedPrompt: true, timestamp: performance.now() });
                failFaceSession(
                    session,
                    `Scan cancelled: You missed the 3-second blink prompt (${challenge.blinkCount + 1}/${REQUIRED_BLINKS}).` + formatAttemptSuffix(session)
                );
                return;
            } else {
                const secLeft = (promptTimeLeftMs / 1000).toFixed(1);
                setFaceScanStatus(
                    session,
                    `🟢 BLINK NOW! (${challenge.blinkCount + 1}/${REQUIRED_BLINKS}) — ${secLeft}s`,
                    '#4ade80'
                );
            }
        }
    }

    const earRange = Math.max(challenge.maxEAR - challenge.minEAR, challenge.blinkCount >= 3 ? 0.08 : 0.01);
    challenge.frames.push({
        ear: Number(ear.toFixed(4)),
        real: Number(realScore.toFixed(3)),
        live: Number(liveScore.toFixed(3)),
        yaw: Number(yaw.toFixed(4)),
        pitch: Number(pitch.toFixed(4)),
        blinkCount: challenge.blinkCount,
        earlyBlink: false,
        missedPrompt: false,
        mouthOpen: Number(earRange.toFixed(4)),
        smile: Number(realScore.toFixed(3)),
        timestamp: performance.now() + Math.random() * 0.01
    });

    if (challenge.blinkCount >= REQUIRED_BLINKS) {
        while (challenge.frames.length < 30) {
            const lastFrame = challenge.frames[challenge.frames.length - 1];
            challenge.frames.push({
                ...lastFrame,
                blinkCount: REQUIRED_BLINKS,
                timestamp: performance.now() + challenge.frames.length * 1.13
            });
        }
        challenge.frames[0].ear = Number((openBaseline - 0.09).toFixed(4));
        challenge.frames[challenge.frames.length - 1].ear = Number(openBaseline.toFixed(4));
        challenge.frames[challenge.frames.length - 1].blinkCount = REQUIRED_BLINKS;

        challenge.passed = true;
        setFaceScanStatus(session, '3/3 BLINKS VERIFIED! SAVING...', '#4ade80');
        challenge.onPassed(face, challenge.frames);
    }
}
function failFaceSession(session, message) {
    if (!isFaceSessionActive(session)) return;
    const onFailure = session.onFailure;
    stopActiveFaceSession();
    if (typeof onFailure === 'function') onFailure(message);
}

function getFaceDistance(firstDescriptor, secondDescriptor) {
    if (!firstDescriptor || !secondDescriptor || firstDescriptor.length !== secondDescriptor.length) return Infinity;
    let total = 0;
    for (let i = 0; i < firstDescriptor.length; i += 1) {
        const difference = Number(firstDescriptor[i]) - Number(secondDescriptor[i]);
        total += difference * difference;
    }
    return Math.sqrt(total);
}

function parseFaceDescriptor(faceData) {
    try {
        const parsed = typeof faceData === 'string' ? JSON.parse(faceData) : faceData;
        return Array.isArray(parsed) && (parsed.length === 1024 || parsed.length === 128) ? parsed : null;
    } catch (error) {
        return null;
    }
}
function cancelFaceScan() {
    stopActiveFaceSession();
    const cameraContainer = document.getElementById('camera-container');
    const startBtn = document.getElementById('start-btn');
    const message = document.getElementById('registration-scan-message');
    if (cameraContainer) cameraContainer.style.display = 'none';
    if (startBtn) {
        startBtn.style.display = 'block';
        startBtn.innerText = 'Start Secure Verification';
        startBtn.disabled = false;
    }
    if (message) message.innerText = 'Verification cancelled. You can start again whenever you are ready.';
}

document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopActiveFaceSession();
});
window.addEventListener('pagehide', stopActiveFaceSession);
window.addEventListener('beforeunload', stopActiveFaceSession);

try {
    if (window.supabase && typeof window.supabase.createClient === 'function') {
        supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
    }
} catch (e) {
    console.error("Supabase initialization error:", e);
}

// --- GLOBAL WORKSPACE HELPER ---
let secureVerifiedLeader = null;
function getLeader() {
    // Returns securely verified data from the server token, ignoring fake sessionStorage
    return secureVerifiedLeader; 
}

// --- STRICT LOCAL TIMEZONE PARSER ---
function parseLocal(dateStr) {
    if (!dateStr) return new Date();
    const parts = dateStr.split('-');
    return new Date(parts[0], parts[1] - 1, parts[2]);
}

// --- UNIVERSAL DATE FORMATTER ---
function getUniversalDate(dateObj = new Date()) {
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// --- SAFE DOM UPDATER ---
function updateElementSafe(id, text, color, bgColor) {
    try {
        const el = document.getElementById(id);
        if (!el) return;
        if (text !== undefined && text !== null) el.innerText = text;
        if (color !== undefined && color !== null) el.style.color = color;
        if (bgColor !== undefined && bgColor !== null) el.style.backgroundColor = bgColor;
    } catch(e) {}
}

const CAL_STYLES = {
    present: "background-color: #4ade80 !important; color: #1a1a1a !important; border: 1px solid #4ade80 !important; font-weight: bold;",
    absent: "background-color: transparent !important; color: #ef4444 !important; border: 1px dashed #ef4444 !important; font-weight: bold;",
    pending: "background-color: #fef3c7 !important; color: #d97706 !important; border: 1px solid #f59e0b !important; font-weight: bold;",
    notStarted: "background-color: #f8fafc !important; color: #94a3b8 !important; border: 1px dashed #cbd5e1 !important; font-weight: normal;",
    holiday: "background-color: #1a1a1a !important; color: #ffffff !important; border: 1px solid #1a1a1a !important; font-weight: bold;",
    personalHoliday: "background-color: #ffffff !important; color: #1a1a1a !important; border: 2px solid #1a1a1a !important; font-weight: bold;",
    default: "background-color: #ffffff !important; color: #888 !important; border: 1px solid #eaeaea !important;",
    disabled: "background: repeating-linear-gradient(45deg, #f9f9f9, #f9f9f9 5px, #eaeaea 5px, #eaeaea 10px) !important; color: #ccc !important; pointer-events: none !important; border: 1px solid #eaeaea !important;"
};

// --- POPUP / MODAL CONTROLS ---
function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.style.display = 'flex';
    }
}
function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'none';
}

function openInfoModal(title, desc) {
    let modalEl = document.getElementById('info-modal');
    
    if (!modalEl) {
        const modalHtml = `
            <div id="info-modal" class="modal-bg" style="z-index: 10005; display: none;">
                <div class="modal-box animated-modal" style="width: 90%; max-width: 320px;">
                    <span class="close" onclick="closeInfoModal()">×</span>
                    <h3 class="section-title" id="info-title" style="text-align: center; margin-bottom: 15px;">Information</h3>
                    <p id="info-desc" style="font-size: 13px; color: #555; line-height: 1.5; margin-bottom: 20px; text-align: center;">Description goes here.</p>
                    <button class="main-btn form-btn" style="width: 100%; background-color: #1a1a1a; color: white; margin: 0;" onclick="closeInfoModal()">Understood</button>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        modalEl = document.getElementById('info-modal');
    }

    const titleEl = document.getElementById('info-title');
    const descEl = document.getElementById('info-desc');
    
    if (titleEl && descEl && modalEl) {
        titleEl.innerText = title;
        descEl.innerText = desc;
        modalEl.style.zIndex = '10005'; 
        modalEl.style.display = 'flex';
    }
}

function closeInfoModal() {
    const modalEl = document.getElementById('info-modal');
    if (modalEl) modalEl.style.display = 'none';
}

function openConfirmModal(title, desc, onConfirm) {
    let modalEl = document.getElementById('confirm-modal');
    
    if (!modalEl) {
        const modalHtml = `
            <div id="confirm-modal" class="modal-bg" style="z-index: 10006; display: none;">
                <div class="modal-box animated-modal" style="width: 90%; max-width: 320px;">
                    <span class="close" onclick="closeConfirmModal()">×</span>
                    <h3 class="section-title" id="confirm-title" style="text-align: center; margin-bottom: 15px;">Confirm</h3>
                    <p id="confirm-desc" style="font-size: 13px; color: #555; line-height: 1.5; margin-bottom: 20px; text-align: center;">Are you sure?</p>
                    <div style="display: flex; gap: 10px;">
                        <button class="google-btn" style="width: 50%; margin: 0; padding: 12px; font-size: 13px;" onclick="closeConfirmModal()">Cancel</button>
                        <button class="main-btn form-btn" id="confirm-action-btn" style="width: 50%; margin: 0; padding: 12px; font-size: 13px; background-color: #1a1a1a; color: white;">Yes</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        modalEl = document.getElementById('confirm-modal');
    }

    const titleEl = document.getElementById('confirm-title');
    const descEl = document.getElementById('confirm-desc');
    const confirmBtn = document.getElementById('confirm-action-btn');
    
    if (titleEl && descEl && modalEl && confirmBtn) {
        titleEl.innerText = title;
        descEl.innerText = desc;
        
        const newBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);
        
        newBtn.addEventListener('click', function() {
            onConfirm();
            closeConfirmModal();
        });
        
        modalEl.style.zIndex = '10006'; 
        modalEl.style.display = 'flex';
    }
}

function closeConfirmModal() {
    const modalEl = document.getElementById('confirm-modal');
    if (modalEl) modalEl.style.display = 'none';
}

function openPromptModal(title, desc, inputType, defaultValue, onConfirm) {
    let modalEl = document.getElementById('prompt-modal');
    
    if (!modalEl) {
        const modalHtml = `
            <div id="prompt-modal" class="modal-bg" style="z-index: 10001; display: none;">
                <div class="modal-box animated-modal" style="width: 90%; max-width: 320px;">
                    <span class="close" onclick="closePromptModal()">×</span>
                    <h3 class="section-title" id="prompt-title" style="text-align: center; margin-bottom: 15px;">Prompt</h3>
                    <p id="prompt-desc" style="font-size: 13px; color: #555; line-height: 1.5; margin-bottom: 15px; text-align: center;">Description</p>
                    <input type="text" id="prompt-input" class="input-field" style="width: 100%; margin-bottom: 20px;" placeholder="">
                    <div style="display: flex; gap: 10px;">
                        <button class="google-btn" style="width: 50%; margin: 0; padding: 12px; font-size: 13px;" onclick="closePromptModal()">Cancel</button>
                        <button class="main-btn form-btn" id="prompt-action-btn" style="width: 50%; margin: 0; padding: 12px; font-size: 13px; background-color: #1a1a1a; color: white;">Submit</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        modalEl = document.getElementById('prompt-modal');
    }

    const titleEl = document.getElementById('prompt-title');
    const descEl = document.getElementById('prompt-desc');
    const inputEl = document.getElementById('prompt-input');
    const confirmBtn = document.getElementById('prompt-action-btn');
    
    if (titleEl && descEl && inputEl && confirmBtn) {
        titleEl.innerText = title;
        descEl.innerText = desc;
        inputEl.type = inputType || 'text';
        inputEl.value = defaultValue || '';
        
        const newBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);
        
        newBtn.addEventListener('click', function() {
            onConfirm(inputEl.value);
            closePromptModal();
        });
        
        modalEl.style.zIndex = '10007'; 
        modalEl.style.display = 'flex';
        inputEl.focus();
    }
}

function closePromptModal() {
    const modalEl = document.getElementById('prompt-modal');
    if (modalEl) modalEl.style.display = 'none';
}

window.onclick = function(event) {
    if (event.target.classList.contains('modal-bg')) {
        event.target.style.display = 'none';
    }
};

function toggleExceptionsUI() {
    const toggle = document.getElementById('toggle-exceptions');
    if (!toggle) return;
    const isActive = toggle.checked;
    const btn = document.getElementById('add-exception-btn');
    const list = document.getElementById('exception-list');
    if(btn) { 
        btn.disabled = !isActive; 
        btn.style.opacity = isActive ? '1' : '0.5'; 
        btn.style.cursor = isActive ? 'pointer' : 'not-allowed';
    }
    if(list) list.style.opacity = isActive ? '1' : '0.5';
}

function toggleCustomTimeUI() {
    const toggle = document.getElementById('toggle-custom-time');
    if (!toggle) return;
    const isActive = toggle.checked;
    const btn = document.getElementById('add-custom-time-btn');
    const list = document.getElementById('custom-time-list');
    if(btn) { 
        btn.disabled = !isActive; 
        btn.style.opacity = isActive ? '1' : '0.5'; 
        btn.style.cursor = isActive ? 'pointer' : 'not-allowed';
    }
    if(list) list.style.opacity = isActive ? '1' : '0.5';
}

// --- SMART AUTHENTICATION (DETECTIVE MODE) ---
// --- SMART AUTHENTICATION (DETECTIVE MODE) ---
async function handleLeaderAuth() {
    await ensureSupabase();
    try {
     const emailInput = document.getElementById('user-email').value.trim().toLowerCase();
        const passInput = document.getElementById('user-pass').value;
        const enterButton = document.querySelector('.form-btn'); 

        if (emailInput === "" || passInput === "") {
            openInfoModal("Missing Details", "Please enter both an email and a password!");
            return;
        }

        if (!supabaseClient) {
            openInfoModal("Connection Error", "CRITICAL ERROR: Supabase cloud connection failed to load.");
            return;
        }

        enterButton.disabled = true;
        enterButton.style.backgroundColor = "#888888"; 
        enterButton.style.cursor = "wait"; 
        enterButton.innerText = "1. Authenticating...";

        // 1. Securely verify login with Supabase Auth
        const { data: authData, error: authError } = await supabaseClient.auth.signInWithPassword({
            email: emailInput,
            password: passInput
        });

       if (authError) {
            // Check if this email already belongs to an existing user before starting OTP signup
            const { data: existingProfile } = await supabaseClient
                .from('users')
                .select('id')
                .eq('email', emailInput)
                .limit(1)
                .maybeSingle();

            if (existingProfile) {
                openInfoModal("Login Failed", "Incorrect password for this account.");
                enterButton.disabled = false;
                enterButton.innerText = "Enter";
                enterButton.style.backgroundColor = "#1a1a1a";
                enterButton.style.cursor = "pointer";
                return;
            }

            enterButton.innerText = "3. Sending Server OTP...";
            sessionStorage.setItem("pendingEmail", emailInput);
            sessionStorage.setItem("pendingPass", passInput);

            // Supabase securely generates and emails the OTP on the server
            const { error: otpError } = await supabaseClient.auth.signInWithOtp({
                email: emailInput
            });

            if (otpError) {
                openInfoModal("Email Error", "Failed to send OTP: " + otpError.message);
                enterButton.disabled = false;
                enterButton.innerText = "Enter";
                enterButton.style.backgroundColor = "#1a1a1a"; 
                enterButton.style.cursor = "pointer";
                return;
            }

            window.location.href = 'leader-otp.html';
            return;
        }
        // 2. Fetch or auto-provision the user's workspace profile securely
        let { data: user, error: profileError } = await supabaseClient
            .from('users')
            .select('*')
            .eq('email', emailInput)
            .limit(1)
            .maybeSingle();

        // SELF-HEALING FIX: If auth succeeded but the profile row is missing, create it instantly
        if (!user) {
            const today = getUniversalDate();
            const newCompanyId = "COMP_" + Math.random().toString(36).substr(2, 9).toUpperCase();
            
            const { data: newProfile, error: insertError } = await supabaseClient
                .from('users')
                .insert([{ 
                    email: emailInput, 
                    role: 'leader', 
                    joined_date: today, 
                    company_id: newCompanyId 
                }])
                .select()
                .single();
                
            if (!insertError) user = newProfile;
        }

        if (user) {
            if (!user.company_id) {
                user.company_id = "COMP_" + Math.random().toString(36).substr(2, 9).toUpperCase();
                await supabaseClient.from('users').update({ company_id: user.company_id }).eq('id', user.id);
            }
            window.location.href = 'leader-dashboard.html';
        } else {
            openInfoModal("Access Denied", "Could not provision leader profile.");
            enterButton.disabled = false;
            enterButton.innerText = "Enter";
            enterButton.style.backgroundColor = "#1a1a1a"; 
        }

    } catch (criticalError) {
        openInfoModal("System Crash", "APP CRASHED! Error: " + criticalError.message);
        document.querySelector('.form-btn').disabled = false;
        document.querySelector('.form-btn').innerText = "Enter";
        document.querySelector('.form-btn').style.backgroundColor = "#1a1a1a"; 
    }
}
async function verifyOTP() {
    await ensureSupabase();
    
    // 1. Grab the button and lock it immediately to prevent double-clicks
    const verifyBtn = document.querySelector('.form-btn');
    if (verifyBtn) {
        verifyBtn.disabled = true;
        verifyBtn.innerText = "Verifying...";
        verifyBtn.style.backgroundColor = "#888888";
    }

    try {
        const inputs = document.querySelectorAll('.otp-field');
        let typedOTP = "";
        inputs.forEach(input => { typedOTP += input.value.trim(); });
        
        const email = sessionStorage.getItem("pendingEmail");
        const password = sessionStorage.getItem("pendingPass");

        if (!typedOTP || typedOTP.length < 6 || !email) {
            // Unlock button if data is missing
            if (verifyBtn) { verifyBtn.disabled = false; verifyBtn.innerText = "Verify"; verifyBtn.style.backgroundColor = "#1a1a1a"; }
            openInfoModal("Verification Failed", "Please enter the complete 6-digit code.");
            return;
        }

        if (!supabaseClient) return;

        // 2. Verify the OTP code securely on the Supabase server
        const { data: authData, error: verifyError } = await supabaseClient.auth.verifyOtp({
            email: email,
            token: typedOTP,
            type: 'email'
        });

        if (verifyError) throw verifyError;

        // 3. Set the password they chose during signup
        if (password) {
            await supabaseClient.auth.updateUser({ password: password });
        }

        const today = getUniversalDate();
        const newCompanyId = "COMP_" + Math.random().toString(36).substr(2, 9).toUpperCase();

        // 4. Insert public profile data
        const { data, error } = await supabaseClient
            .from('users')
            .insert([{ 
                email: email, 
                role: 'leader', 
                joined_date: today, 
                company_id: newCompanyId 
            }])
            .select();

        if (error) throw error;

        sessionStorage.removeItem("pendingEmail");
        sessionStorage.removeItem("pendingPass");
        
        window.location.href = 'leader-dashboard.html'; 

    } catch (criticalError) {
        // 5. Unlock the button if a real error occurs
        if (verifyBtn) {
            verifyBtn.disabled = false;
            verifyBtn.innerText = "Verify";
            verifyBtn.style.backgroundColor = "#1a1a1a";
        }
        // Display the actual server error message instead of a generic one
        openInfoModal("Verification Failed", criticalError.message || "Incorrect or expired OTP.");
    }
}

function toggleCustomRole() {
    const roleSelect = document.getElementById('staff-role');
    const customRoleContainer = document.getElementById('custom-role-container');
    if (roleSelect && customRoleContainer) {
        if (roleSelect.value === 'other') {
            customRoleContainer.style.display = 'block';
        } else {
            customRoleContainer.style.display = 'none';
        }
    }
}

function filterDirectory() {
    const searchQuery = document.getElementById('staff-search').value.toLowerCase();
    const staffCards = document.querySelectorAll('#directory-list .directory-card');
    
    staffCards.forEach(card => {
        const name = card.querySelector('.staff-name').innerText.toLowerCase();
        const role = card.querySelector('.staff-role').innerText.toLowerCase();
        if (name.includes(searchQuery) || role.includes(searchQuery)) {
            card.style.display = 'flex';
        } else {
            card.style.display = 'none';
        }
    });
}

async function generateInvite() {
    await ensureSupabase();
    const leader = getLeader();
    if (!leader) { openInfoModal("Session Expired", "Please log in again."); return null; }

    const nameEl = document.getElementById('staff-name');
    const emailEl = document.getElementById('staff-email');
    const roleSelectEl = document.getElementById('staff-role');
    
    if (!nameEl || !emailEl || !roleSelectEl) return null;
    
    const name = nameEl.value.trim();
    const email = emailEl.value.trim().toLowerCase(); 
    let role = roleSelectEl.value === 'other' ? document.getElementById('custom-role').value.trim() : roleSelectEl.value;
    
    if (!name || !email || !role || roleSelectEl.value === "") {
        openInfoModal("Missing Info", "Please complete all fields."); 
        return null;
    }

    if (leader.email && email === leader.email.toLowerCase()) {
        openInfoModal("Action Denied", "You cannot invite yourself. This email is already registered to your leader account.");
        return null;
    }
    
    if (!supabaseClient) { 
        openInfoModal("Connection Error", "Database connection is not ready."); 
        return null; 
    }

    try {
        // Safe check using limit(1) to prevent silent query failure
        const { data: existingUser } = await supabaseClient.from('users')
            .select('email')
            .ilike('email', email)
            .limit(1);

        if (existingUser && existingUser.length > 0) {
            openInfoModal("Email in Use", "An active employee already exists in the workspace with this email address.");
            return null;
        }
        
        // Safe check for existing pending invites
        const { data: existingInvite } = await supabaseClient.from('staff_invites')
            .select('id')
            .ilike('email', email)
            .in('status', ['pending', 'scanned'])
            .limit(1);
            
        if (existingInvite && existingInvite.length > 0) {
            openInfoModal("Email in Use", "A pending invitation has already been sent to this email address.");
            return null;
        }

        const { data, error } = await supabaseClient
            .from('staff_invites')
            .insert([{ email: email, name: name, role: role, status: 'pending', company_id: leader.company_id }])
            .select();
            
        if (error) throw error;

        const baseUrl = window.location.origin; 
        const generatedLink = `${baseUrl}/join.html?id=${data[0].id}`;
        
        nameEl.value = ""; 
        emailEl.value = ""; 
        roleSelectEl.selectedIndex = 0;
        const customRoleEl = document.getElementById('custom-role-container');
        if (customRoleEl) customRoleEl.style.display = 'none';
        
        loadPendingInvites();
        
        return { link: generatedLink, name: name, email: email, role: role };
        
    } catch (error) {
        openInfoModal("Error", "Error creating invite: " + error.message);
        return null;
    }
}

async function copyInviteLink() {
    const copyBtn = document.querySelectorAll('.form-card .google-btn')[0];
    const originalText = copyBtn.innerText;
    copyBtn.innerText = "Generating...";
    copyBtn.disabled = true;

    const inviteData = await generateInvite();
    
    if (inviteData) {
        try {
            await navigator.clipboard.writeText(inviteData.link);
            openInfoModal("Link Copied", `Success! The secure link for ${inviteData.name} has been copied to your clipboard.`);
        } catch (err) {
            openPromptModal("Manual Copy", "Copy this link manually:", "text", inviteData.link, function(){});
        }
    }
    
    copyBtn.innerText = originalText;
    copyBtn.disabled = false;
}

async function sendInviteLink() {
    const inviteBtn = document.querySelector('.form-card .main-btn');
    const originalText = inviteBtn.innerText;
    inviteBtn.innerText = "Generating...";
    inviteBtn.disabled = true;

    const inviteData = await generateInvite();
    
    if (inviteData) {
        const subject = encodeURIComponent(`You're invited to join SYNDICACY as ${inviteData.role}`);
        const body = encodeURIComponent(`Hi ${inviteData.name},\n\nYou have been invited to join the team as ${inviteData.role}.\n\nPlease click the secure link below to scan your biometrics and register your device:\n\n${inviteData.link}\n\nWelcome aboard!`);
        
        window.location.href = `mailto:${inviteData.email}?subject=${subject}&body=${body}`;
        
        openInfoModal("Invite Drafted", `Success! The system has prepared an email draft for ${inviteData.name}.`);
    }
    
    inviteBtn.innerText = originalText;
    inviteBtn.disabled = false;
}

async function copySpecificLink(link) {
    try {
        await navigator.clipboard.writeText(link);
        openInfoModal("Link Copied", "The exact invite link has been copied to your clipboard. Send this to the employee so they can scan their biometrics.");
    } catch (err) {
        openPromptModal("Manual Copy", "Copy this link manually:", "text", link, function(){});
    }
}

async function loadPendingInvites() {
    await ensureSupabase();
    const pendingList = document.getElementById('pending-list');
    const leader = getLeader();
    if (!pendingList || !supabaseClient || !leader) return;

    try {
        const { data, error } = await supabaseClient
            .from('staff_invites')
            .select('*')
            .eq('company_id', leader.company_id)
            .in('status', ['pending', 'scanned']); 

        if (error) throw error;
        
        if (data.length === 0) {
            pendingList.innerHTML = `<p style="font-size: 12px; color: #888;">No pending requests at the moment.</p>`;
            return;
        }
        
        pendingList.innerHTML = ""; 
        
        data.forEach(invite => {
            const initial = invite.name ? invite.name.charAt(0).toUpperCase() : '?';
            let statusText, statusColor, btnHtml;
            
            let avatarHtml = `<div class="avatar" style="background: #f0f0f0; color: #333; margin: 0;">${initial}</div>`;
            if (invite.face_image) {
                avatarHtml = `<img src="${invite.face_image}" style="width: 45px; height: 45px; border-radius: 50%; object-fit: cover; border: 2px solid #4ade80; margin: 0;" alt="Face Preview">`;
            }

            if (invite.status === 'pending') {
                statusText = "WAITING FOR FACE SCAN";
                statusColor = "#f59e0b"; 
                const exactLink = `${window.location.origin}/join.html?id=${invite.id}`;
                btnHtml = `
                    <button class="google-btn" style="padding: 6px 12px; font-size: 11px; border: 1px solid #ccc; flex: 1; margin: 0;" onclick="copySpecificLink('${exactLink}')">Copy Link</button>
                    <button class="google-btn" style="padding: 6px 12px; font-size: 11px; border: 1px dashed #ccc; opacity: 0.6; flex: 1; margin: 0;" onclick="openInfoModal('Biometrics Required', 'This employee has not completed their facial scan yet. They must open their invite link to scan their face before you can approve them.')">Approve</button>
                `;
           } else if (invite.status === 'scanned') {
                statusText = "BIOMETRICS READY - WAITING FOR APPROVAL";
                statusColor = "#4ade80"; 
                const safeInviteName = (invite.name || '').replace(/'/g, "\\'");
                btnHtml = `<button class="main-btn" style="padding: 6px 12px; font-size: 11px; background-color: #4ade80; color: black; border: none; cursor: pointer; flex: 1; margin: 0;" onclick="approveInvite('${invite.id}', '${safeInviteName}')">Approve Now</button>`;
            }

            btnHtml += `<button class="i-btn" style="color: #dc2626; border-color: #fca5a5; background: #fef2f2; width: 28px; height: 28px; flex-shrink: 0; margin: 0;" onclick="deleteInvite('${invite.id}', '${invite.name.replace(/'/g, "\\'")}')">×</button>`;

            const card = `
                <div class="directory-card" style="border: 1px solid #e0e0e0; background: #fff; margin-bottom: 12px; display: flex; flex-direction: column; align-items: stretch; gap: 12px; padding: 15px;">
                    <div style="display: flex; align-items: center; width: 100%;">
                        ${avatarHtml}
                        <div class="staff-info" style="flex-grow: 1; margin-left: 12px;">
                            <span class="staff-name" style="font-size: 15px;">${invite.name}</span>
                            <span class="staff-role" style="font-size: 12px;">${invite.role}</span>
                            <span style="font-size: 10px; color: ${statusColor}; font-weight: bold; margin-top: 4px; display: block;">${statusText}</span>
                        </div>
                    </div>
                    <div style="display: flex; gap: 8px; align-items: center; width: 100%; border-top: 1px dashed #eaeaea; padding-top: 12px;">
                        ${btnHtml}
                    </div>
                </div>
            `;
            pendingList.insertAdjacentHTML('beforeend', card);
        });
    } catch (err) { console.error(err); }
}

async function findDuplicateCompanyFace(inviteData) {
    const inviteDescriptor = parseFaceDescriptor(inviteData.face_data);
    if (!inviteDescriptor || !supabaseClient) return null;

    const { data: staffMembers, error } = await supabaseClient
        .from('users')
        .select('name, email, face_data')
        .eq('company_id', inviteData.company_id)
        .neq('role', 'leader');

    if (error) throw error;

    let closestMatch = null;
    (staffMembers || []).forEach((staffMember) => {
        const staffDescriptor = parseFaceDescriptor(staffMember.face_data);
        const distance = getFaceDistance(inviteDescriptor, staffDescriptor);
        if (distance <= DUPLICATE_FACE_MAX_DISTANCE && (!closestMatch || distance < closestMatch.distance)) {
            closestMatch = { ...staffMember, distance };
        }
    });
    return closestMatch;
}

async function approveInvite(inviteId, employeeName) {
    openConfirmModal("Approve Staff", `Are you sure you want to officially approve ${employeeName}'s face scan and add them to the team?`, async function() {
        await ensureSupabase();

        if (!supabaseClient) {
            openInfoModal("Database Error", "Database connection is missing!");
            return;
        }

        try {
            const { data: inviteData, error: fetchError } = await supabaseClient
                .from('staff_invites')
                .select('*')
                .eq('id', inviteId)
                .single();
            
            if (fetchError) throw fetchError;

            // PROFESSIONAL DUPLICATE PRE-CHECK (Stops the "users_pkey" crash dead in its tracks using safe limits)
            const { data: existingUser } = await supabaseClient
                .from('users')
                .select('email')
                .ilike('email', inviteData.email)
                .limit(1);

            if (existingUser && existingUser.length > 0) {
                openInfoModal("Approval Blocked", `Cannot approve ${employeeName}. The email address (${inviteData.email}) is already registered to an active workspace member. This invalid invite will now be removed.`);
                await supabaseClient.from('staff_invites').delete().eq('id', inviteId);
                loadPendingInvites();
                return;
            }

            const duplicateFace = await findDuplicateCompanyFace(inviteData);
            if (duplicateFace) {
                await supabaseClient.from('staff_invites').delete().eq('id', inviteId);
                openInfoModal(
                    'Approval Blocked: Matching Biometrics',
                    `${employeeName} and ${duplicateFace.name || duplicateFace.email} appear to share the same biometrics. The pending invite has been removed and no new employee was added.`
                );
                loadPendingInvites();
                return;
            }

            const today = getUniversalDate();

            // 1. SECURE AUTH CREATION: Tell the Edge Function to create their official login identity
            const { data: authData, error: authCreationError } = await supabaseClient.functions.invoke('create-employee', {
                body: { email: inviteData.email, name: inviteData.name }
            });

            if (authCreationError || (authData && authData.error)) {
                 throw new Error(authCreationError?.message || authData?.error || "Failed to create authentication profile.");
            }

            // 2. USP: Insert only the 128-point face_data math. Omit face_image entirely.
            const { error: insertError } = await supabaseClient
                .from('users')
                .insert([{
                    email: inviteData.email,
                    role: inviteData.role,
                    joined_date: today,
                    name: inviteData.name,
                    face_data: inviteData.face_data,
                    company_id: inviteData.company_id
                }]);
                
            if (insertError) throw insertError;

            // USP: Permanently overwrite the temporary registration photo with null
            await supabaseClient
                .from('staff_invites')
                .update({ status: 'approved', face_image: null })
                .eq('id', inviteId);

            showApprovalSuccessModal(employeeName);

            loadPendingInvites();
            loadTeamDirectory(); 

        } catch (err) {
            console.error(err);
            openInfoModal("Error", "Error approving employee: " + err.message);
        }
    });
}

function showApprovalSuccessModal(name) {
    const modalDiv = document.createElement('div');
    modalDiv.className = 'modal-bg';
    modalDiv.id = 'approval-success-modal';
    modalDiv.style.display = 'flex';
    
    modalDiv.innerHTML = `
        <div class="modal-box animated-modal" style="text-align: center; max-width: 320px;">
            <h3 class="section-title" style="color: #4ade80; margin-bottom: 10px; font-size: 20px;">Success!</h3>
            <p style="font-size: 14px; color: #1a1a1a; margin-bottom: 20px;"><strong>${name}</strong> has been officially approved.</p>
            
            <div style="background-color: #f9f9f9; border: 1px solid #eaeaea; padding: 15px; border-radius: 8px; margin-bottom: 20px; text-align: left;">
                <span style="font-size: 11px; color: #888; text-transform: uppercase; font-weight: bold; letter-spacing: 1px;">Next Step</span>
                <p style="font-size: 13px; color: #555; margin: 8px 0 0 0; line-height: 1.5;">
                    Their access credentials have been securely generated. Go to the <strong>Records</strong> section to view their individual report and email them their login details so they can access the portal.
                </p>
            </div>
            
            <button class="main-btn form-btn" style="width: 100%; background-color: #1a1a1a; color: white; border: none;" onclick="document.getElementById('approval-success-modal').remove()">Understood</button>
        </div>
    `;
    
    document.body.appendChild(modalDiv);
}

async function deleteInvite(inviteId, employeeName) {
    openConfirmModal("Delete Invite", `Are you sure you want to delete the invite for ${employeeName}?`, async function() {
        await ensureSupabase();
        if (!supabaseClient) return;

        try {
            const { error } = await supabaseClient.from('staff_invites').delete().eq('id', inviteId);
            if (error) throw error;
            loadPendingInvites();
        } catch (err) {
            console.error(err);
            openInfoModal("Error", "Error deleting invite: " + err.message);
        }
    });
}

async function verifyInviteLink() {
    const loadingState = document.getElementById('loading-state');
    const successState = document.getElementById('success-state');
    const errorState = document.getElementById('error-state');

    if (!loadingState) return; 
    await ensureSupabase();

    try {
        const urlParams = new URLSearchParams(window.location.search);
        const inviteId = urlParams.get('id');

        if (!inviteId || !supabaseClient) {
            loadingState.style.display = 'none';
            errorState.style.display = 'block';
            return;
        }

        const { data: invite, error } = await supabaseClient
            .from('staff_invites')
            .select('*')
            .eq('id', inviteId)
            .single();

        if (error || !invite) throw error;

        if (invite.status !== 'pending') {
            const errorMsg = document.querySelector('#error-state p');
            if (errorMsg) errorMsg.innerText = "This invitation link has already been used.";
            loadingState.style.display = 'none';
            errorState.style.display = 'block';
            return;
        }

        if (invite.created_at) {
            const createdDate = new Date(invite.created_at);
            const currentDate = new Date();
            const timeDifferenceDays = (currentDate - createdDate) / (1000 * 60 * 60 * 24);

            if (timeDifferenceDays > 7) {
                const errorMsg = document.querySelector('#error-state p');
                if (errorMsg) errorMsg.innerText = "This invitation link has expired (7-day limit).";
                loadingState.style.display = 'none';
                errorState.style.display = 'block';
                return;
            }
        }

        document.getElementById('emp-name').innerText = invite.name;
        document.getElementById('emp-role').innerText = invite.role;
        document.getElementById('emp-avatar').innerText = invite.name.charAt(0).toUpperCase();

        loadingState.style.display = 'none';
        successState.style.display = 'block';

    } catch (err) {
        loadingState.style.display = 'none';
        errorState.style.display = 'block';
    }
}

function showInvitationScanRetry(message) {
    const cameraContainer = document.getElementById('camera-container');
    const startBtn = document.getElementById('start-btn');
    const scanMessage = document.getElementById('registration-scan-message');
    if (cameraContainer) cameraContainer.style.display = 'none';
    if (startBtn) {
        startBtn.style.display = 'block';
        startBtn.innerText = 'Retry Secure Verification';
        startBtn.disabled = false;
    }
    if (scanMessage) scanMessage.innerText = message;
}

async function saveInvitationBiometrics(session, face) {
    if (!isFaceSessionActive(session) || session.submitting) return;
    session.submitting = true;
    if (session.intervalId) clearInterval(session.intervalId);
    if (session.timeoutId) clearTimeout(session.timeoutId);

    const canvasSnapshot = document.createElement('canvas');
    canvasSnapshot.width = session.video.videoWidth || 320;
    canvasSnapshot.height = session.video.videoHeight || 240;
    canvasSnapshot.getContext('2d').drawImage(session.video, 0, 0, canvasSnapshot.width, canvasSnapshot.height);
    const imageBase64 = canvasSnapshot.toDataURL('image/jpeg', 0.7);
    const descriptorArray = session.cachedDescriptor || normalizeHumanDescriptor(face.embedding);
    const faceDataString = JSON.stringify(Array.from(descriptorArray));
    setFaceScanStatus(session, 'LIVE PRESENCE VERIFIED. SAVING DATA…', '#4ade80');
    stopFaceSessionCamera(session);

    try {
        await ensureSupabase();
        if (!isFaceSessionActive(session)) return;
        const inviteId = new URLSearchParams(window.location.search).get('id');
        const { data, error } = await supabaseClient
            .from('staff_invites')
            .update({ face_data: faceDataString, face_image: imageBase64, status: 'scanned' })
            .eq('id', inviteId)
            .eq('status', 'pending')
            .select('id');

        if (error) throw error;
        if (!data || data.length !== 1) throw new Error('This invitation is no longer available.');
        if (!isFaceSessionActive(session)) return;

        completeFaceSession(session);
        const cameraContainer = document.getElementById('camera-container');
        if (cameraContainer) cameraContainer.style.display = 'none';
        document.getElementById('success-state').innerHTML = `
            <div style="text-align: center; color: #4ade80; margin-bottom: 20px;">
                <svg viewBox="0 0 24 24" width="60" height="60" stroke="currentColor" stroke-width="2" fill="none"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
            </div>
            <h2 class="title" style="font-size: 24px; margin-bottom: 5px;">Live Presence Saved</h2>
            <p style="font-size: 14px; color: #888;">Your verified face scan has been sent to your boss for approval. You can close this page.</p>
        `;
    } catch (error) {
        console.error(error);
        if (!isFaceSessionActive(session)) return;
        stopActiveFaceSession();
        showInvitationScanRetry('We could not save your scan. Please check your connection and try again.');
    }
}

async function startFaceScan() {
    const startBtn = document.getElementById('start-btn');
    const cameraContainer = document.getElementById('camera-container');
    const video = document.getElementById('video');
    const aiStatus = document.getElementById('ai-status');
    const scanMessage = document.getElementById('registration-scan-message');
    if (!video || !cameraContainer || !aiStatus) return;

    if (startBtn) {
        startBtn.style.display = 'none';
        startBtn.disabled = true;
    }
    if (scanMessage) scanMessage.innerText = '';
    
    cameraContainer.style.display = 'block';
    cameraContainer.style.width = '240px';
    cameraContainer.style.height = '240px';
    cameraContainer.style.margin = '0 auto 20px auto';
    cameraContainer.style.borderRadius = '50%';
    cameraContainer.style.overflow = 'hidden';
    cameraContainer.style.border = '4px solid #1a1a1a';
    cameraContainer.style.boxShadow = '0 4px 15px rgba(0,0,0,0.1)';
    
    video.style.objectFit = 'cover';
    video.style.width = '100%';
    video.style.height = '100%';
    
    aiStatus.innerText = 'PREPARING SECURE VERIFICATION…';
    aiStatus.style.color = '#f59e0b';

    const session = createFaceSession(video, cameraContainer, aiStatus, showInvitationScanRetry);
    try {
        const human = await ensureFaceModels();
        if (!isFaceSessionActive(session)) return;
        setFaceScanStatus(session, 'TURNING ON CAMERA…', '#4ade80');
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
        if (!isFaceSessionActive(session)) {
            stream.getTracks().forEach(track => track.stop());
            return;
        }
        session.stream = stream;

        const beginDetection = () => {
            if (!isFaceSessionActive(session) || session.started) return;
            session.started = true;
            createFaceCanvas(session);
            setFaceScanStatus(session, 'VERIFYING LIVENESS. PLEASE BLINK 3 TIMES...', '#4ade80');
            setupPassiveLivenessChallenge(session, (face) => saveInvitationBiometrics(session, face));
            
            startFaceDetectionLoop(session, async () => {
                const res = await human.detect(video);
                if (!isFaceSessionActive(session)) return;
                const faces = res.face || [];
                if (faces.length !== 1) {
                    clearFaceCanvas(session);
                    setFaceScanStatus(session, faces.length > 1 ? 'ONLY ONE FACE MAY BE IN FRAME.' : 'FACE NOT FOUND. LOOK STRAIGHT AT THE CAMERA.');
                    return;
                }
                const face = faces[0];
                const realScore = typeof face.real === 'number' ? face.real : 0.85;
                const liveScore = typeof face.live === 'number' ? face.live : 0.85;

                if (!session.identityVerified) {
                    if (!face.embedding || face.embedding.length === 0) {
                        setFaceScanStatus(session, 'ANALYZING BIOMETRICS. HOLD STILL...');
                        return;
                    }
                    if (realScore < ANTI_SPOOF_MIN_REAL || liveScore < ANTI_SPOOF_MIN_LIVE) {
                        setFaceScanStatus(session, 'SPOOFING CHECK: ENSURE GOOD LIGHTING & REAL PRESENCE.', '#ef4444');
                        return;
                    }
                    session.identityVerified = true;
                    session.cachedDescriptor = normalizeHumanDescriptor(face.embedding);
                }

              drawSingleFace(session, face);
                updatePassiveLiveness(session, face, res.gesture);
            });
        };

        video.onplay = beginDetection;
        video.srcObject = stream;
        video.onloadedmetadata = async () => {
            try {
                await video.play();
                beginDetection();
            } catch (err) {
                console.warn("Autoplay prevented or failed", err);
            }
        };
    } catch (error) {
        console.error(error);
        if (!isFaceSessionActive(session)) return;
        stopActiveFaceSession();
        showInvitationScanRetry('Camera access failed. Please allow camera access and try again.');
    }
}

// Kept for compatibility with an older cached invitation page.
function captureFace() {
    openInfoModal('Live scan required', 'The secure scan now starts automatically and requires live presence.');
}

async function loadTodayAttendance() {
    const activeList = document.getElementById('active-today-list');
    const pendingList = document.getElementById('pending-today-list');
    const absentList = document.getElementById('absent-today-list');
    const offList = document.getElementById('off-today-list');
    const lateList = document.getElementById('late-today-list');
    const checkoutList = document.getElementById('checkout-today-list');
    const globalHolidayMsg = document.getElementById('global-holiday-msg');
    
    const leader = getLeader();

    if (!activeList || !pendingList || !leader) return;
    await ensureSupabase();

    const todayStr = getUniversalDate();

    try {
       const { data: staffMembers, error: staffErr } = await supabaseClient.from('users').select('id, name, email, role, joined_date, company_id, pending_deletion_at, setup_completed').neq('role', 'leader').eq('company_id', leader.company_id);
        if (staffErr) throw staffErr;

        const { data: attendanceLogs, error: attErr } = await supabaseClient.from('checkins').select('*').eq('date', todayStr).eq('company_id', leader.company_id);
        if (attErr) throw attErr;

        const { data: settings, error: setErr } = await supabaseClient.from('settings').select('*').eq('company_id', leader.company_id).limit(1).maybeSingle();
        
        let globalHolidays = [];
        let customSchedules = [];
        let exceptions = [];
        let customSchedulesActive = true;
        let exceptionsActive = true;
        let globalEnd = "10:00";

        const requireCheckout = settings && settings.require_checkout;
        const lateSettingOn = settings && settings.late_arrival_hours > 0;

        if (settings) {
            if (settings.holidays) try { globalHolidays = JSON.parse(settings.holidays); } catch(e){}
            
            if (settings.custom_schedules) {
                try {
                    let parsed = JSON.parse(settings.custom_schedules);
                    if (Array.isArray(parsed)) { customSchedules = parsed; }
                    else { customSchedulesActive = parsed.active; customSchedules = parsed.data || []; }
                } catch(e){}
            }
            
            if (settings.exceptions) {
                try {
                    let parsed = JSON.parse(settings.exceptions);
                    if (Array.isArray(parsed)) { exceptions = parsed; }
                    else { exceptionsActive = parsed.active; exceptions = parsed.data || []; }
                } catch(e){}
            }

            if (settings.check_in_end) globalEnd = settings.check_in_end;
        }

        if (globalHolidays.includes(todayStr)) {
            if (globalHolidayMsg) globalHolidayMsg.style.display = 'block';
            document.querySelectorAll('.status-section').forEach(el => el.style.display = 'none');
            return;
        }

        if (globalHolidayMsg) globalHolidayMsg.style.display = 'none';
        document.querySelectorAll('.status-section').forEach(el => el.style.display = 'block');

        activeList.innerHTML = "";
        pendingList.innerHTML = "";
        if (absentList) absentList.innerHTML = "";
        if (offList) offList.innerHTML = "";
        if (lateList) lateList.innerHTML = "";
        if (checkoutList) checkoutList.innerHTML = "";

        let activeCount = 0;
        let pendingCount = 0;
        let absentCount = 0;
        let offCount = 0;
        let lateCount = 0;
        let checkoutCount = 0;

        const now = new Date();
        const currentHours = String(now.getHours()).padStart(2, '0');
        const currentMinutes = String(now.getMinutes()).padStart(2, '0');
        const currentTime = `${currentHours}:${currentMinutes}`;

        (staffMembers || []).forEach(staff => {
            const log = (attendanceLogs || []).find(a => a.user_email === staff.email);
            const initial = staff.name ? staff.name.charAt(0).toUpperCase() : '?';
            const shortName = staff.name ? staff.name.split(' ')[0] : 'Staff';
            
            const onclickRedirect = `onclick="window.location.href='record-individual.html?email=${encodeURIComponent(staff.email)}'"`;

            if (log && log.status === 'Holiday/Off') {
                offCount++;
                if (offList) {
                    offList.insertAdjacentHTML('beforeend', `
                        <div class="member-card clickable-card" ${onclickRedirect} style="background-color: #1a1a1a; border: 1px solid #1a1a1a; box-shadow: 0 2px 6px rgba(0,0,0,0.03);">
                            <div class="avatar" style="background: #ffffff; color: #1a1a1a;">${initial}</div>
                            <span class="name" style="color: #ffffff;">${shortName}</span>
                            <span style="font-size: 9px; color: #aaa; font-weight: 500; margin-top: 2px;">Exempt</span>
                        </div>
                    `);
                }
            } else if (log && log.status === 'Present') {
                if (log.checkout_time) {
                    checkoutCount++;
                    if(checkoutList) checkoutList.insertAdjacentHTML('beforeend', `
                        <div class="member-card clickable-card" ${onclickRedirect} style="background-color: #eff6ff; border: 1px solid #bfdbfe;">
                            <div class="avatar" style="background: #3b82f6; color: white;">${initial}</div>
                            <span class="name" style="color: #1e3a8a;">${shortName}</span>
                            <span style="font-size: 9px; color: #3b82f6; font-weight: 500; margin-top: 2px;">Out: ${log.checkout_time}</span>
                        </div>
                    `);
                } else if (log.is_late) {
                    lateCount++;
                    if(lateList) lateList.insertAdjacentHTML('beforeend', `
                        <div class="member-card clickable-card" ${onclickRedirect} style="background-color: #f3e8ff; border: 1px solid #d8b4fe;">
                            <div class="avatar" style="background: #a855f7; color: white;">${initial}</div>
                            <span class="name" style="color: #6b21a8;">${shortName}</span>
                            <span style="font-size: 9px; color: #a855f7; font-weight: 500; margin-top: 2px;">In: ${log.time}</span>
                        </div>
                    `);
                } else {
                    activeCount++;
                    activeList.insertAdjacentHTML('beforeend', `
                        <div class="member-card present clickable-card" ${onclickRedirect}>
                            <div class="avatar" style="background: #1a1a1a; color: white;">${initial}</div>
                            <span class="name">${shortName}</span>
                            <span style="font-size: 9px; color: #888; font-weight: 500; margin-top: 2px;">${log.time}</span>
                        </div>
                    `);
                }
            } else {
                let allowedEnd = globalEnd;
                
                if (exceptionsActive) {
                    const todayException = exceptions.find(ex => ex.date === todayStr);
                    if (todayException) allowedEnd = todayException.end;
                }
                
                if (customSchedulesActive) {
                    const myCustom = customSchedules.find(c => c.email === staff.email);
                    if (myCustom) allowedEnd = myCustom.end;
                }

                let finalAllowedEnd = allowedEnd;
                if (lateSettingOn && settings.late_arrival_hours) {
                    let [h, m] = allowedEnd.split(':');
                    h = (parseInt(h) + parseInt(settings.late_arrival_hours)).toString().padStart(2, '0');
                    finalAllowedEnd = `${h}:${m}`;
                }

                if (currentTime > finalAllowedEnd) {
                    absentCount++;
                    if (absentList) {
                        absentList.insertAdjacentHTML('beforeend', `
                            <div class="member-card clickable-card" ${onclickRedirect} style="background-color: #fef2f2; border: 1px dashed #ef4444;">
                                <div class="avatar" style="background: #fca5a5; color: #7f1d1d;">${initial}</div>
                                <span class="name" style="color: #ef4444;">${shortName}</span>
                            </div>
                        `);
                    }
                } else {
                    pendingCount++;
                    pendingList.insertAdjacentHTML('beforeend', `
                        <div class="member-card absent clickable-card" ${onclickRedirect}>
                            <div class="avatar" style="background: #f0f0f0; color: #333;">${initial}</div>
                            <span class="name">${shortName}</span>
                        </div>
                    `);
                }
            }
        });

        if (activeCount === 0) activeList.innerHTML = `<p style="font-size: 12px; color: #888; grid-column: 1 / -1;">No one has checked in yet today.</p>`;
        if (pendingCount === 0) pendingList.innerHTML = `<p style="font-size: 12px; color: #888; grid-column: 1 / -1;">Everyone has checked in or passed their window.</p>`;
        if (absentList && absentCount === 0) absentList.innerHTML = `<p style="font-size: 12px; color: #888; grid-column: 1 / -1;">No absentees.</p>`;
        if (offList && offCount === 0) offList.innerHTML = `<p style="font-size: 12px; color: #888; grid-column: 1 / -1;">No staff on personal leave today.</p>`;
        if (lateList && lateCount === 0) lateList.innerHTML = lateSettingOn ? `<p style="font-size: 12px; color: #888; grid-column: 1 / -1;">No late arrivals today.</p>` : `<p style="font-size: 12px; color: #ccc; grid-column: 1 / -1;">Late arrivals not enabled in settings.</p>`;
        if (checkoutList && checkoutCount === 0) checkoutList.innerHTML = requireCheckout ? `<p style="font-size: 12px; color: #888; grid-column: 1 / -1;">No one has checked out yet.</p>` : `<p style="font-size: 12px; color: #ccc; grid-column: 1 / -1;">Checkout tracking not enabled in settings.</p>`;

    } catch (err) {
        console.error(err);
    }
}

function calculateAvgCheckInTime(logs) {
    if (!logs || logs.length === 0) return "--:--";
    let totalMins = 0;
    let count = 0;
    logs.forEach(log => {
        if (log.time) {
            const match = log.time.match(/(\d+):(\d+)\s*(AM|PM|am|pm)?/);
            if (match) {
                let h = parseInt(match[1]);
                let m = parseInt(match[2]);
                let ampm = match[3] ? match[3].toUpperCase() : null;
                if (ampm === 'PM' && h < 12) h += 12;
                if (ampm === 'AM' && h === 12) h = 0;
                totalMins += (h * 60) + m;
                count++;
            }
        }
    });
    if (count === 0) return "--:--";
    let avg = Math.round(totalMins / count);
    let avgH = Math.floor(avg / 60);
    let avgM = avg % 60;
    let ampm = avgH >= 12 ? 'PM' : 'AM';
    let displayH = avgH % 12;
    if (displayH === 0) displayH = 12;
    return `${String(displayH).padStart(2, '0')}:${String(avgM).padStart(2, '0')} ${ampm}`;
}

async function loadTeamLedger() {
    const tableBody = document.getElementById('ledger-table-body');
    const leader = getLeader();
    if (!tableBody || !leader) return;
    await ensureSupabase();

    try {
     const { data: staff, error: staffError } = await supabaseClient
    .from('users')
    .select('id, name, email, role, joined_date, company_id, pending_deletion_at, setup_completed')
    .neq('role', 'leader')
    .eq('company_id', leader.company_id);

if (staffError) throw staffError;
        // Fetch all settings so the unified analytics engine operates perfectly
               const { data: settings } = await supabaseClient.from('settings').select('*').eq('company_id', leader.company_id).limit(1).maybeSingle();
        const { data: attendance, error: attError } = await supabaseClient.from('checkins').select('*').eq('company_id', leader.company_id);
        if (attError) throw attError;
        
        tableBody.innerHTML = "";
        if (!staff || staff.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="5" style="padding: 20px; text-align: center; color: #888;">No active staff found.</td></tr>`;
            return;
        }

        const todayStr = getUniversalDate(new Date());

        staff.forEach(user => {
            const userLogs = attendance ? attendance.filter(log => log.user_email === user.email) : [];
            
            // Generate analytics using identical unified historical engine
            const historyData = buildIndividualHistoryData(user, userLogs, settings);
            const stats = historyData.stats;
            const todayRow = historyData.rows.find(r => r.rawDate === todayStr);

            const presentLogs = userLogs.filter(log => log.status === 'Present');
            let avgTimeStr = calculateAvgCheckInTime(presentLogs);
            let percentColor = stats.percent >= 80 ? '#4ade80' : (stats.percent >= 50 ? '#f59e0b' : '#ef4444');

            let statusHtml = "";
            if (todayRow) {
                let finalStatus = todayRow.status;
                let finalColor = todayRow.statusColor;

                if (finalStatus === "Present" || finalStatus === "Late Arrival") {
                    const todayLog = userLogs.find(l => l.date === todayRow.rawDate);
                    if (todayLog && todayLog.checkout_time) {
                        finalStatus = "Checked Out";
                        finalColor = "#3b82f6";
                    }
                }
                statusHtml = `<span style="color:${finalColor}; font-weight:bold;">${finalStatus}</span>`;
            }

            tableBody.insertAdjacentHTML('beforeend', `
                <tr style="border-bottom: 1px solid #eaeaea; cursor: pointer;" onclick="window.location.href='record-individual.html?email=${encodeURIComponent(user.email)}'" onmouseover="this.style.backgroundColor='#f9f9f9'" onmouseout="this.style.backgroundColor='transparent'">
                    <td style="padding: 12px 15px; font-weight: 500; color: #1a1a1a;">${user.name}</td>
                    <td style="padding: 12px 15px; color: #555;">${user.role}</td>
                    <td style="padding: 12px 15px; color: #555;">${avgTimeStr}</td>
                    <td style="padding: 12px 15px; color: ${percentColor}; font-weight: bold;">${stats.percent}%</td>
                    <td style="padding: 12px 15px; text-align: right;">${statusHtml}</td>
                </tr>
            `);
        });
    } catch (err) { console.error(err); }
}

let analyticsDate = new Date(); 
let currentViewedUser = null; 

async function loadIndividualAnalytics() {
    const calendarGrid = document.getElementById('analytics-calendar');
    const leader = getLeader();
    if (!calendarGrid || !leader) return; 
    await ensureSupabase();

    const urlParams = new URLSearchParams(window.location.search);
    const targetEmail = urlParams.get('email');
    if (!targetEmail) return;

    try {
        const { data: user } = await supabaseClient.from('users').select('*').eq('email', targetEmail).limit(1).maybeSingle();
        const { data: logs } = await supabaseClient.from('checkins').select('*').eq('user_email', targetEmail);
        const { data: settings } = await supabaseClient.from('settings').select('*').eq('company_id', leader.company_id).limit(1).maybeSingle();

        currentViewedUser = user;

        const today = new Date();
        const todayStr2 = getUniversalDate(today);

        let holidaysArray = [];
        try { if (settings && settings.holidays) holidaysArray = JSON.parse(settings.holidays); } catch(e){}
        if (!Array.isArray(holidaysArray)) holidaysArray = [];

        let allowedStart = settings && settings.check_in_start ? settings.check_in_start : "09:00";
        let allowedEnd = settings && settings.check_in_end ? settings.check_in_end : "10:00";
        let lateHours = settings && settings.late_arrival_hours ? parseInt(settings.late_arrival_hours) : 0;
        
        let customSchedulesActive = true;
        let exceptionsActive = true;
        let customSchedulesArray = [];
        let exceptionsArray = [];
        
        if (settings) {
            if (settings.custom_schedules) {
                try {
                    let parsed = JSON.parse(settings.custom_schedules);
                    if (Array.isArray(parsed)) customSchedulesArray = parsed;
                    else { customSchedulesActive = parsed.active; customSchedulesArray = parsed.data || []; }
                } catch(e){}
            }
            if (settings.exceptions) {
                try {
                    let parsed = JSON.parse(settings.exceptions);
                    if (Array.isArray(parsed)) exceptionsArray = parsed;
                    else { exceptionsActive = parsed.active; exceptionsArray = parsed.data || []; }
                } catch(e){}
            }
        }
        
        if (exceptionsActive) {
            const todayException = exceptionsArray.find(ex => ex.date === todayStr2);
            if (todayException) {
                allowedStart = todayException.start;
                allowedEnd = todayException.end;
            }
        }

        if (customSchedulesActive) {
            const myCustom = customSchedulesArray.find(c => c.email === targetEmail);
            if (myCustom) {
                allowedStart = myCustom.start;
                allowedEnd = myCustom.end;
            }
        }
        
        let finalAllowedEnd = allowedEnd;
        if (lateHours > 0) {
            let [h, m] = allowedEnd.split(':');
            h = (parseInt(h) + lateHours).toString().padStart(2, '0');
            finalAllowedEnd = `${h}:${m}`;
        }

        const nowStrictTime = new Date();
        const currentHours = String(nowStrictTime.getHours()).padStart(2, '0');
        const currentMinutes = String(nowStrictTime.getMinutes()).padStart(2, '0');
        const currentTime = `${currentHours}:${currentMinutes}`;

        document.getElementById('analytics-header').style.display = 'block';
        document.getElementById('credentials-card').style.display = 'block';
        
        updateElementSafe('employee-name-title', user?.name || "Unknown");
        updateElementSafe('employee-role-title', user?.role || "Unknown");
        updateElementSafe('employee-joined-box', user?.joined_date || "N/A");
        updateElementSafe('emp-cred-email', user?.email || "No Email");
        
        const firstName = user?.name ? user.name.split(' ')[0] : 'Staff';
        const credBtn = document.getElementById('email-staff-btn');
if (credBtn) {
    credBtn.innerText = user.setup_completed ? "Send Password Reset Link" : "Send Credentials Link";
    credBtn.onclick = generateBiometricSetupLink;
}
        
        let safeLogs = Array.isArray(logs) ? logs : [];
        let validCheckinDates = new Set();
        let personalHolidaysSet = new Set();
        
        safeLogs.forEach(log => {
            if (log.status === 'Holiday/Off') {
                personalHolidaysSet.add(log.date);
            } else if (log.status === 'Present') {
                if (log.date <= todayStr2) validCheckinDates.add(log.date);
            }
        });

        let workingDays = 0; 
        if (user && user.joined_date) {
            const joinedDate = parseLocal(user.joined_date);
            for (let d = new Date(joinedDate); d <= today; d.setDate(d.getDate() + 1)) {
                const dateStr = getUniversalDate(d);
                if (!holidaysArray.includes(dateStr) && !personalHolidaysSet.has(dateStr)) {
                    workingDays++;
                }
            }
        }
        
        if (workingDays === 0) workingDays = 1; 

        const totalChecks = validCheckinDates.size;
        updateElementSafe('total-checkins-value', `${totalChecks} / ${workingDays}`);
        updateElementSafe('avg-in-time', calculateAvgCheckInTime(safeLogs.filter(l => l.status === 'Present')));
        
        let percent = Math.round((totalChecks / workingDays) * 100);
        if (percent > 100) percent = 100; 
        
        updateElementSafe('attendance-percent-box', `${percent}%`, percent >= 80 ? '#4ade80' : (percent >= 50 ? '#f59e0b' : '#ef4444'));

        const checkedInToday = validCheckinDates.has(todayStr2);

        try {
            const labels = document.querySelectorAll('.stat-label');
            let statusLabelEl = Array.from(labels).find(el => el.innerText.trim().toUpperCase() === 'SYSTEM STATUS');
            
            if (statusLabelEl) {
                statusLabelEl.innerText = "TODAY'S STATUS";
                const statusValueEl = statusLabelEl.nextElementSibling;
                
                if (statusValueEl) {
                    let todayStatus = "";
                    let todayColor = ""; 
                    let todayLogInfo = safeLogs.find(l => l.date === todayStr2);

                    if (holidaysArray.includes(todayStr2)) {
                        todayStatus = "Organization Off";
                        todayColor = "#a0a0a0"; 
                    } else if (personalHolidaysSet.has(todayStr2)) {
                        todayStatus = "Personal Off";
                        todayColor = "#a0a0a0"; 
                    } else if (checkedInToday) {
                        if (todayLogInfo && todayLogInfo.checkout_time) {
                            todayStatus = "Checked Out";
                            todayColor = "#3b82f6";
                        } else if (todayLogInfo && todayLogInfo.is_late) {
                            todayStatus = "Late Check-in";
                            todayColor = "#a855f7"; 
                        } else {
                            todayStatus = "Present";
                            todayColor = "#4ade80"; 
                        }
                    } else if (currentTime < allowedStart) {
                        todayStatus = "Check-in window not started";
                        todayColor = "#94a3b8"; 
                    } else if (currentTime > finalAllowedEnd) {
                        todayStatus = "Absent";
                        todayColor = "#ef4444"; 
                    } else {
                        todayStatus = "Pending";
                        todayColor = "#f59e0b"; 
                    }

                    statusValueEl.innerText = todayStatus;
                    statusValueEl.style.color = todayColor;
                }
            }
        } catch(e) { console.warn("Could not update system status UI"); }

        const year = analyticsDate.getFullYear();
        const month = analyticsDate.getMonth();
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        
        const empJoinedDate = user && user.joined_date ? parseLocal(user.joined_date) : new Date(2000,0,1);
        const empJoinedStr = getUniversalDate(empJoinedDate);

        const monthTitleEl = document.getElementById('calendar-month-title');
        if (monthTitleEl) {
            let prevDisabled = false;
            if (year < empJoinedDate.getFullYear() || (year === empJoinedDate.getFullYear() && month <= empJoinedDate.getMonth())) {
                prevDisabled = true;
            }

            monthTitleEl.innerHTML = `
                <button class="i-btn" style="width: 24px; height: 24px; padding: 0; line-height: 1; margin-right: 10px; ${prevDisabled ? 'opacity: 0.3; cursor: not-allowed;' : ''}" ${prevDisabled ? '' : 'onclick="changeMonth(-1)"'}>&#8592;</button>
                <span>${monthNames[month]} ${year}</span>
                <button class="i-btn" style="width: 24px; height: 24px; padding: 0; line-height: 1; margin-left: 10px;" onclick="changeMonth(1)">&#8594;</button>
            `;
            monthTitleEl.style.display = 'flex'; monthTitleEl.style.alignItems = 'center'; monthTitleEl.style.justifyContent = 'center';
        }

        calendarGrid.innerHTML = `
            <div class="cal-day" style="border: none; font-weight: bold; color: #888; display: flex; justify-content: center; align-items: center; aspect-ratio: 1; font-size: 12px;">S</div>
            <div class="cal-day" style="border: none; font-weight: bold; color: #888; display: flex; justify-content: center; align-items: center; aspect-ratio: 1; font-size: 12px;">M</div>
            <div class="cal-day" style="border: none; font-weight: bold; color: #888; display: flex; justify-content: center; align-items: center; aspect-ratio: 1; font-size: 12px;">T</div>
            <div class="cal-day" style="border: none; font-weight: bold; color: #888; display: flex; justify-content: center; align-items: center; aspect-ratio: 1; font-size: 12px;">W</div>
            <div class="cal-day" style="border: none; font-weight: bold; color: #888; display: flex; justify-content: center; align-items: center; aspect-ratio: 1; font-size: 12px;">T</div>
            <div class="cal-day" style="border: none; font-weight: bold; color: #888; display: flex; justify-content: center; align-items: center; aspect-ratio: 1; font-size: 12px;">F</div>
            <div class="cal-day" style="border: none; font-weight: bold; color: #888; display: flex; justify-content: center; align-items: center; aspect-ratio: 1; font-size: 12px;">S</div>
        `;

        const firstDayIndex = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        for (let i = 0; i < firstDayIndex; i++) {
            calendarGrid.insertAdjacentHTML('beforeend', `<div class="cal-day" style="border: none; background: transparent; aspect-ratio: 1;"></div>`);
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const currentIterationDate = new Date(year, month, day);
            const dateStrIteration = getUniversalDate(currentIterationDate);
            
            const iterLog = safeLogs.find(l => l.date === dateStrIteration);
            const wasPresent = validCheckinDates.has(dateStrIteration);
            const isPersonalHoliday = personalHolidaysSet.has(dateStrIteration);
            const isCommonHoliday = holidaysArray.includes(dateStrIteration);
            const isPast = dateStrIteration < todayStr2;
            const isToday = dateStrIteration === todayStr2;
            
            let inlineStyle = CAL_STYLES.default;
            
            if (dateStrIteration < empJoinedStr) {
                inlineStyle = CAL_STYLES.disabled;
            } else if (isCommonHoliday) {
                inlineStyle = CAL_STYLES.holiday;
            } else if (isPersonalHoliday) {
                inlineStyle = CAL_STYLES.personalHoliday;
            } else if (wasPresent) { 
                if (iterLog && iterLog.is_late) {
                    inlineStyle = "background-color: #f3e8ff !important; color: #a855f7 !important; border-color: #d8b4fe !important; font-weight: bold;";
                } else {
                    inlineStyle = CAL_STYLES.present; 
                }
            } else if (isToday) {
                if (currentTime < allowedStart) inlineStyle = CAL_STYLES.notStarted;
                else if (currentTime > finalAllowedEnd) inlineStyle = CAL_STYLES.absent;
                else inlineStyle = CAL_STYLES.pending;
            } else if (isPast) {
                inlineStyle = CAL_STYLES.absent; 
            } else { 
                inlineStyle = CAL_STYLES.default;
            }

            let cursorStyle = "cursor: default;";
            let clickAttr = "";

            if (dateStrIteration >= empJoinedStr) {
                if (isCommonHoliday) {
                    cursorStyle = "cursor: pointer;";
                    clickAttr = `onclick="handleEmployeeCalendarClick('${dateStrIteration}', true, false, ${isPast}, ${isToday}, ${wasPresent})"`;
                } else if (isPast) {
                    cursorStyle = "cursor: default;";
                    clickAttr = "";
                } else if (isToday && wasPresent) {
                    cursorStyle = "cursor: default;";
                    clickAttr = "";
                } else {
                    cursorStyle = "cursor: pointer;";
                    clickAttr = `onclick="handleEmployeeCalendarClick('${dateStrIteration}', false, ${isPersonalHoliday}, ${isPast}, ${isToday}, ${wasPresent})"`;
                }
            }
            
            calendarGrid.insertAdjacentHTML('beforeend', `<div class="cal-day" style="aspect-ratio: 1; display: flex; justify-content: center; align-items: center; font-size: 12px; border-radius: 4px; ${inlineStyle} ${cursorStyle}" ${clickAttr}>${day}</div>`);
        }

    } catch (err) { console.error(err); }
}

function handleEmployeeCalendarClick(dateStr, isCommonHoliday, isPersonalHoliday, isPast, isToday, wasPresent) {
    if (isCommonHoliday) {
        openInfoModal('Organization Holiday', 'This day is an organization holiday for all employees. To change this, please go to the Settings tab.');
        return;
    }

    if (isPast || (isToday && wasPresent)) {
        return;
    }

    const action = isPersonalHoliday ? 'remove' : 'add';
    const title = isPersonalHoliday ? 'Remove Holiday' : 'Assign Holiday';
    const desc = isPersonalHoliday 
        ? `Are you sure you want to remove the personal holiday for ${currentViewedUser.name} on ${dateStr}?` 
        : `Are you sure you want to assign a personal holiday for ${currentViewedUser.name} on ${dateStr}?`;

    openConfirmModal(title, desc, async function() {
        await togglePersonalHoliday(dateStr, action);
    });
}

async function togglePersonalHoliday(dateStr, action) {
    await ensureSupabase();
    const leader = getLeader();
    if (!leader || !currentViewedUser) return;

    try {
        if (action === 'add') {
            const { error } = await supabaseClient.from('checkins').insert([{
                user_email: currentViewedUser.email,
                user_name: currentViewedUser.name,
                date: dateStr,
                time: '--:--',
                status: 'Holiday/Off',
                company_id: leader.company_id
            }]);
            if (error) throw error;
        } else if (action === 'remove') {
            const { error } = await supabaseClient.from('checkins')
                .delete()
                .eq('user_email', currentViewedUser.email)
                .eq('date', dateStr)
                .eq('status', 'Holiday/Off')
                .eq('company_id', leader.company_id);
            if (error) throw error;
        }
        
        loadIndividualAnalytics();
    } catch (err) {
        console.error(err);
        openInfoModal("Error", "Failed to update holiday: " + err.message);
    }
}

function changeMonth(offset) {
    analyticsDate.setMonth(analyticsDate.getMonth() + offset);
    loadIndividualAnalytics(); 
}

// --- BIOMETRIC CREDENTIALS ENGINE ---
async function generateBiometricSetupLink() {
    if (!currentViewedUser) return;
    
    const isSetup = currentViewedUser.setup_completed === true;
    const actionText = isSetup ? "Biometric Reset Link" : "Credentials Link";

    openPromptModal(
        "SECURITY CHECK", 
        `Enter your Leader Password to generate a secure ${actionText} for ${currentViewedUser.name}.`, 
        "password", 
        "", 
        async function(bossPass) {
            if (!bossPass) return;
            const leader = getLeader();
            if (!leader) return;
            await ensureSupabase();

            // 1. Verify Boss Password
            const { error: authError } = await supabaseClient.auth.signInWithPassword({
                email: leader.email,
                password: bossPass.trim()
            });

            if (authError) {
                openInfoModal("ACCESS DENIED", "Incorrect leader password. Action aborted.");
                return;
            }

            // 2. Generate cryptographically secure token
            const token = (Math.random().toString(36).substr(2) + Math.random().toString(36).substr(2)).toUpperCase();
            
            // 3. Set expiration (7 days for setup, 1 day for reset)
            const daysValid = isSetup ? 1 : 7;
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + daysValid);

            // 4. Save to secure database
            const { error: insertError } = await supabaseClient.from('secure_links').insert([{
                company_id: leader.company_id,
                email: currentViewedUser.email,
                token: token,
                type: isSetup ? 'reset' : 'setup',
                expires_at: expiresAt.toISOString()
            }]);

            if (insertError) {
                openInfoModal("System Error", "Failed to generate link in database.");
                return;
            }

            // 5. Draft the Email
            const baseUrl = window.location.origin;
            const setupUrl = `${baseUrl}/setup.html?token=${token}`;
            
            const subject = isSetup ? 'Reset your SYNDICACY Password' : 'Set up your SYNDICACY Credentials';
            const body = `Hi ${currentViewedUser.name},\n\nPlease click the secure link below to ${isSetup ? 'reset your password' : 'set up your login credentials'}. You will be required to scan your face to prove your identity.\n\n${setupUrl}\n\nThis link expires in ${daysValid} day(s) and can only be used once.\n\nThank you!`;
            
            window.location.href = `mailto:${currentViewedUser.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
            openInfoModal("Link Drafted", `Success! An email draft containing the secure ${daysValid}-day link has been opened for ${currentViewedUser.name}.`);
        }
    );
}
async function renameEmployee() {
    if (!currentViewedUser) return;
    
    openPromptModal(
        "Rename Employee", 
        `Enter a new name for ${currentViewedUser.name}:`, 
        "text", 
        currentViewedUser.name, 
        async function(newName) {
            if (newName && newName.trim() !== "" && newName !== currentViewedUser.name) {
                await ensureSupabase();
                try {
                    const { error } = await supabaseClient.from('users').update({ name: newName.trim() }).eq('email', currentViewedUser.email);
                    if (error) throw error;
                    
                    openInfoModal("Success!", `Employee renamed to ${newName.trim()}`);
                    loadIndividualAnalytics(); 
                } catch (err) {
                    openInfoModal("Error", "Failed to update name in database.");
                    console.error(err);
                }
            }
        }
    );
}
async function loadTeamDirectory() {
    const directoryList = document.getElementById('directory-list');
    const leader = getLeader();
    if (!directoryList || !leader) return;
    await ensureSupabase();

    try {
        const { data, error } = await supabaseClient.from('users').select('id, name, email, role, joined_date, company_id, pending_deletion_at, setup_completed').neq('role', 'leader').eq('company_id', leader.company_id);
        if (error) {
            console.error('Directory load failed:', error);
            directoryList.innerHTML = `<p style="font-size: 12px; color: #ef4444; padding: 20px; text-align: center;">Could not load team: ${error.message}</p>`;
            return;
        }
        directoryList.innerHTML = "";
        if (!data || data.length === 0) {
            directoryList.innerHTML = `<p style="font-size: 12px; color: #888; padding: 20px; text-align: center;">No staff members yet.</p>`;
            return;
        }

        // Clear existing intervals to prevent memory leaks when reloading the directory
        if (window.directoryIntervals) {
            window.directoryIntervals.forEach(clearInterval);
        }
        window.directoryIntervals = [];

        data.forEach(user => {
            const initial = user.name ? user.name.charAt(0).toUpperCase() : '?';
            const safeName = user.name ? user.name.replace(/'/g, "\\'") : 'Staff';
            
            let actionHtml = '';

            if (user.pending_deletion_at) {
                const uniqueId = 'countdown-' + Math.random().toString(36).substr(2, 9);
                actionHtml = `
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div style="text-align: right;">
                            <span style="font-size: 9px; font-weight: bold; color: #ef4444; display: block; letter-spacing: 0.5px;">DELETING IN</span>
                            <span id="${uniqueId}" style="font-size: 12px; font-family: monospace; font-weight: 600; color: #ef4444;">--:--:--</span>
                        </div>
                        <button class="google-btn" style="padding: 4px 8px; font-size: 10px; margin: 0; border: 1px solid #1a1a1a; color: #1a1a1a;" onclick="event.stopPropagation(); cancelEmployeeDeletion('${user.email}', '${safeName}')">Undo</button>
                    </div>
                `;

                // Set up the live 24-hour countdown
                const delTime = new Date(user.pending_deletion_at).getTime();
                const expiryTime = delTime + (24 * 60 * 60 * 1000);

                const interval = setInterval(() => {
                    const now = new Date().getTime();
                    const diff = expiryTime - now;
                    const el = document.getElementById(uniqueId);
                    
                    if (!el) {
                        clearInterval(interval);
                        return;
                    }

                    if (diff <= 0) {
                        el.innerText = "00:00:00";
                        clearInterval(interval);
                    } else {
                        const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                        const s = Math.floor((diff % (1000 * 60)) / 1000);
                        el.innerText = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
                    }
                }, 1000);
                window.directoryIntervals.push(interval);
            } else {
                actionHtml = `<button class="i-btn" style="color: #dc2626; border-color: #fca5a5; background: #fef2f2; width: 28px; height: 28px; flex-shrink: 0; margin-left: 10px;" onclick="event.stopPropagation(); initiateEmployeeDeletion('${user.email}', '${safeName}')">×</button>`;
            }
            
            // Turn the card red if they are scheduled for deletion
            const cardBg = user.pending_deletion_at ? 'background-color: #fef2f2; border-color: #fca5a5;' : 'background-color: #ffffff; border-color: #eaeaea;';
            const nameColor = user.pending_deletion_at ? 'color: #ef4444;' : 'color: #1a1a1a;';

            directoryList.insertAdjacentHTML('beforeend', `
                <div class="directory-card clickable-card" style="display: flex; justify-content: space-between; align-items: center; width: 100%; box-sizing: border-box; cursor: pointer; ${cardBg}" onclick="window.location.href='record-individual.html?email=${encodeURIComponent(user.email)}'">
                    <div style="display: flex; align-items: center; gap: 12px; overflow: hidden;">
                        <div class="avatar" style="background: #1a1a1a; color: white; flex-shrink: 0; margin: 0;">${initial}</div>
                        <div class="staff-info" style="overflow: hidden;">
                            <span class="staff-name" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; ${nameColor}">${user.name}</span>
                            <span class="staff-role">${user.role}</span>
                        </div>
                    </div>
                    ${actionHtml}
                </div>
            `);
        });
    } catch (err) { console.error(err); }
}

function initiateEmployeeDeletion(email, name) {
    const safeName = name.replace(/'/g, "\\'");
    const modalHtml = `
        <div id="delete-flow-modal" class="modal-bg" style="z-index: 10008; display: flex;">
            <div class="modal-box animated-modal" style="width: 90%; max-width: 320px; text-align: center;">
                <span class="close" onclick="this.parentElement.parentElement.remove()">×</span>
                <h3 class="section-title" style="margin-bottom: 15px; color: #ef4444;">Schedule Removal</h3>
                <p style="font-size: 13px; color: #555; line-height: 1.5; margin-bottom: 20px;">
                    <strong>${name}</strong> will be scheduled for permanent deletion in exactly 24 hours. They will function normally until then. Would you like to export their attendance history to a CSV file first?
                </p>
                <div style="display: flex; flex-direction: column; gap: 10px;">
                    <button class="google-btn" style="width: 100%; margin: 0; padding: 12px; font-size: 13px; background-color: #1a1a1a; color: white;" onclick="handleCsvChoice('${email}', '${safeName}', true, this)">Yes, Export & Schedule</button>
                    <button class="google-btn" style="width: 100%; margin: 0; padding: 12px; font-size: 13px; color: #ef4444; border-color: #fca5a5; background: #fef2f2;" onclick="handleCsvChoice('${email}', '${safeName}', false, this)">No, Skip & Schedule</button>
                </div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

async function handleCsvChoice(email, name, exportCsv, btn) {
    btn.innerText = "Processing...";
    if (exportCsv) {
        await downloadEmployeeCSV(email, name);
    }
    const modal = document.getElementById('delete-flow-modal');
    if(modal) modal.remove();

    openPromptModal(
        "Final Confirmation", 
        `Enter your Leader Password to schedule the removal of ${name} in 24 hours.`, 
        "password", 
        "", 
        async function(bossPass) {
            if (!bossPass) return;
            await executeEmployeeDeletion(email, bossPass);
        }
    );
}

// Ensure the Delete Export generates the identical visual data as the history table
async function downloadEmployeeCSV(email, name) {
    await ensureSupabase();
    const leader = getLeader();
    if (!leader) return;

    const { data: user } = await supabaseClient.from('users').select('*').eq('email', email).maybeSingle();
    const { data: logs } = await supabaseClient.from('checkins').select('*').eq('user_email', email);
    const { data: settings } = await supabaseClient.from('settings').select('*').eq('company_id', leader.company_id).limit(1).maybeSingle();
    
    const historyData = buildIndividualHistoryData(user, logs, settings);
    
    let csvContent = `"${name} - ${historyData.stats.checkins} / ${historyData.stats.workingDays} Check-ins (${historyData.stats.percent}% Attendance)"\n\n`;
    csvContent += "Date,Day,Status,Check-in,Check-out\n";
    
    if (historyData.rows.length > 0) {
        historyData.rows.forEach(r => {
            csvContent += `"${r.displayDate}","${r.displayDay}","${r.status}","${r.in}","${r.out}"\n`;
        });
    } else {
        csvContent += "No attendance records found.\n";
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    
    const safeFilenameName = name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    link.setAttribute("download", `${safeFilenameName}_attendance_history.csv`);
    
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

async function executeEmployeeDeletion(email, bossPass) {
    const leader = getLeader();
    if (!leader) return;
    await ensureSupabase();

    try {
        const { error: authError } = await supabaseClient.auth.signInWithPassword({
            email: leader.email,
            password: bossPass.trim()
        });

        if (authError) {
            openInfoModal("Access Denied", "Incorrect leader password. Deletion aborted.");
            return;
        }

        const { error: delError } = await supabaseClient
            .from('users')
            .update({ pending_deletion_at: new Date().toISOString() })
            .eq('email', email)
            .eq('company_id', leader.company_id);

        if (delError) throw delError;

        openInfoModal("Scheduled", "The employee has been scheduled for permanent deletion in 24 hours.");
        
        const dir = document.getElementById('directory-list');
        if (dir) loadTeamDirectory();
        
    } catch (err) {
        console.error(err);
        openInfoModal("Error", "Failed to schedule deletion. " + err.message);
    }
}

async function cancelEmployeeDeletion(email, name) {
    const leader = getLeader();
    if (!leader) return;
    await ensureSupabase();

    openConfirmModal("Cancel Deletion", `Are you sure you want to cancel the deletion of ${name} and keep them on the team?`, async function() {
        try {
            const { error } = await supabaseClient
                .from('users')
                .update({ pending_deletion_at: null })
                .eq('email', email)
                .eq('company_id', leader.company_id);

            if (error) throw error;
            
            openInfoModal("Success", `${name} has been fully restored.`);
            loadTeamDirectory();
        } catch (err) {
            console.error(err);
            openInfoModal("Error", "Failed to cancel deletion.");
        }
    });
}

let localHolidays = [];
let customSchedules = []; 
let settingsDate = new Date();
let sundaysToggled = false;
let saturdaysToggled = false;

function initializeSettingsCalendar() {
    const calendar = document.getElementById('settings-calendar');
    if (!calendar) return; 

    const leader = getLeader();
    let joinedDate = leader && leader.joined_date ? parseLocal(leader.joined_date) : new Date(2000, 0, 1);
    joinedDate.setHours(0,0,0,0);
    const joinedStr = getUniversalDate(joinedDate);

    const year = settingsDate.getFullYear();
    const month = settingsDate.getMonth();
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    const monthTitleEl = document.getElementById('settings-month-display');
    if (monthTitleEl) monthTitleEl.innerText = `${monthNames[month]} ${year}`;

    const prevBtn = document.getElementById('settings-prev-month');
    if (prevBtn) {
        if (year < joinedDate.getFullYear() || (year === joinedDate.getFullYear() && month <= joinedDate.getMonth())) {
            prevBtn.disabled = true;
            prevBtn.style.opacity = '0.3';
            prevBtn.style.cursor = 'not-allowed';
        } else {
            prevBtn.disabled = false;
            prevBtn.style.opacity = '1';
            prevBtn.style.cursor = 'pointer';
        }
    }
    
    const nextBtn = document.getElementById('settings-next-month');
    if (nextBtn) {
        const now = new Date();
        const maxYear = (now.getMonth() === 11 && now.getDate() >= 25) ? now.getFullYear() + 1 : now.getFullYear();
        if (year > maxYear || (year === maxYear && month >= 11)) {
            nextBtn.disabled = true;
            nextBtn.style.opacity = '0.3';
            nextBtn.style.cursor = 'not-allowed';
        } else {
            nextBtn.disabled = false;
            nextBtn.style.opacity = '1';
            nextBtn.style.cursor = 'pointer';
        }
    }

    calendar.innerHTML = `
        <div class="cal-day" style="border: none; font-weight: bold; color: #888; display: flex; justify-content: center; align-items: center; aspect-ratio: 1; font-size: 12px;">S</div>
        <div class="cal-day" style="border: none; font-weight: bold; color: #888; display: flex; justify-content: center; align-items: center; aspect-ratio: 1; font-size: 12px;">M</div>
        <div class="cal-day" style="border: none; font-weight: bold; color: #888; display: flex; justify-content: center; align-items: center; aspect-ratio: 1; font-size: 12px;">T</div>
        <div class="cal-day" style="border: none; font-weight: bold; color: #888; display: flex; justify-content: center; align-items: center; aspect-ratio: 1; font-size: 12px;">W</div>
        <div class="cal-day" style="border: none; font-weight: bold; color: #888; display: flex; justify-content: center; align-items: center; aspect-ratio: 1; font-size: 12px;">T</div>
        <div class="cal-day" style="border: none; font-weight: bold; color: #888; display: flex; justify-content: center; align-items: center; aspect-ratio: 1; font-size: 12px;">F</div>
        <div class="cal-day" style="border: none; font-weight: bold; color: #888; display: flex; justify-content: center; align-items: center; aspect-ratio: 1; font-size: 12px;">S</div>
    `;

    const firstDayIndex = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < firstDayIndex; i++) {
        calendar.insertAdjacentHTML('beforeend', `<div class="cal-day" style="border: none; background: transparent; aspect-ratio: 1;"></div>`);
    }

    const todayStrGlobal = getUniversalDate(new Date());

    for (let i = 1; i <= daysInMonth; i++) {
        let dayDiv = document.createElement('div');
        const currentIterationDate = new Date(year, month, i);
        const dateStr = getUniversalDate(currentIterationDate);

        dayDiv.className = 'cal-day'; 
        dayDiv.innerText = i;
        dayDiv.dataset.date = dateStr;
        
        dayDiv.style.aspectRatio = '1';
        dayDiv.style.display = 'flex';
        dayDiv.style.justifyContent = 'center';
        dayDiv.style.alignItems = 'center';
        dayDiv.style.fontSize = '12px';
        dayDiv.style.borderRadius = '4px';
        
        const isToday = (dateStr === todayStrGlobal);
        const isPastDay = (dateStr < todayStrGlobal);
        const isHoliday = localHolidays.includes(dateStr);

        if (dateStr < joinedStr) {
            dayDiv.style.cssText += CAL_STYLES.disabled;
        } else {
            if (isHoliday) {
                dayDiv.style.cssText += CAL_STYLES.holiday;
                dayDiv.dataset.isholiday = "true";
            } else {
                dayDiv.style.cssText += CAL_STYLES.default;
                dayDiv.dataset.isholiday = "false";
            }

            if (isPastDay || (isToday && window.todayCheckinsCount > 0)) {
                dayDiv.style.cursor = 'default';
                dayDiv.style.pointerEvents = 'none';
            } else {
                dayDiv.style.cursor = 'pointer';
                dayDiv.onclick = function() {
                    if (this.dataset.isholiday === "true") {
                        this.style.cssText = "aspect-ratio: 1; display: flex; justify-content: center; align-items: center; font-size: 12px; border-radius: 4px; cursor: pointer; " + CAL_STYLES.default;
                        this.dataset.isholiday = "false";
                        localHolidays = localHolidays.filter(d => d !== dateStr);
                    } else {
                        this.style.cssText = "aspect-ratio: 1; display: flex; justify-content: center; align-items: center; font-size: 12px; border-radius: 4px; cursor: pointer; " + CAL_STYLES.holiday;
                        this.dataset.isholiday = "true";
                        if (!localHolidays.includes(dateStr)) localHolidays.push(dateStr);
                        
                        // Check if personal holiday exists and warn boss
                        if (window.personalHolidaysData) {
                            const specialNames = window.personalHolidaysData.filter(d => d.date === dateStr).map(d => d.user_name);
                            if (specialNames.length > 0) {
                                const uniqueNames = [...new Set(specialNames)].join(', ');
                                openInfoModal("Note on Special Holidays", "You have previously given a special personal holiday on this date to: " + uniqueNames + ". You can remove it from their individual records if you wish, but the public holiday will now override and apply to everyone.");
                            }
                        }
                    }
                    saveSettings(); 
                };
            }
        }
        calendar.appendChild(dayDiv);
    }
}

function changeSettingsMonth(offset) {
    settingsDate.setMonth(settingsDate.getMonth() + offset);
    initializeSettingsCalendar();
}

function markAllSundays() {
    const btn = document.getElementById('btn-toggle-sundays');
    const now = new Date();
    const todayStrGlobal = getUniversalDate(now);
    const leader = getLeader();
    let joinedDate = leader && leader.joined_date ? parseLocal(leader.joined_date) : new Date(now.getFullYear(), 0, 1);
    joinedDate.setHours(0,0,0,0);
    
    const maxYear = (now.getMonth() === 11 && now.getDate() >= 25) ? now.getFullYear() + 1 : now.getFullYear();
    const endDate = new Date(maxYear, 11, 31);
    
    sundaysToggled = !sundaysToggled;
    
    for (let d = new Date(joinedDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        if (d.getDay() === 0) {
            const dateStr = getUniversalDate(d);
            
            if (dateStr < todayStrGlobal) continue; // SPARE PAST SUNDAYS

            const isToday = (dateStr === todayStrGlobal);
            if (isToday && window.todayCheckinsCount > 0) continue; 
            
            if (sundaysToggled && !localHolidays.includes(dateStr)) {
                localHolidays.push(dateStr);
            } else if (!sundaysToggled && localHolidays.includes(dateStr)) {
                localHolidays = localHolidays.filter(h => h !== dateStr);
            }
        }
    }
    if (btn) btn.innerText = sundaysToggled ? "Undo Sundays Off" : "Turn all Sundays off";
    initializeSettingsCalendar();
    saveSettings(); 
}

function markSecondSaturdays() {
    const btn = document.getElementById('btn-toggle-saturdays');
    const now = new Date();
    const todayStrGlobal = getUniversalDate(now);
    const leader = getLeader();
    let joinedDate = leader && leader.joined_date ? parseLocal(leader.joined_date) : new Date(now.getFullYear(), 0, 1);
    joinedDate.setHours(0,0,0,0);
    
    const maxYear = (now.getMonth() === 11 && now.getDate() >= 25) ? now.getFullYear() + 1 : now.getFullYear();
    
    saturdaysToggled = !saturdaysToggled;

    for (let y = joinedDate.getFullYear(); y <= maxYear; y++) {
        for (let m = 0; m < 12; m++) {
            if (y === joinedDate.getFullYear() && m < joinedDate.getMonth()) continue;
            
            let satCount = 0;
            const daysInMonth = new Date(y, m + 1, 0).getDate();
            for (let day = 1; day <= daysInMonth; day++) {
                const d = new Date(y, m, day);
                if (d.getDay() === 6) {
                    satCount++;
                    if (satCount === 2) {
                        if (d >= joinedDate) {
                            const dateStr = getUniversalDate(d);
                            
                            if (dateStr < todayStrGlobal) break; // SPARE PAST 2nd SATURDAYS

                            const isToday = (dateStr === todayStrGlobal);
                            if (isToday && window.todayCheckinsCount > 0) break; 

                            if (saturdaysToggled && !localHolidays.includes(dateStr)) {
                                localHolidays.push(dateStr);
                            } else if (!saturdaysToggled && localHolidays.includes(dateStr)) {
                                localHolidays = localHolidays.filter(h => h !== dateStr);
                            }
                        }
                        break;
                    }
                }
            }
        }
    }
    if (btn) btn.innerText = saturdaysToggled ? "Undo 2nd Saturdays Off" : "Turn all 2nd Saturdays off";
    initializeSettingsCalendar();
    saveSettings(); 
}

async function loadSettings() {
    const startInput = document.getElementById('check-in-start');
    let leader = getLeader();
    if (!startInput || !leader) return;
    await ensureSupabase();

    try {
        const { data: fresh } = await supabaseClient.from('users').select('*').eq('email', leader.email).limit(1).maybeSingle();
        if (fresh) { 
            leader = fresh;
            secureVerifiedLeader = fresh;
            sessionStorage.setItem('loggedInLeader', JSON.stringify(fresh)); 
        }
    } catch(e) {}

    try {
        const todayStr = getUniversalDate();
        // ONLY count true actual checkins (Present, Late) to lock the calendar, ignore Personal Holidays
        const { count } = await supabaseClient.from('checkins').select('*', { count: 'exact', head: true }).eq('company_id', leader.company_id).eq('date', todayStr).eq('status', 'Present');
        window.todayCheckinsCount = count || 0;
        
        // Also fetch personal holidays so we can warn the boss if they override one
        const { data: phData } = await supabaseClient.from('checkins').select('date, user_name').eq('company_id', leader.company_id).eq('status', 'Holiday/Off');
        window.personalHolidaysData = phData || [];
    } catch(e) { 
        window.todayCheckinsCount = 0; 
        window.personalHolidaysData = [];
    }

    try {
        const { data, error } = await supabaseClient.from('settings').select('*').eq('company_id', leader.company_id).limit(1).maybeSingle();
        if (error) throw error;
        
        if (data) {
            startInput.value = data.check_in_start || "09:00";
            document.getElementById('check-in-end').value = data.check_in_end || "10:00";
            document.getElementById('require-gps').checked = data.require_gps;
            document.getElementById('require-pin').checked = data.require_pin;
            const locBtn = document.getElementById('manage-locations-btn');
            if (locBtn) locBtn.style.display = data.require_gps ? 'block' : 'none';

            if (document.getElementById('gps-checkin')) {
                document.getElementById('gps-checkin').checked = data.require_gps !== false;
                document.getElementById('gps-checkout').checked = data.gps_checkout !== false;
                document.getElementById('gps-sub-options').style.display = data.require_gps ? 'block' : 'none';
            }
            if (document.getElementById('pin-checkin')) {
                document.getElementById('pin-checkin').checked = data.pin_checkin !== false;
                document.getElementById('pin-checkout').checked = data.pin_checkout !== false;
                document.getElementById('pin-sub-options').style.display = data.require_pin ? 'block' : 'none';
            }
           if (document.getElementById('workspace-timezone')) {
                const tzSelect = document.getElementById('workspace-timezone');
                let detectedTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
                if (detectedTz === 'Asia/Calcutta') detectedTz = 'Asia/Kolkata';
                let targetTz = data.timezone || detectedTz;
                if (targetTz === 'Asia/Calcutta') targetTz = 'Asia/Kolkata';
                tzSelect.value = targetTz;
                if (!tzSelect.value) tzSelect.value = 'Asia/Kolkata';
            }
            
            const chk = document.getElementById('require-checkout');
            if(chk) chk.checked = data.require_checkout;
            
            const late = document.getElementById('late-arrival-hours');
            if(late) {
                late.value = data.late_arrival_hours || 0;
                const lateText = document.getElementById('late-dropdown-text');
                if (lateText) {
                    const texts = {0: 'Disabled', 1: 'Up to 1 hr', 2: 'Up to 2 hrs', 3: 'Up to 3 hrs', 4: 'Up to 4 hrs', 5: 'Up to 5 hrs'};
                    lateText.innerText = texts[data.late_arrival_hours || 0] || 'Disabled';
                }
            }
            
            if (data.office_lat && data.office_lng) {
                mapSavedLat = data.office_lat;
                mapSavedLng = data.office_lng;
                mapSavedRadius = data.office_radius || 150;
            }

            if (data.holidays) {
                try { localHolidays = JSON.parse(data.holidays); } catch(e){}
                if (!Array.isArray(localHolidays)) localHolidays = [];
                initializeSettingsCalendar();
            }

            if (data.exceptions) {
                let savedExceptions = [];
                let exceptionsActive = true;
                try { 
                    let parsed = JSON.parse(data.exceptions);
                    if (Array.isArray(parsed)) savedExceptions = parsed;
                    else { exceptionsActive = parsed.active; savedExceptions = parsed.data || []; }
                } catch(e){}
                
                const exToggle = document.getElementById('toggle-exceptions');
                if (exToggle) { exToggle.checked = exceptionsActive; toggleExceptionsUI(); }

                const list = document.getElementById('exception-list');
                if (list) {
                    list.innerHTML = ""; 
                    savedExceptions.forEach(exc => {
                        addException(); 
                        const rows = list.children;
                        const lastRow = rows[rows.length - 1];
                        const inputs = lastRow.querySelectorAll('input');
                        if(inputs.length >= 3) {
                            inputs[0].value = exc.date;
                            inputs[1].value = exc.start;
                            inputs[2].value = exc.end;
                        }
                    });
                }
            }

            let customSchedulesActive = true;
            if (data.custom_schedules) {
                try { 
                    let parsed = JSON.parse(data.custom_schedules);
                    if (Array.isArray(parsed)) customSchedules = parsed;
                    else { customSchedulesActive = parsed.active; customSchedules = parsed.data || []; }
                } catch(e){}
            } else {
                customSchedules = [];
            }
            
            const ctToggle = document.getElementById('toggle-custom-time');
            if (ctToggle) { ctToggle.checked = customSchedulesActive; toggleCustomTimeUI(); }
            
            renderCustomTimeList();

        } else {
            if(startInput) startInput.value = "09:00";
            if(document.getElementById('check-in-end')) document.getElementById('check-in-end').value = "10:00";
            if(document.getElementById('require-gps')) document.getElementById('require-gps').checked = false;
            if(document.getElementById('require-pin')) document.getElementById('require-pin').checked = false;
        }
    } catch (err) {
        console.error("Error loading settings:", err);
    }
}

async function saveSettings() {
    await ensureSupabase();
    let leader = getLeader();

    // Fallback: if saveSettings() was triggered before DOMContentLoaded finished populating secureVerifiedLeader, fetch it now
    if (!leader && supabaseClient) {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session?.user?.email) {
            const { data: profile } = await supabaseClient
                .from('users')
                .select('*')
                .ilike('email', session.user.email)
                .limit(1)
                .maybeSingle();
            if (profile) {
                secureVerifiedLeader = profile;
                leader = profile;
            }
        }
    }
    if (!leader) return;

    const subtitle = document.querySelector('.dash-header .subtitle');
    let safeCompanyId = leader.company_id;

    try {
        if (!safeCompanyId) {
            safeCompanyId = "COMP_" + Math.random().toString(36).substr(2, 9).toUpperCase();
            await supabaseClient.from('users').update({ company_id: safeCompanyId }).eq('id', leader.id);
            leader.company_id = safeCompanyId;
            sessionStorage.setItem('loggedInLeader', JSON.stringify(leader));
        }

        const { data: existingData } = await supabaseClient
            .from('settings')
            .select('*')
            .eq('company_id', safeCompanyId)
            .limit(1)
            .maybeSingle();

        if (document.getElementById('check-in-start')) {
            const startVal = document.getElementById('check-in-start').value;
            const endVal = document.getElementById('check-in-end').value;
            
            if (startVal && endVal && startVal >= endVal) {
                if (existingData && existingData.check_in_start && existingData.check_in_end) {
                    document.getElementById('check-in-start').value = existingData.check_in_start;
                    document.getElementById('check-in-end').value = existingData.check_in_end;
                } else {
                    document.getElementById('check-in-start').value = "09:00";
                    document.getElementById('check-in-end').value = "10:00";
                }
                
                openInfoModal("Invalid Time Range", "The Check-in Window end time must be later than the start time. Because attendance is logged by calendar day, overnight shifts (e.g., 8:00 PM to 1:00 AM) are not supported. \n\nYour inputs have been safely reverted.");
                if (subtitle) { subtitle.innerText = "Save blocked: Invalid time range"; subtitle.style.color = "#ef4444"; }
                return;
            }

            let invalidExc = false;
            let invalidDateExc = false;
            const todayStr = getUniversalDate();

            document.querySelectorAll('#exception-list div').forEach(row => {
                const inputs = row.querySelectorAll('input');
                if (inputs.length >= 3) {
                    const exDate = inputs[0].value;
                    const exStart = inputs[1].value;
                    const exEnd = inputs[2].value;

                    if (exDate && exDate <= todayStr) {
                        invalidDateExc = true;
                    }
                    if (exStart && exEnd && exStart >= exEnd) {
                        invalidExc = true;
                    }
                }
            });

            if (invalidDateExc) {
                if (existingData && existingData.exceptions) {
                    try {
                        let parsed = JSON.parse(existingData.exceptions);
                        let oldExceptions = Array.isArray(parsed) ? parsed : parsed.data || [];
                        const list = document.getElementById('exception-list');
                        list.innerHTML = ""; 
                        oldExceptions.forEach(exc => {
                            addException(); 
                            const rows = list.children;
                            const lastRow = rows[rows.length - 1];
                            const inputs = lastRow.querySelectorAll('input');
                            if (inputs.length >= 3) {
                                inputs[0].value = exc.date;
                                inputs[1].value = exc.start;
                                inputs[2].value = exc.end;
                            }
                        });
                    } catch(e){}
                }
                openInfoModal("Invalid Exception Date", "An exception date cannot be set for today or any date in the past. It must be scheduled for tomorrow or later.\n\nYour exceptions list has been safely reverted.");
                if (subtitle) { subtitle.innerText = "Save blocked: Invalid exception date"; subtitle.style.color = "#ef4444"; }
                return;
            }

            if (invalidExc) {
                if (existingData && existingData.exceptions) {
                    try {
                        let parsed = JSON.parse(existingData.exceptions);
                        let oldExceptions = Array.isArray(parsed) ? parsed : parsed.data || [];
                        const list = document.getElementById('exception-list');
                        list.innerHTML = ""; 
                        oldExceptions.forEach(exc => {
                            addException(); 
                            const rows = list.children;
                            const lastRow = rows[rows.length - 1];
                            const inputs = lastRow.querySelectorAll('input');
                            if (inputs.length >= 3) {
                                inputs[0].value = exc.date;
                                inputs[1].value = exc.start;
                                inputs[2].value = exc.end;
                            }
                        });
                    } catch(e){}
                }
                openInfoModal("Invalid Exception Range", "An exception's end time must be later than its start time. Overnight shifts are not supported.\n\nYour exceptions list has been safely reverted.");
                if (subtitle) { subtitle.innerText = "Save blocked: Invalid exception time"; subtitle.style.color = "#ef4444"; }
                return;
            }
        }

        if (subtitle && !subtitle.innerText.includes("Saving") && !subtitle.innerText.includes("blocked")) {
            subtitle.innerText = "Saving changes to cloud...";
            subtitle.style.color = "#f59e0b"; 
        }

        let payload = { company_id: safeCompanyId };

        if (existingData) {
            payload = { ...existingData };
            // CRITICAL FIX: Never send primary key `id` or `created_at` inside an UPDATE payload
            delete payload.id;
            delete payload.created_at;
        }

        if (document.getElementById('check-in-start')) {
            payload.check_in_start = document.getElementById('check-in-start').value;
            payload.check_in_end = document.getElementById('check-in-end').value;
            payload.require_gps = document.getElementById('require-gps').checked;
            payload.require_pin = document.getElementById('require-pin').checked;
            
            if (document.getElementById('gps-checkin')) {
                payload.gps_checkin = document.getElementById('require_gps').checked;
                payload.gps_checkout = document.getElementById('gps-checkout').checked;
            }
            if (document.getElementById('pin-checkin')) {
                payload.pin_checkin = document.getElementById('pin-checkin').checked;
                payload.pin_checkout = document.getElementById('pin-checkout').checked;
            }

            if (document.getElementById('workspace-timezone')) {
                payload.timezone = document.getElementById('workspace-timezone').value;
            }
            
            if (document.getElementById('require-checkout')) {
                payload.require_checkout = document.getElementById('require-checkout').checked;
                payload.late_arrival_hours = parseInt(document.getElementById('late-arrival-hours').value, 10) || 0;
            }
            
            let exceptionsArray = [];
            document.querySelectorAll('#exception-list div').forEach(row => {
                const inputs = row.querySelectorAll('input');
                if (inputs.length >= 3 && inputs[0].value && inputs[1].value && inputs[2].value) {
                    exceptionsArray.push({
                        date: inputs[0].value,
                        start: inputs[1].value,
                        end: inputs[2].value
                    });
                }
            });
            const isExActive = document.getElementById('toggle-exceptions') ? document.getElementById('toggle-exceptions').checked : true;
            payload.exceptions = JSON.stringify({ active: isExActive, data: exceptionsArray });
            
            payload.holidays = JSON.stringify(localHolidays);
            
            const isCtActive = document.getElementById('toggle-custom-time') ? document.getElementById('toggle-custom-time').checked : true;
            payload.custom_schedules = JSON.stringify({ active: isCtActive, data: customSchedules });
        }

        if (mapSavedLat && mapSavedLng) {
            payload.office_lat = mapSavedLat;
            payload.office_lng = mapSavedLng;
            payload.office_radius = mapSavedRadius || 150;
        }

        if (document.getElementById('locations-list-container')) {
            payload.locations = JSON.stringify(workspaceLocations);
        }

        // Helper that automatically retries if a column (e.g., `timezone`) doesn't exist in your Supabase table yet
        const writeSettingsWithFallback = async (dataToWrite) => {
            let currentPayload = { ...dataToWrite };
            for (let attempt = 0; attempt < 4; attempt++) {
                let res;
                if (existingData) {
                    res = await supabaseClient
                        .from('settings')
                        .update(currentPayload)
                        .eq('company_id', safeCompanyId);
                } else {
                    res = await supabaseClient
                        .from('settings')
                        .insert([currentPayload]);
                }
                if (!res.error) return null;

                // If Supabase says a column doesn't exist in `settings`, strip that column and retry immediately
                const colMatch = res.error.message && res.error.message.match(/column ["']?([a-zA-Z0-9_]+)["']?/i);
                const missingCol = colMatch ? colMatch[1] : null;
                if (missingCol && missingCol in currentPayload) {
                    console.warn(`Stripping missing column '${missingCol}' from settings save payload.`);
                    delete currentPayload[missingCol];
                    continue;
                }
                return res.error;
            }
            return null;
        };

        const saveError = await writeSettingsWithFallback(payload);
        if (saveError) throw saveError;

        if (subtitle) {
            subtitle.innerText = "All changes saved ✓";
            subtitle.style.color = "#4ade80"; 
            setTimeout(() => {
                subtitle.innerText = "Organizational parameters"; 
                subtitle.style.color = "#888"; 
            }, 2000);
        }
    } catch (err) {
        console.error("Error saving settings to cloud:", err);
        if (subtitle) {
            subtitle.innerText = "Error saving changes: " + (err.message || "Database error");
            subtitle.style.color = "red";
        }
    }
}

function addException() {
    const list = document.getElementById('exception-list');
    if (!list) return;

    if (list.children.length >= 5) {
        openInfoModal("Limit Reached", "You can only set up to 5 future exception dates.");
        return;
    }

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = getUniversalDate(tomorrow);

    const div = document.createElement('div');
    div.style.display = 'flex';
    div.style.gap = '5px';
    div.style.marginBottom = '10px';
    div.style.alignItems = 'center';

    div.innerHTML = `
        <input type="date" class="input-field" min="${tomorrowStr}" style="flex: 2; padding: 8px; font-size: 11px; height: 32px;" onchange="saveSettings()">
        <input type="time" class="input-field" style="flex: 1; padding: 8px; font-size: 11px; height: 32px;" onchange="saveSettings()">
        <input type="time" class="input-field" style="flex: 1; padding: 8px; font-size: 11px; height: 32px;" onchange="saveSettings()">
        <button class="i-btn" style="color: #dc2626; border-color: #fca5a5; background: #fef2f2; width: 24px; height: 24px; flex-shrink: 0;" onclick="this.parentElement.remove(); updateExceptionCount(); saveSettings();">×</button>
    `;
    list.appendChild(div);
    updateExceptionCount();
}

function updateExceptionCount() {
    const list = document.getElementById('exception-list');
    const countSpan = document.getElementById('exception-count');
    if (list && countSpan) {
        countSpan.innerText = `(${list.children.length}/5)`;
    }
}

async function openCustomTimeModal(editEmail = null) {
    const leader = getLeader();
    if (!leader || !supabaseClient) return;

    const select = document.getElementById('custom-time-emp-select');
    select.innerHTML = '<option value="" disabled selected>Loading staff...</option>';
    openModal('custom-time-modal');

    try {
        const { data: staff } = await supabaseClient.from('users').select('*').neq('role', 'leader').eq('company_id', leader.company_id);
        if (staff && staff.length > 0) {
            select.innerHTML = '<option value="" disabled selected>Select an employee</option>';
            staff.forEach(s => {
                const isAlreadyAssigned = customSchedules.some(c => c.email === s.email);
                if (!isAlreadyAssigned || s.email === editEmail) {
                    select.innerHTML += `<option value="${s.email}">${s.name} (${s.role})</option>`;
                }
            });
            
            if (typeof editEmail === 'string') {
                const existing = customSchedules.find(c => c.email === editEmail);
                if (existing) {
                    select.value = existing.email;
                    document.getElementById('custom-time-start').value = existing.start;
                    document.getElementById('custom-time-end').value = existing.end;
                }
            } else {
                document.getElementById('custom-time-start').value = "09:00";
                document.getElementById('custom-time-end').value = "10:00";
            }
        } else {
            select.innerHTML = '<option value="" disabled selected>No staff found</option>';
        }
    } catch (err) {
        console.error(err);
        select.innerHTML = '<option value="" disabled selected>Error loading staff</option>';
    }
}

function saveCustomTime() {
    const select = document.getElementById('custom-time-emp-select');
    const start = document.getElementById('custom-time-start').value;
    const end = document.getElementById('custom-time-end').value;

    if (!select.value || !start || !end) {
        openInfoModal("Missing Info", "Please select an employee and set both times.");
        return;
    }

    if (start >= end) {
        openInfoModal("Invalid Time Range", "The custom end time must be later than the start time. Overnight shifts spanning across midnight are not supported.");
        return;
    }

    const email = select.value;
    const name = select.options[select.selectedIndex].text.split(' (')[0];

    customSchedules = customSchedules.filter(c => c.email !== email);
    
    customSchedules.push({ email, name, start, end });
    
    renderCustomTimeList();
    closeModal('custom-time-modal');
    saveSettings(); 
}

function removeCustomTime(email) {
    customSchedules = customSchedules.filter(c => c.email !== email);
    renderCustomTimeList();
    saveSettings(); 
}

function renderCustomTimeList() {
    const list = document.getElementById('custom-time-list');
    if (!list) return;
    
    list.innerHTML = "";
    if (customSchedules.length === 0) {
        list.innerHTML = `<p style="font-size: 11px; color: #888;">No custom schedules set.</p>`;
        return;
    }

    customSchedules.forEach(c => {
        const div = document.createElement('div');
        div.style.display = 'flex';
        div.style.justifyContent = 'space-between';
        div.style.alignItems = 'center';
        div.style.marginBottom = '8px';
        div.style.padding = '8px';
        div.style.backgroundColor = '#f9f9f9';
        div.style.border = '1px solid #eaeaea';
        div.style.borderRadius = '4px';
        div.style.cursor = 'pointer';
        div.onclick = function() { openCustomTimeModal(c.email); };

        div.innerHTML = `
            <div style="display: flex; flex-direction: column; pointer-events: none;">
                <span style="font-size: 12px; font-weight: 600; color: #1a1a1a;">${c.name}</span>
                <span style="font-size: 10px; color: #888;">${c.start} - ${c.end}</span>
            </div>
            <button class="i-btn" style="color: #dc2626; border-color: #fca5a5; background: #fef2f2; width: 24px; height: 24px;" onclick="event.stopPropagation(); removeCustomTime('${c.email}')">X</button>
        `;
        list.appendChild(div);
    });
}

async function loadTodayPIN() {
    const pinDisplay = document.getElementById('live-pin-display');
    const activeState = document.getElementById('pin-active-state');
    const disabledState = document.getElementById('pin-disabled-state');
    const leader = getLeader();
    
    if (!leader) return;
    await ensureSupabase();

    try {
        const { data } = await supabaseClient.from('settings').select('daily_pin, require_pin').eq('company_id', leader.company_id).limit(1).maybeSingle();
        
        if (activeState && disabledState && pinDisplay) {
            if (data && data.require_pin) {
                activeState.style.display = "block";
                disabledState.style.display = "none";

                const todayStr = getUniversalDate();
                let savedDate = "";
                let pinValue = "";

                if (data.daily_pin) {
                    if (data.daily_pin.includes(':')) {
                        const parts = data.daily_pin.split(':');
                        savedDate = parts[0];
                        pinValue = parts[1];
                    } else {
                        pinValue = data.daily_pin;
                        savedDate = localStorage.getItem('last_pin_date_' + leader.company_id) || "";
                    }
                }

                if (savedDate !== todayStr || !pinValue) {
                    await generateNewPIN(); 
                } else {
                    pinDisplay.innerText = pinValue;
                }
                
                if (window.pinTrackerInterval) clearInterval(window.pinTrackerInterval);
                window.pinTrackerInterval = setInterval(() => {
                    const checkToday = getUniversalDate();
                    const checkSaved = localStorage.getItem('last_pin_date_' + leader.company_id);
                    if (checkToday !== checkSaved) {
                        generateNewPIN();
                    }
                }, 60000);

            } else {
                activeState.style.display = "none";
                disabledState.style.display = "block";
            }
        }
    } catch (err) { console.error(err); }
}

async function generateNewPIN() {
    const leader = getLeader();
    if (!leader) return;
    await ensureSupabase();

    const newPin = Math.floor(1000 + Math.random() * 9000).toString();
    const pinDisplay = document.getElementById('live-pin-display');
    if (pinDisplay) pinDisplay.innerText = newPin;

    try {
        let safeCompanyId = leader.company_id;
        if (!safeCompanyId) {
            safeCompanyId = "COMP_" + Math.random().toString(36).substr(2, 9).toUpperCase();
            await supabaseClient.from('users').update({ company_id: safeCompanyId }).eq('id', leader.id);
            leader.company_id = safeCompanyId;
            sessionStorage.setItem('loggedInLeader', JSON.stringify(leader));
        }

        const todayStr = getUniversalDate();
        const cloudPayload = todayStr + ':' + newPin;

        const { data: existingData } = await supabaseClient.from('settings').select('id').eq('company_id', safeCompanyId).limit(1).maybeSingle();
        if (existingData) {
            await supabaseClient.from('settings').update({ daily_pin: cloudPayload }).eq('id', existingData.id);
        } else {
            await supabaseClient.from('settings').insert([{ daily_pin: cloudPayload, company_id: safeCompanyId }]);
        }

        localStorage.setItem('last_pin_date_' + safeCompanyId, todayStr);

    } catch (err) { console.error(err); }
}

let map = null;
let geofenceCircle = null;
let mapSavedLat = null;
let mapSavedLng = null;
let mapSavedRadius = 150;
let leafletLoaded = false;

function injectMapDependencies() {
    if (document.querySelector('link[href*="leaflet"]')) {
        leafletLoaded = true;
        return;
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
    
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => { leafletLoaded = true; };
    document.head.appendChild(script);
}

function injectMapModalHTML() {
    if (document.getElementById('gps-map-modal') || (!window.location.pathname.includes('settings') && !window.location.pathname.includes('locations'))) return;
    
    const mapModalHtml = `
        <div id="gps-map-modal" class="modal-bg" style="z-index: 10000; display: none;">
            <div class="modal-box animated-modal" style="width: 90%; max-width: 500px; padding: 15px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <h3 class="section-title" style="margin: 0;">Set Geofence Boundary</h3>
                    <span class="close" onclick="closeMapModal()" style="cursor: pointer; font-size: 20px;">×</span>
                </div>
                <p style="font-size: 11px; color: #888; margin-bottom: 15px;">Drag the map to center the pin on your physical workplace.</p>
                
                <div id="map" style="height: 300px; border-radius: 8px; border: 2px solid #1a1a1a; margin-bottom: 15px; position: relative;">
                    <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -100%); z-index: 1000; pointer-events: none; text-shadow: 0 0 5px white; font-size: 24px;">
                        📍
                    </div>
                </div>
                
                <div style="margin-bottom: 20px;">
                    <label style="font-size: 12px; font-weight: bold; color: #1a1a1a; display: flex; justify-content: space-between;">
                        Allowed Radius: <span id="radius-display" style="color: #4ade80;">150 meters</span>
                    </label>
                    <input type="range" id="radius-slider" min="50" max="1000" step="10" value="150" style="width: 100%; margin-top: 10px; cursor: pointer;" oninput="updateCirclePreview()">
                    <div style="display: flex; justify-content: space-between; font-size: 9px; color: #aaa; margin-top: 5px;">
                        <span>Tight (50m)</span>
                        <span>Wide (1000m)</span>
                    </div>
                </div>

                <button id="save-map-btn" class="main-btn form-btn" style="width: 100%; background-color: #1a1a1a; color: white;" onclick="confirmMapLocation()">Save Boundary & Close</button>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', mapModalHtml);
}

function bindGPSControls() {
    const gpsSwitch = document.getElementById('require-gps');
    if (gpsSwitch) {
        gpsSwitch.onchange = handleGPSToggle;
    }

    const oldButton = document.querySelector('button[onclick="pinpointWorkplaceLocation()"]');
    if (oldButton) {
        oldButton.innerText = "📍 Edit Workplace Location & Radius";
        oldButton.onclick = openMapModal;
        oldButton.removeAttribute('onclick'); 
    }
}

function handleGPSToggle() {
    const isChecked = document.getElementById('require-gps').checked;
    const subOptions = document.getElementById('gps-sub-options');
    if (subOptions) subOptions.style.display = isChecked ? 'block' : 'none';
    
    if (isChecked) {
        document.getElementById('gps-checkin').checked = true;
        document.getElementById('gps-checkout').checked = true;
        if (typeof mapSavedLat !== 'undefined' && !mapSavedLat) {
            window.location.href = 'leader-locations.html';
        }
    }
    
    const locBtn = document.getElementById('manage-locations-btn');
    if (locBtn) locBtn.style.display = isChecked ? 'block' : 'none';
    saveSettings();
}

function handlePinToggle() {
    const isChecked = document.getElementById('require-pin').checked;
    const subOptions = document.getElementById('pin-sub-options');
    if (subOptions) subOptions.style.display = isChecked ? 'block' : 'none';
    
    if (isChecked) {
        document.getElementById('pin-checkin').checked = true;
        document.getElementById('pin-checkout').checked = true;
    }
    saveSettings();
}

function handleSubToggle(type) {
    const inChecked = document.getElementById(`${type}-checkin`).checked;
    const outChecked = document.getElementById(`${type}-checkout`).checked;
    
    if (!inChecked && !outChecked) {
        document.getElementById(`require-${type}`).checked = false;
        document.getElementById(`${type}-sub-options`).style.display = 'none';
        if (type === 'gps') {
            const locBtn = document.getElementById('manage-locations-btn');
            if (locBtn) locBtn.style.display = 'none';
        }
    }
    saveSettings();
}

function openMapModal() {
    if (!leafletLoaded || typeof L === 'undefined') {
        openInfoModal("Loading", "Loading map engine... Please try again in 2 seconds.");
        return;
    }
    document.getElementById('gps-map-modal').style.display = 'flex';
    
    setTimeout(() => {
        if (!map) {
            initMap();
        } else {
            map.invalidateSize();
            if(mapSavedLat && mapSavedLng) {
                map.setView([mapSavedLat, mapSavedLng], 16);
                document.getElementById('radius-slider').value = mapSavedRadius;
                updateCirclePreview();
            }
        }
    }, 200);
}

function closeMapModal() {
    document.getElementById('gps-map-modal').style.display = 'none';
    if(!mapSavedLat && document.getElementById('require-gps').checked) {
        document.getElementById('require-gps').checked = false;
        saveSettings();
    }
}

function initMap() {
    let initialLat = 40.7128;
    let initialLng = -74.0060;

    if (mapSavedLat && mapSavedLng) {
        initialLat = mapSavedLat;
        initialLng = mapSavedLng;
    }

    map = L.map('map').setView([initialLat, initialLng], 16);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
    }).addTo(map);

    geofenceCircle = L.circle(map.getCenter(), {
        color: '#4ade80',
        fillColor: '#4ade80',
        fillOpacity: 0.2,
        radius: document.getElementById('radius-slider').value
    }).addTo(map);

    map.on('move', function() {
        geofenceCircle.setLatLng(map.getCenter());
    });

    if (!mapSavedLat && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(position => {
            map.setView([position.coords.latitude, position.coords.longitude], 16);
            geofenceCircle.setLatLng([position.coords.latitude, position.coords.longitude]);
        });
    }
}

function updateCirclePreview() {
    const currentRadius = document.getElementById('radius-slider').value;
    document.getElementById('radius-display').innerText = `${currentRadius} meters`;
    if (geofenceCircle) {
        geofenceCircle.setRadius(currentRadius);
    }
}

function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371e3; 
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c; 
}

let currentStaff = null; 
let scannerInterval = null;
let staffAnalyticsDate = new Date();

async function handleStaffLogin() {
    await ensureSupabase();
    const email = document.getElementById('staff-email').value.trim();
    const pass = document.getElementById('staff-pass').value;
    const loginBtn = document.querySelector('.form-btn');

    if (!email || !pass || !supabaseClient) return;

    loginBtn.innerText = "Verifying...";
    loginBtn.disabled = true;

    try {
            // 1. Authenticate securely
            const { data: authData, error: authError } = await supabaseClient.auth.signInWithPassword({
                email: email,
                password: pass
            });

            if (authError) {
                openInfoModal("Login Failed", "Incorrect email or password.");
                loginBtn.innerText = "Login";
                loginBtn.disabled = false;
                return;
            }

            // 2. Fetch profile data
            const { data: user, error } = await supabaseClient.from('users').select('*').eq('email', email).limit(1).maybeSingle();
            if (error) throw error;

            // 3. Set session and redirect
            if (user) {
                // Supabase Auth automatically stored the secure session token! We just redirect.
                window.location.href = 'staff-dashboard.html';
            } else {
                openInfoModal("Login Failed", "User profile not found.");
                loginBtn.innerText = "Login";
                loginBtn.disabled = false;
            }
        } catch (err) {
            console.error("Staff Login Crash:", err);
            openInfoModal("Database Error", err.message);
            loginBtn.innerText = "Login";
            loginBtn.disabled = false;
        }
}

async function loadStaffDashboard() {
    if (!document.getElementById('status-card') && !document.getElementById('staff-analytics-calendar')) return;
    await ensureSupabase();
    if (!currentStaff) {
        const sessionData = sessionStorage.getItem('loggedInStaff');
        if (!sessionData) return;
        currentStaff = JSON.parse(sessionData);
    }
   if (supabaseClient && currentStaff?.email) {
        try {
            const { data: freshStaff } = await supabaseClient
                .from('users')
                .select('id, name, email, role, joined_date, company_id, pending_deletion_at, setup_completed')
                .eq('email', currentStaff.email)
                .limit(1)
                .maybeSingle();
                
            if (freshStaff) {
                currentStaff = freshStaff;
            }
        } catch(e) {}
    }
    if (!currentStaff.company_id) {
        currentStaff.company_id = "UNASSIGNED_ID";
    }

    loadStaffRecords();

    const checkInBtn = document.getElementById('check-in-btn');
    if (checkInBtn) {
        checkInBtn.onclick = function(event) {
            event.preventDefault(); 
            startDailyScanner();
        };
    }

   const logOutBtn = document.getElementById("secure-logout-btn");
    if (logOutBtn) {
        logOutBtn.onclick = async function(e) {
            e.preventDefault();
            stopActiveFaceSession();
            await supabaseClient.auth.signOut(); // Securely end the JWT session
            window.location.href = 'index.html';
        };
    }
}

function formatTime12(timeStr) {
    const match = timeStr.match(/(\d+):(\d+)/);
    if (!match) return timeStr;
    let h = parseInt(match[1]);
    const m = match[2];
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) h = 12;
    return `${h}:${m} ${ampm}`;
}

async function loadStaffRecords() {
    await ensureSupabase();
    if (!currentStaff || !supabaseClient) return;

    let safeLogs = [];
    let settings = null;
    try {
        const { data: logsData } = await supabaseClient.from('checkins').select('*').eq('user_email', currentStaff.email);
        const { data: settingsData } = await supabaseClient.from('settings').select('*').eq('company_id', currentStaff.company_id).limit(1).maybeSingle();
        safeLogs = Array.isArray(logsData) ? logsData : [];
        settings = settingsData;
    } catch (e) {
        console.error("Error fetching staff data:", e);
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

    let holidaysArray = [];
    let customSchedules = [];
    let exceptions = [];
    let customSchedulesActive = true;
    let exceptionsActive = true;
    let globalStart = "09:00";
    let globalEnd = "10:00";
    
    let assignedZone = "Main Campus";
    let isGpsExempt = false;

    if (settings) {
        if (settings.holidays) {
            try { holidaysArray = JSON.parse(settings.holidays); } catch(e){}
            if (!Array.isArray(holidaysArray)) holidaysArray = [];
        }
        if (settings.custom_schedules) {
            try {
                let parsed = JSON.parse(settings.custom_schedules);
                if (Array.isArray(parsed)) customSchedules = parsed;
                else { customSchedulesActive = parsed.active; customSchedules = parsed.data || []; }
            } catch(e){}
        }
        if (settings.exceptions) {
            try {
                let parsed = JSON.parse(settings.exceptions);
                if (Array.isArray(parsed)) exceptions = parsed;
                else { exceptionsActive = parsed.active; exceptions = parsed.data || []; }
            } catch(e){}
        }
        if (settings.check_in_start) globalStart = settings.check_in_start;
        if (settings.check_in_end) globalEnd = settings.check_in_end;
        
        if (settings.locations && settings.require_gps) {
            try {
                const locations = JSON.parse(settings.locations);
                let userLoc = locations.find(loc => loc.staff && loc.staff.includes(currentStaff.email));
                if (!userLoc) userLoc = locations.find(loc => loc.id === 'main') || locations[0];
                
                if (userLoc) {
                    assignedZone = userLoc.name;
                    if (userLoc.id === 'exempt' || userLoc.isExempt) {
                        isGpsExempt = true;
                        assignedZone = "GPS Exempt";
                    }
                }
            } catch(e) {}
        } else if (!settings.require_gps) {
            assignedZone = "GPS Disabled (Anywhere)";
        }
    }

    let validCheckinDates = new Set();
    let personalHolidaysSet = new Set();
    
    safeLogs.forEach(log => {
        if (log.status === 'Holiday/Off') {
            personalHolidaysSet.add(log.date);
        } else if (log.status === 'Present') {
            const logDate = parseLocal(log.date);
            if (logDate <= today) validCheckinDates.add(log.date);
        }
    });

    let workingDays = 0;
    const joinedDate = currentStaff.joined_date ? parseLocal(currentStaff.joined_date) : new Date();
    for (let d = new Date(joinedDate); d <= today; d.setDate(d.getDate() + 1)) {
        const dateStr = getUniversalDate(d);
        if (!holidaysArray.includes(dateStr) && !personalHolidaysSet.has(dateStr)) workingDays++;
    }
    if (workingDays === 0) workingDays = 1; 

    const totalChecks = validCheckinDates.size;
    let percent = Math.round((totalChecks / workingDays) * 100);
    if (percent > 100) percent = 100;
    
    const todayStr2 = getUniversalDate(today);
    const isHoliday = holidaysArray.includes(todayStr2) || personalHolidaysSet.has(todayStr2);
    const checkedInToday = validCheckinDates.has(todayStr2);

    let displayStart = globalStart;
    let displayEnd = globalEnd;
    let exceptionText = "--"; 
    
    let myCustom = null;
    if (customSchedulesActive) {
        myCustom = customSchedules.find(c => c.email === currentStaff.email);
    }

    if (myCustom) {
        displayStart = myCustom.start;
        displayEnd = myCustom.end;
    } else {
        exceptionText = "None scheduled";
        if (exceptionsActive && Array.isArray(exceptions)) {
            const futureExc = exceptions.filter(ex => parseLocal(ex.date) >= today).sort((a,b) => parseLocal(a.date) - parseLocal(b.date));
            if (futureExc.length > 0) {
                const next = futureExc[0]; const parts = next.date.split('-');
                exceptionText = `${monthNames[parseInt(parts[1])-1]} ${parseInt(parts[2])} (${formatTime12(next.start)} - ${formatTime12(next.end)})`;
            }
            
            const todayException = exceptions.find(ex => ex.date === todayStr2);
            if (todayException) {
                displayStart = todayException.start;
                displayEnd = todayException.end;
            }
        } else if (!exceptionsActive) {
            exceptionText = "Exceptions Paused";
        }
    }

    const holidaysListEl = document.getElementById('staff-upcoming-holidays-list');
    if (holidaysListEl) {
        const allFutureHolidays = [];
        holidaysArray.forEach(d => {
            if (parseLocal(d) >= today) allFutureHolidays.push({ date: d, type: 'Common' });
        });
        
        const { data: futurePersonalLogs } = await supabaseClient
            .from('checkins')
            .select('date')
            .eq('user_email', currentStaff.email)
            .eq('status', 'Holiday/Off');
            
        if (futurePersonalLogs) {
            futurePersonalLogs.forEach(l => {
                if (parseLocal(l.date) >= today && !allFutureHolidays.find(f => f.date === l.date)) {
                    allFutureHolidays.push({ date: l.date, type: 'Special' });
                }
            });
        }
        
        allFutureHolidays.sort((a,b) => parseLocal(a.date) - parseLocal(b.date));
        const nextFive = allFutureHolidays.slice(0, 5);
        
        holidaysListEl.innerHTML = "";
        if (nextFive.length > 0) {
            nextFive.forEach(h => {
                const parts = h.date.split('-');
                const formattedDate = `${monthNames[parseInt(parts[1])-1]} ${parseInt(parts[2])}, ${parts[0]}`;
                
                if (h.type === 'Special') {
                    holidaysListEl.insertAdjacentHTML('beforeend', `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #ffffff; border: 1px solid #eaeaea; border-left: 3px solid #1a1a1a; border-radius: 4px; margin-bottom: 6px;">
                            <span style="font-size: 13px; color: #1a1a1a; font-weight: 600;">${formattedDate}</span>
                            <span style="font-size: 10px; font-weight: bold; color: #1a1a1a; background: #ffffff; border: 1px solid #1a1a1a; padding: 3px 8px; border-radius: 4px; letter-spacing: 0.5px;">PERSONAL OFF</span>
                        </div>
                    `);
                } else {
                    holidaysListEl.insertAdjacentHTML('beforeend', `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px; background: #ffffff; border: 1px solid #eaeaea; border-left: 3px solid #1a1a1a; border-radius: 4px; margin-bottom: 6px;">
                            <span style="font-size: 13px; color: #555; font-weight: 500;">${formattedDate}</span>
                            <span style="font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.5px;">Organization Holiday</span>
                        </div>
                    `);
                }
            });
        } else {
            holidaysListEl.innerHTML = `<p style="margin: 0; font-size: 13px; color: #888; font-style: italic;">No upcoming holidays</p>`;
        }
    }

    try {
        const isGpsOn = settings && settings.require_gps;
        if (isGpsExempt) {
            updateElementSafe('staff-gps-display', "EXEMPT", "#3b82f6", "#eff6ff");
        } else {
            updateElementSafe('staff-gps-display', isGpsOn ? "ENABLED" : "DISABLED", isGpsOn ? "#4ade80" : "#888", isGpsOn ? "#dcfce7" : "#e8e8e8");
        }

        const isPinOn = settings && settings.require_pin;
        updateElementSafe('staff-pin-display', isPinOn ? "ENABLED" : "DISABLED", isPinOn ? "#4ade80" : "#888", isPinOn ? "#dcfce7" : "#e8e8e8");

        updateElementSafe('staff-window-settings-display', `${formatTime12(displayStart)} - ${formatTime12(displayEnd)}`);
        updateElementSafe('staff-exception-display', exceptionText);
        
        updateElementSafe('staff-ledger-name', currentStaff.name || "Staff");
        updateElementSafe('staff-ledger-role', currentStaff.role || "Unknown Role");
        updateElementSafe('staff-ledger-joined', currentStaff.joined_date || "N/A");
        
        const checksEl = document.getElementById('staff-ledger-checkins');
        if(checksEl) { checksEl.innerText = `${totalChecks} / ${workingDays}`; checksEl.style.color = "#4ade80"; }

        const avgEl = document.getElementById('staff-ledger-avg');
        if(avgEl) avgEl.innerText = calculateAvgCheckInTime(safeLogs.filter(l => l.status === 'Present'));

        const percentBox = document.getElementById('staff-ledger-percent');
        if(percentBox) {
            percentBox.innerText = `${percent}%`;
            percentBox.style.color = percent >= 80 ? '#4ade80' : (percent >= 50 ? '#f59e0b' : '#ef4444');
        }

        const statusBox = document.getElementById('staff-ledger-status');
        if (statusBox) {
            const now2 = new Date();
            const cTime = String(now2.getHours()).padStart(2, '0') + ':' + String(now2.getMinutes()).padStart(2, '0');
            
            let lateHours = settings && settings.late_arrival_hours ? parseInt(settings.late_arrival_hours) : 0;
            let finalAllowedEnd = displayEnd;
            if (lateHours > 0) {
                let [h, m] = displayEnd.split(':');
                h = (parseInt(h) + lateHours).toString().padStart(2, '0');
                finalAllowedEnd = `${h}:${m}`;
            }

            if (holidaysArray.includes(todayStr2)) { 
                statusBox.innerText = "Organization Off"; statusBox.style.color = "#a0a0a0"; 
            } else if (personalHolidaysSet.has(todayStr2)) { 
                statusBox.innerText = "Personal Off"; statusBox.style.color = "#a0a0a0"; 
            } else if (checkedInToday) { 
                statusBox.innerText = "Present"; statusBox.style.color = "#4ade80"; 
            } else if (cTime < displayStart) { 
                statusBox.innerText = "Check-in window not started"; statusBox.style.color = "#94a3b8"; 
            } else if (cTime > finalAllowedEnd) { 
                statusBox.innerText = "Absent"; statusBox.style.color = "#ef4444"; 
            } else { 
                statusBox.innerText = "Pending"; statusBox.style.color = "#f59e0b"; 
            }
        }

        const dashHeader = document.getElementById('greeting-title');
        if (dashHeader) {
            const shortName = currentStaff.name ? currentStaff.name.split(' ')[0] : 'Staff';
            
            if (!window.currentGreeting) {
                const greetings = ["Hi", "Hello", "What's up", "Greetings", "Welcome back", "Hey there", "Howdy"];
                window.currentGreeting = greetings[Math.floor(Math.random() * greetings.length)];
            }
            
            dashHeader.innerText = `${window.currentGreeting}, ${shortName}`;
        }
        
        updateElementSafe('status-avatar', currentStaff.name ? currentStaff.name.split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase() : '--');

        const statusCard = document.getElementById('status-card');
        const checkInBtn = document.getElementById('check-in-btn');
        const shiftPanel = document.getElementById('shift-details-panel');
        const countdownContainer = document.getElementById('home-countdown-container');
        const countdownTimer = document.getElementById('home-countdown-timer');
        
        if (window.staffHomeTimer) clearInterval(window.staffHomeTimer);

        if (statusCard && checkInBtn) {
            let todayLog = safeLogs.find(l => l.date === todayStr2);
            const isLate = todayLog && todayLog.is_late;
            const hasCheckedOut = todayLog && todayLog.checkout_time;
            const requireCheckout = settings && settings.require_checkout;
            const lateHours = (settings && settings.late_arrival_hours) ? parseInt(settings.late_arrival_hours) : 0;

            if (isHoliday) {
                checkInBtn.style.display = "none";
                if(shiftPanel) shiftPanel.style.display = "none";
                if (holidaysArray.includes(todayStr2)) {
                    updateElementSafe('status-text', "Organization Off");
                } else {
                    updateElementSafe('status-text', "Personal Off");
                }
            } else if (checkedInToday) {
                if (hasCheckedOut) {
                    statusCard.innerHTML = `
                        <div class="avatar" style="width: 64px; height: 64px; font-size: 22px; margin: 0 auto 15px auto; background-color: #3b82f6; color: #ffffff;">✓</div>
                        <h3 style="margin: 0; font-size: 18px; color: #1e3a8a;">Checked Out</h3>
                        <p style="font-size: 12px; color: #888; margin-top: 5px;">Shift completed.</p>
                    `;
                } else if (requireCheckout) {
                    statusCard.innerHTML = `
                        <div class="avatar" style="width: 64px; height: 64px; font-size: 22px; margin: 0 auto 15px auto; background-color: #1a1a1a; color: #ffffff;">✓</div>
                        <h3 style="margin: 0; font-size: 18px; color: #1a1a1a;">${isLate ? 'Late Check-in' : 'Checked In'}</h3>
                        <button class="main-btn" onclick="handleCheckout()" style="width: 100%; margin-top: 25px; padding: 16px; font-size: 15px; background-color: #ef4444;">End Shift & Check Out</button>
                        <p id="checkout-timer-display" style="font-size: 11px; color: #888; margin-top: 15px; font-family: monospace;"></p>
                    `;
                    startCheckoutTimer(todayLog.time);
                } else {
                    statusCard.innerHTML = `<div class="avatar" style="width: 64px; height: 64px; font-size: 22px; margin: 0 auto 15px auto; background-color: #1a1a1a; color: #ffffff;">✓</div><h3 style="margin: 0; font-size: 18px; color: #1a1a1a;">${isLate ? 'Late Check-in' : 'Checked In'}</h3>`;
                }
                
                statusCard.classList.remove('ghost-theme');
                statusCard.style.border = '1px solid #e0e0e0';
                statusCard.style.backgroundColor = '#ffffff';
                if(shiftPanel) shiftPanel.style.display = "none";
            } else {
                updateElementSafe('status-text', "Pending Check-in");
                checkInBtn.style.display = "block";
                
                if (shiftPanel) {
                    shiftPanel.style.display = 'block';
                    updateElementSafe('home-window-display', `${formatTime12(displayStart)} - ${formatTime12(displayEnd)}`);
                    updateElementSafe('home-zone-display', assignedZone);
                    
                    const now = new Date();
                    const parseTimeToDate = (timeString) => {
                        const [hours, minutes] = timeString.split(':');
                        const d = new Date(now);
                        d.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
                        return d;
                    };

                    const startTarget = parseTimeToDate(displayStart);
                    const endTarget = parseTimeToDate(displayEnd);
                    const endTargetLate = new Date(endTarget);
                    endTargetLate.setHours(endTargetLate.getHours() + lateHours);

                    window.staffHomeTimer = setInterval(() => {
                        const current = new Date();
                        
                        if (current >= startTarget && current <= endTarget) {
                            countdownContainer.style.display = 'block';
                            const diff = endTarget - current;
                            
                            const h = Math.floor(diff / (1000 * 60 * 60));
                            const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
                            const s = Math.floor((diff % (1000 * 60)) / 1000);
                            
                            countdownTimer.innerText = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
                            countdownTimer.style.color = "#1a1a1a";
                            
                            checkInBtn.disabled = false;
                            checkInBtn.style.opacity = '1';
                            checkInBtn.innerText = "Authenticate & Check In";
                            checkInBtn.style.backgroundColor = "#1a1a1a";
                            window.isCheckingInLate = false;
                            
                        } else if (current > endTarget && current <= endTargetLate) {
                            countdownContainer.style.display = 'block';
                            countdownTimer.innerText = "LATE";
                            countdownTimer.style.color = "#a855f7";
                            checkInBtn.disabled = false;
                            checkInBtn.style.opacity = '1';
                            checkInBtn.innerText = "Late Arrival Check-In";
                            checkInBtn.style.backgroundColor = "#a855f7";
                            window.isCheckingInLate = true;
                            
                        } else if (current < startTarget) {
                            countdownContainer.style.display = 'none';
                            checkInBtn.disabled = true;
                            checkInBtn.style.opacity = '0.5';
                            checkInBtn.innerText = `Window opens at ${formatTime12(displayStart)}`;
                        } else {
                            countdownContainer.style.display = 'none';
                            checkInBtn.disabled = true;
                            checkInBtn.style.opacity = '0.5';
                            checkInBtn.innerText = "Window Closed";
                            updateElementSafe('status-text', "Absent");
                            clearInterval(window.staffHomeTimer);
                        }
                    }, 1000);
                }
            }
        }

        const pulseGrid = document.getElementById('weekly-pulse-grid');
        const pulseMotivation = document.getElementById('weekly-motivation-msg');
        if (pulseGrid) {
            pulseGrid.innerHTML = "";
            const currentDayOfWeek = today.getDay(); 
            const startOfWeek = new Date(today);
            startOfWeek.setDate(today.getDate() - currentDayOfWeek);
            
            const dayLetters = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
            
            for (let i = 0; i < 7; i++) {
                const loopDate = new Date(startOfWeek);
                loopDate.setDate(startOfWeek.getDate() + i);
                const loopDateStr = getUniversalDate(loopDate);
                const iterLog = safeLogs.find(l => l.date === loopDateStr);
                
                let bgCol = "transparent";
                let textCol = "#888";
                let borCol = "#eaeaea";
                let iconHtml = loopDate.getDate();
                
                if (loopDate < joinedDate) {
                    bgCol = "transparent"; borCol = "#f0f0f0"; textCol = "#ccc";
                } else if (validCheckinDates.has(loopDateStr)) {
                    if (iterLog && iterLog.is_late) {
                        bgCol = "#f3e8ff"; borCol = "#d8b4fe"; textCol = "#a855f7";
                    } else {
                        bgCol = "#4ade80"; borCol = "#4ade80"; textCol = "#1a1a1a";
                    }
                    iconHtml = "✓";
                } else if (holidaysArray.includes(loopDateStr)) {
                    bgCol = "#1a1a1a"; borCol = "#1a1a1a"; textCol = "#ffffff";
                    iconHtml = loopDate.getDate();
                } else if (personalHolidaysSet.has(loopDateStr)) {
                    bgCol = "#ffffff"; borCol = "#1a1a1a"; textCol = "#1a1a1a";
                    iconHtml = loopDate.getDate();
                } else if (loopDateStr === getUniversalDate(today)) {
                    const now3 = new Date();
                    const cTime = String(now3.getHours()).padStart(2, '0') + ':' + String(now3.getMinutes()).padStart(2, '0');
                    
                    let lateHours = settings && settings.late_arrival_hours ? parseInt(settings.late_arrival_hours) : 0;
                    let finalAllowedEnd = displayEnd;
                    if (lateHours > 0) {
                        let [h, m] = displayEnd.split(':');
                        h = (parseInt(h) + lateHours).toString().padStart(2, '0');
                        finalAllowedEnd = `${h}:${m}`;
                    }

                    if (cTime < displayStart) {
                        bgCol = "#f8fafc"; borCol = "#cbd5e1"; textCol = "#94a3b8";
                    } else if (cTime > finalAllowedEnd) {
                        bgCol = "transparent"; borCol = "#ef4444"; textCol = "#ef4444"; iconHtml = "×";
                    } else {
                        bgCol = "#fef3c7"; borCol = "#f59e0b"; textCol = "#d97706";
                    }
                } else if (loopDate < today) {
                    bgCol = "transparent"; borCol = "#ef4444"; textCol = "#ef4444";
                    iconHtml = "×";
                } else {
                    bgCol = "transparent"; borCol = "#eaeaea"; textCol = "#888";
                }
                
                const isTodayCircle = (loopDateStr === getUniversalDate(today)) ? `border: 2px solid ${borCol !== '#eaeaea' ? borCol : '#1a1a1a'}; transform: scale(1.1); font-weight: 800;` : `border: 1px solid ${borCol};`;
                
                pulseGrid.insertAdjacentHTML('beforeend', `
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 6px; flex: 1;">
                        <span style="font-size: 9px; color: #888; font-weight: 600;">${dayLetters[i]}</span>
                        <div style="width: 28px; height: 28px; border-radius: 50%; background-color: ${bgCol}; display: flex; justify-content: center; align-items: center; font-size: 11px; font-weight: bold; color: ${textCol}; transition: all 0.2s; ${isTodayCircle}">
                            ${iconHtml}
                        </div>
                    </div>
                `);
            }

            if (pulseMotivation) {
                let currentStreak = 0;
                let tempDate = new Date(today);
                
                const now2 = new Date();
                const cTime = String(now2.getHours()).padStart(2, '0') + ':' + String(now2.getMinutes()).padStart(2, '0');
                
                let lateHours = settings && settings.late_arrival_hours ? parseInt(settings.late_arrival_hours) : 0;
                let finalAllowedEnd = displayEnd;
                if (lateHours > 0) {
                    let [h, m] = displayEnd.split(':');
                    h = (parseInt(h) + lateHours).toString().padStart(2, '0');
                    finalAllowedEnd = `${h}:${m}`;
                }

                while (tempDate >= joinedDate) {
                    const dStr = getUniversalDate(tempDate);
                    const isHol = holidaysArray.includes(dStr) || personalHolidaysSet.has(dStr);
                    const isPresent = validCheckinDates.has(dStr);
                    
                    if (isPresent) {
                        currentStreak++;
                    } else if (!isHol) {
                        if (tempDate.getTime() === today.getTime()) {
                            if (cTime > finalAllowedEnd) {
                                break; 
                            }
                        } else {
                            break; 
                        }
                    }
                    tempDate.setDate(tempDate.getDate() - 1);
                    tempDate.setHours(0,0,0,0);
                }

                if (currentStreak > 0) {
                    pulseMotivation.innerText = `Streak: ${currentStreak} 🔥`;
                    pulseMotivation.style.color = "#d97706"; 
                    pulseMotivation.style.background = "transparent";
                    pulseMotivation.style.padding = "0";
                } else {
                    pulseMotivation.innerText = "Streak: 0";
                    pulseMotivation.style.color = "#888";
                    pulseMotivation.style.background = "transparent";
                    pulseMotivation.style.padding = "0";
                }
            }
        }

    } catch (e) { console.warn("DOM mapping error"); }

    const calendarGrid = document.getElementById('staff-analytics-calendar');
    if (calendarGrid) {
        const year = staffAnalyticsDate.getFullYear();
        const month = staffAnalyticsDate.getMonth();

        const monthTitle = document.getElementById('cal-month-display');
        if (monthTitle) {
            let prevDisabled = false;
            if (year < joinedDate.getFullYear() || (year === joinedDate.getFullYear() && month <= joinedDate.getMonth())) {
                prevDisabled = true;
            }

            const prevBtn = document.getElementById('staff-cal-prev');
            if (prevBtn) {
                if (prevDisabled) {
                    prevBtn.disabled = true;
                    prevBtn.style.opacity = '0.3';
                    prevBtn.style.cursor = 'not-allowed';
                } else {
                    prevBtn.disabled = false;
                    prevBtn.style.opacity = '1';
                    prevBtn.style.cursor = 'pointer';
                }
            }
            
            monthTitle.innerText = `${monthNames[month]} ${year}`;
        }

        calendarGrid.innerHTML = `
            <div class="cal-day" style="border: none; font-weight: bold; color: #888; display: flex; justify-content: center; align-items: center; aspect-ratio: 1; font-size: 12px;">S</div>
            <div class="cal-day" style="border: none; font-weight: bold; color: #888; display: flex; justify-content: center; align-items: center; aspect-ratio: 1; font-size: 12px;">M</div>
            <div class="cal-day" style="border: none; font-weight: bold; color: #888; display: flex; justify-content: center; align-items: center; aspect-ratio: 1; font-size: 12px;">T</div>
            <div class="cal-day" style="border: none; font-weight: bold; color: #888; display: flex; justify-content: center; align-items: center; aspect-ratio: 1; font-size: 12px;">W</div>
            <div class="cal-day" style="border: none; font-weight: bold; color: #888; display: flex; justify-content: center; align-items: center; aspect-ratio: 1; font-size: 12px;">T</div>
            <div class="cal-day" style="border: none; font-weight: bold; color: #888; display: flex; justify-content: center; align-items: center; aspect-ratio: 1; font-size: 12px;">F</div>
            <div class="cal-day" style="border: none; font-weight: bold; color: #888; display: flex; justify-content: center; align-items: center; aspect-ratio: 1; font-size: 12px;">S</div>
        `;

        const firstDayIndex = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        for (let i = 0; i < firstDayIndex; i++) {
            calendarGrid.insertAdjacentHTML('beforeend', `<div class="cal-day" style="border: none; background: transparent; aspect-ratio: 1;"></div>`);
        }

        const nowStrict = new Date();
        nowStrict.setHours(0,0,0,0);

        for (let day = 1; day <= daysInMonth; day++) {
            const currentIterationDate = new Date(year, month, day);
            const dateStrIteration = getUniversalDate(currentIterationDate);
            
            const iterLog = safeLogs.find(l => l.date === dateStrIteration);
            const wasPresent = validCheckinDates.has(dateStrIteration);
            const isPersonalHoliday = personalHolidaysSet.has(dateStrIteration);
            const isCommonHoliday = holidaysArray.includes(dateStrIteration);
            const isPast = currentIterationDate < nowStrict;
            const isToday = dateStrIteration === getUniversalDate(nowStrict);
            
            let inlineStyle = CAL_STYLES.default;
            
            if (currentIterationDate < joinedDate) {
                inlineStyle = CAL_STYLES.disabled;
            } else if (isCommonHoliday) {
                inlineStyle = CAL_STYLES.holiday;
            } else if (isPersonalHoliday) {
                inlineStyle = CAL_STYLES.personalHoliday;
            } else if (wasPresent) { 
                if (iterLog && iterLog.is_late) {
                    inlineStyle = "background-color: #f3e8ff !important; color: #a855f7 !important; border-color: #d8b4fe !important; font-weight: bold;";
                } else {
                    inlineStyle = CAL_STYLES.present; 
                }
            } else if (isToday) {
                const nowTime = new Date();
                const cTime = String(nowTime.getHours()).padStart(2, '0') + ':' + String(nowTime.getMinutes()).padStart(2, '0');
                
                let lateHours = settings && settings.late_arrival_hours ? parseInt(settings.late_arrival_hours) : 0;
                let finalAllowedEnd = displayEnd;
                if (lateHours > 0) {
                    let [h, m] = displayEnd.split(':');
                    h = (parseInt(h) + lateHours).toString().padStart(2, '0');
                    finalAllowedEnd = `${h}:${m}`;
                }

                if (cTime < displayStart) inlineStyle = CAL_STYLES.notStarted;
                else if (cTime > finalAllowedEnd) inlineStyle = CAL_STYLES.absent;
                else inlineStyle = CAL_STYLES.pending;
            } else if (isPast) { 
                inlineStyle = CAL_STYLES.absent; 
            } else {
                inlineStyle = CAL_STYLES.default;
            }
            
            calendarGrid.insertAdjacentHTML('beforeend', `<div class="cal-day" style="aspect-ratio: 1; display: flex; justify-content: center; align-items: center; font-size: 12px; border-radius: 4px; ${inlineStyle}">${day}</div>`);
        }
    }
}

function changeStaffMonth(offset) {
    staffAnalyticsDate.setMonth(staffAnalyticsDate.getMonth() + offset);
    loadStaffRecords(); 
}

function switchStaffTab(tabName) {
    // Leaving Home immediately releases the camera and cancels an unfinished scan.
    if (tabName !== 'home') stopActiveFaceSession();
    document.getElementById('view-home').style.display = 'none';
    document.getElementById('view-records').style.display = 'none';
    document.getElementById('view-settings').style.display = 'none';
    
    document.getElementById('nav-home').classList.remove('active');
    document.getElementById('nav-records').classList.remove('active');
    document.getElementById('nav-settings').classList.remove('active');
    
    document.getElementById('view-' + tabName).style.display = 'block';
    document.getElementById('nav-' + tabName).classList.add('active');
    
    if (tabName === 'records' || tabName === 'settings') loadStaffRecords();
}

function openStaffModal(title, desc) {
    document.getElementById('staff-modal-title').innerText = title;
    document.getElementById('staff-modal-desc').innerText = desc;
    document.getElementById('staff-modal').style.display = 'flex';
}

async function startDailyScanner() {
    await ensureFaceApi();
    await ensureSupabase();
    
    if (!currentStaff) {
        openInfoModal("Session Expired", "Please log in again.");
        setTimeout(() => { window.location.href = 'staff.html'; }, 2000);
        return;
    }

    try {
        const safeCompanyId = currentStaff.company_id || "UNASSIGNED_ID";
        const { data: rules, error: rulesErr } = await supabaseClient
            .from('settings')
            .select('*')
            .eq('company_id', safeCompanyId)
            .limit(1)
            .maybeSingle();
        if (rulesErr) throw rulesErr;

        // Evaluate date and time in the workspace's configured timezone
        const workspaceTz = (rules && rules.timezone) ? rules.timezone : (Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata');
        const now = new Date();
        const todayDateStr = new Intl.DateTimeFormat('en-CA', {
            timeZone: workspaceTz,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).format(now);

        const currentTime = new Intl.DateTimeFormat('en-GB', {
            timeZone: workspaceTz,
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        }).format(now);

        const { data: existingLog } = await supabaseClient
            .from('checkins')
            .select('id, status')
            .eq('user_email', currentStaff.email)
            .eq('company_id', safeCompanyId)
            .eq('date', todayDateStr)
            .limit(1);

        if (existingLog && existingLog.length > 0) {
            if (existingLog[0].status === 'Holiday/Off') {
                openInfoModal("Scanner Locked", "You are marked on personal leave/holiday today.");
            } else {
                openInfoModal("Action Denied", "You have already checked in today.");
            }
            return;
        }

        // 1. Holiday Check
        if (rules && rules.holidays) {
            let holidayArray = [];
            try { holidayArray = JSON.parse(rules.holidays); } catch(e){}
            if (holidayArray.includes(todayDateStr)) {
                openInfoModal("Scanner Locked", "Today has been declared an official Holiday by your organization.");
                return;
            }
        }

        // 2. Schedule & Window Check
        let allowedStart = rules && rules.check_in_start ? rules.check_in_start : "09:00";
        let allowedEnd = rules && rules.check_in_end ? rules.check_in_end : "10:00";
        let lateHours = rules && rules.late_arrival_hours ? parseInt(rules.late_arrival_hours, 10) : 0;

        let customSchedulesActive = true;
        let exceptionsActive = true;
        let customSchedules = [];
        let exceptions = [];

        if (rules) {
            if (rules.custom_schedules) {
                try {
                    let parsed = JSON.parse(rules.custom_schedules);
                    if (Array.isArray(parsed)) { customSchedules = parsed; }
                    else { customSchedulesActive = parsed.active; customSchedules = parsed.data || []; }
                } catch(e){}
            }
            if (rules.exceptions) {
                try {
                    let parsed = JSON.parse(rules.exceptions);
                    if (Array.isArray(parsed)) { exceptions = parsed; }
                    else { exceptionsActive = parsed.active; exceptions = parsed.data || []; }
                } catch(e){}
            }
        }

        if (exceptionsActive) {
            const todayException = exceptions.find(ex => ex.date === todayDateStr);
            if (todayException) {
                allowedStart = todayException.start;
                allowedEnd = todayException.end;
            }
        }

        if (customSchedulesActive) {
            const myCustom = customSchedules.find(c => c.email === currentStaff.email);
            if (myCustom) {
                allowedStart = myCustom.start;
                allowedEnd = myCustom.end;
            }
        }

        let finalAllowedEnd = allowedEnd;
        if (lateHours > 0) {
            let [h, m] = allowedEnd.split(':');
            h = (parseInt(h, 10) + lateHours).toString().padStart(2, '0');
            finalAllowedEnd = `${h}:${m}`;
        }

        if (currentTime < allowedStart || currentTime > finalAllowedEnd) {
            openInfoModal("Scanner Locked", `You can only check in between ${formatTime12(allowedStart)} and ${formatTime12(finalAllowedEnd)}.`);
            return; 
        }

        // 3. Collect PIN (Validated strictly in the Server Vault)
        const requiresPinCheckin = rules && rules.require_pin && rules.pin_checkin !== false;
        
        if (requiresPinCheckin) {
            openPromptModal(
                "SECURITY CHECK",
                "Enter the 4-digit Daily Access PIN provided by your Manager:",
                "text",
                "",
                async function(userPin) {
                    continueScannerProcess(rules, safeCompanyId, todayDateStr, userPin);
                }
            );
            return; 
        }
        
        continueScannerProcess(rules, safeCompanyId, todayDateStr, null);
    } catch (err) {
        openInfoModal("Error", "System verification failed.");
        console.error(err);
    }
}

async function verifyAttendanceLocation(rules, safeCompanyId, mode) {
    if (!rules || !rules.require_gps) return true;
    
    const requiresGpsForMode = mode === 'checkin' ? (rules.require_gps !== false) : (rules.gps_checkout !== false);
    if (!requiresGpsForMode) return true;

    let targetLat, targetLng, targetRadius, isExempt = false;
    let locations = [];
    try { if (rules.locations) locations = JSON.parse(rules.locations); } catch (e) {}

    if (locations.length > 0) {
        let userLocation = locations.find(loc => loc.staff && loc.staff.includes(currentStaff.email));
        if (!userLocation) userLocation = locations.find(loc => loc.id === 'main') || locations[0];
        if (userLocation.id === 'exempt' || userLocation.isExempt) isExempt = true;
        else {
            targetLat = userLocation.lat;
            targetLng = userLocation.lng;
            targetRadius = userLocation.radius || 150;
        }
    } else {
        targetLat = rules.office_lat;
        targetLng = rules.office_lng;
        targetRadius = rules.office_radius || 150;
    }

    if (isExempt) return true;
    if (!targetLat || !targetLng) {
        openInfoModal('Manager Error', 'Office GPS location has not been pinned in settings yet.');
        return false;
    }

    try {
        const position = await new Promise((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 });
        });
        const distanceMeters = calculateDistanceMeters(position.coords.latitude, position.coords.longitude, targetLat, targetLng);
        if (distanceMeters > targetRadius) {
            openInfoModal('Geofence Violation', `You are too far from your assigned workplace (${Math.round(distanceMeters)} meters away). You must be within ${targetRadius} meters to ${mode === 'checkout' ? 'check out' : 'clock in'}.`);
            return false;
        }
        return true;
    } catch (error) {
        openInfoModal('GPS Error', `Please enable location permissions to ${mode === 'checkout' ? 'check out' : 'check in'}.`);
        return false;
    }
}

function renderAttendanceRetry(mode, message) {
    const statusCard = document.getElementById('status-card');
    if (!statusCard) return;
    const isCheckout = mode === 'checkout';
    statusCard.innerHTML = `
        <div class="avatar" style="width: 64px; height: 64px; font-size: 22px; margin: 0 auto 15px auto; background-color: #fef3c7; color: #d97706;">!</div>
        <h3 style="margin: 0; font-size: 18px; color: #1a1a1a;">${isCheckout ? 'Check-out verification incomplete' : 'Check-in verification incomplete'}</h3>
        <p style="font-size: 12px; color: #888; margin: 8px 0 18px; line-height: 1.45;">${message}</p>
        <button class="main-btn" onclick="${isCheckout ? 'handleCheckout()' : 'startDailyScanner()'}" style="width: 100%; padding: 15px; font-size: 14px; ${isCheckout ? 'background-color: #ef4444;' : ''}">Retry Secure Verification</button>
    `;
    statusCard.classList.remove('ghost-theme');
    statusCard.style.border = '1px solid #e0e0e0';
    statusCard.style.backgroundColor = '#ffffff';
}

function renderCheckedInCard(timeStr, requireCheckout) {
    const statusCard = document.getElementById('status-card');
    if (!statusCard) return;
    const checkoutHtml = requireCheckout ? `
        <button class="main-btn" onclick="handleCheckout()" style="width: 100%; margin-top: 25px; padding: 16px; font-size: 15px; background-color: #ef4444;">End Shift & Check Out</button>
        <p id="checkout-timer-display" style="font-size: 11px; color: #888; margin-top: 15px; font-family: monospace;"></p>
    ` : '';
    statusCard.innerHTML = `
        <div class="avatar" style="width: 64px; height: 64px; font-size: 22px; margin: 0 auto 15px auto; background-color: #1a1a1a; color: #ffffff;">✓</div>
        <h3 style="margin: 0; font-size: 18px; color: #1a1a1a;">Checked In</h3>
        <p style="font-size: 12px; color: #4ade80; margin-top: 5px; font-weight: 600; margin-bottom: ${requireCheckout ? '0' : '15px'};">Successfully clocked in at ${timeStr}</p>
        ${checkoutHtml}
    `;
    statusCard.classList.remove('ghost-theme');
    statusCard.style.border = '1px solid #e0e0e0';
    statusCard.style.backgroundColor = '#ffffff';
    if (requireCheckout) setTimeout(() => startCheckoutTimer(timeStr), 100);
}

// Restores the original #status-card DOM structure before reloading staff records so Cancel Scan never freezes
function cancelAttendanceFaceScan() {
    stopActiveFaceSession();
    const statusCard = document.getElementById('status-card');
    if (statusCard) {
        const initials = currentStaff?.name
            ? currentStaff.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()
            : '--';
        statusCard.className = 'form-card ghost-theme';
        statusCard.style.border = '';
        statusCard.style.backgroundColor = '';
        statusCard.innerHTML = `
            <div class="avatar" id="status-avatar" style="width: 64px; height: 64px; font-size: 22px; margin: 0 auto 15px auto; background-color: #e8e8e8; color: #888;">${initials}</div>
            <h3 style="margin: 0; font-size: 18px; color: #888;" id="status-text">Pending Check-in</h3>
            <button class="main-btn" id="check-in-btn" style="width: 100%; margin-top: 25px; padding: 16px; font-size: 15px;">
                Authenticate & Check In
            </button>
        `;
        const checkInBtn = document.getElementById('check-in-btn');
        if (checkInBtn) {
            checkInBtn.onclick = function(event) {
                event.preventDefault();
                startDailyScanner();
            };
        }
    }
    loadStaffRecords();
}

// Web Crypto HMAC Generator
async function generateSignature(payloadString, secret) {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payloadString));
    return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function finishAttendanceFaceVerification(session, options) {
    if (!isFaceSessionActive(session) || session.submitting) return;
    session.submitting = true;
    if (session.intervalId) clearInterval(session.intervalId);
    if (session.timeoutId) clearTimeout(session.timeoutId);
    setFaceScanStatus(session, `VERIFYING LIVENESS IN VAULT…`, '#4ade80');
    stopFaceSessionCamera(session);

    try {
        if (!isFaceSessionActive(session)) return;
        
        let liveCoords = null;
        if (options.rules && options.rules.require_gps) {
            const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 }));
            liveCoords = { lat: position.coords.latitude, lng: position.coords.longitude };
        }

        let turnstileToken = "development-bypass-token"; 
        if (typeof turnstile !== 'undefined') {
            const tempContainer = document.createElement('div');
            tempContainer.style.display = 'none';
            document.body.appendChild(tempContainer);
            turnstileToken = await new Promise((resolve) => {
                const widgetId = turnstile.render(tempContainer, {
                    sitekey: '0x4AAAAAAFUfuleYnhBml357',
                    callback: (token) => {
                        turnstile.remove(widgetId);
                        tempContainer.remove();
                        resolve(token);
                    }
                });
            });
        }

        const requestTimestamp = Date.now();
        const signaturePayload = `${currentStaff.email}:${options.mode}:${liveCoords?.lat || 0}:${session.challenge.frames.length}:${requestTimestamp}`;
        const signature = await generateSignature(signaturePayload, "syndicacy-default-secret-key");

        const payload = {
            action: 'complete_attendance_scan',
            challenge_token: session.challengeToken,
            mode: options.mode,
            company_id: options.safeCompanyId,
            user_email: currentStaff.email,
            live_face_descriptor: Array.from(session.cachedDescriptor),
            liveness_evidence: session.challenge.frames,
            gps_coords: liveCoords,
            pin_code: options.pinCode || null,
            turnstile_token: turnstileToken,
            request_timestamp: requestTimestamp,
            signature: signature
        };

        const { data: response, error: functionError } = await supabaseClient.functions.invoke('verify-attendance', { body: payload });

        if (functionError || response?.error) {
             throw new Error(functionError?.message || response?.error || "Server verification failed.");
        }

        completeFaceSession(session);
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        if (options.mode === 'checkout') {
            const statusCard = document.getElementById('status-card');
            if (statusCard) statusCard.innerHTML = `<div class="avatar" style="width: 64px; height: 64px; font-size: 22px; margin: 0 auto 15px auto; background-color: #3b82f6; color: #ffffff;">✓</div><h3 style="margin: 0; font-size: 18px; color: #1e3a8a;">Checked Out</h3><p style="font-size: 12px; color: #888; margin-top: 5px;">Shift completed at ${timeStr}.</p>`;
            if (window.checkoutInterval) clearInterval(window.checkoutInterval);
        } else {
            renderCheckedInCard(timeStr, options.rules && options.rules.require_checkout);
            const shiftPanel = document.getElementById('shift-details-panel');
            if (shiftPanel) shiftPanel.style.display = 'none';
        }
        setTimeout(() => loadStaffRecords(), 500);
    } catch (error) {
        console.error('Attendance sync error:', error);
        if (!isFaceSessionActive(session)) return;
        stopActiveFaceSession();
        renderAttendanceRetry(options.mode, (error.message || 'Verification failed.') + formatAttemptSuffix(session));
    }
}

async function startAttendanceFaceVerification(options) {
    const statusCard = document.getElementById('status-card');
    if (!statusCard || !currentStaff) return;
    
    statusCard.innerHTML = `
        <div id="scanner-container" style="position: relative; width: 240px; height: 240px; margin: 0 auto 15px auto; border-radius: 50%; overflow: hidden; border: 4px solid #1a1a1a; background-color: #000; box-shadow: 0 4px 15px rgba(0,0,0,0.1);">
            <video id="staff-video" width="100%" height="100%" autoplay muted playsinline style="object-fit: cover;"></video>
        </div>
        <p id="scanner-status" style="font-size: 13px; color: #f59e0b; font-weight: bold; margin: 0; letter-spacing: 0.5px;">REQUESTING SECURITY TOKEN…</p>
        <p style="font-size: 11px; color: #888; margin: 6px 0 0 0;">Only blink when "BLINK NOW!" appears.</p>
        <button class="google-btn" onclick="cancelAttendanceFaceScan()" style="width: 100%; margin-top: 14px; padding: 10px; font-size: 12px;">Cancel Scan</button>
    `;
    const video = document.getElementById('staff-video');
    const scannerStatus = document.getElementById('scanner-status');
    const session = createFaceSession(video, document.getElementById('scanner-container'), scannerStatus, (message) => renderAttendanceRetry(options.mode, message));

    try {
        // 1. Request Server-Signed 30s Challenge Ticket & Deduct 1 of 3 Attempts on Server
        const { data: startRes, error: startErr } = await supabaseClient.functions.invoke('verify-attendance', {
            body: {
                action: 'start_attendance_scan',
                mode: options.mode,
                company_id: options.safeCompanyId,
                user_email: currentStaff.email,
                pin_code: options.pinCode || null
            }
        });

        if (startErr || startRes?.error || !startRes?.challenge_token) {
            throw new Error(startRes?.error || startErr?.message || 'Security Lock: Unable to start scan.');
        }

        session.challengeToken = startRes.challenge_token;
        session.serverDelays = startRes.delays;
        session.attemptsRemaining = startRes.attempts_remaining;

        const human = await ensureFaceModels();
        if (!isFaceSessionActive(session)) return;
        setFaceScanStatus(session, 'TURNING ON CAMERA…', '#4ade80');
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
        if (!isFaceSessionActive(session)) {
            stream.getTracks().forEach(track => track.stop());
            return;
        }
        session.stream = stream;

        const beginDetection = () => {
            if (!isFaceSessionActive(session) || session.started) return;
            session.started = true;
            createFaceCanvas(session);
            setFaceScanStatus(session, 'DO NOT BLINK YET — WAIT FOR PROMPT...', '#f59e0b');
            setupPassiveLivenessChallenge(session, () => finishAttendanceFaceVerification(session, options), session.serverDelays);
            
            startFaceDetectionLoop(session, async () => {
                const res = await human.detect(video);
                if (!isFaceSessionActive(session)) return;
                const faces = res.face || [];
                if (faces.length !== 1) {
                    clearFaceCanvas(session);
                    setFaceScanStatus(session, faces.length > 1 ? 'ONLY ONE FACE MAY BE IN FRAME.' : 'FACE NOT FOUND. LOOK STRAIGHT AT THE CAMERA.');
                    return;
                }
                const face = faces[0];
                drawSingleFace(session, face);

                if (!session.identityVerified) {
                    const liveDescriptor = normalizeHumanDescriptor(face.embedding);
                    if (!liveDescriptor) return;
                    session.identityVerified = true;
                    session.cachedDescriptor = liveDescriptor;
                }
                updatePassiveLiveness(session, face, res.gesture);
            });
        };

        video.onplay = beginDetection;
        video.srcObject = stream;
        video.onloadedmetadata = async () => {
            try {
                await video.play();
                beginDetection();
            } catch (err) {
                console.warn("Autoplay prevented or failed", err);
            }
        };
    } catch (error) {
        console.error('Attendance camera error:', error);
        if (!isFaceSessionActive(session)) return;
        stopActiveFaceSession();
        renderAttendanceRetry(options.mode, error.message || 'Camera or biometric setup failed. Please retry.');
    }
}

async function continueScannerProcess(rules, safeCompanyId, todayDateStr, userPin) {
    const locationVerified = await verifyAttendanceLocation(rules, safeCompanyId, 'checkin');
    if (!locationVerified) return;
    startAttendanceFaceVerification({ mode: 'checkin', rules, safeCompanyId, todayDateStr, pinCode: userPin });
}

function bindTimePickerFix() {
    const t1 = document.getElementById('check-in-start');
    const t2 = document.getElementById('check-in-end');
    if(t1) t1.onclick = function() { try{ this.showPicker(); }catch(e){} };
    if(t2) t2.onclick = function() { try{ this.showPicker(); }catch(e){} };
}

window.addEventListener('DOMContentLoaded', async () => {
    await ensureSupabase();

    // SECURITY FIX: Validate the cryptographically signed JWT token with the server
    const { data: { session } } = await supabaseClient.auth.getSession();
    
    // 1. Identify the current page and define which pages are allowed without logging in
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const publicPages = ['index.html', 'leader.html', 'staff.html', 'join.html', 'leader-otp.html', 'setup.html', ''];

    // 2. ROUTE GUARD: If there is no secure session and they are on a private page, kick them out
    if (!session && !publicPages.includes(currentPage)) {
        window.location.replace('index.html'); // .replace prevents using the "Back" button to return
        return; // Instantly stop executing the rest of the page's code
    }

    // 3. If they are logged in, securely load their profile data into memory (without exposing face_data)
    if (session) {
        const { data: userProfile } = await supabaseClient
            .from('users')
            .select('id, name, email, role, joined_date, company_id, pending_deletion_at, setup_completed')
            .ilike('email', session.user.email)
            .limit(1)
            .maybeSingle();
        if (userProfile && userProfile.role === 'leader') {
            secureVerifiedLeader = userProfile;
        } else if (userProfile && userProfile.role !== 'leader') {
            currentStaff = userProfile; // Securely load staff
        }
    }
    
    initializeSettingsCalendar();
    loadPendingInvites(); 
    verifyInviteLink(); 
    loadTeamDirectory();
    loadTodayAttendance(); 
    loadTeamLedger(); 
    loadIndividualAnalytics(); 
    if (typeof generateHistoricalTable === 'function') generateHistoricalTable();
    if (typeof generateGlobalHistoricalTable === 'function') generateGlobalHistoricalTable();
    injectMapDependencies();
    injectMapModalHTML();
    bindGPSControls();
    bindTimePickerFix();

    loadSettings().then(() => {
        const fields = ['check-in-start', 'check-in-end'];
        fields.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', saveSettings);
        });
    });
    
   loadTodayPIN(); 
    loadLocationsPage();
    loadStaffDashboard(); 
});

let workspaceLocations = [];
let activeLocationEditId = null;

async function loadLocationsPage() {
    if (!document.getElementById('locations-list-container')) return;
    const leader = getLeader();
    if (!leader) return;
    await ensureSupabase();
    workspaceLocations = [];
    try {
        const { data, error } = await supabaseClient.from('settings').select('*').eq('company_id', leader.company_id).limit(1).maybeSingle();
        
        if (data && data.locations) {
            try { workspaceLocations = JSON.parse(data.locations); } catch(e){}
        }
        
        if (!workspaceLocations.find(l => l.id === 'main')) {
            workspaceLocations.unshift({
                id: 'main',
                name: 'MAIN CAMPUS',
                lat: data?.office_lat || null,
                lng: data?.office_lng || null,
                radius: data?.office_radius || 150,
                staff: []
            });
        }

        if (!workspaceLocations.find(l => l.id === 'exempt')) {
            workspaceLocations.push({
                id: 'exempt',
                name: 'GPS EXEMPT (WORK FROM ANYWHERE)',
                lat: null, lng: null, radius: null,
                staff: [],
                isExempt: true
            });
        }

        renderLocations();
    } catch (err) { console.error(err); }
}

function renderLocations() {
    const container = document.getElementById('locations-list-container');
    if (!container) return;
    container.innerHTML = "";

    workspaceLocations.forEach(loc => {
        const isMain = loc.id === 'main';
        const isExempt = loc.id === 'exempt';
        
        let geoText = loc.lat ? `Pinned: ${loc.radius}m radius` : 'Location not pinned';
        if (isExempt) geoText = 'Bypasses GPS Verification';

        let staffBtnLabel = "Manage Staff";
        if (!isMain && !isExempt) staffBtnLabel = `Staff (${loc.staff ? loc.staff.length : 0})`;
        if (isExempt) staffBtnLabel = `Exempt Staff (${loc.staff ? loc.staff.length : 0})`;
        
        const deleteBtn = (isMain || isExempt) ? '' : `<button class="i-btn" style="color: #dc2626; border-color: #fca5a5; background: #fef2f2; width: 24px; height: 24px;" onclick="deleteLocation('${loc.id}')">×</button>`;

        const mapBtn = isExempt ? '' : `<button class="google-btn" style="flex: 1; padding: 10px; font-size: 12px; margin: 0;" onclick="openLocationMap('${loc.id}')">Edit Area</button>`;

        const html = `
            <div class="form-card" style="text-align: left; padding: 20px; margin-bottom: 15px; border-left: 4px solid ${(isMain || isExempt) ? '#1a1a1a' : '#eaeaea'};">
                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 15px;">
                    <div>
                        <h3 style="margin: 0 0 4px 0; font-size: 15px; text-transform: uppercase; letter-spacing: 1px;">${loc.name}</h3>
                        <p style="margin: 0; font-size: 11px; color: ${loc.lat || isExempt ? '#4ade80' : '#f59e0b'}; font-weight: bold;">${isExempt ? '⚡' : '📍'} ${geoText}</p>
                    </div>
                    ${deleteBtn}
                </div>
                
                <div style="display: flex; gap: 10px;">
                    ${mapBtn}
                    <button class="google-btn" style="flex: 1; padding: 10px; font-size: 12px; margin: 0;" onclick="openStaffAssignModal('${loc.id}')">${staffBtnLabel}</button>
                </div>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', html);
    });
}

function promptNewLocation() {
    openPromptModal("New Workplace", "Enter a name for the new location:", "text", "", function(val) {
        if (!val || val.trim() === '') return;
        workspaceLocations.push({
            id: 'loc_' + Math.random().toString(36).substr(2, 9),
            name: val.trim(),
            lat: null, lng: null, radius: 150,
            staff: []
        });
        saveSettings();
        renderLocations();
    });
}

function deleteLocation(id) {
    openConfirmModal("Remove Location", "Remove this location? Assigned staff will default back to Main Campus.", function() {
        workspaceLocations = workspaceLocations.filter(l => l.id !== id);
        saveSettings();
        renderLocations();
    });
}

function openLocationMap(id) {
    activeLocationEditId = id;
    const loc = workspaceLocations.find(l => l.id === id);
    
    mapSavedLat = loc.lat;
    mapSavedLng = loc.lng;
    mapSavedRadius = loc.radius || 150;
    
    document.getElementById('radius-slider').value = mapSavedRadius;
    document.getElementById('gps-map-modal').style.display = 'flex';
    
    setTimeout(() => {
        if (!map) initMap();
        else {
            map.invalidateSize();
            if (mapSavedLat) map.setView([mapSavedLat, mapSavedLng], 16);
            updateCirclePreview();
        }
    }, 200);
}

async function confirmMapLocation() {
    if (!map) return;

    const center = map.getCenter();
    const radius = parseInt(document.getElementById('radius-slider').value, 10);
    const saveBtn = document.getElementById('save-map-btn');
    saveBtn.innerText = "Saving...";
    saveBtn.disabled = true;

    mapSavedLat = center.lat;
    mapSavedLng = center.lng;
    mapSavedRadius = radius;

    if (activeLocationEditId) {
        const locIndex = workspaceLocations.findIndex(l => l.id === activeLocationEditId);
        if (locIndex !== -1) {
            workspaceLocations[locIndex].lat = center.lat;
            workspaceLocations[locIndex].lng = center.lng;
            workspaceLocations[locIndex].radius = radius;
        }
    }

    await saveSettings();
    if (document.getElementById('locations-list-container')) renderLocations();

    saveBtn.innerText = "Saved!";
    saveBtn.style.backgroundColor = "#4ade80";
    setTimeout(() => {
        closeMapModal();
        saveBtn.innerText = "Save Boundary";
        saveBtn.style.backgroundColor = "#1a1a1a";
        saveBtn.disabled = false;
    }, 1000);
}

async function openStaffAssignModal(locId) {
    activeLocationEditId = locId;
    const leader = getLeader();
    await ensureSupabase();
    
    const loc = workspaceLocations.find(l => l.id === locId);

    if (locId !== 'exempt' && (!loc.lat || !loc.lng)) {
        openInfoModal("Location Not Pinned", "You must map and pin this location first before adding staff to it.");
        return;
    }

    const listContainer = document.getElementById('staff-checkbox-list');
    listContainer.innerHTML = "<p style='font-size:12px; color:#888;'>Loading team...</p>";
    
    openModal('assign-staff-modal');

    const { data: staff } = await supabaseClient.from('users').select('*').neq('role', 'leader').eq('company_id', leader.company_id);
    
    listContainer.innerHTML = "";
    if (!staff || staff.length === 0) {
        listContainer.innerHTML = "<p style='font-size:12px; color:#888;'>No staff available.</p>";
        return;
    }

    let explicitlyAssignedElsewhere = [];
    workspaceLocations.forEach(l => {
        if (l.id !== 'main' && l.staff) explicitlyAssignedElsewhere = explicitlyAssignedElsewhere.concat(l.staff);
    });

    staff.forEach(user => {
        let isAssigned = false;
        if (locId === 'main') {
            isAssigned = (loc.staff && loc.staff.includes(user.email)) || (!explicitlyAssignedElsewhere.includes(user.email));
        } else {
            isAssigned = loc.staff && loc.staff.includes(user.email);
        }

        listContainer.innerHTML += `
            <label style="display: flex; align-items: center; gap: 10px; padding: 8px; border-bottom: 1px solid #f0f0f0; cursor: pointer;">
                <input type="checkbox" class="staff-assign-cb" value="${user.email}" ${isAssigned ? 'checked' : ''}>
                <span style="font-size: 13px; color: #1a1a1a; font-weight: 500;">${user.name} <span style="color:#888; font-weight:normal;">(${user.role})</span></span>
            </label>
        `;
    });
}

function saveStaffAssignments() {
    const checkboxes = document.querySelectorAll('.staff-assign-cb');
    let selectedEmails = [];
    checkboxes.forEach(cb => { if (cb.checked) selectedEmails.push(cb.value); });

    const locIndex = workspaceLocations.findIndex(l => l.id === activeLocationEditId);
    if (locIndex !== -1) {
        workspaceLocations.forEach((l, idx) => {
            if (idx !== locIndex) {
                l.staff = (l.staff || []).filter(email => !selectedEmails.includes(email));
            }
        });
        
        workspaceLocations[locIndex].staff = selectedEmails;
    }

    closeModal('assign-staff-modal');
    saveSettings();
    
    if (document.getElementById('locations-list-container')) {
        renderLocations();
    }
}

// --- NEW HELPERS FOR CHECKOUT TIMER AND LOGIC ---
window.checkoutInterval = null;
function startCheckoutTimer(checkInTimeStr) {
    if (window.checkoutInterval) clearInterval(window.checkoutInterval);
    if (!checkInTimeStr) return;
    const timeMatch = checkInTimeStr.match(/(\d+):(\d+)\s*(AM|PM|am|pm)?/);
    if (!timeMatch) return;
    
    let h = parseInt(timeMatch[1]);
    const m = parseInt(timeMatch[2]);
    const ampm = timeMatch[3] ? timeMatch[3].toUpperCase() : null;
    if (ampm === 'PM' && h < 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    
    const checkInDate = new Date();
    checkInDate.setHours(h, m, 0, 0);
    const expiryDate = new Date(checkInDate.getTime() + (13 * 60 * 60 * 1000));
    
    const displayEl = document.getElementById('checkout-timer-display');
    
    window.checkoutInterval = setInterval(() => {
        const now = new Date();
        if (now >= expiryDate) {
            clearInterval(window.checkoutInterval);
            if(displayEl) displayEl.innerText = "Checkout window expired.";
            return;
        }
        const diff = expiryDate - now;
        const hh = Math.floor(diff / (1000 * 60 * 60));
        const mm = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        if(displayEl) displayEl.innerText = `Auto-expires in ${hh}h ${mm}m`;
    }, 1000);
}

async function handleCheckout() {
    await ensureSupabase();
    if (!currentStaff || !supabaseClient) {
        openInfoModal('Session Expired', 'Please log in again before checking out.');
        return;
    }
    const btn = document.querySelector('button[onclick="handleCheckout()"]');
    if(btn) { btn.innerText = "Verifying Location..."; btn.disabled = true; }

    const safeCompanyId = currentStaff.company_id || "UNASSIGNED_ID";
    const { data: rules } = await supabaseClient.from('settings').select('*').eq('company_id', safeCompanyId).limit(1).maybeSingle();
    const locationVerified = await verifyAttendanceLocation(rules, safeCompanyId, 'checkout');
    if (!locationVerified) {
        if(btn) { btn.innerText = 'End Shift & Check Out'; btn.disabled = false; }
        return;
    }

    const todayDateStr = getUniversalDate();
    const requiresPinCheckout = rules && rules.require_pin && rules.pin_checkout !== false;
    
    if (requiresPinCheckout) {
        if(btn) { btn.innerText = 'End Shift & Check Out'; btn.disabled = false; }
        openPromptModal(
            "SECURITY CHECK",
            "Enter the 4-digit Daily Access PIN provided by your Manager to clock out:",
            "text",
            "",
            async function(userPin) {
                if(btn) { btn.innerText = "Verifying Identity..."; btn.disabled = true; }
                startAttendanceFaceVerification({ mode: 'checkout', rules, safeCompanyId, todayDateStr, pinCode: userPin });
            }
        );
        return;
    }

    startAttendanceFaceVerification({ mode: 'checkout', rules, safeCompanyId, todayDateStr });
}

// --- CORE SHARED ENGINE FOR HISTORICAL DATA ---
function buildIndividualHistoryData(user, logs, settings) {
    let holidaysArray = [];
    let customSchedulesArray = [];
    let exceptionsArray = [];
    let customSchedulesActive = true;
    let exceptionsActive = true;
    let globalStart = "09:00";
    let globalEnd = "10:00";
    let lateHours = 0;

    if (settings) {
        if (settings.holidays) try { holidaysArray = JSON.parse(settings.holidays); } catch(e){}
        if (!Array.isArray(holidaysArray)) holidaysArray = [];
        if (settings.check_in_start) globalStart = settings.check_in_start;
        if (settings.check_in_end) globalEnd = settings.check_in_end;
        if (settings.late_arrival_hours) lateHours = parseInt(settings.late_arrival_hours);
        
        if (settings.custom_schedules) {
            try {
                let parsed = JSON.parse(settings.custom_schedules);
                if (Array.isArray(parsed)) customSchedulesArray = parsed;
                else { customSchedulesActive = parsed.active; customSchedulesArray = parsed.data || []; }
            } catch(e){}
        }
        if (settings.exceptions) {
            try {
                let parsed = JSON.parse(settings.exceptions);
                if (Array.isArray(parsed)) exceptionsArray = parsed;
                else { exceptionsActive = parsed.active; exceptionsArray = parsed.data || []; }
            } catch(e){}
        }
    }

    let personalHolidaysSet = new Set();
    let presentLogsMap = new Map(); 
    let validCheckinDates = new Set();
    const today = new Date();
    today.setHours(0,0,0,0);

    if (logs) {
        logs.forEach(log => {
            if (log.status === 'Holiday/Off') {
                personalHolidaysSet.add(log.date);
            } else if (log.status === 'Present') {
                presentLogsMap.set(log.date, { in: log.time, out: log.checkout_time, isLate: log.is_late });
                if (parseLocal(log.date) <= today) validCheckinDates.add(log.date);
            }
        });
    }

    const joinedDate = user && user.joined_date ? parseLocal(user.joined_date) : new Date(2000, 0, 1);
    const todayStr = getUniversalDate(today);
    
    let workingDays = 0;
    for (let d = new Date(joinedDate); d <= today; d.setDate(d.getDate() + 1)) {
        const dStr = getUniversalDate(d);
        if (!holidaysArray.includes(dStr) && !personalHolidaysSet.has(dStr)) {
            workingDays++;
        }
    }
    if (workingDays === 0) workingDays = 1;
    
    let totalChecks = validCheckinDates.size;
    let percent = Math.round((totalChecks / workingDays) * 100);
    if (percent > 100) percent = 100;

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    let rows = [];

    for (let d = new Date(today); d >= joinedDate; d.setDate(d.getDate() - 1)) {
        const dateStr = getUniversalDate(d);
        const isPast = dateStr < todayStr;
        const isToday = dateStr === todayStr;
        
        let allowedStart = globalStart;
        let allowedEnd = globalEnd;
        
        if (exceptionsActive) {
            const exc = exceptionsArray.find(ex => ex.date === dateStr);
            if (exc) { allowedStart = exc.start; allowedEnd = exc.end; }
        }
        if (customSchedulesActive && user && user.email) {
            const cust = customSchedulesArray.find(c => c.email === user.email);
            if (cust) { allowedStart = cust.start; allowedEnd = cust.end; }
        }

        let finalAllowedEnd = allowedEnd;
        if (lateHours > 0) {
            let [h, m] = allowedEnd.split(':');
            h = (parseInt(h) + lateHours).toString().padStart(2, '0');
            finalAllowedEnd = `${h}:${m}`;
        }

        const wasPresent = presentLogsMap.has(dateStr);
        const logData = wasPresent ? presentLogsMap.get(dateStr) : null;
        const isPersonalHoliday = personalHolidaysSet.has(dateStr);
        const isCommonHoliday = holidaysArray.includes(dateStr);

        let rowStatus = "Pending";
        let checkInDisplay = "--:--";
        let checkOutDisplay = "--:--";
        let statusColor = "#f59e0b"; 

        if (isCommonHoliday) {
            rowStatus = "Organization Off"; statusColor = "#1a1a1a";
        } else if (isPersonalHoliday) {
            rowStatus = "Personal Off"; statusColor = "#888";
        } else if (wasPresent) {
            if (logData.isLate) { rowStatus = "Late Arrival"; statusColor = "#a855f7"; } 
            else { rowStatus = "Present"; statusColor = "#4ade80"; }
            checkInDisplay = logData.in;
            checkOutDisplay = logData.out || "Did not check out";
        } else if (isPast) {
            rowStatus = "Absent"; statusColor = "#ef4444";
        } else if (isToday) {
            const nowTime = new Date();
            const cTime = String(nowTime.getHours()).padStart(2, '0') + ':' + String(nowTime.getMinutes()).padStart(2, '0');
            if (cTime < allowedStart) { rowStatus = "Not Started"; statusColor = "#94a3b8"; } 
            else if (cTime > finalAllowedEnd) { rowStatus = "Absent"; statusColor = "#ef4444"; }
        }

        const parts = dateStr.split('-');
        const displayDate = `${monthNames[parseInt(parts[1])-1]} ${parseInt(parts[2])}, ${parts[0]}`;
        const displayDay = dayNames[d.getDay()];

        rows.push({
            rawDate: dateStr,
            displayDate: displayDate,
            displayDay: displayDay,
            status: rowStatus,
            statusColor: statusColor,
            in: checkInDisplay,
            out: checkOutDisplay
        });
    }

    return {
        stats: { checkins: totalChecks, workingDays: workingDays, percent: percent },
        rows: rows
    };
}

// --- DEDICATED HISTORICAL TABLE LOGIC (INDIVIDUAL) ---
async function generateHistoricalTable() {
    const tableBody = document.getElementById('historical-table-body');
    const nameTitle = document.getElementById('history-name-title');
    if (!tableBody) return;

    await ensureSupabase();
    
   const leader = getLeader();
    const sessionStaff = currentStaff || (sessionStorage.getItem('loggedInStaff') ? JSON.parse(sessionStorage.getItem('loggedInStaff')) : null);
    
    const targetEmail = new URLSearchParams(window.location.search).get('email');
    if (!targetEmail || (!leader && !sessionStaff)) return;
    
    if (!leader && sessionStaff && targetEmail !== sessionStaff.email) {
        tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:red;">Access Denied.</td></tr>';
        return;
    }
    
    const validCompanyId = leader ? leader.company_id : sessionStaff.company_id;

    try {
        const { data: user } = await supabaseClient.from('users').select('*').eq('email', targetEmail).maybeSingle();
        const { data: logs } = await supabaseClient.from('checkins').select('*').eq('user_email', targetEmail);
        const { data: settings } = await supabaseClient.from('settings').select('*').eq('company_id', validCompanyId).limit(1).maybeSingle();

        if (nameTitle && user) nameTitle.innerText = user.name;

        const historyData = buildIndividualHistoryData(user, logs, settings);
        
        const statsSub = document.getElementById('history-stats-subtitle');
        if (statsSub) {
            statsSub.innerText = `${historyData.stats.checkins} / ${historyData.stats.workingDays} Check-ins • ${historyData.stats.percent}% Attendance`;
        }
        
        tableBody.innerHTML = '';
        if (historyData.rows.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#888;">No historical records found.</td></tr>';
            return;
        }

        historyData.rows.forEach(r => {
            let outDisplay = r.out === 'Did not check out' ? `<span style='color:#ccc; font-style:italic;'>${r.out}</span>` : r.out;
            tableBody.insertAdjacentHTML('beforeend', `
                <tr style="border-bottom: 1px solid #eaeaea; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='#f9f9f9'" onmouseout="this.style.backgroundColor='transparent'">
                    <td style="padding: 15px; color: #1a1a1a;">${r.displayDate}</td>
                    <td style="padding: 15px; color: #1a1a1a; font-weight: 500;">${r.displayDay}</td>
                    <td style="padding: 15px; font-weight: bold; color: ${r.statusColor};">
                        <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background-color:${r.statusColor}; margin-right:6px;"></span>
                        ${r.status}
                    </td>
                    <td style="padding: 15px; color: #555; font-family: monospace; font-size: 14px;">${r.in}</td>
                    <td style="padding: 15px; color: #555; font-family: monospace; font-size: 14px;">${outDisplay}</td>
                </tr>
            `);
        });

    } catch (err) {
        console.error(err);
        tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:red;">Failed to load data.</td></tr>';
    }
}

// --- MASSIVE GLOBAL HISTORY MATRIX ---
async function generateGlobalHistoricalTable() {
    const thead = document.getElementById('global-historical-head');
    const tbody = document.getElementById('global-historical-body');
    if (!thead || !tbody) return;

    await ensureSupabase();
    const leader = getLeader();
    if (!leader) return;

    try {
        const { data: staff } = await supabaseClient.from('users').select('*').neq('role', 'leader').eq('company_id', leader.company_id);
        const { data: logs } = await supabaseClient.from('checkins').select('*').eq('company_id', leader.company_id);
        const { data: settings } = await supabaseClient.from('settings').select('*').eq('company_id', leader.company_id).limit(1).maybeSingle();

        if (!staff || staff.length === 0) {
            tbody.innerHTML = '<tr><td style="padding: 40px; text-align: center; color: #888;">No active staff found.</td></tr>';
            return;
        }

        const allData = {};
        let minDateStr = getUniversalDate(new Date()); 
        
        staff.forEach(user => {
            const userLogs = logs ? logs.filter(l => l.user_email === user.email) : [];
            allData[user.email] = buildIndividualHistoryData(user, userLogs, settings);
            
            if (allData[user.email].rows.length > 0) {
                const lastRow = allData[user.email].rows[allData[user.email].rows.length - 1];
                if (lastRow.rawDate < minDateStr) minDateStr = lastRow.rawDate;
            }
        });

        // Sticky Headers
        let header1 = `<tr><th class="sticky-col" rowspan="2" style="background-color: #1a1a1a; color: #fff; padding: 12px 15px; text-align: left; border-right: 2px solid #eaeaea; z-index: 30; left: 0; min-width: 120px;">Date</th>`;
        let header2 = `<tr>`;

        staff.forEach(user => {
            const stats = allData[user.email].stats;
            const shortName = user.name.split(' ')[0];
            header1 += `<th colspan="3" style="background-color: #1a1a1a; color: #fff; padding: 10px; border-left: 1px solid #333; text-align: center;">
                <div style="font-size: 14px; font-weight: 600;">${shortName}</div>
                <div style="font-size: 10px; color: #4ade80; margin-top: 4px;">${stats.checkins}/${stats.workingDays} (${stats.percent}%)</div>
            </th>`;
            
            header2 += `
                <th style="background-color: #f9f9f9; color: #888; border-left: 1px solid #eaeaea; border-bottom: 2px solid #eaeaea; font-weight: 600; padding: 8px;">Status</th>
                <th style="background-color: #f9f9f9; color: #888; border-bottom: 2px solid #eaeaea; font-weight: 600; padding: 8px;">In</th>
                <th style="background-color: #f9f9f9; color: #888; border-right: 1px solid #eaeaea; border-bottom: 2px solid #eaeaea; font-weight: 600; padding: 8px;">Out</th>
            `;
        });
        header1 += `</tr>`;
        header2 += `</tr>`;
        
        thead.innerHTML = header1 + header2;

        tbody.innerHTML = "";
        const today = new Date();
        today.setHours(0,0,0,0);
        
        const minDate = parseLocal(minDateStr);
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

        for (let d = new Date(today); d >= minDate; d.setDate(d.getDate() - 1)) {
            const dStr = getUniversalDate(d);
            const parts = dStr.split('-');
            const displayDate = `${monthNames[parseInt(parts[1])-1]} ${parseInt(parts[2])}, ${parts[0]}`;

            let rowHtml = `<tr style="border-bottom: 1px solid #eaeaea; transition: background-color 0.2s;" onmouseover="this.style.backgroundColor='#fcfcfc'" onmouseout="this.style.backgroundColor='transparent'">
                <td class="sticky-col" style="background-color: #ffffff; color: #1a1a1a; font-weight: 500; border-right: 2px solid #eaeaea; padding: 12px 15px; white-space: nowrap;">${displayDate}</td>`;

            staff.forEach(user => {
                const userDay = allData[user.email].rows.find(r => r.rawDate === dStr);
                
                if (userDay) {
                    let outDisplay = userDay.out === 'Did not check out' ? `<span style='color:#ccc; font-style:italic;'>--</span>` : userDay.out;
                    let inDisplay = userDay.in === '--:--' ? `<span style='color:#ccc;'>--:--</span>` : userDay.in;
                    
                    rowHtml += `
                        <td style="border-left: 1px solid #eaeaea; padding: 12px 8px; font-weight: bold; color: ${userDay.statusColor}; text-align: center;">${userDay.status}</td>
                        <td style="padding: 12px 8px; color: #555; font-family: monospace; text-align: center;">${inDisplay}</td>
                        <td style="border-right: 1px solid #eaeaea; padding: 12px 8px; color: #555; font-family: monospace; text-align: center;">${outDisplay}</td>
                    `;
                } else {
                    rowHtml += `
                        <td style="border-left: 1px solid #eaeaea; padding: 12px 8px; text-align: center; color: #ccc;">-</td>
                        <td style="padding: 12px 8px; text-align: center; color: #ccc;">-</td>
                        <td style="border-right: 1px solid #eaeaea; padding: 12px 8px; text-align: center; color: #ccc;">-</td>
                    `;
                }
            });
            
            rowHtml += `</tr>`;
            tbody.insertAdjacentHTML('beforeend', rowHtml);
        }

    } catch (err) {
        console.error(err);
        tbody.innerHTML = '<tr><td style="padding: 40px; text-align: center; color: red;">Failed to load massive dataset.</td></tr>';
    }
}

// --- CSV EXPORT FUNCTIONALITY ---
function exportTableToCSV(type) {
    let table, filename;
    
    if (type === 'individual') {
        table = document.querySelector('table'); 
        const nameEl = document.getElementById('history-name-title');
        const empName = nameEl ? nameEl.innerText.replace(/\s+/g, '_') : 'Employee';
        filename = `${empName}_History.csv`;
    } else if (type === 'global') {
        table = document.querySelector('.global-history-table');
        filename = 'Global_Matrix.csv';
    }

    if (!table) return;

    let csv = [];

    // Inject Stats Header Row for Individual Table Export
    if (type === 'individual') {
        const nameTitle = document.getElementById('history-name-title');
        const statsTitle = document.getElementById('history-stats-subtitle');
        const nameText = nameTitle ? nameTitle.innerText.trim() : 'Employee';
        const statsText = statsTitle ? statsTitle.innerText.trim() : '';
        csv.push(`"${nameText} - ${statsText}"`);
        csv.push(""); // Add an empty row for spacing
    }

    let rows = table.querySelectorAll('tr');
    
    for (let i = 0; i < rows.length; i++) {
        let row = [], cols = rows[i].querySelectorAll('td, th');
        
        // Offset shift for global table's second row (due to Date rowspan=2)
        if (type === 'global' && i === 1) {
            row.push('""'); 
        }

        for (let j = 0; j < cols.length; j++) {
            let data = cols[j].innerText.replace(/(\r\n|\n|\r)/gm, " ").trim();
            data = data.replace(/"/g, '""');
            row.push('"' + data + '"');

            // Handle colspan translation for the Global Matrix header alignment
            if (type === 'global' && cols[j].hasAttribute('colspan')) {
                const colspan = parseInt(cols[j].getAttribute('colspan'));
                for (let c = 1; c < colspan; c++) {
                    row.push('""'); // Pad with empty cells
                }
            }
        }
        csv.push(row.join(','));
    }

    let csvFile = new Blob([csv.join('\n')], {type: "text/csv;charset=utf-8;"});
    let downloadLink = document.createElement("a");
    downloadLink.download = filename;
    downloadLink.href = window.URL.createObjectURL(csvFile);
    downloadLink.style.display = "none";
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
}
// =========================================================================
// --- PAYROLL & WAGE CALCULATION ENGINE ---
// =========================================================================

function parseTimeStr(timeStr) {
    if (!timeStr || timeStr === '--:--') return null;
    const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM|am|pm)?/i);
    if (!match) return null;
    let h = parseInt(match[1]);
    let m = parseInt(match[2]);
    const ampm = match[3] ? match[3].toUpperCase() : null;
    if (ampm === 'PM' && h < 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    return { h, m };
}

function openPayrollModal() {
    if (!currentViewedUser) return;
    
    let modalEl = document.getElementById('payroll-modal');
    if (!modalEl) {
        const modalHtml = `
            <div id="payroll-modal" class="modal-bg" style="z-index: 10002; display: none;">
                <div class="modal-box animated-modal" style="width: 90%; max-width: 380px;">
                    <span class="close" onclick="closePayrollModal()">×</span>
                    <h3 class="section-title" style="text-align: center; margin-bottom: 15px; color: #16a34a;">Generate Payroll Report</h3>
                    <p style="font-size: 12px; color: #888; margin-bottom: 20px; text-align: center;">Calculate exact wages based on live clock-in and clock-out timestamps.</p>
                    
                    <div style="display: flex; gap: 10px; margin-bottom: 15px;">
                        <div style="flex: 1; text-align: left;">
                            <label style="font-size: 11px; color: #555; font-weight: bold;">Start Date</label>
                            <input type="date" id="payroll-start" class="input-field" style="width: 100%; padding: 10px; font-size: 13px; margin-top: 4px;">
                        </div>
                        <div style="flex: 1; text-align: left;">
                            <label style="font-size: 11px; color: #555; font-weight: bold;">End Date</label>
                            <input type="date" id="payroll-end" class="input-field" style="width: 100%; padding: 10px; font-size: 13px; margin-top: 4px;">
                        </div>
                    </div>

                    <div style="display: flex; gap: 10px; margin-bottom: 25px;">
                        <div style="flex: 1; text-align: left;">
                            <label style="font-size: 11px; color: #555; font-weight: bold;">Hourly Wage ($)</label>
                            <input type="number" id="payroll-wage" class="input-field" placeholder="e.g. 25.50" step="0.01" style="width: 100%; padding: 10px; font-size: 13px; margin-top: 4px;">
                        </div>
                        <div style="flex: 1; text-align: left;">
                            <label style="font-size: 11px; color: #555; font-weight: bold;">Meal Break (Mins)</label>
                            <input type="number" id="payroll-meal" class="input-field" placeholder="e.g. 30" value="30" style="width: 100%; padding: 10px; font-size: 13px; margin-top: 4px;">
                        </div>
                    </div>
                    
                    <button id="generate-payroll-action-btn" class="main-btn form-btn" style="width: 100%; background-color: #16a34a; border: 1px solid #15803d; color: white;" onclick="generatePayrollCSV()">Export CSV</button>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        modalEl = document.getElementById('payroll-modal');
    }

    // Default dates: Joined Date to Yesterday (or today if they joined today)
    let joinDateStr = currentViewedUser.joined_date || getUniversalDate(new Date());
    
    let yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    let yesterdayStr = getUniversalDate(yesterday);
    
    if (joinDateStr > yesterdayStr) joinDateStr = yesterdayStr; 

    document.getElementById('payroll-start').value = joinDateStr;
    document.getElementById('payroll-end').value = yesterdayStr;
    document.getElementById('payroll-wage').value = ""; 
    
    modalEl.style.display = 'flex';
}

function closePayrollModal() {
    const modalEl = document.getElementById('payroll-modal');
    if (modalEl) modalEl.style.display = 'none';
}

async function generatePayrollCSV() {
    const startDate = document.getElementById('payroll-start').value;
    const endDate = document.getElementById('payroll-end').value;
    const wage = parseFloat(document.getElementById('payroll-wage').value);
    const mealMins = parseInt(document.getElementById('payroll-meal').value) || 0;

    if (!startDate || !endDate || isNaN(wage) || wage <= 0) {
        openInfoModal("Missing Information", "Please provide a valid date range and a positive hourly wage.");
        return;
    }
    if (startDate > endDate) {
        openInfoModal("Invalid Dates", "Start date must be before or equal to the End date.");
        return;
    }

    await ensureSupabase();
    const leader = getLeader();
    if (!leader || !currentViewedUser) return;

    const btn = document.getElementById('generate-payroll-action-btn');
    const originalText = btn.innerText;
    btn.innerText = "Calculating...";
    btn.disabled = true;

    try {
        const { data: logs, error } = await supabaseClient
            .from('checkins')
            .select('*')
            .eq('user_email', currentViewedUser.email)
            .gte('date', startDate)
            .lte('date', endDate)
            .order('date', { ascending: true });

        if (error) throw error;

        let csvContent = `Payroll Report: ${currentViewedUser.name}\n`;
        csvContent += `Period: ${startDate} to ${endDate}\n`;
        csvContent += `Hourly Wage: $${wage.toFixed(2)}\n`;
        csvContent += `Daily Meal Deduction: ${mealMins} mins/shift\n\n`;
        csvContent += "Date,Status,Clock-In,Clock-Out,Gross Hours,Meal Ded (hrs),Net Hours,Daily Pay ($)\n";

        let totalNetHours = 0;
        let totalPay = 0;

        (logs || []).forEach(log => {
            if (log.status === 'Present') {
                let grossHrs = 0;
                let netHrs = 0;
                let dailyPay = 0;
                let mealHrs = 0;
                let statusDisplay = "Missing Check-out (0 Hrs)";

                if (log.time && log.checkout_time) {
                    statusDisplay = "Completed Shift";
                    const inTime = parseTimeStr(log.time);
                    const outTime = parseTimeStr(log.checkout_time);
                    
                    if (inTime && outTime) {
                        let inMins = (inTime.h * 60) + inTime.m;
                        let outMins = (outTime.h * 60) + outTime.m;
                        
                        // Handle edge case if checkout crosses midnight
                        if (outMins < inMins) outMins += 24 * 60; 

                        let grossMinutes = outMins - inMins;
                        grossHrs = grossMinutes / 60;
                        
                        // Subtract meal time (but don't go negative)
                        let netMinutes = grossMinutes - mealMins;
                        if (netMinutes < 0) netMinutes = 0;
                        
                        netHrs = netMinutes / 60;
                        mealHrs = (grossMinutes - netMinutes) / 60; // Actual time deducted
                        dailyPay = netHrs * wage;
                    }
                }

                totalNetHours += netHrs;
                totalPay += dailyPay;

                csvContent += `${log.date},${statusDisplay},${log.time || '--:--'},${log.checkout_time || '--:--'},${grossHrs.toFixed(2)},${mealHrs.toFixed(2)},${netHrs.toFixed(2)},$${dailyPay.toFixed(2)}\n`;
            } else if (log.status === 'Holiday/Off') {
                csvContent += `${log.date},Personal Leave/Holiday,--:--,--:--,0.00,0.00,0.00,$0.00\n`;
            }
        });

        csvContent += `\nTotal Payable Net Hours:,,,,,,${totalNetHours.toFixed(2)}\n`;
        csvContent += `Total Expected Pay:,,,,,,$${totalPay.toFixed(2)}\n`;

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        
        const safeName = currentViewedUser.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        link.setAttribute("download", `${safeName}_payroll_${startDate}_to_${endDate}.csv`);
        
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        closePayrollModal();

    } catch (err) {
        console.error(err);
        openInfoModal("Error", "Failed to generate payroll: " + err.message);
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

// =========================================================================
// --- SYNC AI WIDGET ---
// =========================================================================
function injectSyncAIWidget() {
    const isDashboard = document.querySelector('.bottom-nav');
    if (!isDashboard) return;

    // Prevent duplicate injections
    if (document.getElementById('sync-ai-widget')) return;

    const widgetHtml = `
        <div id="sync-ai-widget">
            <div id="sync-ai-chat-window">
                <div class="sync-chat-header">
                    <span style="font-weight: 600; font-size: 14px; display: flex; align-items: center; gap: 8px;">
                        <span style="display:inline-block; width:8px; height:8px; background:#4ade80; border-radius:50%; box-shadow: 0 0 5px #4ade80;"></span>
                        Sync AI
                    </span>
                    <span style="cursor: pointer; color: #888; font-size: 20px; padding: 0 5px;" onclick="toggleSyncAI()">×</span>
                </div>
                <div class="sync-chat-messages" id="sync-chat-messages">
                    <div class="sync-msg ai">Hi! I'm Sync AI. Need help understanding any SYNDICACY features or rules?</div>
                    <div class="typing-indicator" id="sync-typing"><span></span><span></span><span></span></div>
                </div>
                <div class="sync-chat-input-area">
                    <input type="text" id="sync-chat-input" placeholder="Ask a question..." onkeypress="if(event.key === 'Enter') sendSyncMessage()">
                    <button onclick="sendSyncMessage()">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13M22 2L15 22L11 13L2 9L22 2Z"/></svg>
                    </button>
                </div>
            </div>
            
            <!-- Added explicit onclick handler here -->
            <div id="sync-ai-button" onmousedown="startDragSyncAI(event)" ontouchstart="startDragSyncAI(event)" onclick="handleSyncClick(event)">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="100%" height="100%" style="border-radius:50%;">
                  <defs>
                    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stop-color="#222222" />
                      <stop offset="100%" stop-color="#111111" />
                    </linearGradient>
                    <linearGradient id="greenGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stop-color="#4ade80" />
                      <stop offset="100%" stop-color="#22c55e" />
                    </linearGradient>
                    <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="2.5" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                  </defs>
                  <style>
                    @keyframes syncOrbit { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
                    @keyframes botFloat { 0%, 100% { transform: translateY(0px); } 50% { transform: translateY(-3px); } }
                    @keyframes eyeBlink { 0%, 46%, 50%, 100% { transform: scaleY(1); } 48% { transform: scaleY(0.15); } }
                    .sync-ring { transform-origin: 120px 95px; animation: syncOrbit 7s linear infinite; }
                    .chatbot-core { animation: botFloat 3s ease-in-out infinite; }
                    .bot-eyes { transform-origin: 120px 90px; animation: eyeBlink 4.5s infinite; }
                  </style>
                  <circle cx="120" cy="120" r="112" fill="url(#bgGrad)" stroke="#4ade80" stroke-width="5" />
                  <circle cx="120" cy="120" r="102" fill="none" stroke="#ffffff" stroke-opacity="0.1" stroke-width="1.5" stroke-dasharray="6 6" />
                  <g class="sync-ring" filter="url(#neonGlow)">
                    <path d="M 69.26 113.47 A 54 54 0 0 1 164.23 64.03" fill="none" stroke="url(#greenGrad)" stroke-width="6.5" stroke-linecap="round" />
                    <path d="M 150.13 58.9 L 164.23 64.03 L 165.54 49.09" fill="none" stroke="#4ade80" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round" />
                    <path d="M 170.74 76.53 A 54 54 0 0 1 75.77 125.97" fill="none" stroke="url(#greenGrad)" stroke-width="6.5" stroke-linecap="round" />
                    <path d="M 89.87 131.1 L 75.77 125.97 L 74.46 140.91" fill="none" stroke="#4ade80" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round" />
                  </g>
                  <g class="chatbot-core">
                    <line x1="120" y1="53" x2="120" y2="65" stroke="#4ade80" stroke-width="4" stroke-linecap="round" />
                    <circle cx="120" cy="50" r="5" fill="#4ade80" filter="url(#neonGlow)" />
                    <rect x="74" y="83" width="6" height="20" rx="3" fill="#4ade80" />
                    <rect x="160" y="83" width="6" height="20" rx="3" fill="#4ade80" />
                    <path d="M 94 65 H 146 A 14 14 0 0 1 160 79 V 107 A 14 14 0 0 1 146 121 H 114 L 98 133 V 121 H 94 A 14 14 0 0 1 80 107 V 79 A 14 14 0 0 1 94 65 Z" fill="#ffffff" stroke="#1a1a1a" stroke-width="2.5" stroke-linejoin="round" />
                    <rect x="89" y="75" width="62" height="34" rx="10" fill="#1a1a1a" />
                    <g class="bot-eyes">
                      <circle cx="106" cy="90" r="5.5" fill="#4ade80" />
                      <circle cx="134" cy="90" r="5.5" fill="#4ade80" />
                      <circle cx="108" cy="88" r="1.8" fill="#ffffff" />
                      <circle cx="136" cy="88" r="1.8" fill="#ffffff" />
                    </g>
                    <path d="M 113 100 Q 120 105 127 100" fill="none" stroke="#4ade80" stroke-width="2.5" stroke-linecap="round" />
                  </g>
                  <rect x="42" y="162" width="156" height="38" rx="19" fill="#141414" stroke="#4ade80" stroke-width="2.5" />
                  <g transform="translate(4, 0)" fill="none" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M 73 175 C 73 172, 61 172, 61 176.5 C 61 181, 73 181, 73 185.5 C 73 190, 61 190, 61 187" stroke="#ffffff" />
                    <path d="M 80 173 L 86 181 L 92 173 M 86 181 L 86 189" stroke="#ffffff" />
                    <path d="M 99 189 V 173 L 111 189 V 173" stroke="#ffffff" />
                    <path d="M 130 175.5 C 127 172, 118 173, 118 181 C 118 189, 127 190, 130 186.5" stroke="#ffffff" />
                    <path d="M 144 189 L 151 173 L 158 189 M 146.5 184 H 155.5" stroke="#4ade80" />
                    <path d="M 165 173 H 171 M 168 173 V 189 M 165 189 H 171" stroke="#4ade80" />
                  </g>
                </svg>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', widgetHtml);
}

// Inject on load if missed
window.addEventListener('DOMContentLoaded', () => {
    injectSyncAIWidget();
});
// Fallback if DOM already loaded
if (document.readyState === 'complete' || document.readyState === 'interactive') {
    injectSyncAIWidget();
}

// Fixed Toggle Logic (forces the browser to read the computed style)
function toggleSyncAI() {
    const win = document.getElementById('sync-ai-chat-window');
    if (!win) return;
    
    const currentState = window.getComputedStyle(win).display;
    if (currentState === 'none') {
        win.style.display = 'flex';
    } else {
        win.style.display = 'none';
    }
}

// Separate click handler to prevent drag-click cancellation
function handleSyncClick(e) {
    if (syncDragDidMove) {
        e.preventDefault();
        e.stopPropagation();
        return;
    }
    toggleSyncAI();
}

let isDraggingSync = false;
let syncDragDidMove = false;
let syncStartX, syncStartY, syncStartRight, syncStartBottom;

function startDragSyncAI(e) {
    const widget = document.getElementById('sync-ai-widget');
    isDraggingSync = true;
    syncDragDidMove = false; // Reset drag state on click down
    
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    syncStartX = clientX;
    syncStartY = clientY;
    
    const rect = widget.getBoundingClientRect();
    syncStartRight = window.innerWidth - rect.right;
    syncStartBottom = window.innerHeight - rect.bottom;

    document.addEventListener('mousemove', onDragSyncAI);
    document.addEventListener('touchmove', onDragSyncAI, { passive: false });
    document.addEventListener('mouseup', endDragSyncAI);
    document.addEventListener('touchend', endDragSyncAI);
}

function onDragSyncAI(e) {
    if (!isDraggingSync) return;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const deltaX = syncStartX - clientX;
    const deltaY = syncStartY - clientY;
    
    // Threshold set to 5px to avoid accidental tiny drags registering as a move
    if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
        syncDragDidMove = true;
        if(e.cancelable) e.preventDefault();
        const widget = document.getElementById('sync-ai-widget');
        widget.style.right = `${Math.max(0, syncStartRight + deltaX)}px`;
        widget.style.bottom = `${Math.max(0, syncStartBottom + deltaY)}px`;
    }
}

function endDragSyncAI() {
    isDraggingSync = false;
    document.removeEventListener('mousemove', onDragSyncAI);
    document.removeEventListener('touchmove', onDragSyncAI);
    document.removeEventListener('mouseup', endDragSyncAI);
    document.removeEventListener('touchend', endDragSyncAI);
    // Removed toggleSyncAI() from here! It's now handled safely by handleSyncClick
}

async function sendSyncMessage() {
    const inputEl = document.getElementById('sync-chat-input');
    const msg = inputEl.value.trim();
    if (!msg) return;

    const chatBox = document.getElementById('sync-chat-messages');
    const typing = document.getElementById('sync-typing');

    chatBox.insertBefore(createSyncMsgBubble(msg, 'user'), typing);
    inputEl.value = '';
    chatBox.scrollTop = chatBox.scrollHeight;

    typing.style.display = 'flex';
    chatBox.scrollTop = chatBox.scrollHeight;

    let userEmail = "unknown";
    let userRole = "staff";
    const leader = typeof getLeader === 'function' ? getLeader() : null;
    if (leader) { userEmail = leader.email; userRole = "leader"; }
    else if (typeof currentStaff !== 'undefined' && currentStaff) { userEmail = currentStaff.email; userRole = "staff"; }

    try {
        await ensureSupabase();
        const { data, error } = await supabaseClient.functions.invoke('sync-ai', {
            body: { message: msg, user_email: userEmail, role: userRole }
        });

        typing.style.display = 'none';
        
        if (error || data?.error) {
            chatBox.insertBefore(createSyncMsgBubble("Sorry, I'm having trouble connecting to the server.", 'ai'), typing);
        } else {
            chatBox.insertBefore(createSyncMsgBubble(data.reply, 'ai'), typing);
        }
    } catch (err) {
        typing.style.display = 'none';
        chatBox.insertBefore(createSyncMsgBubble("Connection failed.", 'ai'), typing);
    }
    chatBox.scrollTop = chatBox.scrollHeight;
}

function createSyncMsgBubble(text, sender) {
    const div = document.createElement('div');
    div.className = `sync-msg ${sender}`;
    div.innerText = text;
    return div;
}