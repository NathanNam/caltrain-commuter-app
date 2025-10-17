import { NextRequest, NextResponse } from 'next/server';

// Simple logging for middleware (Edge Runtime compatible)
function logSecurityEvent(level: 'INFO' | 'WARN' | 'ERROR', message: string, data?: any) {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    data,
    source: 'middleware'
  };

  // In production, you would send this to your logging service
  console.log(JSON.stringify(logEntry));
}

// Rate limiting store (in production, use Redis or similar)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

// Security configuration
const BLOCKED_PATHS = [
  '.env',
  '.env.local',
  '.env.production',
  '.env.development',
  'config.json',
  'package.json',
  'package-lock.json',
  'yarn.lock',
  'tsconfig.json',
  'next.config.js',
  '.git',
  '.gitignore',
  'node_modules',
  'Dockerfile',
  'docker-compose.yml',
  '.dockerignore',
  'README.md',
  '.next',
  'logs',
  'tmp',
  'temp',
];

const LEGACY_ENDPOINTS = [
  '/Core/Skin/Login.aspx',
  '/admin',
  '/administrator',
  '/wp-admin',
  '/wp-login.php',
  '/phpmyadmin',
  '/mysql',
  '/database',
  '/config.php',
  '/setup.php',
  '/install.php',
  '/xmlrpc.php',
  '/wp-config.php',
  '/.well-known/security.txt',
  '/robots.txt',
  '/sitemap.xml',
  '/crossdomain.xml',
  '/clientaccesspolicy.xml',
];

const SUSPICIOUS_PATTERNS = [
  /\.(php|asp|aspx|jsp|cgi)$/i,
  /\/(admin|administrator|wp-admin|phpmyadmin)/i,
  /\.(sql|db|backup|bak|old)$/i,
  /\/(config|setup|install|test)/i,
  /\.(log|txt|xml)$/i,
];

// Rate limiting configuration
const RATE_LIMIT_CONFIG = {
  windowMs: 60000, // 1 minute
  maxRequests: 100, // Max requests per window
  suspiciousMaxRequests: 10, // Max requests for suspicious endpoints
};

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const userAgent = request.headers.get('user-agent') || '';
  const clientIP = getClientIP(request);
  const fullPath = pathname + search;

  // Apply rate limiting
  const rateLimitResult = checkRateLimit(clientIP, pathname);
  if (rateLimitResult.blocked) {
    logSecurityEvent('WARN', 'Rate limit exceeded', {
      path: pathname,
      ip: clientIP.substring(0, 8) + '...',
      user_agent: userAgent.substring(0, 100),
      reason: rateLimitResult.reason,
    });

    return new NextResponse('Too Many Requests', { 
      status: 429,
      headers: {
        'Retry-After': '60',
        'X-RateLimit-Limit': rateLimitResult.limit.toString(),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': rateLimitResult.resetTime.toString(),
      }
    });
  }

  // Block access to sensitive files
  if (isBlockedPath(pathname)) {
    logSecurityEvent('WARN', 'Blocked access to sensitive file', {
      path: pathname,
      ip: clientIP.substring(0, 8) + '...',
      user_agent: userAgent.substring(0, 100),
    });

    return new NextResponse('Forbidden', { status: 403 });
  }

  // Handle legacy endpoint probes
  if (isLegacyEndpoint(pathname)) {
    logSecurityEvent('INFO', 'Legacy endpoint probe detected', {
      path: pathname,
      ip: clientIP.substring(0, 8) + '...',
      user_agent: userAgent.substring(0, 100),
    });

    return new NextResponse('Not Found', { status: 404 });
  }

  // Detect suspicious patterns
  if (isSuspiciousRequest(pathname, userAgent)) {
    logSecurityEvent('WARN', 'Suspicious request pattern detected', {
      path: pathname,
      ip: clientIP.substring(0, 8) + '...',
      user_agent: userAgent.substring(0, 100),
    });

    return new NextResponse('Forbidden', { status: 403 });
  }

  // Handle missing static assets gracefully
  if (isMissingStaticAsset(pathname)) {
    logSecurityEvent('INFO', 'Missing static asset requested', {
      path: pathname,
      asset_type: getAssetType(pathname),
      ip: clientIP.substring(0, 8) + '...',
    });

    // Return appropriate fallback for different asset types
    return handleMissingAsset(pathname);
  }

  // Add security headers to all responses
  const response = NextResponse.next();
  addSecurityHeaders(response);

  return response;
}

// Rate limiting implementation
function checkRateLimit(clientIP: string, pathname: string): {
  blocked: boolean;
  reason?: string;
  limit: number;
  resetTime: number;
} {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_CONFIG.windowMs;
  
  // Determine if this is a suspicious endpoint
  const isSuspicious = SUSPICIOUS_PATTERNS.some(pattern => pattern.test(pathname)) ||
                      LEGACY_ENDPOINTS.includes(pathname);
  
  const limit = isSuspicious ? 
    RATE_LIMIT_CONFIG.suspiciousMaxRequests : 
    RATE_LIMIT_CONFIG.maxRequests;

  const key = `${clientIP}:${isSuspicious ? 'suspicious' : 'normal'}`;
  const entry = rateLimitStore.get(key);

  if (!entry || entry.resetTime < now) {
    // Create new window
    rateLimitStore.set(key, {
      count: 1,
      resetTime: now + RATE_LIMIT_CONFIG.windowMs,
    });
    return { blocked: false, limit, resetTime: now + RATE_LIMIT_CONFIG.windowMs };
  }

  entry.count++;
  
  if (entry.count > limit) {
    return { 
      blocked: true, 
      reason: isSuspicious ? 'suspicious_endpoint' : 'normal_endpoint',
      limit,
      resetTime: entry.resetTime
    };
  }

  return { blocked: false, limit, resetTime: entry.resetTime };
}

// Check if path should be blocked
function isBlockedPath(pathname: string): boolean {
  const normalizedPath = pathname.toLowerCase().replace(/^\/+/, '');
  
  return BLOCKED_PATHS.some(blockedPath => {
    return normalizedPath === blockedPath || 
           normalizedPath.startsWith(blockedPath + '/') ||
           normalizedPath.includes('/' + blockedPath + '/') ||
           normalizedPath.endsWith('/' + blockedPath);
  });
}

// Check if this is a legacy endpoint probe
function isLegacyEndpoint(pathname: string): boolean {
  return LEGACY_ENDPOINTS.includes(pathname);
}

// Check for suspicious request patterns
function isSuspiciousRequest(pathname: string, userAgent: string): boolean {
  // Check for suspicious patterns in path
  if (SUSPICIOUS_PATTERNS.some(pattern => pattern.test(pathname))) {
    return true;
  }

  // Check for suspicious user agents
  const suspiciousUserAgents = [
    'sqlmap',
    'nikto',
    'nmap',
    'masscan',
    'zap',
    'burp',
    'scanner',
    'bot',
    'crawler',
    'spider',
  ];

  const lowerUserAgent = userAgent.toLowerCase();
  return suspiciousUserAgents.some(suspicious => lowerUserAgent.includes(suspicious));
}

// Check if this is a missing static asset
function isMissingStaticAsset(pathname: string): boolean {
  // Only handle common static asset extensions
  const staticExtensions = ['.ico', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.css', '.js', '.woff', '.woff2', '.ttf', '.eot'];
  return staticExtensions.some(ext => pathname.endsWith(ext)) && pathname.startsWith('/');
}

// Get asset type for metrics
function getAssetType(pathname: string): string {
  if (pathname.endsWith('.ico')) return 'icon';
  if (pathname.match(/\.(png|jpg|jpeg|gif|svg)$/)) return 'image';
  if (pathname.endsWith('.css')) return 'stylesheet';
  if (pathname.endsWith('.js')) return 'script';
  if (pathname.match(/\.(woff|woff2|ttf|eot)$/)) return 'font';
  return 'unknown';
}

// Handle missing assets with appropriate fallbacks
function handleMissingAsset(pathname: string): NextResponse {
  if (pathname.endsWith('.ico')) {
    // Return a simple 1x1 transparent PNG for missing favicons
    const transparentPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64'
    );
    
    return new NextResponse(transparentPng, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400', // Cache for 1 day
      },
    });
  }

  if (pathname.match(/\.(png|jpg|jpeg|gif|svg)$/)) {
    // Return a simple 1x1 transparent PNG for missing images
    const transparentPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64'
    );
    
    return new NextResponse(transparentPng, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    });
  }

  if (pathname.endsWith('.css')) {
    // Return empty CSS for missing stylesheets
    return new NextResponse('/* Missing stylesheet */', {
      status: 200,
      headers: {
        'Content-Type': 'text/css',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }

  if (pathname.endsWith('.js')) {
    // Return empty JS for missing scripts
    return new NextResponse('// Missing script', {
      status: 200,
      headers: {
        'Content-Type': 'application/javascript',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }

  // For other assets, return 404
  return new NextResponse('Not Found', { status: 404 });
}

// Add security headers
function addSecurityHeaders(response: NextResponse): void {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  
  // Content Security Policy
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Next.js requires unsafe-inline and unsafe-eval
    "style-src 'self' 'unsafe-inline'", // Tailwind requires unsafe-inline
    "img-src 'self' data: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://api.openweathermap.org https://api.511.org https://app.ticketmaster.com https://stats.nba.com https://statsapi.mlb.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  
  response.headers.set('Content-Security-Policy', csp);
}

// Get client IP address
function getClientIP(request: NextRequest): string {
  // Check various headers for the real IP
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }

  const realIP = request.headers.get('x-real-ip');
  if (realIP) {
    return realIP;
  }

  const cfConnectingIP = request.headers.get('cf-connecting-ip');
  if (cfConnectingIP) {
    return cfConnectingIP;
  }

  // Fallback to a default IP
  return '127.0.0.1';
}

// Configure which paths the middleware should run on
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
