importScripts('websmile.js');

const api = {
    nusPipe: Module.cwrap("nuspipe", "number", []),
};


onmessage = function (e) {
    console.log('Message received from main script to nuspipe worker');

    if (e.data.spectrum_data )
    {
        console.log('Spectrum data received');
        /**
         * Save the spectrum data to the virtual file system
         */
        Module['FS_createDataFile']('/', 'half.ft2', e.data.spectrum_data, true, true, true);
        console.log('File created in virtual file system');

        /**
         * write the command file "arguments_nus_pipe.txt"
         */
        let command = "-in half.ft2 -fn SMILE -nDim 2 -maxIter 2048 -nSigma 2.5 -report 1 -sample nuslist -xApod SP -xQ1 0.5 -xQ2 0.95 -xQ3 1 -xELB 0.0 -xGLB 0.0 -xT 122 -xP0 -13 -xP1 180 -out 34.ft2 -ov";
        Module['FS_createDataFile']('/', 'arguments_nus_pipe.txt', command, true, true, true);

        /**
         * Write a file named "nuslist"
         */
        let nuslist = "0\n1\n2\n3\n4\n5\n6\n7\n8\n10\n11\n12\n14\n17\n19\n22\n25\n27\n30\n33\n35\n37\n39\n40\n44\n47\n49\n53\n55\n57\n60";
        Module['FS_createDataFile']('/', 'nuslist', nuslist, true, true, true);

        /**
         * Call the nusPipe function
         */
        api.nusPipe();

        /**
         * Read the output file "34.ft2" and send it back to the main thread
         */
        let output = FS.readFile('34.ft2', { encoding: 'binary' });
        console.log('Output file read from virtual file system');

        /**
         * Remove the files from the virtual file system
         */
        Module['FS_unlink']('half.ft2');
        Module['FS_unlink']('arguments_nus_pipe.txt');
        Module['FS_unlink']('34.ft2');
        Module['FS_unlink']('nuslist');

        postMessage({ spectrum_data: output });
    }

    console.log('Message processed by nusPipe worker');
}