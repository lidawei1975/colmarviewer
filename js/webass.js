/**
 * This is a web worker that will be used to run the web assembly code
 */


importScripts('webdp.js');

const api = {
    version: Module.cwrap("version", "number", []),
    deep: Module.cwrap("deep", "number", []),
    simple_picking: Module.cwrap("simple_picking", "number", []),
    fid_phase: Module.cwrap("fid_phase", "number", []),
    voigt_fit: Module.cwrap("voigt_fit", "number", []),
    peak_match: Module.cwrap("peak_match", "number", []),
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
        let content = ' -out fitted.json fitted.tab -noise_level '.concat(e.data.noise_level,' -scale ',e.data.scale,' -scale2 ',e.data.scale2);
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
        let peaks = JSON.parse(FS.readFile('fitted.json', { encoding: 'utf8' }));
        let peaks_tab = FS.readFile('fitted.tab', { encoding: 'utf8' });
        FS.unlink('fitted.json');
        FS.unlink('fitted.tab');

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
            fitted_peaks_tab: peaks_tab, //peaks_tab is a very long string with multiple lines (in nmrPipe tab format)
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
        if(e.data.flag === 0)
        {
            let content = ' -noise_level '.concat(e.data.noise_level,' -scale ',e.data.scale,' -scale2 ',e.data.scale2);
            Module['FS_createDataFile']('/', 'arguments_dp.txt', content, true, true, true);
        }
        else 
        {
            let content = ' -out peaks.json -noise_level '.concat(e.data.noise_level,' -scale ',e.data.scale);   
            Module['FS_createDataFile']('/', 'arguments_simple_picking.txt', content, true, true, true);
        }

        console.log('Spectrum data saved to virtual file system');
        /**
         * Run deep function
         */
        if(e.data.flag === 0){
            this.postMessage({ stdout: "Running deep function" });
            api.deep();
        }
        else{
            this.postMessage({ stdout: "Running simple picking" });
            api.simple_picking();
        }
        console.log('Finished running web assembly code');
        /**
         * Remove the input file from the virtual file system
         * Read file peaks.json, parse it and send it back to the main script
         */
        FS.unlink('test.ft2');
        let r=FS.readFile('peaks.json', {encoding: 'utf8'});
        let peaks=JSON.parse(r);
        FS.unlink('peaks.json');
        if(e.data.flag === 0){
            FS.unlink('arguments_dp.txt');
        }
        else {
            FS.unlink('arguments_simple_picking.txt');
        }
        postMessage({
            peaks: peaks,
            spectrum_index: e.data.spectrum_index,
            scale: e.data.scale,
            scale2: e.data.scale2
        });
    }

    /**
     * initial_peaks and all_files are received, run pseudo-3D fitting using api.voigt_fit
     */
    else if (e.data.initial_peaks && e.data.all_files) {
        console.log('Initial peaks and all files received');
        /**
         * Save the initial peaks to the virtual file system
         * voigt_fit program suppose to read the json format peak file as
         * {"picked_peaks": [{"cs_x": 1.0, "cs_y": 2.0, "index": 1287.6, sigmax: 1, sigmay: 1}, ...] }
         */
        let picked_peaks = { picked_peaks: e.data.initial_peaks};
        Module['FS_createDataFile']('/', 'peaks.json', JSON.stringify(picked_peaks), true, true, true);

        /**
         * Save all files in e.data.all_files to the virtual file system,
         * name them as test1.ft2, test2.ft2, test3.ft2, ...
         */
        for (let i = 0; i < e.data.all_files.length; i++) {
            Module['FS_createDataFile']('/', 'test'.concat(i + 1, '.ft2'), e.data.all_files[i], true, true, true);
        }

        /**
         * Write a file named "arguments_pseudo_3D.txt" to the virtual file system
         * save -noise_level, -scale and -scale2
         */
        let content = ' -v 0 -recon no -out fitted.tab fitted.json -noise_level '.concat(e.data.noise_level,' -scale ',e.data.scale,' -scale2 ',e.data.scale2);
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
        /**
         * Add "-in test1.ft2 test2.ft2 test3.ft2 ..." to the content
         */
        content = content.concat(' -in ');
        for (let i = 0; i < e.data.all_files.length; i++) {
            content = content.concat(' test'.concat(i + 1, '.ft2 '));
        }

        console.log(content);

        Module['FS_createDataFile']('/', 'argument_voigt_fit.txt', content, true, true, true);
        console.log('Initial peaks and spectral files saved to virtual file system');


        /**
         * Run voigt_fit function
         */
        this.postMessage({ stdout: "Running pseudo-3D fitting" });
        api.voigt_fit();
        console.log('Finished running web assembly code');
        /**
         * Remove the input file from the virtual file system
         * Read file peaks.json, parse it and send it back to the main script
         */
        FS.unlink('peaks.json');
        FS.unlink('argument_voigt_fit.txt');
        for(let i=0; i<e.data.all_files.length; i++)   {
            FS.unlink('test'.concat(i+1, '.ft2'));
        }

        let peaks_tab = FS.readFile('fitted.tab', { encoding: 'utf8' });
        let peaks = JSON.parse(FS.readFile('fitted.json', { encoding: 'utf8' }));
        FS.unlink('fitted.tab');
        FS.unlink('fitted.json');

        /**
         * Read the file recon_voigt_hsqc.ft2 
         */
        postMessage({
            pseudo3d_fitted_peaks: peaks, 
            pseudo3d_fitted_peaks_tab: peaks_tab, //peaks_tab is a very long string with multiple lines (in nmrPipe tab format)
        });
    }

    /**
     * assignment and fitted_peaks_tab are received. Run api.peak_match to transfer the assignment to the fitted peaks
     */
    else if(e.data.assignment && e.data.fitted_peaks_tab) {
        console.log('Assignment and fitted peaks tab received');
        /**
         * Save the assignment to the virtual file system
         */
        Module['FS_createDataFile']('/', 'assignment.list', e.data.assignment, true, true, true);

        /**
         * Save the fitted_peaks_tab to the virtual file system
         */
        Module['FS_createDataFile']('/', 'fitted_peaks_tab.tab', e.data.fitted_peaks_tab, true, true, true);

        /**
         * Write a file named "arguments_peak_match.txt" to the virtual file system
         */
        let content = ' -in2 fitted_peaks_tab.tab -in1 assignment.list -out assigned.tab -out-ass assignment.txt';
        Module['FS_createDataFile']('/', 'arguments_peak_match.txt', content, true, true, true);
        console.log(content);

        console.log('Assignment and fitted peaks tab saved to virtual file system');
        /**
         * Run peak_match function
         */
        this.postMessage({ stdout: "Running peak_match function" });
        api.peak_match();
        console.log('Finished running web assembly code of assignment transfer');
        /**
         * Remove the input files from the virtual file system
         * Read file matched_peaks.tab, parse it and send it back to the main script
         */
        FS.unlink('assignment.list');
        FS.unlink('fitted_peaks_tab.tab');
        FS.unlink('arguments_peak_match.txt');
        let matched_peaks_tab = FS.readFile('assigned.tab', { encoding: 'utf8' });
        let assignment = FS.readFile('assignment.txt',{ encoding: 'utf8' });
        FS.unlink('assigned.tab');
        FS.unlink('assignment.txt');
        postMessage({
            matched_peaks_tab: matched_peaks_tab,
            assignment: assignment,
        });
    }
}




