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
let debounceTimer;
function activate(context) {
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
                const response = await axios_1.default.post('http://localhost:3000/analyze', {
                    code,
                    fileName: document.fileName
                });
                console.log('REFLEX: Brain responded:', response.data.status);
                if (response.data.status === 'danger' && response.data.locations) {
                    const diagnostics = [];
                    // Create diagnostic for each dangerous location
                    for (const location of response.data.locations) {
                        const line = document.lineAt(location.line);
                        const range = new vscode.Range(location.line, location.column, location.line, line.text.trimEnd().length);
                        const diagnostic = new vscode.Diagnostic(range, response.data.message, vscode.DiagnosticSeverity.Error);
                        // Add tags for better UX
                        diagnostic.source = 'REFLEX AST';
                        diagnostic.code = 'infinite-loop';
                        diagnostics.push(diagnostic);
                    }
                    diagnosticCollection.set(document.uri, diagnostics);
                }
                else {
                    diagnosticCollection.clear();
                }
            }
            catch (error) {
                console.error("REFLEX ERROR:", error.message);
                // Show warning in status bar if backend is down
                if (error.code === 'ECONNREFUSED') {
                    vscode.window.showWarningMessage('REFLEX: Backend server not running on port 3000');
                }
            }
        }, 300);
    });
    // Clear diagnostics when file is closed
    context.subscriptions.push(vscode.workspace.onDidCloseTextDocument((document) => {
        diagnosticCollection.delete(document.uri);
    }));
}
function deactivate() {
    if (debounceTimer) {
        clearTimeout(debounceTimer);
    }
}
//# sourceMappingURL=extension.js.map