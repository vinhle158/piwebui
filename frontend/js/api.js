export const api = {
    /**
     * General fetch request wrapper for Pi WebUI API.
     * @param {'GET' | 'POST' | 'PUT' | 'DELETE'} method 
     * @param {string} path 
     * @param {object} [body=null] 
     * @param {RequestInit} [options={}] 
     * @returns {Promise<any>}
     */
    async request(method, path, body = null, options = {}) {
        const url = `/api${path}`;
        const headers = {
            'Content-Type': 'application/json',
            ...options.headers,
        };
        const config = {
            method,
            headers,
            ...options,
        };
        
        if (body && !(body instanceof FormData)) {
            config.body = JSON.stringify(body);
        } else if (body instanceof FormData) {
            // For file uploads, fetch will automatically set the correct boundary header
            delete headers['Content-Type'];
            config.body = body;
        }

        try {
            const response = await fetch(url, config);
            
            // Check if response is empty or has content-type json
            const contentType = response.headers.get("content-type");
            let data = {};
            if (contentType && contentType.includes("application/json")) {
                data = await response.json();
            } else {
                data = { message: await response.text() };
            }

            if (!response.ok) {
                throw new Error(data.detail || data.message || `Lỗi API ${response.status}: ${path}`);
            }
            return data;
        } catch (error) {
            console.error(`API Error on ${method} ${path}:`, error);
            throw error;
        }
    },

    get(path, options) {
        return this.request('GET', path, null, options);
    },

    post(path, body, options) {
        return this.request('POST', path, body, options);
    },

    put(path, body, options) {
        return this.request('PUT', path, body, options);
    },

    delete(path, options) {
        return this.request('DELETE', path, null, options);
    }
};
