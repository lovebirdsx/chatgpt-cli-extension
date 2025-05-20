# ChatGPT CLI 扩展手动安装指南

## 1. 安装 Chrome 扩展

1. 打开 Chrome 浏览器
2. 访问 `chrome://extensions/`
3. 打开右上角的"开发者模式"
4. 点击"加载已解压的扩展程序"
5. 选择本项目根目录

## 2. 注册 Native Messaging Host

1. 拷贝lovebird.chatgpt_native_host.sample.json，并重命名为 `native-host/lovebird.chatgpt_native_host.json` 文件
2. 更新 `path` 字段为本项目 `native-host/run-native-host.bat` 文件的绝对路径
3. 更新 `allowed_origins` 字段为本项目 `native-host/lovebird.chatgpt_native_host.json` 文件的绝对路径
4. 以管理员权限运行下列命令：

> 注意要将 `[完整路径]` 替换为实际的路径：

   ```
   reg add "HKCU\Software\Google\Chrome\NativeMessagingHosts\lovebird.chatgpt_native_host" /f
   reg add "HKCU\Software\Google\Chrome\NativeMessagingHosts\lovebird.chatgpt_native_host" /ve /t REG_SZ /d "[完整路径]\native-host\lovebird.chatgpt_native_host.json" /f
   ```

## 3. 添加到系统 PATH

1. 系统属性 → 高级 → 环境变量
2. 编辑用户变量中的"Path"
3. 添加本项目根目录的完整路径
4. 确认并保存

## 4. 测试安装

1. 重启 Chrome
2. 打开新的命令行窗口
3. 运行 `chatgpt-cli ping`
