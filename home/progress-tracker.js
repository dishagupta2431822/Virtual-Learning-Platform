import { getApps, initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
    addDoc,
    collection,
    getFirestore,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyC-ZH61YF8TkhWI9wPCrvYOXwIPzo5t1oo",
    authDomain: "virtual-learning-platfor-1e5ab.firebaseapp.com",
    projectId: "virtual-learning-platfor-1e5ab",
    storageBucket: "virtual-learning-platfor-1e5ab.firebasestorage.app",
    messagingSenderId: "997860917448",
    appId: "1:997860917448:web:5739755e2b7f1935b3a5fd",
    measurementId: "G-604P4VMXS9"
};

const eventTypes = {
    'virtual-labs': 'lab_completed',
    'ai-interviews': 'interview_evaluated',
    'e-library': 'resource_downloaded'
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const auth = getAuth(app);

function getHistoryCollection(appType, uid) {
    if (!eventTypes[appType]) throw new Error(`Unknown progress application: ${appType}`);
    return collection(getFirestore(app), 'users', uid, 'history');
}

export function subscribeProgress(appType, uid, onEntries, onError) {
    const historyQuery = query(getHistoryCollection(appType, uid), orderBy('createdAt', 'desc'));
    return onSnapshot(historyQuery, (snapshot) => {
        onEntries(snapshot.docs
            .map((entry) => ({ id: entry.id, ...entry.data() }))
            .filter((entry) => entry.appType === appType));
    }, onError);
}

export async function recordProgress(appType, user, event) {
    if (!user?.uid) throw new Error('Sign in before saving progress.');
    if (event.eventType !== eventTypes[appType]) {
        throw new Error(`Invalid event type for ${appType}.`);
    }

    const savedEvent = {
        uid: user.uid,
        email: user.email || '',
        appType,
        eventType: event.eventType,
        title: String(event.title || 'Progress update').slice(0, 180),
        createdAt: serverTimestamp()
    };
    for (const field of ['course', 'url', 'score', 'grade', 'testCasesPassed', 'language', 'fileName', 'resourceCategory']) {
        if (event[field] !== undefined) savedEvent[field] = event[field];
    }

    const savedRecord = await addDoc(getHistoryCollection(appType, user.uid), savedEvent);
    if (!user.email) return { id: savedRecord.id, emailSent: false };

    try {
        const token = await user.getIdToken();
        const response = await fetch('/api/progress/notify', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + token,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ appType, eventId: savedResult.eventId })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || `Email notification failed (${response.status}).`);
        return { id: savedRecord.id, emailSent: result.sent === true };
    } catch (error) {
        console.error('Progress was saved to Firestore, but its email notification failed:', error);
        return { id: savedRecord.id, emailSent: false, emailError: error.message };
    }
}
