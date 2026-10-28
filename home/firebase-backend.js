// Import Firebase SDKs (CDN Modules)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword, 
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    getDoc, 
    setDoc, 
    updateDoc, 
    arrayUnion, 
    Timestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// TODO: Replace with your actual Firebase project configuration credentials
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyC-ZH61YF8TkhWI9wPCrvYOXwIPzo5t1oo",
  authDomain: "virtual-learning-platfor-1e5ab.firebaseapp.com",
  projectId: "virtual-learning-platfor-1e5ab",
  storageBucket: "virtual-learning-platfor-1e5ab.firebasestorage.app",
  messagingSenderId: "997860917448",
  appId: "1:997860917448:web:5739755e2b7f1935b3a5fd",
  measurementId: "G-604P4VMXS9"
};

// Initialize Firebase App, Auth, and Firestore Database
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let isSignUpMode = false;
let currentUserUid = null;

// DOM Element Bindings
const authModal = document.getElementById('auth-modal');
const authModalTitle = document.getElementById('auth-modal-title');
const authSubmitBtn = document.getElementById('auth-submit-btn');
const authSwitchText = document.getElementById('auth-switch-text');
const dashboardSection = document.getElementById('dashboard');
const navDashboardLink = document.getElementById('nav-dashboard-link');
const authActionsDesktop = document.getElementById('auth-actions-desktop');
const userProfileMenu = document.getElementById('user-profile-menu');
const userDisplayName = document.getElementById('user-display-name');
const userContact = document.getElementById('user-contact');
const userAvatar = document.getElementById('user-avatar');
const userAvatarPlaceholder = document.getElementById('user-avatar-placeholder');

// --- AUTHENTICATION STATE OBSERVER ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUserUid = user.uid;
        authModal.classList.add('hidden');
        authActionsDesktop.classList.add('hidden');
        userProfileMenu.classList.remove('hidden');
        userProfileMenu.classList.add('flex');
        if (navDashboardLink) navDashboardLink.classList.remove('hidden');
        if (dashboardSection) dashboardSection.classList.remove('hidden');
        userDisplayName.textContent = user.displayName || user.email?.split('@')[0] || user.phoneNumber || 'Student';
        userContact.textContent = user.email || user.phoneNumber || 'Signed in';
        if (user.photoURL) {
            userAvatar.src = user.photoURL;
            userAvatar.classList.remove('hidden');
            userAvatarPlaceholder.classList.add('hidden');
        } else {
            userAvatar.classList.add('hidden');
            userAvatarPlaceholder.classList.remove('hidden');
        }

        if (dashboardSection) {
            await loadStudentProgress(user.uid);
        }
    } else {
        currentUserUid = null;
        userProfileMenu.classList.add('hidden');
        if (navDashboardLink) navDashboardLink.classList.add('hidden');
        if (dashboardSection) dashboardSection.classList.add('hidden');
        authActionsDesktop.classList.remove('hidden');
    }
});

// --- FIRESTORE DATABASE OPERATIONS ---

// Load Student Progress (Completed Modules, Test Scores, Certificates)
async function loadStudentProgress(uid) {
    try {
        const userDocRef = doc(db, "students", uid);
        const docSnap = await getDoc(userDocRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            renderDashboardData(data.modules || [], data.certificates || []);
        } else {
            // Initialize default student document in Firestore if new user
            const initialData = {
                modules: [
                    { name: "Sorting Algorithm Visualizer", score: 95, date: "2026-10-15" },
                    { name: "OS CPU Scheduler Simulation", score: 88, date: "2026-10-20" }
                ],
                certificates: [
                    { title: "Computer Science Track Mastery", issueDate: "2026-10-22", id: "CERT-98241" }
                ]
            };
            await setDoc(userDocRef, initialData);
            renderDashboardData(initialData.modules, initialData.certificates);
        }
    } catch (error) {
        console.error("Error loading progress from Firestore:", error);
    }
}

// Render Data to Dashboard UI
function renderDashboardData(modules, certificates) {
    const completedCount = modules.length;
    const totalScore = modules.reduce((acc, curr) => acc + (curr.score || 0), 0);
    const avgScore = completedCount > 0 ? Math.round(totalScore / completedCount) : 0;
    const certCount = certificates.length;

    // Update Stats Cards
    document.getElementById('stat-completed-modules').textContent = completedCount;
    document.getElementById('stat-avg-score').textContent = avgScore + '%';
    document.getElementById('stat-certificates').textContent = certCount;

    // Render Modules Table
    const tableBody = document.getElementById('modules-table-body');
    if (modules.length === 0) {
        tableBody.innerHTML = `<tr><td colspan="3" class="p-4 text-center text-slate-400">No lab modules completed yet.</td></tr>`;
    } else {
        tableBody.innerHTML = modules.map(m => `
            <tr class="hover:bg-slate-50/50 transition-colors">
                <td class="p-3 font-semibold text-slate-900">${m.name}</td>
                <td class="p-3"><span class="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">${m.score}%</span></td>
                <td class="p-3 text-slate-500 text-xs">${m.date}</td>
            </tr>
        `).join('');
    }

    // Render Certificates List
    const certContainer = document.getElementById('certificates-list-container');
    if (certificates.length === 0) {
        certContainer.innerHTML = `<div class="p-4 rounded-xl bg-slate-50 text-slate-400 text-center text-sm">No certificates earned yet.</div>`;
    } else {
        certContainer.innerHTML = certificates.map(c => `
            <div class="p-4 rounded-2xl border border-slate-200 bg-gradient-to-r from-indigo-50/40 to-white flex items-center justify-between">
                <div>
                    <div class="text-sm font-bold text-slate-900">${c.title}</div>
                    <div class="text-[11px] text-slate-500">Issued: ${c.issueDate} • ID: ${c.id}</div>
                </div>
                <span class="px-3 py-1 bg-indigo-600 text-white text-xs font-bold rounded-lg shadow-sm">Verified</span>
            </div>
        `).join('');
    }
}

// Function to simulate completing a new lab module and saving it to Firestore backend
window.simulatedCompleteLab = async function() {
    if (!currentUserUid) return alert("Please sign in first!");

    const labNames = ["Binary Search Tree Simulator", "Lewis Structure 3D Covalent Lab", "Memory Paging & Virtual RAM", "Quantum Route Optimization Lab"];
    const randomLab = labNames[Math.floor(Math.random() * labNames.length)];
    const randomScore = Math.floor(Math.random() * 15) + 85; // Score between 85 and 100
    const today = new Date().toISOString().split('T')[0];

    const newModule = { name: randomLab, score: randomScore, date: today };

    try {
        const userDocRef = doc(db, "students", currentUserUid);
        await updateDoc(userDocRef, {
            modules: arrayUnion(newModule)
        });
        alert(`Successfully completed lab: "${randomLab}" with score ${randomScore}%! Database updated.`);
        await loadStudentProgress(currentUserUid);
    } catch (error) {
        console.error("Error saving lab progress:", error);
    }
};

// --- AUTH MODAL & EVENT HANDLERS ---
window.openAuthModal = function(mode) {
    const loginUrl = new URL('/home/start_2.html', window.location.origin);
    loginUrl.searchParams.set('returnTo', `${window.location.pathname}${window.location.search}${window.location.hash}`);
    if (mode === 'signup') loginUrl.searchParams.set('mode', 'signup');
    window.location.assign(loginUrl.href);
};

window.closeAuthModal = function() {
    authModal.classList.add('hidden');
};

window.toggleAuthMode = function() {
    isSignUpMode = !isSignUpMode;
    authModalTitle.textContent = isSignUpMode ? "Create Student Account" : "Sign In to Virtual Labs";
    authSubmitBtn.textContent = isSignUpMode ? "Sign Up" : "Sign In";
    authSwitchText.textContent = isSignUpMode ? "Already have an account? Sign in" : "Don't have an account? Sign up";
};

window.handleAuthSubmit = async function(e) {
    e.preventDefault();
    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;

    try {
        if (isSignUpMode) {
            await createUserWithEmailAndPassword(auth, email, password);
        } else {
            await signInWithEmailAndPassword(auth, email, password);
        }
        closeAuthModal();
    } catch (error) {
        alert("Authentication Error: " + error.message);
    }
};

window.handleSignOut = async function() {
    await signOut(auth);
};