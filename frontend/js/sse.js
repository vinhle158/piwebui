export class SSEClient {
    /**
     * Reconnecting Server-Sent Events client wrapper.
     * @param {string} url 
     * @param {function} onMessage Callback receiving parsed message data.
     * @param {function} [onStatusChange=null] Callback receiving status: 'connecting' | 'connected' | 'disconnected'.
     */
    constructor(url, onMessage, onStatusChange = null) {
        this.url = url;
        this.onMessage = onMessage;
        this.onStatusChange = onStatusChange;
        this.es = null;
        this.reconnectDelay = 3000;
        this.timer = null;
    }

    connect() {
        this.disconnect(); // Ensure clean state before connecting
        
        if (this.onStatusChange) {
            this.onStatusChange('connecting');
        }

        this.es = new EventSource(this.url);
        
        this.es.onopen = () => {
            if (this.onStatusChange) {
                this.onStatusChange('connected');
            }
        };

        this.es.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.onMessage(data);
            } catch (err) {
                console.error("Error parsing SSE JSON payload:", err);
            }
        };

        this.es.onerror = () => {
            if (this.onStatusChange) {
                this.onStatusChange('disconnected');
            }
            this.disconnect();
            
            // Set up automatic reconnection timer
            this.timer = setTimeout(() => {
                this.connect();
            }, this.reconnectDelay);
        };
    }

    disconnect() {
        if (this.es) {
            this.es.close();
            this.es = null;
        }
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }
}
