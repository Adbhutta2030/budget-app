import admin from "firebase-admin";

// FIREBASE_SERVICE_ACCOUNT should contain the *entire* JSON key file content
// (Firebase Console -> Project settings -> Service accounts -> Generate new
// private key), set as a single Railway environment variable.
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing auth token" });

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.uid = decoded.uid;
    next();
  } catch (e) {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
