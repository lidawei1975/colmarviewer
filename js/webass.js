/**
 * This is a web worker that will be used to run the web assembly code
 */


importScripts('webdp.js');

const api = {
    version: Module.cwrap("version", "number", []),
    deep: Module.cwrap("deep", "number", []),
    fid_phase: Module.cwrap("fid_phase", "number", []),
    voigt_fit: Module.cwrap("voigt_fit", "number", []),
};

/**
 * Redirect the stdout and stderr to postMessage
 */
Module['print'] = function (text) {
    postMessage({ stdout: text });
};
out = Module['print'];

onmessage = function (e) {
    console.log('Message received from main script');

    /**
     * If the message is file_data, save them to the virtual file system and run fid_phase function
     * return the processed data to the main script as file_data
     */
    if (e.data.file_data) {
        console.log('File data received');
        /**
         * Save the file data to the virtual file system
         */
        Module['FS_createDataFile']('/', 'acquisition_file', e.data.file_data[0], true, true, true);
        Module['FS_createDataFile']('/', 'acquisition_file2', e.data.file_data[1], true, true, true);
        Module['FS_createDataFile']('/', 'fid_file', e.data.file_data[2], true, true, true);    
        console.log('File data saved to virtual file system');

        /**
         * Write a file named "arguments_fid_phasing.txt" to the virtual file system
         * C++ program will read it to get "commandline arguments"
         */
        let content = ' -first_only yes -aqseq '.concat(e.data.acquisition_seq,' -negative ',e.data.neg_imaginary);
        content = content.concat(' -zf '.concat(e.data.zf_direct,' -zf_indirect ',e.data.zf_indirect));
        Module['FS_createDataFile']('/', 'arguments_fid_phasing.txt', content, true, true, true);
        console.log(content);

        /**
         * Run fid_phase function
         */
        this.postMessage({ stdout: "Running fid_phase function" });
        api.version();
        api.fid_phase();
        console.log('Finished running web assembly code');
        /**
         * Remove the input files from the virtual file system
         * Read file test.ft2 from the virtual file system and send it back to the main script
         */
        FS.unlink('acquisition_file');
        FS.unlink('acquisition_file2');
        FS.unlink('fid_file');
        // FS.unlink('arguments_fid_phasing.txt');
        const file_data = FS.readFile('test.ft2', { encoding: 'binary' });
        const phasing_data = FS.readFile('phase-correction.txt', { encoding: 'utf8' });
        console.log('File data read from virtual file system, type of file_data:', typeof file_data, ' and length:', file_data.length);
        FS.unlink('test.ft2');
        FS.unlink('phase-correction.txt');
        postMessage({ file_data: file_data, phasing_data: phasing_data});
    }

    /**
     * If the message contains both spectrum_data and picked_peaks, call voigt_fit function
     */
    else if (e.data.spectrum_data && e.data.picked_peaks) {
        console.log('Spectrum data and picked peaks received');
        /**
         * Save the spectrum data and picked peaks to the virtual file system
         */
        Module['FS_createDataFile']('/', 'hsqc.ft2', e.data.spectrum_data, true, true, true);
        /**
         * Voigt fit function requires the picked peaks to like this:
         * {"picked_peaks": [{"cs_x": 1.0, "cs_y": 2.0, "index": 1287.6}, ...] }
         * but what we receive is just the array of picked peaks
         */
        let picked_peaks = { picked_peaks: e.data.picked_peaks};
        Module['FS_createDataFile']('/', 'peaks.json', JSON.stringify(picked_peaks), true, true, true);

        /**
         * Write a file named "argument_voigt_fit.txt" to the virtual file system
         * save -noise_level, -scale and -scale2 
         */
        let content = ' -noise_level '.concat(e.data.noise_level,' -scale ',e.data.scale,' -scale2 ',e.data.scale2);
        content = content.concat(' -combine ', e.data.combine_peak_cutoff);
        content = content.concat(' -maxround ', e.data.maxround);
        

        /**
         * If flag is 0, add -method voigt to the content
         * else add -method gaussian
         */
        if (e.data.flag === 0) {
            content = content.concat(' -method voigt ');
        }
        else {
            content = content.concat(' -method gaussian ');
        }
        console.log(content);

        Module['FS_createDataFile']('/', 'argument_voigt_fit.txt', content, true, true, true);

        console.log('Spectrum data and picked peaks saved to virtual file system');
        /**
         * Run voigt_fit function
         */
        this.postMessage({ stdout: "Running voigt_fit function" });
        api.voigt_fit();
        console.log('Finished running web assembly code');
        /**
         * Remove the input files from the virtual file system
         * Read file peaks.json, parse it and send it back to the main script
         */
        FS.unlink('hsqc.ft2');
        FS.unlink('peaks.json');
        FS.unlink('argument_voigt_fit.txt');
        let r = FS.readFile('fitted.json', { encoding: 'utf8' });
        let peaks = JSON.parse(r);
        FS.unlink('fitted.json');

        /**
         * If the flag is 0, read the file recon_voigt_hsqc.ft2 
         * else read the file recon_gaussian_hsqc.ft2
        */
        let filename;
        if(e.data.flag === 0)
        {
            filename='recon_voigt_hsqc.ft2';
        }
        else
        {
            filename='recon_gaussian_hsqc.ft2';
        }

        const file_data = FS.readFile(filename, { encoding: 'binary' });
        console.log('File data read from virtual file system, type of file_data:', typeof file_data, ' and length:', file_data.length);
        FS.unlink(filename);
        postMessage({
            fitted_peaks: peaks,
            spectrum_index: e.data.spectrum_index,
            recon_spectrum: file_data,
            scale: e.data.scale,
            scale2: e.data.scale2
        });
    }

    /**
     * If the message contains spectrum_data without picked_peaks call deep function
     */
    else if (e.data.spectrum_data )
    {
        console.log('Spectrum data received');
        /**
         * Save the spectrum data to the virtual file system
         */
        Module['FS_createDataFile']('/', 'test.ft2', e.data.spectrum_data, true, true, true);

        /**
         * Write a file named "arguments_dp.txt" to the virtual file system
         * save -noise_level, -scale and -scale2
         */
        let content = ' -noise_level '.concat(e.data.noise_level,' -scale ',e.data.scale,' -scale2 ',e.data.scale2);
        Module['FS_createDataFile']('/', 'arguments_dp.txt', content, true, true, true);

        console.log('Spectrum data saved to virtual file system');
        /**
         * Run deep function
         */
        this.postMessage({ stdout: "Running deep function" });
        api.deep();
        console.log('Finished running web assembly code');
        /**
         * Remove the input file from the virtual file system
         * Read file peaks.json, parse it and send it back to the main script
         */
        FS.unlink('test.ft2');
        let r=FS.readFile('peaks.json', {encoding: 'utf8'});
        let peaks=JSON.parse(r);
        FS.unlink('peaks.json');
        FS.unlink('arguments_dp.txt');
        postMessage({
            peaks: peaks,
            spectrum_index: e.data.spectrum_index,
            scale: e.data.scale,
            scale2: e.data.scale2
        });
    }
}




