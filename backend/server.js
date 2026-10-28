const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { applicationDefault, getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');

const app = express();
const projectRoot = path.resolve(__dirname, '..');
const projectId = 'virtual-learning-platfor-1e5ab';
const progressDatabases = {
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
    const databaseId = progressDatabases[appType];
    if (!databaseId) throw new Error('Unsupported progress application.');
    return getFirestore(getAdminApp(), databaseId);
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
        const authError = new Error('Your sign-in has expired. Sign in again.');
        authError.statusCode = 401;
        throw authError;
    }
}

app.get('/api/status', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Virtual Learning Platform API Server is active (Firebase Auth Integrated)'
    });
});

app.post('/api/progress/notify', async (req, res) => {
    try {
        const decodedToken = await verifyProgressRequest(req);
        const { appType, eventId } = req.body || {};
        if (!Object.hasOwn(progressDatabases, appType) || typeof eventId !== 'string' || !/^[A-Za-z0-9_-]{10,40}$/.test(eventId)) {
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
        if (event.uid !== decodedToken.uid || event.email !== decodedToken.email) {
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

    for (const [appType] of Object.entries(progressDatabases)) {
        const events = await getProgressDatabase(appType)
            .collectionGroup('history')
            .where('createdAt', '>=', weekStart)
            .get();

        for (const eventDoc of events.docs) {
            const event = eventDoc.data();
            if (!event.email || !event.uid) continue;

            const summary = userSummaries.get(event.uid) || { email: event.email, events: [] };
            summary.events.push({ appType, ...event });
            userSummaries.set(event.uid, summary);
        }
    }

    const dateKey = now.toISOString().slice(0, 10);
    const digestDatabase = getProgressDatabase('virtual-labs');
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