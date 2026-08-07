import type { NextConfig } from "next";

// firebase-admin (via getAdminAuth/getAdminFirestore/getAdminStorage in
// src/lib/firebase/admin.ts) is used by nearly every server-rendered route and
// API route in the app. Its transitive deps (@grpc/grpc-js, google-gax,
// protobufjs, etc.) do dynamic requires that Vercel's output-file-tracing can
// miss even when the package itself is correctly marked external, causing a
// runtime "Failed to load external module firebase-admin" on routes the
// tracer under-scans. Force-including these directories for every route
// closes that gap regardless of which route is hit first.
const FIREBASE_ADMIN_TRACE_INCLUDES = [
  './node_modules/firebase-admin/**/*',
  './node_modules/@grpc/**/*',
  './node_modules/google-gax/**/*',
  './node_modules/google-auth-library/**/*',
  './node_modules/protobufjs/**/*',
  './node_modules/farmhash-modern/**/*',
  './node_modules/jsonwebtoken/**/*',
  './node_modules/jwks-rsa/**/*',
  './node_modules/@google-cloud/firestore/**/*',
  './node_modules/@google-cloud/storage/**/*',
  './node_modules/gcp-metadata/**/*',
  './node_modules/gaxios/**/*',
  './node_modules/gtoken/**/*',
  './node_modules/jwa/**/*',
  './node_modules/jws/**/*',
]

// Report-only for now, deliberately — this is the first CSP this app has
// ever shipped, and an enforcing policy guessed blind risks silently
// breaking Recharts (inline styles for chart elements), the Firebase Auth
// client SDK's XHR calls, or next/font's self-hosted font loading. This
// policy is scoped to what those three actually need, based on reading
// their integration points in this codebase, but "report-only for one
// deployment cycle, then tighten based on real violation reports" is the
// safer sequence — see docs/tech-debt.md for the enforcing-CSP follow-up.
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ')

const SECURITY_HEADERS = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  { key: 'X-Frame-Options', value: 'DENY' }, // legacy fallback for the frame-ancestors directive above, for clients that don't parse CSP
  { key: 'Content-Security-Policy-Report-Only', value: CSP_REPORT_ONLY },
]

const nextConfig: NextConfig = {
  serverExternalPackages: ['firebase-admin'],
  outputFileTracingIncludes: {
    '/**/*': FIREBASE_ADMIN_TRACE_INCLUDES,
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: SECURITY_HEADERS,
      },
    ]
  },
};

export default nextConfig;
