const express = require('express');
const Parser = require('tree-sitter');
const Python = require('tree-sitter-python');

const app = express();
app.use(express.json());

const parser = new Parser();
parser.setLanguage(Python);

/**
 * Single-pass collector - walks the tree of a SPECIFIC loop body.
 * Merged with 'Do Not Enter' rule to ignore inner loop exits.
 */
function analyzeWhileLoop(whileNode) {
    const analysis = {
        hasBreak: false,
        hasReturn: false,
        hasSleep: false,
        breakCount: 0,
        returnCount: 0,
        sleepCalls: []
    };
    
    const bodyNode = whileNode.childForFieldName('body');
    if (!bodyNode) return analysis;

    function traverse(node) {
        // --- THE "DO NOT ENTER" RULE ---
        // Prevents an inner loop's break from 'saving' an outer infinite loop.
        if (node !== bodyNode && (node.type === 'while_statement' || node.type === 'for_statement')) {
            return; 
        }

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
                const functionNode = node.childForFieldName('function');
                if (!functionNode) break;
                if (functionNode.type === 'identifier' && functionNode.text === 'sleep') {
                    analysis.hasSleep = true;
                    analysis.sleepCalls.push('sleep()');
                }
                if (functionNode.type === 'attribute') {
                    const attribute = functionNode.childForFieldName('attribute');
                    if (attribute && attribute.text === 'sleep') {
                        analysis.hasSleep = true;
                        analysis.sleepCalls.push('time.sleep()');
                    }
                }
                break;
        }
        for (let i = 0; i < node.childCount; i++) {
            traverse(node.child(i));
        }
    }
    traverse(bodyNode);
    return analysis;
}

function getConditionType(whileNode) {
    const conditionNode = whileNode.childForFieldName('condition');
    if (!conditionNode) return { isInfinite: false, type: 'unknown' };
    if (conditionNode.type === 'true') return { isInfinite: true, type: 'True' };
    if (conditionNode.type === 'identifier' && conditionNode.text === 'True') return { isInfinite: true, type: 'True' };
    if (conditionNode.type === 'integer' && conditionNode.text === '1') return { isInfinite: true, type: '1' };
    return { isInfinite: false, type: conditionNode.type };
}

function findAllWhileLoops(rootNode) {
    const loops = [];
    function traverse(node) {
        if (node.type === 'while_statement') loops.push(node);
        for (let i = 0; i < node.childCount; i++) {
            traverse(node.child(i));
        }
    }
    traverse(rootNode);
    return loops;
}

// --- API ENDPOINT ---

app.post('/analyze', (req, res) => {
    const { code, fileName } = req.body;
    console.log(`\n--- AST BRAIN ANALYZING: ${fileName || 'Untitled'} ---`);
    
    try {
        const startTime = Date.now();
        const tree = parser.parse(code);
        const rootNode = tree.rootNode;
        const parseTime = Date.now() - startTime;

        // FIXED: Property check for v22+ Node bindings
        if (rootNode.hasError) {
            console.log("Result: WAITING (Syntax Error / Incomplete Code)");
            return res.json({ status: 'safe' });
        }
        
        const whileLoops = findAllWhileLoops(rootNode);
        let dangerousLoops = [];
        
        for (let whileLoop of whileLoops) {
            const lineNum = whileLoop.startPosition.row + 1;
            const condition = getConditionType(whileLoop);
            
            if (condition.isInfinite) {
                const analysis = analyzeWhileLoop(whileLoop);
                const hasExit = analysis.hasBreak || analysis.hasReturn || analysis.hasSleep;
                
                if (!hasExit) {
                    console.log(`  Loop at line ${lineNum}: DANGER 🔴 (No exit found)`);
                    dangerousLoops.push({
                        line: whileLoop.startPosition.row,
                        column: whileLoop.startPosition.column,
                        endColumn: whileLoop.endPosition.column
                    });
                } else {
                    console.log(`  Loop at line ${lineNum}: SAFE ✅ (Found exit)`);
                }
            }
        }
        
        const totalTime = Date.now() - startTime;
        console.log(`Final Decision: ${dangerousLoops.length > 0 ? 'DANGER' : 'SAFE'} (${totalTime}ms)`);
        
        res.json({
            status: dangerousLoops.length > 0 ? 'danger' : 'safe',
            message: '⚠️ Infinite loop detected with no exit mechanism.',
            locations: dangerousLoops,
            performance: { totalMs: totalTime, parseMs: parseTime }
        });
        
    } catch (err) {
        console.error('Logic error:', err.message);
        res.json({ status: 'safe' });
    }
});

app.listen(3000, () => console.log('🧠 AST Brain running on http://localhost:3000'));