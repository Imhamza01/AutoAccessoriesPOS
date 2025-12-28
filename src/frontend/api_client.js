// src/frontend/api_client.js
/**
 * API CLIENT FOR COMMUNICATION WITH BACKEND
 */

class APIClient {
    constructor() {
        this.baseURL = 'http://127.0.0.1:8000';
        this.token = localStorage.getItem('access_token');
        this.sessionToken = localStorage.getItem('session_token');
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
            
            // Handle 401 Unauthorized (token expired)
            if (response.status === 401) {
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

            const responseData = await response.json();

            if (!response.ok) {
                throw new Error(responseData.detail || 'Request failed');
            }

            return responseData;

        } catch (error) {
            console.error('API Error:', error);
            
            // Handle network errors
            if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
                throw new Error('Cannot connect to server. Please check if the application is running.');
            }
            
            throw error;
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