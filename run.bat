@echo off
call npm install
mkdir log
mkdir orders
call node ali-export.js
::call node ali-export.js > ali-export.txt 2>&1