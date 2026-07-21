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

const nextConfig: NextConfig = {
  serverExternalPackages: ['firebase-admin'],
  outputFileTracingIncludes: {
    '/**/*': FIREBASE_ADMIN_TRACE_INCLUDES,
  },
};

export default nextConfig;
