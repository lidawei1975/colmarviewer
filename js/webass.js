/**
 * This is a web worker that will be used to run the web assembly code
 */


importScripts('webdp.js');

const api = {
    version: Module.cwrap("version", "number", []),
    deep: Module.cwrap("deep", "number", []),
    simple_picking: Module.cwrap("simple_picking", "number", []),
    fid: Module.cwrap("fid", "number", []),
    phasing: Module.cwrap("phasing", "number", []),
    voigt_fit: Module.cwrap("voigt_fit", "number", []),
    peak_match: Module.cwrap("peak_match", "number", []),
    cubic_spline: Module.cwrap("cubic_spline", "number",[]),
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
     * If the message is file_data with only 1 file, this is the 2nd step of normal processing (indirect dimension)
     * after NUS reconstruction. Save the file to the virtual file system and run fid (-process indirect) function
     */
    if (e.data.file_data && e.data.file_data.length === 1) {
        console.log('File data received for indirect processing');

        Module['FS_createDataFile']('/', 'test_smile.ft2', e.data.file_data[0], true, true, true);
        let content = ' -first-only yes ';
        content = content.concat(' -zf-indirect ',e.data.zf_indirect);
        content = content.concat(' -apod-indirect ',e.data.apodization_indirect);
        content = content.concat(' -in test_smile.ft2 ');
        content = content.concat(' -process indirect ');
        content = content.concat(' -phase-in phase-correction.txt -di yes -di-indirect yes');
        content = content.concat(' -out test.ft2');

        /**
         * Write a file named "arguments_fid_2d.txt" to the virtual file system
         */
        Module['FS_createDataFile']('/', 'arguments_fid_2d.txt', content, true, true, true);

        /**
         * Write a file named "phase-correction.txt" to the virtual file system.
         * first two numbers are for direct dimension, which will be ignored
         */
        let phase_correction = '0 0 ';
        phase_correction=phase_correction.concat(e.data.phase_correction_indirect_p0.toString());
        phase_correction=phase_correction.concat(' ', e.data.phase_correction_indirect_p1.toString());
        Module['FS_createDataFile']('/', 'phase-correction.txt', phase_correction, true, true, true);

        console.log(content);

        api.fid();
        console.log('Finished running fid for indirect dimension of NUS spectrum');

        FS.unlink('test_smile.ft2');
        FS.unlink('arguments_fid_2d.txt');
        const phasing_data = FS.readFile('phase-correction.txt', { encoding: 'utf8' });
        FS.unlink('phase-correction.txt');
        const file_data = FS.readFile('test.ft2', { encoding: 'binary' });
        FS.unlink('test.ft2');
        console.log('File data read from virtual file system, type of file_data:', typeof file_data, ' and length:', file_data.length);
        postMessage({
            file_data: file_data,
            file_type: 'indirect', //direct,indirect,full
            phasing_data: phasing_data,
            processing_flag: e.data.processing_flag, //passthrough the processing flag
            spectrum_index: e.data.spectrum_index //for reprocessing only
        });
    }

    /**
     * If the message is file_data with 4 file, save them to the virtual file system and run direct dimension only processing.
     * (This is a NUS spectrum with 4 files: acquisition_file, acquisition_file2, fid_file and nuslist)
     */
    if (e.data.file_data && e.data.file_data.length === 4) {
        console.log('File data received for NUS processing');
        /**
         * Save the file data to the virtual file system
         */
        Module['FS_createDataFile']('/', 'acquisition_file', e.data.file_data[0], true, true, true);
        Module['FS_createDataFile']('/', 'acquisition_file2', e.data.file_data[1], true, true, true);
        Module['FS_createDataFile']('/', 'fid_file', e.data.file_data[2], true, true, true);
        Module['FS_createDataFile']('/', 'nuslist', e.data.file_data[3], true, true, true);

        /**
         * Write a file named "arguments_fid_2d.txt" to the virtual file system
         */
        let content = ' -first-only yes -aqseq '.concat(e.data.acquisition_seq,' -negative ',e.data.neg_imaginary);
        content = content.concat(' -zf '.concat(e.data.zf_direct));
        content = content.concat(' -apod '.concat(e.data.apodization_direct));
        content = content.concat(' -in fid_file acquisition_file acquisition_file2 none');
        content = content.concat(' -nus nuslist');
        content = content.concat(' -ext '.concat(e.data.extract_direct_from, ' ', e.data.extract_direct_to));
        content = content.concat(' -process direct -di yes -di-indirect no');
        content = content.concat(' -out test_direct.ft2');
        Module['FS_createDataFile']('/', 'arguments_fid_2d.txt', content, true, true, true);
        console.log(content);

        /**
         * Call fid function
         */
        this.postMessage({ stdout: "Running fid function to process direct dimension of NUS spectrum." });
        api.fid();
        console.log('Finished running fid for direct dimension of NUS spectrum');

        FS.unlink('acquisition_file');
        FS.unlink('acquisition_file2');
        FS.unlink('fid_file');
        FS.unlink('nuslist');
        FS.unlink('arguments_fid_2d.txt');
        const file_data = FS.readFile('test_direct.ft2', { encoding: 'binary' });
        console.log('File data read from virtual file system, type of file_data:', typeof file_data, ' and length:', file_data.length);
        FS.unlink('test_direct.ft2');
        postMessage({
            file_data: file_data,
            file_type: 'direct', //direct,direct-smile,full
            processing_flag: e.data.processing_flag, //passthrough the processing flag
            spectrum_index: e.data.spectrum_index //for reprocessing only
        });
    }

    /**
     * If the message is file_data with 3 files, save them to the virtual file system and run fid and phasing functions
     * return the processed data to the main script as file_data
     */
    if (e.data.file_data && e.data.file_data.length === 3) {
        console.log('File data received');
        /**
         * Save the file data to the virtual file system
         */
        Module['FS_createDataFile']('/', 'acquisition_file', e.data.file_data[0], true, true, true);
        Module['FS_createDataFile']('/', 'acquisition_file2', e.data.file_data[1], true, true, true);
        Module['FS_createDataFile']('/', 'fid_file', e.data.file_data[2], true, true, true);    
        console.log('File data saved to virtual file system');

        let apodization_indirect = e.data.apodization_indirect;

        /**
         * Write a file named "arguments_fid_phasing.txt" to the virtual file system
         * C++ program will read it to get "command line arguments"
         */
        let content = ' -first-only yes -aqseq '.concat(e.data.acquisition_seq,' -negative ',e.data.neg_imaginary);
        content = content.concat(' -zf '.concat(e.data.zf_direct,' -zf-indirect ',e.data.zf_indirect));
        content = content.concat(' -apod '.concat(e.data.apodization_direct));
        content = content.concat(' -apod-indirect '.concat(apodization_indirect));
        content = content.concat(' -ext '.concat(e.data.extract_direct_from, ' ', e.data.extract_direct_to));
        content = content.concat(' -out test0.ft2');
        content = content.concat(' -in fid_file acquisition_file acquisition_file2 none');

        /**
         * If both auto_direct and auto_indirect are false, add -phase-in phase-correction.txt to the content
         * and write a file named "phase-correction.txt" to the virtual file system. 
         * Later, we will skip the automatic phase correction program called "phasing"
         * 
         * Otherwise, add -phase-in none to the content. User input phase correction will be read by
         * another program called "phasing", which will run one dimension or both dimensions phase correction
         */
        if (e.data.auto_direct === false && e.data.auto_indirect === false) {
            content = content.concat(' -phase-in phase-correction.txt -di yes -di-indirect yes');
            let phase_correction = e.data.phase_correction_direct_p0.toString();
            phase_correction=phase_correction.concat(' ', e.data.phase_correction_direct_p1.toString());
            phase_correction=phase_correction.concat(' ', e.data.phase_correction_indirect_p0.toString());
            phase_correction=phase_correction.concat(' ', e.data.phase_correction_indirect_p1.toString());
            Module['FS_createDataFile']('/', 'phase-correction.txt', phase_correction, true, true, true);
        }
        else {
            content = content.concat(' -phase-in none -di no -di-indirect no');
        }
        Module['FS_createDataFile']('/', 'arguments_fid_2d.txt', content, true, true, true);
        console.log(content);

        /**
         * Run fid_phase function
         */
        this.postMessage({ stdout: "Running fid function" });
        api.version();
        api.fid();
        console.log('Finished running fid');


        /**
         * If we need to run phasing program
         */
        if (e.data.auto_direct === true || e.data.auto_indirect === true) {
            /**
             * Step 1, run phasing program, which will generate a file named "phase-correction.txt"
             */
            let content = ' -in test0.ft2 -out none -out-phase phase-correction.txt';
            if(e.data.auto_direct === true)
            {
                content = content.concat(' -user no ');
            }
            else 
            {
                content = content.concat(' -user yes -user-phase '.concat(e.data.phase_correction_direct_p0.toString(),' ',e.data.phase_correction_direct_p1.toString()));
            }
            if(e.data.auto_indirect === true)
            {
                content = content.concat(' -user-indirect no ');
            }
            else 
            {
                content = content.concat(' -user-indirect yes -user-phase-indirect '.concat(e.data.phase_correction_indirect_p0.toString(),' ',e.data.phase_correction_indirect_p1.toString()));
            }
            Module['FS_createDataFile']('/', 'arguments_phase_2d.txt', content, true, true, true);
            console.log(content);
            this.postMessage({ stdout: "Running phasing function" });
            api.phasing();
            console.log('Finished running phasing');
            FS.unlink('arguments_phase_2d.txt');

            /**
             * Check phase-correction.txt file and get the last number (indirect phase correction p1)
             */
            let phase_correction = FS.readFile('phase-correction.txt', { encoding: 'utf8' });
            let phase_correction_values = phase_correction.trim().split(/\s+/);
            /**
             * If indirect p1 is not 0, set indirect c parameter to 1.0
             * Otherwise, set it to 0.5
             */
            let c = 0.5;
            if (Math.abs(parseFloat(phase_correction_values[3])) > 20.0) {
                c = 1.0;
            }

            
            /**
             * Replace the c value in apodization_indirect with the new c value
             * apodization_indirect example: "SP begin 0.5 end 0.875 pow 2 elb 0 c 0.5"
             */
            let apodization_indirect_values = apodization_indirect.trim().split(/\s+/);
            /**
             * Find location of c in apodization_indirect_values
             */
            let c_index = apodization_indirect_values.indexOf('c');
            /**
             * Replace the value of c with the new value
             */
            apodization_indirect_values[c_index + 1] = c.toString();
            /**
             * Join the array back to a string
             */
            apodization_indirect = apodization_indirect_values.join(' ');

            /**
             * Step 2, run "fid" function again, with the new phase correction and write the new data to test.ft2
             */
            content = ' -first-only yes -aqseq '.concat(e.data.acquisition_seq,' -negative ',e.data.neg_imaginary);
            content = content.concat(' -zf '.concat(e.data.zf_direct,' -zf-indirect ',e.data.zf_indirect));
            content = content.concat(' -apod '.concat(e.data.apodization_direct));
            content = content.concat(' -apod-indirect '.concat(apodization_indirect));
            content = content.concat(' -ext '.concat(e.data.extract_direct_from, ' ', e.data.extract_direct_to));
            content = content.concat(' -out test.ft2');
            content = content.concat(' -in fid_file acquisition_file acquisition_file2 none');
            content = content.concat(' -phase-in phase-correction.txt -di yes -di-indirect yes');

            FS.unlink('test0.ft2');
            FS.unlink('arguments_fid_2d.txt');
            Module['FS_createDataFile']('/', 'arguments_fid_2d.txt', content, true, true, true);
            console.log(content);
            this.postMessage({ stdout: "Running fid function with automatic phase correction" });
            api.fid();
            console.log('Finished running fid with automatic phase correction');
        }
        else
        {
            /**
             * Rename the file test0.ft2 to test.ft2
             */
            FS.rename('test0.ft2', 'test.ft2');
        }


        /**
         * Remove the input files from the virtual file system
         * Read file test.ft2 from the virtual file system and send it back to the main script
         * And read the file phase-correction.txt and send it back to the main script
         * If auto, new phase correction will be saved in the file
         * IF not auto, the same phase correction (from input) will be saved in the file
         */
        FS.unlink('acquisition_file');
        FS.unlink('acquisition_file2');
        FS.unlink('fid_file');
        FS.unlink('arguments_fid_2d.txt');
        const file_data = FS.readFile('test.ft2', { encoding: 'binary' });
        const phasing_data = FS.readFile('phase-correction.txt', { encoding: 'utf8' });
        console.log('File data read from virtual file system, type of file_data:', typeof file_data, ' and length:', file_data.length);
        FS.unlink('test.ft2');
        FS.unlink('phase-correction.txt');
        postMessage({
            file_data: file_data,
            file_type: 'full', //direct,indirect,full
            phasing_data: phasing_data,
            apodization_indirect: apodization_indirect, //auto phasing may change the c value in apodization_indirect
            processing_flag: e.data.processing_flag, //passthrough the processing flag
            spectrum_index: e.data.spectrum_index //for reprocessing only
        });
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
         * else if flag is 1, add -method gaussian
         * else, add -method voigt_lorentz
         */
        if (e.data.flag === 0) {
            content = content.concat(' -method voigt ');
        }
        else if (e.data.flag === 1){
            content = content.concat(' -method gaussian ');
        }
        else {
            content = content.concat(' -method voigt-lorentz ');
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
        else if(e.data.flag === 1)
        {
            filename='recon_gaussian_hsqc.ft2';
        }
        else
        {
            filename='recon_voigt_lorentz_hsqc.ft2';
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
    /**
     * bin_data and bin_size are received. Run cubic_spline function to interpolate the data
     */
    else if(e.data.bin_data && e.data.bin_size) {
        console.log('Bin data and bin size received');

        /**
         * Write a file named "cubic_spline_infor.txt" to the virtual file system
         * which contain 4 numbers: xdim, ydim, xscale, yscale
         */
        let content = ' '.concat(e.data.bin_size[0],' ',e.data.bin_size[1],' ',e.data.bin_size[2],' ',e.data.bin_size[3]);
        Module['FS_createDataFile']('/', 'cubic_spline_info.txt', content, true, true, true);

        /**
         * Write a file named "cubic_spline_spect.bin" to the virtual file system, size is 4*xdim*ydim
         */
        Module['FS_createDataFile']('/', 'cubic_spline_spect.bin', e.data.bin_data, true, true, true);
        console.log('Bin data and infor saved to virtual file system');
        
        
        /**
         * Run cubic_spline function
         */
        this.postMessage({ stdout: "Running cubic_spline function" });
        api.cubic_spline();
        console.log('Finished running web assembly code of cubic spline interpolation');
        /**
         * Remove the input files from the virtual file system
         * Read file cubic_spline.txt, parse it and send it back to the main script
         */
        FS.unlink('cubic_spline_info.txt');
        FS.unlink('cubic_spline_spect.bin');
        let cubic_spline_data = FS.readFile('cubic_spline_new_spect.bin', { encoding: 'binary' });
        FS.unlink('cubic_spline_new_spect.bin');

        postMessage({
            cubic_spline_data: cubic_spline_data,
            ydim: e.data.bin_size[0]*e.data.bin_size[2],
            xdim: e.data.bin_size[1]*e.data.bin_size[3],
        });

    }
}




