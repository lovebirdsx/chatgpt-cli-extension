const http = require('http');
const os = require('os');

const HTTP_PORT = 3333; // Port for the HTTP server

// --- START: Functions from your original chatgpt-native-host.js ---
// Ensure these functions (sendRequest, logError, readBytes, recvResponse)
// are exactly as you provided them in the prompt.
// I'm including their signatures here for completeness, but use your definitions.

// Helper function to send a message to the extension
// e.g. { action: "sendMessage", text: "Hello, ChatGPT!" }
function sendRequest(command) {
    const contentBuffer = Buffer.from(JSON.stringify(command), 'utf-8');
    const lengthBuffer = Buffer.alloc(4);

    if (os.endianness() === 'LE') {
        lengthBuffer.writeUInt32LE(contentBuffer.length, 0);
    } else {
        lengthBuffer.writeUInt32BE(contentBuffer.length, 0);
    }

    process.stdout.write(lengthBuffer);
    process.stdout.write(contentBuffer);
}

// Helper function to log messages to stderr
function logError(message) {
    const timestamp = new Date().toLocaleString('default', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
    process.stderr.write(`[${timestamp}]: ${message}${os.EOL}`);
}

// Helper function to read a specific number of bytes from a readable stream
async function readBytes(readableStream, numBytes) {
    return new Promise((resolve, reject) => {
        if (numBytes === 0) {
            resolve(Buffer.alloc(0));
            return;
        }

        let buffer = Buffer.alloc(0);
        let fulfilled = false;

        function cleanupListeners() {
            readableStream.removeListener('readable', onReadable);
            readableStream.removeListener('end', onEnd);
            readableStream.removeListener('error', onError);
        }

        function onReadable() {
            if (fulfilled) return;
            let chunk;
            chunk = readableStream.read(numBytes - buffer.length);
            if (chunk === null && (numBytes - buffer.length > 0)) {
                chunk = readableStream.read();
            }

            if (chunk) {
                buffer = Buffer.concat([buffer, chunk]);
            }

            if (buffer.length >= numBytes) {
                fulfilled = true;
                cleanupListeners();
                const resultBuffer = buffer.subarray(0, numBytes);
                const remainingBuffer = buffer.subarray(numBytes);
                if (remainingBuffer.length > 0) {
                    readableStream.unshift(remainingBuffer);
                }
                resolve(resultBuffer);
            } else if (readableStream.readableEnded && buffer.length < numBytes) {
                fulfilled = true;
                cleanupListeners();
                if (numBytes === 4 && buffer.length === 0) {
                    resolve(null);
                } else {
                    reject(new Error(`Stdin ended unexpectedly. Expected ${numBytes} bytes, got ${buffer.length}.`));
                }
            }
        }

        function onEnd() {
            if (fulfilled) return;
            if (buffer.length < numBytes) {
                fulfilled = true;
                cleanupListeners();
                if (numBytes === 4 && buffer.length === 0) {
                    resolve(null);
                } else {
                    reject(new Error(`Stdin ended. Expected ${numBytes} bytes, got ${buffer.length}.`));
                }
            }
        }

        function onError(err) {
            if (fulfilled) return;
            fulfilled = true;
            cleanupListeners();
            reject(err);
        }

        readableStream.on('readable', onReadable);
        readableStream.on('end', onEnd);
        readableStream.on('error', onError);

        onReadable();
    });
}


// Helper function to read a message from the extension
async function recvResponse() {
    try {
        const lengthBuffer = await readBytes(process.stdin, 4);

        if (lengthBuffer === null) {
            logError("Stdin closed (EOF before message length). Exiting.");
            // This situation means Chrome closed the pipe.
            // We should probably exit the native host so the .bat file can restart it.
            process.exit(1);
        }

        let messageLength;
        if (os.endianness() === 'LE') {
            messageLength = lengthBuffer.readUInt32LE(0);
        } else {
            messageLength = lengthBuffer.readUInt32BE(0);
        }

        if (messageLength === 0) {
            try {
                return JSON.parse("");
            } catch (e) {
                const jsonError = new Error(`JSON decode error for empty message: ${e.message}`);
                jsonError.name = "JSONDecodeError";
                throw jsonError;
            }
        }

        const contentBuffer = await readBytes(process.stdin, messageLength);
        const messageContent = contentBuffer.toString('utf-8');
        return JSON.parse(messageContent);

    } catch (error) {
        if (error.message && (error.message.includes("Stdin ended") || error.message.includes("readUInt32"))) {
            const structError = new Error(`Struct error (likely stdin closed or malformed message length): ${error.message}`);
            structError.name = "StructError";
            throw structError;
        }
        if (error instanceof SyntaxError || (error.name === "JSONDecodeError" && error !== SyntaxError)) {
            const jsonError = new Error(`JSON decode error: ${error.message}`);
            jsonError.name = "JSONDecodeError";
            throw jsonError;
        }
        throw error;
    }
}


let isProcessingExtensionRequest = false;
const requestQueue = []; // Queue for incoming HTTP requests

// Function to process a single command with the extension
// Ensures only one command is sent to the extension at a time
async function processCommandWithExtension(commandFromCli) {
    // This function will be called by the HTTP server for each CLI request.
    // It will queue if another request is already being processed with the extension.
    return new Promise((resolve, reject) => {
        const task = async () => {
            isProcessingExtensionRequest = true;
            try {
                logError(`Sending to extension: ${JSON.stringify(commandFromCli)}`);
                sendRequest(commandFromCli); // Send to Chrome via stdout

                const responseFromExtension = await recvResponse(); // Receive from Chrome via stdin
                logError(`Received from extension: ${JSON.stringify(responseFromExtension)}`);
                resolve(responseFromExtension);
            } catch (error) {
                logError(`Error during extension communication: ${error.message} ${error.stack || ''}`);
                // If recvResponse throws StructError, it means the extension connection is likely gone.
                if (error.name === "StructError") {
                    logError("StructError in native messaging pipe. Exiting native host to allow restart.");
                    // Exit the process so the .bat can restart it, hoping to re-establish the pipe.
                    process.exit(1);
                }
                reject(error);
            } finally {
                isProcessingExtensionRequest = false;
                // Process next in queue if any
                if (requestQueue.length > 0) {
                    const nextTask = requestQueue.shift();
                    nextTask(); // Execute the next task
                }
            }
        };

        if (isProcessingExtensionRequest) {
            logError("Extension communication busy, queuing request.");
            requestQueue.push(task); // Add the task to the queue
        } else {
            task(); // Execute immediately
        }
    });
}

function main() {
    // Create and start the HTTP server
    const server = http.createServer(async (req, res) => {
        if (req.method === 'POST' && req.url === '/command') {
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString(); // Convert Buffer to string
            });
            req.on('end', async () => {
                try {
                    const commandFromCli = JSON.parse(body);
                    logError(`HTTP Server: Received command from CLI: ${JSON.stringify(commandFromCli)}`);

                    // Process the command with the extension (this handles queuing)
                    const responseFromExtension = await processCommandWithExtension(commandFromCli);

                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify(responseFromExtension));

                } catch (error) {
                    logError(`HTTP Server: Error processing request: ${error.message} ${error.stack || ''}`);
                    res.writeHead(500, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        status: "error",
                        message: `Native host internal error: ${error.message}`,
                        details: error.name // e.g., StructError, JSONDecodeError
                    }));
                }
            });
        } else {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: "error", message: "Not Found. Send POST to /command" }));
        }
    });

    // Start listening for stdin data (for native messaging with Chrome)
    process.stdin.resume();

    // Start the HTTP server
    server.listen(HTTP_PORT, () => {
        logError(`Native host HTTP server started and listening on http://localhost:${HTTP_PORT}`);
        // The old main() loop that sent pings is removed.
        // The host is now driven by incoming HTTP requests.
    });
    
    process.stdin.on('end', () => {
        logError('STDIN closed, exiting native host.');
        server.close(() => process.exit(0));
    });

    process.stdin.on('close', () => {
        logError('STDIN close event triggered, exiting native host.');
        server.close(() => process.exit(0));
    });

    // Graceful shutdown
    process.on('SIGINT', () => {
        logError('SIGINT received. Shutting down HTTP server and native host.');
        server.close(() => {
            logError('HTTP server closed.');
            process.exit(0);
        });
        // Give it a moment to close, then force exit if needed
        setTimeout(() => {
            process.exit(0);
        }, 2000);
    });

    process.on('unhandledRejection', (reason, promise) => {
        logError(`Unhandled Rejection at: ${promise}, reason: ${reason.stack || reason}`);
    });

    process.on('uncaughtException', (err) => {
        logError(`Uncaught Exception: ${err.stack || err}`);
        process.exit(1);
    });

    logError("Native host script started.");
}

main();
