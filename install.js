const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

function isAdmin() {
    try {
        execSync('net session', { stdio: 'ignore' });
        return true;
    } catch (e) {
        return false;
    }
}

function winCmd(cmd) {
    console.log(`> ${cmd}`);
    try {
        const out = execSync(cmd, { stdio: 'pipe', encoding: 'utf-8' });
        if (out) console.log(out);
    } catch (e) {
        console.error(e.stdout?.toString(), e.stderr?.toString());
        process.exit(1);
    }
}

function writeNativeManifestFile(nativeManifest, extensionId) {
    const manifest = {
        name: 'lovebird.chatgpt_native_host',
        description: 'ChatGPT Native Messaging Host for Lovebird',
        path: path.join(__dirname, 'native-host', 'run-native-host.bat'),
        type: 'stdio',
        allowed_origins: [
            `chrome-extension://${extensionId}/`
        ]
    };
    
    fs.writeFileSync(nativeManifest, JSON.stringify(manifest, null, 4));
}

function main() {
    if (process.platform !== 'win32') {
        console.error('⚠️  This script only supports Windows. Please run it on Windows.');
        process.exit(1);
    }
    
    if (!isAdmin()) {
        console.error('⚠️  Please run this script with administrator privileges.');
        return;
    }

    const args = process.argv.slice(2);
    if (args.length <= 0) {
        console.error('⚠️  Please provide the extension ID.');
        console.log('Usage: install.bat <plugin_id>');
        process.exit(1);
    }
    
    console.log('✅ Running as administrator');

    const rootDir = path.resolve(__dirname);
    console.log('🔍 Root directory:', rootDir);

    // --------- 1. Write Native Messaging Host configuration ---------
    const extensionId = args[0];
    const nativeManifest = path.join(__dirname, 'native-host', 'lovebird.chatgpt_native_host.json');
    writeNativeManifestFile(nativeManifest, extensionId);
    console.log('✅ Native Messaging Host configuration file written.');
    
    // --------- 2. Register Native Messaging Host ---------
    // Registry location: HKCU\Software\Google\Chrome\NativeMessagingHosts\<host name>
    const hostName = 'lovebird.chatgpt_native_host';
    const regKey = `HKCU\\Software\\Google\\Chrome\\NativeMessagingHosts\\${hostName}`;
    winCmd(`reg add "${regKey}" /f`);
    winCmd(`reg add "${regKey}" /ve /t REG_SZ /d "${nativeManifest.replace(/\\\\/g, '/')}" /f`);

    console.log('✅ Native Messaging Host registered.');

    // --------- 3. Add the directory containing chatgpt-cli.bat to PATH ---------
    // Here we add the extension's root directory to PATH because the .bat file is in the root.
    // Note: setx can only modify the user's environment variables, and the changes will appear in new terminals.
    const currentPath = process.env.PATH || '';
    if (!currentPath.split(';').includes(rootDir)) {
        // use powershell to set the PATH variable, setx is not reliable when path is too long
        winCmd(`powershell -Command "[Environment]::SetEnvironmentVariable('PATH', [Environment]::GetEnvironmentVariable('PATH', 'User') + ';${rootDir}', 'User')"`);
        console.log('✅ Extension root directory added to user\'s PATH. Reopen the terminal to use chatgpt-cli.');
    } else {
        console.log('ℹ️ Extension root directory is already in PATH, no need to add it again.');
    }

    console.log('\n🎉 Installation complete! Please:');
    console.log(' 1) Restart Chrome;');
    console.log(' 2) Reopen the command line window;');
    console.log(' 3) Run `chatgpt-cli ping` to test.');
    
    // Pause to allow the user to see the output
    require('child_process').spawnSync('pause', { shell: true, stdio: 'inherit' });
}

main();