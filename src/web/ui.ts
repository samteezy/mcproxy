/**
 * Admin UI HTML template with embedded CSS and Alpine.js logic
 */
import { getEditorBundle, getAlpineBundle } from "./vendor.js";

/**
 * Generate the complete HTML page for the admin UI
 */
export function generateHtml(): string {
  const editorBundle = getEditorBundle();
  const alpineBundle = getAlpineBundle();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CLIP Admin</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    :root {
      --bg-primary: #1a1a2e;
      --bg-secondary: #16213e;
      --bg-tertiary: #0f3460;
      --text-primary: #e4e4e7;
      --text-secondary: #a1a1aa;
      --accent: #00d9ff;
      --accent-hover: #00b8d9;
      --success: #4ade80;
      --error: #f87171;
      --warning: #fbbf24;
      --border: #374151;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: var(--bg-primary);
      color: var(--text-primary);
      line-height: 1.5;
      min-height: 100vh;
    }

    header {
      background: var(--bg-secondary);
      padding: 1rem 1.5rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--border);
    }

    header h1 {
      font-size: 1.25rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    header h1::before {
      content: '';
      width: 8px;
      height: 8px;
      background: var(--accent);
      border-radius: 50%;
    }

    .status-indicator {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.875rem;
      color: var(--text-secondary);
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--success);
    }

    .status-dot.disconnected {
      background: var(--error);
    }

    nav {
      background: var(--bg-secondary);
      padding: 0 1.5rem;
      display: flex;
      gap: 0;
      border-bottom: 1px solid var(--border);
    }

    nav button {
      background: none;
      border: none;
      color: var(--text-secondary);
      padding: 0.75rem 1rem;
      font-size: 0.875rem;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      transition: all 0.2s;
    }

    nav button:hover {
      color: var(--text-primary);
    }

    nav button.active {
      color: var(--accent);
      border-bottom-color: var(--accent);
    }

    main {
      height: calc(100vh - 110px);
      overflow: hidden;
    }

    .tab-content {
      height: 100%;
      display: none;
    }

    .tab-content.active {
      display: flex;
      flex-direction: column;
    }

    .toolbar {
      background: var(--bg-secondary);
      padding: 0.75rem 1.5rem;
      display: flex;
      gap: 0.75rem;
      align-items: center;
      border-bottom: 1px solid var(--border);
    }

    button {
      background: var(--bg-tertiary);
      color: var(--text-primary);
      border: 1px solid var(--border);
      padding: 0.5rem 1rem;
      border-radius: 0.375rem;
      font-size: 0.875rem;
      cursor: pointer;
      transition: all 0.2s;
    }

    button:hover {
      background: var(--accent);
      border-color: var(--accent);
      color: var(--bg-primary);
    }

    button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    button.primary {
      background: var(--accent);
      border-color: var(--accent);
      color: var(--bg-primary);
    }

    button.primary:hover {
      background: var(--accent-hover);
      border-color: var(--accent-hover);
    }

    .validation-status {
      font-size: 0.875rem;
      margin-left: auto;
    }

    .validation-status.valid {
      color: var(--success);
    }

    .validation-status.invalid {
      color: var(--error);
    }

    #editor-container {
      flex: 1;
      overflow: hidden;
    }

    #editor-container .cm-editor {
      height: 100%;
    }

    /* Logs */
    .logs-toolbar {
      display: flex;
      gap: 0.75rem;
      align-items: center;
    }

    select, input[type="text"] {
      background: var(--bg-primary);
      color: var(--text-primary);
      border: 1px solid var(--border);
      padding: 0.5rem 0.75rem;
      border-radius: 0.375rem;
      font-size: 0.875rem;
    }

    select:focus, input[type="text"]:focus {
      outline: none;
      border-color: var(--accent);
    }

    input[type="text"] {
      width: 200px;
    }

    label {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.875rem;
      color: var(--text-secondary);
      cursor: pointer;
    }

    input[type="checkbox"] {
      width: 16px;
      height: 16px;
      accent-color: var(--accent);
    }

    #log-container {
      flex: 1;
      overflow-y: auto;
      padding: 1rem 1.5rem;
      font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Roboto Mono', monospace;
      font-size: 0.8125rem;
      line-height: 1.6;
    }

    .log-entry {
      padding: 0.25rem 0;
      display: flex;
      gap: 0.75rem;
    }

    .log-entry .timestamp {
      color: var(--text-secondary);
      flex-shrink: 0;
    }

    .log-entry .level {
      width: 50px;
      flex-shrink: 0;
      font-weight: 600;
    }

    .log-entry.log-error .level { color: var(--error); }
    .log-entry.log-warn .level { color: var(--warning); }
    .log-entry.log-info .level { color: var(--accent); }
    .log-entry.log-debug .level { color: var(--text-secondary); }

    .log-entry .message {
      flex: 1;
      word-break: break-word;
    }

    /* Status */
    #status-container {
      padding: 1.5rem;
      overflow-y: auto;
    }

    .upstream-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      border-radius: 0.5rem;
      padding: 1rem 1.5rem;
      margin-bottom: 1rem;
    }

    .upstream-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 0.75rem;
    }

    .upstream-name {
      font-weight: 600;
      font-size: 1rem;
    }

    .upstream-id {
      font-size: 0.75rem;
      color: var(--text-secondary);
    }

    .upstream-status {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.875rem;
    }

    .upstream-stats {
      display: flex;
      gap: 1.5rem;
      font-size: 0.875rem;
      color: var(--text-secondary);
    }

    .upstream-stats span {
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }

    /* Notifications */
    .notification {
      position: fixed;
      bottom: 1.5rem;
      right: 1.5rem;
      background: var(--bg-secondary);
      border: 1px solid var(--border);
      padding: 1rem 1.5rem;
      border-radius: 0.5rem;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      animation: slideIn 0.3s ease-out;
      z-index: 1000;
    }

    .notification.success {
      border-color: var(--success);
    }

    .notification.error {
      border-color: var(--error);
    }

    @keyframes slideIn {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
  </style>
</head>
<body>
  <div x-data="clipAdmin()" x-init="init()">
    <header>
      <h1>CLIP Admin</h1>
      <div class="status-indicator">
        <div class="status-dot" :class="{ disconnected: !connected }"></div>
        <span x-text="connected ? 'Connected' : 'Disconnected'"></span>
      </div>
    </header>

    <nav>
      <button @click="tab = 'config'" :class="{ active: tab === 'config' }">Configuration</button>
      <button @click="tab = 'logs'" :class="{ active: tab === 'logs' }">Logs</button>
      <button @click="tab = 'status'" :class="{ active: tab === 'status' }">Status</button>
    </nav>

    <main>
      <!-- Config Tab -->
      <section class="tab-content" :class="{ active: tab === 'config' }">
        <div class="toolbar">
          <button @click="saveConfig()" :disabled="saving">
            <span x-text="saving ? 'Saving...' : 'Save'"></span>
          </button>
          <button class="primary" @click="reloadConfig()" :disabled="reloading">
            <span x-text="reloading ? 'Reloading...' : 'Apply & Reload'"></span>
          </button>
          <button @click="validateConfig()">Validate</button>
          <span class="validation-status"
                :class="{ valid: validationStatus === 'valid', invalid: validationStatus === 'invalid' }"
                x-text="validationMessage"></span>
        </div>
        <div id="editor-container"></div>
      </section>

      <!-- Logs Tab -->
      <section class="tab-content" :class="{ active: tab === 'logs' }">
        <div class="toolbar logs-toolbar">
          <select x-model="logLevel">
            <option value="all">All Levels</option>
            <option value="error">Error</option>
            <option value="warn">Warn</option>
            <option value="info">Info</option>
            <option value="debug">Debug</option>
          </select>
          <input type="text" x-model="logFilter" placeholder="Filter logs...">
          <button @click="clearLogs()">Clear</button>
          <label>
            <input type="checkbox" x-model="autoScroll">
            Auto-scroll
          </label>
        </div>
        <div id="log-container" x-ref="logContainer">
          <template x-for="(log, index) in filteredLogs" :key="index">
            <div class="log-entry" :class="'log-' + (log.level || 'info')">
              <span class="timestamp" x-text="formatTime(log.timestamp)"></span>
              <span class="level" x-text="(log.level || 'info').toUpperCase()"></span>
              <span class="message" x-text="log.message || ''"></span>
            </div>
          </template>
        </div>
      </section>

      <!-- Status Tab -->
      <section class="tab-content" :class="{ active: tab === 'status' }">
        <div id="status-container">
          <template x-for="upstream in upstreams" :key="upstream.id">
            <div class="upstream-card">
              <div class="upstream-header">
                <div>
                  <div class="upstream-name" x-text="upstream.name"></div>
                  <div class="upstream-id" x-text="upstream.id"></div>
                </div>
                <div class="upstream-status">
                  <div class="status-dot" :class="{ disconnected: !upstream.connected }"></div>
                  <span x-text="upstream.connected ? 'Connected' : 'Disconnected'"></span>
                </div>
              </div>
              <div class="upstream-stats">
                <span><strong x-text="upstream.toolCount"></strong> tools</span>
                <span><strong x-text="upstream.resourceCount"></strong> resources</span>
                <span><strong x-text="upstream.promptCount"></strong> prompts</span>
              </div>
            </div>
          </template>
          <template x-if="upstreams.length === 0">
            <div style="color: var(--text-secondary);">No upstreams configured</div>
          </template>
        </div>
      </section>
    </main>

    <!-- Notification -->
    <template x-if="notification">
      <div class="notification" :class="notification.type" x-text="notification.message"></div>
    </template>
  </div>

  <!-- CodeMirror Editor Bundle -->
  <script>${editorBundle}</script>

  <!-- Define Alpine component before Alpine loads -->
  <script>
    document.addEventListener('alpine:init', () => {
      Alpine.data('clipAdmin', () => ({
        // State
        tab: 'config',
        connected: true,
        saving: false,
        reloading: false,
        validationStatus: '',
        validationMessage: '',
        logLevel: 'all',
        logFilter: '',
        autoScroll: true,
        logs: [],
        upstreams: [],
        notification: null,
        editor: null,
        eventSource: null,

        // Initialize
        async init() {
          await this.loadConfig();
          await this.loadStatus();
          this.initLogStream();

          // Refresh status periodically
          setInterval(() => this.loadStatus(), 10000);
        },

        // Config operations
        async loadConfig() {
          try {
            const res = await fetch('/api/config');
            const data = await res.json();

            // Initialize CodeMirror
            const container = document.getElementById('editor-container');
            if (!this.editor) {
              this.editor = window.createEditor(container, data.content);
            } else {
              this.editor.dispatch({
                changes: { from: 0, to: this.editor.state.doc.length, insert: data.content }
              });
            }
          } catch (error) {
            this.showNotification('Failed to load config: ' + error.message, 'error');
          }
        },

        async saveConfig() {
          if (!this.editor) return;

          this.saving = true;
          try {
            const content = this.editor.state.doc.toString();
            const res = await fetch('/api/config', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: content
            });

            const data = await res.json();
            if (data.success) {
              this.showNotification('Configuration saved', 'success');
            } else {
              this.showNotification(data.error || 'Failed to save', 'error');
              if (data.issues) {
                this.validationStatus = 'invalid';
                this.validationMessage = data.issues.map(i => i.path + ': ' + i.message).join('; ');
              }
            }
          } catch (error) {
            this.showNotification('Failed to save: ' + error.message, 'error');
          } finally {
            this.saving = false;
          }
        },

        async reloadConfig() {
          await this.saveConfig();
          if (this.validationStatus === 'invalid') return;

          this.reloading = true;
          try {
            const res = await fetch('/api/reload', { method: 'POST' });
            const data = await res.json();

            if (data.success) {
              this.showNotification('Configuration reloaded', 'success');
              await this.loadStatus();
            } else {
              this.showNotification(data.error || 'Failed to reload', 'error');
            }
          } catch (error) {
            this.showNotification('Failed to reload: ' + error.message, 'error');
          } finally {
            this.reloading = false;
          }
        },

        async validateConfig() {
          if (!this.editor) return;

          try {
            const content = this.editor.state.doc.toString();
            const res = await fetch('/api/config/validate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: content
            });

            const data = await res.json();
            if (data.valid) {
              this.validationStatus = 'valid';
              this.validationMessage = 'Valid configuration';
            } else {
              this.validationStatus = 'invalid';
              this.validationMessage = data.issues.map(i => (i.path ? i.path + ': ' : '') + i.message).join('; ');
            }
          } catch (error) {
            this.validationStatus = 'invalid';
            this.validationMessage = 'Validation failed: ' + error.message;
          }
        },

        // Log streaming
        initLogStream() {
          if (this.eventSource) {
            this.eventSource.close();
          }

          this.eventSource = new EventSource('/api/logs/stream');

          this.eventSource.onmessage = (event) => {
            try {
              const data = JSON.parse(event.data);
              if (data.type === 'history' && Array.isArray(data.logs)) {
                this.logs = [...data.logs];
              } else if (data.type === 'log' && data.entry) {
                // Create a new array to trigger reactivity
                const newLogs = [...this.logs, data.entry];
                // Keep buffer size reasonable
                this.logs = newLogs.length > 1000 ? newLogs.slice(-1000) : newLogs;
                // Auto-scroll
                if (this.autoScroll) {
                  this.$nextTick(() => {
                    const container = this.$refs.logContainer;
                    if (container) {
                      container.scrollTop = container.scrollHeight;
                    }
                  });
                }
              }
            } catch (e) {
              console.error('Failed to parse log event:', e);
            }
          };

          this.eventSource.onerror = () => {
            this.connected = false;
            // Attempt to reconnect after 5 seconds
            setTimeout(() => {
              if (this.eventSource && this.eventSource.readyState === EventSource.CLOSED) {
                this.initLogStream();
              }
            }, 5000);
          };

          this.eventSource.onopen = () => {
            this.connected = true;
          };
        },

        get filteredLogs() {
          if (!Array.isArray(this.logs)) return [];
          return this.logs.filter(log => {
            if (!log || typeof log !== 'object') return false;
            if (this.logLevel !== 'all' && log.level !== this.logLevel) {
              return false;
            }
            if (this.logFilter && log.message && !log.message.toLowerCase().includes(this.logFilter.toLowerCase())) {
              return false;
            }
            return true;
          });
        },

        formatTime(timestamp) {
          const date = new Date(timestamp);
          return date.toLocaleTimeString();
        },

        clearLogs() {
          this.logs = [];
        },

        // Status
        async loadStatus() {
          try {
            const res = await fetch('/health');
            const data = await res.json();
            this.upstreams = data.upstreams || [];
          } catch (error) {
            console.error('Failed to load status:', error);
          }
        },

        // Notifications
        showNotification(message, type = 'info') {
          this.notification = { message, type };
          setTimeout(() => {
            this.notification = null;
          }, 3000);
        }
      }));
    });
  </script>

  <!-- Alpine.js - loaded after component is defined -->
  <script>${alpineBundle}</script>
</body>
</html>`;
}
