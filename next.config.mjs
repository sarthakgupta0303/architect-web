/** @type {import('next').NextConfig} */
// Supports hosted (https) and local Supabase CLI (http://127.0.0.1:54321) projects.
const supabase = (() => {
  try {
    const u = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '')
    return { http: `${u.protocol}//${u.host}`, ws: `${u.protocol === 'https:' ? 'wss:' : 'ws:'}//${u.host}` }
  } catch { return null }
})()

const cspParts = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  `img-src 'self' data: blob: https://avatars.githubusercontent.com https://lh3.googleusercontent.com ${supabase ? supabase.http : ''}`,
  "font-src 'self' data: https://cdn.jsdelivr.net",
  `connect-src 'self' ${supabase ? `${supabase.http} ${supabase.ws}` : ''} https://cdn.jsdelivr.net`,
  "worker-src 'self' blob:",
  "frame-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
]
const csp = [...cspParts, "frame-ancestors 'none'"].join('; ')
const previewCsp = [...cspParts, "frame-ancestors 'self'"].join('; ')

const common = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
]

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/((?!preview/).*)',
        headers: [...common, { key: 'Content-Security-Policy', value: csp }, { key: 'X-Frame-Options', value: 'DENY' }],
      },
      {
        source: '/preview/:path*',
        headers: [...common, { key: 'Content-Security-Policy', value: previewCsp }, { key: 'X-Frame-Options', value: 'SAMEORIGIN' }],
      },
    ]
  },
}

export default nextConfig
