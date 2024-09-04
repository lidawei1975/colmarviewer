# COLMAR Viewer
Web based NMR spectra viewer.

# Installation
Download all files/folders into one location or visit as a web server.

# Usage
Visit the web server https://lidawei1975.github.io/colmarviewer/ in your browser. COLMAR Viewer is a static web server, which means all your data stays on your computer; the server does not take any input or uploads from you.

Alternatively, you can download the program and open index.html in your browser. This program utilizes WebWorker and WebAssembly, which can't be loaded automatically when run locally unless you add a required command line to Google Chrome. To do so, right-click on the Google Chrome icon, select "Properties," and add --allow-file-access-from-files to the end of the "Target" field, so it looks like this: "C:\Program Files\Google\Chrome\Application\chrome.exe" --allow-file-access-from-files. Then, click "Apply" or "OK." After this, click the Google Chrome icon to run the browser before loading the program. Unfortunately, adding this option poses a security risk. Therefore, do NOT load any local files unless you are sure they are safe.

# Functions

For spectra visualization, users can upload 2D NMR spectra in .ft2 format, adjust noise levels, and manage contour levels. The tool allows zooming, spectrum reordering, and displaying cross-sections.

For running Deep Picker and Voigt Fitter, users can perform peak picking, edit picked peaks, and run peak fitting. Reconstructed spectra can be added or removed, and peak lists can be downloaded or hidden.

For pseudo-3D workflows, users upload the first plane, adjust contour levels, optimize peaks, and then upload remaining planes for fitting. Optional assignments can be uploaded, and results can be downloaded.

To run the COLMAR Viewer locally, special settings must be applied to Google Chrome, though it involves security risks.

An experimental feature allows processing Bruker time-domain data (still under development).

              

