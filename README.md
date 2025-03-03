# COLMARvista
Web based NMR spectra viewer.

# Installation
Download all files/folders into one location or visit as a web server.

# Usage
Visit the web server https://lidawei1975.github.io/colmarviewer/ in your browser. COLMAR Viewer is a static web server, which means all your data stays on your computer; the server does not take any input or uploads from you.

Alternatively, you can download the program and open index.html in your browser. This program uses WebWorker and WebAssembly, which cannot be loaded automatically when run locally unless you modify your browser settings.  

For Google Chrome:  
1. Right-click the Google Chrome icon and select "Properties."  
2. In the "Target" field, add the following flag to the end of the existing path: --allow-file-access-from-files.  
   Your modified "Target" field should look like this:  
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --allow-file-access-from-files  
3. Click "Apply" or "OK."  
4. Restart Google Chrome and load the program.  

For Mozilla Firefox:  
1. Enter about:config in the browser's address bar.  
2. Search for security.fileuri.strict_origin_policy in the configuration page.  
3. Change its value to false.  

For Safari:  
1. Open Safari settings and go to the "Advanced" tab.  
2. Check the box for "Show Develop menu in menu bar."  
3. In the menu bar, click "Develop" and select "Disable Local File Restrictions."  

Warning: Modifying these settings poses a security risk. Do not load any local files unless you are certain they are safe.

# Functions

Please refer to the wiki page https://github.com/lidawei1975/colmarviewer/wiki for user instructions. 

# Bug report or suggestions

Please start a new discussion at https://github.com/lidawei1975/colmarvista/discussions

              

