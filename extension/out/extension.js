"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const axios_1 = __importDefault(require("axios"));
class SasquatchSidebarProvider {
    static viewType = 'sasquatch.monitor';
    _view;
    resolveWebviewView(webviewView) {
        this._view = webviewView;
        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = this._getHtmlForWebview("🧠 Sasquatch is initializing...");
        console.log('Sasquatch sidebar view created');
    }
    updateMonitor(status, message, color) {
        if (this._view) {
            this._view.webview.html = this._getHtmlForWebview(message, status, color);
            console.log('Monitor updated:', status);
        }
    }
    _getHtmlForWebview(message, status = 'Idle', color = '#4CAF50') {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                body { 
                    font-family: var(--vscode-font-family);
                    padding: 15px; 
                    color: var(--vscode-editor-foreground);
                    background: var(--vscode-editor-background);
                    margin: 0;
                }
                .header {
                    font-size: 16px;
                    font-weight: bold;
                    margin-bottom: 15px;
                    color: var(--vscode-titleBar-activeForeground);
                }
                .card { 
                    background: var(--vscode-editor-background); 
                    border: 1px solid var(--vscode-widget-border); 
                    padding: 15px; 
                    border-radius: 6px; 
                    border-left: 4px solid ${color};
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }
                .status { 
                    font-weight: bold; 
                    color: ${color}; 
                    margin-bottom: 10px; 
                    display: block;
                    font-size: 14px;
                    letter-spacing: 0.5px;
                }
                .message {
                    line-height: 1.5;
                    margin: 0;
                }
                .timestamp { 
                    font-size: 11px; 
                    opacity: 0.6; 
                    margin-top: 12px; 
                    display: block;
                    font-style: italic;
                }
            </style>
        </head>
        <body>
            <div class="header">🦍 Sasquatch Monitor</div>
            <div class="card">
                <span class="status">● ${status.toUpperCase()}</span>
                <div class="message">${message}</div>
                <span class="timestamp">Last scan: ${new Date().toLocaleTimeString()}</span>
            </div>
        </body>
        </html>`;
    }
}
function activate(context) {
    console.log('🦍 Sasquatch extension activating...');
    // Register sidebar
    const sidebarProvider = new SasquatchSidebarProvider();
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(SasquatchSidebarProvider.viewType, sidebarProvider, { webviewOptions: { retainContextWhenHidden: true } }));
    // Diagnostic collection for squiggly lines
    const diagnosticCollection = vscode.languages.createDiagnosticCollection('sasquatch');
    context.subscriptions.push(diagnosticCollection);
    let timeout = undefined;
    const triggerAnalysis = (document) => {
        if (timeout) {
            clearTimeout(timeout);
        }
        timeout = setTimeout(async () => {
            // Only analyze Python files
            if (document.languageId !== 'python') {
                return;
            }
            console.log('🧠 Analyzing:', document.fileName);
            try {
                const response = await axios_1.default.post('http://localhost:3000/analyze', {
                    fileName: document.fileName,
                    code: document.getText()
                }, {
                    timeout: 5000 // 5 second timeout
                });
                console.log('Server response:', response.data.status);
                // Handle the response format from our optimized server
                if (response.data.status === 'danger' && response.data.locations) {
                    const locations = response.data.locations;
                    const diagnostics = [];
                    // Create diagnostics for each dangerous location
                    locations.forEach((loc) => {
                        const line = document.lineAt(loc.line);
                        const range = new vscode.Range(loc.line, loc.column, loc.line, line.text.trimEnd().length);
                        const diagnostic = new vscode.Diagnostic(range, response.data.message, vscode.DiagnosticSeverity.Error);
                        diagnostic.source = 'Sasquatch';
                        diagnostic.code = 'infinite-loop';
                        diagnostics.push(diagnostic);
                    });
                    diagnosticCollection.set(document.uri, diagnostics);
                    // Update sidebar with danger status
                    const issueCount = locations.length;
                    const firstIssue = locations[0];
                    sidebarProvider.updateMonitor("⚠️ Threat Detected", `Found <b>${issueCount}</b> infinite loop${issueCount > 1 ? 's' : ''}.<br><br>
                        <b>Line ${firstIssue.line + 1}:</b> ${response.data.message}`, '#FF5252');
                    console.log(`✗ Found ${issueCount} issue(s)`);
                }
                else {
                    // Code is safe
                    diagnosticCollection.clear();
                    const perfInfo = response.data.performance;
                    const loopCount = perfInfo?.loopsAnalyzed || 0;
                    sidebarProvider.updateMonitor("✓ Secure", `Code structure is safe.<br><br>
                        Analyzed ${loopCount} loop${loopCount !== 1 ? 's' : ''} in ${perfInfo?.totalMs || 0}ms.`, '#4CAF50');
                    console.log('✓ Code is safe');
                }
            }
            catch (error) {
                console.error('❌ Analysis error:', error.message);
                if (error.code === 'ECONNREFUSED') {
                    sidebarProvider.updateMonitor("⚠️ Offline", "Backend server not running.<br><br>Start server with: <code>node index.js</code>", '#FFC107');
                    vscode.window.showErrorMessage('Sasquatch: Backend server is offline (port 3000)');
                }
                else if (error.code === 'ECONNABORTED') {
                    sidebarProvider.updateMonitor("⚠️ Timeout", "Analysis took too long. The file might be very large.", '#FFC107');
                }
                else {
                    sidebarProvider.updateMonitor("⚠️ Error", `Analysis failed: ${error.message}`, '#FF5252');
                }
            }
        }, 500); // 500ms debounce
    };
    // Trigger on text change
    vscode.workspace.onDidChangeTextDocument(event => {
        triggerAnalysis(event.document);
    }, null, context.subscriptions);
    // Trigger on file open
    vscode.workspace.onDidOpenTextDocument(document => {
        triggerAnalysis(document);
    }, null, context.subscriptions);
    // Analyze current file on startup
    if (vscode.window.activeTextEditor) {
        triggerAnalysis(vscode.window.activeTextEditor.document);
    }
    console.log('✓ Sasquatch extension activated');
}
function deactivate() {
    console.log('Sasquatch extension deactivated');
}
//# sourceMappingURL=extension.js.map