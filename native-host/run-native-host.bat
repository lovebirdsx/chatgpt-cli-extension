@echo off
rem 将标准输出和标准错误都重定向到 native_host_log.txt 文件
node "%~dp0chatgpt-native-host.js" %* 2> "%~dp0native_host_errors.log"
