# src/backend/core/security.py
"""
SECURITY MIDDLEWARE FOR RATE LIMITING AND SECURITY HEADERS
"""

import time
import threading
from collections import defaultdict
from datetime import datetime, timedelta
from fastapi import Request, HTTPException

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
import logging
import re

logger = logging.getLogger(__name__)

class SecurityMiddleware(BaseHTTPMiddleware):
    """
    Security middleware for the application.
    Adds security headers and logs security events.
    """
    
    async def dispatch(self, request: Request, call_next):
        # Get client IP
        client_ip = request.client.host if request.client else "unknown"
        
        # Log request (excluding sensitive endpoints)
        if not any(path in request.url.path for path in ["/health", "/static"]):
            logger.info(f"Request: {request.method} {request.url.path} from {client_ip}")
        
        # Check for suspicious patterns
        if self.is_suspicious_request(request):
            self.log_security_event("suspicious_request", {
                "ip": client_ip,
                "path": request.url.path,
                "method": request.method,
                "user_agent": request.headers.get("user-agent")
            })
        
        # Process request
        response = await call_next(request)
        
        # Add security headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Content-Security-Policy"] = "default-src 'self' 'unsafe-inline' http://127.0.0.1:8000 http://127.0.0.1:8001; style-src 'self' 'unsafe-inline' data:; font-src 'self' data:; img-src 'self' data: blob: http://127.0.0.1:8000 http://127.0.0.1:8001; connect-src 'self' http://127.0.0.1:8000 http://127.0.0.1:8001; script-src 'self' 'unsafe-inline' 'unsafe-eval';"
        
        # Log security events for failed requests
        if response.status_code >= 400 and response.status_code != 404:
            self.log_security_event("request_error", {
                "ip": client_ip,
                "path": request.url.path,
                "method": request.method,
                "status_code": response.status_code
            })
        
        return response
    
    def is_suspicious_request(self, request: Request) -> bool:
        """
        Check if request looks suspicious.
        """
        # Check for SQL injection patterns in query params
        sql_patterns = [
            r"(\%27)|(\')|(\-\-)|(\%23)|(#)",
            r"((\%3D)|(=))[^\n]*((\%27)|(\')|(\-\-)|(\%3B)|(;))",
            r"\w*((\%27)|(\'))((\%6F)|o|(\%4F))((\%72)|r|(\%52))",
            r"((\%27)|(\'))union"
        ]
        
        path = str(request.url)
        for pattern in sql_patterns:
            if re.search(pattern, path, re.IGNORECASE):
                return True
        
        # Check for XSS patterns
        xss_patterns = [
            r"<script.*?>.*?</script>",
            r"javascript:",
            r"onerror=",
            r"onload="
        ]
        
        for pattern in xss_patterns:
            if re.search(pattern, path, re.IGNORECASE):
                return True
        
        return False
    
    def log_security_event(self, event_type: str, details: dict):
        """
        Log security event.
        """
        try:
            from core.logger import security_log
            security_log(event_type, details)
        except Exception as e:
            logger.error(f"Failed to log security event: {e}")

class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    In-memory rate limiter. Suitable for single-process desktop POS.
    NOTE: Counts reset on restart. For multi-worker deployment, use Redis-based limiting.
    """
    # API prefixes that should be rate limited
    API_PREFIXES = [
        '/auth', '/sales', '/products', '/customers',
        '/credit-management', '/inventory', '/expenses',
        '/pos', '/reports', '/users', '/settings',
        '/customer-payments', '/printers'
    ]

    def __init__(self, app, max_requests: int = 5000, window_seconds: int = 60):
        super().__init__(app)
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.requests = defaultdict(list)
        self.lock = threading.Lock()

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # Only apply rate limiting to API endpoints
        if not any(path.startswith(prefix) for prefix in self.API_PREFIXES):
            return await call_next(request)

        # Exclude certain paths from rate limiting
        excluded = ["/health", "/auth/login", "/auth/refresh", "/auth/logout"]
        if any(path.startswith(p) for p in excluded):
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"

        with self.lock:
            now = time.time()
            window_start = now - self.window_seconds

            # Clean old requests
            self.requests[client_ip] = [
                t for t in self.requests[client_ip] if t > window_start
            ]

            # Check rate limit
            if len(self.requests[client_ip]) >= self.max_requests:
                logger.warning(f"Rate limit exceeded for IP: {client_ip}")
                raise HTTPException(
                    status_code=429,
                    detail="Too many requests. Please try again later."
                )

            # Add current request
            self.requests[client_ip].append(now)

        return await call_next(request)

class CORSMiddleware(BaseHTTPMiddleware):
    """
    CORS middleware for local desktop application.
    """
    
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        
        # Add CORS headers for local desktop app
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Session-Token"
        response.headers["Access-Control-Allow-Credentials"] = "true"
        
        # Handle preflight requests
        if request.method == "OPTIONS":
            response = Response()
            response.status_code = 200
        
        return response

# Middleware configuration - Return class references, not instances
middleware = {
    'cors': {
        'class': 'fastapi.middleware.cors.CORSMiddleware',
        'config': {
            'allow_origins': ['*'],
            'allow_credentials': True,
            'allow_methods': ['*'],
            'allow_headers': ['*'],
        }
    },
    'security': SecurityMiddleware,
    'rate_limit': {
        'class': RateLimitMiddleware,
        'config': {'max_requests': 5000, 'window_seconds': 60}
    }
}