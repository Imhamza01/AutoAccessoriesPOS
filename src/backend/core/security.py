# src/backend/core/security.py
"""
SECURITY MIDDLEWARE FOR RATE LIMITING AND SECURITY HEADERS
"""

import time
import threading
from collections import defaultdict
from datetime import datetime, timedelta
from fastapi import Request, HTTPException
from fastapi.middleware import Middleware
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
        response.headers["Content-Security-Policy"] = "default-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data:;"
        
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
    Rate limiting middleware.
    """
    
    def __init__(self, app, max_requests: int = 100, window_seconds: int = 60):
        super().__init__(app)
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.requests = defaultdict(list)
        self.lock = threading.Lock()
        
        # Exclude these paths from rate limiting
        self.excluded_paths = ["/health", "/auth/login"]
    
    async def dispatch(self, request: Request, call_next):
        # Skip rate limiting for excluded paths
        if any(request.url.path.startswith(path) for path in self.excluded_paths):
            return await call_next(request)
        
        client_ip = request.client.host if request.client else "unknown"
        
        with self.lock:
            now = time.time()
            window_start = now - self.window_seconds
            
            # Clean old requests
            self.requests[client_ip] = [
                req_time for req_time in self.requests[client_ip]
                if req_time > window_start
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

# Middleware configuration
middleware = [
    Middleware(CORSMiddleware),
    Middleware(SecurityMiddleware),
    Middleware(RateLimitMiddleware, max_requests=200, window_seconds=60)
]