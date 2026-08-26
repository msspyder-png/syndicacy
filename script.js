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

// --- GLOBAL WORKSPACE HELPER ---
function getLeader() {
    const data = sessionStorage.getItem('loggedInLeader');
    return data ? JSON.parse(data) : null;
}

// --- UNIVERSAL DATE FORMATTER ---
function getUniversalDate(dateObj = new Date()) {
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
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

// --- MISSING SETTINGS MODAL CONTROLS ---
function openInfoModal(title, desc) {
    const titleEl = document.getElementById('info-title');
    const descEl = document.getElementById('info-desc');
    const modalEl = document.getElementById('info-modal');
    if (titleEl && descEl && modalEl) {
        titleEl.innerText = title;
        descEl.innerText = desc;
        modalEl.style.display = 'flex';
    }
}
function closeInfoModal() {
    const modalEl = document.getElementById('info-modal');
    if (modalEl) modalEl.style.display = 'none';
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
                // If it's an old account that doesn't have a company ID yet, generate one automatically
                if (!user.company_id) {
                    user.company_id = "COMP_" + Math.random().toString(36).substr(2, 9).toUpperCase();
                    await supabaseClient.from('users').update({ company_id: user.company_id }).eq('id', user.id);
                }
                
                // Store leader safely in session memory
                sessionStorage.setItem('loggedInLeader', JSON.stringify(user));
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
            const today = getUniversalDate();
            
            // Create a unique workspace ID for this brand new boss
            const newCompanyId = "COMP_" + Math.random().toString(36).substr(2, 9).toUpperCase();

            if (!supabaseClient) return;

            const { data, error } = await supabaseClient
                .from('users')
                .insert([{ email: newEmail, password: newPass, role: 'leader', joined_date: today, company_id: newCompanyId }])
                .select();

            if (error) throw error;

            sessionStorage.removeItem("pendingEmail");
            sessionStorage.removeItem("pendingPass");
            sessionStorage.removeItem("savedOTP");
            
            sessionStorage.setItem('loggedInLeader', JSON.stringify(data[0]));
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
    const leader = getLeader();
    if (!leader) { alert("Session expired. Please log in again."); return null; }

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
        const today = getUniversalDate();

        const { error: insertError } = await supabaseClient
            .from('users')
            .insert([{
                email: inviteData.email,
                password: tempPassword,
                role: inviteData.role,
                joined_date: today,
                name: inviteData.name,
                face_data: inviteData.face_data,
                face_image: inviteData.face_image,
                company_id: inviteData.company_id // Attach to boss's workspace
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
    const leader = getLeader();

    if (!activeList || !pendingList || !supabaseClient || !leader) return;

    const todayStr = getUniversalDate();

    try {
        const { data: staffMembers, error: staffErr } = await supabaseClient.from('users').select('*').neq('role', 'leader').eq('company_id', leader.company_id);
        if (staffErr) throw staffErr;

        const { data: attendanceLogs, error: attErr } = await supabaseClient.from('attendance').select('*').eq('date', todayStr).eq('company_id', leader.company_id);
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
    const leader = getLeader();
    if (!tableBody || !supabaseClient || !leader) return;

    try {
        const { data: staff } = await supabaseClient.from('users').select('*').neq('role', 'leader').eq('company_id', leader.company_id);
        const { data: attendance } = await supabaseClient.from('attendance').select('*').eq('company_id', leader.company_id);
        const { data: settings } = await supabaseClient.from('settings').select('holidays').eq('company_id', leader.company_id).limit(1).maybeSingle();
        
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
                    const dateStr = getUniversalDate(d);
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
    const leader = getLeader();
    if (!calendarGrid || !supabaseClient || !leader) return; 

    const urlParams = new URLSearchParams(window.location.search);
    const targetEmail = urlParams.get('email');
    if (!targetEmail) return;

    try {
        const { data: user } = await supabaseClient.from('users').select('*').eq('email', targetEmail).maybeSingle();
        const { data: logs } = await supabaseClient.from('attendance').select('*').eq('user_email', targetEmail);
        const { data: settings } = await supabaseClient.from('settings').select('holidays').eq('company_id', leader.company_id).limit(1).maybeSingle();

        currentViewedUser = user;

        let holidaysArray = [];
        if (settings && settings.holidays) holidaysArray = JSON.parse(settings.holidays);

        document.getElementById('analytics-header').style.display = 'block';
        document.getElementById('credentials-card').style.display = 'block';
        document.getElementById('employee-name-title').innerText = user?.name || "Unknown";
        document.getElementById('employee-role-title').innerText = user?.role || "Unknown"; 
        document.getElementById('employee-joined-box').innerText = user?.joined_date || "N/A";
        document.getElementById('emp-cred-email').innerText = user?.email || "No Email";
        
        // Dynamically update button text to include employee name
        const firstName = user?.name ? user.name.split(' ')[0] : 'Staff';
        document.getElementById('email-staff-btn').innerText = `Email ${firstName}`;

        const today = new Date();
        let workingDays = 1;
        if (user && user.joined_date) {
            const joinedDate = new Date(user.joined_date);
            workingDays = 0;
            for (let d = new Date(joinedDate); d <= today; d.setDate(d.getDate() + 1)) {
                const dateStr = getUniversalDate(d);
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

        const todayStr2 = getUniversalDate(today);
        const checkedInToday = logs && logs.some(log => log.date === todayStr2);

        for (let day = 1; day <= daysInMonth; day++) {
            const currentIterationDate = new Date(year, month, day);
            const dateStrIteration = getUniversalDate(currentIterationDate);
            const wasPresent = logs && logs.some(log => log.date === dateStrIteration);
            
            let styleClass = "cal-day";
            if (holidaysArray.includes(dateStrIteration)) {
                styleClass = "cal-day cal-holiday";
            } else if (wasPresent) { 
                styleClass = "cal-day cal-present"; 
            } else if (currentIterationDate <= today) { 
                styleClass = "cal-day cal-absent"; 
            }
            
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

    const leader = getLeader();
    if (!leader) return;

    try {
        const { data: leaders, error } = await supabaseClient
            .from('users')
            .select('*')
            .eq('role', 'leader')
            .eq('password', bossPass.trim())
            .eq('company_id', leader.company_id);

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
    
    const leader = getLeader();
    if (!leader) return;

    try {
        const { data: leaders, error } = await supabaseClient
            .from('users')
            .select('*')
            .eq('role', 'leader')
            .eq('password', bossPass.trim())
            .eq('company_id', leader.company_id);

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
    const leader = getLeader();
    if (!directoryList || !supabaseClient || !leader) return;

    try {
        const { data } = await supabaseClient.from('users').select('*').neq('role', 'leader').eq('company_id', leader.company_id);
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
let customSchedules = []; 

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
        
        const dateStr = getUniversalDate(new Date(year, month, i));
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
            saveSettings(); 
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
            const dateStr = getUniversalDate(d);
            if (!localHolidays.includes(dateStr)) localHolidays.push(dateStr);
        }
    }
    initializeSettingsCalendar();
    saveSettings(); 
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
                const dateStr = getUniversalDate(d);
                if (!localHolidays.includes(dateStr)) localHolidays.push(dateStr);
                break;
            }
        }
    }
    initializeSettingsCalendar();
    saveSettings(); 
}

async function loadSettings() {
    const startInput = document.getElementById('check-in-start');
    const leader = getLeader();
    if (!startInput || !supabaseClient || !leader) return;

    try {
        const { data, error } = await supabaseClient.from('settings').select('*').eq('company_id', leader.company_id).limit(1).maybeSingle();
        if (error) throw error;
        
        if (data) {
            startInput.value = data.check_in_start || "09:00";
            document.getElementById('check-in-end').value = data.check_in_end || "10:00";
            document.getElementById('require-gps').checked = data.require_gps;
            document.getElementById('require-pin').checked = data.require_pin;
            
            // Load map variables if they exist
            if (data.office_lat && data.office_lng) {
                mapSavedLat = data.office_lat;
                mapSavedLng = data.office_lng;
                mapSavedRadius = data.office_radius || 150;
            }

            if (data.holidays) {
                localHolidays = JSON.parse(data.holidays);
                initializeSettingsCalendar();
            }

            if (data.exceptions) {
                const savedExceptions = JSON.parse(data.exceptions);
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

            if (data.custom_schedules) {
                customSchedules = JSON.parse(data.custom_schedules);
            } else {
                customSchedules = [];
            }
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

// THE AUTO-SAVE ENGINE
async function saveSettings() {
    const leader = getLeader();
    if (!leader) return;

    const subtitle = document.querySelector('.dash-header .subtitle');
    let originalText = "Organizational parameters";
    if (subtitle && !subtitle.innerText.includes("Saving")) {
        originalText = subtitle.innerText;
        subtitle.innerText = "Saving changes to cloud...";
        subtitle.style.color = "#f59e0b"; 
    }

    try {
        const exceptionRows = document.querySelectorAll('#exception-list div');
        let exceptionsArray = [];
        exceptionRows.forEach(row => {
            const inputs = row.querySelectorAll('input');
            if(inputs.length >= 3 && inputs[0].value && inputs[1].value && inputs[2].value) {
                exceptionsArray.push({
                    date: inputs[0].value,
                    start: inputs[1].value,
                    end: inputs[2].value
                });
            }
        });

        const { data: existingData } = await supabaseClient.from('settings').select('id').eq('company_id', leader.company_id).limit(1).maybeSingle();

        const payload = {
            check_in_start: document.getElementById('check-in-start') ? document.getElementById('check-in-start').value : "09:00",
            check_in_end: document.getElementById('check-in-end') ? document.getElementById('check-in-end').value : "10:00",
            require_gps: document.getElementById('require-gps') ? document.getElementById('require-gps').checked : false,
            require_pin: document.getElementById('require-pin') ? document.getElementById('require-pin').checked : false,
            holidays: JSON.stringify(localHolidays),
            exceptions: JSON.stringify(exceptionsArray),
            custom_schedules: JSON.stringify(customSchedules),
            company_id: leader.company_id
        };

        if (existingData) {
            await supabaseClient.from('settings').update(payload).eq('id', existingData.id);
        } else {
            await supabaseClient.from('settings').insert([payload]);
        }

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
            subtitle.innerText = "Error saving changes";
            subtitle.style.color = "red";
        }
    }
}

// --- CUSTOM EMPLOYEE TIME LOGIC ---
async function openCustomTimeModal() {
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
                select.innerHTML += `<option value="${s.email}">${s.name} (${s.role})</option>`;
            });
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
        alert("Please select an employee and set both times.");
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

        div.innerHTML = `
            <div style="display: flex; flex-direction: column;">
                <span style="font-size: 12px; font-weight: 600; color: #1a1a1a;">${c.name}</span>
                <span style="font-size: 10px; color: #888;">${c.start} - ${c.end}</span>
            </div>
            <button class="i-btn" style="color: #dc2626; border-color: #fca5a5; background: #fef2f2; width: 24px; height: 24px;" onclick="removeCustomTime('${c.email}')">X</button>
        `;
        list.appendChild(div);
    });
}

// --- DAILY PIN GENERATOR ---
async function loadTodayPIN() {
    const pinDisplay = document.getElementById('live-pin-display');
    const leader = getLeader();
    if (!pinDisplay || !supabaseClient || !leader) return;

    try {
        const { data } = await supabaseClient.from('settings').select('daily_pin').eq('company_id', leader.company_id).limit(1).maybeSingle();
        if (data && data.daily_pin) pinDisplay.innerText = data.daily_pin;
    } catch (err) { console.error(err); }
}

async function generateNewPIN() {
    const leader = getLeader();
    if (!supabaseClient || !leader) return;
    
    const newPin = Math.floor(1000 + Math.random() * 9000).toString();
    document.getElementById('live-pin-display').innerText = newPin;

    try {
        const { data: existingData } = await supabaseClient.from('settings').select('id').eq('company_id', leader.company_id).limit(1).maybeSingle();
        if (existingData) {
            await supabaseClient.from('settings').update({ daily_pin: newPin }).eq('id', existingData.id);
        } else {
            await supabaseClient.from('settings').insert([{ daily_pin: newPin, company_id: leader.company_id }]);
        }
    } catch (err) { console.error(err); }
}

// ==========================================
// --- LEAFLET MAP & GEOFENCING ENGINE ---
// ==========================================

let map = null;
let geofenceCircle = null;
let mapSavedLat = null;
let mapSavedLng = null;
let mapSavedRadius = 150;
let leafletLoaded = false;

// 1. Invisible Dynamic Map Injector (No HTML needed)
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
    if (document.getElementById('gps-map-modal') || !window.location.pathname.includes('settings')) return;
    
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

    // Hijack old pinpoint button if it exists
    const oldButton = document.querySelector('button[onclick="pinpointWorkplaceLocation()"]');
    if (oldButton) {
        oldButton.innerText = "📍 Edit Workplace Location & Radius";
        oldButton.onclick = openMapModal;
        oldButton.removeAttribute('onclick'); 
    }
}

// 2. Map Execution Functions
function handleGPSToggle() {
    const isChecked = document.getElementById('require-gps').checked;
    saveSettings(); 
    if (isChecked) {
        openMapModal();
    }
}

function openMapModal() {
    if (!leafletLoaded || typeof L === 'undefined') {
        alert("Loading map engine... Please try again in 2 seconds.");
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

async function confirmMapLocation() {
    const leader = getLeader();
    if (!leader || !map) return;

    const center = map.getCenter();
    const radius = document.getElementById('radius-slider').value;

    const saveBtn = document.getElementById('save-map-btn');
    saveBtn.innerText = "Saving to Cloud...";
    saveBtn.disabled = true;

    try {
        const { data: existingData } = await supabaseClient.from('settings').select('id').eq('company_id', leader.company_id).limit(1).maybeSingle();
        
        const payload = {
            office_lat: center.lat,
            office_lng: center.lng,
            office_radius: parseInt(radius),
            require_gps: true 
        };

        if (existingData) {
            await supabaseClient.from('settings').update(payload).eq('id', existingData.id);
        } else {
            payload.company_id = leader.company_id;
            await supabaseClient.from('settings').insert([payload]);
        }

        mapSavedLat = center.lat;
        mapSavedLng = center.lng;
        mapSavedRadius = radius;
        
        document.getElementById('require-gps').checked = true;

        saveBtn.innerText = "Saved Successfully!";
        saveBtn.style.backgroundColor = "#4ade80";
        saveBtn.style.color = "black";
        
        setTimeout(() => {
            closeMapModal();
            saveBtn.innerText = "Save Boundary & Close";
            saveBtn.style.backgroundColor = "#1a1a1a";
            saveBtn.style.color = "white";
            saveBtn.disabled = false;
        }, 1500);

    } catch (err) {
        console.error("Map Save Error:", err);
        alert("Failed to save location to cloud.");
        saveBtn.innerText = "Save Boundary & Close";
        saveBtn.disabled = false;
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

// ==========================================
// --- STAFF PORTAL & FULLY ENFORCED SCANNER ---
// ==========================================

let currentStaff = null; 
let scannerInterval = null;
let staffAnalyticsDate = new Date();

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
            sessionStorage.setItem('loggedInStaff', JSON.stringify(user));
            window.location.href = 'staff-dashboard.html';
        } else {
            alert("Incorrect email or password.");
            loginBtn.innerText = "Login";
            loginBtn.disabled = false;
        }
    } catch (err) {
        console.error("Staff Login Crash:", err);
        alert("Database Error: " + err.message);
        loginBtn.innerText = "Login";
        loginBtn.disabled = false;
    }
}

function loadStaffDashboard() {
    const checkInBtn = document.getElementById('check-in-btn');
    if (!checkInBtn) return; // Not on the staff dashboard page

    const sessionData = sessionStorage.getItem('loggedInStaff');
    if (!sessionData) {
        window.location.href = 'staff.html';
        return;
    }

    currentStaff = JSON.parse(sessionData);

    // Personalize Home Dashboard
    const dashHeader = document.querySelector('.dash-header h2');
    if (dashHeader && dashHeader.innerText.includes("Good Morning")) {
        dashHeader.innerText = `Good Morning, ${currentStaff.name.split(' ')[0]}`;
    }
    
    const avatar = document.getElementById('status-avatar');
    if (avatar && currentStaff.name) {
        avatar.innerText = currentStaff.name.split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase();
    }

    const logOutBtn = document.getElementById("secure-logout-btn");
    if (logOutBtn) {
        logOutBtn.onclick = function(e) {
            e.preventDefault();
            sessionStorage.removeItem('loggedInStaff');
            window.location.href = 'index.html';
        };
    }

    checkInBtn.onclick = function(event) {
        event.preventDefault(); 
        startDailyScanner();
    };

    // Load their cloud analytics immediately
    loadStaffRecords();
}

async function loadStaffRecords() {
    if (!currentStaff || !supabaseClient) return;

    try {
        const targetEmail = currentStaff.email;
        const { data: logs, error: logsErr } = await supabaseClient.from('attendance').select('*').eq('user_email', targetEmail).eq('company_id', currentStaff.company_id);
        if (logsErr) console.error("Logs error:", logsErr);

        const { data: settings, error: setErr } = await supabaseClient.from('settings').select('*').eq('company_id', currentStaff.company_id).limit(1).maybeSingle();
        if (setErr) console.error("Settings error:", setErr);

        const today = new Date();
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        let holidaysArray = [];
        if (settings && settings.holidays) holidaysArray = JSON.parse(settings.holidays);

        // --- POPULATE WORKSPACE TAB DYNAMICALLY ---
        if(document.getElementById('staff-window-display')) {
            document.getElementById('staff-window-display').innerText = `${settings?.check_in_start || "09:00"} - ${settings?.check_in_end || "10:00"}`;
        }
        
        const excDisplay = document.getElementById('staff-exception-display');
        if (excDisplay && settings?.exceptions) {
            const excArray = JSON.parse(settings.exceptions);
            const futureExc = excArray.filter(ex => new Date(ex.date) >= today).sort((a,b) => new Date(a.date) - new Date(b.date));
            if (futureExc.length > 0) {
                const next = futureExc[0];
                const parts = next.date.split('-');
                excDisplay.innerText = `${monthNames[parseInt(parts[1])-1]} ${parseInt(parts[2])} (${next.start} - ${next.end})`;
            } else {
                excDisplay.innerText = "None scheduled";
            }
        }

        const gpsDisplay = document.getElementById('staff-gps-display');
        if (gpsDisplay) {
            if (settings?.require_gps) {
                gpsDisplay.innerText = "ENABLED";
                gpsDisplay.style.color = "#4ade80";
                gpsDisplay.style.background = "#dcfce7";
            } else {
                gpsDisplay.innerText = "DISABLED";
                gpsDisplay.style.color = "#888";
                gpsDisplay.style.background = "#e8e8e8";
            }
        }

        const pinDisplay = document.getElementById('staff-pin-display');
        if (pinDisplay) {
            if (settings?.require_pin) {
                pinDisplay.innerText = "ENABLED";
                pinDisplay.style.color = "#4ade80";
                pinDisplay.style.background = "#dcfce7";
            } else {
                pinDisplay.innerText = "DISABLED";
                pinDisplay.style.color = "#888";
                pinDisplay.style.background = "#e8e8e8";
            }
        }

        // --- POPULATE LEDGER HEADERS ---
        if(document.getElementById('staff-ledger-name')) document.getElementById('staff-ledger-name').innerText = currentStaff.name;
        if(document.getElementById('staff-ledger-role')) document.getElementById('staff-ledger-role').innerText = currentStaff.role;
        if(document.getElementById('staff-ledger-joined')) document.getElementById('staff-ledger-joined').innerText = currentStaff.joined_date || "N/A";

        let workingDays = 1;
        if (currentStaff.joined_date) {
            const joinedDate = new Date(currentStaff.joined_date);
            workingDays = 0;
            for (let d = new Date(joinedDate); d <= today; d.setDate(d.getDate() + 1)) {
                const dateStr = getUniversalDate(d);
                if (!holidaysArray.includes(dateStr)) workingDays++;
            }
            if (workingDays === 0) workingDays = 1; 
        }

        const totalChecks = logs ? logs.length : 0;
        if(document.getElementById('staff-ledger-checkins')) document.getElementById('staff-ledger-checkins').innerText = `${totalChecks} / ${workingDays}`;
        if(document.getElementById('staff-ledger-avg')) document.getElementById('staff-ledger-avg').innerText = calculateAvgCheckInTime(logs);
        
        let percent = Math.round((totalChecks / workingDays) * 100);
        if (percent > 100) percent = 100;
        const percentBox = document.getElementById('staff-ledger-percent');
        if(percentBox) {
            percentBox.innerText = `${percent}%`;
            percentBox.style.color = percent >= 80 ? '#4ade80' : (percent >= 50 ? '#f59e0b' : '#ef4444');
        }

        // --- DYNAMIC STATUS LOGIC ---
        const todayStr2 = getUniversalDate(today);
        const isHoliday = holidaysArray.includes(todayStr2);
        const checkedInToday = logs && logs.some(log => log.date === todayStr2);

        const statusBox = document.getElementById('staff-ledger-status');
        if (statusBox) {
            if (isHoliday) {
                statusBox.innerText = "Holiday / Off";
                statusBox.style.color = "#a0a0a0";
                
                const homeStatusText = document.getElementById('status-text');
                if (homeStatusText) homeStatusText.innerText = "Holiday / Off";
                
                const checkInBtn = document.getElementById('check-in-btn');
                if (checkInBtn) checkInBtn.style.display = "none";
            } else if (checkedInToday) {
                statusBox.innerText = "Present";
                statusBox.style.color = "#4ade80";
                
                const card = document.getElementById('status-card');
                if (card) {
                    card.innerHTML = `
                        <div class="avatar" style="width: 64px; height: 64px; font-size: 22px; margin: 0 auto 15px auto; background-color: #1a1a1a; color: #ffffff;">✓</div>
                        <h3 style="margin: 0; font-size: 18px; color: #1a1a1a;">Checked In</h3>
                    `;
                    card.classList.remove('ghost-theme');
                    card.style.border = '1px solid #e0e0e0';
                    card.style.backgroundColor = '#ffffff';
                }
            } else {
                statusBox.innerText = "Absent";
                statusBox.style.color = "#ef4444";
            }
        }

        // --- RENDER CALENDAR ---
        const calendarGrid = document.getElementById('staff-analytics-calendar');
        if (calendarGrid) {
            const year = staffAnalyticsDate.getFullYear();
            const month = staffAnalyticsDate.getMonth();
            
            if(document.getElementById('cal-month-display')) document.getElementById('cal-month-display').innerText = `${monthNames[month]} ${year}`;

            calendarGrid.innerHTML = `
                <div class="cal-day" style="border: none; font-weight: bold; color: #888;">S</div><div class="cal-day" style="border: none; font-weight: bold; color: #888;">M</div><div class="cal-day" style="border: none; font-weight: bold; color: #888;">T</div><div class="cal-day" style="border: none; font-weight: bold; color: #888;">W</div><div class="cal-day" style="border: none; font-weight: bold; color: #888;">T</div><div class="cal-day" style="border: none; font-weight: bold; color: #888;">F</div><div class="cal-day" style="border: none; font-weight: bold; color: #888;">S</div>
            `;

            const firstDayIndex = new Date(year, month, 1).getDay();
            const daysInMonth = new Date(year, month + 1, 0).getDate();

            for (let i = 0; i < firstDayIndex; i++) {
                calendarGrid.insertAdjacentHTML('beforeend', `<div class="cal-day" style="border: none;"></div>`);
            }

            for (let day = 1; day <= daysInMonth; day++) {
                const currentIterationDate = new Date(year, month, day);
                const dateStrIteration = getUniversalDate(currentIterationDate);
                const wasPresent = logs && logs.some(log => log.date === dateStrIteration);
                
                let styleClass = "cal-day";
                if (holidaysArray.includes(dateStrIteration)) {
                    styleClass = "cal-day cal-holiday";
                } else if (wasPresent) { 
                    styleClass = "cal-day cal-present"; 
                } else if (currentIterationDate <= today) { 
                    styleClass = "cal-day cal-absent"; 
                }
                
                calendarGrid.insertAdjacentHTML('beforeend', `<div class="${styleClass}">${day}</div>`);
            }
        }

        // --- NEXT UPCOMING HOLIDAY ---
        const nextHolidayBox = document.getElementById('staff-next-holiday');
        if (nextHolidayBox) {
            const upcoming = holidaysArray.filter(d => new Date(d) >= today).sort();
            if (upcoming.length > 0) {
                const parts = upcoming[0].split('-');
                nextHolidayBox.innerText = `${monthNames[parseInt(parts[1])-1]} ${parseInt(parts[2])}, ${parts[0]}`;
            } else {
                nextHolidayBox.innerText = "No upcoming holidays";
            }
        }

    } catch (err) { console.error("Error loading staff ledger:", err); }
}

function changeStaffMonth(offset) {
    staffAnalyticsDate.setMonth(staffAnalyticsDate.getMonth() + offset);
    loadStaffRecords(); 
}

function switchStaffTab(tabName) {
    document.getElementById('view-home').style.display = 'none';
    document.getElementById('view-records').style.display = 'none';
    document.getElementById('view-settings').style.display = 'none';
    
    document.getElementById('nav-home').classList.remove('active');
    document.getElementById('nav-records').classList.remove('active');
    document.getElementById('nav-settings').classList.remove('active');
    
    document.getElementById('view-' + tabName).style.display = 'block';
    document.getElementById('nav-' + tabName).classList.add('active');
    
    if (tabName === 'records') loadStaffRecords();
}

function openStaffModal(title, desc) {
    document.getElementById('staff-modal-title').innerText = title;
    document.getElementById('staff-modal-desc').innerText = desc;
    document.getElementById('staff-modal').style.display = 'flex';
}

async function startDailyScanner() {
    if (!currentStaff) {
        alert("Session Expired. Please log in again.");
        window.location.href = 'staff.html';
        return;
    }

    try {
        let now = new Date();
        try {
            const timeRes = await fetch('https://worldtimeapi.org/api/ip');
            if (timeRes.ok) {
                const timeData = await timeRes.json();
                now = new Date(timeData.datetime);
            }
        } catch (e) {
            console.warn("Time sync failed, using local time.");
        }
        
        const todayDateStr = getUniversalDate(now);

        const { data: existingLog } = await supabaseClient
            .from('attendance')
            .select('id')
            .eq('user_email', currentStaff.email)
            .eq('company_id', currentStaff.company_id)
            .eq('date', todayDateStr)
            .maybeSingle();

        if (existingLog) {
            alert("Action Denied 🚫\n\nYou have already checked in today. Duplicate scans are not permitted.");
            return;
        }

        const { data: rules, error: rulesErr } = await supabaseClient.from('settings').select('*').eq('company_id', currentStaff.company_id).limit(1).maybeSingle();
        if (rulesErr) throw rulesErr;

        if (rules && rules.holidays) {
            const holidayArray = JSON.parse(rules.holidays);
            if (holidayArray.includes(todayDateStr)) {
                alert("Scanner Locked 🔒\n\nToday has been declared an official Holiday by your organization. Enjoy your day off!");
                return;
            }
        }

        let allowedStart = rules && rules.check_in_start ? rules.check_in_start : "09:00";
        let allowedEnd = rules && rules.check_in_end ? rules.check_in_end : "10:00";

        if (rules && rules.custom_schedules) {
            const customArray = JSON.parse(rules.custom_schedules);
            const myCustom = customArray.find(c => c.email === currentStaff.email);
            if (myCustom) {
                allowedStart = myCustom.start;
                allowedEnd = myCustom.end;
            }
        }

        if (rules && rules.exceptions) {
            const exceptionsArray = JSON.parse(rules.exceptions);
            const todayException = exceptionsArray.find(ex => ex.date === todayDateStr);
            if (todayException) {
                allowedStart = todayException.start;
                allowedEnd = todayException.end;
            }
        }

        const currentHours = String(now.getHours()).padStart(2, '0');
        const currentMinutes = String(now.getMinutes()).padStart(2, '0');
        const currentTime = `${currentHours}:${currentMinutes}`;

        if (currentTime < allowedStart || currentTime > allowedEnd) {
            alert(`Scanner Locked 🔒\n\nYou can only check in between ${allowedStart} and ${allowedEnd}.`);
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

            // Use the dynamically saved radius from the map, default to 150 if missing
            const allowedRadius = rules.office_radius ? rules.office_radius : 150;
            const distanceMeters = calculateDistanceMeters(position.coords.latitude, position.coords.longitude, rules.office_lat, rules.office_lng);

            if (distanceMeters > allowedRadius) {
                alert(`Geofence Violation 🚫\n\nYou are too far from the office (${Math.round(distanceMeters)} meters away). You must be within ${allowedRadius} meters to clock in.`);
                return;
            }
        }

        const statusCard = document.getElementById('status-card');
        statusCard.innerHTML = `
            <div id="scanner-container" style="position: relative; width: 100%; border-radius: 8px; overflow: hidden; border: 3px solid #1a1a1a; background-color: #000; margin-bottom: 15px;">
                <video id="staff-video" width="100%" height="auto" autoplay muted playsinline></video>
            </div>
            <p id="scanner-status" style="font-size: 12px; color: #f59e0b; font-weight: bold; margin: 0;">LOADING AI MODELS...</p>
        `;

        const video = document.getElementById('staff-video');
        const scannerStatus = document.getElementById('scanner-status');

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
            document.getElementById('scanner-container').append(canvas);

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

                        scannerStatus.innerText = "MATCH FOUND! SYNCING ATTENDANCE...";
                        
                        supabaseClient.from('attendance').insert([{
                            user_email: currentStaff.email,
                            user_name: currentStaff.name,
                            date: todayDateStr,
                            time: timeStr,
                            status: 'Present',
                            company_id: currentStaff.company_id // Safely logged to the specific workspace
                        }]).then(({ error }) => {
                            if (error) {
                                alert("Failed to log attendance to cloud!");
                                return;
                            }
                            
                            statusCard.innerHTML = `
                                <div class="avatar" style="width: 64px; height: 64px; font-size: 22px; margin: 0 auto 15px auto; background-color: #1a1a1a; color: #ffffff;">✓</div>
                                <h3 style="margin: 0; font-size: 18px; color: #1a1a1a;">Checked In</h3>
                                <p style="font-size: 12px; color: #4ade80; margin-top: 5px; font-weight: 600;">Successfully clocked in at ${timeStr}</p>
                            `;
                            statusCard.classList.remove('ghost-theme');
                            statusCard.style.border = '1px solid #e0e0e0';
                            statusCard.style.backgroundColor = '#ffffff';
                            
                            loadStaffRecords();
                        });
                    }
                } else {
                    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
                }
            }, 500); 
        };
    } catch (err) {
        alert("System verification failed.");
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
    
    // Auto-save added to input onchange events
    exceptionDiv.innerHTML = `
        <input type="date" class="input-field" style="width: 40%; padding: 8px; font-size: 11px;" onchange="saveSettings()">
        <input type="time" class="input-field" style="width: 25%; padding: 8px; font-size: 11px;" onchange="saveSettings()" onclick="try{this.showPicker();}catch(e){}">
        <input type="time" class="input-field" style="width: 25%; padding: 8px; font-size: 11px;" onchange="saveSettings()" onclick="try{this.showPicker();}catch(e){}">
        <button class="i-btn" style="color: #dc2626; border-color: #fca5a5; background: #fef2f2; flex-shrink: 0;" onclick="this.parentElement.remove(); updateExceptionCount(); saveSettings();">X</button>
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

// Safari Time Fix
function bindTimePickerFix() {
    const t1 = document.getElementById('check-in-start');
    const t2 = document.getElementById('check-in-end');
    if(t1) t1.onclick = function() { try{ this.showPicker(); }catch(e){} };
    if(t2) t2.onclick = function() { try{ this.showPicker(); }catch(e){} };
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
    
    // Auto-inject Map completely via JS
    injectMapDependencies();
    injectMapModalHTML();
    bindGPSControls();
    
    // Bypass Safari Time Highlight Bug
    bindTimePickerFix();

    loadSettings(); 
    loadTodayPIN(); 
    loadStaffDashboard(); 
});