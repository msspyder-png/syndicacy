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
    if (typeof faceapi === 'undefined') {
        await new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/face-api.js@0.22.2/dist/face-api.min.js';
            script.onload = resolve;
            document.head.appendChild(script);
        });
    }
}

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
    holiday: "background-color: #1a1a1a !important; color: #ffffff !important; border: 1px solid #1a1a1a !important; font-weight: bold;",
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
    
    // Auto-inject the clean UI modal into the page if it doesn't exist
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
        modalEl.style.display = 'flex';
    }
}

function closeInfoModal() {
    const modalEl = document.getElementById('info-modal');
    if (modalEl) modalEl.style.display = 'none';
}

function openConfirmModal(title, desc, onConfirm) {
    const titleEl = document.getElementById('confirm-title');
    const descEl = document.getElementById('confirm-desc');
    const modalEl = document.getElementById('confirm-modal');
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
        
        modalEl.style.display = 'flex';
    }
}
function closeConfirmModal() {
    const modalEl = document.getElementById('confirm-modal');
    if (modalEl) modalEl.style.display = 'none';
}

// --- NEW PROMPT MODAL CONTROLS ---
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

// --- SMART AUTHENTICATION (DETECTIVE MODE) ---
async function handleLeaderAuth() {
    await ensureSupabase();
    try {
        const emailInput = document.getElementById('user-email').value.trim();
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
                if (!user.company_id) {
                    user.company_id = "COMP_" + Math.random().toString(36).substr(2, 9).toUpperCase();
                    await supabaseClient.from('users').update({ company_id: user.company_id }).eq('id', user.id);
                }
                
                // Clear any lingering staff sessions to prevent data bleeding
                sessionStorage.removeItem('loggedInStaff');
                sessionStorage.setItem('loggedInLeader', JSON.stringify(user));
                window.location.href = 'leader-dashboard.html';
            } else {
                openInfoModal("Access Denied", "Incorrect password for this email account.");
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
                openInfoModal("Email Error", "Failed to send OTP email.");
                enterButton.disabled = false;
                enterButton.innerText = "Enter";
                enterButton.style.backgroundColor = "#1a1a1a"; 
            });
        }
    } catch (criticalError) {
        openInfoModal("System Crash", "APP CRASHED! Error: " + criticalError.message);
        document.querySelector('.form-btn').disabled = false;
        document.querySelector('.form-btn').innerText = "Enter";
        document.querySelector('.form-btn').style.backgroundColor = "#1a1a1a"; 
    }
}

// --- VERIFY OTP & REGISTER TO CLOUD DATABASE ---
async function verifyOTP() {
    await ensureSupabase();
    try {
        const inputs = document.querySelectorAll('.otp-field');
        let typedOTP = "";
        inputs.forEach(input => { typedOTP += input.value.trim(); });
        const savedOTP = sessionStorage.getItem("savedOTP");

        if (typedOTP !== "" && typedOTP === savedOTP) {
            const newEmail = sessionStorage.getItem("pendingEmail");
            const newPass = sessionStorage.getItem("pendingPass");
            const today = getUniversalDate();
            
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
            
            sessionStorage.removeItem('loggedInStaff');
            sessionStorage.setItem('loggedInLeader', JSON.stringify(data[0]));
            window.location.href = 'leader-dashboard.html'; 
        } else {
            openInfoModal("Verification Failed", "Incorrect OTP. Please try again.");
        }
    } catch (criticalError) {
        openInfoModal("System Crash", "APP CRASHED during OTP! Error: " + criticalError.message);
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
    await ensureSupabase();
    const leader = getLeader();
    if (!leader) { openInfoModal("Session Expired", "Please log in again."); return null; }

    const nameEl = document.getElementById('staff-name');
    const emailEl = document.getElementById('staff-email');
    const roleSelectEl = document.getElementById('staff-role');
    
    if (!nameEl || !emailEl || !roleSelectEl) return null;
    
    const name = nameEl.value.trim();
    const email = emailEl.value.trim();
    let role = roleSelectEl.value === 'other' ? document.getElementById('custom-role').value.trim() : roleSelectEl.value;
    
    if (!name || !email || !role || roleSelectEl.value === "") {
        openInfoModal("Missing Info", "Please complete all fields."); 
        return null;
    }
    
    if (!supabaseClient) { 
        openInfoModal("Connection Error", "Database connection is not ready."); 
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
        openInfoModal("Error", "Error creating invite: " + error.message);
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
        openInfoModal("Error", "Error approving employee: " + err.message);
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
}

// --- EMPLOYEE JOIN PAGE (READING & ENFORCING LINK SECURITY) ---
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

// --- START ONBOARDING CAMERA (JOIN.HTML) ---
async function startFaceScan() {
    await ensureFaceApi();
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
        openInfoModal("Camera Error", "Please check your browser permissions.");
        aiStatus.innerText = "ERROR: Could not access camera.";
        aiStatus.style.color = "red";
    }
}

// --- CAPTURE ONBOARDING FACE & SNAPSHOT ---
async function captureFace() {
    await ensureSupabase();
    await ensureFaceApi();
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
            openInfoModal("Scan Failed", "No face detected clearly! Please look straight at the camera.");
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
        openInfoModal("Error", "Error saving biometric data.");
        if (captureBtn) { captureBtn.disabled = false; captureBtn.innerText = "Scan My Face"; }
    }
}

// --- DASHBOARD LIVE ATTENDANCE ---
async function loadTodayAttendance() {
    const activeList = document.getElementById('active-today-list');
    const pendingList = document.getElementById('pending-today-list');
    const leader = getLeader();

    if (!activeList || !pendingList || !leader) return;
    await ensureSupabase();

    const todayStr = getUniversalDate();

    try {
        const { data: staffMembers, error: staffErr } = await supabaseClient.from('users').select('*').neq('role', 'leader').eq('company_id', leader.company_id);
        if (staffErr) throw staffErr;

        // FIXED TABLE NAME: 'checkins'
        const { data: attendanceLogs, error: attErr } = await supabaseClient.from('checkins').select('*').eq('date', todayStr).eq('company_id', leader.company_id);
        if (attErr) throw attErr;

        activeList.innerHTML = "";
        pendingList.innerHTML = "";

        let activeCount = 0;
        let pendingCount = 0;

        (staffMembers || []).forEach(staff => {
            const log = (attendanceLogs || []).find(a => a.user_email === staff.email && a.status === 'Present');
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
    if (!tableBody || !leader) return;
    await ensureSupabase();

    try {
        const { data: staff } = await supabaseClient.from('users').select('*').neq('role', 'leader').eq('company_id', leader.company_id);
        
        // FIXED TABLE NAME: 'checkins'
        const { data: attendance } = await supabaseClient.from('checkins').select('*').eq('company_id', leader.company_id);
        const { data: settings } = await supabaseClient.from('settings').select('holidays').eq('company_id', leader.company_id).limit(1).maybeSingle();
        
        let holidaysArray = [];
        try { if (settings && settings.holidays) holidaysArray = JSON.parse(settings.holidays); } catch(e){}

        tableBody.innerHTML = ""; 

        if (!staff || staff.length === 0) {
            tableBody.innerHTML = `<tr><td colspan="5" style="padding: 20px; text-align: center; color: #888;">No active staff found.</td></tr>`;
            return;
        }

        const today = new Date();
        const todayStr = getUniversalDate(today);

        staff.forEach(user => {
            const userLogs = attendance ? attendance.filter(log => log.user_email === user.email) : [];
            
            let validCheckinDates = new Set();
            let personalHolidaysSet = new Set();
            userLogs.forEach(log => {
                if (log.status === 'Holiday/Off') {
                    personalHolidaysSet.add(log.date);
                } else if (log.status === 'Present') {
                    const logDate = parseLocal(log.date);
                    if (logDate <= today) validCheckinDates.add(log.date);
                }
            });

            let workingDays = 0; 
            if (user.joined_date) {
                const joinedDate = parseLocal(user.joined_date);
                for (let d = new Date(joinedDate); d <= today; d.setDate(d.getDate() + 1)) {
                    const dateStr = getUniversalDate(d);
                    if (!holidaysArray.includes(dateStr) && !personalHolidaysSet.has(dateStr)) workingDays++;
                }
            }
            if (workingDays === 0) workingDays = 1; 

            const validCheckinCount = validCheckinDates.size;
            const attendPercent = Math.round((validCheckinCount / workingDays) * 100);
            const displayPercent = attendPercent > 100 ? 100 : attendPercent; 

            const presentLogs = userLogs.filter(log => log.status === 'Present');
            let avgTimeStr = calculateAvgCheckInTime(presentLogs);
            let percentColor = displayPercent >= 80 ? '#4ade80' : (displayPercent >= 50 ? '#f59e0b' : '#ef4444');

            const checkedInToday = presentLogs.some(log => log.date === todayStr);
            const isHolidayToday = holidaysArray.includes(todayStr) || personalHolidaysSet.has(todayStr);

            let statusHtml;
            if (isHolidayToday) {
                statusHtml = `<span style="color:#888; font-weight:bold;">Holiday</span>`;
            } else if (checkedInToday) {
                statusHtml = `<span style="color:#4ade80; font-weight:bold;">Active</span>`;
            } else {
                statusHtml = `<span style="color:#f59e0b; font-weight:bold;">Pending</span>`;
            }

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
    if (!calendarGrid || !leader) return; 
    await ensureSupabase();

    const urlParams = new URLSearchParams(window.location.search);
    const targetEmail = urlParams.get('email');
    if (!targetEmail) return;

    try {
        const { data: user } = await supabaseClient.from('users').select('*').eq('email', targetEmail).maybeSingle();
        
        // FIXED TABLE NAME: 'checkins'
        const { data: logs } = await supabaseClient.from('checkins').select('*').eq('user_email', targetEmail);
        const { data: settings } = await supabaseClient.from('settings').select('holidays').eq('company_id', leader.company_id).limit(1).maybeSingle();

        currentViewedUser = user;

        let holidaysArray = [];
        try { if (settings && settings.holidays) holidaysArray = JSON.parse(settings.holidays); } catch(e){}
        if (!Array.isArray(holidaysArray)) holidaysArray = [];

        document.getElementById('analytics-header').style.display = 'block';
        document.getElementById('credentials-card').style.display = 'block';
        
        updateElementSafe('employee-name-title', user?.name || "Unknown");
        updateElementSafe('employee-role-title', user?.role || "Unknown");
        updateElementSafe('employee-joined-box', user?.joined_date || "N/A");
        updateElementSafe('emp-cred-email', user?.email || "No Email");
        
        const firstName = user?.name ? user.name.split(' ')[0] : 'Staff';
        updateElementSafe('email-staff-btn', `Email ${firstName}`);

        const today = new Date();
        today.setHours(0,0,0,0);
        
        let safeLogs = Array.isArray(logs) ? logs : [];
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

        // --- PROPER TOTAL WORKING DAYS CALCULATION ---
        let workingDays = 0; 
        if (user && user.joined_date) {
            const joinedDate = parseLocal(user.joined_date);
            // We loop from join date UP TO today (inclusive) to find out exactly how many days they were SUPPOSED to work
            for (let d = new Date(joinedDate); d <= today; d.setDate(d.getDate() + 1)) {
                const dateStr = getUniversalDate(d);
                // If it is NOT a holiday, then it counts as a required working day
                if (!holidaysArray.includes(dateStr) && !personalHolidaysSet.has(dateStr)) {
                    workingDays++;
                }
            }
        }
        
        // Failsafe
        if (workingDays === 0) workingDays = 1; 

        const totalChecks = validCheckinDates.size;
        updateElementSafe('total-checkins-value', `${totalChecks} / ${workingDays}`);
        updateElementSafe('avg-in-time', calculateAvgCheckInTime(safeLogs.filter(l => l.status === 'Present')));
        
        let percent = Math.round((totalChecks / workingDays) * 100);
        if (percent > 100) percent = 100; 
        
        updateElementSafe('attendance-percent-box', `${percent}%`, percent >= 80 ? '#4ade80' : (percent >= 50 ? '#f59e0b' : '#ef4444'));

        const todayStr2 = getUniversalDate(today);
        const checkedInToday = validCheckinDates.has(todayStr2);

        // --- NEW TODAY'S STATUS LOGIC (PRO UPGRADE) ---
        try {
            const labels = document.querySelectorAll('.stat-label');
            let statusLabelEl = Array.from(labels).find(el => el.innerText.trim().toUpperCase() === 'SYSTEM STATUS');
            
            if (statusLabelEl) {
                statusLabelEl.innerText = "TODAY'S STATUS";
                const statusValueEl = statusLabelEl.nextElementSibling;
                
                if (statusValueEl) {
                    let todayStatus = "Not Yet";
                    let todayColor = "#f59e0b"; 

                    if (holidaysArray.includes(todayStr2) || personalHolidaysSet.has(todayStr2)) {
                        todayStatus = "Holiday / Off";
                        todayColor = "#a0a0a0"; 
                    } else if (checkedInToday) {
                        todayStatus = "Present";
                        todayColor = "#4ade80"; 
                    } else {
                        let allowedEnd = settings && settings.check_in_end ? settings.check_in_end : "10:00";
                        
                        if (settings && settings.custom_schedules) {
                            let customArray = []; try { customArray = JSON.parse(settings.custom_schedules); } catch(e){}
                            const myCustom = customArray.find(c => c.email === targetEmail);
                            if (myCustom) allowedEnd = myCustom.end;
                        }

                        if (settings && settings.exceptions) {
                            let exceptionsArray = []; try { exceptionsArray = JSON.parse(settings.exceptions); } catch(e){}
                            const todayException = exceptionsArray.find(ex => ex.date === todayStr2);
                            if (todayException) allowedEnd = todayException.end;
                        }

                        const now = new Date();
                        const currentHours = String(now.getHours()).padStart(2, '0');
                        const currentMinutes = String(now.getMinutes()).padStart(2, '0');
                        const currentTime = `${currentHours}:${currentMinutes}`;

                        if (currentTime > allowedEnd) {
                            todayStatus = "Absent";
                            todayColor = "#ef4444"; 
                        }
                    }

                    statusValueEl.innerText = todayStatus;
                    statusValueEl.style.color = todayColor;
                }
            }
        } catch(e) { console.warn("Could not update system status UI"); }
        // ----------------------------------------------

        const year = analyticsDate.getFullYear();
        const month = analyticsDate.getMonth();
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        
        const empJoinedDate = user && user.joined_date ? parseLocal(user.joined_date) : new Date();

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

        const nowStrict = new Date();
        nowStrict.setHours(0,0,0,0);

        for (let day = 1; day <= daysInMonth; day++) {
            const currentIterationDate = new Date(year, month, day);
            const dateStrIteration = getUniversalDate(currentIterationDate);
            
            const wasPresent = validCheckinDates.has(dateStrIteration);
            const isPersonalHoliday = personalHolidaysSet.has(dateStrIteration);
            const isCommonHoliday = holidaysArray.includes(dateStrIteration);
            const isPast = currentIterationDate < nowStrict;
            const isToday = dateStrIteration === getUniversalDate(nowStrict);
            
            let inlineStyle = CAL_STYLES.default;
            
            if (currentIterationDate < empJoinedDate) {
                inlineStyle = CAL_STYLES.disabled;
            } else if (isCommonHoliday || isPersonalHoliday) {
                inlineStyle = CAL_STYLES.holiday;
            } else if (currentIterationDate > today) {
                inlineStyle = CAL_STYLES.default;
            } else if (wasPresent) { 
                inlineStyle = CAL_STYLES.present; 
            } else { 
                inlineStyle = CAL_STYLES.absent; 
            }

            let cursorStyle = "cursor: default;";
            let clickAttr = "";

            if (currentIterationDate >= empJoinedDate) {
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
        openInfoModal('Common Holiday', 'This day is a common holiday for all employees. To change this, please go to the Settings tab.');
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

// --- SECURE PASSWORD REVEAL (STRICTLY ENFORCED) ---
async function revealPassword() {
    if (!currentViewedUser) return;
    
    openPromptModal(
        "SECURITY CHECK", 
        "Enter your Leader Password to reveal staff credentials.", 
        "password", 
        "", 
        async function(bossPass) {
            if (!bossPass) return;

            const leader = getLeader();
            if (!leader) return;
            await ensureSupabase();

            try {
                const { data: leaders, error } = await supabaseClient
                    .from('users')
                    .select('*')
                    .eq('role', 'leader')
                    .eq('password', bossPass.trim())
                    .eq('company_id', leader.company_id);

                if (error || !leaders || leaders.length === 0) {
                    openInfoModal("ACCESS DENIED", "Incorrect leader password.");
                    return;
                }

                updateElementSafe('emp-cred-pass', `Password: ${currentViewedUser.password}`);
                document.getElementById('emp-cred-pass').style.display = 'block';

            } catch (err) {
                console.error(err);
                openInfoModal("Error", "Verification error occurred.");
            }
        }
    );
}

// --- EMAIL CREDENTIALS TO STAFF ---
async function emailCredentials() {
    if (!currentViewedUser) return;
    
    openPromptModal(
        "SECURITY CHECK", 
        "Enter your Leader Password to send staff credentials.", 
        "password", 
        "", 
        async function(bossPass) {
            if (!bossPass) return;
            
            const leader = getLeader();
            if (!leader) return;
            await ensureSupabase();

            try {
                const { data: leaders, error } = await supabaseClient
                    .from('users')
                    .select('*')
                    .eq('role', 'leader')
                    .eq('password', bossPass.trim())
                    .eq('company_id', leader.company_id);

                if (error || !leaders || leaders.length === 0) {
                    openInfoModal("ACCESS DENIED", "Incorrect leader password. Email not sent.");
                    return;
                }

                const subject = encodeURIComponent(`Your SYNDICACY Access Credentials`);
                const body = encodeURIComponent(`Hi ${currentViewedUser.name},\n\nHere,s your secure access credentials for the SYNDICACY portal:\n\nEmail: ${currentViewedUser.email}\nPassword: ${currentViewedUser.password}\n\nIMPORTANT SECURITY NOTE: Please delete this email immediately after logging in for the first time to maintain account security.\n\nBest,\nManagement`);
                
                window.location.href = `mailto:${currentViewedUser.email}?subject=${subject}&body=${body}`;

            } catch (err) {
                console.error(err);
                openInfoModal("Error", "Error sending credentials.");
            }
        }
    );
}

// --- RENAME EMPLOYEE ---
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

// --- TEAM DIRECTORY ---
async function loadTeamDirectory() {
    const directoryList = document.getElementById('directory-list');
    const leader = getLeader();
    if (!directoryList || !leader) return;
    await ensureSupabase();

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
let settingsDate = new Date();
let sundaysToggled = false;
let saturdaysToggled = false;

function initializeSettingsCalendar() {
    const calendar = document.getElementById('settings-calendar');
    if (!calendar) return; 

    const leader = getLeader();
    let joinedDate = leader && leader.joined_date ? new Date(leader.joined_date) : new Date(2000, 0, 1);
    joinedDate.setHours(0,0,0,0);

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

    const nowStrict = new Date();
    // Normalize to start of day to avoid timezone hour shifts
    nowStrict.setHours(0,0,0,0);

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
        
        const isToday = (dateStr === getUniversalDate(nowStrict));
        
        // Prevent editing past days relative to current date
        const isPastDay = currentIterationDate < nowStrict;
        const isHoliday = localHolidays.includes(dateStr);

        if (currentIterationDate < joinedDate) {
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
    const leader = getLeader();
    let joinedDate = leader && leader.joined_date ? new Date(leader.joined_date) : new Date(now.getFullYear(), 0, 1);
    joinedDate.setHours(0,0,0,0);
    
    const maxYear = (now.getMonth() === 11 && now.getDate() >= 25) ? now.getFullYear() + 1 : now.getFullYear();
    const endDate = new Date(maxYear, 11, 31);
    
    sundaysToggled = !sundaysToggled;
    
    for (let d = new Date(joinedDate); d <= endDate; d.setDate(d.getDate() + 1)) {
        if (d.getDay() === 0) {
            const dateStr = getUniversalDate(d);
            const isToday = (dateStr === getUniversalDate(now));
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
    const leader = getLeader();
    let joinedDate = leader && leader.joined_date ? new Date(leader.joined_date) : new Date(now.getFullYear(), 0, 1);
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
                            const isToday = (dateStr === getUniversalDate(now));
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
    const leader = getLeader();
    if (!startInput || !leader) return;
    await ensureSupabase();

    try {
        const { data: fresh } = await supabaseClient.from('users').select('*').eq('email', leader.email).maybeSingle();
        if (fresh) { 
            leader = fresh; 
            sessionStorage.setItem('loggedInLeader', JSON.stringify(fresh)); 
        }
    } catch(e) {}

    try {
        const todayStr = getUniversalDate();
        const { count } = await supabaseClient.from('checkins').select('*', { count: 'exact', head: true }).eq('company_id', leader.company_id).eq('date', todayStr);
        window.todayCheckinsCount = count || 0;
    } catch(e) { window.todayCheckinsCount = 0; }

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
                try { savedExceptions = JSON.parse(data.exceptions); } catch(e){}
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
                try { customSchedules = JSON.parse(data.custom_schedules); } catch(e){}
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
    await ensureSupabase();

    const subtitle = document.querySelector('.dash-header .subtitle');
    let originalText = subtitle ? subtitle.innerText : "Organizational parameters";
    if (subtitle && !subtitle.innerText.includes("Saving")) {
        subtitle.innerText = "Saving changes to cloud...";
        subtitle.style.color = "#f59e0b"; 
    }

    try {
        let safeCompanyId = leader.company_id;
        if (!safeCompanyId) {
            safeCompanyId = "COMP_" + Math.random().toString(36).substr(2, 9).toUpperCase();
            await supabaseClient.from('users').update({ company_id: safeCompanyId }).eq('id', leader.id);
            leader.company_id = safeCompanyId;
            sessionStorage.setItem('loggedInLeader', JSON.stringify(leader));
        }

        const { data: existingData } = await supabaseClient.from('settings').select('*').eq('company_id', safeCompanyId).limit(1).maybeSingle();

        // Start with a blank payload containing only the company ID
        let payload = { company_id: safeCompanyId };

        // If existing data is found, copy it into our payload so we don't accidentally wipe fields we aren't viewing
        if (existingData) {
            payload = { ...existingData };
        }

        // 1. ONLY update Calendar & Parameter data if we are actively viewing the Settings page
        if (document.getElementById('check-in-start')) {
            payload.check_in_start = document.getElementById('check-in-start').value;
            payload.check_in_end = document.getElementById('check-in-end').value;
            payload.require_gps = document.getElementById('require-gps').checked;
            payload.require_pin = document.getElementById('require-pin').checked;
            
            let exceptionsArray = [];
            document.querySelectorAll('#exception-list div').forEach(row => {
                const inputs = row.querySelectorAll('input');
                if(inputs.length >= 3 && inputs[0].value && inputs[1].value && inputs[2].value) {
                    exceptionsArray.push({
                        date: inputs[0].value,
                        start: inputs[1].value,
                        end: inputs[2].value
                    });
                }
            });
            payload.exceptions = JSON.stringify(exceptionsArray);
            payload.holidays = JSON.stringify(localHolidays);
            payload.custom_schedules = JSON.stringify(customSchedules);
        }

        // 2. ONLY update GPS Locations data if we are actively viewing the Locations page
        if (document.getElementById('locations-list-container')) {
            payload.locations = JSON.stringify(workspaceLocations);
        }

        // Push the merged payload back to Supabase
        if (existingData) {
            await supabaseClient.from('settings').update(payload).eq('id', existingData.id);
        } else {
            await supabaseClient.from('settings').insert([payload]);
        }

        if (subtitle) {
            subtitle.innerText = "All changes saved ✓";
            subtitle.style.color = "#4ade80"; 
            setTimeout(() => {
                subtitle.innerText = originalText; 
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

// --- EXCEPTION DATES LOGIC ---
function addException() {
    const list = document.getElementById('exception-list');
    if (!list) return;

    if (list.children.length >= 5) {
        openInfoModal("Limit Reached", "You can only set up to 5 future exception dates.");
        return;
    }

    const div = document.createElement('div');
    div.style.display = 'flex';
    div.style.gap = '5px';
    div.style.marginBottom = '10px';
    div.style.alignItems = 'center';

    div.innerHTML = `
        <input type="date" class="input-field" style="flex: 2; padding: 8px; font-size: 11px; height: 32px;" onchange="saveSettings()">
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
        openInfoModal("Missing Info", "Please select an employee and set both times.");
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
    const activeState = document.getElementById('pin-active-state');
    const disabledState = document.getElementById('pin-disabled-state');
    const leader = getLeader();
    
    if (!leader) return;
    await ensureSupabase();

    try {
        const { data } = await supabaseClient.from('settings').select('daily_pin, require_pin').eq('company_id', leader.company_id).limit(1).maybeSingle();
        
        // Ensure we are on the page that actually has these elements before trying to modify them
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
                        // Fallback logic for any PINs saved before this strict update
                        pinValue = data.daily_pin;
                        savedDate = localStorage.getItem('last_pin_date_' + leader.company_id) || "";
                    }
                }

                if (savedDate !== todayStr || !pinValue) {
                    await generateNewPIN(); 
                } else {
                    pinDisplay.innerText = pinValue;
                }
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

// --- LEAFLET MAP & GEOFENCING ENGINE ---
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

    const oldButton = document.querySelector('button[onclick="pinpointWorkplaceLocation()"]');
    if (oldButton) {
        oldButton.innerText = "📍 Edit Workplace Location & Radius";
        oldButton.onclick = openMapModal;
        oldButton.removeAttribute('onclick'); 
    }
}

function handleGPSToggle() {
    const isChecked = document.getElementById('require-gps').checked;
    const locBtn = document.getElementById('manage-locations-btn');
    if (locBtn) {
        locBtn.style.display = isChecked ? 'block' : 'none';
    }
    saveSettings(); 
    
    // Auto-redirect ONLY if toggled ON and no Main Location map data is found
    if (isChecked) {
        if (typeof mapSavedLat !== 'undefined' && !mapSavedLat) {
            window.location.href = 'leader-locations.html';
        }
    }
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

// ==========================================
// --- STAFF PORTAL & DIRECT ID MAPPING ---
// ==========================================

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
        const { data: user, error } = await supabaseClient.from('users').select('*').eq('email', email).maybeSingle();
        if (error) throw error;

        if (user && user.password === pass) {
            sessionStorage.removeItem('loggedInLeader');
            sessionStorage.setItem('loggedInStaff', JSON.stringify(user));
            window.location.href = 'staff-dashboard.html';
        } else {
            openInfoModal("Login Failed", "Incorrect email or password.");
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
    await ensureSupabase();
    const sessionData = sessionStorage.getItem('loggedInStaff');
    if (!sessionData) return; 

    currentStaff = JSON.parse(sessionData);

    if (supabaseClient) {
        try {
            const { data: freshStaff } = await supabaseClient
                .from('users')
                .select('*')
                .eq('email', currentStaff.email)
                .maybeSingle();
                
            if (freshStaff) {
                currentStaff = freshStaff;
                sessionStorage.setItem('loggedInStaff', JSON.stringify(freshStaff));
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
        logOutBtn.onclick = function(e) {
            e.preventDefault();
            sessionStorage.removeItem('loggedInStaff');
            window.location.href = 'index.html';
        };
    }
}

async function loadStaffRecords() {
    await ensureSupabase();
    if (!currentStaff || !supabaseClient) return;

    try {
        const targetEmail = currentStaff.email;
        const safeCompanyId = currentStaff.company_id || "UNASSIGNED_ID";

        const { data: logs, error: logsErr } = await supabaseClient.from('checkins').select('*').eq('user_email', targetEmail).eq('company_id', safeCompanyId);
        if (logsErr) console.error("Logs error:", logsErr);

        const { data: settings, error: setErr } = await supabaseClient.from('settings').select('*').eq('company_id', safeCompanyId).limit(1).maybeSingle();
        if (setErr) console.error("Settings error:", setErr);

        const today = new Date();
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        
        let holidaysArray = [];
        try { if (settings && settings.holidays) holidaysArray = JSON.parse(settings.holidays); } catch(e){}
        if (!Array.isArray(holidaysArray)) holidaysArray = [];

        let safeLogs = Array.isArray(logs) ? logs : [];
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

        // CALCULATE LEDGER STATS SAFELY
        let workingDays = 0;
        if (currentStaff.joined_date) {
            const joinedDate = parseLocal(currentStaff.joined_date);
            for (let d = new Date(joinedDate); d <= today; d.setDate(d.getDate() + 1)) {
                const dateStr = getUniversalDate(d);
                if (!holidaysArray.includes(dateStr) && !personalHolidaysSet.has(dateStr)) workingDays++;
            }
        }
        if (workingDays === 0) workingDays = 1; 

        const totalChecks = validCheckinDates.size;
        
        let percent = Math.round((totalChecks / workingDays) * 100);
        if (percent > 100) percent = 100;
        
        const todayStr2 = getUniversalDate(today);
        const isHoliday = holidaysArray.includes(todayStr2) || personalHolidaysSet.has(todayStr2);
        const checkedInToday = validCheckinDates.has(todayStr2);

        let exceptionText = "None scheduled";
        if (settings && settings.exceptions) {
            let excArray = [];
            try { excArray = JSON.parse(settings.exceptions); } catch(e){}
            if (Array.isArray(excArray)) {
                const futureExc = excArray.filter(ex => new Date(ex.date) >= today).sort((a,b) => new Date(a.date) - new Date(b.date));
                if (futureExc.length > 0) {
                    const next = futureExc[0]; const parts = next.date.split('-');
                    exceptionText = `${monthNames[parseInt(parts[1])-1]} ${parseInt(parts[2])} (${next.start} - ${next.end})`;
                }
            }
        }

        // --- DIRECT DOM MAPPING ---
        try {
            updateElementSafe('staff-window-display', `${settings?.check_in_start || "09:00"} - ${settings?.check_in_end || "10:00"}`);
            updateElementSafe('staff-exception-display', exceptionText);

            const isGpsOn = settings && settings.require_gps;
            updateElementSafe('staff-gps-display', isGpsOn ? "ENABLED" : "DISABLED", isGpsOn ? "#4ade80" : "#888", isGpsOn ? "#dcfce7" : "#e8e8e8");

            const isPinOn = settings && settings.require_pin;
            updateElementSafe('staff-pin-display', isPinOn ? "ENABLED" : "DISABLED", isPinOn ? "#4ade80" : "#888", isPinOn ? "#dcfce7" : "#e8e8e8");

            updateElementSafe('staff-ledger-name', currentStaff.name || "Staff");
            updateElementSafe('staff-ledger-role', currentStaff.role || "Unknown Role");
            updateElementSafe('staff-ledger-joined', currentStaff.joined_date || "N/A");
            
            const checksEl = document.getElementById('staff-ledger-checkins') || document.getElementById('total-checkins-value');
            if(checksEl) { checksEl.innerText = `${totalChecks} / ${workingDays}`; checksEl.style.color = "#4ade80"; }

            const avgEl = document.getElementById('staff-ledger-avg') || document.getElementById('avg-in-time');
            if(avgEl) avgEl.innerText = calculateAvgCheckInTime(safeLogs.filter(l => l.status === 'Present'));

            const percentBox = document.getElementById('staff-ledger-percent') || document.getElementById('attendance-percent-box');
            if(percentBox) {
                percentBox.innerText = `${percent}%`;
                percentBox.style.color = percent >= 80 ? '#4ade80' : (percent >= 50 ? '#f59e0b' : '#ef4444');
            }

            const statusBox = document.getElementById('staff-ledger-status') || document.getElementById('employee-status-box');
            if (statusBox) {
                if (isHoliday) { statusBox.innerText = "Holiday/Off"; statusBox.style.color = "#a0a0a0"; }
                else if (checkedInToday) { statusBox.innerText = "Active"; statusBox.style.color = "#4ade80"; }
                else { statusBox.innerText = "Absent"; statusBox.style.color = "#ef4444"; }
            }

            const dashHeader = document.querySelector('.dash-header h2');
            if (dashHeader && dashHeader.innerText.includes("Good Morning")) {
                const shortName = currentStaff.name ? currentStaff.name.split(' ')[0] : 'Staff';
                dashHeader.innerText = `Good Morning, ${shortName}`;
            }
            
            updateElementSafe('status-avatar', currentStaff.name ? currentStaff.name.split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase() : '--');

            const statusCard = document.getElementById('status-card');
            const checkInBtn = document.getElementById('check-in-btn');
            if (statusCard && checkInBtn) {
                if (isHoliday) {
                    checkInBtn.style.display = "none";
                    updateElementSafe('status-text', "Holiday / Off");
                } else if (checkedInToday) {
                    statusCard.innerHTML = `<div class="avatar" style="width: 64px; height: 64px; font-size: 22px; margin: 0 auto 15px auto; background-color: #1a1a1a; color: #ffffff;">✓</div><h3 style="margin: 0; font-size: 18px; color: #1a1a1a;">Checked In</h3>`;
                    statusCard.classList.remove('ghost-theme');
                    statusCard.style.border = '1px solid #e0e0e0';
                    statusCard.style.backgroundColor = '#ffffff';
                } else {
                    updateElementSafe('status-text', "Pending Check-in");
                }
            }

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
        } catch (e) { console.warn("DOM mapping error"); }

        const calendarGrid = document.getElementById('staff-analytics-calendar') || document.getElementById('analytics-calendar');
        if (calendarGrid) {
            const year = staffAnalyticsDate.getFullYear();
            const month = staffAnalyticsDate.getMonth();
            
            const empJoinedDate = currentStaff && currentStaff.joined_date ? parseLocal(currentStaff.joined_date) : new Date();

            const monthTitle = document.getElementById('cal-month-display') || document.getElementById('calendar-month-title');
            if (monthTitle) {
                let prevDisabled = false;
                if (year < empJoinedDate.getFullYear() || (year === empJoinedDate.getFullYear() && month <= empJoinedDate.getMonth())) {
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
                
                if (document.getElementById('cal-month-display')) {
                    document.getElementById('cal-month-display').innerText = `${monthNames[month]} ${year}`;
                }
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
                const wasPresent = validCheckinDates.has(dateStrIteration);
                
                let inlineStyle = CAL_STYLES.default;
                
                if (currentIterationDate < empJoinedDate) {
                    inlineStyle = CAL_STYLES.disabled;
                } else if (holidaysArray.includes(dateStrIteration) || personalHolidaysSet.has(dateStrIteration)) {
                    inlineStyle = CAL_STYLES.holiday;
                } else if (currentIterationDate > today) {
                    inlineStyle = CAL_STYLES.default;
                } else if (wasPresent) { 
                    inlineStyle = CAL_STYLES.present; 
                } else { 
                    inlineStyle = CAL_STYLES.absent; 
                }
                
                calendarGrid.insertAdjacentHTML('beforeend', `<div class="cal-day" style="aspect-ratio: 1; display: flex; justify-content: center; align-items: center; font-size: 12px; border-radius: 4px; ${inlineStyle}">${day}</div>`);
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
        } catch (e) {}
        
        const todayDateStr = getUniversalDate(now);
        const safeCompanyId = currentStaff.company_id || "UNASSIGNED_ID";

        const { data: existingLog } = await supabaseClient
            .from('checkins')
            .select('id')
            .eq('user_email', currentStaff.email)
            .eq('company_id', safeCompanyId)
            .eq('date', todayDateStr)
            .maybeSingle();

        if (existingLog) {
            openInfoModal("Action Denied", "You have already checked in today.");
            return;
        }

        const { data: rules, error: rulesErr } = await supabaseClient.from('settings').select('*').eq('company_id', safeCompanyId).limit(1).maybeSingle();
        if (rulesErr) throw rulesErr;

        if (rules && rules.holidays) {
            let holidayArray = [];
            try { holidayArray = JSON.parse(rules.holidays); } catch(e){}
            if (holidayArray.includes(todayDateStr)) {
                openInfoModal("Scanner Locked", "Today has been declared an official Holiday by your organization.");
                return;
            }
        }

        let allowedStart = rules && rules.check_in_start ? rules.check_in_start : "09:00";
        let allowedEnd = rules && rules.check_in_end ? rules.check_in_end : "10:00";

        if (rules && rules.custom_schedules) {
            let customArray = [];
            try { customArray = JSON.parse(rules.custom_schedules); } catch(e){}
            const myCustom = customArray.find(c => c.email === currentStaff.email);
            if (myCustom) {
                allowedStart = myCustom.start;
                allowedEnd = myCustom.end;
            }
        }

        if (rules && rules.exceptions) {
            let exceptionsArray = [];
            try { exceptionsArray = JSON.parse(rules.exceptions); } catch(e){}
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
            openInfoModal("Scanner Locked", `You can only check in between ${allowedStart} and ${allowedEnd}.`);
            return; 
        }

        if (rules && rules.require_pin) {
            openPromptModal(
                "SECURITY CHECK",
                "Enter the 4-digit Daily Access PIN provided by your Manager:",
                "text",
                "",
                async function(userPin) {
                    let actualDbPin = rules.daily_pin;
                    if (actualDbPin && actualDbPin.includes(':')) {
                        actualDbPin = actualDbPin.split(':')[1];
                    }

                    if (userPin !== actualDbPin) {
                        openInfoModal("Verification Failed", "Incorrect Access PIN. Check-in aborted.");
                        return;
                    }
                    continueScannerProcess(rules, safeCompanyId, todayDateStr, now);
                }
            );
            return; 
        }
        
        continueScannerProcess(rules, safeCompanyId, todayDateStr, now);

    } catch (err) {
        openInfoModal("Error", "System verification failed.");
        console.error(err);
    }
}

async function continueScannerProcess(rules, safeCompanyId, todayDateStr, now) {
    if (rules && rules.require_gps) {
        let targetLat, targetLng, targetRadius, isExempt = false;
        
        let locations = [];
        try { if (rules.locations) locations = JSON.parse(rules.locations); } catch(e){}

        if (locations && locations.length > 0) {
            // Check if user is explicitly assigned to a custom location
            let userLocation = locations.find(loc => loc.staff && loc.staff.includes(currentStaff.email));
            
            // If not found, default to Main Campus
            if (!userLocation) userLocation = locations.find(loc => loc.id === 'main') || locations[0];
            
            if (userLocation.id === 'exempt' || userLocation.isExempt) {
                isExempt = true;
            } else {
                targetLat = userLocation.lat;
                targetLng = userLocation.lng;
                targetRadius = userLocation.radius || 150;
            }
        } else {
            // Legacy Fallback for backwards compatibility
            targetLat = rules.office_lat;
            targetLng = rules.office_lng;
            targetRadius = rules.office_radius || 150;
        }

        if (!isExempt) {
            if (!targetLat || !targetLng) {
                openInfoModal("Manager Error", "Office GPS location has not been pinned in settings yet!");
                return;
            }
            
            try {
                const position = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 });
                });

                const distanceMeters = calculateDistanceMeters(position.coords.latitude, position.coords.longitude, targetLat, targetLng);

                if (distanceMeters > targetRadius) {
                    openInfoModal("Geofence Violation", `You are too far from your assigned workplace (${Math.round(distanceMeters)} meters away). You must be within ${targetRadius} meters to clock in.`);
                    return;
                }
            } catch (err) {
                openInfoModal("GPS Error", "Please enable location permissions on your device to check in.");
                return;
            }
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
    
    const faceMatcher = new faceapi.FaceMatcher([labeledDescriptor], 0.6);

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
                    
                    supabaseClient.from('checkins').insert([{
                        user_email: currentStaff.email,
                        user_name: currentStaff.name,
                        date: todayDateStr,
                        time: timeStr,
                        status: 'Present',
                        company_id: safeCompanyId 
                    }]).then(({ error }) => {
                        if (error) {
                            openInfoModal("Database Error", error.message + "\n\nPlease ensure your 'checkins' table has exactly these columns: user_email, user_name, date, time, status, company_id.");
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
                } else {
                    scannerStatus.innerText = "FACE NOT MATCHED. ADJUST LIGHTING OR ANGLE...";
                    scannerStatus.style.color = "#f59e0b";
                }
            } else {
                canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
            }
        }, 500); 
    };
}

function bindTimePickerFix() {
    const t1 = document.getElementById('check-in-start');
    const t2 = document.getElementById('check-in-end');
    if(t1) t1.onclick = function() { try{ this.showPicker(); }catch(e){} };
    if(t2) t2.onclick = function() { try{ this.showPicker(); }catch(e){} };
}

// --- RUN WHEN PAGE LOADS ---
window.addEventListener('DOMContentLoaded', async () => {
    await ensureSupabase();
    
    initializeSettingsCalendar();
    loadPendingInvites(); 
    verifyInviteLink(); 
    loadTeamDirectory();
    loadTodayAttendance(); 
    loadTeamLedger(); 
    loadIndividualAnalytics(); 
    
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
    loadStaffDashboard(); 
});

// ==========================================
// --- MULTI-LOCATION ENGINE ---
// ==========================================
let workspaceLocations = [];
let activeLocationEditId = null;

async function loadLocationsPage() {
    const leader = getLeader();
    if (!leader) return;
    await ensureSupabase();

    try {
        const { data, error } = await supabaseClient.from('settings').select('*').eq('company_id', leader.company_id).limit(1).maybeSingle();
        
        if (data && data.locations) {
            try { workspaceLocations = JSON.parse(data.locations); } catch(e){}
        }
        
        // Ensure Main Campus always exists
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

        // Ensure GPS Exempt always exists
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
    if (!confirm("Remove this location? Assigned staff will default back to Main Campus.")) return;
    workspaceLocations = workspaceLocations.filter(l => l.id !== id);
    saveSettings();
    renderLocations();
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

// Modify the existing confirmMapLocation to handle array saves
async function confirmMapLocation() {
    if (!activeLocationEditId) return; // Keep backward compatibility
    
    const center = map.getCenter();
    const radius = document.getElementById('radius-slider').value;
    const saveBtn = document.getElementById('save-map-btn');
    saveBtn.innerText = "Saving...";
    saveBtn.disabled = true;

    // Update the specific location in the array
    const locIndex = workspaceLocations.findIndex(l => l.id === activeLocationEditId);
    if (locIndex !== -1) {
        workspaceLocations[locIndex].lat = center.lat;
        workspaceLocations[locIndex].lng = center.lng;
        workspaceLocations[locIndex].radius = parseInt(radius);
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

    // GUARD CLAUSE: Prevent assigning if not pinned
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

    // Gather all explicitly assigned emails in OTHER locations (not main)
    let explicitlyAssignedElsewhere = [];
    workspaceLocations.forEach(l => {
        if (l.id !== 'main' && l.staff) explicitlyAssignedElsewhere = explicitlyAssignedElsewhere.concat(l.staff);
    });

    staff.forEach(user => {
        let isAssigned = false;
        if (locId === 'main') {
            // For main, they are assigned if they are explicitly in main.staff, OR if they aren't explicitly assigned anywhere else
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
        // Remove these emails from all OTHER custom locations to prevent conflicts
        workspaceLocations.forEach((l, idx) => {
            if (idx !== locIndex) {
                l.staff = (l.staff || []).filter(email => !selectedEmails.includes(email));
            }
        });
        workspaceLocations[locIndex].staff = selectedEmails;
    }
    
    saveSettings();
    renderLocations();
    closeModal('assign-staff-modal');
}