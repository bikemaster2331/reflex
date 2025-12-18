import * as vscode from 'vscode';
import axios from 'axios';

let debounceTimer: NodeJS.Timeout | undefined;

export function activate(context: vscode.ExtensionContext) {
    console.log('REFLEX: Extension is now active!');

    const diagnosticCollection = vscode.languages.createDiagnosticCollection('reflex');

    vscode.workspace.onDidChangeTextDocument(async (event) => {
        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }

        debounceTimer = setTimeout(async () => {
            const document = event.document;
            const code = document.getText();
            
            // Only analyze Python files
            if (document.languageId !== 'python') {
                return;
            }
            
            console.log('REFLEX: Sending code to AST brain...');

            try {
                const response = await axios.post('http://localhost:3000/analyze', { 
                    code,
                    fileName: document.fileName 
                });
                
                console.log('REFLEX: Brain responded:', response.data.status);
                
                if (response.data.status === 'danger' && response.data.locations) {
                    const diagnostics: vscode.Diagnostic[] = [];
                    
                    // Create diagnostic for each dangerous location
                    for (const location of response.data.locations) {
                        const line = document.lineAt(location.line);
                        const range = new vscode.Range(
                            location.line,
                            location.column,
                            location.line,
                            line.text.trimEnd().length
                        );
                        
                        const diagnostic = new vscode.Diagnostic(
                            range,
                            response.data.message,
                            vscode.DiagnosticSeverity.Error
                        );
                        
                        // Add tags for better UX
                        diagnostic.source = 'REFLEX AST';
                        diagnostic.code = 'infinite-loop';
                        
                        diagnostics.push(diagnostic);
                    }
                    
                    diagnosticCollection.set(document.uri, diagnostics);
                } else {
                    diagnosticCollection.clear();
                }
            } catch (error: any) {
                console.error("REFLEX ERROR:", error.message);
                // Show warning in status bar if backend is down
                if (error.code === 'ECONNREFUSED') {
                    vscode.window.showWarningMessage('REFLEX: Backend server not running on port 3000');
                }
            }
        }, 300);
    });

    // Clear diagnostics when file is closed
    context.subscriptions.push(
        vscode.workspace.onDidCloseTextDocument((document) => {
            diagnosticCollection.delete(document.uri);
        })
    );
}

export function deactivate() {
    if (debounceTimer) {
        clearTimeout(debounceTimer);
    }
}