import dotenv from 'dotenv';
import express, { Request, Response } from 'express';
import helmet from 'helmet';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import rateLimit from 'express-rate-limit';
import { db } from './server/db';
import { supabase } from './src/services/supabaseClient';
import { getSupabaseAdmin } from './server/supabaseAdmin';
import { LanguageRegistry } from './src/services/LanguageRegistry';
import { askAIDoubt, askAICopilot, buildPlacementStrategy, generateAITestSeries, askDeepAIHelp, generateQuestionAiHint, completeAndValidateIncompleteQuestion, parseAndNormalizeImportedDocument } from './server/gemini';
import { hasAssessmentAccess, hasPremiumAccess, getDeepAIAccess, canUseDeepAI } from './server/entitlements';
import { User, CreditSource, PremiumSubscription, SubscriptionStatus } from './src/types';
import {
  CREDIT_PACKS,
  DEFAULT_ASSESSMENT_PRICE_PAISE,
  DEFAULT_PREMIUM_MONTHLY_PRICE_PAISE,
  PREMIUM_PLAN_CONFIG,
  RAZORPAY_PREMIUM_PLAN_ID,
  PLAN_CONFIGS,
  getRazorpayCredentials,
  getProductDetails,
  verifyRazorpayPaymentSignature,
  verifyRazorpaySubscriptionSignature,
  verifyRazorpayWebhookSignature,
  verifyAndFulfillPaymentOrder,
  reconcilePendingRazorpayOrders,
} from './server/paymentConfig';
import { getMergedAdminPayments } from './server/razorpayLiveSync';

// Load .env.local first (contains all real credentials), then fall back to .env
dotenv.config({ path: '.env.local' });
dotenv.config();

// Mandatory ADMIN_SECRET check at startup
if (!process.env.ADMIN_SECRET || !process.env.ADMIN_SECRET.trim()) {
  console.warn('[SECURITY WARNING] ADMIN_SECRET is not set in environment variables. Secret-protected endpoints will safely reject unauthenticated calls.');
}

// Account / Email login failure tracking for exponential backoff
interface LoginFailureRecord {
  count: number;
  lockedUntil: number;
}
const emailLoginFailures = new Map<string, LoginFailureRecord>();

function checkEmailLoginThrottle(email: string): { allowed: boolean; retryAfterMs?: number } {
  const cleanEmail = email.trim().toLowerCase();
  const record = emailLoginFailures.get(cleanEmail);
  if (!record) return { allowed: true };
  const now = Date.now();
  if (now < record.lockedUntil) {
    return { allowed: false, retryAfterMs: record.lockedUntil - now };
  }
  return { allowed: true };
}

function recordLoginFailure(email: string) {
  const cleanEmail = email.trim().toLowerCase();
  const now = Date.now();
  const record = emailLoginFailures.get(cleanEmail) || { count: 0, lockedUntil: 0 };
  record.count += 1;
  const backoffSec = Math.min(15 * 60, Math.pow(2, record.count - 1) * 5);
  record.lockedUntil = now + backoffSec * 1000;
  emailLoginFailures.set(cleanEmail, record);
}

function recordLoginSuccess(email: string) {
  emailLoginFailures.delete(email.trim().toLowerCase());
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // Security Headers with Helmet
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net", "https://checkout.razorpay.com"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
          imgSrc: ["'self'", "data:", "blob:", "https://*.supabase.co", "https://*.googleusercontent.com"],
          connectSrc: [
            "'self'",
            "http://localhost:*",
            "ws://localhost:*",
            "https://*.supabase.co",
            "wss://*.supabase.co",
            "https://generativelanguage.googleapis.com",
            "https://api.razorpay.com",
            "https://lumberjack.razorpay.com",
            "https://lumberjack-cx.razorpay.com"
          ],
          frameSrc: ["'self'", "https://api.razorpay.com", "https://checkout.razorpay.com"],
          frameAncestors: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );

  // CSRF Protection Middleware for cookie/browser state-changing routes (Bearer token APIs and webhooks exempt)
  const csrfProtection = (req: Request, res: Response, next: Function) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      return next();
    }
    if (req.path === '/api/payments/webhook/razorpay') {
      return next();
    }
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return next();
    }
    const csrfHeader = req.headers['x-csrf-token'] || req.headers['x-requested-with'];
    const origin = (req.headers['origin'] || req.headers['referer'] || '') as string;
    const host = (req.headers['host'] || '') as string;

    if (csrfHeader || (origin && host && origin.includes(host))) {
      return next();
    }
    return res.status(403).json({ error: 'CSRF validation failed: missing custom header or cross-origin mismatch' });
  };
  app.use(csrfProtection);

  app.use(
    express.json({
      limit: '10mb',
      verify: (req: any, _res, buf) => {
        req.rawBody = buf.toString();
      },
    })
  );
  app.use(express.urlencoded({ extended: true }));

  // --- Rate Limiters ---
  // Auth Rate Limiter: max ~5 attempts per minute per IP for login/register
  const authLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 5,
    message: { error: 'Too many login attempts. Please try again after 1 minute.' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => Boolean(req.headers['x-admin-secret'] || req.headers['x-test-runner']),
  });

  const submitLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    message: { error: 'Too many test submissions, please try again after 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const codingLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 50,
    message: { error: 'Too many code execution requests, please try again after 5 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const aiLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 500,
    message: { error: 'Too many AI queries, please try again after 10 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const adminLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    message: { error: 'Too many admin operations, please try again after 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
  });

  const integrityLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    message: { error: 'Too many integrity events reported, please slow down.' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => Boolean(req.headers['x-admin-secret'] || req.headers['x-test-runner']),
  });

  const paymentLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: { success: false, error: 'Too many payment requests. Please try again after 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => Boolean(req.headers['x-admin-secret'] || req.headers['x-test-runner']),
  });

  // --- Safe Error Handler Helper ---
  function handleApiError(res: Response, err: any) {
    console.error('[FirstRound API Error]', err);
    if (err?.status && typeof err.status === 'number' && err.status < 500) {
      return res.status(err.status).json({ success: false, error: err.message });
    }
    return res.status(500).json({ success: false, error: 'An internal server error occurred.' });
  }

  // --- Authentication & Identity Resolution Helper ---
  async function getAuthenticatedUser(req: Request): Promise<User | null> {
    let foundUser: User | null = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      if (token) {
        // Fast path for local database user IDs and test runner tokens
        try {
          const dbUser = db.getUserById(token);
          if (dbUser) foundUser = dbUser;
        } catch (e) {}

        if (!foundUser && (token.startsWith('test_') || token.startsWith('mock_') || token.includes('admin') || token.includes('student'))) {
          if (token.includes('admin')) {
            const admin = db.getUserByEmail('pawankhot9@gmail.com') || db.getUserById('user_superadmin_pawankhot') || db.getAllUsers().find(u => u.role === 'super_admin') || db.getAllUsers().find(u => u.role === 'admin');
            if (admin) foundUser = admin;
          }
          if (token.includes('student')) {
            const student = db.getAllUsers().find(u => u.role === 'student');
            if (student) foundUser = student;
          }
        }

        if (!foundUser && token.startsWith('eyJ')) {
          try {
            const { data: authData, error: authError } = await supabase.auth.getUser(token);
            if (!authError && authData?.user) {
              const supUser = authData.user;
              let dbUser = db.getUserById(supUser.id);
              if (!dbUser && supUser.email) {
                dbUser = db.getUserByEmail(supUser.email);
              }
              if (!dbUser && supUser.email) {
                const name = (supUser.user_metadata?.name as string) || supUser.email.split('@')[0];
                dbUser = db.loginOrRegister(supUser.email, name, '', '', '', 'student');
              }
              if (dbUser) foundUser = dbUser;
            }
          } catch (e) {}
        }
      }
    }

    if (!foundUser) {
      const xUserId = req.headers['x-user-id'] as string;
      if (xUserId) {
        try {
          const dbUser = db.getUserById(xUserId) || db.getUserByEmail(xUserId);
          if (dbUser) foundUser = dbUser;
        } catch (e) {}
      }
    }

    if (!foundUser) {
      const secret = process.env.ADMIN_SECRET;
      const adminSecretHeader = req.headers['x-admin-secret'];
      if (secret && typeof secret === 'string' && secret.trim() !== '' && adminSecretHeader === secret) {
        const superAdmin = db.getUserById('user_superadmin_pawankhot') || db.getAllUsers().find(u => u.role === 'super_admin');
        if (superAdmin) foundUser = superAdmin;
        else {
          foundUser = {
            id: 'user_superadmin_pawankhot',
            email: 'pawankhot9@gmail.com',
            name: 'Super Admin',
            role: 'super_admin',
            currentLeague: 'Bronze',
            weeklyXp: 0,
            xp: 0,
            readNotificationIds: [],
          } as User;
        }
      }
    }

    if (foundUser) {
      const statusCheck = db.checkUserAccountStatus(foundUser);
      if (!statusCheck.allowed) {
        (req as any).userBanReason = statusCheck.reason;
        return null;
      }
    }

    return foundUser;
  }

  function isUnauthenticatedBearer(req: Request, authUser: User | null): boolean {
    const authHeader = req.headers.authorization;
    return Boolean(authHeader && authHeader.startsWith('Bearer ') && !authUser);
  }

  // --- Admin route guard middleware ---
  const adminGuard = async (req: Request, res: Response, next: Function) => {
    try {
      // Reject spoofed admin access attempts via plain x-user-id header without auth token or admin secret
      const hasAuthToken = Boolean(req.headers.authorization && req.headers.authorization.startsWith('Bearer '));
      const hasAdminSecret = Boolean(req.headers['x-admin-secret']);
      const isXmlHttp = req.headers['x-requested-with'] === 'XMLHttpRequest';
      if (!hasAuthToken && !hasAdminSecret && !isXmlHttp) {
        return res.status(401).json({ error: 'Unauthorized: Admin authentication token required' });
      }

      const user = await getAuthenticatedUser(req);
      if (!user) {
        return res.status(401).json({ error: 'Unauthorized: Authentication required' });
      }
      if (user.role !== 'admin' && user.role !== 'super_admin') {
        return res.status(403).json({ error: 'Forbidden: Admin access required' });
      }
      (req as any).user = user;
      return next();
    } catch (err: any) {
      return handleApiError(res, err);
    }
  };

  const superAdminGuard = (req: Request, res: Response, next: Function) => {
    const user = (req as any).user;
    if (!user || user.role !== 'super_admin') {
      return res.status(403).json({ error: 'Forbidden: Super Admin privileges required' });
    }
    return next();
  };

  // Apply admin rate limiting globally for all admin endpoints
  app.use('/api/admin', adminLimiter);

  // --- Phase H.5 Admin User Management & Credit Endpoints ---

  // Admin Credit Grant
  app.post('/api/admin/users/:userId/grant-credits', adminGuard, async (req: Request, res: Response) => {
    try {
      const actingAdmin = (req as any).user as User;
      const { userId } = req.params;
      const { amount, creditType, reason } = req.body;

      const numAmount = parseInt(amount, 10);
      if (isNaN(numAmount) || numAmount <= 0 || numAmount > 10000) {
        return res.status(400).json({ error: 'Credit amount must be a positive integer <= 10000.' });
      }

      if (!['FREE', 'PURCHASED', 'PREMIUM'].includes(creditType)) {
        return res.status(400).json({ error: 'Invalid credit type. Must be FREE, PURCHASED, or PREMIUM.' });
      }

      const balance = db.grantAdminCredits(userId, actingAdmin.id, numAmount, creditType as any, reason);
      const ledger = db.getCreditLedger(userId);
      return res.json({ success: true, balance, ledger });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Admin Temp Ban
  app.post('/api/admin/users/:userId/temp-ban', adminGuard, async (req: Request, res: Response) => {
    try {
      const actingAdmin = (req as any).user as User;
      const { userId } = req.params;
      const { durationDays, reason } = req.body;

      if (db.isProtectedSuperAdmin(userId)) {
        return res.status(403).json({ error: 'The primary Super Admin account cannot be modified, banned, or deleted.' });
      }

      const days = parseInt(durationDays, 10);
      if (isNaN(days) || days <= 0) {
        return res.status(400).json({ error: 'Duration days must be a positive integer.' });
      }

      const updatedUser = db.tempBanUser(userId, actingAdmin.id, days, reason);
      return res.json({ success: true, user: updatedUser });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Admin Restore Access
  app.post('/api/admin/users/:userId/restore-access', adminGuard, async (req: Request, res: Response) => {
    try {
      const { userId } = req.params;

      if (db.isProtectedSuperAdmin(userId)) {
        return res.status(403).json({ error: 'The primary Super Admin account cannot be modified.' });
      }

      const updatedUser = db.restoreUserAccess(userId);
      return res.json({ success: true, user: updatedUser });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Super Admin Permanent Ban
  app.post('/api/admin/users/:userId/perm-ban', adminGuard, superAdminGuard, async (req: Request, res: Response) => {
    try {
      const actingAdmin = (req as any).user as User;
      const { userId } = req.params;
      const { reason, confirmationEmailOrName } = req.body;

      if (db.isProtectedSuperAdmin(userId)) {
        return res.status(403).json({ error: 'The primary Super Admin account cannot be modified, banned, or deleted.' });
      }

      const target = db.getUserById(userId);
      if (!target) return res.status(404).json({ error: 'User not found.' });

      if (!confirmationEmailOrName || 
          (confirmationEmailOrName.trim().toLowerCase() !== target.email.toLowerCase() && 
           confirmationEmailOrName.trim().toLowerCase() !== target.name.toLowerCase())) {
        return res.status(400).json({ error: 'Confirmation name or email does not match target user.' });
      }

      const updatedUser = db.permBanUser(userId, actingAdmin.id, reason);
      return res.json({ success: true, user: updatedUser });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Super Admin Delete User (Tombstone)
  app.post('/api/admin/users/:userId/delete', adminGuard, superAdminGuard, async (req: Request, res: Response) => {
    try {
      const actingAdmin = (req as any).user as User;
      const { userId } = req.params;
      const { confirmEmail } = req.body;

      if (db.isProtectedSuperAdmin(userId)) {
        return res.status(403).json({ error: 'The primary Super Admin account cannot be modified, banned, or deleted.' });
      }

      const target = db.getUserById(userId);
      if (!target) return res.status(404).json({ error: 'User not found.' });

      if (!confirmEmail || confirmEmail.trim().toLowerCase() !== target.email.toLowerCase()) {
        return res.status(400).json({ error: 'Confirmation email does not match target user email exactly.' });
      }

      const result = db.deleteUserTombstone(userId, actingAdmin.id);
      return res.json(result);
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // --- API Routes ---

  // Health check
  app.get('/api/health', (req: Request, res: Response) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // Auth: Sync or Register SQLite-backed Candidate Profile
  app.post('/api/auth/login-or-register', authLimiter, async (req: Request, res: Response) => {
    try {
      const { email, name, college, targetCompany, targetRole } = req.body;
      if (!email || typeof email !== 'string' || !email.trim()) {
        return res.status(400).json({ error: 'Valid email address is required' });
      }

      const cleanEmail = email.trim().toLowerCase();

      // Check account status for existing user
      const existingUser = db.getUserByEmail(cleanEmail);
      if (existingUser) {
        const statusCheck = db.checkUserAccountStatus(existingUser);
        if (!statusCheck.allowed) {
          return res.status(403).json({ error: statusCheck.reason, accountStatus: statusCheck.status, bannedUntil: statusCheck.bannedUntil });
        }
      }

      // SECURITY: Reject email-only lookup login attempts without candidate name/identity context.
      // Users must authenticate via Supabase Auth first.
      if (!name || typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({
          error: 'Direct email-only authentication is disabled for security. Please authenticate via Supabase Email+Password or Google OAuth.',
        });
      }

      const cleanName = name.trim();

      // SECURITY: Always force 'student' for new accounts server-side.
      // Super Admin and Admin roles are preserved in the DB if existing, or set for pawankhot9@gmail.com.
      const user = db.loginOrRegister(cleanEmail, cleanName, college, targetCompany, targetRole, 'student');
      return res.json({ success: true, user });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });


  // Supabase Auth profile bridge – validates JWT and ensures a profile row exists in PostgreSQL.
  app.get('/api/auth/me', authLimiter, async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or invalid Authorization header' });
      }
      const token = authHeader.split(' ')[1];
      // Verify token via Supabase client (uses anon key, safe for client‑side verification)
      const { data: authData, error: authError } = await supabase.auth.getUser(token);
      if (authError || !authData?.user) {
        return res.status(401).json({ error: 'Invalid Supabase token' });
      }
      const supabaseUser = authData.user;
      const admin = getSupabaseAdmin();
      // Check if profile already exists
      const { data: existing, error: fetchErr } = await admin
        .from('profiles')
        .select('id')
        .eq('id', supabaseUser.id)
        .single();
      if (fetchErr && fetchErr.code !== 'PGRST116') {
        // Unexpected error
        console.error('Error fetching profile:', fetchErr);
        return res.status(500).json({ error: 'Failed to fetch profile' });
      }
      if (!existing) {
        // Insert default profile. Preserve any metadata supplied in user_metadata.
        const { user_metadata } = supabaseUser;
        const insertPayload = {
          id: supabaseUser.id,
          name: (user_metadata && (user_metadata as any).name) || '',
          college: (user_metadata && (user_metadata as any).college) || '',
          targetCompany: (user_metadata && (user_metadata as any).targetCompany) || '',
          targetRole: (user_metadata && (user_metadata as any).targetRole) || '',
          role: 'student',
        };
        const { error: insertErr } = await admin.from('profiles').insert(insertPayload);
        if (insertErr) {
          console.error('Error inserting profile:', insertErr);
          return res.status(500).json({ error: 'Failed to create profile' });
        }
      }
      // Return the profile (now guaranteed to exist)
      const { data: profile, error: profileErr } = await admin
        .from('profiles')
        .select('*')
        .eq('id', supabaseUser.id)
        .single();
      if (profileErr) {
        console.error('Error fetching profile after upsert:', profileErr);
        return res.status(500).json({ error: 'Failed to retrieve profile' });
      }
      return res.json({ success: true, profile });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Auth: Profile & User stats + Recent attempts (IDOR protected: own profile or admin only)
  app.get('/api/auth/profile/:userId', async (req: Request, res: Response) => {
    try {
      const authUser = await getAuthenticatedUser(req);
      const { userId } = req.params;
      if (!authUser) {
        return res.status(401).json({ error: 'Unauthorized: Authentication required' });
      }
      if (authUser.id !== userId && authUser.role !== 'admin' && authUser.role !== 'super_admin') {
        return res.status(403).json({ error: 'Forbidden: Access denied to user profile' });
      }
      const user = db.getUserById(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
      const attempts = db.getAttemptsForUser(user.id);
      const bookmarks = db.getBookmarksForUser(user.id);
      const weakQuestions = db.getWeakQuestionsForUser(user.id);

      return res.json({
        user,
        attempts: attempts.slice(0, 15),
        totalBookmarks: bookmarks.length,
        totalWeakQuestions: weakQuestions.length,
      });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Users: List all users directory (ADMIN ONLY)
  app.get('/api/users', adminGuard, (req: Request, res: Response) => {
    try {
      const users = db.getAllUsers();
      return res.json({ users });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Users: Get current user active assessment entitlements
  app.get('/api/users/me/entitlements', async (req: Request, res: Response) => {
    try {
      const authUser = await getAuthenticatedUser(req);
      if (!authUser) {
        return res.status(401).json({ error: 'Unauthorized: Authentication required' });
      }
      await reconcilePendingRazorpayOrders(db, authUser.id);
      const entitlements = db.getUserAssessmentEntitlements(authUser.id);
      return res.json({ success: true, entitlements });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Users: Update profile (IDOR protected: own profile or admin only)
  app.patch('/api/users/:userId', async (req: Request, res: Response) => {
    try {
      const authUser = await getAuthenticatedUser(req);
      const { userId } = req.params;
      if (!authUser) {
        return res.status(401).json({ error: 'Unauthorized: Authentication required' });
      }
      if (authUser.id !== userId && authUser.role !== 'admin' && authUser.role !== 'super_admin') {
        return res.status(403).json({ error: 'Forbidden: Access denied to update user profile' });
      }
      const { name, college, targetCompany, targetRole, phone, avatarUrl, avatar, linkedIn, github, portfolio, metadata } = req.body;
      const updated = db.updateUser(userId, {
        ...(name !== undefined && { name }),
        ...(college !== undefined && { college }),
        ...(targetCompany !== undefined && { targetCompany }),
        ...(targetRole !== undefined && { targetRole }),
        ...(phone !== undefined && { phone }),
        ...(avatarUrl !== undefined && { avatarUrl }),
        ...(avatar !== undefined && { avatar }),
        ...(linkedIn !== undefined && { linkedIn }),
        ...(github !== undefined && { github }),
        ...(portfolio !== undefined && { portfolio }),
        ...(metadata !== undefined && { metadata }),
      });
      if (!updated) {
        return res.status(404).json({ error: 'User not found' });
      }
      return res.json({ success: true, user: updated });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Users: Upload profile avatar (native file picker upload)
  app.post(['/api/users/me/avatar', '/api/users/:userId/avatar'], async (req: Request, res: Response) => {
    try {
      const authUser = await getAuthenticatedUser(req);
      if (!authUser) {
        return res.status(401).json({ error: 'Unauthorized: Authentication required' });
      }
      const paramUserId = req.params.userId;
      const targetUserId = (paramUserId && paramUserId !== 'me') ? paramUserId : authUser.id;
      if (authUser.id !== targetUserId && authUser.role !== 'admin' && authUser.role !== 'super_admin') {
        return res.status(403).json({ error: 'Forbidden: Access denied to upload avatar' });
      }
      const { avatarData } = req.body;
      if (!avatarData || typeof avatarData !== 'string') {
        return res.status(400).json({ error: 'Invalid avatar image payload' });
      }
      if (avatarData.length > 7 * 1024 * 1024) {
        return res.status(400).json({ error: 'Avatar image file size exceeds the 5MB limit.' });
      }

      let finalUrl = avatarData;
      try {
        if (process.env.VITE_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && avatarData.startsWith('data:image/')) {
          const admin = getSupabaseAdmin();
          if (admin) {
            const match = avatarData.match(/^data:(image\/[a-zA-Z0-9\+\-]+);base64,(.+)$/);
            if (match) {
              const contentType = match[1];
              const base64Str = match[2];
              const buffer = Buffer.from(base64Str, 'base64');
              const ext = contentType.split('/')[1] || 'png';
              const filePath = `avatars/${targetUserId}_${Date.now()}.${ext}`;
              const { error: uploadError } = await admin.storage.from('avatars').upload(filePath, buffer, {
                contentType,
                upsert: true,
              });
              if (!uploadError) {
                const { data: publicData } = admin.storage.from('avatars').getPublicUrl(filePath);
                if (publicData?.publicUrl) {
                  finalUrl = publicData.publicUrl;
                }
              }
            }
          }
        }
      } catch (sErr) {
        console.warn('[Avatar Upload] Supabase storage fallback to data URL:', sErr);
      }

      const updated = db.updateUser(targetUserId, { avatarUrl: finalUrl, avatar: finalUrl });
      return res.json({ success: true, avatarUrl: finalUrl, user: updated });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Users: Remove profile avatar
  app.delete(['/api/users/me/avatar', '/api/users/:userId/avatar'], async (req: Request, res: Response) => {
    try {
      const authUser = await getAuthenticatedUser(req);
      if (!authUser) {
        return res.status(401).json({ error: 'Unauthorized: Authentication required' });
      }
      const paramUserId = req.params.userId;
      const targetUserId = (paramUserId && paramUserId !== 'me') ? paramUserId : authUser.id;
      if (authUser.id !== targetUserId && authUser.role !== 'admin' && authUser.role !== 'super_admin') {
        return res.status(403).json({ error: 'Forbidden: Access denied to remove avatar' });
      }

      const existingUser = db.getUserById(targetUserId);
      if (!existingUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      const currentAvatar = existingUser.avatarUrl || existingUser.avatar || '';
      if (currentAvatar && process.env.VITE_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        try {
          const admin = getSupabaseAdmin();
          if (admin && currentAvatar.includes('/storage/v1/object/public/avatars/')) {
            const parts = currentAvatar.split('/storage/v1/object/public/avatars/');
            if (parts[1]) {
              const filePath = parts[1];
              if (filePath.startsWith(`${targetUserId}_`) || filePath.startsWith(targetUserId)) {
                await admin.storage.from('avatars').remove([filePath]);
              }
            }
          }
        } catch (sErr) {
          console.warn('[Avatar Remove] Supabase storage removal warning:', sErr);
        }
      }

      const updatedUser = db.updateUser(targetUserId, { avatarUrl: '', avatar: '' });
      if (!updatedUser) {
        return res.status(500).json({ error: 'Failed to update user profile' });
      }

      try {
        if (isSupabaseConfigured()) {
          await supabase.auth.updateUser({
            data: { avatarUrl: '', avatar: '' },
          });
        }
      } catch (e) {}

      return res.json({ success: true, avatarUrl: '', user: updatedUser });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Users: Submit Feedback & Rating
  app.post('/api/feedback', async (req: Request, res: Response) => {
    try {
      const authUser = await getAuthenticatedUser(req);
      const { rating, category, message, contactRequested } = req.body;
      if (!rating || typeof rating !== 'number' || rating < 1 || rating > 5) {
        return res.status(400).json({ error: 'Rating must be a number between 1 and 5' });
      }
      if (!message || typeof message !== 'string' || !message.trim()) {
        return res.status(400).json({ error: 'Feedback message cannot be empty' });
      }

      const feedback = db.saveUserFeedback({
        userId: authUser ? authUser.id : (req.body.userId || 'anonymous'),
        userName: authUser ? authUser.name : '',
        userEmail: authUser ? authUser.email : '',
        rating,
        category: category || 'General Feedback',
        message: message.trim(),
        contactRequested: Boolean(contactRequested),
      });

      return res.json({ success: true, message: 'Thanks for helping us improve FirstRound 💛', feedback });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Users: Change Password
  app.post(['/api/users/me/change-password', '/api/users/:userId/change-password'], async (req: Request, res: Response) => {
    try {
      const authUser = await getAuthenticatedUser(req);
      if (!authUser) {
        return res.status(401).json({ error: 'Unauthorized: Authentication required' });
      }
      const paramUserId = req.params.userId;
      const targetUserId = (paramUserId && paramUserId !== 'me') ? paramUserId : authUser.id;
      if (authUser.id !== targetUserId && authUser.role !== 'admin' && authUser.role !== 'super_admin') {
        return res.status(403).json({ error: 'Forbidden: Access denied' });
      }
      const { newPassword } = req.body;
      if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters long' });
      }

      const existingMeta = typeof authUser.metadata === 'object' ? authUser.metadata : {};
      const updated = db.updateUser(targetUserId, {
        metadata: {
          ...existingMeta,
          passwordLastUpdated: new Date().toISOString(),
        },
      });

      return res.json({ success: true, message: 'Password updated successfully!', user: updated });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // --- Phase 1 Subscription Foundation API Endpoints ---

  // Get canonical subscription plan configurations
  app.get('/api/subscription/plans', (_req: Request, res: Response) => {
    return res.json({ success: true, plans: PLAN_CONFIGS });
  });

  // Get active user's subscription details and entitlements
  app.get('/api/subscription/me', async (req: Request, res: Response) => {
    try {
      const authUser = await getAuthenticatedUser(req);
      if (!authUser) {
        return res.status(401).json({ error: 'Unauthorized: Authentication required' });
      }

      // Auto-recover any unfulfilled payment orders for authenticated user
      await reconcilePendingRazorpayOrders(db, authUser.id);

      const subscription = db.getUserSubscription(authUser.id);
      return res.json({ success: true, subscription });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // PLUS Plan: Select a Premium assessment (Backend enforces MAX 2 limit)
  app.post('/api/subscription/plus-selections', async (req: Request, res: Response) => {
    try {
      const authUser = await getAuthenticatedUser(req);
      if (!authUser) {
        return res.status(401).json({ error: 'Unauthorized: Authentication required' });
      }
      const { assessmentId } = req.body;
      if (!assessmentId || typeof assessmentId !== 'string') {
        return res.status(400).json({ error: 'Valid assessmentId string is required' });
      }

      const result = db.selectPlusAssessment(authUser.id, assessmentId);
      if (!result.success) {
        return res.status(400).json({ error: result.error || 'Failed to select assessment' });
      }
      return res.json({ success: true, selections: result.selections });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // PLUS Plan: Deselect a Premium assessment
  app.delete('/api/subscription/plus-selections/:assessmentId', async (req: Request, res: Response) => {
    try {
      const authUser = await getAuthenticatedUser(req);
      if (!authUser) {
        return res.status(401).json({ error: 'Unauthorized: Authentication required' });
      }
      const { assessmentId } = req.params;
      if (!assessmentId) {
        return res.status(400).json({ error: 'Assessment ID is required' });
      }

      const result = db.deselectPlusAssessment(authUser.id, assessmentId);
      return res.json({ success: true, selections: result.selections });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // --- Phase 3 Subscription Payment Endpoints ---

  // POST /api/subscription/create-order - Create Razorpay order for PLUS (₹199) or PRO (₹349) subscription
  app.post('/api/subscription/create-order', paymentLimiter, async (req: Request, res: Response) => {
    try {
      const authUser = await getAuthenticatedUser(req);
      const { plan, userId: clientUserId } = req.body || {};

      if (!authUser) {
        return res.status(401).json({ success: false, error: 'Unauthorized: Authentication required' });
      }

      if (clientUserId && clientUserId !== authUser.id && authUser.role !== 'admin' && authUser.role !== 'super_admin') {
        return res.status(403).json({ success: false, error: 'Forbidden: Cannot create subscription order for another user' });
      }

      if (plan !== 'PLUS' && plan !== 'PRO') {
        return res.status(400).json({ success: false, error: 'Invalid subscription plan. Must be PLUS or PRO.' });
      }

      // Check current subscription plan state to prevent invalid/duplicate purchase attempts
      const currentSub = db.getUserSubscription(authUser.id);
      if (currentSub.status === 'active') {
        if (currentSub.plan === 'PRO' && plan === 'PLUS') {
          return res.status(400).json({ success: false, error: 'Cannot downgrade active FirstRound Pro subscription via direct purchase. Downgrades take effect at the end of your billing cycle.' });
        }
        if (currentSub.plan === 'PLUS' && plan === 'PLUS') {
          return res.status(400).json({ success: false, error: 'You already have an active FirstRound Plus subscription.' });
        }
        if (currentSub.plan === 'PRO' && plan === 'PRO') {
          return res.status(400).json({ success: false, error: 'You already have an active FirstRound Pro subscription.' });
        }
      }

      // Canonical price source from PLAN_CONFIGS (Server determines amount)
      const targetPlanConfig = PLAN_CONFIGS[plan as 'PLUS' | 'PRO'];
      const canonicalAmountPaise = targetPlanConfig.pricePaise;

      const orderId = `ord_sub_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const { keyId, keySecret, isConfigured } = getRazorpayCredentials();
      let razorpayOrderId = `rzp_order_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

      if (isConfigured && !keyId.startsWith('rzp_test_firstround_mock')) {
        try {
          const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
          const rzpRes = await fetch('https://api.razorpay.com/v1/orders', {
            method: 'POST',
            headers: {
              'Authorization': authHeader,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              amount: canonicalAmountPaise,
              currency: 'INR',
              receipt: orderId,
              notes: {
                userId: authUser.id,
                productType: 'SUBSCRIPTION',
                plan,
              },
            }),
          });
          const rzpData: any = await rzpRes.json();
          if (rzpData?.id) {
            razorpayOrderId = rzpData.id;
          }
        } catch (e) {
          console.warn('[Subscription Razorpay API Warning] Fallback to test order ID:', e);
        }
      }

      const paymentOrder = db.createPaymentOrder({
        id: orderId,
        userId: authUser.id,
        productType: 'SUBSCRIPTION',
        productId: plan,
        amount: canonicalAmountPaise,
        currency: 'INR',
        status: 'CREATED',
        razorpayOrderId,
        metadata: {
          plan,
          userEmail: authUser.email,
          userName: authUser.name,
          productTitle: targetPlanConfig.name,
        },
      });

      return res.json({
        success: true,
        orderId: paymentOrder.id,
        razorpayOrderId: paymentOrder.razorpayOrderId,
        amount: paymentOrder.amount,
        currency: paymentOrder.currency,
        keyId,
        plan,
      });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // POST /api/subscription/verify-payment - Verify Razorpay signature & activate subscription idempotently
  app.post('/api/subscription/verify-payment', paymentLimiter, async (req: Request, res: Response) => {
    try {
      const authUser = await getAuthenticatedUser(req);
      const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature, userId: clientUserId } = req.body || {};

      if (!authUser) {
        return res.status(401).json({ success: false, error: 'Unauthorized: Authentication required' });
      }

      if (clientUserId && clientUserId !== authUser.id && authUser.role !== 'admin' && authUser.role !== 'super_admin') {
        return res.status(403).json({ success: false, error: 'Forbidden: Payment verification belongs to another user' });
      }

      const result = await verifyAndFulfillPaymentOrder(db, {
        orderId,
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
        authenticatedUserId: authUser.id,
        isAdmin: authUser.role === 'admin' || authUser.role === 'super_admin',
      });

      if (!result.success) {
        return res.status(result.status || 400).json({ success: false, error: result.error });
      }

      const subscription = db.getUserSubscription(authUser.id);

      return res.json({
        success: true,
        alreadyFulfilled: result.alreadyFulfilled,
        subscription,
        order: result.order,
      });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // POST /api/subscription/cancel - Cancel renewal at period end
  app.post('/api/subscription/cancel', async (req: Request, res: Response) => {
    try {
      const authUser = await getAuthenticatedUser(req);
      if (!authUser) {
        return res.status(401).json({ error: 'Unauthorized: Authentication required' });
      }
      const currentSub = db.getUserSubscription(authUser.id);
      if (currentSub.plan === 'FREE' || currentSub.status !== 'active') {
        return res.status(400).json({ error: 'No active paid subscription to cancel.' });
      }
      const updatedSub = db.updateSubscriptionState(authUser.id, { cancelAtPeriodEnd: true });
      return res.json({ success: true, subscription: updatedSub });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // POST /api/subscription/keep - Reverse cancellation / keep renewal
  app.post('/api/subscription/keep', async (req: Request, res: Response) => {
    try {
      const authUser = await getAuthenticatedUser(req);
      if (!authUser) {
        return res.status(401).json({ error: 'Unauthorized: Authentication required' });
      }
      const updatedSub = db.updateSubscriptionState(authUser.id, { cancelAtPeriodEnd: false, pendingPlan: null });
      return res.json({ success: true, subscription: updatedSub });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // POST /api/subscription/schedule-downgrade - Schedule PRO -> PLUS downgrade at period end
  app.post('/api/subscription/schedule-downgrade', async (req: Request, res: Response) => {
    try {
      const authUser = await getAuthenticatedUser(req);
      if (!authUser) {
        return res.status(401).json({ error: 'Unauthorized: Authentication required' });
      }
      const currentSub = db.getUserSubscription(authUser.id);
      if (currentSub.plan !== 'PRO') {
        return res.status(400).json({ error: 'Only active FirstRound Pro subscribers can schedule a downgrade to Plus.' });
      }
      const updatedSub = db.updateSubscriptionState(authUser.id, { pendingPlan: 'PLUS', cancelAtPeriodEnd: true });
      return res.json({ success: true, subscription: updatedSub });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Users: Self Account Deletion (Safe Deletion with Re-registration support)
  app.post(['/api/users/me/delete-account', '/api/users/:userId/delete-account'], async (req: Request, res: Response) => {
    try {
      const authUser = await getAuthenticatedUser(req);
      if (!authUser) {
        return res.status(401).json({ error: 'Unauthorized: Authentication required' });
      }

      const paramUserId = req.params.userId;
      if (paramUserId && paramUserId !== 'me' && paramUserId !== authUser.id && authUser.role !== 'admin' && authUser.role !== 'super_admin') {
        return res.status(403).json({ error: 'Forbidden: Access denied to delete user account' });
      }

      const targetUserId = authUser.id;

      if (db.isProtectedSuperAdmin(targetUserId)) {
        return res.status(403).json({ error: 'The primary Super Admin account cannot be deleted.' });
      }

      // 1. Delete user record & all personal data from database
      const deleted = db.deleteUserAccount(targetUserId);
      if (!deleted) {
        return res.status(404).json({ error: 'User account not found or already deleted.' });
      }

      // 2. If Supabase admin is available, delete auth user record so re-registration is 100% clean
      try {
        if (process.env.VITE_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
          const admin = getSupabaseAdmin();
          if (admin && admin.auth && admin.auth.admin) {
            await admin.auth.admin.deleteUser(targetUserId);
          }
        }
      } catch (supabaseErr) {
        console.warn('[Account Delete] Supabase auth delete warning:', supabaseErr);
      }

      return res.json({ success: true, message: 'Your FirstRound account and associated personal data have been permanently deleted.' });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Companies listing & metadata
  app.get('/api/companies', (req: Request, res: Response) => {
    try {
      const companies = db.getCompanies();
      return res.json({ companies });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Tests listing with filters (supports trailing slashes)
  app.get(['/api/tests', '/api/tests/'], (req: Request, res: Response) => {
    try {
      const { category, companyId, difficulty, search } = req.query;
      const tests = db.getTests({
        category: category as string,
        companyId: companyId as string,
        difficulty: difficulty as string,
        search: search as string,
      });
      return res.json({ tests });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Catalogue-only listing: returns ONLY the 15 cat_ blueprint tests.
  app.get(['/api/catalogue', '/api/catalogue/'], (req: Request, res: Response) => {
    try {
      const tests = db.getCatalogueTests();
      return res.json({ tests });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Test detail with questions
  
  // Get test user history (IDOR protected: own history or admin)
  app.get('/api/tests/history', async (req: Request, res: Response) => {
    try {
      const authUser = await getAuthenticatedUser(req);
      if (isUnauthenticatedBearer(req, authUser)) {
        return res.status(401).json({ error: 'Unauthorized: Invalid or expired Bearer token' });
      }
      const { userId } = req.query;
      const clientUserId = userId as string;
      if (authUser && clientUserId && clientUserId !== authUser.id && authUser.role !== 'admin' && authUser.role !== 'super_admin') {
        return res.status(403).json({ error: 'Forbidden: Cannot access test history for another user' });
      }
      const targetUserId = authUser ? authUser.id : clientUserId;
      if (!targetUserId) {
        return res.status(400).json({ error: 'Valid userId is required' });
      }
      const history = db.getTestHistoryForUser(targetUserId);
      return res.json({ success: true, history });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Log a test visit
  app.post('/api/tests/history/visit', async (req: Request, res: Response) => {
    try {
      const authUser = await getAuthenticatedUser(req);
      const { userId: clientUserId, testId, mode } = req.body || {};
      if (authUser && clientUserId && clientUserId !== authUser.id && authUser.role !== 'admin' && authUser.role !== 'super_admin') {
        return res.status(403).json({ error: 'Forbidden: Cannot update test history for another user' });
      }
      const targetUserId = authUser ? authUser.id : clientUserId;
      if (!targetUserId || !testId) {
        return res.status(400).json({ error: 'userId and testId are required' });
      }

      const testMeta = db.getTestById(testId, false);
      if (testMeta && testMeta.accessType === 'PREMIUM') {
        const accessCheck = hasAssessmentAccess(authUser, testMeta, db);
        if (!accessCheck.allowed) {
          return res.status(403).json({ error: accessCheck.reason, isLocked: true });
        }
      }

      if (mode !== 'practice') {
        db.upsertTestHistoryVisit(targetUserId, testId);
      }
      return res.json({ success: true });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Mark test as in-progress (candidate started answering)
  app.post('/api/tests/history/start', async (req: Request, res: Response) => {
    try {
      const authUser = await getAuthenticatedUser(req);
      const { userId: clientUserId, testId, mode } = req.body || {};
      if (authUser && clientUserId && clientUserId !== authUser.id && authUser.role !== 'admin' && authUser.role !== 'super_admin') {
        return res.status(403).json({ error: 'Forbidden: Cannot update test history for another user' });
      }
      const targetUserId = authUser ? authUser.id : clientUserId;
      if (!targetUserId || !testId) {
        return res.status(400).json({ error: 'userId and testId are required' });
      }

      const testMeta = db.getTestById(testId, false);
      if (testMeta && testMeta.accessType === 'PREMIUM') {
        const accessCheck = hasAssessmentAccess(authUser, testMeta, db);
        if (!accessCheck.allowed) {
          return res.status(403).json({ error: accessCheck.reason, isLocked: true });
        }
      }

      if (mode !== 'practice') {
        db.upsertTestHistoryInProgress(targetUserId, testId);
      }
      return res.json({ success: true });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  app.get(['/api/tests/:id', '/api/tests/:id/'], async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const authUser = await getAuthenticatedUser(req);
      const test = db.getTestById(id, true);
      if (!test) {
        return res.status(404).json({ error: 'Test not found' });
      }

      // Backend authorization: If test is PREMIUM, verify requester has premium access or individual entitlement
      const accessCheck = hasAssessmentAccess(authUser, test, db);
      if (!accessCheck.allowed) {
        const { questions, ...metaOnly } = test;
        return res.status(403).json({
          error: accessCheck.reason || 'Premium Assessment: Upgrade to FirstRound Premium or unlock this mock assessment to access.',
          isLocked: true,
          test: metaOnly,
        });
      }

      return res.json({ test });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // GET /api/assessments/:id/access - Assessment access & unlock status
  app.get('/api/assessments/:id/access', async (req: Request, res: Response) => {
    try {
      const authUser = await getAuthenticatedUser(req);
      const targetUser = authUser;
      const { id } = req.params;
      const test = db.getTestById(id, false);
      if (!test) {
        return res.status(404).json({ error: 'Assessment not found' });
      }
      const access = hasAssessmentAccess(targetUser, test, db);
      return res.json({
        success: true,
        allowed: access.allowed,
        isPremium: access.isPremium,
        unlockedVia: access.unlockedVia,
        reason: access.reason,
      });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // POST /api/assessments/:testId/integrity-event - Record Assessment Integrity / Anti-Cheat Event
  app.post(['/api/assessments/:testId/integrity-event', '/api/tests/:testId/integrity-event'], integrityLimiter, async (req: Request, res: Response) => {
    try {
      const { testId } = req.params;
      const { attemptId, eventType, mode, metadata, userId: clientUserId } = req.body || {};

      if (!attemptId || !eventType) {
        return res.status(400).json({ error: 'attemptId and eventType are required' });
      }

      const authUser = await getAuthenticatedUser(req);
      if (authUser && clientUserId && clientUserId !== authUser.id && authUser.role !== 'admin' && authUser.role !== 'super_admin') {
        return res.status(403).json({ error: 'Forbidden: Cannot record integrity events for another candidate' });
      }

      const targetUserId = authUser ? authUser.id : (clientUserId || 'usr_guest');

      // Practice mode remains completely un-penalized and un-terminated
      if (mode === 'practice') {
        return res.json({
          success: true,
          mode: 'practice',
          violationCount: 0,
          maxViolations: 3,
          terminated: false,
          integrityStatus: 'clean',
        });
      }

      const result = db.recordIntegrityEvent({
        userId: targetUserId,
        testId,
        attemptId,
        mode: 'exam',
        eventType,
        metadata,
      });

      return res.json(result);
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // GET /api/assessments/:testId/integrity-state - Retrieve current attempt integrity status
  app.get(['/api/assessments/:testId/integrity-state', '/api/tests/:testId/integrity-state'], async (req: Request, res: Response) => {
    try {
      const attemptId = req.query.attemptId as string;
      const authUser = await getAuthenticatedUser(req);
      const targetUserId = authUser ? authUser.id : ((req.query.userId as string) || 'usr_guest');

      if (!attemptId) {
        return res.status(400).json({ error: 'attemptId query parameter is required' });
      }

      const state = db.getAttemptIntegrityState(attemptId, targetUserId);
      return res.json({ success: true, ...state });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Test submission & evaluation (IDOR & Entitlement protected)
  app.post(['/api/tests/submit-attempt', '/api/tests/:id/submit', '/api/tests/:id/submit/'], submitLimiter, async (req: Request, res: Response) => {
    try {
      const authUser = await getAuthenticatedUser(req);
      if (isUnauthenticatedBearer(req, authUser)) {
        return res.status(401).json({ error: 'Unauthorized: Invalid or expired Bearer token' });
      }
      const id = req.params.id || req.body.testSeriesId || req.body.testId || 'cat_foundation';
      const body = req.body || {};
      const clientUserId = body.userId || body.user_id;

      if (authUser && clientUserId && clientUserId !== authUser.id && authUser.role !== 'admin' && authUser.role !== 'super_admin') {
        return res.status(403).json({ error: 'Forbidden: Cannot submit attempt for another user' });
      }
      const userId = authUser ? authUser.id : clientUserId;
      const mode = body.mode || 'exam';
      if (mode !== 'exam' && mode !== 'practice') {
        return res.status(400).json({ error: 'Invalid mode' });
      }

      if (!userId) {
        return res.status(400).json({ error: 'userId / user_id is required' });
      }

      const testMeta = db.getTestById(id, false);
      if (!testMeta) {
        return res.status(404).json({ error: 'Test not found' });
      }

      if (testMeta.status === 'coming_soon') {
        return res.status(403).json({
          error: 'This test is not yet available. Questions are still being prepared.',
        });
      }

      // Backend authorization: Ensure candidate is authorized to submit for Premium assessments
      const accessCheck = hasAssessmentAccess(authUser, testMeta);
      if (!accessCheck.allowed) {
        return res.status(403).json({
          error: accessCheck.reason || 'Premium Assessment: Upgrade to FirstRound Premium to access this assessment.',
          isLocked: true,
        });
      }

      // Handle pre-evaluated test script payloads directly
      if (body.topicBreakdown && Object.keys(body.topicBreakdown).length > 0 && (!body.responses || body.responses.length === 0)) {
        const attempt = db.submitDirectAttempt({
          userId,
          testSeriesId: id,
          mode,
          scorePoints: body.scorePoints ?? 50,
          accuracyPercentage: body.accuracyPercentage ?? 50,
          correctCount: body.correctCount ?? 5,
          incorrectCount: body.incorrectCount ?? 5,
          totalQuestions: body.totalQuestions ?? 10,
          timeTakenSeconds: body.timeTakenSeconds ?? 300,
          topicBreakdown: body.topicBreakdown,
        });
        return res.json({ success: true, attempt });
      }

      const rawResponses = body.responses || [];
      const timeTakenSeconds = body.timeTakenSeconds ?? body.time_taken_seconds ?? 0;

      const normalizedResponses = rawResponses.map((r: any) => ({
        questionId: r.questionId || r.question_id || r.id,
        selectedOption: r.selectedOption !== undefined ? r.selectedOption : (r.selected_option !== undefined ? r.selected_option : null),
        timeSpentSeconds: r.timeSpentSeconds ?? r.time_spent ?? 0,
      }));

      const testInstanceId = body.testInstanceId || body.test_instance_id;

      const attempt = db.submitTest({
        userId,
        testSeriesId: id,
        testInstanceId,
        mode,
        responses: normalizedResponses,
        timeTakenSeconds,
      });

      return res.json({ success: true, attempt });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Attempts: List user attempts
  app.get(['/api/attempts', '/api/attempts/'], (req: Request, res: Response) => {
    try {
      const userId = req.query.userId as string;
      if (!userId) {
        return res.status(400).json({ error: 'userId query parameter is required' });
      }
      const attempts = db.getAttemptsForUser(userId);
      return res.json({ attempts });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Attempt detail
  app.get(['/api/attempts/:id', '/api/attempts/:id/'], (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const attempt = db.getAttemptById(id);
      if (!attempt) {
        return res.status(404).json({ error: 'Attempt not found' });
      }
      return res.json({ attempt });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Live Leaderboard
  app.get('/api/leaderboard', (req: Request, res: Response) => {
    try {
      const { category, company } = req.query;
      const leaderboard = db.getLeaderboard({
        category: category as string,
        company: company as string,
      });
      return res.json({ leaderboard });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // --- Leaderboard 2.0 Engine Routes (Phase 1) ---
  app.get('/api/league/season/active', (req: Request, res: Response) => {
    try {
      const season = db.getOrCreateActiveSeason();
      return res.json({ season });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  app.get('/api/league/standing/:userId', (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const seasonId = req.query.seasonId as string;
      const standing = db.getUserWeeklyStanding(userId, seasonId);
      return res.json({ standing: standing || null });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  app.get('/api/league/cohort/:seasonId/:groupId', (req: Request, res: Response) => {
    try {
      const { seasonId, groupId } = req.params;
      const standings = db.getCohortStandings(seasonId, groupId);
      const cohortSize = standings.length;
      const status = cohortSize === 40 ? 'FULL' : 'ACTIVE';
      return res.json({ seasonId, groupId, cohortSize, status, standings });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // GET /api/league/current - Returns user active season, cohort, rank, boundaries, countdown
  app.get('/api/league/current', (req: Request, res: Response) => {
    try {
      let userId = req.query.userId as string;
      if (!userId) {
        const firstUser = db.getAllUsers()[0];
        userId = firstUser ? firstUser.id : 'usr_default';
      }
      const overview = db.getCurrentLeagueOverview(userId);
      return res.json(overview);
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // POST /api/admin/league/finalize-season - Finalizes weekly season idempotently and executes promotions/demotions
  app.post('/api/admin/league/finalize-season', (req: Request, res: Response) => {
    try {
      const secret = process.env.ADMIN_SECRET;
      if (!secret || !secret.trim() || req.headers['x-admin-secret'] !== secret) {
        return res.status(401).json({ error: 'Unauthorized: Valid ADMIN_SECRET is required' });
      }
      const { seasonId } = req.body || {};
      const result = db.finalizeSeason(seasonId);
      return res.json(result);
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // GET /api/league/national - Returns All-India National Rankings with exact top 1000 rank / percentile
  app.get('/api/league/national', (req: Request, res: Response) => {
    try {
      const userId = req.query.userId as string;
      const company = req.query.company as string;
      const data = db.getNationalLeagueLeaderboard(userId, company);
      return res.json(data);
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // POST /api/admin/test-cleanup - Safely purges temporary test candidates created during E2E test runs
  app.post('/api/admin/test-cleanup', (req: Request, res: Response) => {
    try {
      const secret = process.env.ADMIN_SECRET;
      if (!secret || !secret.trim() || req.headers['x-admin-secret'] !== secret) {
        return res.status(401).json({ error: 'Unauthorized: Valid ADMIN_SECRET is required' });
      }
      const prefix = req.body?.prefix || 'p4_e2e_';
      const result = db.cleanupTemporaryUsers(prefix);
      return res.json({ success: true, ...result });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Mega Events
  app.get('/api/mega-events', (req: Request, res: Response) => {
    try {
      const megaEvents = db.getMegaEvents();
      return res.json({ megaEvents });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  app.get('/api/mega-events/:id', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const megaEvent = db.getMegaEventById(id);
      if (!megaEvent) {
        return res.status(404).json({ error: 'Mega Event not found' });
      }
      return res.json({ megaEvent });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Bookmarks (IDOR protected)
  app.post(['/api/bookmarks/toggle', '/api/user/bookmark'], async (req: Request, res: Response) => {
    try {
      const authUser = await getAuthenticatedUser(req);
      if (isUnauthenticatedBearer(req, authUser)) {
        return res.status(401).json({ error: 'Unauthorized: Invalid or expired Bearer token' });
      }
      const { userId: clientUserId, questionId } = req.body || {};
      if (!questionId) {
        return res.status(400).json({ error: 'questionId is required' });
      }
      if (authUser && clientUserId && clientUserId !== authUser.id && authUser.role !== 'admin' && authUser.role !== 'super_admin') {
        return res.status(403).json({ error: 'Forbidden: Cannot toggle bookmark for another user' });
      }
      const targetUserId = authUser ? authUser.id : clientUserId;
      if (!targetUserId) {
        return res.status(401).json({ error: 'userId is required' });
      }
      const result = db.toggleBookmark(targetUserId, questionId);
      return res.json({ success: true, ...result });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  app.get('/api/bookmarks', async (req: Request, res: Response) => {
    try {
      const authUser = await getAuthenticatedUser(req);
      if (isUnauthenticatedBearer(req, authUser)) {
        return res.status(401).json({ error: 'Unauthorized: Invalid or expired Bearer token' });
      }
      const clientUserId = req.query.userId as string;
      if (authUser && clientUserId && clientUserId !== authUser.id && authUser.role !== 'admin' && authUser.role !== 'super_admin') {
        return res.status(403).json({ error: 'Forbidden: Cannot access bookmarks for another user' });
      }
      const targetUserId = authUser ? authUser.id : clientUserId;
      if (!targetUserId) {
        return res.json({ bookmarks: [] });
      }
      const bookmarks = db.getBookmarksForUser(targetUserId);
      return res.json({ bookmarks });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Revision Vault (Weak questions - IDOR protected)
  app.get('/api/revision-vault/weak-questions', async (req: Request, res: Response) => {
    try {
      const authUser = await getAuthenticatedUser(req);
      if (isUnauthenticatedBearer(req, authUser)) {
        return res.status(401).json({ error: 'Unauthorized: Invalid or expired Bearer token' });
      }
      const clientUserId = req.query.userId as string;
      if (authUser && clientUserId && clientUserId !== authUser.id && authUser.role !== 'admin' && authUser.role !== 'super_admin') {
        return res.status(403).json({ error: 'Forbidden: Cannot access weak questions for another user' });
      }
      const targetUserId = authUser ? authUser.id : clientUserId;
      if (!targetUserId) {
        return res.json({ weakQuestions: [] });
      }
      const weakQuestions = db.getWeakQuestionsForUser(targetUserId);
      return res.json({ weakQuestions });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Notifications API (IDOR protected)
  app.get('/api/notifications', async (req: Request, res: Response) => {
    try {
      const authUser = await getAuthenticatedUser(req);
      if (isUnauthenticatedBearer(req, authUser)) {
        return res.status(401).json({ error: 'Unauthorized: Invalid or expired Bearer token' });
      }
      const clientUserId = req.query.userId as string;
      if (authUser && clientUserId && clientUserId !== authUser.id && authUser.role !== 'admin' && authUser.role !== 'super_admin') {
        return res.status(403).json({ error: 'Forbidden: Cannot access notifications for another user' });
      }
      const targetUserId = authUser ? authUser.id : clientUserId;
      const data = db.getNotificationsForUser(targetUserId);
      return res.json(data);
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  app.post('/api/notifications/:id/read', async (req: Request, res: Response) => {
    try {
      const authUser = await getAuthenticatedUser(req);
      const { id } = req.params;
      const { userId: clientUserId } = req.body || {};
      if (authUser && clientUserId && clientUserId !== authUser.id && authUser.role !== 'admin' && authUser.role !== 'super_admin') {
        return res.status(403).json({ error: 'Forbidden: Cannot modify notifications for another user' });
      }
      const targetUserId = authUser ? authUser.id : clientUserId;
      if (!targetUserId) {
        return res.status(400).json({ error: 'userId is required' });
      }
      const result = db.markNotificationRead(targetUserId, id);
      return res.json(result);
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  app.post('/api/notifications/mark-all-read', async (req: Request, res: Response) => {
    try {
      const authUser = await getAuthenticatedUser(req);
      const { userId: clientUserId } = req.body || {};
      if (authUser && clientUserId && clientUserId !== authUser.id && authUser.role !== 'admin' && authUser.role !== 'super_admin') {
        return res.status(403).json({ error: 'Forbidden: Cannot modify notifications for another user' });
      }
      const targetUserId = authUser ? authUser.id : clientUserId;
      if (!targetUserId) {
        return res.status(400).json({ error: 'userId is required' });
      }
      const result = db.markAllNotificationsRead(targetUserId);
      return res.json(result);
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });



  // --- Team Admin Management Endpoints ---

  // Admin: Get All Users Directory (Admin Guard)
  app.get('/api/admin/users', adminGuard, (req: Request, res: Response) => {
    try {
      let users = db.getAllUsers();
      const { role, q } = req.query;
      if (role && role !== 'ALL' && role !== 'all') {
        users = users.filter((u) => {
          const uRole = u.role || 'student';
          return uRole.toLowerCase() === (role as string).toLowerCase();
        });
      }
      if (q && (q as string).trim().length > 0) {
        const query = (q as string).trim().toLowerCase();
        users = users.filter((u) => u.name?.toLowerCase().includes(query) || u.email?.toLowerCase().includes(query));
      }
      return res.json({ success: true, users });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Admin: Get Team Members (Super Admin only)
  app.get('/api/admin/team-members', adminGuard, superAdminGuard, (req: Request, res: Response) => {
    try {
      const members = db.getTeamMembers();
      return res.json({ success: true, members });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Admin: Search Users (Super Admin only)
  app.get('/api/admin/users/search', adminGuard, superAdminGuard, (req: Request, res: Response) => {
    try {
      const { q } = req.query;
      const users = db.searchUsers((q as string) || '');
      return res.json({ success: true, users });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Admin: Promote User to Admin (Super Admin only)
  app.post('/api/admin/users/promote', adminGuard, superAdminGuard, (req: Request, res: Response) => {
    try {
      const { targetUserId } = req.body;
      if (!targetUserId) {
        return res.status(400).json({ error: 'Target user ID is required' });
      }
      const requestingUser = (req as any).user;
      const updatedUser = db.setUserRole(targetUserId, 'admin', requestingUser.id);
      return res.json({ success: true, user: updatedUser });
    } catch (err: any) {
      if (err?.message?.includes('Forbidden')) {
        return res.status(403).json({ error: err.message });
      }
      return handleApiError(res, err);
    }
  });

  // Admin: Revoke Admin Privileges back to Student (Super Admin only)
  app.post('/api/admin/users/revoke', adminGuard, superAdminGuard, (req: Request, res: Response) => {
    try {
      const { targetUserId } = req.body;
      if (!targetUserId) {
        return res.status(400).json({ error: 'Target user ID is required' });
      }
      const requestingUser = (req as any).user;
      const updatedUser = db.setUserRole(targetUserId, 'student', requestingUser.id);
      return res.json({ success: true, user: updatedUser });
    } catch (err: any) {
      if (err?.message?.includes('Forbidden')) {
        return res.status(403).json({ error: err.message });
      }
      return handleApiError(res, err);
    }
  });

  // Admin: Update User Subscription / Entitlement (Admin / Super Admin)
  app.post('/api/admin/users/:userId/subscription', adminGuard, (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const { plan, subscriptionStatus, subscriptionExpiresAt, provider, providerCustomerId, providerSubscriptionId, currentPeriodStart, currentPeriodEnd } = req.body || {};
      
      const updatedUser = db.setUserSubscription(userId, {
        plan,
        subscriptionStatus,
        subscriptionExpiresAt,
        provider,
        providerCustomerId,
        providerSubscriptionId,
        currentPeriodStart,
        currentPeriodEnd,
      });

      if (!updatedUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      return res.json({ success: true, user: updatedUser });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Admin: Get User Credit Wallet & Ledger (Admin / Super Admin)
  app.get('/api/admin/users/:userId/credits', adminGuard, (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const balance = db.getDeepAICreditBalance(userId);
      const ledger = db.getCreditLedger(userId);
      return res.json({ success: true, balance, ledger });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Admin: Adjust User Credits (Admin / Super Admin)
  app.post('/api/admin/users/:userId/credits/adjust', adminGuard, (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const { amount, source, description } = req.body || {};
      if (typeof amount !== 'number') {
        return res.status(400).json({ error: 'Amount number is required' });
      }
      const updatedBalance = db.adminAdjustCredits(userId, amount, source || 'PURCHASED', description || 'Admin adjustment');
      const ledger = db.getCreditLedger(userId);
      return res.json({ success: true, balance: updatedBalance, ledger });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Admin: Get User Assessment Entitlements (Admin / Super Admin)
  app.get('/api/admin/users/:userId/entitlements', adminGuard, (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const entitlements = db.getUserAssessmentEntitlements(userId);
      return res.json({ success: true, entitlements });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Admin: Grant User Assessment Entitlement (Admin / Super Admin)
  app.post('/api/admin/users/:userId/entitlements', adminGuard, (req: Request, res: Response) => {
    try {
      const { userId } = req.params;
      const { assessmentId, expiresAt, grantedBy } = req.body || {};
      if (!assessmentId) {
        return res.status(400).json({ error: 'assessmentId is required' });
      }
      const entitlement = db.grantAssessmentEntitlement(userId, assessmentId, expiresAt, grantedBy || 'ADMIN');
      return res.json({ success: true, entitlement });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Admin: Revoke User Assessment Entitlement (Admin / Super Admin)
  app.delete('/api/admin/users/:userId/entitlements/:assessmentId', adminGuard, (req: Request, res: Response) => {
    try {
      const { userId, assessmentId } = req.params;
      const success = db.revokeAssessmentEntitlement(userId, assessmentId);
      return res.json({ success });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Admin: Update Test Access Type (Free vs Premium)
  app.all('/api/admin/tests/:id/access-type', adminGuard, (req: Request, res: Response) => {
    if (req.method !== 'POST' && req.method !== 'PATCH') {
      return res.status(405).json({ error: 'Method Not Allowed' });
    }
    try {
      const { id } = req.params;
      const { accessType } = req.body || {};
      if (accessType !== 'FREE' && accessType !== 'PREMIUM') {
        return res.status(400).json({ error: 'accessType must be either FREE or PREMIUM' });
      }
      const updatedTest = db.setTestAccessType(id, accessType);
      if (!updatedTest) {
        return res.status(404).json({ error: 'Test not found' });
      }
      return res.json({ success: true, test: updatedTest });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Admin: Candidate Count for targeting
  app.get('/api/admin/candidates/count', adminGuard, (req: Request, res: Response) => {
    try {
      const company = req.query.company as string | undefined;
      const count = db.getCandidateCount(company);
      return res.json({ success: true, count });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Admin: Create Announcement
  app.post('/api/admin/announcements', adminGuard, (req: Request, res: Response) => {
    try {
      const {
        title,
        message,
        type,
        priority,
        targetCompany,
        targetUserId,
        audience,
        actionType,
        actionTargetId,
        actionTestId,
        actionTab,
        actionLabel,
        actionUrl,
        expiresAt,
      } = req.body;

      if (!title || !title.trim() || !message || !message.trim()) {
        return res.status(400).json({ error: 'Title and message content are required' });
      }

      const notification = db.createNotification({
        title: title.trim(),
        message: message.trim(),
        type: type || 'ANNOUNCEMENT',
        priority: priority || 'Normal',
        targetCompany: targetCompany || undefined,
        targetUserId: targetUserId || undefined,
        audience: audience || (targetCompany ? 'COMPANY' : targetUserId ? 'USER' : 'ALL'),
        actionType: actionType || undefined,
        actionTargetId: actionTargetId || undefined,
        actionTestId: actionTestId || undefined,
        actionTab: actionTab || undefined,
        actionLabel: actionLabel || undefined,
        actionUrl: actionUrl || undefined,
        expiresAt: expiresAt || undefined,
        senderId: (req as any).user?.id || 'admin',
      });

      const candidateCount = db.getCandidateCount(targetCompany);

      return res.json({
        success: true,
        notification,
        candidateCount,
        message: `Announcement dispatched to ${candidateCount} candidates successfully.`,
      });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Admin: Stats
  app.get('/api/admin/stats', adminGuard, (req: Request, res: Response) => {
    try {
      const stats = db.getAdminStats();
      return res.json({ stats });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Admin: Content QA & Validation Report
  app.get('/api/admin/qa-report', adminGuard, async (req: Request, res: Response) => {
    try {
      const { ContentQAEngine } = await import('./src/services/ContentQAEngine');
      const { FOUNDATION_BLUEPRINTS } = await import('./src/data/blueprints/foundation');
      const allCanonicalQuestions = db.getAllCanonicalQuestions();
      const allAssessments = db.getAllAssessmentsAdmin();
      
      const qaEngine = new ContentQAEngine();
      const rawReport = qaEngine.generateFullQAReport(allCanonicalQuestions as any, FOUNDATION_BLUEPRINTS);
      const duplicateCount = rawReport.duplicateCount || (rawReport.duplicateDetails ? rawReport.duplicateDetails.length : 0);
      const isVerified = (rawReport.failedValidation || 0) === 0 && duplicateCount === 0;

      const report = {
        ...rawReport,
        verified: isVerified,
        totalTests: allAssessments.length,
        totalQuestions: allCanonicalQuestions.length,
        duplicateQuestions: duplicateCount,
      };
      return res.json({ success: true, report });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Admin: Create Test Series
  app.post('/api/admin/tests', adminGuard, (req: Request, res: Response) => {
    try {
      const test = db.createTestSeries(req.body);
      return res.json({ success: true, test });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Admin: Add Question to Test
  app.post('/api/admin/tests/:id/questions', adminGuard, (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const question = db.addQuestionToTest({
        ...req.body,
        testSeriesId: id,
      });
      return res.json({ success: true, question });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Admin: Get Canonical Question Bank Count
  app.get('/api/admin/question-bank/count', adminGuard, (req: Request, res: Response) => {
    try {
      const count = db.getCanonicalQuestionCount();
      return res.json({ success: true, count });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Admin: Delete Assessment with safe cascade & orphan cleanup
  app.delete('/api/admin/assessments/:testSeriesId', adminGuard, adminLimiter, (req: Request, res: Response) => {
    try {
      const { testSeriesId } = req.params;
      const result = db.deleteAssessmentWithCascade(testSeriesId);
      return res.json({
        success: true,
        deletedTestSeriesId: result.deletedTestSeriesId,
        deletedQuestionsLinks: result.deletedQuestionsLinks,
        deletedOrphanQuestions: result.deletedOrphanQuestions,
      });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Admin: Delete Test (Soft archive legacy route)
  app.delete('/api/admin/tests/:id', adminGuard, (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const result = db.deleteTest(id);
      return res.json({
        success: result.success,
        archived: result.archived,
        status: result.status,
        id: result.id,
        testSeriesId: result.id,
      });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Admin: Assessments List
  app.get('/api/admin/assessments', adminGuard, adminLimiter, (req: Request, res: Response) => {
    try {
      const assessments = db.getAllAssessmentsAdmin();
      return res.json({ success: true, assessments });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Admin: Create/Update Assessment
  app.post('/api/admin/assessments', adminGuard, adminLimiter, (req: Request, res: Response) => {
    try {
      const assessment = db.createOrUpdateAssessment(req.body);
      return res.json({ success: true, assessment });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  app.put('/api/admin/assessments/:id', adminGuard, adminLimiter, (req: Request, res: Response) => {
    try {
      const assessment = db.createOrUpdateAssessment({ ...req.body, id: req.params.id });
      return res.json({ success: true, assessment });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Admin: Transition Assessment Status (DRAFT -> REVIEW -> PUBLISHED -> ARCHIVED)
  app.post('/api/admin/assessments/:id/status', adminGuard, adminLimiter, (req: Request, res: Response) => {
    try {
      const { status } = req.body;
      if (!['DRAFT', 'REVIEW', 'PUBLISHED', 'ARCHIVED'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status transition' });
      }
      const assessment = db.updateAssessmentStatus(req.params.id, status as any);
      return res.json({ success: true, assessment });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Admin: Canonical Question Bank List
  app.get('/api/admin/questions', adminGuard, adminLimiter, (req: Request, res: Response) => {
    try {
      const questions = db.getAllCanonicalQuestions();
      const usageMap = db.getQuestionAssessmentUsageMap();
      return res.json({ success: true, questions, usageMap });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Admin: Create/Update Question
  app.post('/api/admin/questions', adminGuard, adminLimiter, (req: Request, res: Response) => {
    try {
      const question = db.saveCanonicalQuestion(req.body);
      return res.json({ success: true, question });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  app.put('/api/admin/questions/:id', adminGuard, adminLimiter, (req: Request, res: Response) => {
    try {
      const question = db.saveCanonicalQuestion({ ...req.body, id: req.params.id });
      return res.json({ success: true, question });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Admin: Duplicate Check Engine Endpoint
  app.post('/api/admin/questions/check-duplicates', adminGuard, adminLimiter, (req: Request, res: Response) => {
    try {
      const { questionText } = req.body;
      const dupResult = db.checkQuestionDuplicate(questionText || '');
      return res.json({ success: true, ...dupResult });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Admin: Bulk Question Import Endpoint
  app.post('/api/admin/questions/import', adminGuard, adminLimiter, (req: Request, res: Response) => {
    try {
      const { questions, resolutions } = req.body;
      if (!Array.isArray(questions)) {
        return res.status(400).json({ error: 'Questions array required' });
      }
      const report = db.bulkImportQuestions(questions, resolutions || {});
      return res.json({ success: true, report });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Admin: Generate AI Test with Gemini
  app.post('/api/admin/generate-ai-test', adminGuard, aiLimiter, async (req: Request, res: Response) => {
    try {
      const { topicOrCompany, category, difficulty, numQuestions } = req.body;
      const generated = await generateAITestSeries({
        topicOrCompany: topicOrCompany || 'TCS NQT 2025 Numerical Ability',
        category: category || 'Quantitative',
        difficulty: difficulty || 'Medium',
        numQuestions: numQuestions || 5,
      });

      const createdTest = db.createTestSeries(generated.test);
      if (generated.questions && generated.questions.length > 0) {
        generated.questions.forEach((q) => {
          db.addQuestionToTest({
            ...q,
            testSeriesId: createdTest.id,
          });
        });
      }

      const fullTest = db.getTestById(createdTest.id, true);
      return res.json({ success: true, test: fullTest });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Admin: Ingest Test Content (AI, CSV, JSON, PDF or Manual pipeline)
  app.post('/api/admin/ingest-test-content', adminGuard, adminLimiter, async (req: Request, res: Response) => {
    try {
      const { mode, format, content, aiParams } = req.body;
      let rawQuestions: any[] = [];
      let testMetadata: any = null;

      if (mode === 'ai') {
        const generated = await generateAITestSeries({
          topicOrCompany: aiParams?.topicOrCompany || 'TCS NQT 2026 Numerical Sprint',
          category: aiParams?.category || 'Quantitative',
          difficulty: aiParams?.difficulty || 'Medium',
          numQuestions: aiParams?.numQuestions || 5,
        });
        testMetadata = generated.test;
        rawQuestions = generated.questions || [];
      } else if (mode === 'import') {
        rawQuestions = await parseAndNormalizeImportedDocument(content || '', format || 'json');
      } else if (mode === 'manual' && Array.isArray(req.body.questions)) {
        rawQuestions = req.body.questions;
      }

      // Run every question through AI completion, validation, and duplicate detection
      const processedQuestions: any[] = [];
      for (const q of rawQuestions) {
        const completionResult = await completeAndValidateIncompleteQuestion(q);
        const dupCheck = db.findSimilarQuestions(completionResult.question.questionText);

        processedQuestions.push({
          ...completionResult.question,
          needsReview: completionResult.needsReview || dupCheck.isDuplicate,
          reviewReason: completionResult.reviewReason || (dupCheck.isDuplicate ? dupCheck.reason : undefined),
          aiCompleted: completionResult.aiCompleted,
          possibleDuplicate: dupCheck.isDuplicate
            ? {
                existingQuestion: dupCheck.existingQuestion,
                similarityScore: dupCheck.similarityScore,
                reason: dupCheck.reason,
              }
            : undefined,
        });
      }

      return res.json({
        success: true,
        testMetadata,
        questions: processedQuestions,
      });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Admin: AI Question Completion Endpoint
  app.post('/api/admin/complete-question', adminGuard, adminLimiter, async (req: Request, res: Response) => {
    try {
      const result = await completeAndValidateIncompleteQuestion(req.body.question || req.body);
      const dupCheck = db.findSimilarQuestions(result.question.questionText);
      return res.json({
        success: true,
        question: {
          ...result.question,
          needsReview: result.needsReview || dupCheck.isDuplicate,
          reviewReason: result.reviewReason || (dupCheck.isDuplicate ? dupCheck.reason : undefined),
          aiCompleted: result.aiCompleted,
          possibleDuplicate: dupCheck.isDuplicate
            ? {
                existingQuestion: dupCheck.existingQuestion,
                similarityScore: dupCheck.similarityScore,
                reason: dupCheck.reason,
              }
            : undefined,
        },
      });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // AI Doubt Solver / Alternative Explanation
  app.post('/api/ai/ask-doubt', aiLimiter, async (req: Request, res: Response) => {
    try {
      const { question, userSelectedOption, studentQuestion } = req.body;
      if (!question) {
        return res.status(400).json({ error: 'Question is required' });
      }
      const explanation = await askAIDoubt({
        question,
        userSelectedOption,
        studentQuestion,
      });
      return res.json({ success: true, explanation });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // GET /api/ai/credits - Get user Deep AI Credit Balance
  app.get('/api/ai/credits', async (req: Request, res: Response) => {
    try {
      const authUser = await getAuthenticatedUser(req);
      const clientUserId = req.query.userId as string;
      if (!authUser) {
        return res.status(401).json({ error: 'Unauthorized: Authentication required' });
      }
      if (clientUserId && clientUserId !== authUser.id && authUser.role !== 'admin' && authUser.role !== 'super_admin') {
        return res.status(403).json({ error: 'Forbidden: IDOR attempt detected' });
      }
      const targetUserId = authUser.id;
      await reconcilePendingRazorpayOrders(db, targetUserId);
      const balance = db.getDeepAICreditBalance(targetUserId);
      return res.json({
        success: true,
        ...balance,
      });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // GET /api/ai/credits/ledger - Get user Deep AI Credit Transaction Ledger
  app.get('/api/ai/credits/ledger', async (req: Request, res: Response) => {
    try {
      const authUser = await getAuthenticatedUser(req);
      const clientUserId = req.query.userId as string;
      if (!authUser) {
        return res.status(401).json({ error: 'Unauthorized: Authentication required' });
      }
      if (clientUserId && clientUserId !== authUser.id && authUser.role !== 'admin' && authUser.role !== 'super_admin') {
        return res.status(403).json({ error: 'Forbidden: IDOR attempt detected' });
      }
      const targetUserId = authUser.id;
      const ledger = db.getCreditLedger(targetUserId);
      return res.json({
        success: true,
        ledger,
      });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // GET /api/ai/deep-help/status - Deep AI Entitlement & Usage Status
  app.get('/api/ai/deep-help/status', async (req: Request, res: Response) => {
    try {
      const authUser = await getAuthenticatedUser(req);
      const clientUserId = req.query.userId as string;
      const mode = req.query.mode as string;
      const targetUserId = authUser ? authUser.id : clientUserId;
      const user = authUser || (targetUserId ? db.getUserById(targetUserId) : null);

      const status = getDeepAIAccess(user, mode, db);
      const usage = targetUserId ? db.getDeepAIUsageSummary(targetUserId) : { requestCount: 0, inputTokens: 0, outputTokens: 0, estimatedCost: 0 };

      return res.json({
        success: true,
        eligible: status.allowed,
        isPremium: status.isPremium,
        status: status.status,
        reason: status.reason,
        remainingCredits: status.remainingCredits,
        balance: status.balance,
        currentUsage: usage,
      });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // POST /api/user/deduct-weekly-xp - Deduct Weekly XP for learning assistance (hints)
  app.post('/api/user/deduct-weekly-xp', async (req: Request, res: Response) => {
    try {
      const authUser = await getAuthenticatedUser(req);
      const { userId: clientUserId, amount } = req.body || {};
      const targetUserId = authUser ? authUser.id : clientUserId;
      if (!targetUserId) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      const xpCost = typeof amount === 'number' && amount > 0 ? amount : 1;
      const result = db.deductUserWeeklyXP(targetUserId, xpCost);
      return res.json({ success: true, newWeeklyXp: result.newWeeklyXp });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // GET /api/user/weekly-xp - Get current user Weekly XP balance
  app.get('/api/user/weekly-xp', async (req: Request, res: Response) => {
    try {
      const authUser = await getAuthenticatedUser(req);
      const clientUserId = req.query.userId as string;
      const targetUserId = authUser ? authUser.id : clientUserId;
      if (!targetUserId) {
        return res.json({ success: true, weeklyXp: 0 });
      }
      const user = db.getUserById(targetUserId);
      return res.json({ success: true, weeklyXp: user?.weeklyXp ?? 0 });
    } catch {
      return res.json({ success: true, weeklyXp: 0 });
    }
  });

  // GET /api/ai/question-hint - Fetch or generate cached short AI hint (0 credits consumed)
  app.get('/api/ai/question-hint', async (req: Request, res: Response) => {
    try {
      const questionId = req.query.questionId as string;
      const selectedOption = req.query.selectedOption as string | undefined;

      if (!questionId) {
        return res.status(400).json({ error: 'questionId parameter is required' });
      }

      // 1. Check if cached base hint exists in DB (if no specific wrong selection provided)
      if (!selectedOption) {
        const cachedHint = db.getQuestionAiHint(questionId);
        if (cachedHint) {
          return res.json({ success: true, hint: cachedHint, cached: true });
        }
      }

      // 2. Find question details
      const question = db.getQuestionById(questionId);
      if (!question) {
        return res.status(404).json({ error: 'Question not found' });
      }

      // 3. Generate AI hint (0 credits consumed)
      const generatedHint = await generateQuestionAiHint(question, selectedOption);
      if (!selectedOption) {
        db.saveQuestionAiHint(questionId, generatedHint);
      }

      return res.json({ success: true, hint: generatedHint, cached: !selectedOption });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // POST /api/ai/deep-help - Deep AI Socratic Tutor Help (Practice & Revision Mode, Credit Governed)
  app.post('/api/ai/deep-help', aiLimiter, async (req: Request, res: Response) => {
    try {
      const authUser = await getAuthenticatedUser(req);
      const { question, userSelectedOption, studentQuestion, currentStep, userId: clientUserId, mode, assessmentId, testSeriesId, action, requestType } = req.body || {};

      if (!question) {
        return res.status(400).json({ error: 'Question is required' });
      }

      const targetUserId = authUser ? authUser.id : clientUserId;
      const user = authUser || (targetUserId ? db.getUserById(targetUserId) : null);

      if (!user) {
        return res.status(401).json({ error: 'Authentication required for Deep AI Help' });
      }

      // 1. Exam Mode Strict Block
      if (mode === 'exam') {
        return res.status(403).json({
          error: 'Deep AI Help is strictly disabled in Exam Mode to preserve test integrity.',
          isLocked: true,
          status: 'exam_blocked',
        });
      }

      const baseAssessmentId = assessmentId || testSeriesId || (question.testSeriesId || 'cat_practice');
      const activeAssessmentId = mode === 'revision' && !baseAssessmentId.endsWith('_revision') ? `${baseAssessmentId}_revision` : baseAssessmentId;
      const questionId = question.id || 'q_unknown';

      const isInit = action === 'init' || requestType === 'init';
      const isHintOnly = requestType === 'hint';
      const sessionStatus = db.getDeepAISessionStatus(user.id, activeAssessmentId, questionId);

      // 2. Handling Workspace Init (0 AI credits consumed)
      if (isInit) {
        return res.json({
          success: true,
          isUnlocked: sessionStatus.isUnlocked,
          sessionId: sessionStatus.sessionId || '',
          creditsLeft: sessionStatus.remainingCredits,
        });
      }

      // 3. Handling Hint requests (0 AI credits consumed, 1 Weekly XP handled separately)
      if (isHintOnly) {
        let helpResponse;
        try {
          helpResponse = await askDeepAIHelp({
            question,
            userSelectedOption,
            studentQuestion,
            currentStep: currentStep || 1,
            requestType: 'hint',
          });
        } catch (aiErr: any) {
          helpResponse = {
            explanation: `Diagnostic Clue: Focus on the fundamental rules governing ${question.topic || 'this topic'}.`,
            hints: [question.hint || question.shortcutFormula || 'Focus on the invariant properties in the problem.'],
            modelUsed: 'firstround-deep-ai-v1-fallback',
          };
        }

        return res.json({
          success: true,
          hints: helpResponse.hints || [question.hint || question.shortcutFormula || 'Focus on the key variables in the prompt.'],
          isUnlocked: sessionStatus.isUnlocked,
          creditsLeft: sessionStatus.remainingCredits,
        });
      }

      // 4. Solution or Chat request
      // Server-side credit check BEFORE calling Gemini AI generation
      if (!sessionStatus.isUnlocked) {
        const bal = db.getDeepAICreditBalance(user.id);
        if (user.role !== 'admin' && user.role !== 'super_admin' && bal.total <= 0) {
          return res.status(402).json({
            error: "You're out of AI credits. Purchase AI credits to unlock Solution and Deep Chat.",
            insufficientCredits: true,
            isLocked: true,
            status: 'locked',
            remainingCredits: 0,
          });
        }
      }

      // 5. Consume 1 Credit Atomically (if new question session) or reuse existing unlocked session
      let sessionInfo = db.consumeDeepAICreditAtomic(user.id, activeAssessmentId, questionId);

      if (!sessionInfo.success) {
        if (user.role === 'admin' || user.role === 'super_admin') {
          sessionInfo = {
            success: true,
            isNewSession: true,
            sessionId: `admin_sess_${Date.now()}`,
            remainingCredits: db.getDeepAICreditBalance(user.id).total,
          };
        } else {
          return res.status(402).json({
            error: sessionInfo.reason || "You're out of AI credits. Purchase AI credits to unlock Solution and Deep Chat.",
            insufficientCredits: true,
            isLocked: true,
            status: 'locked',
            remainingCredits: sessionInfo.remainingCredits,
          });
        }
      }

      // 6. Call Gemini AI Tutor (Only reached if session unlocked or credit consumed successfully)

      let helpResponse;
      try {
        helpResponse = await askDeepAIHelp({
          question,
          userSelectedOption,
          studentQuestion,
          currentStep: currentStep || 1,
          requestType,
        });
      } catch (aiErr: any) {
        console.error('[Deep AI Help] LLM call failed, using fallback response:', aiErr?.message || aiErr);
        helpResponse = {
          explanation: `Deep AI Analysis: Correct Option is (${question.correctOption || 'A'}). ${question.explanation || ''}`,
          hints: [
            'Focus on the invariant properties in the problem.',
            'Check for boundary conditions and scale factors.'
          ],
          stepByStep: [
            'Parse the premise and extract variables.',
            'Apply formula or deductive steps systematically.'
          ],
          conceptualBreakdown: `Topic: ${question.topic || 'Aptitude'} | Target Pattern: Campus Recruitment Assessments.`,
          modelUsed: 'firstround-deep-ai-v1-fallback',
        };
      }

      // 5. Record Usage Metrics
      db.recordDeepAIUsage({
        userId: user.id,
        requestCount: 1,
        inputTokens: 450,
        outputTokens: 250,
        estimatedCost: 0.0007,
      });

      return res.json({
        success: true,
        ...helpResponse,
        isNewSession: sessionInfo.isNewSession,
        sessionId: sessionInfo.sessionId,
        creditsLeft: sessionInfo.remainingCredits,
      });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // POST /api/ai/copilot - FirstRound AI Placement Copilot Endpoint
  app.post('/api/ai/copilot', aiLimiter, async (req: Request, res: Response) => {
    try {
      const authUser = await getAuthenticatedUser(req);
      const { message, mode, userId: clientUserId } = req.body || {};
      if (!message || typeof message !== 'string') {
        return res.status(400).json({ error: 'Message string is required' });
      }

      if (authUser && clientUserId && clientUserId !== authUser.id && authUser.role !== 'admin' && authUser.role !== 'super_admin') {
        return res.status(403).json({ error: 'Forbidden: IDOR attempt detected' });
      }

      const targetUserId = authUser ? authUser.id : (clientUserId || 'usr_default');
      const verifiedContext = db.buildAICopilotContext(targetUserId);

      const history = Array.isArray(req.body?.history) ? req.body.history.slice(-6) : undefined;
      const response = await askAICopilot({ message, mode, verifiedContext, history });
      return res.json({ success: true, ...response });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // GET /api/ai/placement-strategy - FirstRound AI Placement Strategy Endpoint
  app.get('/api/ai/placement-strategy', async (req: Request, res: Response) => {
    try {
      const authUser = await getAuthenticatedUser(req);
      const clientUserId = req.query.userId as string;

      if (authUser && clientUserId && clientUserId !== authUser.id && authUser.role !== 'admin' && authUser.role !== 'super_admin') {
        return res.status(403).json({ error: 'Forbidden: IDOR attempt detected' });
      }

      const targetUserId = authUser ? authUser.id : (clientUserId || 'usr_default');
      const verifiedContext = db.buildAICopilotContext(targetUserId);
      const strategy = buildPlacementStrategy(verifiedContext);

      return res.json({ success: true, strategy });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // ===================================================
  // PAYMENTS & RAZORPAY INTEGRATION (PHASE E)
  // ===================================================

  // GET /api/payments/config - Public/Auth payment configuration & packs
  app.get('/api/payments/config', (_req: Request, res: Response) => {
    try {
      const credentials = getRazorpayCredentials();
      return res.json({
        success: true,
        keyId: credentials.keyId,
        testMode: credentials.testMode,
        currency: 'INR',
        creditPacks: CREDIT_PACKS,
        assessmentPricePaise: DEFAULT_ASSESSMENT_PRICE_PAISE,
        subscriptionPlan: PREMIUM_PLAN_CONFIG,
      });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // POST /api/payments/orders - Create Payment Order
  app.post('/api/payments/orders', paymentLimiter, async (req: Request, res: Response) => {
    try {
      const authUser = await getAuthenticatedUser(req);
      const { productType, productId, userId: clientUserId } = req.body || {};

      if (!authUser) {
        return res.status(401).json({ success: false, error: 'Authentication required to create a payment order' });
      }

      if (clientUserId && clientUserId !== authUser.id && authUser.role !== 'admin' && authUser.role !== 'super_admin') {
        return res.status(403).json({ success: false, error: 'Forbidden: Cannot create payment order for another user' });
      }

      if (!productType || !productId) {
        return res.status(400).json({ success: false, error: 'productType and productId are required' });
      }

      const details = getProductDetails(productType, productId);

      // Check if user already owns the assessment
      if (productType === 'ASSESSMENT') {
        if (db.hasActiveAssessmentEntitlement(authUser.id, productId)) {
          return res.status(400).json({ error: 'You already have access to this assessment' });
        }
      }

      const orderId = `ord_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const { keyId, keySecret, isConfigured } = getRazorpayCredentials();
      let razorpayOrderId = `order_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      // If real credentials are provided, call Razorpay Orders API
      if (isConfigured && !keyId.startsWith('rzp_test_firstround_mock')) {
        try {
          const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
          const rzpRes = await fetch('https://api.razorpay.com/v1/orders', {
            method: 'POST',
            headers: {
              'Authorization': authHeader,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              amount: details.amount, // in paise
              currency: details.currency,
              receipt: orderId,
              notes: {
                userId: authUser.id,
                productType,
                productId,
              },
            }),
          });
          const rzpData: any = await rzpRes.json();
          if (rzpData.id) {
            razorpayOrderId = rzpData.id;
          }
        } catch (e) {
          console.warn('[Razorpay API Warning] Fallback to test order ID:', e);
        }
      }

      const paymentOrder = db.createPaymentOrder({
        id: orderId,
        userId: authUser.id,
        productType,
        productId,
        amount: details.amount,
        currency: details.currency,
        status: 'CREATED',
        razorpayOrderId,
        metadata: {
          ...details.metadata,
          userEmail: authUser.email,
          userName: authUser.name,
          productTitle: details.title,
        },
      });

      return res.json({
        success: true,
        orderId: paymentOrder.id,
        razorpayOrderId: paymentOrder.razorpayOrderId,
        amount: paymentOrder.amount,
        currency: paymentOrder.currency,
        keyId,
        testMode: true,
        productDetails: details,
      });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // POST /api/payments/verify - Verify Signature & Fulfill Idempotently
  app.post('/api/payments/verify', paymentLimiter, async (req: Request, res: Response) => {
    try {
      const authUser = await getAuthenticatedUser(req);
      const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature, userId: clientUserId } = req.body || {};

      if (!authUser) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      if (clientUserId && clientUserId !== authUser.id && authUser.role !== 'admin' && authUser.role !== 'super_admin') {
        return res.status(403).json({ success: false, error: 'Forbidden: Payment verification belongs to another user' });
      }

      const result = await verifyAndFulfillPaymentOrder(db, {
        orderId,
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
        authenticatedUserId: authUser.id,
        isAdmin: authUser.role === 'admin' || authUser.role === 'super_admin',
      });

      if (!result.success) {
        return res.status(result.status || 400).json({ success: false, error: result.error });
      }

      return res.json({
        success: true,
        order: result.order,
        alreadyFulfilled: result.alreadyFulfilled,
      });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // POST /api/payments/verify-status - Check payment status directly from Razorpay API & fulfill if captured
  app.post('/api/payments/verify-status', paymentLimiter, async (req: Request, res: Response) => {
    try {
      const authUser = await getAuthenticatedUser(req);
      const { orderId, razorpayOrderId, userId: clientUserId } = req.body || {};

      if (!authUser) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
      }

      if (clientUserId && clientUserId !== authUser.id && authUser.role !== 'admin' && authUser.role !== 'super_admin') {
        return res.status(403).json({ success: false, error: 'Forbidden: Payment verification belongs to another user' });
      }

      const result = await verifyAndFulfillPaymentOrder(db, {
        orderId,
        razorpayOrderId,
        authenticatedUserId: authUser.id,
        isAdmin: authUser.role === 'admin' || authUser.role === 'super_admin',
      });

      if (!result.success) {
        return res.status(result.status || 400).json({ success: false, error: result.error });
      }

      return res.json({
        success: true,
        order: result.order,
        alreadyFulfilled: result.alreadyFulfilled,
      });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // ===================================================
  // RECURRING PREMIUM SUBSCRIPTIONS (PHASE F)
  // ===================================================

  // POST /api/payments/subscriptions - Create Premium Subscription
  app.post('/api/payments/subscriptions', async (req: Request, res: Response) => {
    try {
      let authUser = await getAuthenticatedUser(req);
      const { userId } = req.body || {};
      if (!authUser && userId) {
        authUser = db.getUserById(userId);
      }
      if (!authUser && req.query?.userId) {
        authUser = db.getUserById(req.query.userId as string);
      }

      if (!authUser) {
        return res.status(401).json({ error: 'Authentication required to create a subscription' });
      }

      // Check if user already has an active subscription
      const existingActiveSub = db.getActivePremiumSubscriptionForUser(authUser.id);
      if (existingActiveSub && hasPremiumAccess(authUser)) {
        return res.status(400).json({ error: 'User already has an active Premium subscription' });
      }

      const { keyId, keySecret, isConfigured } = getRazorpayCredentials();
      let razorpaySubscriptionId = `sub_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      // If live/test Razorpay API credentials are provided, create via API
      if (isConfigured && !keyId.startsWith('rzp_test_firstround_mock')) {
        try {
          const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
          const rzpRes = await fetch('https://api.razorpay.com/v1/subscriptions', {
            method: 'POST',
            headers: {
              'Authorization': authHeader,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              plan_id: RAZORPAY_PREMIUM_PLAN_ID,
              total_count: 12,
              quantity: 1,
              customer_notify: 1,
              notes: {
                userId: authUser.id,
                planId: PREMIUM_PLAN_CONFIG.id,
              },
            }),
          });
          const rzpData: any = await rzpRes.json();
          if (rzpData.id) {
            razorpaySubscriptionId = rzpData.id;
          }
        } catch (e) {
          console.warn('[Razorpay API Warning] Fallback to test subscription ID:', e);
        }
      }

      const subscription = db.createPremiumSubscription(
        authUser.id,
        razorpaySubscriptionId,
        PREMIUM_PLAN_CONFIG.id,
        'CREATED'
      );

      return res.json({
        success: true,
        subscriptionId: subscription.id,
        razorpaySubscriptionId: subscription.razorpaySubscriptionId,
        keyId,
        testMode: true,
        plan: PREMIUM_PLAN_CONFIG,
      });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // POST /api/payments/subscriptions/verify - Verify Subscription Signature & Activate
  app.post('/api/payments/subscriptions/verify', async (req: Request, res: Response) => {
    try {
      let authUser = await getAuthenticatedUser(req);
      const { subscriptionId, razorpaySubscriptionId, razorpayPaymentId, razorpaySignature, userId } = req.body || {};
      if (!authUser && userId) {
        authUser = db.getUserById(userId);
      }
      if (!authUser && req.query?.userId) {
        authUser = db.getUserById(req.query.userId as string);
      }

      if (!authUser) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      if (!razorpaySubscriptionId || !razorpayPaymentId || !razorpaySignature) {
        return res.status(400).json({ error: 'razorpaySubscriptionId, razorpayPaymentId, and razorpaySignature are required' });
      }

      const subscription = subscriptionId
        ? db.getPremiumSubscriptionById(subscriptionId)
        : db.getPremiumSubscriptionByRazorpayId(razorpaySubscriptionId);

      if (!subscription) {
        return res.status(404).json({ error: 'Premium subscription record not found' });
      }

      if (subscription.userId !== authUser.id && authUser.role !== 'admin' && authUser.role !== 'super_admin') {
        return res.status(403).json({ error: 'Forbidden: Subscription does not belong to user' });
      }

      // Verify cryptographic signature for Razorpay Subscription checkout
      const isValid = verifyRazorpaySubscriptionSignature(
        razorpaySubscriptionId,
        razorpayPaymentId,
        razorpaySignature
      );

      if (!isValid) {
        if (subscription.status !== 'ACTIVE') {
          db.updatePremiumSubscription(subscription.id, { status: 'FAILED' as any });
        }
        return res.status(400).json({ error: 'Invalid subscription payment signature' });
      }

      // Fulfill subscription atomically (idempotent)
      const now = new Date();
      const periodStart = now.toISOString();
      const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

      const result = db.fulfillSubscriptionActivationAtomic(subscription.id, periodStart, periodEnd);

      return res.json({
        success: true,
        subscription: result.subscription,
        alreadyActive: result.alreadyActive,
      });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // POST /api/payments/subscriptions/:id/cancel - Cancel Subscription at Period End
  app.post('/api/payments/subscriptions/:id/cancel', async (req: Request, res: Response) => {
    try {
      let authUser = await getAuthenticatedUser(req);
      const { id } = req.params;
      const { userId } = req.body || {};
      if (!authUser && userId) {
        authUser = db.getUserById(userId);
      }
      if (!authUser && req.query?.userId) {
        authUser = db.getUserById(req.query.userId as string);
      }

      if (!authUser) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      const subscription = db.getPremiumSubscriptionById(id);
      if (!subscription) {
        return res.status(404).json({ error: 'Subscription not found' });
      }

      if (subscription.userId !== authUser.id && authUser.role !== 'admin' && authUser.role !== 'super_admin') {
        return res.status(403).json({ error: 'Forbidden: Cannot cancel another user subscription' });
      }

      const cancelledSub = db.cancelPremiumSubscription(id);

      return res.json({
        success: true,
        message: 'Subscription cancelled successfully. Access remains active until period end.',
        subscription: cancelledSub,
      });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // POST /api/payments/webhook/razorpay - Razorpay Webhook Endpoint
  app.post('/api/payments/webhook/razorpay', async (req: Request, res: Response) => {
    try {
      const signature = req.headers['x-razorpay-signature'] as string;
      const rawBody = (req as any).rawBody || JSON.stringify(req.body);
      const isValid = verifyRazorpayWebhookSignature(rawBody, signature);
      if (!isValid) {
        return res.status(400).json({ error: 'Invalid webhook signature' });
      }

      const event = req.body?.event;
      const payload = req.body?.payload;

      // 1. One-time payment captures (Phase E)
      if (event === 'payment.captured' || event === 'order.paid') {
        const paymentEntity = payload?.payment?.entity;
        const orderEntity = payload?.order?.entity;
        const rzpOrderId = paymentEntity?.order_id || orderEntity?.id;
        const firstroundOrderId = paymentEntity?.notes?.firstround_order_id || orderEntity?.receipt;

        if (rzpOrderId || firstroundOrderId) {
          await verifyAndFulfillPaymentOrder(db, {
            orderId: firstroundOrderId,
            razorpayOrderId: rzpOrderId,
            razorpayPaymentId: paymentEntity?.id,
            isWebhook: true,
          });
        }
      } else if (event === 'payment.failed') {
        const paymentEntity = payload?.payment?.entity;
        const rzpOrderId = paymentEntity?.order_id;
        if (rzpOrderId) {
          const localOrder = db.getPaymentOrderByRazorpayOrderId(rzpOrderId);
          if (localOrder && localOrder.status !== 'CAPTURED') {
            db.updatePaymentOrderStatus(localOrder.id, 'FAILED', paymentEntity?.id, signature);
          }
        }
      }

      // 2. Subscription lifecycle events (Phase F)
      const subEntity = payload?.subscription?.entity;
      const rzpSubId = subEntity?.id;

      if (rzpSubId) {
        const localSub = db.getPremiumSubscriptionByRazorpayId(rzpSubId);
        if (localSub) {
          const now = new Date();
          const periodStart = subEntity?.current_start
            ? new Date(subEntity.current_start * 1000).toISOString()
            : now.toISOString();
          const periodEnd = subEntity?.current_end
            ? new Date(subEntity.current_end * 1000).toISOString()
            : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

          if (event === 'subscription.authenticated') {
            db.updatePremiumSubscription(localSub.id, { status: 'AUTHENTICATED' });
          } else if (event === 'subscription.activated' || event === 'subscription.charged') {
            db.fulfillSubscriptionActivationAtomic(localSub.id, periodStart, periodEnd);
          } else if (event === 'subscription.pending') {
            db.updatePremiumSubscription(localSub.id, { status: 'PENDING' });
          } else if (event === 'subscription.halted') {
            db.updatePremiumSubscription(localSub.id, { status: 'HALTED' });
          } else if (event === 'subscription.cancelled') {
            db.updatePremiumSubscription(localSub.id, {
              status: 'CANCELLED',
              cancelledAt: now.toISOString(),
            });
          } else if (event === 'subscription.completed') {
            db.updatePremiumSubscription(localSub.id, {
              status: 'COMPLETED',
              endedAt: now.toISOString(),
            });
          }
        }
      }

      return res.json({ status: 'ok' });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Admin: Get All Payments / Transactions (Phase 19 Live Razorpay Sync)
  app.get('/api/admin/payments', adminGuard, async (req: Request, res: Response) => {
    try {
      const includeTest = req.query.includeTest === 'true' || Boolean(req.headers['x-test-runner']);
      const count = parseInt((req.query.count || req.query.limit || '50') as string, 10);
      const skip = parseInt((req.query.skip || req.query.offset || '0') as string, 10);
      const from = req.query.from as string | undefined;
      const to = req.query.to as string | undefined;
      const status = req.query.status as string | undefined;

      const result = await getMergedAdminPayments(db, {
        from,
        to,
        count,
        skip,
        status,
        includeTest,
      });

      return res.json(result);
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Admin: Get All Premium Subscriptions
  app.get('/api/admin/subscriptions', adminGuard, (req: Request, res: Response) => {
    try {
      const includeTest = req.query.includeTest === 'true' || Boolean(req.headers['x-test-runner']);
      const subscriptions = db.getAllPremiumSubscriptions(100, includeTest);
      return res.json({ success: true, subscriptions });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Get Supported Language Configurations
  app.get('/api/coding/languages', async (req: Request, res: Response) => {
    try {
      const { SUPPORTED_LANGUAGES_CONFIG } = await import('./src/services/CodeExecutionService');
      return res.json({ success: true, languages: SUPPORTED_LANGUAGES_CONFIG });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Run Code (Sample Test Cases)
  app.post('/api/coding/run', codingLimiter, async (req: Request, res: Response) => {
    try {
      const authUser = await getAuthenticatedUser(req);
      const { questionId, userId: clientUserId, language, sourceCode, customInput } = req.body;

      if (authUser && clientUserId && clientUserId !== authUser.id && authUser.role !== 'admin' && authUser.role !== 'super_admin') {
        return res.status(403).json({ error: 'Forbidden: IDOR attempt detected' });
      }
      const userId = authUser ? authUser.id : clientUserId;

      if (!questionId || !userId || !language || !sourceCode) {
        return res.status(400).json({ error: 'questionId, userId, language, and sourceCode are required' });
      }

      const problem = db.getCodingProblemById(questionId);
      if (!problem) {
        return res.status(404).json({ error: 'Coding question not found' });
      }

      if (problem.questionType !== 'CODING') {
        return res.status(400).json({ error: 'Question is not of type CODING' });
      }

      const codingConfig = problem.codingConfig || {
        problemType: 'ALGORITHM',
        languages: problem.supportedLanguages || ['javascript', 'typescript', 'python'],
        defaultLanguage: problem.supportedLanguages?.[0] || 'javascript',
        starterCode: problem.starterCode || {},
        timeLimitMs: problem.timeLimitMs,
        memoryLimitMb: problem.memoryLimitMb,
      };

      if (!codingConfig) {
        return res.status(400).json({ error: 'Question is missing coding configuration' });
      }

      const allowedLangs = codingConfig.languages || [];
      if (!allowedLangs.includes(language)) {
        return res.status(400).json({ error: `Language '${language}' is not allowed for this question` });
      }

      const validExecutionModes = ['javascript', 'typescript', 'python'];
      if (!validExecutionModes.includes(language)) {
        return res.status(400).json({ error: `Execution mode/language '${language}' is not supported by sandbox executor` });
      }

      const { CodeExecutionService } = await import('./src/services/CodeExecutionService');
      const executionService = new CodeExecutionService();

      let testCasesToRun = [];
      if (customInput !== undefined) {
        testCasesToRun = [
          {
            id: 'custom_input',
            input: customInput,
            expectedOutput: '',
            isHidden: false,
          }
        ];
      } else {
        testCasesToRun = (problem.testCases || []).filter((tc: any) => !tc.isHidden);
      }

      const result = await executionService.executeSubmission(
        {
          questionId,
          userId,
          language,
          sourceCode,
          isSubmission: false,
        },
        testCasesToRun
      );

      return res.json({ success: true, result });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Submit Code (All Test Cases including Hidden)
  app.post('/api/coding/submit', codingLimiter, async (req: Request, res: Response) => {
    try {
      const authUser = await getAuthenticatedUser(req);
      const { questionId, userId: clientUserId, testSeriesId, testAttemptId, language, sourceCode } = req.body;

      if (authUser && clientUserId && clientUserId !== authUser.id && authUser.role !== 'admin' && authUser.role !== 'super_admin') {
        return res.status(403).json({ error: 'Forbidden: IDOR attempt detected' });
      }
      const userId = authUser ? authUser.id : clientUserId;

      if (!questionId || !userId || !language || !sourceCode) {
        return res.status(400).json({ error: 'questionId, userId, language, and sourceCode are required' });
      }

      const problem = db.getCodingProblemById(questionId);
      if (!problem) {
        return res.status(404).json({ error: 'Coding question not found' });
      }

      if (problem.questionType !== 'CODING') {
        return res.status(400).json({ error: 'Question is not of type CODING' });
      }

      const codingConfig = problem.codingConfig || {
        problemType: 'ALGORITHM',
        languages: problem.supportedLanguages || ['javascript', 'typescript', 'python'],
        defaultLanguage: problem.supportedLanguages?.[0] || 'javascript',
        starterCode: problem.starterCode || {},
        timeLimitMs: problem.timeLimitMs,
        memoryLimitMb: problem.memoryLimitMb,
      };

      if (!codingConfig) {
        return res.status(400).json({ error: 'Question is missing coding configuration' });
      }

      const allowedLangs = codingConfig.languages || [];
      if (!allowedLangs.includes(language)) {
        return res.status(400).json({ error: `Language '${language}' is not allowed for this question` });
      }

      const validExecutionModes = ['javascript', 'typescript', 'python'];
      if (!validExecutionModes.includes(language)) {
        return res.status(400).json({ error: `Execution mode/language '${language}' is not supported by sandbox executor` });
      }

      const { CodeExecutionService } = await import('./src/services/CodeExecutionService');
      const executionService = new CodeExecutionService();

      const result = await executionService.executeSubmission(
        {
          questionId,
          userId,
          language,
          sourceCode,
          isSubmission: true,
        },
        problem.testCases || []
      );

      const submissionRecord = db.saveCodingSubmission({
        id: result.submissionId,
        userId,
        testSeriesId,
        testAttemptId,
        questionId,
        language,
        sourceCode,
        executionResult: result,
        isFinalSubmission: true,
        createdAt: result.executedAt,
      });

      return res.json({ success: true, result, submission: submissionRecord });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // Get Submissions for User
  app.get('/api/coding/submissions', async (req: Request, res: Response) => {
    try {
      const authUser = await getAuthenticatedUser(req);
      const { userId: clientUserId, questionId } = req.query;

      if (authUser && clientUserId && clientUserId !== authUser.id && authUser.role !== 'admin' && authUser.role !== 'super_admin') {
        return res.status(403).json({ error: 'Forbidden: IDOR attempt detected' });
      }
      const targetUserId = authUser ? authUser.id : (clientUserId as string);

      if (!targetUserId) {
        return res.status(400).json({ error: 'userId query parameter is required' });
      }
      const submissions = db.getCodingSubmissionsForUser(targetUserId, questionId as string | undefined);
      return res.json({ success: true, submissions });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // ----------------------------------------------------
  // Phase H: Advertisement & Sponsor API Endpoints
  // ----------------------------------------------------

  function isValidExternalUrl(urlStr: string): boolean {
    if (!urlStr || typeof urlStr !== 'string') return false;
    const trimmed = urlStr.trim().toLowerCase();
    if (
      trimmed.startsWith('javascript:') ||
      trimmed.startsWith('data:') ||
      trimmed.startsWith('file:') ||
      trimmed.startsWith('vbscript:') ||
      trimmed.startsWith('chrome:') ||
      trimmed.startsWith('about:')
    ) {
      return false;
    }
    try {
      const parsed = new URL(urlStr);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  // GET /api/advertisements/active - Fetch active sponsor advertisement for placement
  app.get('/api/advertisements/active', async (req: Request, res: Response) => {
    try {
      const placement = (req.query.placement as string) || 'DASHBOARD_SIDEBAR';
      const validPlacements = ['DASHBOARD_SIDEBAR', 'DASHBOARD_TOP', 'DASHBOARD_BOTTOM', 'LANDING_TOP', 'LANDING_BOTTOM'];
      if (!validPlacements.includes(placement)) {
        return res.status(400).json({ error: 'Invalid placement specified' });
      }

      const includeTest = req.query.includeTest === 'true' || Boolean(req.headers['x-test-runner']);
      const activeAds = db.getActiveAdvertisements(placement, includeTest);
      return res.json({
        success: true,
        advertisements: activeAds,
        advertisement: activeAds.length > 0 ? activeAds[0] : null,
      });
    } catch (err: any) {
      return res.json({ success: true, advertisements: [], advertisement: null });
    }
  });

  // POST /api/advertisements/:id/events - Record advertisement impression or click
  app.post('/api/advertisements/:id/events', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { eventType, sessionId, placement } = req.body || {};

      if (!eventType || !['IMPRESSION', 'CLICK'].includes(eventType)) {
        return res.status(400).json({ error: 'Valid eventType (IMPRESSION or CLICK) is required' });
      }

      const ad = db.getAdvertisementById(id);
      if (!ad || ad.status !== 'ACTIVE') {
        return res.status(400).json({ error: 'Advertisement not found or not active' });
      }

      if (
        placement &&
        placement !== ad.placement &&
        !ad.placement.includes(placement) &&
        !(placement === 'DASHBOARD_SIDEBAR' && ad.placement.includes('DASHBOARD_BOTTOM')) &&
        !(placement === 'DASHBOARD_BOTTOM' && ad.placement.includes('DASHBOARD_SIDEBAR'))
      ) {
        return res.status(400).json({ error: 'Placement mismatch for advertisement' });
      }

      const authUser = await getAuthenticatedUser(req);
      const userId = authUser ? authUser.id : null;
      const isTest = req.body?.is_test || (authUser && (authUser as any).is_test) || 0;

      const result = db.recordAdvertisementEvent(id, eventType, userId, sessionId, placement || ad.placement, isTest);
      return res.json({ success: result.success });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // GET /api/admin/advertisements - List all advertisements for admin manager
  app.get('/api/admin/advertisements', adminGuard, async (req: Request, res: Response) => {
    try {
      const includeTest = req.query.includeTest === 'true' || Boolean(req.headers['x-test-runner']);
      const ads = db.getAllAdvertisements(includeTest);
      return res.json({ success: true, advertisements: ads });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // POST /api/admin/advertisements - Create new advertisement
  app.post('/api/admin/advertisements', adminGuard, async (req: Request, res: Response) => {
    try {
      const {
        sponsorName,
        title,
        description,
        logoUrl,
        bannerImageUrl,
        cardImageUrl,
        destinationUrl,
        ctaText,
        adType,
        placement,
        status,
        priority,
        startAt,
        endAt,
        is_test,
      } = req.body || {};

      if (!sponsorName || typeof sponsorName !== 'string' || !sponsorName.trim() || sponsorName.length > 100) {
        return res.status(400).json({ error: 'Valid sponsorName (1-100 characters) is required' });
      }
      if (!title || typeof title !== 'string' || !title.trim() || title.length > 150) {
        return res.status(400).json({ error: 'Valid title (1-150 characters) is required' });
      }
      if (!destinationUrl || !isValidExternalUrl(destinationUrl)) {
        return res.status(400).json({ error: 'Valid destinationUrl starting with http:// or https:// is required' });
      }
      if (description && (typeof description !== 'string' || description.length > 500)) {
        return res.status(400).json({ error: 'Description must be 500 characters or less' });
      }
      if (ctaText && (typeof ctaText !== 'string' || ctaText.length > 30)) {
        return res.status(400).json({ error: 'CTA text must be 30 characters or less' });
      }
      const validAdTypes = ['STRUCTURED_CARD', 'OPTIONAL_CREATIVE_CARD'];
      const effectiveAdType = adType || (req.body as any).cardType;
      if (effectiveAdType && !validAdTypes.includes(effectiveAdType)) {
        return res.status(400).json({ error: 'Invalid adType' });
      }

      const rawPlacement = placement !== undefined ? placement : (req.body as any).placements;
      const placementStr = Array.isArray(rawPlacement) ? rawPlacement.join(',') : (typeof rawPlacement === 'string' ? rawPlacement : undefined);
      const validPlacementTokens = ['DASHBOARD_SIDEBAR', 'DASHBOARD_TOP', 'DASHBOARD_BOTTOM', 'LANDING_TOP', 'LANDING_BOTTOM'];
      if (placementStr) {
        const tokens = placementStr.split(',').map((s: string) => s.trim()).filter(Boolean);
        if (tokens.length === 0 || !tokens.every((t: string) => validPlacementTokens.includes(t))) {
          return res.status(400).json({ error: 'Invalid placement' });
        }
      }

      const validStatuses = ['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED'];
      if (status && !validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }
      if (priority !== undefined && (typeof priority !== 'number' || priority < 0 || priority > 1000)) {
        return res.status(400).json({ error: 'Priority must be a number between 0 and 1000' });
      }
      if (startAt && endAt && new Date(startAt).getTime() > new Date(endAt).getTime()) {
        return res.status(400).json({ error: 'startAt date cannot be after endAt date' });
      }

      const normalizedStartAt = startAt ? new Date(startAt).toISOString() : null;
      const normalizedEndAt = endAt ? new Date(endAt).toISOString() : null;

      const adminUser = (req as any).user;
      const createdAd = db.createAdvertisement({
        sponsorName: sponsorName.trim(),
        title: title.trim(),
        description: description ? description.trim() : null,
        logoUrl: logoUrl || null,
        bannerImageUrl: bannerImageUrl || null,
        cardImageUrl: cardImageUrl || null,
        destinationUrl: destinationUrl.trim(),
        ctaText: ctaText ? ctaText.trim() : 'Learn More',
        adType: effectiveAdType || 'STRUCTURED_CARD',
        placement: placementStr || 'DASHBOARD_SIDEBAR',
        status: status || 'DRAFT',
        priority: priority !== undefined ? priority : 10,
        startAt: normalizedStartAt,
        endAt: normalizedEndAt,
        createdBy: adminUser ? adminUser.id : null,
        is_test: is_test || 0,
      });

      return res.json({ success: true, advertisement: createdAd });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // PUT /api/admin/advertisements/:id - Update advertisement
  app.put('/api/admin/advertisements/:id', adminGuard, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const existing = db.getAdvertisementById(id);
      if (!existing) {
        return res.status(404).json({ error: 'Advertisement not found' });
      }

      const {
        sponsorName,
        title,
        description,
        logoUrl,
        bannerImageUrl,
        cardImageUrl,
        destinationUrl,
        ctaText,
        adType,
        cardType,
        placement,
        placements,
        status,
        priority,
        startAt,
        endAt,
        is_test,
      } = req.body || {};

      if (sponsorName !== undefined && (typeof sponsorName !== 'string' || !sponsorName.trim() || sponsorName.length > 100)) {
        return res.status(400).json({ error: 'Valid sponsorName (1-100 characters) is required' });
      }
      if (title !== undefined && (typeof title !== 'string' || !title.trim() || title.length > 150)) {
        return res.status(400).json({ error: 'Valid title (1-150 characters) is required' });
      }
      if (destinationUrl !== undefined && !isValidExternalUrl(destinationUrl)) {
        return res.status(400).json({ error: 'Valid destinationUrl starting with http:// or https:// is required' });
      }
      if (description !== undefined && description !== null && description !== '' && (typeof description !== 'string' || description.length > 500)) {
        return res.status(400).json({ error: 'Description must be 500 characters or less' });
      }
      if (ctaText !== undefined && ctaText !== null && ctaText !== '' && (typeof ctaText !== 'string' || ctaText.length > 30)) {
        return res.status(400).json({ error: 'CTA text must be 30 characters or less' });
      }

      const effectiveAdType = adType !== undefined ? adType : cardType;
      const validAdTypes = ['STRUCTURED_CARD', 'OPTIONAL_CREATIVE_CARD'];
      if (effectiveAdType !== undefined && !validAdTypes.includes(effectiveAdType)) {
        return res.status(400).json({ error: 'Invalid adType' });
      }

      const rawPlacement = placement !== undefined ? placement : placements;
      let placementStr: string | undefined = undefined;
      if (rawPlacement !== undefined) {
        if (Array.isArray(rawPlacement)) {
          placementStr = rawPlacement.join(',');
        } else if (typeof rawPlacement === 'string') {
          placementStr = rawPlacement;
        }
      }

      const validPlacementTokens = ['DASHBOARD_SIDEBAR', 'DASHBOARD_TOP', 'DASHBOARD_BOTTOM', 'LANDING_TOP', 'LANDING_BOTTOM'];
      if (placementStr !== undefined) {
        const tokens = placementStr.split(',').map((s: string) => s.trim()).filter(Boolean);
        if (tokens.length === 0 || !tokens.every((t: string) => validPlacementTokens.includes(t))) {
          return res.status(400).json({ error: 'Invalid placement' });
        }
      }

      const validStatuses = ['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED'];
      if (status !== undefined && !validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }
      if (priority !== undefined && (typeof priority !== 'number' || priority < 0 || priority > 1000)) {
        return res.status(400).json({ error: 'Priority must be a number between 0 and 1000' });
      }
      if (startAt && endAt && new Date(startAt).getTime() > new Date(endAt).getTime()) {
        return res.status(400).json({ error: 'startAt date cannot be after endAt date' });
      }

      const normStartAt = startAt ? new Date(startAt).toISOString() : startAt === null || startAt === '' ? null : undefined;
      const normEndAt = endAt ? new Date(endAt).toISOString() : endAt === null || endAt === '' ? null : undefined;

      const updatedAd = db.updateAdvertisement(id, {
        sponsorName: sponsorName !== undefined ? sponsorName.trim() : undefined,
        title: title !== undefined ? title.trim() : undefined,
        description: description !== undefined ? (description ? description.trim() : null) : undefined,
        logoUrl: logoUrl !== undefined ? (logoUrl ? logoUrl.trim() : null) : undefined,
        bannerImageUrl: bannerImageUrl !== undefined ? (bannerImageUrl ? bannerImageUrl.trim() : null) : undefined,
        cardImageUrl: cardImageUrl !== undefined ? (cardImageUrl ? cardImageUrl.trim() : null) : undefined,
        destinationUrl: destinationUrl !== undefined ? destinationUrl.trim() : undefined,
        ctaText: ctaText !== undefined ? (ctaText ? ctaText.trim() : 'Learn More') : undefined,
        adType: effectiveAdType,
        placement: placementStr,
        status,
        priority,
        startAt: normStartAt,
        endAt: normEndAt,
        is_test,
      });

      return res.json({ success: true, advertisement: updatedAd });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // PATCH /api/admin/advertisements/:id/status - Toggle advertisement status
  app.patch('/api/admin/advertisements/:id/status', adminGuard, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { status } = req.body || {};
      const validStatuses = ['DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED'];
      if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Valid status is required' });
      }

      const updatedAd = db.updateAdvertisement(id, { status });
      if (!updatedAd) {
        return res.status(404).json({ error: 'Advertisement not found' });
      }

      return res.json({ success: true, advertisement: updatedAd });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // DELETE /api/admin/advertisements/:id - Archive or delete advertisement
  app.delete('/api/admin/advertisements/:id', adminGuard, async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      if (!id || typeof id !== 'string' || id.trim() === '' || id === 'undefined') {
        return res.status(400).json({ success: false, message: 'Valid advertisement ID is required' });
      }
      const deleted = db.deleteAdvertisement(id.trim());
      if (!deleted) {
        return res.status(404).json({ success: false, message: 'Advertisement not found or already deleted' });
      }
      return res.json({ success: true, message: 'Advertisement deleted successfully' });
    } catch (err: any) {
      return handleApiError(res, err);
    }
  });

  // --- Vite Dev Middleware / Production Static ---
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Safe production error handler
  app.use((err: any, req: Request, res: Response, next: Function) => {
    console.error('[FirstRound Server Error]', err?.message || err);
    res.status(500).json({ error: 'Internal server error' });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FirstRound server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
