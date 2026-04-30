// src/frontend/api_client.js
/**
 * API CLIENT FOR COMMUNICATION WITH BACKEND
 * Compatible with ES2017+ (async/await, no object spread, no optional chaining)
 */

class APIClient {
    constructor() {
        var fallback = 'http://127.0.0.1:8000';
        try {
            var origin = null;
            try {
                origin = (window.location && window.location.origin && window.location.origin !== 'null')
                    ? window.location.origin : null;
            } catch (e) {
                origin = null;
            }
            this.baseURL = window.__API_BASE__ || origin || fallback;
        } catch (e) {
            this.baseURL = fallback;
        }
        this.token = localStorage.getItem('access_token');
        this.sessionToken = localStorage.getItem('session_token');
        this._isRefreshing = false;
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

    async request(method, endpoint, data) {
        if (data === undefined) { data = null; }

        var url = this.baseURL + endpoint;
        var headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };

        if (this.token) {
            headers['Authorization'] = 'Bearer ' + this.token;
        }
        if (this.sessionToken) {
            headers['X-Session-Token'] = this.sessionToken;
        }

        var config = {
            method: method,
            headers: headers,
            credentials: 'include'
        };

        if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
            config.body = JSON.stringify(data);
        }

        var controller = new AbortController();
        var timeoutId = setTimeout(function() { controller.abort(); }, 30000);

        try {
            // ── Fetch ──────────────────────────────────────────────────────────
            var fetchConfig = Object.assign({}, config, { signal: controller.signal });
            var response;
            try {
                response = await fetch(url, fetchConfig);
                clearTimeout(timeoutId);
            } catch (fetchError) {
                clearTimeout(timeoutId);
                if (fetchError.name === 'AbortError') {
                    return { success: false, error: 'Request timed out.', data: [] };
                }
                // Network error — backend unreachable
                return { success: false, error: 'Cannot connect to server. Please check if the application is running.', data: [] };
            }

            // ── 401 — token expired, try refresh ──────────────────────────────
            if (response.status === 401) {
                if (this._isRefreshing) {
                    this.clearAuthData();
                    window.location.href = '/login.html';
                    return { success: false, error: 'Session expired.', data: [] };
                }

                // Skip redirect in preview mode
                var previewMode = false;
                try {
                    previewMode = new URLSearchParams(window.location.search).get('preview') === '1';
                } catch (e) {}

                if (previewMode) {
                    return { success: false, error: 'Authentication failed', data: [] };
                }

                var refreshToken = localStorage.getItem('refresh_token');
                if (!refreshToken) {
                    this.clearAuthData();
                    window.location.href = '/login.html';
                    return { success: false, error: 'No refresh token.', data: [] };
                }

                this._isRefreshing = true;
                try {
                    var refreshResp = await fetch(this.baseURL + '/auth/refresh', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ refresh_token: refreshToken })
                    });

                    if (!refreshResp.ok) {
                        throw new Error('Refresh token expired or invalid');
                    }

                    var refreshData = await refreshResp.json();
                    var newToken = refreshData.access_token;
                    if (!newToken) { throw new Error('No access token in refresh response'); }

                    this.setToken(newToken);
                    headers['Authorization'] = 'Bearer ' + newToken;

                    // Retry original request with new token
                    var retryConfig = Object.assign({}, config, { headers: headers });
                    if (data) { retryConfig.body = JSON.stringify(data); }

                    var retryResponse = await fetch(url, retryConfig);
                    var retryData = await retryResponse.json();

                    if (!retryResponse.ok) {
                        throw new Error((retryData && retryData.detail) || 'Retry failed after token refresh');
                    }
                    return retryData;

                } catch (refreshError) {
                    console.error('[APIClient] Token refresh failed:', refreshError.message);
                    this.clearAuthData();
                    window.location.href = '/login.html';
                    return { success: false, error: 'Session expired. Please login again.', data: [] };
                } finally {
                    this._isRefreshing = false;
                }
            }

            // ── Parse response ─────────────────────────────────────────────────
            var responseData = null;
            try {
                responseData = await response.json();
            } catch (e) {
                console.warn('[APIClient] Failed to parse JSON response', e);
                responseData = null;
            }

            if (!response.ok) {
                console.error('[APIClient] API Error:', response.status, responseData);
                return {
                    success: false,
                    error: (responseData && responseData.detail) || 'Request failed',
                    data: []
                };
            }

            // ── Normalize response ─────────────────────────────────────────────
            if (responseData && typeof responseData === 'object') {
                if (responseData.success !== undefined) {
                    return responseData;
                }
                if (Array.isArray(responseData)) {
                    return { success: true, data: responseData };
                }
                if (responseData.products !== undefined ||
                    responseData.customers !== undefined ||
                    responseData.sales !== undefined ||
                    responseData.expenses !== undefined ||
                    responseData.users !== undefined ||
                    responseData.settings !== undefined) {
                    return Object.assign({ success: true }, responseData);
                }
                return { success: true, data: responseData };
            }

            return { success: true, data: responseData };

        } catch (error) {
            console.error('[APIClient] Unexpected error:', error);
            return { success: false, error: error.message || 'Unknown error', data: [] };
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

    async download(endpoint, filename) {
        var url = this.baseURL + endpoint;
        var headers = {};
        if (this.token) { headers['Authorization'] = 'Bearer ' + this.token; }
        if (this.sessionToken) { headers['X-Session-Token'] = this.sessionToken; }

        try {
            var res = await fetch(url, { method: 'GET', headers: headers, credentials: 'include' });
            if (!res.ok) {
                try {
                    var err = await res.json();
                    return { success: false, error: (err && err.detail) || 'Download failed' };
                } catch (_) {
                    return { success: false, error: 'Download failed' };
                }
            }
            var blob = await res.blob();
            var blobUrl = window.URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = blobUrl;
            a.download = filename || 'report.pdf';
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(blobUrl);
            return { success: true };
        } catch (e) {
            console.error('[APIClient] Download error:', e);
            return { success: false, error: e.message };
        }
    }

    async getCurrentUser() { return this.get('/auth/me'); }
    async logout() { return this.post('/auth/logout'); }

    async changePassword(currentPassword, newPassword, confirmPassword) {
        return this.post('/auth/change-password', {
            current_password: currentPassword,
            new_password: newPassword,
            confirm_password: confirmPassword
        });
    }

    async getUsers() { return this.get('/auth/users'); }
    async createUser(userData) { return this.post('/auth/users', userData); }
    async updateUser(userId, userData) { return this.put('/auth/users/' + userId, userData); }
    async deleteUser(userId) { return this.delete('/auth/users/' + userId); }
    async getRoles() { return this.get('/auth/roles'); }
    async getPermissions() { return this.get('/auth/permissions'); }
}

window.APIClient = APIClient;
