// Response compression utilities for API routes
// Provides gzip/brotli compression for JSON responses

import { NextResponse } from 'next/server';
import { gzipSync, brotliCompressSync } from 'zlib';

/**
 * Compress response data based on Accept-Encoding header
 */
export function compressResponse(
  data: any,
  acceptEncoding?: string,
  options: {
    headers?: Record<string, string>;
    status?: number;
    minSize?: number; // Minimum size in bytes to compress
  } = {}
): NextResponse {
  const { headers = {}, status = 200, minSize = 1024 } = options;
  
  // Serialize the data
  const jsonString = JSON.stringify(data);
  const originalSize = Buffer.byteLength(jsonString, 'utf8');
  
  // Don't compress small responses
  if (originalSize < minSize) {
    return NextResponse.json(data, {
      status,
      headers: {
        ...headers,
        'Content-Length': originalSize.toString()
      }
    });
  }
  
  // Parse Accept-Encoding header
  const encodings = parseAcceptEncoding(acceptEncoding || '');
  
  // Try brotli first (better compression), then gzip
  if (encodings.includes('br')) {
    try {
      const compressed = brotliCompressSync(Buffer.from(jsonString, 'utf8'));
      const compressionRatio = (1 - compressed.length / originalSize) * 100;
      
      console.log(`Brotli compression: ${originalSize} -> ${compressed.length} bytes (${compressionRatio.toFixed(1)}% reduction)`);
      
      return new NextResponse(compressed as BodyInit, {
        status,
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          'Content-Encoding': 'br',
          'Content-Length': compressed.length.toString(),
          'Vary': 'Accept-Encoding'
        }
      });
    } catch (error) {
      console.error('Brotli compression failed:', error);
    }
  }
  
  if (encodings.includes('gzip')) {
    try {
      const compressed = gzipSync(Buffer.from(jsonString, 'utf8'));
      const compressionRatio = (1 - compressed.length / originalSize) * 100;
      
      console.log(`Gzip compression: ${originalSize} -> ${compressed.length} bytes (${compressionRatio.toFixed(1)}% reduction)`);
      
      return new NextResponse(compressed as BodyInit, {
        status,
        headers: {
          ...headers,
          'Content-Type': 'application/json',
          'Content-Encoding': 'gzip',
          'Content-Length': compressed.length.toString(),
          'Vary': 'Accept-Encoding'
        }
      });
    } catch (error) {
      console.error('Gzip compression failed:', error);
    }
  }
  
  // Fallback to uncompressed response
  return NextResponse.json(data, {
    status,
    headers: {
      ...headers,
      'Content-Length': originalSize.toString()
    }
  });
}

/**
 * Parse Accept-Encoding header and return supported encodings
 */
function parseAcceptEncoding(acceptEncoding: string): string[] {
  if (!acceptEncoding) return [];
  
  const encodings: string[] = [];
  const parts = acceptEncoding.toLowerCase().split(',');
  
  for (const part of parts) {
    const [encoding, qValue] = part.trim().split(';q=');
    const quality = qValue ? parseFloat(qValue) : 1.0;
    
    // Only include encodings with quality > 0
    if (quality > 0) {
      const cleanEncoding = encoding.trim();
      if (cleanEncoding === 'br' || cleanEncoding === 'brotli') {
        encodings.push('br');
      } else if (cleanEncoding === 'gzip') {
        encodings.push('gzip');
      }
    }
  }
  
  return encodings;
}

/**
 * Middleware wrapper for API routes to automatically compress responses
 */
export function withCompression<T extends any[]>(
  handler: (...args: T) => Promise<NextResponse>,
  options: {
    minSize?: number;
    skipCompression?: (request: Request) => boolean;
  } = {}
) {
  return async (...args: T): Promise<NextResponse> => {
    const request = args[0] as Request;
    const { minSize = 1024, skipCompression } = options;
    
    // Skip compression if specified
    if (skipCompression && skipCompression(request)) {
      return handler(...args);
    }
    
    // Get the original response
    const response = await handler(...args);
    
    // Only compress JSON responses
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      return response;
    }
    
    // Get Accept-Encoding header
    const acceptEncoding = request.headers.get('accept-encoding');
    
    try {
      // Extract the JSON data from the response
      const data = await response.json();
      
      // Get existing headers
      const existingHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        if (key.toLowerCase() !== 'content-length' && key.toLowerCase() !== 'content-encoding') {
          existingHeaders[key] = value;
        }
      });
      
      // Return compressed response
      return compressResponse(data, acceptEncoding || undefined, {
        headers: existingHeaders,
        status: response.status,
        minSize
      });
    } catch (error) {
      console.error('Compression middleware error:', error);
      return response; // Return original response on error
    }
  };
}

/**
 * Check if compression is beneficial for the given data size
 */
export function shouldCompress(size: number, minSize = 1024): boolean {
  return size >= minSize;
}

/**
 * Get compression statistics
 */
export function getCompressionStats(original: Buffer, compressed: Buffer) {
  const originalSize = original.length;
  const compressedSize = compressed.length;
  const ratio = (1 - compressedSize / originalSize) * 100;
  
  return {
    originalSize,
    compressedSize,
    ratio: Math.round(ratio * 100) / 100,
    savings: originalSize - compressedSize
  };
}

/**
 * Utility to add compression headers to existing NextResponse
 */
export function addCompressionHeaders(
  response: NextResponse,
  encoding: 'gzip' | 'br',
  originalSize: number,
  compressedSize: number
): NextResponse {
  response.headers.set('Content-Encoding', encoding);
  response.headers.set('Content-Length', compressedSize.toString());
  response.headers.set('Vary', 'Accept-Encoding');
  
  // Add compression ratio as a custom header for debugging
  const ratio = (1 - compressedSize / originalSize) * 100;
  response.headers.set('X-Compression-Ratio', `${ratio.toFixed(1)}%`);
  
  return response;
}
