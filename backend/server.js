const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { applicationDefault, getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { FieldValue, getFirestore, Timestamp } = require('firebase-admin/firestore');

const app = express();
const projectRoot = path.resolve(__dirname, '..');
const projectId = 'virtual-learning-platfor-1e5ab';
const progressApps = {
    'virtual-labs': 'virtual-labs',
    'ai-interviews': 'ai-interviews',
    'e-library': 'e-library'
};
let adminApp;

app.disable('x-powered-by');
app.use(express.json());
app.use(cors());

function getAdminApp() {
    if (!adminApp) {
        adminApp = getApps().find((firebaseApp) => firebaseApp.name === 'progress-backend')
            || initializeApp({
                credential: applicationDefault(),
                projectId
            }, 'progress-backend');
    }

    return adminApp;
}

function getProgressDatabase(appType) {
    if (!progressApps[appType]) throw new Error('Unsupported progress application.');
    return getFirestore(getAdminApp());
}

function getProgressWriteError(error, appType) {
    const errorCode = String(error.code || '').toLowerCase();
    const errorMessage = String(error.message || '').toLowerCase();
    const databaseId = '(default)';

    if (errorCode.includes('permission-denied') || errorCode === '7') {
        return `The Firebase server account does not have permission to write to "${databaseId}". Grant it the Cloud Datastore User role, then restart the server.`;
    }
    if (errorCode.includes('not-found') || errorCode === '5'
        || errorMessage.includes('database') && errorMessage.includes('not found')) {
        return `The Firestore database "${databaseId}" does not exist in project "${projectId}". Create it in Firebase Console, deploy its rules, then retry.`;
    }
    if (errorCode.includes('invalid-credential') || errorMessage.includes('default credentials')
        || errorMessage.includes('application default credentials') || errorMessage.includes('could not load the default')) {
        return 'Firebase Admin credentials are not configured for this Node server. Set GOOGLE_APPLICATION_CREDENTIALS to a service-account JSON file with Firestore access, then restart npm start.';
    }
    if (errorCode.includes('unauthenticated') || errorCode === '16') {
        return 'The Firebase Admin credentials are invalid or expired. Configure valid server credentials, then restart the server.';
    }
    return `The backend could not write to the "${databaseId}" Firestore database. Check the Node server log and Firebase Admin access, then retry.`;
}

async function sendProgressEmail({ to, subject, text }) {
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL;
    if (!apiKey || !from) {
        throw new Error('Email is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL.');
    }

    const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ from, to: [to], subject, text })
    });

    if (!response.ok) {
        console.error(`Resend email request failed with status ${response.status}.`);
        throw new Error('The email provider could not deliver the message.');
    }
}

async function verifyProgressRequest(req) {
    const authorization = req.get('authorization') || '';
    const match = authorization.match(/^Bearer (.+)$/i);
    if (!match) {
        const error = new Error('Sign in to save or email progress.');
        error.statusCode = 401;
        throw error;
    }

    try {
        return await getAuth(getAdminApp()).verifyIdToken(match[1]);
    } catch (error) {
        console.error('Firebase ID token verification failed:', error.message);
        const isInvalidToken = String(error.code || '').startsWith('auth/');
        const authError = new Error(isInvalidToken
            ? 'Your sign-in token is invalid or expired. Sign in again.'
            : 'The backend could not verify Firebase sign-in. Check the Firebase Admin credentials and server log.');
        authError.statusCode = isInvalidToken ? 401 : 503;
        throw authError;
    }
}

app.get('/api/status', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Virtual Learning Platform API Server is active (Firebase Auth Integrated)'
    });
});

app.post('/api/progress', async (req, res) => {
    try {
        const decodedToken = await verifyProgressRequest(req);
        const { appType, event } = req.body || {};
        const eventTypes = {
            'virtual-labs': 'lab_completed',
            'ai-interviews': 'interview_evaluated',
            'e-library': 'resource_downloaded'
        };
        if (!Object.hasOwn(eventTypes, appType) || !event || typeof event !== 'object' || Array.isArray(event)) {
            return res.status(400).json({ success: false, error: 'A valid app type and progress event are required.' });
        }

        const allowedFields = {
            'virtual-labs': ['course', 'url'],
            'ai-interviews': ['score', 'grade', 'testCasesPassed', 'language', 'url'],
            'e-library': ['fileName', 'resourceCategory', 'url']
        }[appType];
        const unexpectedFields = Object.keys(event).filter((field) => !['eventType', 'title', ...allowedFields].includes(field));
        if (unexpectedFields.length || event.eventType !== eventTypes[appType]
            || typeof event.title !== 'string' || !event.title.trim() || event.title.length > 180) {
            return res.status(400).json({ success: false, error: 'The progress event contains invalid fields.' });
        }

        const savedEvent = {
            uid: decodedToken.uid,
            email: decodedToken.email || '',
            appType,
            eventType: event.eventType,
            title: event.title.trim(),
            createdAt: FieldValue.serverTimestamp()
        };
        const stringLimits = {
            course: 120,
            url: 500,
            grade: 20,
            testCasesPassed: 40,
            language: 40,
            fileName: 180,
            resourceCategory: 120
        };
        for (const field of allowedFields) {
            if (event[field] === undefined) continue;
            if (field === 'score' && appType === 'ai-interviews') {
                if (typeof event.score !== 'number' || !Number.isFinite(event.score)
                    || event.score < 0 || event.score > 100) {
                    return res.status(400).json({ success: false, error: 'The interview score must be between 0 and 100.' });
                }
                savedEvent.score = event.score;
                continue;
            }
            if (typeof event[field] !== 'string' || event[field].length > stringLimits[field]
                || (field === 'url' && !event[field].startsWith('/'))) {
                return res.status(400).json({ success: false, error: `The progress event field "${field}" is invalid.` });
            }
            savedEvent[field] = event[field];
        }

        if (appType === 'ai-interviews'
            && (typeof event.score !== 'number' || !Number.isFinite(event.score) || event.score < 0 || event.score > 100
                || typeof event.grade !== 'string' || !event.grade.trim())) {
            return res.status(400).json({ success: false, error: 'A valid interview score and grade are required.' });
        }
        if (appType === 'e-library' && (typeof event.fileName !== 'string' || !event.fileName.trim())) {
            return res.status(400).json({ success: false, error: 'A downloaded file name is required.' });
        }

        const record = await getProgressDatabase(appType)
            .collection('users')
            .doc(decodedToken.uid)
            .collection('history')
            .add(savedEvent);
        res.status(201).json({ success: true, saved: true, eventId: record.id });
    } catch (error) {
        console.error('Progress database write failed:', error.message);
        const appType = req.body?.appType;
        res.status(error.statusCode || 503).json({
            success: false,
            error: error.statusCode ? error.message : getProgressWriteError(error, appType)
        });
    }
});

app.post('/api/progress/notify', async (req, res) => {
    try {
        const decodedToken = await verifyProgressRequest(req);
        const { appType, eventId } = req.body || {};
        if (!Object.hasOwn(progressApps, appType) || typeof eventId !== 'string' || !/^[A-Za-z0-9_-]{10,40}$/.test(eventId)) {
            return res.status(400).json({ success: false, error: 'A valid app type and progress event ID are required.' });
        }

        if (!decodedToken.email) {
            return res.status(200).json({ success: true, sent: false, reason: 'email-address-unavailable' });
        }

        const database = getProgressDatabase(appType);
        const eventSnapshot = await database
            .collection('users')
            .doc(decodedToken.uid)
            .collection('history')
            .doc(eventId)
            .get();
        if (!eventSnapshot.exists) {
            return res.status(404).json({ success: false, error: 'The progress record was not found.' });
        }

        const event = eventSnapshot.data();
        if (event.uid !== decodedToken.uid || event.email !== decodedToken.email || event.appType !== appType) {
            return res.status(403).json({ success: false, error: 'You cannot send a notification for this record.' });
        }

        const appName = {
            'virtual-labs': 'Virtual Labs',
            'ai-interviews': 'AI Interview',
            'e-library': 'E-Library'
        }[appType];
        const details = [
            `Your ${appName} progress was updated.`,
            `Activity: ${event.title}`,
            event.score !== undefined ? `Score: ${event.score}/100${event.grade ? ` (${event.grade})` : ''}` : '',
            event.fileName ? `Downloaded file: ${event.fileName}` : '',
            event.course ? `Course: ${event.course}` : '',
            '',
            'Sign in to your Virtual Learning Platform account to view your full history.'
        ].filter(Boolean).join('\n');

        await sendProgressEmail({
            to: decodedToken.email,
            subject: `${appName}: ${event.title}`,
            text: details
        });
        res.status(200).json({ success: true, sent: true });
    } catch (error) {
        console.error('Progress email notification failed:', error.message);
        res.status(error.statusCode || (error.message.startsWith('Email is not configured') ? 503 : 500))
            .json({ success: false, error: error.message || 'Progress email could not be sent.' });
    }
});

async function sendWeeklyProgressSummary() {
    const now = new Date();
    const weekStart = Timestamp.fromDate(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
    const userSummaries = new Map();

    const events = await getFirestore(getAdminApp())
        .collectionGroup('history')
        .where('createdAt', '>=', weekStart)
        .get();

    for (const eventDoc of events.docs) {
        const event = eventDoc.data();
        if (!event.email || !event.uid || !progressApps[event.appType]) continue;

        const summary = userSummaries.get(event.uid) || { email: event.email, events: [] };
        summary.events.push(event);
        userSummaries.set(event.uid, summary);
    }

    const dateKey = now.toISOString().slice(0, 10);
    const digestDatabase = getFirestore(getAdminApp());
    for (const [uid, summary] of userSummaries) {
        const digestRef = digestDatabase.collection('digestRuns').doc(`${dateKey}-${uid}`);
        if ((await digestRef.get()).exists) continue;

        const lines = summary.events.map((event) => {
            const appName = {
                'virtual-labs': 'Virtual Labs',
                'ai-interviews': 'AI Interview',
                'e-library': 'E-Library'
            }[event.appType];
            const score = event.score !== undefined ? ` — ${event.score}/100${event.grade ? ` (${event.grade})` : ''}` : '';
            return `- ${appName}: ${event.title}${score}`;
        });

        try {
            await sendProgressEmail({
                to: summary.email,
                subject: 'Your weekly Virtual Learning Platform progress',
                text: `Here is your progress from the last 7 days:\n\n${lines.join('\n')}\n\nSign in to the platform to view your complete histories.`
            });
            await digestRef.set({ uid, email: summary.email, sentAt: new Date(), periodStart: weekStart });
        } catch (error) {
            console.error(`Weekly progress summary failed for user ${uid}:`, error.message);
        }
    }
}

cron.schedule('0 9 * * 1', () => {
    sendWeeklyProgressSummary().catch((error) => {
        console.error('Weekly progress summary job failed:', error);
    });
}, { timezone: 'Asia/Kolkata' });

app.get('/', (req, res) => {
    res.redirect(302, '/home/start_2.html');
});

app.use((req, res, next) => {
    if (req.method !== 'GET') return next();

    let requestPath;
    try {
        requestPath = decodeURIComponent(req.path);
    } catch (error) {
        return res.status(400).type('text').send('Invalid page path');
    }

    if (requestPath.endsWith('/')) requestPath += 'index.html';
    if (!requestPath.toLowerCase().endsWith('.html')) return next();

    const section = ['home', 'library', 'chemistry', 'computer_science']
        .find((name) => requestPath.startsWith(`/${name}/`));
    const sectionRoot = section ? path.resolve(projectRoot, section) : projectRoot;
    const filePath = requestPath === '/home_sort.html'
        ? path.join(projectRoot, 'home_sort.html')
        : section
            ? path.resolve(sectionRoot, `.${requestPath.slice(section.length + 1)}`)
            : null;
    if (!filePath) return next();

    if (!filePath.startsWith(`${sectionRoot}${path.sep}`)) {
        return res.status(404).type('text').send('Page not found');
    }

    const existingAuthPages = new Set([
        path.join('home', 'start_2.html'),
        path.join('home', 'mainHome.html'),
        path.join('home', 'mainHome_2.html')
    ]);
    const relativePath = path.relative(projectRoot, filePath);

    fs.readFile(filePath, 'utf8', (error, html) => {
        if (error) {
            if (error.code === 'ENOENT' || error.code === 'EISDIR') return next();
            return next(error);
        }

        if (existingAuthPages.has(relativePath)) {
            return res.type('html').send(html);
        }

        const authScript = '<script type="module" src="/home/site-auth.js"></script>';
        const page = /<\/body\s*>/i.test(html)
            ? html.replace(/<\/body\s*>/i, `${authScript}</body>`)
            : `${html}${authScript}`;
        res.type('html').send(page);
    });
});

for (const section of ['home', 'library', 'chemistry', 'computer_science']) {
    app.use(`/${section}`, express.static(path.join(projectRoot, section), {
        dotfiles: 'deny',
        index: 'index.html'
    }));
}

app.use((req, res) => {
    res.status(404).type('text').send('Page not found');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Virtual Learning Platform is running at http://localhost:${PORT}`);
});