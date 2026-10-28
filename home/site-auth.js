import { getApps, initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { recordProgress } from "/home/progress-tracker.js";

const firebaseConfig = {
    apiKey: "AIzaSyC-ZH61YF8TkhWI9wPCrvYOXwIPzo5t1oo",
    authDomain: "virtual-learning-platfor-1e5ab.firebaseapp.com",
    projectId: "virtual-learning-platfor-1e5ab",
    storageBucket: "virtual-learning-platfor-1e5ab.firebasestorage.app",
    messagingSenderId: "997860917448",
    appId: "1:997860917448:web:5739755e2b7f1935b3a5fd",
    measurementId: "G-604P4VMXS9"
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const profileRoot = document.createElement('div');
const headerRow = document.querySelector('header .flex.items-center.justify-between, nav .flex.items-center.justify-between');
if (headerRow) {
    profileRoot.style.cssText = 'margin-left:12px;flex:none;font-family:Inter,Arial,sans-serif;';
    headerRow.append(profileRoot);
} else {
    profileRoot.style.cssText = 'position:fixed;top:12px;right:12px;z-index:2147480000;font-family:Inter,Arial,sans-serif;';
    document.body.append(profileRoot);
}

function getReturnUrl() {
    return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function createSignInButton() {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Sign in';
    button.setAttribute('aria-label', 'Sign in to Virtual Learning Platform');
    button.style.cssText = 'border:0;border-radius:12px;padding:10px 18px;background:#4f46e5;color:#fff;font-size:14px;font-weight:700;box-shadow:0 6px 16px #4f46e544;cursor:pointer;';
    button.addEventListener('click', () => {
        const returnTo = encodeURIComponent(getReturnUrl());
        window.location.assign(`/home/start_2.html?returnTo=${returnTo}`);
    });
    profileRoot.replaceChildren(button);
}

function createProfile(user) {
    const profile = document.createElement('div');
    profile.style.cssText = 'display:flex;align-items:center;gap:10px;padding:7px 10px 7px 7px;border:1px solid #e2e8f0;border-radius:14px;background:rgba(255,255,255,.96);box-shadow:0 6px 20px #0f172a18;max-width:min(310px,calc(100vw - 24px));';

    if (user.photoURL) {
        const avatar = document.createElement('img');
        avatar.src = user.photoURL;
        avatar.alt = '';
        avatar.referrerPolicy = 'no-referrer';
        avatar.style.cssText = 'width:34px;height:34px;border-radius:50%;object-fit:cover;flex:none;';
        profile.append(avatar);
    } else {
        const avatar = document.createElement('div');
        avatar.textContent = (user.displayName || user.email || user.phoneNumber || 'U').charAt(0).toUpperCase();
        avatar.style.cssText = 'width:34px;height:34px;border-radius:50%;background:#eef2ff;color:#4f46e5;display:grid;place-items:center;font-size:14px;font-weight:800;flex:none;';
        profile.append(avatar);
    }

    const details = document.createElement('div');
    details.style.cssText = 'min-width:0;display:flex;flex-direction:column;gap:2px;';
    const name = document.createElement('span');
    name.textContent = user.displayName || user.email || user.phoneNumber || 'Learner';
    name.style.cssText = 'max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#0f172a;font-size:12px;font-weight:800;';
    const contact = document.createElement('span');
    contact.textContent = user.email || user.phoneNumber || 'Signed in';
    contact.style.cssText = 'max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#6366f1;font-size:10px;font-weight:600;';
    details.append(name, contact);

    const signOutButton = document.createElement('button');
    signOutButton.type = 'button';
    signOutButton.textContent = 'Sign out';
    signOutButton.setAttribute('aria-label', 'Sign out');
    signOutButton.style.cssText = 'border:0;border-radius:9px;padding:8px 9px;background:#fff1f2;color:#e11d48;font-size:11px;font-weight:700;cursor:pointer;flex:none;';
    signOutButton.addEventListener('click', async () => {
        signOutButton.disabled = true;
        try {
            await signOut(auth);
        } catch (error) {
            console.error('Firebase sign-out failed:', error);
            window.alert('Could not sign out. Please check your connection and try again.');
            signOutButton.disabled = false;
        }
    });

    profile.append(details, signOutButton);
    profileRoot.replaceChildren(profile);

    if (isVirtualLabPage()) {
        profileRoot.style.display = 'flex';
        profileRoot.style.flexDirection = 'column';
        profileRoot.style.alignItems = 'stretch';
        const completeButton = document.createElement('button');
        completeButton.type = 'button';
        completeButton.textContent = 'Mark lab complete';
        completeButton.style.cssText = 'margin-top:7px;width:100%;border:0;border-radius:10px;padding:8px 10px;background:#4f46e5;color:#fff;font-size:11px;font-weight:700;cursor:pointer;';
        completeButton.addEventListener('click', async () => {
            completeButton.disabled = true;
            completeButton.textContent = 'Saving completion...';
            try {
                const result = await recordProgress('virtual-labs', user, {
                    eventType: 'lab_completed',
                    title: document.title,
                    course: getCourseName(),
                    url: window.location.pathname
                });
                completeButton.textContent = 'Lab completion saved';
                if (result.emailError) {
                    completeButton.textContent = 'Saved • email unavailable';
                    console.warn('Lab completion saved, but its email notification could not be sent:', result.emailError);
                } else if (user.email) {
                    completeButton.textContent = result.emailSent ? 'Saved • email sent' : 'Saved • email unavailable';
                }
            } catch (error) {
                console.error('Virtual lab completion could not be saved:', error);
                completeButton.disabled = false;
                completeButton.textContent = 'Mark lab complete';
                window.alert(`Could not save your lab completion: ${error.message || 'Check the backend server and Firestore setup, then try again.'}`);
            }
        });
        profileRoot.append(completeButton);
    }
}

function isVirtualLabPage() {
    const pagePath = window.location.pathname.toLowerCase();
    return /\/labs\/[^/]+\.html$/.test(pagePath)
        || /\/operating%20system\/[^/]+\.html$/.test(pagePath)
        || /\/home\/(sort_home|lewis_structure)\.html$/.test(pagePath)
        || pagePath === '/home_sort.html';
}

function getCourseName() {
    const pagePath = window.location.pathname.toLowerCase();
    if (pagePath.includes('/cs_data_structures/')) return 'Computer Science & Data Structures';
    if (pagePath.includes('/interactive_chemistry/') || pagePath.endsWith('/lewis_structure.html')) return 'Chemistry';
    if (pagePath.includes('/physics_circuit_designs/')) return 'Physics & Electronics';
    if (pagePath.includes('/operating%20system/')) return 'Operating Systems';
    return 'Virtual Labs';
}

onAuthStateChanged(auth, (user) => {
    if (user) {
        createProfile(user);
    } else {
        createSignInButton();
    }
}, (error) => {
    console.error('Firebase authentication state error:', error);
    createSignInButton();
});
