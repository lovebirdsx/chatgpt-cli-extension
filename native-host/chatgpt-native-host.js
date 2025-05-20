const os = require('os');

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

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
    process.stderr.write(`NativeHost: ${message}\n`);
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
            // Try to read the exact amount needed if available, or whatever is there
            chunk = readableStream.read(numBytes - buffer.length); 
            if (chunk === null && (numBytes - buffer.length > 0) ) { // If exact read failed and we still need bytes
                chunk = readableStream.read(); // Read whatever is available
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
                // Stream ended before we could read numBytes
                fulfilled = true;
                cleanupListeners();
                if (numBytes === 4 && buffer.length === 0) { // Trying to read length, but EOF and nothing read
                    resolve(null); // Indicates clean EOF before length, for readMessage to handle
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
                    resolve(null); // Clean EOF before length
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
        
        // Initial attempt to read, in case data is already buffered or stream is synchronous
        onReadable(); 
    });
}


// Helper function to read a message from the extension
async function recvResponse() {
    try {
        const lengthBuffer = await readBytes(process.stdin, 4);
        
        if (lengthBuffer === null) {
            // This means stdin was closed before the 4-byte length could be read.
            // Python script exits with 0 in this case.
            logError("Stdin closed (EOF before message length). Exiting.");
            process.exit(0);
        }

        let messageLength;
        if (os.endianness() === 'LE') {
            messageLength = lengthBuffer.readUInt32LE(0);
        } else {
            messageLength = lengthBuffer.readUInt32BE(0);
        }

        if (messageLength === 0) {
            // Handle zero-length message content (JSON.parse("") will throw)
            try {
                return JSON.parse("");
            } catch (e) {
                const jsonError = new Error(`JSON decode error for empty message: ${e.message}`);
                jsonError.name = "JSONDecodeError"; // Mimic Python's error type
                throw jsonError;
            }
        }

        const contentBuffer = await readBytes(process.stdin, messageLength);
        // If readBytes resolved, contentBuffer should be valid and have messageLength bytes.
        // If EOF occurred during content read, readBytes would have rejected.
        
        const messageContent = contentBuffer.toString('utf-8');
        return JSON.parse(messageContent);

    } catch (error) {
        // Differentiate struct-like errors (from reading bytes/length) from JSONDecodeError
        if (error.message && (error.message.includes("Stdin ended") || error.message.includes("readUInt32"))) {
            const structError = new Error(`Struct error (likely stdin closed or malformed message length): ${error.message}`);
            structError.name = "StructError"; // Custom name to mimic Python's struct.error
            throw structError;
        }
        // JSON.parse errors are SyntaxError. We can re-wrap them to match Python's error name.
        if (error instanceof SyntaxError || (error.name === "JSONDecodeError" && error !== SyntaxError)) {
            const jsonError = new Error(`JSON decode error: ${error.message}`);
            jsonError.name = "JSONDecodeError";
            throw jsonError;
        }
        throw error; // Re-throw other errors
    }
}


async function main() {
    logError("Native host started.");

    try {
        while (true) {
            sendRequest({ action: 'ping' });
            const receivedMessage = await recvResponse();
            logError(`Received from extension: ${JSON.stringify(receivedMessage)}`);
            await delay(1000);
        }
    } catch (error) {
        if (error.name === "StructError") {
            logError(`Struct error (likely stdin closed or malformed message length): ${error.message}`);
            process.exit(1);
        } else if (error.name === "JSONDecodeError") {
            logError(`JSON decode error: ${error.message}`);
            process.exit(1);
        } else {
            logError(`An unexpected error occurred: ${error.message}${error.stack ? `\nStack: ${error.stack}` : ''}`);
            try {
                sendRequest({"status": "error", "error_message": String(error.message)});
            } catch (sendError) {
                logError(`Could not send error message to extension: ${sendError.message}`);
            }
            process.exit(1);
        }
    }
}

process.stdin.resume(); 
main().catch(err => {
    logError(`Critical unhandled error in main execution: ${err.message}${err.stack ? `\nStack: ${err.stack}` : ''}`);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    logError(`Unhandled Rejection at: ${promise}, reason: ${reason.stack || reason}`);
    process.exit(1); // Optional: exit on unhandled rejection
});

process.on('uncaughtException', (err) => {
    logError(`Uncaught Exception: ${err.stack || err}`);
    process.exit(1); // Mandatory: Node.js best practice is to exit on uncaught exception
});
