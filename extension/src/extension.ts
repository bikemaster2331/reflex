import * as vscode from 'vscode';
import axios from 'axios';

class SasquatchSidebarProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'sasquatch.monitor';
    private _view?: vscode.WebviewView;

    resolveWebviewView(webviewView: vscode.WebviewView) {
        this._view = webviewView;
        webviewView.webview.options = { enableScripts: true };
        webviewView.webview.html = this._getHtmlForWebview("🧠 Sasquatch is initializing...");
        console.log('Sasquatch sidebar view created');
    }

    public updateMonitor(status: string, message: string, color: string) {
        if (this._view) {
            this._view.webview.html = this._getHtmlForWebview(message, status, color);
            console.log('Monitor updated:', status);
        }
    }

    private _getHtmlForWebview(message: string, status: string = 'Idle', color: string = '#4CAF50') {
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

export function activate(context: vscode.ExtensionContext) {
    console.log('🦍 Sasquatch extension activating...');

    // Register sidebar
    const sidebarProvider = new SasquatchSidebarProvider();
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            SasquatchSidebarProvider.viewType, 
            sidebarProvider,
            { webviewOptions: { retainContextWhenHidden: true } }
        )
    );

    // Diagnostic collection for squiggly lines
    const diagnosticCollection = vscode.languages.createDiagnosticCollection('sasquatch');
    context.subscriptions.push(diagnosticCollection);

    let timeout: NodeJS.Timeout | undefined = undefined;

    const triggerAnalysis = (document: vscode.TextDocument) => {
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
                const response = await axios.post('http://localhost:3000/analyze', {
                    fileName: document.fileName,
                    code: document.getText()
                }, {
                    timeout: 5000 // 5 second timeout
                });

                console.log('Server response:', response.data.status);

                // Handle the response format from our optimized server
                if (response.data.status === 'danger' && response.data.locations) {
                    const locations = response.data.locations;
                    const diagnostics: vscode.Diagnostic[] = [];

                    // Create diagnostics for each dangerous location
                    locations.forEach((loc: any) => {
                        const line = document.lineAt(loc.line);
                        const range = new vscode.Range(
                            loc.line,
                            loc.column,
                            loc.line,
                            line.text.trimEnd().length
                        );
                        
                        const diagnostic = new vscode.Diagnostic(
                            range,
                            response.data.message,
                            vscode.DiagnosticSeverity.Error
                        );
                        
                        diagnostic.source = 'Sasquatch';
                        diagnostic.code = 'infinite-loop';
                        diagnostics.push(diagnostic);
                    });

                    diagnosticCollection.set(document.uri, diagnostics);

                    // Update sidebar with danger status
                    const issueCount = locations.length;
                    const firstIssue = locations[0];
                    
                    sidebarProvider.updateMonitor(
                        "⚠️ Threat Detected", 
                        `Found <b>${issueCount}</b> infinite loop${issueCount > 1 ? 's' : ''}.<br><br>
                        <b>Line ${firstIssue.line + 1}:</b> ${response.data.message}`, 
                        '#FF5252'
                    );

                    console.log(`✗ Found ${issueCount} issue(s)`);
                } else {
                    // Code is safe
                    diagnosticCollection.clear();
                    
                    const perfInfo = response.data.performance;
                    const loopCount = perfInfo?.loopsAnalyzed || 0;
                    
                    sidebarProvider.updateMonitor(
                        "✓ Secure", 
                        `Code structure is safe.<br><br>
                        Analyzed ${loopCount} loop${loopCount !== 1 ? 's' : ''} in ${perfInfo?.totalMs || 0}ms.`, 
                        '#4CAF50'
                    );

                    console.log('✓ Code is safe');
                }

            } catch (error: any) {
                console.error('❌ Analysis error:', error.message);
                
                if (error.code === 'ECONNREFUSED') {
                    sidebarProvider.updateMonitor(
                        "⚠️ Offline",
                        "Backend server not running.<br><br>Start server with: <code>node index.js</code>",
                        '#FFC107'
                    );
                    vscode.window.showErrorMessage('Sasquatch: Backend server is offline (port 3000)');
                } else if (error.code === 'ECONNABORTED') {
                    sidebarProvider.updateMonitor(
                        "⚠️ Timeout",
                        "Analysis took too long. The file might be very large.",
                        '#FFC107'
                    );
                } else {
                    sidebarProvider.updateMonitor(
                        "⚠️ Error",
                        `Analysis failed: ${error.message}`,
                        '#FF5252'
                    );
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

export function deactivate() {
    console.log('Sasquatch extension deactivated');
}