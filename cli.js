const http = require('http');
const os = require('os');
const fs = require('fs');

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
                    error.statusCode = res.statusCode;
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
        console.error('Available commands: ping, sendMessage <text|--file <path>>, newChat, deleteChat, stop');
        process.exit(1);
    }

    const action = args[0];
    const commandPayload = { action };

    if (action === 'sendMessage') {
        // support reading message text directly or from file
        let text = '';
        const fileFlagIndex = args.indexOf('--file');
        if (fileFlagIndex !== -1) {
            if (args.length <= fileFlagIndex + 1) {
                console.error('Error: --file flag requires a file path.');
                process.exit(1);
            }
            const filePath = args[fileFlagIndex + 1];
            try {
                text = fs.readFileSync(filePath, 'utf8');
            } catch (e) {
                console.error(`Error: Failed to read file '${filePath}': ${e.message}`);
                process.exit(1);
            }
        } else {
            if (args.length < 2) {
                console.error('Error: sendMessage command requires a text argument or --file <path>.');
                console.error('Usage: node cli.js sendMessage "Your message here" OR node cli.js sendMessage --file path/to/file.txt');
                process.exit(1);
            }
            text = args.slice(1).join(' ');
        }
        commandPayload.text = text;

    } else if (!['ping', 'newChat', 'deleteChat', 'stop', 'selectModel1', 'selectModel2', 'selectModel3', 'selectModel4', 'selectModel5'].includes(action)) {
        console.error(`Error: Unknown command "${action}"`);
        console.error('Available commands: ping, sendMessage <text|--file <path>>, newChat, deleteChat, stop, selectModel1…selectModel5');
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
