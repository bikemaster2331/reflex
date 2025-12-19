const express = require('express');
const Parser = require('tree-sitter');
const Python = require('tree-sitter-python');

const app = express();
app.use(express.json());

const parser = new Parser();
parser.setLanguage(Python);

// Single-pass collector - walks tree ONCE and collects everything
function analyzeWhileLoop(whileNode) {
    const analysis = {
        hasBreak: false,
        hasReturn: false,
        hasSleep: false,
        breakCount: 0,
        returnCount: 0,
        sleepCalls: []
    };
    
    function traverse(node) {
        // Check node type once
        switch (node.type) {
            case 'break_statement':
                analysis.hasBreak = true;
                analysis.breakCount++;
                break;
                
            case 'return_statement':
                analysis.hasReturn = true;
                analysis.returnCount++;
                break;
                
            case 'call':
                // Check if it's a sleep call
                const functionNode = node.childForFieldName('function');
                if (!functionNode) break;
                
                // Direct call: sleep()
                if (functionNode.type === 'identifier' && functionNode.text === 'sleep') {
                    analysis.hasSleep = true;
                    analysis.sleepCalls.push('sleep()');
                }
                
                // Attribute call: time.sleep()
                if (functionNode.type === 'attribute') {
                    const attribute = functionNode.childForFieldName('attribute');
                    if (attribute && attribute.text === 'sleep') {
                        analysis.hasSleep = true;
                        analysis.sleepCalls.push('time.sleep()');
                    }
                }
                break;
        }
        
        // Traverse children
        for (let child of node.children) {
            traverse(child);
        }
    }
    
    traverse(whileNode);
    return analysis;
}

// Check if condition is infinite by reading AST structure
function getConditionType(whileNode) {
    const conditionNode = whileNode.childForFieldName('condition');
    if (!conditionNode) return { isInfinite: false, type: 'unknown' };
    
    // Boolean literal True
    if (conditionNode.type === 'true') {
        return { isInfinite: true, type: 'True' };
    }
    
    // Identifier 'True' (older Python)
    if (conditionNode.type === 'identifier' && conditionNode.text === 'True') {
        return { isInfinite: true, type: 'True' };
    }
    
    // Integer 1 (while 1:)
    if (conditionNode.type === 'integer' && conditionNode.text === '1') {
        return { isInfinite: true, type: '1' };
    }
    
    return { isInfinite: false, type: conditionNode.type };
}

// Find all while loops in a single pass
function findAllWhileLoops(rootNode) {
    const loops = [];
    
    function traverse(node) {
        if (node.type === 'while_statement') {
            loops.push(node);
        }
        for (let child of node.children) {
            traverse(child);
        }
    }
    
    traverse(rootNode);
    return loops;
}

app.post('/analyze', (req, res) => {
    const { code, fileName } = req.body;
    console.log("\n--- AST BRAIN ANALYZING ---");
    console.log(`File: ${fileName || 'unknown'}`);
    
    try {
        // Parse into AST
        const startTime = Date.now();
        const tree = parser.parse(code);
        const rootNode = tree.rootNode;
        const parseTime = Date.now() - startTime;
        
        // Check for parse errors
        if (rootNode.hasError) {
            console.log("-> Syntax errors detected (user still typing)");
            return res.json({ status: 'safe' });
        }
        
        // Find all while loops (single pass)
        const analysisStart = Date.now();
        const whileLoops = findAllWhileLoops(rootNode);
        console.log(`Found ${whileLoops.length} while loop(s) [${parseTime}ms parse]`);
        
        let dangerousLoops = [];
        
        // Analyze each loop (single pass per loop)
        for (let whileLoop of whileLoops) {
            const lineNum = whileLoop.startPosition.row + 1;
            console.log(`\n  Loop at line ${lineNum}:`);
            
            // Get condition type
            const condition = getConditionType(whileLoop);
            console.log(`    - Condition: ${condition.type} (infinite: ${condition.isInfinite})`);
            
            if (condition.isInfinite) {
                // Single-pass analysis of loop body
                const analysis = analyzeWhileLoop(whileLoop);
                
                // Log findings
                if (analysis.hasBreak) {
                    console.log(`    ✓ Has ${analysis.breakCount} break(s)`);
                }
                if (analysis.hasReturn) {
                    console.log(`    ✓ Has ${analysis.returnCount} return(s)`);
                }
                if (analysis.hasSleep) {
                    console.log(`    ✓ Has sleep: ${analysis.sleepCalls.join(', ')}`);
                }
                
                const hasExit = analysis.hasBreak || analysis.hasReturn || analysis.hasSleep;
                
                if (!hasExit) {
                    diagnostics.push({
                        type: 'observation', 
                        message: 'Loop has no observable exit in this scope.',
                        ghostText: '    break  # Sasquatch: Added exit to prevent freeze',
                        line: whileLoop.startPosition.row + 1, // Suggest fix on the next line
                        column: 4 // Indented
                });
                } else {
                    console.log(`    ✓ Safe (has exit)`);
                }
            } else {
                console.log(`    ✓ Safe (finite condition)`);
            }
        }
        
        const totalTime = Date.now() - startTime;
        console.log(`\nAnalysis completed in ${totalTime}ms`);
        
        if (dangerousLoops.length > 0) {
            console.log("-> FINAL RESULT: DANGER 🔴");
            res.json({
                status: 'danger',
                message: 'Infinite loop with no exit mechanism detected',
                locations: dangerousLoops,
                performance: {
                    parseMs: parseTime,
                    totalMs: totalTime,
                    loopsAnalyzed: whileLoops.length
                }
            });
        } else {
            console.log("-> FINAL RESULT: SAFE ✅");
            res.json({ 
                status: 'safe',
                message: 'All loops have proper exit conditions',
                performance: {
                    parseMs: parseTime,
                    totalMs: totalTime,
                    loopsAnalyzed: whileLoops.length
                }
            });
        }
        
    } catch (err) {
        console.error('AST Parser error:', err.message);
        res.json({ status: 'safe', error: err.message });
    }
});

app.get('/health', (req, res) => {
    res.json({ 
        status: 'alive', 
        parser: 'tree-sitter-python',
        method: 'Single-pass AST analysis',
        optimizations: ['field queries', 'single traversal per loop', 'syntax error handling']
    });
});

app.listen(3000, () => {
    console.log('🧠 Optimized AST Brain running on http://localhost:3000');
    console.log('Single-pass analysis with performance tracking');
});