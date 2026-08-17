// --- INITIALIZE SUPABASE CLOUD CONNECTION (BULLETPROOF) ---
const supabaseUrl = 'https://qimabxbtbvgayayzvnoj.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpbWFieGJ0YnZnYXlheXp2bm9qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUxNDY5NTUsImV4cCI6MjEwMDcyMjk1NX0.wE4ea1t4ORvPla8C3C0T88pNl5uQTcVPDfDoUQlJEAw';

let supabaseClient = null;
try {
    if (window.supabase && typeof window.supabase.createClient === 'function') {
        supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
    }
} catch (e) {
    console.error("Supabase initialization error:", e);
}

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
window.onclick = function(event) {
    if (event.target.classList.contains('modal-bg')) {
        event.target.style.display = 'none';
    }
};

// --- SMART AUTHENTICATION (DETECTIVE MODE) ---
async function handleLeaderAuth() {
    try {
        const emailInput = document.getElementById('user-email').value.trim();
        const passInput = document.getElementById('user-pass').value;
        const enterButton = document.querySelector('.form-btn'); 

        if (emailInput === "" || passInput === "") {
            alert("Please enter both an email and a password!");
            return;
        }

        if (!supabaseClient) {
            alert("CRITICAL ERROR: Supabase cloud connection failed to load.");
            return;
        }

        enterButton.disabled = true;
        enterButton.style.backgroundColor = "#888888"; 
        enterButton.style.cursor = "wait"; 
        enterButton.innerText = "1. Pinging Cloud...";

        const { data: user, error } = await supabaseClient
            .from('users')
            .select('*')
            .eq('email', emailInput)
            .maybeSingle();

        if (error) throw error;

        enterButton.innerText = "2. Cloud verified...";

        if (user) {
            if (user.password === passInput) {
                window.location.href = 'leader-dashboard.html';
            } else {
                alert("Incorrect password for this email account.");
                enterButton.disabled = false;
                enterButton.innerText = "Enter";
                enterButton.style.backgroundColor = "#1a1a1a"; 
                enterButton.style.cursor = "pointer";
            }
        } else {
            enterButton.innerText = "3. Sending Email...";
            sessionStorage.setItem("pendingEmail", emailInput);
            sessionStorage.setItem("pendingPass", passInput);
            const secretOTP = Math.floor(100000 + Math.random() * 900000).toString();
            sessionStorage.setItem("savedOTP", secretOTP);

            emailjs.send("service_3zk298q", "template_kpcjk5c", {
                user_email: emailInput,
                otp: secretOTP
            }, "nMcZwN9HYoPDwm016")
            .then(function() {
                window.location.href = 'leader-otp.html';
            }, function(err) {
                alert("Failed to send OTP email.");
                enterButton.disabled = false;
                enterButton.innerText = "Enter";
                enterButton.style.backgroundColor = "#1a1a1a"; 
            });
        }
    } catch (criticalError) {
        alert("APP CRASHED! Error: " + criticalError.message);
        document.querySelector('.form-btn').disabled = false;
        document.querySelector('.form-btn').innerText = "Enter";
        document.querySelector('.form-btn').style.backgroundColor = "#1a1a1a"; 
    }
}

// --- VERIFY OTP & REGISTER TO CLOUD DATABASE ---
async function verifyOTP() {
    try {
        const inputs = document.querySelectorAll('.otp-field');
        let typedOTP = "";
        inputs.forEach(input => { typedOTP += input.value.trim(); });
        const savedOTP = sessionStorage.getItem("savedOTP");

        if (typedOTP !== "" && typedOTP === savedOTP) {
            const newEmail = sessionStorage.getItem("pendingEmail");
            const newPass = sessionStorage.getItem("pendingPass");
            const today = new Date().toLocaleDateString();

            if (!supabaseClient) return;

            const { data, error } = await supabaseClient
                .from('users')
                .insert([{ email: newEmail, password: newPass, role: 'leader', joined_date: today }]);

            if (error) throw error;

            sessionStorage.removeItem("pendingEmail");
            sessionStorage.removeItem("pendingPass");
            sessionStorage.removeItem("savedOTP");
            window.location.href = 'leader-dashboard.html'; 
        } else {
            alert("Incorrect OTP. Please try again.");
        }
    } catch (criticalError) {
        alert("APP CRASHED during OTP! Error: " + criticalError.message);
    }
}

// --- 1. TOGGLE CUSTOM ROLE ---
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

// --- 2. FILTER DIRECTORY ---
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

// --- 3. GENERATE INVITE DATA (Helper Function) ---
async function generateInvite() {
    const nameEl = document.getElementById('staff-name');
    const emailEl = document.getElementById('staff-email');
    const roleSelectEl = document.getElementById('staff-role');
    
    if (!nameEl || !emailEl || !roleSelectEl) return null;
    
    const name = nameEl.value.trim();
    const email = emailEl.value.trim();
    let role = roleSelectEl.value === 'other' ? document.getElementById('custom-role').value.trim() : roleSelectEl.value;
    
    if (!name || !email || !role || roleSelectEl.value === "") {
        alert("Please complete all fields."); 
        return null;
    }
    
    if (!supabaseClient) { 
        alert("Database connection is not ready."); 
        return null; 
    }

    try {
        const { data, error } = await supabaseClient
            .from('staff_invites')
            .insert([{ email: email, name: name, role: role, status: 'pending' }])
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
        alert("Error creating invite: " + error.message);
        return null;
    }
}

// --- 4. COPY INVITE LINK (Clipboard) ---
async function copyInviteLink() {
    const copyBtn = document.querySelectorAll('.form-card .google-btn')[0];
    const originalText = copyBtn.innerText;
    copyBtn.innerText = "Generating...";
    copyBtn.disabled = true;

    const inviteData = await generateInvite();
    
    if (inviteData) {
        try {
            await navigator.clipboard.writeText(inviteData.link);
            alert(`Success! 📋\n\nThe secure link for ${inviteData.name} has been copied to your clipboard.\n\nYou can now paste it into WhatsApp, Slack, or iMessage.`);
        } catch (err) {
            prompt("Copy this link manually:", inviteData.link);
        }
    }
    
    copyBtn.innerText = originalText;
    copyBtn.disabled = false;
}

// --- 5. SEND DIRECT INVITE (Email) ---
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
        
        alert(`Success! ✉️\n\nThe system has prepared an email draft for ${inviteData.name}.`);
    }
    
    inviteBtn.innerText = originalText;
    inviteBtn.disabled = false;
}

// --- FETCH PENDING & SCANNED INVITES ---
async function loadPendingInvites() {
    const pendingList = document.getElementById('pending-list');
    if (!pendingList || !supabaseClient) return;

    try {
        const { data, error } = await supabaseClient
            .from('staff_invites')
            .select('*')
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
            
            let avatarHtml = `<div class="avatar" style="background: #f0f0f0; color: #333;">${initial}</div>`;
            if (invite.face_image) {
                avatarHtml = `<img src="${invite.face_image}" style="width: 45px; height: 45px; border-radius: 50%; object-fit: cover; border: 2px solid #4ade80;" alt="Face Preview">`;
            }

            if (invite.status === 'pending') {
                statusText = "WAITING FOR FACE SCAN";
                statusColor = "#f59e0b"; 
                btnHtml = `<button class="google-btn" style="padding: 6px 12px; font-size: 10px; border: 1px dashed #ccc; cursor: not-allowed; opacity: 0.6;" disabled>Approve</button>`;
            } else if (invite.status === 'scanned') {
                statusText = "BIOMETRICS READY - WAITING FOR APPROVAL";
                statusColor = "#4ade80"; 
                btnHtml = `<button class="main-btn" style="padding: 6px 12px; font-size: 10px; background-color: #4ade80; color: black; border: none; cursor: pointer;" onclick="approveInvite('${invite.id}', '${invite.name}')">Approve Now</button>`;
            }

            btnHtml += `<button class="i-btn" style="color: #dc2626; border-color: #fca5a5; background: #fef2f2; width: 26px; height: 26px; flex-shrink: 0; margin-left: 8px;" onclick="deleteInvite('${invite.id}', '${invite.name}')">×</button>`;

            const card = `
                <div class="directory-card" style="border: 1px solid #e0e0e0; background: #fff; margin-bottom: 10px; align-items: center;">
                    ${avatarHtml}
                    <div class="staff-info" style="flex-grow: 1; margin-left: 10px;">
                        <span class="staff-name">${invite.name}</span>
                        <span class="staff-role">${invite.role}</span>
                        <span style="font-size: 10px; color: ${statusColor}; font-weight: bold; margin-top: 4px; display: block;">${statusText}</span>
                    </div>
                    <div style="display: flex; gap: 5px; align-items: center;">
                        ${btnHtml}
                    </div>
                </div>
            `;
            pendingList.insertAdjacentHTML('beforeend', card);
        });
    } catch (err) { console.error(err); }
}

// --- APPROVE THE EMPLOYEE ---
async function approveInvite(inviteId, employeeName) {
    if (!confirm(`Are you sure you want to officially approve ${employeeName}'s face scan and add them to the team?`)) return;

    if (!supabaseClient) {
        alert("Database connection is missing!");
        return;
    }

    try {
        const { data: inviteData, error: fetchError } = await supabaseClient
            .from('staff_invites')
            .select('*')
            .eq('id', inviteId)
            .single();
        
        if (fetchError) throw fetchError;

        const tempPassword = "Staff" + Math.floor(1000 + Math.random() * 9000);
        const today = new Date().toLocaleDateString();

        const { error: insertError } = await supabaseClient
            .from('users')
            .insert([{
                email: inviteData.email,
                password: tempPassword,
                role: inviteData.role,
                joined_date: today,
                name: inviteData.name,
                face_data: inviteData.face_data,
                face_image: inviteData.face_image
            }]);

        if (insertError) throw insertError;

        await supabaseClient
            .from('staff_invites')
            .update({ status: 'approved' })
            .eq('id', inviteId);

        showApprovalSuccessModal(employeeName);

        loadPendingInvites();
        loadTeamDirectory(); 

    } catch (err) {
        console.error(err);
        alert("Error approving employee: " + err.message);
    }
}

// --- CUSTOM SUCCESS POPUP FOR ADD SECTION ---
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

// --- REJECT / DELETE INVITE ---
async function deleteInvite(inviteId, employeeName) {
    if (!confirm(`Are you sure you want to delete the invite for ${employeeName}?`)) return;
    if (!supabaseClient) return;

    try {
        const { error } = await supabaseClient.from('staff_invites').delete().eq('id', inviteId);
        if (error) throw error;
        loadPendingInvites();
    } catch (err) {
        console.error(err);
        alert("Error deleting invite: " + err.message);
    }
}

// --- EMPLOYEE JOIN PAGE (READING & ENFORCING LINK SECURITY) ---
async function verifyInviteLink() {
    const loadingState = document.getElementById('loading-state');
    const successState = document.getElementById('success-state');
    const errorState = document.getElementById('error-state');

    if (!loadingState) return; 

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

// --- START ONBOARDING CAMERA (JOIN.HTML) ---
async function startFaceScan() {
    const startBtn = document.getElementById('start-btn');
    const cameraContainer = document.getElementById('camera-container');
    const video = document.getElementById('video');
    const aiStatus = document.getElementById('ai-status');
    const captureBtn = document.getElementById('capture-btn');

    if (!video) return;

    startBtn.style.display = 'none'; 
    cameraContainer.style.display = 'block'; 

    try {
        const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';
        await Promise.all([
            faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);

        aiStatus.innerText = "AI READY. TURNING ON CAMERA...";
        aiStatus.style.color = "#4ade80"; 

        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
        video.srcObject = stream;

        video.onplay = () => {
            aiStatus.innerText = "CAMERA ACTIVE. PLEASE LOOK AT THE SCREEN.";
            if (captureBtn) captureBtn.style.display = 'block';

            const canvas = faceapi.createCanvasFromMedia(video);
            canvas.style.position = 'absolute';
            canvas.style.top = '0';
            canvas.style.left = '0';
            cameraContainer.append(canvas);

            const displaySize = { width: video.clientWidth, height: video.clientHeight };
            faceapi.matchDimensions(canvas, displaySize);

            setInterval(async () => {
                const detections = await faceapi.detectAllFaces(video).withFaceLandmarks();
                const resizedDetections = faceapi.resizeResults(detections, displaySize);
                canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
                faceapi.draw.drawFaceLandmarks(canvas, resizedDetections);
            }, 100);
        };
    } catch (err) {
        alert("Camera Error: Check permissions.");
        aiStatus.innerText = "ERROR: Could not access camera.";
        aiStatus.style.color = "red";
    }
}

// --- CAPTURE ONBOARDING FACE & SNAPSHOT ---
async function captureFace() {
    const video = document.getElementById('video');
    const captureBtn = document.getElementById('capture-btn');
    const aiStatus = document.getElementById('ai-status');

    if (captureBtn) {
        captureBtn.disabled = true;
        captureBtn.innerText = "Analyzing & Snapping Photo...";
    }
    aiStatus.innerText = "PROCESSING 68 FACIAL POINTS...";
    aiStatus.style.color = "#f59e0b";

    try {
        const detection = await faceapi.detectSingleFace(video).withFaceLandmarks().withFaceDescriptor();

        if (!detection) {
            alert("No face detected clearly! Please look straight at the camera.");
            if (captureBtn) { captureBtn.disabled = false; captureBtn.innerText = "Scan My Face"; }
            aiStatus.innerText = "WAITING FOR FACE...";
            return;
        }

        const faceDataString = JSON.stringify(Array.from(detection.descriptor));
        const canvasSnapshot = document.createElement('canvas');
        canvasSnapshot.width = video.videoWidth || 320;
        canvasSnapshot.height = video.videoHeight || 240;
        const ctx = canvasSnapshot.getContext('2d');
        ctx.drawImage(video, 0, 0, canvasSnapshot.width, canvasSnapshot.height);
        
        const imageBase64 = canvasSnapshot.toDataURL('image/jpeg', 0.7);

        aiStatus.innerText = "BIOMETRICS SECURED! UPLOADING TO CLOUD...";

        const urlParams = new URLSearchParams(window.location.search);
        const { error } = await supabaseClient
            .from('staff_invites')
            .update({ 
                face_data: faceDataString, 
                face_image: imageBase64, 
                status: 'scanned' 
            })
            .eq('id', urlParams.get('id'));

        if (error) throw error;

        if (video.srcObject) {
            video.srcObject.getTracks().forEach(track => track.stop());
        }

        document.getElementById('camera-container').style.display = 'none';
        document.getElementById('success-state').innerHTML = `
            <div style="text-align: center; color: #4ade80; margin-bottom: 20px;">
                <svg viewBox="0 0 24 24" width="60" height="60" stroke="currentColor" stroke-width="2" fill="none"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
            </div>
            <h2 class="title" style="font-size: 24px; margin-bottom: 5px;">Biometrics & Photo Saved!</h2>
            <p style="font-size: 14px; color: #888;">Your photo has been sent to the boss for verification. You can close this page.</p>
        `;
    } catch (err) {
        console.error(err);
        alert("Error saving biometric data.");
        if (captureBtn) { captureBtn.disabled = false; captureBtn.innerText = "Scan My Face"; }
    }
}

// --- DASHBOARD LIVE ATTENDANCE ---
async function loadTodayAttendance() {
    const activeList = document.getElementById('active-today-list');
    const pendingList = document.getElementById('pending-today-list');

    if (!activeList || !pendingList || !supabaseClient) return;

    const todayStr = new Date().toLocaleDateString();

    try {
        const { data: staffMembers, error: staffErr } = await supabaseClient.from('users').select('*').neq('role', 'leader');
        if (staffErr) throw staffErr;

        const { data: attendanceLogs, error: attErr } = await supabaseClient.from('attendance').select('*').eq('date', todayStr);
        if (attErr) throw attErr;

        activeList.innerHTML = "";
        pendingList.innerHTML = "";

        let activeCount = 0;
        let pendingCount = 0;

        staffMembers.forEach(staff => {
            const log = attendanceLogs.find(a => a.user_email === staff.email);
            const initial = staff.name ? staff.name.charAt(0).toUpperCase() : '?';
            const shortName = staff.name ? staff.name.split(' ')[0] : 'Staff';

            if (log) {
                activeCount++;
                activeList.insertAdjacentHTML('beforeend', `
                    <div class="member-card present">
                        <div class="avatar" style="background: #1a1a1a; color: white;">${initial}</div>
                        <span class="name">${shortName}</span>
                        <span style="font-size: 9px; color: #888; font-weight: 500; margin-top: 2px;">${log.time}</span>
                    </div>
                `);
            } else {
                pendingCount++;
                pendingList.insertAdjacentHTML('beforeend', `
                    <div class="member-card absent">
                        <div class="avatar" style="background: #f0f0f0; color: #333;">${initial}</div>
                        <span class="name">${shortName}</span>
                    </div>
                `);
            }
        });

        if (activeCount === 0) activeList.innerHTML = `<p style="font-size: 12px; color: #888; grid-column: 1 / -1;">No one has checked in yet today.</p>`;
        if (pendingCount === 0) pendingList.innerHTML = `<p style="font-size: 12px; color: #888; grid-column: 1 / -1;">Everyone is here!</p>`;
    } catch (err) {
        console.error(err);
    }
}

// --- HELPER: CALCULATE AVERAGE CHECK-IN TIME ---
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

// --- SPREADSHEET: COMPLETE TEAM LEDGER ---
async function loadTeamLedger() {
    const tableBody = document.getElementById('ledger-table-body');
    if (!tableBody || !supabaseClient) return;

    try {
        const { data: staff } = await supabaseClient.from('users').select('*').neq('role', 'leader');
        const { data: attendance } = await supabaseClient.from('attendance').select('*');
        const { data: settings } = await supabaseClient.from('settings').select('holidays').limit(1).single();
        
        let holidaysArray = [];
        if (settings && settings.holidays) {
            holidaysArray = JSON.parse(settings.holidays);
        }

        tableBody.innerHTML = ""; 

        if (!staff || staff.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="5" style="padding: 20px; text-align: center; color: #888;">No active staff found.</td></tr>`;
            return;
        }

        const today = new Date();

        staff.forEach(user => {
            const userLogs = attendance ? attendance.filter(log => log.user_email === user.email) : [];
            let statusHtml = userLogs.length > 0 ? `<span style="color:#4ade80; font-weight:bold;">Active</span>` : `<span style="color:#f59e0b; font-weight:bold;">Pending</span>`;
            
            let avgTimeStr = calculateAvgCheckInTime(userLogs);

            let workingDays = 1; 
            if (user.joined_date) {
                const joinedDate = new Date(user.joined_date);
                workingDays = 0;
                for (let d = new Date(joinedDate); d <= today; d.setDate(d.getDate() + 1)) {
                    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                    if (!holidaysArray.includes(dateStr)) workingDays++;
                }
                if (workingDays === 0) workingDays = 1; 
            }

            const attendPercent = Math.round((userLogs.length / workingDays) * 100);
            const displayPercent = attendPercent > 100 ? 100 : attendPercent; 
            let percentColor = displayPercent >= 80 ? '#4ade80' : (displayPercent >= 50 ? '#f59e0b' : '#ef4444');

            tableBody.insertAdjacentHTML('beforeend', `
                <tr style="border-bottom: 1px solid #eaeaea; cursor: pointer;" onclick="window.location.href='record-individual.html?email=${encodeURIComponent(user.email)}'" onmouseover="this.style.backgroundColor='#f9f9f9'" onmouseout="this.style.backgroundColor='transparent'">
                    <td style="padding: 12px 15px; font-weight: 500; color: #1a1a1a;">${user.name}</td>
                    <td style="padding: 12px 15px; color: #555;">${user.role}</td>
                    <td style="padding: 12px 15px; color: #555;">${avgTimeStr}</td>
                    <td style="padding: 12px 15px; color: ${percentColor}; font-weight: bold;">${displayPercent}%</td>
                    <td style="padding: 12px 15px; text-align: right;">${statusHtml}</td>
                </tr>
            `);
        });
    } catch (err) { console.error(err); }
}

// --- INDIVIDUAL ANALYTICS ---
let analyticsDate = new Date(); 
let currentViewedUser = null; 

async function loadIndividualAnalytics() {
    const calendarGrid = document.getElementById('analytics-calendar');
    if (!calendarGrid || !supabaseClient) return; 

    const urlParams = new URLSearchParams(window.location.search);
    const targetEmail = urlParams.get('email');
    if (!targetEmail) return;

    try {
        const { data: user } = await supabaseClient.from('users').select('*').eq('email', targetEmail).single();
        const { data: logs } = await supabaseClient.from('attendance').select('*').eq('user_email', targetEmail);
        const { data: settings } = await supabaseClient.from('settings').select('holidays').limit(1).single();

        currentViewedUser = user;

        let holidaysArray = [];
        if (settings && settings.holidays) holidaysArray = JSON.parse(settings.holidays);

        document.getElementById('analytics-header').style.display = 'block';
        document.getElementById('credentials-card').style.display = 'block';
        document.getElementById('employee-name-title').innerText = user.name;
        document.getElementById('employee-role-title').innerText = user.role; 
        document.getElementById('employee-joined-box').innerText = user.joined_date || "N/A";
        document.getElementById('emp-cred-email').innerText = user.email || "No Email";
        
        // Dynamically update button text to include employee name
        const firstName = user.name ? user.name.split(' ')[0] : 'Staff';
        document.getElementById('email-staff-btn').innerText = `Email ${firstName}`;

        const today = new Date();
        let workingDays = 1;
        if (user.joined_date) {
            const joinedDate = new Date(user.joined_date);
            workingDays = 0;
            for (let d = new Date(joinedDate); d <= today; d.setDate(d.getDate() + 1)) {
                const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                if (!holidaysArray.includes(dateStr)) workingDays++;
            }
            if (workingDays === 0) workingDays = 1; 
        }

        const totalChecks = logs ? logs.length : 0;
        document.getElementById('total-checkins-value').innerText = `${totalChecks} / ${workingDays}`;
        document.getElementById('avg-in-time').innerText = calculateAvgCheckInTime(logs);
        
        let percent = Math.round((totalChecks / workingDays) * 100);
        if (percent > 100) percent = 100;
        const percentBox = document.getElementById('attendance-percent-box');
        percentBox.innerText = `${percent}%`;
        percentBox.style.color = percent >= 80 ? '#4ade80' : (percent >= 50 ? '#f59e0b' : '#ef4444');

        const year = analyticsDate.getFullYear();
        const month = analyticsDate.getMonth();
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        
        const monthTitleEl = document.getElementById('calendar-month-title');
        monthTitleEl.innerHTML = `
            <button class="i-btn" style="width: 24px; height: 24px; padding: 0; line-height: 1; margin-right: 10px;" onclick="changeMonth(-1)">&#8592;</button>
            <span>${monthNames[month]} ${year}</span>
            <button class="i-btn" style="width: 24px; height: 24px; padding: 0; line-height: 1; margin-left: 10px;" onclick="changeMonth(1)">&#8594;</button>
        `;
        monthTitleEl.style.display = 'flex'; monthTitleEl.style.alignItems = 'center'; monthTitleEl.style.justifyContent = 'center';

        calendarGrid.innerHTML = `
            <div class="cal-day" style="border: none; font-weight: bold; color: #888;">S</div><div class="cal-day" style="border: none; font-weight: bold; color: #888;">M</div><div class="cal-day" style="border: none; font-weight: bold; color: #888;">T</div><div class="cal-day" style="border: none; font-weight: bold; color: #888;">W</div><div class="cal-day" style="border: none; font-weight: bold; color: #888;">T</div><div class="cal-day" style="border: none; font-weight: bold; color: #888;">F</div><div class="cal-day" style="border: none; font-weight: bold; color: #888;">S</div>
        `;

        const firstDayIndex = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        for (let i = 0; i < firstDayIndex; i++) {
            calendarGrid.insertAdjacentHTML('beforeend', `<div class="cal-day" style="border: none;"></div>`);
        }

        for (let day = 1; day <= daysInMonth; day++) {
            const checkDate = new Date(year, month, day).toLocaleDateString();
            const wasPresent = logs && logs.some(log => log.date === checkDate);
            const currentIterationDate = new Date(year, month, day);
            
            let styleClass = "cal-day";
            if (wasPresent) { styleClass = "cal-day cal-present"; } 
            else if (currentIterationDate <= today) { styleClass = "cal-day cal-absent"; }
            
            calendarGrid.insertAdjacentHTML('beforeend', `<div class="${styleClass}">${day}</div>`);
        }
    } catch (err) { console.error(err); }
}

function changeMonth(offset) {
    analyticsDate.setMonth(analyticsDate.getMonth() + offset);
    loadIndividualAnalytics(); 
}

// --- SECURE PASSWORD REVEAL (STRICTLY ENFORCED) ---
async function revealPassword() {
    if (!currentViewedUser) return;
    const bossPass = prompt("SECURITY CHECK: Enter your Leader Password to reveal staff credentials.");
    if (!bossPass) return;

    try {
        const { data: leaders, error } = await supabaseClient
            .from('users')
            .select('*')
            .eq('role', 'leader')
            .eq('password', bossPass.trim());

        if (error || !leaders || leaders.length === 0) {
            alert("ACCESS DENIED: Incorrect leader password.");
            return;
        }

        const passBox = document.getElementById('emp-cred-pass');
        passBox.innerText = `Password: ${currentViewedUser.password}`;
        passBox.style.display = 'block';

    } catch (err) {
        console.error(err);
        alert("Verification error occurred.");
    }
}

// --- EMAIL CREDENTIALS TO STAFF ---
async function emailCredentials() {
    if (!currentViewedUser) return;
    const bossPass = prompt("SECURITY CHECK: Enter your Leader Password to send staff credentials.");
    if (!bossPass) return;
    
    try {
        const { data: leaders, error } = await supabaseClient
            .from('users')
            .select('*')
            .eq('role', 'leader')
            .eq('password', bossPass.trim());

        if (error || !leaders || leaders.length === 0) {
            alert("ACCESS DENIED: Incorrect leader password. Email not sent.");
            return;
        }

        const subject = encodeURIComponent(`Your SYNDICACY Access Credentials`);
        const body = encodeURIComponent(`Hi ${currentViewedUser.name},\n\nHere,s your secure access credentials for the SYNDICACY portal:\n\nEmail: ${currentViewedUser.email}\nPassword: ${currentViewedUser.password}\n\nIMPORTANT SECURITY NOTE: Please delete this email immediately after logging in for the first time to maintain account security.\n\nBest,\nManagement`);
        
        window.location.href = `mailto:${currentViewedUser.email}?subject=${subject}&body=${body}`;

    } catch (err) {
        console.error(err);
        alert("Error sending credentials.");
    }
}

// --- RENAME EMPLOYEE ---
async function renameEmployee() {
    if (!currentViewedUser || !supabaseClient) return;
    const newName = prompt(`Enter a new name for ${currentViewedUser.name}:`, currentViewedUser.name);
    
    if (newName && newName.trim() !== "" && newName !== currentViewedUser.name) {
        try {
            const { error } = await supabaseClient.from('users').update({ name: newName.trim() }).eq('email', currentViewedUser.email);
            if (error) throw error;
            
            alert(`Success! Employee renamed to ${newName.trim()}`);
            loadIndividualAnalytics(); 
        } catch (err) {
            alert("Failed to update name in database.");
            console.error(err);
        }
    }
}

// --- TEAM DIRECTORY ---
async function loadTeamDirectory() {
    const directoryList = document.getElementById('directory-list');
    if (!directoryList || !supabaseClient) return;

    try {
        const { data } = await supabaseClient.from('users').select('*').neq('role', 'leader');
        directoryList.innerHTML = ""; 
        if (!data || data.length === 0) {
            directoryList.innerHTML = `<p style="font-size: 12px; color: #888; padding: 20px; text-align: center;">No staff members yet.</p>`;
            return;
        }

        data.forEach(user => {
            const initial = user.name ? user.name.charAt(0).toUpperCase() : '?';
            directoryList.insertAdjacentHTML('beforeend', `
                <div class="directory-card">
                    <div class="avatar" style="background: #1a1a1a; color: white;">${initial}</div>
                    <div class="staff-info">
                        <span class="staff-name">${user.name}</span>
                        <span class="staff-role">${user.role}</span>
                    </div>
                </div>
            `);
        });
    } catch (err) { console.error(err); }
}

// ==========================================
// --- SETTINGS CALENDAR & RULES ENGINE ---
// ==========================================

let localHolidays = [];

function initializeSettingsCalendar() {
    const calendar = document.getElementById('settings-calendar');
    if (!calendar) return; 

    const headers = calendar.querySelectorAll('.cal-day');
    calendar.innerHTML = "";
    headers.forEach(h => calendar.appendChild(h));

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let i = 1; i <= daysInMonth; i++) {
        let dayDiv = document.createElement('div');
        dayDiv.className = 'cal-day cal-present'; 
        dayDiv.innerText = i;
        dayDiv.style.cursor = 'pointer';
        
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
        dayDiv.dataset.date = dateStr;

        if (localHolidays.includes(dateStr)) {
            dayDiv.className = 'cal-day cal-holiday';
        }

        dayDiv.onclick = function() {
            if (this.classList.contains('cal-present')) {
                this.classList.replace('cal-present', 'cal-holiday');
                if (!localHolidays.includes(dateStr)) localHolidays.push(dateStr);
            } else {
                this.classList.replace('cal-holiday', 'cal-present');
                localHolidays = localHolidays.filter(d => d !== dateStr);
            }
        };
        calendar.appendChild(dayDiv);
    }
}

function markAllSundays() {
    const calendar = document.getElementById('settings-calendar');
    if (!calendar) return;
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let i = 1; i <= daysInMonth; i++) {
        const d = new Date(year, month, i);
        if (d.getDay() === 0) { 
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            if (!localHolidays.includes(dateStr)) localHolidays.push(dateStr);
        }
    }
    initializeSettingsCalendar();
}

function markSecondSaturdays() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    let saturdayCount = 0;

    for (let i = 1; i <= daysInMonth; i++) {
        const d = new Date(year, month, i);
        if (d.getDay() === 6) { 
            saturdayCount++;
            if (saturdayCount === 2) { 
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
                if (!localHolidays.includes(dateStr)) localHolidays.push(dateStr);
                break;
            }
        }
    }
    initializeSettingsCalendar();
}

async function loadSettings() {
    const startInput = document.getElementById('check-in-start');
    if (!startInput || !supabaseClient) return;

    try {
        const { data, error } = await supabaseClient.from('settings').select('*').limit(1).single();
        if (error) throw error;
        
        if (data) {
            startInput.value = data.check_in_start || "09:00";
            document.getElementById('check-in-end').value = data.check_in_end || "10:00";
            document.getElementById('require-gps').checked = data.require_gps;
            document.getElementById('require-pin').checked = data.require_pin;
            
            if (data.holidays) {
                localHolidays = JSON.parse(data.holidays);
                initializeSettingsCalendar();
            }
        }
    } catch (err) {
        console.error("Error loading settings:", err);
    }
}

async function saveSettings() {
    const saveBtn = document.getElementById('save-settings-btn');
    saveBtn.innerText = "Saving to Cloud...";
    saveBtn.disabled = true;

    try {
        const { data: existingData } = await supabaseClient.from('settings').select('id').limit(1).single();

        const payload = {
            check_in_start: document.getElementById('check-in-start').value,
            check_in_end: document.getElementById('check-in-end').value,
            require_gps: document.getElementById('require-gps').checked,
            require_pin: document.getElementById('require-pin').checked,
            holidays: JSON.stringify(localHolidays)
        };

        if (existingData) {
            await supabaseClient.from('settings').update(payload).eq('id', existingData.id);
        } else {
            await supabaseClient.from('settings').insert([payload]);
        }

        saveBtn.innerText = "Saved & Synced!";
        saveBtn.style.backgroundColor = "#fff";
        saveBtn.style.border = "2px solid #4ade80";
        
        setTimeout(() => {
            saveBtn.innerText = "Save Configuration";
            saveBtn.style.backgroundColor = "#4ade80";
            saveBtn.style.border = "none";
            saveBtn.disabled = false;
        }, 2000);
    } catch (err) {
        alert("Error saving settings to cloud.");
        saveBtn.innerText = "Save Configuration";
        saveBtn.disabled = false;
    }
}

// --- DAILY PIN GENERATOR ---
async function loadTodayPIN() {
    const pinDisplay = document.getElementById('live-pin-display');
    if (!pinDisplay || !supabaseClient) return;

    try {
        const { data } = await supabaseClient.from('settings').select('daily_pin').limit(1).single();
        if (data && data.daily_pin) pinDisplay.innerText = data.daily_pin;
    } catch (err) { console.error(err); }
}

async function generateNewPIN() {
    if (!supabaseClient) return;
    const newPin = Math.floor(1000 + Math.random() * 9000).toString();
    document.getElementById('live-pin-display').innerText = newPin;

    try {
        const { data: existingData } = await supabaseClient.from('settings').select('id').limit(1).single();
        if (existingData) {
            await supabaseClient.from('settings').update({ daily_pin: newPin }).eq('id', existingData.id);
        }
    } catch (err) { console.error(err); }
}

// ==========================================
// --- 2-STEP GPS GEOFENCING ENGINE ---
// ==========================================

async function pinpointWorkplaceLocation() {
    if (!navigator.geolocation) {
        alert("Geolocation is not supported by your browser.");
        return;
    }

    alert("Pinging your current GPS coordinates as the office location...");

    navigator.geolocation.getCurrentPosition(async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        try {
            const { data: existingData } = await supabaseClient.from('settings').select('id').limit(1).single();
            if (existingData) {
                await supabaseClient.from('settings').update({ 
                    office_lat: lat, 
                    office_lng: lng 
                }).eq('id', existingData.id);

                alert(`SUCCESS! 📍 Office Location Saved:\nLatitude: ${lat.toFixed(4)}\nLongitude: ${lng.toFixed(4)}`);
            }
        } catch (err) {
            console.error("GPS Save Error:", err);
            alert("Failed to save office location to cloud.");
        }
    }, (error) => {
        alert("Error getting location. Please allow browser location permissions.");
        console.error(error);
    }, { enableHighAccuracy: true });
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

// ==========================================
// --- STAFF PORTAL & FULLY ENFORCED SCANNER ---
// ==========================================

let currentStaff = null; 
let scannerInterval = null;

async function handleStaffLogin() {
    const email = document.getElementById('staff-email').value.trim();
    const pass = document.getElementById('staff-pass').value;
    const loginBtn = document.querySelector('.form-btn');

    if (!email || !pass || !supabaseClient) return;

    loginBtn.innerText = "Verifying...";
    loginBtn.disabled = true;

    try {
        const { data: user, error } = await supabaseClient.from('users').select('*').eq('email', email).maybeSingle();
        if (error) throw error;

        if (user && user.password === pass) {
            currentStaff = user; 
            document.querySelector('.container').innerHTML = `
                <h2 class="title" style="font-size: 24px; margin-bottom: 10px;">Daily Check-In</h2>
                <p class="subtitle" style="margin-bottom: 20px;">Welcome, <strong>${user.name}</strong>.</p>
                <div id="scanner-container" style="display: none; margin-bottom: 20px; position: relative;">
                    <video id="staff-video" width="100%" height="auto" autoplay muted playsinline style="border-radius: 8px; border: 3px solid #e5e7eb; background-color: #000;"></video>
                    <p id="scanner-status" style="font-size: 12px; color: #f59e0b; font-weight: bold; margin-top: 15px;">INITIALIZING SCANNER...</p>
                </div>
                <button id="activate-scanner-btn" class="main-btn form-btn" onclick="startDailyScanner()">Activate Scanner</button>
            `;
        } else {
            alert("Incorrect email or password.");
            loginBtn.innerText = "Enter";
            loginBtn.disabled = false;
        }
    } catch (err) {
        alert("Login error.");
        loginBtn.innerText = "Enter";
        loginBtn.disabled = false;
    }
}

async function startDailyScanner() {
    const activateBtn = document.getElementById('activate-scanner-btn');
    const scannerContainer = document.getElementById('scanner-container');
    const video = document.getElementById('staff-video');
    const scannerStatus = document.getElementById('scanner-status');

    if (!video || !currentStaff) return;

    try {
        const { data: rules, error: rulesErr } = await supabaseClient.from('settings').select('*').limit(1).single();
        if (rulesErr) throw rulesErr;

        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const todayDateStr = `${year}-${month}-${day}`;

        if (rules && rules.holidays) {
            const holidayArray = JSON.parse(rules.holidays);
            if (holidayArray.includes(todayDateStr)) {
                alert("Scanner Locked 🔒\n\nToday has been declared an official Holiday by your organization. Enjoy your day off!");
                return;
            }
        }

        const currentHours = String(now.getHours()).padStart(2, '0');
        const currentMinutes = String(now.getMinutes()).padStart(2, '0');
        const currentTime = `${currentHours}:${currentMinutes}`;

        if (rules && (currentTime < rules.check_in_start || currentTime > rules.check_in_end)) {
            alert(`Scanner Locked 🔒\n\nYou can only check in between ${rules.check_in_start} and ${rules.check_in_end}.`);
            return; 
        }

        if (rules && rules.require_pin) {
            const userPin = prompt("SECURITY CHECK: Enter the 4-digit Daily Access PIN provided by your Manager:");
            if (userPin !== rules.daily_pin) {
                alert("Incorrect Access PIN. Check-in aborted.");
                return;
            }
        }

        if (rules && rules.require_gps) {
            if (!rules.office_lat || !rules.office_lng) {
                alert("Manager Error: Office GPS location has not been pinned in settings yet!");
                return;
            }

            alert("Verifying your location within campus limits...");

            const position = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 });
            }).catch(err => {
                alert("GPS Error: Please enable location permissions on your device to check in.");
                throw err;
            });

            const distanceMeters = calculateDistanceMeters(position.coords.latitude, position.coords.longitude, rules.office_lat, rules.office_lng);

            if (distanceMeters > 150) {
                alert(`Geofence Violation 🚫\n\nYou are too far from the office (${Math.round(distanceMeters)} meters away). You must be within 150 meters to clock in.`);
                return;
            }
        }

        activateBtn.style.display = 'none';
        scannerContainer.style.display = 'block';
        scannerStatus.innerText = "LOADING AI MODELS...";
        scannerStatus.style.color = "#f59e0b";

        const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/models';
        await Promise.all([
            faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);

        scannerStatus.innerText = "CAMERA ACTIVE. LOOK AT THE SCREEN.";
        scannerStatus.style.color = "#4ade80";

        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
        video.srcObject = stream;

        const savedNumbers = JSON.parse(currentStaff.face_data);
        const savedFloatArray = new Float32Array(savedNumbers);
        const labeledDescriptor = new faceapi.LabeledFaceDescriptors(currentStaff.name, [savedFloatArray]);
        const faceMatcher = new faceapi.FaceMatcher([labeledDescriptor], 0.5);

        video.onplay = () => {
            const canvas = faceapi.createCanvasFromMedia(video);
            canvas.style.position = 'absolute';
            canvas.style.top = '0';
            canvas.style.left = '0';
            scannerContainer.append(canvas);

            const displaySize = { width: video.clientWidth, height: video.clientHeight };
            faceapi.matchDimensions(canvas, displaySize);

            scannerInterval = setInterval(async () => {
                const detection = await faceapi.detectSingleFace(video).withFaceLandmarks().withFaceDescriptor();
                
                if (detection) {
                    const resizedDetections = faceapi.resizeResults(detection, displaySize);
                    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
                    faceapi.draw.drawFaceLandmarks(canvas, resizedDetections);

                    const match = faceMatcher.findBestMatch(detection.descriptor);
                    
                    if (match.label === currentStaff.name) {
                        clearInterval(scannerInterval); 
                        video.srcObject.getTracks().forEach(track => track.stop()); 
                        
                        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        const todayStr = now.toLocaleDateString();

                        scannerStatus.innerText = "MATCH FOUND! SYNCING ATTENDANCE...";
                        
                        supabaseClient.from('attendance').insert([{
                            user_email: currentStaff.email,
                            user_name: currentStaff.name,
                            date: todayStr,
                            time: timeStr,
                            status: 'Present'
                        }]).then(({ error }) => {
                            if (error) {
                                alert("Failed to log attendance to cloud!");
                                return;
                            }
                            
                            document.getElementById('scanner-container').innerHTML = `
                                <div style="text-align: center; color: #4ade80; padding: 20px;">
                                    <h2>Access Granted!</h2>
                                    <p style="color: #666; font-size: 14px;">Successfully clocked in at ${timeStr}</p>
                                </div>
                            `;
                        });
                    }
                } else {
                    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
                }
            }, 500); 
        };
    } catch (err) {
        scannerStatus.innerText = "ERROR: System sync failed.";
        scannerStatus.style.color = "red";
        console.error(err);
    }
}

// --- 6. ADD FUTURE SCHEDULE EXCEPTION ---
function addException() {
    const list = document.getElementById('exception-list');
    const countSpan = document.getElementById('exception-count');
    if (!list || !countSpan) return;

    const currentCount = list.children.length;

    if (currentCount >= 5) {
        alert("You can only add up to 5 future schedule exceptions.");
        return;
    }

    const exceptionDiv = document.createElement('div');
    exceptionDiv.style.display = 'flex';
    exceptionDiv.style.gap = '5px';
    exceptionDiv.style.marginBottom = '10px';
    exceptionDiv.style.alignItems = 'center';
    
    exceptionDiv.innerHTML = `
        <input type="date" class="input-field" style="width: 40%; padding: 8px; font-size: 11px;">
        <input type="time" class="input-field" style="width: 25%; padding: 8px; font-size: 11px;">
        <input type="time" class="input-field" style="width: 25%; padding: 8px; font-size: 11px;">
        <button class="i-btn" style="color: #dc2626; border-color: #fca5a5; background: #fef2f2; flex-shrink: 0;" onclick="this.parentElement.remove(); updateExceptionCount();">X</button>
    `;
    
    list.appendChild(exceptionDiv);
    updateExceptionCount();
}

function updateExceptionCount() {
    const list = document.getElementById('exception-list');
    const countSpan = document.getElementById('exception-count');
    if (countSpan && list) {
        countSpan.innerText = `(${list.children.length}/5)`;
    }
}

// --- RUN WHEN PAGE LOADS ---
window.addEventListener('DOMContentLoaded', () => {
    initializeSettingsCalendar();
    loadPendingInvites(); 
    verifyInviteLink(); 
    loadTeamDirectory();
    loadTodayAttendance(); 
    loadTeamLedger(); 
    loadIndividualAnalytics(); 
    loadSettings(); 
    loadTodayPIN(); 
});