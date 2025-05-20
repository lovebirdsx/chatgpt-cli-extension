const http = require('http');
const os = require('os');

const NATIVE_HOST_SERVER_ADDRESS = 'localhost';
const NATIVE_HOST_SERVER_PORT = 3333;
const NATIVE_HOST_SERVER_PATH = '/command';

async function sendCommand(commandPayload) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(commandPayload);

        const options = {
            hostname: NATIVE_HOST_SERVER_ADDRESS,
            port: NATIVE_HOST_SERVER_PORT,
            path: NATIVE_HOST_SERVER_PATH,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            }
        };

        const req = http.request(options, (res) => {
            let responseBody = '';
            res.setEncoding('utf8');

            res.on('data', (chunk) => {
                responseBody += chunk;
            });

            res.on('end', () => {
                try {
                    const parsedResponse = JSON.parse(responseBody);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(parsedResponse);
                    } else {
                        const error = new Error(
                            `Command failed with status ${res.statusCode}: ${parsedResponse.message || responseBody}`
                        );
                        error.statusCode = res.statusCode;
                        error.response = parsedResponse;
                        reject(error);
                    }
                } catch (e) {
                    const error = new Error(`Failed to parse JSON response: ${e.message}. Raw response: ${responseBody}`);
                    error.statusCode = res.statusCode; // Keep status code if available
                    reject(error);
                }
            });
        });

        req.on('error', (e) => {
            reject(new Error(`HTTP request to native host failed: ${e.message}`));
        });

        req.write(data);
        req.end();
    });
}

async function main() {
    const args = process.argv.slice(2);

    if (args.length === 0) {
        console.error('Error: No command provided.');
        console.error('Usage: node cli.js <command> [arguments...]');
        console.error('Available commands: ping, sendMessage <text>, newChat, deleteChat, stop');
        process.exit(1);
    }

    const action = args[0];
    const commandPayload = { action };

    // Add command-specific arguments
    if (action === 'sendMessage') {
        if (args.length < 2) {
            console.error('Error: sendMessage command requires a text argument.');
            console.error('Usage: node cli.js sendMessage "Your message here"');
            process.exit(1);
        }
        commandPayload.text = args.slice(1).join(' '); // Join all remaining args as the message
    } else if (!['ping', 'newChat', 'deleteChat', 'stop'].includes(action)) {
        console.error(`Error: Unknown command "${action}"`);
        console.error('Available commands: ping, sendMessage <text>, newChat, deleteChat, stop');
        process.exit(1);
    }

    try {
        console.log(`CLI: Sending command to native host: ${JSON.stringify(commandPayload)}`);
        const response = await sendCommand(commandPayload);
        console.log(`CLI: Received response:${os.EOL}${JSON.stringify(response, null, 2)}`);
    } catch (error) {
        console.error(`CLI: Error executing command "${action}":`);
        if (error.statusCode) {
            console.error(`  Status Code: ${error.statusCode}`);
        }
        console.error(`  Message: ${error.message}`);
        if (error.response) {
            console.error(`  Response Body: ${JSON.stringify(error.response, null, 2)}`);
        }
        process.exit(1);
    }
}

main();