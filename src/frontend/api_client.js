// src/frontend/api_client.js
/**
 * API CLIENT FOR COMMUNICATION WITH BACKEND
 */

class APIClient {
    constructor() {
        // Point to the backend server. Prefer same-origin so SPA works when
        // served from the backend. Fall back to explicit localhost for dev.
        const fallback = 'http://127.0.0.1:8000';
        try {
            // Use global override if provided (useful for tests / packaged builds)
            // Some browsers return the string "null" for file:// origins — treat that as missing.
            let origin = null;
            try {
                origin = window.location && window.location.origin && window.location.origin !== 'null' ? window.location.origin : null;
            } catch (e) {
                origin = null;
            }

            this.baseURL = window.__API_BASE__ || origin || fallback;
        } catch (e) {
            this.baseURL = fallback;
        }
        this.token = localStorage.getItem('access_token');
        this.sessionToken = localStorage.getItem('session_token');
        console.log('[APIClient] baseURL =', this.baseURL);
    }

    setToken(token) {
        this.token = token;
        localStorage.setItem('access_token', token);
    }

    setSessionToken(token) {
        this.sessionToken = token;
        localStorage.setItem('session_token', token);
    }

    async request(method, endpoint, data = null) {
        const url = `${this.baseURL}${endpoint}`;
        const headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };

        console.log('[APIClient] Request:', method, url, data ? { body: data } : {});

        // Add authorization header if token exists
        if (this.token) {
            headers['Authorization'] = `Bearer ${this.token}`;
        }

        // Add session token if exists
        if (this.sessionToken) {
            headers['X-Session-Token'] = this.sessionToken;
        }

        const config = {
            method,
            headers,
            credentials: 'include'
        };

        if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
            config.body = JSON.stringify(data);
        }

        try {
            const response = await fetch(url, config);

            console.log('[APIClient] Response status:', response.status, response.statusText);
            // Handle 401 Unauthorized (token expired)
            if (response.status === 401) {
                // If running in a local preview mode, don't redirect to login
                let previewMode = false;
                try {
                    const urlParams = new URLSearchParams(window.location.search);
                    previewMode = urlParams.get('preview') === '1';
                } catch (e) {
                    // ignore
                }

                if (previewMode) {
                    console.warn('Received 401 from API but running in preview mode — skipping redirect.');
                    return { success: false, error: 'Authentication failed', data: [] };
                }

                // Try to refresh token
                const refreshToken = localStorage.getItem('refresh_token');
                if (refreshToken) {
                    try {
                        const refreshResponse = await this.post('/auth/refresh', {
                            refresh_token: refreshToken
                        });

                        // Update token and retry request
                        this.setToken(refreshResponse.access_token);
                        headers['Authorization'] = `Bearer ${refreshResponse.access_token}`;

                        // Retry the original request
                        const retryConfig = { ...config, headers };
                        if (data) {
                            retryConfig.body = JSON.stringify(data);
                        }

                        const retryResponse = await fetch(url, retryConfig);
                        const retryData = await retryResponse.json();

                        if (!retryResponse.ok) {
                            throw new Error(retryData.detail || 'Request failed');
                        }

                        return retryData;

                    } catch (refreshError) {
                        // Refresh failed, clear auth data
                        this.clearAuthData();
                        window.location.href = '/login.html';
                        throw new Error('Session expired. Please login again.');
                    }
                } else {
                    // No refresh token, redirect to login
                    this.clearAuthData();
                    window.location.href = '/login.html';
                    throw new Error('Session expired. Please login again.');
                }
            }

            let responseData = null;
            try {
                responseData = await response.json();
            } catch (e) {
                console.warn('[APIClient] Failed to parse JSON response', e);
                responseData = null;
            }
            if (!response.ok) {
                console.error('[APIClient] API Error Response:', responseData);
                return { success: false, error: (responseData && responseData.detail) || 'Request failed', data: [] };
            }

            // Normalize response format - always return consistent structure
            if (responseData && typeof responseData === 'object') {
                // If already has success field, return as is
                if (responseData.success !== undefined) {
                    return responseData;
                }
                // If it's an array, wrap it
                if (Array.isArray(responseData)) {
                    return { success: true, data: responseData };
                }
                // If it has specific data fields, normalize them
                if (responseData.products !== undefined || 
                    responseData.customers !== undefined || 
                    responseData.sales !== undefined || 
                    responseData.expenses !== undefined || 
                    responseData.users !== undefined ||
                    responseData.settings !== undefined) {
                    return { success: true, ...responseData };
                }
                // Default: assume it's successful data
                return { success: true, data: responseData };
            }

            return { success: true, data: responseData };

        } catch (error) {
            console.error('API Error:', error);
            
            // Handle network errors
            if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                return { success: false, error: 'Cannot connect to server. Please check if the application is running.', data: [] };
            }
            
            return { success: false, error: error.message, data: [] };
        }
    }

    clearAuthData() {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user_data');
        localStorage.removeItem('session_token');
        this.token = null;
        this.sessionToken = null;
    }

    async get(endpoint) {
        return this.request('GET', endpoint);
    }

    async post(endpoint, data) {
        return this.request('POST', endpoint, data);
    }

    async put(endpoint, data) {
        return this.request('PUT', endpoint, data);
    }

    async patch(endpoint, data) {
        return this.request('PATCH', endpoint, data);
    }

    async delete(endpoint) {
        return this.request('DELETE', endpoint);
    }

    // Download binary (PDF) from backend and prompt save
    async download(endpoint, filename) {
        const url = `${this.baseURL}${endpoint}`;
        const headers = {};
        if (this.token) headers['Authorization'] = `Bearer ${this.token}`;
        if (this.sessionToken) headers['X-Session-Token'] = this.sessionToken;

        try {
            const res = await fetch(url, { method: 'GET', headers, credentials: 'include' });
            if (!res.ok) {
                // try to parse json error
                try {
                    const err = await res.json();
                    return { success: false, error: err.detail || 'Download failed' };
                } catch (_) {
                    return { success: false, error: 'Download failed' };
                }
            }

            const blob = await res.blob();
            const blobUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = filename || 'report.pdf';
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(blobUrl);
            return { success: true };
        } catch (e) {
            console.error('Download error:', e);
            return { success: false, error: e.message };
        }
    }

    // Convenience methods for common endpoints
    async getCurrentUser() {
        return this.get('/auth/me');
    }

    async logout() {
        return this.post('/auth/logout');
    }

    async changePassword(currentPassword, newPassword, confirmPassword) {
        return this.post('/auth/change-password', {
            current_password: currentPassword,
            new_password: newPassword,
            confirm_password: confirmPassword
        });
    }

    async getUsers() {
        return this.get('/auth/users');
    }

    async createUser(userData) {
        return this.post('/auth/users', userData);
    }

    async updateUser(userId, userData) {
        return this.put(`/auth/users/${userId}`, userData);
    }

    async deleteUser(userId) {
        return this.delete(`/auth/users/${userId}`);
    }

    async getRoles() {
        return this.get('/auth/roles');
    }

    async getPermissions() {
        return this.get('/auth/permissions');
    }
}

// Export for use in other modules
window.APIClient = APIClient;