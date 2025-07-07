const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

class PythonClonerWrapper {
    constructor(socketIo, clonerId) {
        this.io = socketIo;
        this.clonerId = clonerId;
        this.pythonPath = path.join(__dirname, 'cloner.py');
    }

    async verifyToken(token) {
        return new Promise((resolve, reject) => {
            // Create a temporary Python script for token verification
            const tempScript = `
import asyncio
import sys
import json
import os

# Add current directory to path
sys.path.insert(0, '${__dirname.replace(/\\/g, '/')}')

try:
    from cloner import PythonCloner
    
    async def verify():
        try:
            cloner = PythonCloner()
            result = await cloner.verify_token('${token.replace(/'/g, "\\'")}')
            print(json.dumps(result))
        except Exception as e:
            print(json.dumps({"success": False, "error": str(e)}))
    
    asyncio.run(verify())
except ImportError as e:
    print(json.dumps({"success": False, "error": f"Import error: {str(e)}"}))
except Exception as e:
    print(json.dumps({"success": False, "error": f"Unexpected error: {str(e)}"}))
            `;

            const pythonProcess = spawn('/home/codespace/.python/current/bin/python3', ['-c', tempScript], {
                cwd: __dirname,
                env: { ...process.env, PYTHONPATH: __dirname }
            });

            let output = '';
            let errorOutput = '';

            pythonProcess.stdout.on('data', (data) => {
                output += data.toString();
            });

            pythonProcess.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });

            pythonProcess.on('close', (code) => {
                if (code === 0) {
                    try {
                        const result = JSON.parse(output.trim());
                        resolve(result);
                    } catch (e) {
                        reject(new Error(`Failed to parse Python output: ${output}`));
                    }
                } else {
                    reject(new Error(`Python process failed (code ${code}): ${errorOutput}`));
                }
            });

            pythonProcess.on('error', (error) => {
                reject(new Error(`Failed to start Python process: ${error.message}`));
            });
        });
    }

    async startCloning(token, sourceServerId, targetServerId, options) {
        return new Promise((resolve, reject) => {
            // Prepare options safely
            const safeOptions = {
                clone_roles: Boolean(options?.cloneRoles !== false),
                clone_categories: Boolean(options?.cloneCategories !== false),
                clone_text_channels: Boolean(options?.cloneChannels !== false),
                clone_voice_channels: Boolean(options?.cloneChannels !== false),
                clone_messages: Boolean(options?.cloneMessages === true),
                messages_limit: parseInt(options?.messagesLimit) || 0
            };

            // Create Python script
            const pythonScript = `
import asyncio
import sys
import json
import os

# Add current directory to path
sys.path.insert(0, '${__dirname.replace(/\\/g, '/')}')

try:
    from cloner import PythonCloner

    class SocketLogger:
        def __call__(self, message, level):
            data = {
                'message': str(message),
                'level': str(level),
                'clonerId': '${this.clonerId}'
            }
            print(f"LOG:{json.dumps(data)}", flush=True)

    async def clone():
        try:
            logger = SocketLogger()
            cloner = PythonCloner(logger)
            
            # Progress callback
            def progress_callback(progress):
                data = {
                    'progress': float(progress) * 100,
                    'clonerId': '${this.clonerId}'
                }
                print(f"PROGRESS:{json.dumps(data)}", flush=True)
            
            # Stats callback
            def stats_callback(stats):
                data = {
                    'clonerId': '${this.clonerId}',
                    'stats': stats
                }
                print(f"STATS:{json.dumps(data)}", flush=True)
            
            cloner.set_progress_callback(progress_callback)
            cloner.set_stats_callback(stats_callback)
            
            # Parameters
            token = '''${token.replace(/'/g, "\\'")}'''
            source_id = '${sourceServerId}'
            dest_id = '${targetServerId}'
            options_json = '''${JSON.stringify(safeOptions)}'''
            options = json.loads(options_json)
            
            print(f"LOG:{json.dumps({'message': f'Starting clone with options: {options}', 'level': 'INFO', 'clonerId': '${this.clonerId}'})}", flush=True)
            
            # Start cloning
            success = await cloner.start_clone(token, source_id, dest_id, options)
            
            # Final stats
            stats = cloner.get_stats()
            stats_data = {
                'clonerId': '${this.clonerId}',
                'stats': stats
            }
            print(f"STATS:{json.dumps(stats_data)}", flush=True)
            
            # Result
            result = {
                'success': success,
                'clonerId': '${this.clonerId}',
                'stats': stats
            }
            print(f"RESULT:{json.dumps(result)}", flush=True)
            
        except Exception as e:
            error_data = {
                'error': str(e),
                'clonerId': '${this.clonerId}'
            }
            print(f"ERROR:{json.dumps(error_data)}", flush=True)

    asyncio.run(clone())
    
except ImportError as e:
    error_data = {
        'error': f"Import error: {str(e)}",
        'clonerId': '${this.clonerId}'
    }
    print(f"ERROR:{json.dumps(error_data)}", flush=True)
except Exception as e:
    error_data = {
        'error': f"Unexpected error: {str(e)}",
        'clonerId': '${this.clonerId}'
    }
    print(f"ERROR:{json.dumps(error_data)}", flush=True)
            `;

            const pythonProcess = spawn('/home/codespace/.python/current/bin/python3', ['-c', pythonScript], {
                cwd: __dirname,
                env: { ...process.env, PYTHONPATH: __dirname }
            });

            let finalResult = null;

            pythonProcess.stdout.on('data', (data) => {
                const lines = data.toString().split('\n');
                
                for (const line of lines) {
                    if (line.trim() === '') continue;
                    
                    console.log('Processing line:', line); // Debug log
                    
                    try {
                        if (line.startsWith('LOG:')) {
                            const logData = JSON.parse(line.substring(4));
                            console.log('Emitting log:', logData); // Debug log
                            this.emitLog(logData.message, logData.level);
                        } else if (line.startsWith('PROGRESS:')) {
                            const progressData = JSON.parse(line.substring(9));
                            console.log('Emitting progress:', progressData); // Debug log
                            this.emitProgress(`Progress: ${progressData.progress.toFixed(1)}%`, progressData.progress);
                        } else if (line.startsWith('STATS:')) {
                            const statsData = JSON.parse(line.substring(6));
                            console.log('Emitting stats:', statsData); // Debug log
                            this.emitStats(statsData.stats);
                        } else if (line.startsWith('RESULT:')) {
                            finalResult = JSON.parse(line.substring(7));
                            console.log('Got final result:', finalResult); // Debug log
                        } else if (line.startsWith('ERROR:')) {
                            const errorData = JSON.parse(line.substring(6));
                            console.log('Emitting error:', errorData); // Debug log
                            this.emitError(errorData.error);
                        } else {
                            // Regular Python output
                            console.log('Python output:', line);
                        }
                    } catch (e) {
                        // Ignore parsing errors for non-JSON lines
                        console.log('Parse error for line:', line, 'Error:', e.message);
                    }
                }
            });

            pythonProcess.stderr.on('data', (data) => {
                const errorMessage = data.toString().trim();
                if (errorMessage) {
                    console.error('Python stderr:', errorMessage);
                    this.emitError(`Python Error: ${errorMessage}`);
                }
            });

            pythonProcess.on('close', (code) => {
                console.log(`Python process exited with code ${code}`);
                console.log('Final result:', finalResult);
                if (code === 0 && finalResult) {
                    console.log('Final result success:', finalResult.success);
                    if (finalResult.success) {
                        this.emitComplete(finalResult.stats);
                        resolve(true);
                    } else {
                        this.emitError('Cloning process reported failure');
                        resolve(false);
                    }
                } else if (code === 0) {
                    // Process completed successfully but no explicit result
                    this.emitLog('Cloning process completed', 'INFO');
                    resolve(true);
                } else {
                    this.emitError(`Python process exited with code ${code}`);
                    resolve(false);
                }
            });

            pythonProcess.on('error', (error) => {
                console.error('Python process error:', error);
                this.emitError(`Failed to start Python process: ${error.message}`);
                resolve(false);
            });
        });
    }

    emitProgress(message, progress) {
        console.log(`[WRAPPER] Emitting progress to Socket.IO: ${message}, ${progress}%`);
        this.io.emit('cloning-progress', {
            clonerId: this.clonerId,
            message: message,
            progress: progress
        });
    }

    emitLog(message, level = 'INFO') {
        console.log(`[WRAPPER] Emitting log to Socket.IO: [${level}] ${message}`);
        this.io.emit('cloning-log', {
            clonerId: this.clonerId,
            message: message,
            level: level,
            timestamp: new Date().toISOString()
        });
    }

    emitStats(stats) {
        console.log(`[WRAPPER] Emitting stats to Socket.IO:`, stats);
        this.io.emit('cloning-stats', {
            clonerId: this.clonerId,
            stats: stats
        });
    }

    emitError(message) {
        console.log(`[WRAPPER] Emitting error to Socket.IO: ${message}`);
        this.io.emit('cloning-error', {
            clonerId: this.clonerId,
            message: message
        });
    }

    emitComplete(stats) {
        console.log(`[WRAPPER] Emitting complete to Socket.IO:`, stats);
        this.io.emit('cloning-complete', {
            clonerId: this.clonerId,
            message: 'Cloning completed successfully!',
            stats: stats,
            success: true
        });
    }
}

module.exports = PythonClonerWrapper;
