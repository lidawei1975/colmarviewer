
/**
 * Make sure we can load WebWorker
*/

var my_contour_worker, webassembly_worker;

try {
    my_contour_worker = new Worker('./js/contour.js');
    webassembly_worker = new Worker('./js/webass.js');
}
catch (err) {
    console.log(err);
    if (typeof (my_contour_worker) === "undefined" || typeof (webassembly_worker) === "undefined") {
        alert("Failed to load WebWorker, probably due to browser incompatibility. Please use a modern browser, if you run this program locally, please read the instructions titled 'How to run COLMAR Viewer locally'");
    }
}


var main_plot = null; //hsqc plot object
var tooldiv; //tooltip div (used by myplot1_new.js, this is not a good practice, but it is a quick fix)
var current_spectrum_index_of_peaks = -1; //index of the spectrum that is currently showing peaks, -1 means none, -2 means pseudo 3D fitted peaks
var current_flag_of_peaks = 'picked'; //flag of the peaks that is currently showing, 'picked' or 'fitted
var pseudo3d_fitted_peaks_tab = ""; // pseudo 3D fitted peaks, a long multi-line string 
var pseudo3d_fitted_peaks_tab_ass = ""; // pseudo 3D fitted peaks with assignment, a long multi-line string 
var pseudo3d_fitted_peaks = []; //pseudo 3D fitted peaks, JSON array
var total_number_of_experimental_spectra = 0; //total number of experimental spectra

/**
 * ft2 file drop processor
 */
var ft2_file_drop_processor;

/**
* fid file drop processor for the time domain spectra
*/
var fid_drop_process;

/**
 * DOM div for the processing message
 */
var oOutput;

/**
 * Current phase correction values:
 * direct_p0, direct_p1, indirect_p0, indirect_p1
 */
var current_phase_correction = [0, 0, 0, 0];


/**
 * Define a spectrum class to hold all spectrum information
 * Example of levels_length, polygon_length and points
 * levels_length=[0,3,5] means there are 2 levels, first level has 3 polygons, second level has 2 polygons: total 5 polygons
 * polygon_length=[0,3,6,8,14,16] means there are 5 polygons, first polygon has 3 points,
 * second polygon has 3 points, third polygon has 2 points, fourth polygon has 6 points, fifth polygon has 2 points: total 16 points
 * points=[x1,y1,x2,y2,x3,y3,x4,y4,x5,y5,x6,y6,x7,y7,x8,y8,x9,y9,x10,y10,x11,y11,x12,y12,x13,y13,x14,y14,x15,y15,x16,y16]
 * 
 * In case we have more than one contour plots (overlay of two contour plots),
 * we will have overlays= [0, 2, 4] means there are 2 overlayed contour plots
 * first plot has 2 levels, second plot has 2 levels in the levels_length array
 * if overlays =[] means all levels are in one plot (no overlay), this is the default, equal to [0, levels_length.length]
 */
class spectrum {
    constructor() {
        this.header = new Float32Array(512); //header of the spectrum, 512 float32 numbers
        this.raw_data = new Float32Array(); //raw data from the server
        this.noise_level = 0.001; //noise level of the input spectrum
        this.levels = [0.001, 0.002, 0.003]; //levels of the contour plot
        this.spectral_max = Number.MAX_VALUE; //maximum value of the spectrum
        this.n_direct = 4096; //size of direct dimension of the input spectrum. integer
        this.n_indirect = 1204; //size of indirect dimension of the input spectrum. integer
        this.x_ppm_start = 12.0; //start ppm of direct dimension
        this.x_ppm_width = 12.0; //width of direct dimension
        this.x_ppm_step = -12.0 / 4096; //step of direct dimension
        this.y_ppm_start = 120.0; //start ppm of indirect dimension
        this.y_ppm_width = 120.0; //width of indirect dimension
        this.y_ppm_step = -120.0 / 1024; //step of indirect dimension
        this.x_ppm_ref = 0.0; //reference ppm of direct dimension
        this.y_ppm_ref = 0.0; //reference ppm of indirect dimension
        this.picked_peaks = []; //picked peaks
        this.fitted_peaks = []; //fitted peaks
        this.spectrum_origin = -1; //spectrum origin: -2: experimental spectrum from fid, -1: experimental spectrum uploaded,  n(n>=0): reconstructed from experimental spectrum n
        
        /**
         * Default median sigmax, sigmay, gammax, gammay
         */
        this.median_sigmax = 1.0;
        this.median_sigmay = 1.0;
        this.median_gammax = 1.0;
        this.median_gammay = 1.0;
    }
};

var hsqc_spectra = []; //array of hsqc spectra

let draggedItem = null;


/**
 * Default color list for the contour plot (15 colors, repeat if more than 15 spectra)
 */
var color_list = [
    [0, 0, 1, 1.0], //blue
    [1, 0, 0, 1.0], //red
    [0, 1, 0, 1.0], //green
    [1, 1, 0, 1.0], //yellow
    [0, 1, 1, 1.0], //cyan
    [1, 0, 1, 1.0], //magenta
    [0, 0, 0, 1.0], //black
    [0.5, 0.5, 0.5, 1.0], //gray
    [1, 0.5, 0.5, 1.0], //pink
    [0.5, 1, 0.5, 1.0], //light green
    [0.5, 0.5, 1, 1.0], //light blue
    [1, 0.5, 1, 1.0], //light magenta
    [1, 1, 0.5, 1.0], //light yellow
    [0.5, 1, 1, 1.0], //light cyan
    [0.5, 0.5, 0.5, 1.0], //light gray
];


class file_drop_processor {
    /**
     * 
     * @param {string} drop_area_id: DIV id of the drop area
     * @param {array} files_name: array of file names to be extracted from the dropped files
     * @param {array} files_id: array of file ids the extracted file to be attached to
     */
    constructor() {
        this.supportsFileSystemAccessAPI = 'getAsFileSystemHandle' in DataTransferItem.prototype;
        this.supportsWebkitGetAsEntry = 'webkitGetAsEntry' in DataTransferItem.prototype;
        this.container = new DataTransfer();
    }

    drop_area(drop_area_id) {
        this.drop_area_id = drop_area_id;
        return this;
    }

    files_name(files_name) {
        this.files_name = files_name;
        return this;
    }

    file_extension(file_extension) {
        this.file_extension = file_extension;
        return this;
    }

    files_id(files_id) {
        this.files_id = files_id;
        return this;
    }

    init() {
        /**
         *  Get the element that will be the drop target. 
         *  Then add the relevant event listeners to it.
         */
        this.elem = document.getElementById(this.drop_area_id);

        // Prevent navigation.
        this.elem.addEventListener('dragover', (e) => {
            e.preventDefault();
        });

        // Visually highlight the drop zone.
        this.elem.addEventListener('dragenter', (e) => {
            this.elem.style.outline = 'solid red 2px';
        });

        // Visually un-highlight the drop zone.
        this.elem.addEventListener('dragleave', (e) => {
            let rect = this.elem.getBoundingClientRect();
            // Check the mouseEvent coordinates are outside of the rectangle
            if (e.clientX > rect.left + rect.width || e.clientX < rect.left
                || e.clientY > rect.top + rect.height || e.clientY < rect.top) {
                this.elem.style.outline = '';
            }
        });
        this.elem.addEventListener('drop', this.drop_handler.bind(this));
        return this;
    }

    async process_file_attachment(entry) {
        let file = await entry.getFile();

        /**
         * Only if the dropped file is in the list
         */
        if (this.files_name.includes(file.name)) {
            let container = new DataTransfer();
            container.items.add(file);
            let file_id = this.files_id[this.files_name.indexOf(file.name)];

            /**
             * A special case for the file input id "hsqc_acquisition_file2"
             * if the file is acqu3s, it will replace the acqu2s file
             * if the file is acqu2s, it will be added if currently acqu2s is empty, otherwise it will be ignored
             */
            if (file_id === "hsqc_acquisition_file2" && file.name === "acqu3s") {
                document.getElementById(file_id).files = container.files;
            }
            else if(file_id === "hsqc_acquisition_file2" && file.name === "acqu2s")
            {
                if(document.getElementById("hsqc_acquisition_file2").files.length === 0)
                {
                    document.getElementById(file_id).files = container.files;
                }
            }
            else
            {
                document.getElementById(file_id).files = container.files;
            }
            /**
             * If we can match file, will not try to match extension
             */
            return;
        }

        /**
         * Only if the dropped file's extension is as predefined, we will attach it to the corresponding file input
         */
        let file_extension = file.name.split('.').pop();    
        if (this.file_extension==file_extension) {
            this.container.items.add(file);
            let file_id = this.files_id[this.file_extension.indexOf(file_extension)];
            document.getElementById(file_id).files = this.container.files;
            /**
             * Simulate the change event
             */
            // document.getElementById(file_id).dispatchEvent(new Event('change'));
        }

    }

    async drop_handler(e) {
        e.preventDefault();

        if (!this.supportsFileSystemAccessAPI && !this.supportsWebkitGetAsEntry) {
            // Cannot handle directories.
            return;
        }
        // Un-highlight the drop zone.
        this.elem.style.outline = '';

        // Prepare an array of promises…
        const fileHandlesPromises = [...e.dataTransfer.items]
            // …by including only files (where file misleadingly means actual file _or_
            // directory)…
            .filter((item) => item.kind === 'file')
            // …and, depending on previous feature detection…
            .map((item) =>
                this.supportsFileSystemAccessAPI
                    // …either get a modern `FileSystemHandle`…
                    ? item.getAsFileSystemHandle()
                    // …or a classic `FileSystemFileEntry`.
                    : item.webkitGetAsEntry(),
            );

        // Loop over the array of promises.
        for await (const handle of fileHandlesPromises) {
            // This is where we can actually exclusively act on the directories.
            if (handle.kind === 'directory' || handle.isDirectory) {
                console.log(`Directory: ${handle.name}`);

                /**
                 * Get all files in the directory
                 */
                for await (const entry of handle.values()) {
                    if (entry.kind === 'file') {
                        /**
                         * If the dropped file is in the list, attach it to the corresponding file input
                         */
                        this.process_file_attachment(entry);
                    }
                }
            }
            /**
             * If the dropped item is a file, we will try to attach it to the corresponding file input if it is in the list
             */
            else if (handle.kind === 'file' || handle.isFile) {
                this.process_file_attachment(handle);
            }
        }
    }
};

const read_file = (file_id) => {
    return new Promise((resolve, reject) => {

        let file = document.getElementById(file_id).files[0];
        if (file) {
            var reader = new FileReader();
            reader.onload = function () {

                var data = new Uint8Array(reader.result);
                /**
                 * We will use the file_id as the file name. 
                 * Save them to the virtual file system for webassembly to read
                 */
                // Module['FS_createDataFile']('/', file_id, data, true, true, true);
                return resolve(data);
            };
            reader.onerror = function (e) {
                reject("Error reading file");
            };
            reader.readAsArrayBuffer(file);
        }
    });
}


$(document).ready(function () {

    /**
     * This is the main information output area
     */
    oOutput = document.getElementById("infor");

    /**
     * Tooltip div. Set the opacity to 0
     */
    tooldiv = document.getElementById("information_bar");
    tooldiv.style.opacity = 0;

    /**
     * clear hsqc_spectra array
     */
    hsqc_spectra = [];



    /**
     * Initialize the big plot
     */
    resize_main_plot(1200, 800, 20, 70, 20);

    /**
     * Resize observer for the big plot
     */
    plot_div_resize_observer.observe(document.getElementById("vis_parent")); 

    /**
     * ft2 file drop processor
     */
    ft2_file_drop_processor = new file_drop_processor()
    .drop_area('file_area') /** id of dropzone */
    .files_name([]) /** file names to be searched from upload. It is empty because we will use file_extension*/
    .file_extension("ft2")  /** file extenstion to be searched from upload */
    .files_id(["userfile"]) /** Corresponding file element IDs */
    .init();

    /**
    * INitialize the file drop processor for the time domain spectra
    */
    fid_drop_process = new file_drop_processor()
    .drop_area('fid_file_area') /** id of dropzone */
    .files_name(["acqu2s", "acqu3s", "acqus", "ser", "fid"])  /** file names to be searched from upload */
    .files_id(["acquisition_file2","acquisition_file2", "acquisition_file", "fid_file", "fid_file"]) /** Corresponding file element IDs */
    .init();

    /**
     * Upload a file with assignment information. 
     * Assignment will be transfer to current showing fitted peaks
     */
    document.getElementById('assignment_file').addEventListener('change', function (e) {
        
        /**
         * Do nothing if pseudo3d_fitted_peaks_tab is empty
         * or pseudo3d_fitted_peaks is empty
         */
        if(pseudo3d_fitted_peaks_tab === "" || pseudo3d_fitted_peaks.length === 0)
        {
            return;
        }

        /**
         * Read the file (text file) then send it to the worker, together with the current spectrum's fitted_peaks_tab
         */
        let file = document.getElementById('assignment_file').files[0];
        if (file) {
            var reader = new FileReader();
            reader.onload = function () {
                var data = reader.result;
                webassembly_worker.postMessage({
                    assignment: data,
                    fitted_peaks_tab: pseudo3d_fitted_peaks_tab,
                });
            };
            reader.onerror = function (e) {
                console.log("Error reading file");
            };
            reader.readAsText(file);
        }
    });


    /**
     * When use selected a file, read the file and process it
     */
    document.getElementById('ft2_file_form').addEventListener('submit', function (e) {
        e.preventDefault();

        /**
         * Clear file_drop_processor container
         * clearData() does not work ???
         */
        ft2_file_drop_processor.container = new DataTransfer();
        
        /**
         * Collect all file names
         */
        let file_names = [];
        for(let i=0;i<this.querySelector('input[type="file"]').files.length;i++)
        {
            file_names.push(this.querySelector('input[type="file"]').files[i].name);
        }
        /**
         * Sort the file names, keep the index
         */
        let index_array = Array.from(Array(file_names.length).keys());
        index_array.sort(function(a,b){
            return file_names[a].localeCompare(file_names[b]);
        });

        console.log(index_array);

        /**
         * To keep order, we will read the files one by one using a chain of promises
         */
        let chain = Promise.resolve();
        for(let i=0;i<this.querySelector('input[type="file"]').files.length;i++)
        {
            let ii = index_array[i];
            
            chain = chain.then(() => {
                    console.log("read file",this.querySelector('input[type="file"]').files[ii].name);
                    /**
                     * If not a .ft2 file. resolve the promise
                     */
                    if(!this.querySelector('input[type="file"]').files[ii].name.endsWith(".ft2"))
                    {
                        return Promise.resolve(null);
                    }
                    else
                    {
                        return read_file_and_process_ft2(this.querySelector('input[type="file"]').files[ii]);
                    }
            }).then((result_spectrum) => {
                if(result_spectrum !== null){
                    draw_spectrum(result_spectrum);
                }
                /**
                 * If it is the last file, clear the file input
                 */
                if(i===this.querySelector('input[type="file"]').files.length-1)
                {
                    document.getElementById('userfile').value = "";
                }
            }).catch((err) => {
                console.log(err);
            });
        }
    });


    /**
     * When user click submit button, read the time domain spectra and process it
     */
    document.getElementById('fid_file_form').addEventListener('submit', function (e) {

        /**
         * Step 1: save th file to virtual file system. Use promise to wait for all the files to be saved
         */
        e.preventDefault();

        let promises = [read_file('acquisition_file'), read_file('acquisition_file2'), read_file('fid_file')];
        Promise.all(promises)
            .then((result) => {

                /**
                 * Clear file input
                 */
                document.getElementById('acquisition_file').value = "";
                document.getElementById('acquisition_file2').value = "";
                document.getElementById('fid_file').value = "";

                /**
                 * Get HTML select "hsqc_acquisition_seq" value: "321" or "312"
                 */
                let acquisition_seq = document.getElementById("hsqc_acquisition_seq").value;
                /**
                 * Get HTML select zf_direct value: "2" or "4" or "8"
                 */
                let zf_direct = document.getElementById("zf_direct").value;
                /**
                 * Get HTML select zf_indirect value: "2" or "4" or "8"
                 */
                let zf_indirect = document.getElementById("zf_indirect").value;
                /**
                 * Get HTML checkbox "neg_imaginary".checked: true or false
                 * convert it to "yes" or "no"
                 */
                let neg_imaginary = document.getElementById("neg_imaginary").checked ? "yes" : "no";

                /**
                 * Result is an array of Uint8Array
                 */
                webassembly_worker.postMessage({
                    file_data: result,
                    acquisition_seq: acquisition_seq,
                    neg_imaginary: neg_imaginary,
                    zf_direct: zf_direct,
                    zf_indirect: zf_indirect
                });
                /**
                 * Let user know the processing is started
                 */
                document.getElementById("webassembly_message").innerText = "Processing time domain spectra, please wait...";

            })
            .catch((err) => {
                console.log(err);
            });      
    });

    /**
     * These 3 checkbox can only be triggered when the checkboxes are enabled
     * which means the main_plot is already defined
     * and current spectrum is an experimental spectrum
     * and current showing peaks are picked peaks (not fitted peaks)
     */

    /** 
     * Add event listener to the allow_brush_to_remove checkbox
     */
    document.getElementById("allow_brush_to_remove").addEventListener('change', function () {
        if (this.checked) {
            main_plot.allow_brush_to_remove = true;
        }
        else {
            /**
             * Disable the peak editing in main plot
             */
            main_plot.allow_brush_to_remove = false;
        }
    });

    /**
     * Event listener for the allow_drag_and_drop checkbox
     */
    document.getElementById("allow_drag_and_drop").addEventListener('change', function () {
        if (this.checked) {
            main_plot.allow_peak_dragging(true);
        }
        else {
            main_plot.allow_peak_dragging(false);
        }
    });

    /**
     * Event listener for the allow_click_to_add_peak checkbox
    */
    document.getElementById("allow_click_to_add_peak").addEventListener('change', function () {
        if (this.checked) {
            main_plot.allow_click_to_add_peak(true);
        }
        else {
            main_plot.allow_click_to_add_peak(false);
        }
    });

    /**
     * On click event for the show_peaks checkbox
     */
    document.getElementById("show_pseudo3d_peaks").addEventListener('change', function () {
        if (this.checked) {
            /**
             * Show the picked peaks
             */
            show_hide_peaks(-2, 'fitted', true);
        }
        else {
            /**
             * Hide the picked peaks
             */
            show_hide_peaks(-2, 'picked', false);
        }
    });

});

/**
 * When user click button to run pseudo 3D fitting
 */
function run_pseudo3d(flag) {

    /**
     * Get initial peaks from current_spectrum_index_of_peaks and current_flag_of_peaks
     */
    if (current_spectrum_index_of_peaks === -1) {
        alert("Please select a initial peak list to run pseudo 3D fitting");
        return;
    }

    let initial_peaks;
    if (current_flag_of_peaks === 'picked') {
        initial_peaks = hsqc_spectra[current_spectrum_index_of_peaks].picked_peaks;
    }
    else {
        initial_peaks = hsqc_spectra[current_spectrum_index_of_peaks].fitted_peaks;
    }

    /**
     * Get input field "max_round" value (number type)
     */
    let max_round = parseInt(document.getElementById("max_round").value);

    /**
     * Check all spectra, collect the ones that are experimental
     * Save their header and raw data like this: 
     * Combine hsqc_spectra[index].raw_data and hsqc_spectra[index].header into one Float32Array
     * Convert to Uint8Array to be transferred to the worker: let data_uint8 = new Uint8Array(data.buffer);
     */
    let all_files = [];
    for (let i = 0; i < hsqc_spectra.length; i++) {
        if (hsqc_spectra[i].spectrum_origin === -1 || hsqc_spectra[i].spectrum_origin === -2) {
            let data = new Float32Array(hsqc_spectra[i].header.length + hsqc_spectra[i].raw_data.length);
            data.set(hsqc_spectra[i].header, 0);
            data.set(hsqc_spectra[i].raw_data, hsqc_spectra[i].header.length);
            let data_uint8 = new Uint8Array(data.buffer);
            all_files.push(data_uint8);
        }
    }

    /**
     * Disable the download fitted peaks buttons to run pseudo 3D fitting
     */
    document.getElementById("button_run_pseudo3d_gaussian").disabled = true;
    document.getElementById("button_run_pseudo3d_voigt").disabled = true;

    /**
     * Show the processing message to let user know the fitting is running
     */
    document.getElementById("webassembly_message").innerText = "Running pseudo 3D fitting, please wait...";

    /**
     * Send the initial peaks, all_files to the worker
     */
    webassembly_worker.postMessage({
        initial_peaks: initial_peaks,
        all_files: all_files,
        noise_level: hsqc_spectra[current_spectrum_index_of_peaks].noise_level,
        scale: hsqc_spectra[current_spectrum_index_of_peaks].scale,
        scale2: hsqc_spectra[current_spectrum_index_of_peaks].scale2,
        flag: flag, //0: voigt, 1: Gaussian
        maxround: max_round,
    });
}


webassembly_worker.onmessage = function (e) {

    /**
     * if result is stdout, it is the processing message
     */
    if (e.data.stdout) {

        /**
         * Append e.data.stdout to textarea with ID "log"
         * and add a new line
         */
        document.getElementById("log").value += e.data.stdout + "\n";
        document.getElementById("log").scrollTop = document.getElementById("log").scrollHeight;
    }
    /**
     * e.data.stdout is defined but empty, it is the end of the processing message
     */
    else if (typeof e.data.stdout !== "undefined" && e.data.stdout === "") {
    }

    /**
     * If result is peaks
     */
    else if (e.data.peaks) {
        hsqc_spectra[e.data.spectrum_index].picked_peaks = e.data.peaks.picked_peaks;

        /**
         * Calculate the median sigmax, sigmay, gammax, gammay of the picked peaks
         * Get an array of sigmax, sigmay, gammax, gammay
         */
        let sigmax = [];
        let sigmay = [];
        let gammax = [];
        let gammay = [];
        for (let i = 0; i < e.data.peaks.picked_peaks.length; i++) {
            sigmax.push(e.data.peaks.picked_peaks[i].sigmax);
            sigmay.push(e.data.peaks.picked_peaks[i].sigmay);
            gammax.push(e.data.peaks.picked_peaks[i].gammax);
            gammay.push(e.data.peaks.picked_peaks[i].gammay);
        }

        hsqc_spectra[e.data.spectrum_index].median_sigmax = median(sigmax);
        hsqc_spectra[e.data.spectrum_index].median_sigmay = median(sigmay);
        hsqc_spectra[e.data.spectrum_index].median_gammax = median(gammax);
        hsqc_spectra[e.data.spectrum_index].median_gammay = median(gammay);
        
        /**
         * when picked peaks are received, fitted peaks need to be reset
         */
        hsqc_spectra[e.data.spectrum_index].fitted_peaks = [];
        /**
         * Disable the download fitted peaks button. Uncheck the show fitted peaks checkbox, disable it too
         */
        document.getElementById("download_fitted_peaks-".concat(e.data.spectrum_index)).disabled = true;
        document.getElementById("show_fitted_peaks-".concat(e.data.spectrum_index)).checked = false;
        document.getElementById("show_fitted_peaks-".concat(e.data.spectrum_index)).disabled = true;

        /**
         * Need to save its scale and scale2 used to run deep picker
         * because we will need them to run peak fitting
         */
        hsqc_spectra[e.data.spectrum_index].scale = e.data.scale;
        hsqc_spectra[e.data.spectrum_index].scale2 = e.data.scale2;
        /**
         * Enable the download peaks button
         */
        document.getElementById("download_peaks-".concat(e.data.spectrum_index)).disabled = false;
        /**
         * Enable peak picking (we disabled it when starting deep picker) and peak fitting buttons
         */
        document.getElementById("run_deep_picker-".concat(e.data.spectrum_index)).disabled = false;
        document.getElementById("run_voigt_fitter0-".concat(e.data.spectrum_index)).disabled = false;
        document.getElementById("run_voigt_fitter1-".concat(e.data.spectrum_index)).disabled = false;
        /**
         * Enable, set it as unchecked then simulate a click event to show the peaks
         */
        document.getElementById("show_peaks-".concat(e.data.spectrum_index)).disabled = false;
        document.getElementById("show_peaks-".concat(e.data.spectrum_index)).checked = false;
        document.getElementById("show_peaks-".concat(e.data.spectrum_index)).click();

        /**
         * Clear the processing message
         */
        document.getElementById("webassembly_message").innerText = "";
    }

    /**
     * If result is fitted_peaks and recon_spectrum
     */
    else if (e.data.fitted_peaks && e.data.recon_spectrum) {
        console.log("Fitted peaks and recon_spectrum received");
        hsqc_spectra[e.data.spectrum_index].fitted_peaks = e.data.fitted_peaks.fitted_peaks; //The double fitted_peaks is correct
        hsqc_spectra[e.data.spectrum_index].fitted_peaks_tab = e.data.fitted_peaks_tab; //a string of fitted peaks in nmrPipe format

        /**
         * Enable run deep picker and run voigt fitter buttons
         */
        document.getElementById("run_deep_picker-".concat(e.data.spectrum_index)).disabled = false;
        document.getElementById("run_voigt_fitter0-".concat(e.data.spectrum_index)).disabled = false;
        document.getElementById("run_voigt_fitter1-".concat(e.data.spectrum_index)).disabled = false;

        /**
         * Enable the download fitted peaks button and show the fitted peaks button
         */
        document.getElementById("download_fitted_peaks-".concat(e.data.spectrum_index)).disabled = false;
        document.getElementById("show_fitted_peaks-".concat(e.data.spectrum_index)).disabled = false;

        /**
         * Uncheck the show_peaks checkbox then simulate a click event to show the peaks (with updated peaks from fitted_peaks)
         */
        document.getElementById("show_fitted_peaks-".concat(e.data.spectrum_index)).checked = false;
        document.getElementById("show_fitted_peaks-".concat(e.data.spectrum_index)).click();

        /**
         * Treat the received recon_spectrum as a frequency domain spectrum
         */
        let arrayBuffer = new Uint8Array(e.data.recon_spectrum).buffer;

        /**
         * Process the frequency domain spectrum, spectrum name is "recon-".spectrum_origin.".ft2"
         */
        let result_spectrum_name = "recon-".concat(e.data.spectrum_index.toString(), ".ft2");
        let result_spectrum = process_ft_file(arrayBuffer,result_spectrum_name,e.data.spectrum_index);

        /**
         * Replace its header with the header of the original spectrum
         * and noise_level, levels, negative_levels, spectral_max and spectral_min with the original spectrum
         */
        result_spectrum.header = hsqc_spectra[e.data.spectrum_index].header;
        result_spectrum.noise_level = hsqc_spectra[e.data.spectrum_index].noise_level;
        result_spectrum.levels = hsqc_spectra[e.data.spectrum_index].levels;
        result_spectrum.negative_levels = hsqc_spectra[e.data.spectrum_index].negative_levels;
        result_spectrum.spectral_max = hsqc_spectra[e.data.spectrum_index].spectral_max;
        result_spectrum.spectral_min = hsqc_spectra[e.data.spectrum_index].spectral_min;

        /**
         * Copy picked_peaks and fitted_peaks from the original spectrum
         */
        result_spectrum.picked_peaks = hsqc_spectra[e.data.spectrum_index].picked_peaks;
        result_spectrum.fitted_peaks = hsqc_spectra[e.data.spectrum_index].fitted_peaks;

        /**
         * Also copy scale and scale2 from the original spectrum, which are used to run deep picker and peak fitting
         */
        result_spectrum.scale = e.data.scale;
        result_spectrum.scale2 = e.data.scale2;
        draw_spectrum(result_spectrum);

        /**
         * Clear the processing message
         */
        document.getElementById("webassembly_message").innerText = "";
    }

    /**
     * If result is file_data, it is the frequency domain spectrum
     */
    else if (e.data.file_data && e.data.phasing_data) {

        /**
         * e.data.phasing_data is a string with 4 numbers separated by space(s)
         */
        current_phase_correction = e.data.phasing_data.split(/(\s+)/);

        let arrayBuffer = new Uint8Array(e.data.file_data).buffer;
        let result_spectrum = process_ft_file(arrayBuffer,"from_fid.ft2",-2);
        draw_spectrum(result_spectrum);
        /**
         * Clear the processing message
         */
        document.getElementById("webassembly_message").innerText = "";
    }

    /**
     * If result is pseudo3d_fitted_peaks, it is from the pseudo 3D fitting
     */
    else if (e.data.pseudo3d_fitted_peaks) {
        console.log("Pseudo 3D fitted peaks received");
        pseudo3d_fitted_peaks_tab = e.data.pseudo3d_fitted_peaks_tab;
        pseudo3d_fitted_peaks =  e.data.pseudo3d_fitted_peaks.fitted_peaks; //The double fitted_peaks is correct 

        /**
         * Enable the download fitted peaks button and show the fitted peaks button
         */
        document.getElementById("button_download_fitted_peaks").disabled = false;
        document.getElementById("show_pseudo3d_peaks").disabled = false;

        /**
         * Uncheck all other show peaks checkboxes
         */
        for(let i=0;i<hsqc_spectra.length;i++)
        {
            /**
             * -3 means removed spectrum, all DOM element for removed spectrum is also removed
             */
            if(hsqc_spectra[i].spectrum_origin !== -3)
            {
                document.getElementById("show_peaks-".concat(i)).checked = false;
                document.getElementById("show_fitted_peaks-".concat(i)).checked = false;
            }
        }

        /**
         * Uncheck the show_peaks checkbox then simulate a click event to show the peaks (with updated peaks from fitted_peaks)
         */
        document.getElementById("show_pseudo3d_peaks").checked = false;
        document.getElementById("show_pseudo3d_peaks").click();

        /**
         * Clear the processing message
         */
        document.getElementById("webassembly_message").innerText = "";
        /**
         * Re-enable the run pseudo 3D buttons
         */
        document.getElementById("button_run_pseudo3d_gaussian").disabled = false;
        document.getElementById("button_run_pseudo3d_voigt").disabled = false;
        /**
         * Enable the assignment_file
         */
        document.getElementById("assignment_file").disabled = false;
    }

    else if(e.data.assignment)
    {
        console.log("Assignment transfer received.");
        pseudo3d_fitted_peaks_tab_ass = e.data.matched_peaks_tab;
        /**
         * Enable download peaks with assignment and assignment_file file input 
         */
        document.getElementById("button_download_fitted_peaks_ass").disabled = false;
    }

    else{
        console.log(e.data);
    }
};

var plot_div_resize_observer = new ResizeObserver(entries => {
    for (let entry of entries) {

        const cr = entry.contentRect;
        let padding = 20;
        let margin_left = 70;
        let margin_top = 20;

        resize_main_plot(cr.width,cr.height,padding,margin_left,margin_top);
    }
});


function resize_main_plot(wid, height, padding, margin_left, margin_top)
{
    /**
     * same size for svg_parent (parent of visualization), canvas_parent (parent of canvas1), canvas1, 
     * and vis_parent (parent of visualization and canvas_parent)
     */
    document.getElementById('svg_parent').style.height = height.toString().concat('px');
    document.getElementById('svg_parent').style.width = wid.toString().concat('px');
    document.getElementById('svg_parent').style.top = padding.toFixed(0).concat('px');
    document.getElementById('svg_parent').style.left = padding.toFixed(0).concat('px');

    /**
     * Set the size of the visualization div to be the same as its parent
     */
    document.getElementById('visualization').style.height = height.toString().concat('px');
    document.getElementById('visualization').style.width = wid.toString().concat('px');

    /**
     * canvas is shifted 50px to the right, 20 px to the bottom.
     * It is also shortened by 20px in width on the right and 50px in height on the bottom.
     */
    let canvas_height = height - 90;
    let canvas_width = wid - 90;

    // document.getElementById('canvas_parent').style.height = canvas_height.toString().concat('px');
    // document.getElementById('canvas_parent').style.width = canvas_width.toString().concat('px');
    document.getElementById('canvas_parent').style.top = (padding + margin_top).toFixed(0).concat('px');
    document.getElementById('canvas_parent').style.left = (padding + margin_left).toFixed(0).concat('px');


    /**
     * Set canvas1 style width and height to be the same as its parent
     */
    // document.getElementById('canvas1').style.height = canvas_height.toString().concat('px');
    // document.getElementById('canvas1').style.width = canvas_width.toString().concat('px');
    /**
     * Set canvas1 width and height to be the same as its style width and height
     */
    document.getElementById('canvas1').setAttribute("height", canvas_height.toString());
    document.getElementById('canvas1').setAttribute("width", canvas_width.toString());

    let input = {
        WIDTH: wid,
        HEIGHT: height
    };

    if (main_plot !== null) {
        main_plot.update(input);
    }
}

/**
 * Drag and drop spectra to reorder them 
 */
const sortableList = document.getElementById("spectra_list_ol");

sortableList.addEventListener(
    "dragstart",
    (e) => {
        /**
         * We will move the parent element of the dragged item
         */
        draggedItem = e.target.parentElement;
        setTimeout(() => {
            e.target.parentElement.style.display =
                "none";
        }, 0);
});
 
sortableList.addEventListener(
    "dragend",
    (e) => {
        setTimeout(() => {
            e.target.parentElement.style.display = "";
            draggedItem = null;
        }, 0);

        /**
         * Get the index of the new order
         */
        let new_order = [];
        let list_items = document.querySelectorAll("li");
        for (let i = 0; i < list_items.length; i++) {
            let index = parseInt(list_items[i].id.split("-")[1]); //ID is spectrum-index
            new_order.push(index);
        }
        /**
         * In case new_order.length !== main_plot.spectral_order.length,
         * we need to wait for the worker to finish the calculation then update the order
         */
        let interval_id = setInterval(() => {
            if (new_order.length === main_plot.spectral_order.length) {
                clearInterval(interval_id);
                main_plot.spectral_order = new_order;
                main_plot.redraw_contour_order();
            }
        }, 1000);
    });
 
sortableList.addEventListener(
    "dragover",
    (e) => {
        e.preventDefault();
        /**
         * If draggedItem is null, return (user is dragging something else)
         */
        if (draggedItem === null) {
            return;
        }
        const afterElement =
            getDragAfterElement(
                sortableList,
                e.clientY);
        // const currentElement =document.querySelector(".dragging").parentElement;

        if (afterElement == null) {
            sortableList.appendChild(
                draggedItem
            );} 
        else {
            sortableList.insertBefore(
                draggedItem,
                afterElement
            );}
    });
 
const getDragAfterElement = (container, y) =>
{
    const draggableElements = [
        ...container.querySelectorAll(
            ":scope > li:not(.dragging)"
        ),];

    return draggableElements.reduce(
        (closest, child) => {
            const box =
                child.getBoundingClientRect();
            const offset =
                y - box.top - box.height / 2;
            if (
                offset < 0 &&
                offset > closest.offset) {
                return {
                    offset: offset,
                    element: child,
                };
            }
            else {
                return closest;
            }
        },
        {
            offset: Number.NEGATIVE_INFINITY,
        }
    ).element;
};




function add_to_list(index) {
    let new_spectrum = hsqc_spectra[index];
    let new_spectrum_div = document.createElement("li");

    /**
     * Assign a ID to the new spectrum div
     */
    new_spectrum_div.id = "spectrum-".concat(index);

    /**
     * Add a draggable div to the new spectrum div, only if the spectrum is experimental
     */
    if(new_spectrum.spectrum_origin === -1 || new_spectrum.spectrum_origin === -2)
    {
        let draggable_span = document.createElement("span");
        draggable_span.draggable = true;
        draggable_span.classList.add("draggable");
        draggable_span.appendChild(document.createTextNode("\u2630 Drag me. "));
        draggable_span.style.cursor = "move";
        new_spectrum_div.appendChild(draggable_span);
    }

    /**
     * If this is a reconstructed spectrum, add a button called "Remove me"
     */
    if (new_spectrum.spectrum_origin >= 0) {
        let remove_button = document.createElement("button");
        remove_button.innerText = "Remove me";
        remove_button.onclick = function () { remove_spectrum_caller(index); };
        new_spectrum_div.appendChild(remove_button);
    }
    
    if(new_spectrum.spectrum_origin === -1 || new_spectrum.spectrum_origin === -2)
    {
        /**
         * The new DIV will have the following children:
         * A original index (which is different from the index in the list, because of the order change by drag and drop)
         * A span element with the spectrum noise level
         */
        new_spectrum_div.appendChild(document.createTextNode("Original index: ".concat(index.toString(), ", ")));
        new_spectrum_div.appendChild(document.createTextNode("Noise: " + new_spectrum.noise_level.toExponential(4) + ","));
        /**
         * Add filename as a text node
         */
        let fname_text = document.createTextNode(" File name: " + hsqc_spectra[index].filename + " ");
        new_spectrum_div.appendChild(fname_text);

        /**
         * Add two input text element with ID ref1 and ref2, default value is 0 and 0
         * They also have a label element with text "Ref direct: " and "Ref indirect: "
         * They also have an onblur event to update the ref_direct and ref_indirect values
         */
        let ref_direct_label = document.createElement("label");
        ref_direct_label.setAttribute("for", "ref1-".concat(index));
        ref_direct_label.innerText = " Ref direct: ";
        let ref_direct_input = document.createElement("input");
        ref_direct_input.setAttribute("type", "text");
        ref_direct_input.setAttribute("id", "ref1-".concat(index));
        ref_direct_input.setAttribute("size", "4");
        ref_direct_input.setAttribute("value", "0.0");
        ref_direct_input.onblur = function () { adjust_ref(index, 0); };
        new_spectrum_div.appendChild(ref_direct_label);
        new_spectrum_div.appendChild(ref_direct_input);

        let ref_indirect_label = document.createElement("label");
        ref_indirect_label.setAttribute("for", "ref2-".concat(index));
        ref_indirect_label.innerText = " Ref indirect: ";
        let ref_indirect_input = document.createElement("input");
        ref_indirect_input.setAttribute("type", "text");
        ref_indirect_input.setAttribute("id", "ref2-".concat(index));
        ref_indirect_input.setAttribute("size", "4");
        ref_indirect_input.setAttribute("value", "0.0");
        ref_indirect_input.onblur = function () { adjust_ref(index, 1); };
        new_spectrum_div.appendChild(ref_indirect_label);
        new_spectrum_div.appendChild(ref_indirect_input);
        /**
         * Add a line break
         */
        new_spectrum_div.appendChild(document.createElement("br"));
    }


    /**
     * Add a download button to download the spectrum only if spectrum_origin is not -1
     * Allow download of from fid and from reconstructed spectrum
     */
    if (new_spectrum.spectrum_origin !== -1) {
        let download_button = document.createElement("button");
        download_button.innerText = "Download ft2";
        download_button.onclick = function () { download_spectrum(index,'original'); };
        new_spectrum_div.appendChild(download_button);
    }

    /**
     * Add a different spectrum download button for reconstructed spectrum only
     */
    if (new_spectrum.spectrum_origin >=0) {
        let download_button = document.createElement("button");
        download_button.innerText = "Download diff.ft2";
        download_button.onclick = function () { download_spectrum(index,'diff'); };
        new_spectrum_div.appendChild(download_button);
    }


    /**
     * If the spectrum is experimental, add a run_DEEP_Picker, run Voigt fitter, run Gaussian fitter, and download peaks button
     */
    if(new_spectrum.spectrum_origin === -1 || new_spectrum.spectrum_origin === -2)
    {
        /**
         * Add a run_DEEP_Picker button to run DEEP picker. Default is enabled
         */
        let deep_picker_button = document.createElement("button");
        deep_picker_button.setAttribute("id", "run_deep_picker-".concat(index));
        deep_picker_button.innerText = "DEEP Picker";
        deep_picker_button.onclick = function () { run_DEEP_Picker(index); };
        new_spectrum_div.appendChild(deep_picker_button);

        /**
         * Add a combine_peak cutoff input filed with ID "combine_peak_cutoff-".concat(index)
         * run_Voigt_fitter() will read this value and send to wasm to combine peaks in the fitting
         */
        let combine_peak_cutoff_label = document.createElement("label");
        combine_peak_cutoff_label.setAttribute("for", "combine_peak_cutoff-".concat(index));
        combine_peak_cutoff_label.innerText = " Combine peak cutoff: ";
        let combine_peak_cutoff_input = document.createElement("input");
        combine_peak_cutoff_input.setAttribute("type", "number");
        combine_peak_cutoff_input.setAttribute("step", "0.01");
        combine_peak_cutoff_input.setAttribute("min", "0.00");
        combine_peak_cutoff_input.setAttribute("id", "combine_peak_cutoff-".concat(index));
        combine_peak_cutoff_input.setAttribute("size", "1");
        combine_peak_cutoff_input.setAttribute("value", "0.1");
        new_spectrum_div.appendChild(combine_peak_cutoff_label);
        new_spectrum_div.appendChild(combine_peak_cutoff_input);

        /**
         * Add a maxround input filed (type: int number) with ID "maxround-".concat(index)
         */
        let maxround_label = document.createElement("label");
        maxround_label.setAttribute("for", "maxround-".concat(index));
        maxround_label.innerText = " Max round: ";
        let maxround_input = document.createElement("input");
        maxround_input.setAttribute("type", "number");
        maxround_input.setAttribute("step", "1");
        maxround_input.setAttribute("min", "1");
        maxround_input.setAttribute("id", "maxround-".concat(index));
        maxround_input.setAttribute("size", "1");
        maxround_input.setAttribute("value", "50"); //Default value is 50
        new_spectrum_div.appendChild(maxround_label);
        new_spectrum_div.appendChild(maxround_input);
        
        /**
         * Add two buttons to call run_Voigt_fitter, with option 0 and 1
         * Default is disabled
         */
        let run_voigt_fitter_button0 = document.createElement("button");
        run_voigt_fitter_button0.innerText = "Voigt Fitting";
        run_voigt_fitter_button0.onclick = function () { run_Voigt_fitter(index, 0); };
        run_voigt_fitter_button0.disabled = true;
        run_voigt_fitter_button0.setAttribute("id", "run_voigt_fitter0-".concat(index));
        new_spectrum_div.appendChild(run_voigt_fitter_button0);

        let run_voigt_fitter_button1 = document.createElement("button");
        run_voigt_fitter_button1.innerText = "Gaussian Fitting";
        run_voigt_fitter_button1.onclick = function () { run_Voigt_fitter(index, 1); };
        run_voigt_fitter_button1.disabled = true;
        run_voigt_fitter_button1.setAttribute("id", "run_voigt_fitter1-".concat(index));
        new_spectrum_div.appendChild(run_voigt_fitter_button1);

        /**
         * Add a new line
         */
        new_spectrum_div.appendChild(document.createElement("br"));
    }

    /**
     * Add a download button to download the picked peaks. Default is disabled unless it is a reconstructed spectrum
     */
    let download_peaks_button = document.createElement("button");
    download_peaks_button.innerText = "Download picked peaks";
    if(new_spectrum.spectrum_origin === -1 || new_spectrum.spectrum_origin === -2){
        download_peaks_button.disabled = true;
    }
    download_peaks_button.setAttribute("id", "download_peaks-".concat(index));
    download_peaks_button.onclick = function () { download_peaks(index,'picked'); };
    new_spectrum_div.appendChild(download_peaks_button);

    /**
     * Add a download button to download the fitted peaks. Default is disabled unless it is a reconstructed spectrum
     */
    let download_fitted_peaks_button = document.createElement("button");
    download_fitted_peaks_button.innerText = "Download fitted peaks";
    if(new_spectrum.spectrum_origin === -1 || new_spectrum.spectrum_origin === -2){
        download_fitted_peaks_button.disabled = true;
    }
    download_fitted_peaks_button.setAttribute("id", "download_fitted_peaks-".concat(index));
    download_fitted_peaks_button.onclick = function () { download_peaks(index,'fitted'); };
    new_spectrum_div.appendChild(download_fitted_peaks_button);

    /**
     * Add a checkbox to show or hide the picked peaks. Default is unchecked
     * It has an event listener to show or hide the peaks
     */
    let show_peaks_checkbox = document.createElement("input");
    show_peaks_checkbox.setAttribute("type", "checkbox");
    if(new_spectrum.spectrum_origin === -1 || new_spectrum.spectrum_origin === -2){
        show_peaks_checkbox.disabled = true;
    }
    show_peaks_checkbox.setAttribute("id", "show_peaks-".concat(index));
    show_peaks_checkbox.onclick = function (e) {
        /**
         * If the checkbox is checked, show the peaks
         */
        if (e.target.checked) {
            show_hide_peaks(index,'picked', true);
        }
        else {
            show_hide_peaks(index,'picked', false);
        }
    }
    new_spectrum_div.appendChild(show_peaks_checkbox);
    let show_peaks_label = document.createElement("label");
    show_peaks_label.setAttribute("for", "show_peaks-".concat(index));
    show_peaks_label.innerText = "Show picked peaks";
    new_spectrum_div.appendChild(show_peaks_label);

    /**
     * Add a checkbox to show or hide the fitted peaks. Default is unchecked
     */
    let show_fitted_peaks_checkbox = document.createElement("input");
    show_fitted_peaks_checkbox.setAttribute("type", "checkbox");
    if(new_spectrum.spectrum_origin === -1 || new_spectrum.spectrum_origin === -2){
        show_fitted_peaks_checkbox.disabled = true;
    }
    show_fitted_peaks_checkbox.setAttribute("id", "show_fitted_peaks-".concat(index));
    show_fitted_peaks_checkbox.onclick = function (e) {
        /**
         * If the checkbox is checked, show the peaks
         */
        if (e.target.checked) {
            show_hide_peaks(index,'fitted', true);
        }
        else {
            show_hide_peaks(index,'fitted', false);
        }
    }
    new_spectrum_div.appendChild(show_fitted_peaks_checkbox);
    let show_fitted_peaks_label = document.createElement("label");
    show_fitted_peaks_label.setAttribute("for", "show_fitted_peaks-".concat(index));
    show_fitted_peaks_label.innerText = "Show fitted peaks";
    new_spectrum_div.appendChild(show_fitted_peaks_label);



    /**
     * Add a new line
    */
    new_spectrum_div.appendChild(document.createElement("br"));  
    

    /**
     * Positive contour levels first
     * A input text element with the lowest contour level for contour calculation, whose ID is "contour0-".concat(index)
     */
    let contour0_input_label = document.createElement("label");
    contour0_input_label.setAttribute("for", "contour0-".concat(index));
    contour0_input_label.innerText = "Lowest: ";
    let contour0_input = document.createElement("input");
    contour0_input.setAttribute("type", "text");
    contour0_input.setAttribute("id", "contour0-".concat(index));
    contour0_input.setAttribute("size", "8");
    contour0_input.setAttribute("min",0.001);
    contour0_input.setAttribute("value", new_spectrum.levels[0].toExponential(4));
    new_spectrum_div.appendChild(contour0_input_label);
    new_spectrum_div.appendChild(contour0_input);


    let reduce_contour_button = document.createElement("button");
    /**
     * Create a text node with the text ">" and class rotate90
     */
    let textnode = document.createTextNode(">");
    let textdiv = document.createElement("div");
    textdiv.appendChild(textnode);
    textdiv.classList.add("rotate90");

    reduce_contour_button.appendChild(textdiv);
    reduce_contour_button.onclick = function() { reduce_contour(index,0); };
    reduce_contour_button.style.marginLeft = "1em";
    reduce_contour_button.style.marginRight = "1em";
    /**
     * Add a tooltip to the button
     */
    reduce_contour_button.setAttribute("title", "Insert a new level, which is the current level divided by the logarithmic scale. This is more efficient than full recalculation.");
    new_spectrum_div.appendChild(reduce_contour_button);



    /**
     * A input text element with the logarithmic scale for contour calculation, whose ID is "logarithmic_scale-".concat(index)
     */
    let logarithmic_scale_input_label = document.createElement("label");
    logarithmic_scale_input_label.setAttribute("for", "logarithmic_scale-".concat(index));
    logarithmic_scale_input_label.innerText = "Scale: ";
    let logarithmic_scale_input = document.createElement("input");
    logarithmic_scale_input.setAttribute("type", "text");
    logarithmic_scale_input.setAttribute("id", "logarithmic_scale-".concat(index));
    logarithmic_scale_input.setAttribute("value", "1.5");
    logarithmic_scale_input.setAttribute("size", "3");
    logarithmic_scale_input.setAttribute("min",1.05);
    new_spectrum_div.appendChild(logarithmic_scale_input_label);
    new_spectrum_div.appendChild(logarithmic_scale_input);

    /**
     * A button to update the contour plot with the new lowest level and logarithmic scale
     */
    let update_contour_button = document.createElement("button");
    update_contour_button.innerText = "Recalculate";
    update_contour_button.onclick = function() { update_contour0_or_logarithmic_scale(index,0); };
    update_contour_button.setAttribute("title","Update the contour plot with the new lowest level and logarithmic scale. This process might be slow.");
    update_contour_button.style.marginLeft = "1em";
    update_contour_button.style.marginRight = "1em";
    new_spectrum_div.appendChild(update_contour_button);

    /**
     * Add a new line and a slider for the contour level
     * Add a event listener to update the contour level
     */
    let contour_slider = document.createElement("input");
    contour_slider.setAttribute("type", "range");
    contour_slider.setAttribute("id", "contour-slider-".concat(index));
    contour_slider.setAttribute("min", "1");
    contour_slider.setAttribute("max", hsqc_spectra[index].levels.length.toString());
    contour_slider.style.width = "10%";
    contour_slider.addEventListener("input", (e) => { update_contour_slider(e, index, 'positive'); });
    
    /**
     * A span element with the current contour level, whose ID is "contour_level-".concat(index)
     */
    let contour_level_span = document.createElement("span");
    contour_level_span.setAttribute("id", "contour_level-".concat(index));
    contour_level_span.classList.add("information");
    
    if(total_number_of_experimental_spectra<=4)
    {
        contour_slider.setAttribute("value", "1");
        contour_level_span.innerText = new_spectrum.levels[0].toExponential(4);
    }
    else
    {
        contour_slider.setAttribute("value", (hsqc_spectra[index].levels.length).toString());
        contour_level_span.innerText = new_spectrum.levels[hsqc_spectra[index].levels.length-1].toExponential(4);
    }
    new_spectrum_div.appendChild(contour_slider);
    new_spectrum_div.appendChild(contour_level_span);


    /**
     * Add some spaces
     */
    new_spectrum_div.appendChild(document.createTextNode("  "));

    /**
     * A color picker element with the color of the contour plot, whose ID is "contour_color-".concat(index)
     * Set the color of the picker to the color of the spectrum
     * Also add an event listener to update the color of the contour plot
     */
    let contour_color_label = document.createElement("label");
    contour_color_label.setAttribute("for", "contour_color-".concat(index));
    contour_color_label.innerText = "Color: ";
    let contour_color_input = document.createElement("input");
    contour_color_input.setAttribute("type", "color");
    contour_color_input.setAttribute("value", rgbToHex(new_spectrum.spectrum_color));
    contour_color_input.setAttribute("id", "contour_color-".concat(index));
    contour_color_input.addEventListener("change", (e) => { update_contour_color(e, index, 0); });
    new_spectrum_div.appendChild(contour_color_label);
    new_spectrum_div.appendChild(contour_color_input);

    /**
     * Add a line break
     */
    new_spectrum_div.appendChild(document.createElement("br"));



    /**
     * Negative contour levels first
     * A input text element with the lowest contour level for contour calculation
     */
    let contour0_input_label_negative = document.createElement("label");
    contour0_input_label_negative.setAttribute("for", "contour0_negative-".concat(index));
    contour0_input_label_negative.innerText = "Lowest: ";
    let contour0_input_negative = document.createElement("input");
    contour0_input_negative.setAttribute("type", "text");
    contour0_input_negative.setAttribute("id", "contour0_negative-".concat(index));
    contour0_input_negative.setAttribute("size", "8");
    contour0_input_negative.setAttribute("min", 0.001);
    contour0_input_negative.setAttribute("value", new_spectrum.negative_levels[0].toExponential(4));
    new_spectrum_div.appendChild(contour0_input_label_negative);
    new_spectrum_div.appendChild(contour0_input_negative);


    let reduce_contour_button_negative = document.createElement("button");
    /**
     * Create a text node with the text ">" and class rotate90
     */
    let textnode_negative = document.createTextNode(">");
    let textdiv_negative = document.createElement("div");
    textdiv_negative.appendChild(textnode_negative);
    textdiv_negative.classList.add("rotate90");

    reduce_contour_button_negative.appendChild(textdiv_negative);
    reduce_contour_button_negative.onclick = function () { reduce_contour(index, 1); };
    reduce_contour_button_negative.style.marginLeft = "1em";
    reduce_contour_button_negative.style.marginRight = "1em";
    /**
     * Add a tooltip to the button
     */
    reduce_contour_button_negative.setAttribute("title", "Insert a new level, which is the current level divided by the logarithmic scale. This is more efficient than full recalculation.");
    new_spectrum_div.appendChild(reduce_contour_button_negative);



    /**
     * A input text element with the logarithmic scale for contour calculation, whose ID is "logarithmic_scale-".concat(index)
     */
    let logarithmic_scale_input_label_negative = document.createElement("label");
    logarithmic_scale_input_label_negative.setAttribute("for", "logarithmic_scale_negative-".concat(index));
    logarithmic_scale_input_label_negative.innerText = "Scale: ";
    let logarithmic_scale_input_negative = document.createElement("input");
    logarithmic_scale_input_negative.setAttribute("type", "text");
    logarithmic_scale_input_negative.setAttribute("id", "logarithmic_scale_negative-".concat(index));
    logarithmic_scale_input_negative.setAttribute("value", "1.5");
    logarithmic_scale_input_negative.setAttribute("size", "3");
    logarithmic_scale_input_negative.setAttribute("min", 1.05);
    new_spectrum_div.appendChild(logarithmic_scale_input_label_negative);
    new_spectrum_div.appendChild(logarithmic_scale_input_negative);

    /**
     * A button to update the contour plot with the new lowest level and logarithmic scale
     */
    let update_contour_button_negative = document.createElement("button");
    update_contour_button_negative.innerText = "Recalculate";
    update_contour_button_negative.onclick = function () { update_contour0_or_logarithmic_scale(index, 1); };
    update_contour_button_negative.setAttribute("title", "Update the contour plot with the new lowest level and logarithmic scale. This process might be slow.");
    update_contour_button_negative.style.marginLeft = "1em";
    update_contour_button_negative.style.marginRight = "1em";
    new_spectrum_div.appendChild(update_contour_button_negative);

    /**
     * Add a new line and a slider for the contour level
     * Add a event listener to update the contour level
     */
    let contour_slider_negative = document.createElement("input");
    contour_slider_negative.setAttribute("type", "range");
    contour_slider_negative.setAttribute("id", "contour-slider_negative-".concat(index));
    contour_slider_negative.setAttribute("min", "1");
    contour_slider_negative.setAttribute("max", hsqc_spectra[index].negative_levels.length.toString());
    contour_slider_negative.style.width = "10%";
    contour_slider_negative.addEventListener("input", (e) => { update_contour_slider(e, index, 'negative'); });
    

    /**
     * A span element with the current contour level, whose ID is "contour_level-".concat(index)
     */
    let contour_level_span_negative = document.createElement("span");
    contour_level_span_negative.setAttribute("id", "contour_level_negative-".concat(index));
    contour_level_span_negative.classList.add("information");

    if(total_number_of_experimental_spectra<=4)
    {
        contour_slider_negative.setAttribute("value", "1");
        contour_level_span_negative.innerText = new_spectrum.negative_levels[0].toExponential(4);
    }
    else
    {
        contour_slider_negative.setAttribute("value", (hsqc_spectra[index].negative_levels.length).toString());
        contour_level_span_negative.innerText = new_spectrum.negative_levels[hsqc_spectra[index].negative_levels.length-1].toExponential(4);
    }

    new_spectrum_div.appendChild(contour_slider_negative);
    new_spectrum_div.appendChild(contour_level_span_negative);

    /**
     * Add some spaces
     */
    new_spectrum_div.appendChild(document.createTextNode("  "));

    /**
     * A color picker element with the color of the contour plot, whose ID is "contour_color-".concat(index)
     * Set the color of the picker to the color of the spectrum
     * Also add an event listener to update the color of the contour plot
     */
    let contour_color_label_negative = document.createElement("label");
    contour_color_label_negative.setAttribute("for", "contour_color_negative-".concat(index));
    contour_color_label_negative.innerText = "Color: ";
    let contour_color_input_negative = document.createElement("input");
    contour_color_input_negative.setAttribute("type", "color");
    contour_color_input_negative.setAttribute("value", rgbToHex(new_spectrum.spectrum_color_negative));
    contour_color_input_negative.setAttribute("id", "contour_color_negative-".concat(index));
    contour_color_input_negative.addEventListener("change", (e) => { update_contour_color(e, index, 1); });
    new_spectrum_div.appendChild(contour_color_label_negative);
    new_spectrum_div.appendChild(contour_color_input_negative);

    /**
     * For experimental spectra:
     * Add a h5 element to hold the title of "Reconstructed spectrum"
     * Add a ol element to hold reconstructed spectrum
     */
    if(new_spectrum.spectrum_origin < 0)
    {
        let reconstructed_spectrum_h5 = document.createElement("h5");
        reconstructed_spectrum_h5.innerText = "Reconstructed spectrum";
        new_spectrum_div.appendChild(reconstructed_spectrum_h5);
        let reconstructed_spectrum_ol = document.createElement("ol");
        reconstructed_spectrum_ol.setAttribute("id", "reconstructed_spectrum_ol-".concat(index));   
        new_spectrum_div.appendChild(reconstructed_spectrum_ol);
    }

    /**
     * Add the new spectrum div to the list of spectra if it is from experimental data
    */
    if(hsqc_spectra[index].spectrum_origin < 0)
    {
        document.getElementById("spectra_list_ol").appendChild(new_spectrum_div);
    }
    /**
     * If the spectrum is reconstructed, add the new spectrum div to the reconstructed spectrum list
     */
    else
    {
        document.getElementById("reconstructed_spectrum_ol-".concat(hsqc_spectra[index].spectrum_origin)).appendChild(new_spectrum_div);
    }

    if(new_spectrum.spectrum_origin === -1 || new_spectrum.spectrum_origin === -2)
    {
        total_number_of_experimental_spectra += 1;
        /**
         * If we have 2 or more experimental spectra, we enable the run_Voigt_fitter button
         */
        if(total_number_of_experimental_spectra >= 2)
        {
            document.getElementById("button_run_pseudo3d_gaussian").disabled = false;
            document.getElementById("button_run_pseudo3d_voigt").disabled = false;
        }
    }

}

my_contour_worker.onmessage = (e) => {

    if (typeof e.data.message !== "undefined") {
        document.getElementById("contour_message").innerText = e.data.message;
        return;
    }
    else if(typeof e.data.remove_spectrum !== "undefined")
    {
        remove_spectrum(e.data.remove_spectrum);
        return;
    }

    /**
     * If the message is not a message, it is a result from the worker.
     */

    console.log("Message received from worker, spectral type: " + e.data.spectrum_type);


    /**
     * Type is full and hsqc_spectra.length < main_plot.levels_length_negative.length, we are adding spectrum
     */
    if (e.data.spectrum_type === "full" && hsqc_spectra.length > main_plot.levels_length_negative.length)
    {

        if(e.data.contour_sign === 0)
        {   
            /**
             * Append data to main_plot
             */
            main_plot.levels_length.push(e.data.levels_length);
            main_plot.polygon_length.push(e.data.polygon_length);
            main_plot.colors.push(hsqc_spectra[e.data.spectrum_index].spectrum_color);

            /**
             * Default contour level is 0, when total_number_of_experimental_spectra <=5
             */
            if(total_number_of_experimental_spectra <= 4)
            {
                main_plot.contour_lbs.push(0);
            }
            else
            {
                /**
                 * Set to highest level to avoid too many contour plots
                 */
                let highest_level = hsqc_spectra[e.data.spectrum_index].levels.length - 1;
                main_plot.contour_lbs.push(highest_level);
            }

            /**
             * Keep track of the start of the points array (Float32Array)
             */
            main_plot.points_start.push(main_plot.points.length);
            main_plot.points=Float32Concat(main_plot.points, new Float32Array(e.data.points));

            main_plot.spectral_information.push({
                n_direct: hsqc_spectra[e.data.spectrum_index].n_direct,
                n_indirect: hsqc_spectra[e.data.spectrum_index].n_indirect,
                x_ppm_start: hsqc_spectra[e.data.spectrum_index].x_ppm_start,
                x_ppm_step: hsqc_spectra[e.data.spectrum_index].x_ppm_step,
                y_ppm_start: hsqc_spectra[e.data.spectrum_index].y_ppm_start,
                y_ppm_step: hsqc_spectra[e.data.spectrum_index].y_ppm_step,
                x_ppm_ref: hsqc_spectra[e.data.spectrum_index].x_ppm_ref,
                y_ppm_ref: hsqc_spectra[e.data.spectrum_index].y_ppm_ref,
            });
            add_to_list(e.data.spectrum_index);
            /**
             * For experimental spectra, we add the index to the end of main_plot.spectral_order array
             */
            if(e.data.spectrum_origin<0)
            {
                main_plot.spectral_order.push(e.data.spectrum_index);
            }
            /**
             * For reconstructed spectra, we first find location of the spectrum_origin in main_plot.spectral_order array
             * Then insert the index of the new spectrum after the location
             */
            else
            {
                let index = main_plot.spectral_order.indexOf(e.data.spectrum_origin);
                main_plot.spectral_order.splice(index+1,0,e.data.spectrum_index);
            }
            main_plot.redraw_contour();
        }
        else if(e.data.contour_sign === 1)
        {
            /**
             * Append data to main_plot
             */
            main_plot.levels_length_negative.push(e.data.levels_length);
            main_plot.polygon_length_negative.push(e.data.polygon_length);
            main_plot.colors_negative.push(hsqc_spectra[e.data.spectrum_index].spectrum_color_negative);

            if(total_number_of_experimental_spectra <= 4){
                main_plot.contour_lbs_negative.push(0);
            }
            else{
                let highest_level = hsqc_spectra[e.data.spectrum_index].negative_levels.length - 1;
                main_plot.contour_lbs_negative.push(highest_level);
            }

            /**
             * Keep track of the start of the points array (Float32Array)
             */
            main_plot.points_start_negative.push(main_plot.points.length);
            main_plot.points=Float32Concat(main_plot.points, new Float32Array(e.data.points));

            /**
             * IMPORTANT: We always calculate positive contour first, then negative contour.
             * So no need to update spectral_information array again
             */
            main_plot.redraw_contour();
        }
    }

    /**
     * Type is full and  hsqc_spectra.length === main_plot.levels_length.length
     * We are updating an existing overlay to the main plot
     */
    else if (e.data.spectrum_type === "full" && hsqc_spectra.length === main_plot.levels_length.length)
    {
        let new_points = new Float32Array();

        /**
         * If contour_sign is 0, 
         * we keep the first main_plot.points[ main_plot.points_start[e.data.spectrum_index]]
         * we replace main_plot.points[ main_plot.points_start[e.data.spectrum_index]:main_plot.points_start_negative[e.data.spectrum_index]]
         * with new points data
         */
        if(e.data.contour_sign === 0)
        {
            new_points =main_plot.points.slice(0, main_plot.points_start[e.data.spectrum_index]);
            new_points = Float32Concat(new_points,new Float32Array(e.data.points));
            new_points = Float32Concat(new_points,main_plot.points.slice(main_plot.points_start_negative[e.data.spectrum_index]));
            /**
             * After calculate the length change, we update the points_start array from index+1 to the end and points_start_negative array from index to the end
             */
            let length_change = e.data.points.length - (main_plot.points_start_negative[e.data.spectrum_index] - main_plot.points_start[e.data.spectrum_index]);
            main_plot.points_start_negative[e.data.spectrum_index] += length_change;
            for(let i=e.data.spectrum_index+1;i<main_plot.points_start.length;i++)
            {
                main_plot.points_start[i] += length_change;
                main_plot.points_start_negative[i] += length_change;
            }
        }
        /**
         * if contour_sign is 1,
         * we keep the first main_plot.points[ main_plot.points_start_negative[e.data.spectrum_index]]
         * we replace main_plot.points[ main_plot.points_start_negative[e.data.spectrum_index]:main_plot.points_start[e.data.spectrum_index+1]]
         */
        else if(e.data.contour_sign === 1)
        {
            new_points = Float32Concat(new_points,main_plot.points.slice(0,main_plot.points_start_negative[e.data.spectrum_index]));
            new_points = Float32Concat(new_points,new Float32Array(e.data.points));
            if(e.data.spectrum_index+1<main_plot.points_start.length)
            {
                new_points = Float32Concat(new_points,main_plot.points.slice(main_plot.points_start[e.data.spectrum_index+1]));
            }
            /**
             * After calculate the length change, we update the points_start array from index+1 to the end and points_start_negative array from index to the end
             */
            let length_change = 0;
            if(e.data.spectrum_index+1<main_plot.points_start.length)
            {
                length_change = e.data.points.length - (main_plot.points_start[e.data.spectrum_index+1] - main_plot.points_start_negative[e.data.spectrum_index]);
            }
            else
            {
                length_change = e.data.points.length - (main_plot.points.length - main_plot.points_start_negative[e.data.spectrum_index]);
            }
            for(let i=e.data.spectrum_index+1;i<main_plot.points_start.length;i++)
            {
                main_plot.points_start[i] += length_change;
                main_plot.points_start_negative[i] += length_change;
            }
        }

        main_plot.points = new_points;
        
        /**
         * Step 2, update the levels_length array and polygon_length array
         */
        if(e.data.contour_sign === 0)
        {
            main_plot.levels_length[e.data.spectrum_index] = e.data.levels_length;
            main_plot.polygon_length[e.data.spectrum_index] = e.data.polygon_length;
        }
        else if(e.data.contour_sign === 1)
        {
            main_plot.levels_length_negative[e.data.spectrum_index] = e.data.levels_length;
            main_plot.polygon_length_negative[e.data.spectrum_index] = e.data.polygon_length;
        }

        /**
         * Step 3, update the contour plot
         */
        main_plot.redraw_contour();
    }
    /**
    * Type is partial, we are updating the contour plot with a new level (at the beginning of the levels array)
    */
    else if (e.data.spectrum_type === "partial") {
        
        let index = e.data.spectrum_index;
        let new_points = new Float32Array();
        
        if (e.data.contour_sign === 0) {
            if (index > 0) {
                new_points = main_plot.points.slice(0, main_plot.points_start[index]);
            }
            /**
            * For positive contour, we then add the new points 
            * and then add the rest of the points from main_plot.points_start[index]
            */
            new_points = Float32Concat(new_points, new Float32Array(e.data.points));
            new_points = Float32Concat(new_points, main_plot.points.slice(main_plot.points_start[index]));
            let length_change = e.data.points.length;
            main_plot.points_start_negative[index] += length_change;
            for (let i = index + 1; i < main_plot.points_start.length; i++) {
                main_plot.points_start[i] += length_change;
                main_plot.points_start_negative[i] += length_change;
            }
        }
        else if (e.data.contour_sign === 1) {
            new_points = main_plot.points.slice(0, main_plot.points_start_negative[index]);
            /**
             * Copy main_plot.points upto main_plot.points_start_negative[0] to new_points
             */
            new_points = Float32Concat(new_points, new Float32Array(e.data.points));
            new_points = Float32Concat(new_points, main_plot.points.slice(main_plot.points_start_negative[index]));
            let length_change = e.data.points.length;
            for (let i = index+1; i < main_plot.points_start.length; i++) {
                main_plot.points_start[i] += length_change;
                main_plot.points_start_negative[i] += length_change;
            }
        }
        main_plot.points = new_points;
        
        
        if(e.data.contour_sign === 0)
        {
            /**
             * Step 2, concat the new polygon_length and current polygon_length 
             * Before that, add e.data.polygon_length[last_element] to each element of main_plot.polygon_length
             */
            let polygon_shift = e.data.polygon_length[e.data.polygon_length.length-1];
            for(let i=0;i<main_plot.polygon_length[index].length;i++)
            {
                main_plot.polygon_length[index][i] += polygon_shift;
            }
            main_plot.polygon_length[index] = e.data.polygon_length.concat(main_plot.polygon_length[index]);
    
            /**
             * Step 3, concat the new levels_length and current levels_length
             * Before that, add e.data.levels_length[last_element] to each element of mainplot.levels_length
             */
            let levels_shift = e.data.levels_length[e.data.levels_length.length-1];
            for(let i=0;i<main_plot.levels_length[index].length;i++)
            {
                main_plot.levels_length[index][i] += levels_shift;
            }
            main_plot.levels_length[index] = e.data.levels_length.concat(main_plot.levels_length[index]);
        }
        else
        {
            /**
             * Step 2, concat the new polygon_length and current polygon_length 
             * Before that, add e.data.polygon_length[last_element] to each element of main_plot.polygon_length
             */
            let polygon_shift = e.data.polygon_length[e.data.polygon_length.length-1];
            for(let i=0;i<main_plot.polygon_length_negative[index].length;i++)
            {
                main_plot.polygon_length_negative[index][i] += polygon_shift;
            }
            main_plot.polygon_length_negative[index] = e.data.polygon_length.concat(main_plot.polygon_length_negative[index]);
    
            /**
             * Step 3, concat the new levels_length and current levels_length
             * Before that, add e.data.levels_length[last_element] to each element of mainplot.levels_length
             */
            let levels_shift = e.data.levels_length[e.data.levels_length.length-1];
            for(let i=0;i<main_plot.levels_length_negative[index].length;i++)
            {
                main_plot.levels_length_negative[index][i] += levels_shift;
            }
            main_plot.levels_length_negative[index] = e.data.levels_length.concat(main_plot.levels_length_negative[index]);
        }
        main_plot.redraw_contour();
    }

    

    document.getElementById("contour_message").innerText = "";
};

/**
 * This function should be called only once when the first spectrum is loaded
 * to initialize the big plot
 * @param {obj} input an spectrum object. 
 */
function init_plot(input) {

    /**
     * main_plot need to know the size of the plot with ID visualization
     */
    let current_width = document.getElementById("visualization").style.width;
    let current_height = document.getElementById("visualization").style.height;

    /**
     * Remove px from the width and height
     */
    current_width = current_width.substring(0, current_width.length - 2);
    current_height = current_height.substring(0, current_height.length - 2);

    input.PointData = [];
    input.WIDTH = current_width;
    input.HEIGHT = current_height;
    input.MARGINS = { top: 20, right: 20, bottom: 70, left: 70 };
    input.drawto = "#visualization";
    input.drawto_legend = "#legend";
    input.drawto_peak = "#peaklist";
    input.drawto_contour = "canvas1"; //webgl background as contour plot

    /**
     * Check whether checkbox Horizontal_cross_section and Vertical_cross_section are checked
     */
    input.horizontal = document.getElementById("Horizontal_cross_section").checked;
    input.vertical = document.getElementById("Vertical_cross_section").checked;


    main_plot = new plotit(input);
    main_plot.draw();


    /**
     * INitialize the contour plot with empty data
     */
    main_plot.polygon_length = [];
    main_plot.polygon_length_negative = [];
    main_plot.levels_length = [];
    main_plot.levels_length_negative = [];
    main_plot.colors = [];
    main_plot.colors_negative = [];
    main_plot.contour_lbs = [];
    main_plot.contour_lbs_negative = [];
    main_plot.spectral_information = [];
    main_plot.spectral_order = [];
    main_plot.points_start = [];
    main_plot.points_start_negative = [];
    main_plot.points = new Float32Array();

    /**
     * Add event listener to checkbox Horizontal_cross_section and Vertical_cross_section
     */
    document.getElementById("Horizontal_cross_section").addEventListener("change", function () {
        main_plot.horizontal = this.checked;
    });

    document.getElementById("Vertical_cross_section").addEventListener("change", function () {
        main_plot.vertical = this.checked;
    });

    /**
     * Event listener for peak_color, peak_size and peak_thickness
     */
    document.getElementById("peak_color").addEventListener('change', function () {
        main_plot.peak_color = this.value;
        main_plot.redraw_peaks();
    });

    document.getElementById("peak_size").addEventListener('change', function () {
        main_plot.peak_size = parseInt(this.value);
        main_plot.redraw_peaks();
    });

    document.getElementById("peak_thickness").addEventListener('change', function () {
        main_plot.peak_thickness = parseInt(this.value);
        main_plot.redraw_peaks();
    });
};





function resetzoom() {
    main_plot.resetzoom();
}

function popzoom() {
    main_plot.popzoom();
}

function zoomout() {
    main_plot.zoomout();
}

function toggle_contour() {
    main_plot.toggle_contour();
}

function toggle_peak() {
    main_plot.toggle_peak();
}

/**
 * Event listener for onblur event of ref1 and ref2 input fields
 */
function adjust_ref(index, flag) {
    
    if (flag === 0) {
        let new_ref = parseFloat(document.getElementById("ref1".concat("-").concat(index)).value);
        hsqc_spectra[index].x_ppm_ref = new_ref;
        main_plot.spectral_information[index].x_ppm_ref = new_ref;
    }
    else if (flag === 1) {
        let new_ref = parseFloat(document.getElementById("ref2".concat("-").concat(index)).value);
        hsqc_spectra[index].y_ppm_ref = new_ref;
        main_plot.spectral_information[index].y_ppm_ref = new_ref;
    }
    /**
     * Redraw the contour plot
     */
    main_plot.redraw_contour();
}


/**
 * Event listener for button reduce_contour
 */
function reduce_contour(index,flag) {
    
    /**
    * Setup the spectrum_information object to be sent to the worker
    */
    let spectrum_information = {
        n_direct: hsqc_spectra[index].n_direct,
        n_indirect: hsqc_spectra[index].n_indirect,
        spectrum_type: "partial",
        spectrum_index: index,
        spectrum_origin: hsqc_spectra[index].spectrum_origin,
        contour_sign: flag
    };

    if(flag==0)
    {
        /**
         * Get current lowest level from input field contour0
         * and current scale from input field logarithmic_scale
         */
        let current_level = parseFloat(document.getElementById('contour0-'+index.toFixed(0)).value);
        let scale = parseFloat(document.getElementById('logarithmic_scale-'+index.toFixed(0)).value);

        /**
         * Reduce the level by scale
         */
        current_level /= scale;

        /**
         * Update the input field contour0
         */
        document.getElementById('contour0-'+index.toFixed(0)).value = current_level;

        /**
         * Update hsqc_spectrum.levels (add the new level to the beginning of the array)
         */
        hsqc_spectra[index].levels.unshift(current_level);

        spectrum_information.levels = [current_level];

        /**
         * Update slider.
         */
        document.getElementById("contour-slider-".concat(index)).max = hsqc_spectra[index].levels.length;
        document.getElementById("contour-slider-".concat(index)).value = 1;
        document.getElementById("contour_level-".concat(index)).innerText = hsqc_spectra[index].levels[0].toExponential(4);
    }
    else if(flag==1)
    {
        /**
         * Get current lowest level from input field contour0_negative
         *  and current scale from input field logarithmic_scale_negative
         */
        let current_level = parseFloat(document.getElementById('contour0_negative-'+index.toFixed(0)).value);
        let scale = parseFloat(document.getElementById('logarithmic_scale_negative-'+index.toFixed(0)).value);

        /**
         * Reduce the level by scale
         */
        current_level /= scale;

        /**
         * Update the input field contour0_negative
         */
        document.getElementById('contour0_negative-'+index.toFixed(0)).value = current_level;

        /**
         * Update hsqc_spectrum.levels (add the new level to the beginning of the array)
         */
        hsqc_spectra[index].negative_levels.unshift(current_level);

        spectrum_information.levels = [current_level];

        /**
         * Update slider.
         */
        document.getElementById("contour-slider_negative-".concat(index)).max = hsqc_spectra[index].negative_levels.length;
        document.getElementById("contour-slider_negative-".concat(index)).value = 1;
        document.getElementById("contour_level_negative-".concat(index)).innerText = hsqc_spectra[index].negative_levels[0].toExponential(4);
    }

    my_contour_worker.postMessage({ response_value: hsqc_spectra[index].raw_data, spectrum: spectrum_information });

}

/**
 * Event listener for text input field contour0
 */
function update_contour0_or_logarithmic_scale(index,flag) {

    let hsqc_spectrum = hsqc_spectra[index]; 

    let spectrum_information = {
        n_direct: hsqc_spectrum.n_direct,
        n_indirect: hsqc_spectrum.n_indirect,
        spectrum_type: "full",
        spectrum_index: index,
        spectrum_origin: hsqc_spectrum.spectrum_origin,
        contour_sign: flag,
    };

    if(flag==0)
    {
        let current_level = parseFloat(document.getElementById('contour0-'+index.toFixed(0)).value);
        let scale = parseFloat(document.getElementById('logarithmic_scale-'+index.toFixed(0)).value);

        /**
         * Recalculate the hsqc_spectrum.levels
         */
        hsqc_spectrum.levels[0] = current_level;
        for (let i = 1; i < 40; i++) {
            hsqc_spectrum.levels[i] = hsqc_spectrum.levels[i - 1] * scale;
            if (hsqc_spectrum.levels[i] > hsqc_spectrum.spectral_max) {
                hsqc_spectrum.levels = hsqc_spectrum.levels.slice(0, i+1);
                break;
            }
        }

        spectrum_information.levels = hsqc_spectrum.levels;
        
        /**
         * Update slider.
         */
        document.getElementById("contour-slider-".concat(index)).max = hsqc_spectrum.levels.length;
        document.getElementById("contour-slider-".concat(index)).value = 1;
        document.getElementById("contour_level-".concat(index)).innerText = hsqc_spectrum.levels[0].toExponential(4);
    }
    else if(flag==1)
    {
        let current_level = parseFloat(document.getElementById('contour0_negative-'+index.toFixed(0)).value);
        let scale = parseFloat(document.getElementById('logarithmic_scale_negative-'+index.toFixed(0)).value);

        /**
         * Recalculate the hsqc_spectrum.levels
         */
        hsqc_spectrum.negative_levels[0] = current_level;
        for (let i = 1; i < 40; i++) {
            hsqc_spectrum.negative_levels[i] = hsqc_spectrum.negative_levels[i - 1] * scale;
            if (hsqc_spectrum.negative_levels[i] < hsqc_spectrum.spectral_min) {
                hsqc_spectrum.negative_levels = hsqc_spectrum.negative_levels.slice(0, i+1);
                break;
            }
        }

        /**
         * Update slider.
         */
        document.getElementById("contour-slider_negative-".concat(index)).max = hsqc_spectrum.negative_levels.length;
        document.getElementById("contour-slider_negative-".concat(index)).value = 1;
        document.getElementById("contour_level_negative-".concat(index)).innerText = hsqc_spectrum.negative_levels[0].toExponential(4);

        spectrum_information.levels = hsqc_spectrum.negative_levels;
    }


    my_contour_worker.postMessage({ response_value: hsqc_spectrum.raw_data, spectrum: spectrum_information });



}

/**
 * Event listener for slider contour-slider
 */
function update_contour_slider(e,index,flag) {

    /**
     * Get new level from the slider value
     */
    let level = parseInt(e.target.value);

    if(flag === 'positive')
    {
        /**
         * Update text of corresponding contour_level
         */
        document.getElementById("contour_level-".concat(index)).innerText = hsqc_spectra[index].levels[level - 1].toExponential(4);

        /**
         * Update the current lowest shown level in main_plot
         */
        main_plot.contour_lbs[index] = level - 1;

        /**
         * Update peaks only if current index is the same as current spectrum index of peaks
         * and current spectrum has picked peaks and is visible
         */
        if(current_spectrum_index_of_peaks === index )
        {
            let level = hsqc_spectra[index].levels[main_plot.contour_lbs[index]];
            main_plot.set_peak_level(level);
            main_plot.draw_peaks();
        }

    }
    else if(flag === 'negative')
    {
        /**
         * Update text of corresponding contour_level
         */
        document.getElementById("contour_level_negative-".concat(index)).innerText = hsqc_spectra[index].levels[level - 1].toExponential(4);

        /**
         * Update the current lowest shown level in main_plot
         */
        main_plot.contour_lbs_negative[index] = level - 1;
    }

    main_plot.redraw_contour();

}


/**
 * Event listener for color picker contour_color
 */
function update_contour_color(e,index,flag) {

    let color = e.target.value;

    /**
     * Update the color of the spectrum
    */
    if(flag==0)
    {
        hsqc_spectra[index].spectrum_color = color;
        main_plot.colors[index] = hexToRgb(color);
    }
    else if(flag==1)
    {
        hsqc_spectra[index].spectrum_color_negative = color;
        main_plot.colors_negative[index] = hexToRgb(color);
    }
    
    /**
     * Update the color of the contour plot
     */
    
    main_plot.redraw_contour();
}



const read_file_and_process_ft2 = (file) => {
    return new Promise((resolve, reject) => {
        if (file) {
            var reader = new FileReader();
            reader.onload = function () {
                var arrayBuffer = reader.result;

                // var data = new Uint8Array(reader.result);
                // Module['FS_createDataFile']('/', 'test.ft2', data, true, true, true);

                let result = process_ft_file(arrayBuffer, file.name,-1);
                resolve(result);
            };
            reader.onerror = function (e) {
                reject("Error reading file");
            };
            reader.readAsArrayBuffer(file);
        }
        else {
            reject("No file selected");
        }
    });
} //end of read_file_and_process_ft2

/**
 * Process the raw file data of a 2D FT spectrum
 * @param {arrayBuffer} arrayBuffer: raw file data
 * @returns hsqc_spectra object
 */
function process_ft_file(arrayBuffer,file_name, spectrum_type) {

    let result = new spectrum();

    result.spectrum_origin = spectrum_type;

    result.header = new Float32Array(arrayBuffer, 0, 512);

    result.n_indirect = result.header[219]; //size of indirect dimension of the input spectrum
    result.n_direct = result.header[99]; //size of direct dimension of the input spectrum

    result.tp = result.header[221];

    /**
     * if transposed, set result.error and return
     */
    if (result.tp !== 0) {
        result.error = "Transposed data, please un-transpose the data before loading";
        return result;
    }

    /**
     * Datatype of the direct and indirect dimension
     * 0: complex
     * 1: real
     */
    result.datatype_direct = result.header[55];
    result.datatype_indirect = result.header[56];

    /**
     * We only read real at this moment
     */
    if (result.datatype_direct !== 1 || result.datatype_indirect !== 1) {
        result.error = "Only real data is supported";
        return result;
    }

    result.direct_ndx = result.header[24]; //must be 2
    result.indirect_ndx = result.header[25]; //must be 1 or 3
    /**
     * direct_ndx must be 1, otherwise set error and return
     */
    if (result.direct_ndx !== 2) {
        result.error = "Direct dimension must be the second dimension";
        return result;
    }
    /**
     * indirect_ndx must be 1 or 3, otherwise set error and return
     */
    if (result.indirect_ndx !== 1 && result.indirect_ndx !== 3) {
        result.error = "Indirect dimension must be the first or third dimension";
        return result;
    }

    /**
     * result.sw, result.frq,result.ref are the spectral width, frequency and reference of the direct dimension
     * All are array of length 4
     */
    result.sw = [];
    result.frq = [];
    result.ref = [];

    result.sw[0] = result.header[229];
    result.sw[1] = result.header[100];
    result.sw[2] = result.header[11];
    result.sw[3] = result.header[29];

    result.frq[0] = result.header[218];
    result.frq[1] = result.header[119];
    result.frq[2] = result.header[10];
    result.frq[3] = result.header[28];

    result.ref[0] = result.header[249];
    result.ref[1] = result.header[101];
    result.ref[2] = result.header[12];
    result.ref[3] = result.header[30];

    /**
     * Get ppm_start, ppm_width, ppm_step for both direct and indirect dimensions
     */
    result.sw1 = result.sw[result.direct_ndx - 1];
    result.sw2 = result.sw[result.indirect_ndx - 1];
    result.frq1 = result.frq[result.direct_ndx - 1];
    result.frq2 = result.frq[result.indirect_ndx - 1];
    result.ref1 = result.ref[result.direct_ndx - 1];
    result.ref2 = result.ref[result.indirect_ndx - 1];


    result.x_ppm_start = (result.ref1 + result.sw1) / result.frq1;
    result.x_ppm_width = result.sw1 / result.frq1;
    result.y_ppm_start = (result.ref2 + result.sw2) / result.frq2;
    result.y_ppm_width = result.sw2 / result.frq2;
    result.x_ppm_step = -result.x_ppm_width / result.n_direct;
    result.y_ppm_step = -result.y_ppm_width / result.n_indirect;

    /**
     * shift by half of the bin size because the contour plot is defined by the center of each bin
     */
    result.x_ppm_start -= result.x_ppm_width / result.n_direct / 2;
    result.y_ppm_start -= result.y_ppm_width / result.n_indirect / 2;

    result.x_ppm_ref = 0.0;
    result.y_ppm_ref = 0.0;


    let data_size = arrayBuffer.byteLength / 4 - 512;

    result.raw_data = new Float32Array(arrayBuffer, 512 * 4, data_size);

    /**
     * Keep original file name
     */
    result.filename = file_name;

    /**
     * Get median of abs(z). If data_size is > 1024*1024, we will sample 1024*1024 points by stride
     */
    let stride = 1;
    if (data_size > 1024 * 1024) {
        stride = Math.floor(data_size / (1024 * 1024));
    }
    let z_abs = new Float32Array(data_size / stride);
    for (var i = 0; i < data_size; i += stride) {
        z_abs[Math.floor(i / stride)] = Math.abs(result.raw_data[i]);
    }
    z_abs.sort();
    result.noise_level = z_abs[Math.floor(z_abs.length / 2)];

    /**
     * Get max and min of z (z is sorted)
     */
    [result.spectral_max, result.spectral_min] = find_max_min(result.raw_data);

    /**
     * In case of reconstructed spectrum from fitting or from NUS, noise_level is usually 0.
     * In that case, we define noise_level as spectral_max/power(1.5,40)
     */
    if(result.noise_level <= Number.MIN_VALUE)
    {
        result.noise_level = result.spectral_max/Math.pow(1.5,40);
    }

    /**
     * Calculate positive contour levels 
     */
    result.levels = new Array(40);
    result.levels[0] = 5.5 * result.noise_level;
    for (let i = 1; i < result.levels.length; i++) {
        result.levels[i] = 1.5 * result.levels[i - 1];
        if (result.levels[i] > result.spectral_max) {
            result.levels = result.levels.slice(0, i+1);
            break;
        }
    }

    /**
     * Calculate negative contour levels
     */
    result.negative_levels = new Array(40);
    result.negative_levels[0] = -5.5 * result.noise_level;
    for (let i = 1; i < result.negative_levels.length; i++) {
        result.negative_levels[i] = 1.5 * result.negative_levels[i - 1];
        if (result.negative_levels[i] < result.spectral_min) {
            result.negative_levels = result.negative_levels.slice(0, i+1);
            break;
        }
    }

    return result;
}

/**
 * Download spectrum
 *
 */
 function download_spectrum(index,flag) {

    let data;
    let filename;

    if(flag==='original')
    {
        filename = hsqc_spectra[index].filename;
        /**
         * generate a blob, which is hsqc_spectra[index].header + hsqc_spectra[index].raw_data
         */
        data = Float32Concat(hsqc_spectra[index].header, hsqc_spectra[index].raw_data);
    }
    else if(flag==='diff')
    {   
        /**
         * Replace recon with diff in the filename, if not found, add diff- to the filename at the beginning
         */
        filename = hsqc_spectra[index].filename.replace('recon','diff');
        if(filename === hsqc_spectra[index].filename)
        {
            filename = 'diff-'.concat(hsqc_spectra[index].filename);
        }

        /**
         * Get the original spectrum index
         */
        let spectrum_origin = hsqc_spectra[index].spectrum_origin;
        /**
         * Calcualte difference spectrum, which is hsqc_spectra[index].raw_data - hsqc_spectra[spectrum_origin].raw_data
         */
        let diff_data = new Float32Array(hsqc_spectra[index].raw_data.length);
        for(let i=0;i<hsqc_spectra[index].raw_data.length;i++)
        {
            diff_data[i] = hsqc_spectra[index].raw_data[i] - hsqc_spectra[spectrum_origin].raw_data[i];
        }
        /**
         * generate a blob, which is hsqc_spectra[index].header + diff_data
         */
        data = Float32Concat(hsqc_spectra[index].header, diff_data);
    }


    let blob = new Blob([data], { type: 'application/octet-stream' });
    let url = URL.createObjectURL(blob);
    let a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
 }

/**
 * Add a new spectrum to the list and update the contour plot
 * @param {*} result_spectrum: an object of hsqc_spectrum
 * @returns 
 */
function draw_spectrum(result_spectrum)
{
    if(typeof result_spectrum.error !== "undefined")
    {
        alert(result_spectrum.error);
        return;
    }

    let spectrum_index = hsqc_spectra.length;
    result_spectrum.spectrum_index = spectrum_index;
    result_spectrum.spectrum_color = color_list[(spectrum_index*2) % color_list.length];
    result_spectrum.spectrum_color_negative = color_list[(spectrum_index*2+1) % color_list.length];
    hsqc_spectra.push(result_spectrum);
    

    /**
     * initialize the plot with the first spectrum. This function only run once
     */
    if(hsqc_spectra.length === 1)
    {
        init_plot(hsqc_spectra[0]);
    }

    /**
     * Positive contour calculation for the spectrum
     */
    let spectrum_information = {
        /**
         * n_direct,n_indirect, and levels are required for contour calculation
         */
        n_direct: result_spectrum.n_direct,
        n_indirect: result_spectrum.n_indirect,
        levels: result_spectrum.levels,

        /**
         * These are flags to be send back to the main thread
         * so that the main thread know which part to update
         * @var spectrum_type: "full": all contour levels or "partial": new level added at the beginning
         * @var spectrum_index: index of the spectrum in the hsqc_spectra array
         * @var contour_sign: 0: positive contour, 1: negative contour
         */
        spectrum_type: "full",
        spectrum_index: spectrum_index,
        spectrum_origin: result_spectrum.spectrum_origin,
        contour_sign: 0
    };
    my_contour_worker.postMessage({ response_value: result_spectrum.raw_data, spectrum: spectrum_information });

    /**
     * Negative contour calculation for the spectrum
     */
    spectrum_information.contour_sign = 1;
    spectrum_information.levels = result_spectrum.negative_levels;
    my_contour_worker.postMessage({ response_value: result_spectrum.raw_data, spectrum: spectrum_information });
  
}

/**
 * Concat two float32 arrays into one
 * @returns the concatenated array
 */
function Float32Concat(first, second)
{
    var firstLength = first.length,
        result = new Float32Array(firstLength + second.length);

    result.set(first);
    result.set(second, firstLength);

    return result;
}

/**
 * Find max and min of a Float32Array
 */
function find_max_min(data)
{
    let max = data[0];
    let min = data[0];
    for(let i=1;i<data.length;i++)
    {
        if(data[i] > max)
        {
            max = data[i];
        }
        if(data[i] < min)
        {
            min = data[i];
        }
    }
    return [max,min];
}

/**
 * Convert an RGB array to a hexadecimal string
 */
function rgbToHex(rgb) {
    return "#" + ((1 << 24) + (Math.round(rgb[0] * 255) << 16) + (Math.round(rgb[1] * 255) << 8) + Math.round(rgb[2] * 255)).toString(16).slice(1);
}

/**
 * Convert a hexadecimal string to an RGB array
 */
function hexToRgb(hex) {
    let r = parseInt(hex.substring(1, 3), 16) / 255;
    let g = parseInt(hex.substring(3, 5), 16) / 255;
    let b = parseInt(hex.substring(5, 7), 16) / 255;
    return [r, g, b, 1.0];
}

/**
 * Convert SVG to PNG code
 */
const dataHeader = 'data:image/svg+xml;charset=utf-8';


const loadImage = async url => {
  const $img = document.createElement('img')
  $img.src = url
  return new Promise((resolve, reject) => {
    $img.onload = () => resolve($img)
    $img.onerror = reject
  })
}

const serializeAsXML = $e => (new XMLSerializer()).serializeToString($e);
const encodeAsUTF8 = s => `${dataHeader},${encodeURIComponent(s)}`;

async function download_plot()
{
    const format = 'png';

    const $svg = document.getElementById('visualization'); 

    /**
     * Generate an Image (from canvas1) 
     */
    var contour_image = new Image();
    contour_image.src = main_plot.contour_plot.drawScene(1);

    /**
     * Create a canvas element
     */

    const svgData = encodeAsUTF8(serializeAsXML($svg))

    const img = await loadImage(svgData);
    
    const $canvas = document.createElement('canvas')
    $canvas.width = $svg.clientWidth
    $canvas.height = $svg.clientHeight
    $canvas.getContext('2d').fillStyle = "white";
    $canvas.getContext('2d').fillRect(0, 0, $svg.clientWidth, $svg.clientHeight);
    $canvas.getContext('2d').drawImage(contour_image,70,20,$svg.clientWidth-90,$svg.clientHeight-90);
    $canvas.getContext('2d').drawImage(img, 0, 0, $svg.clientWidth, $svg.clientHeight)
    
    const dataURL = await $canvas.toDataURL(`image/${format}`, 1.0)
    
    const $img = document.createElement('img');
    $img.src = dataURL;

    /**
     * Download the image
     */
    const a = document.createElement('a');
    a.href = dataURL;
    a.download = 'nmr_plot.' + format;
    a.click();
}


/**
 * Call DEEP Picker to run peaks picking the spectrum
 * @param {int} spectrum_index: index of the spectrum in hsqc_spectra array
 */
function run_DEEP_Picker(spectrum_index)
{
    /**
     * Disable the buttons to run deep picker and voigt fitter
     */
    document.getElementById("run_deep_picker-".concat(spectrum_index)).disabled = true;
    document.getElementById("run_voigt_fitter0-".concat(spectrum_index)).disabled = true;
    document.getElementById("run_voigt_fitter1-".concat(spectrum_index)).disabled = true;


    /**
     * Combine hsqc_spectra[0].raw_data and hsqc_spectra[0].header into one Float32Array
     */
    let data = Float32Concat(hsqc_spectra[spectrum_index].header, hsqc_spectra[spectrum_index].raw_data);
    /**
     * Convert to Uint8Array to be transferred to the worker
     */
    let data_uint8 = new Uint8Array(data.buffer);

    /**
     * Get noise_level of the spectrum
     * And current lowest contour level of the spectrum
     * Calculate scale as lowest contour level / noise_level
     * and scale2 as 0.6 * scale
     */
    let noise_level = hsqc_spectra[spectrum_index].noise_level;
    let level = hsqc_spectra[spectrum_index].levels[main_plot.contour_lbs[spectrum_index]];
    let scale = level / noise_level;
    let scale2 = 0.6 * scale;

    /**
     * Add title to textarea "log"
     */
    webassembly_worker.postMessage({
        spectrum_data: data_uint8,
        spectrum_index: spectrum_index,
        scale: scale,
        scale2: scale2,
        noise_level: noise_level
    });
    /**
 * Let user know the processing is started
 */
    document.getElementById("webassembly_message").innerText = "Run DEEP Picker, please wait...";

}

/**
 * Call Voigt fitter to run peak fitting on the spectrum
 * @param {int} spectrum_index: index of the spectrum in hsqc_spectra array
 */
function run_Voigt_fitter(spectrum_index,flag)
{
    /**
     * Disable the buttons to run deep picker and voigt fitter
     */
    document.getElementById("run_deep_picker-".concat(spectrum_index)).disabled = true;
    document.getElementById("run_voigt_fitter0-".concat(spectrum_index)).disabled = true;
    document.getElementById("run_voigt_fitter1-".concat(spectrum_index)).disabled = true;

    /**
     * Get maxround input field with ID "maxround-"+spectrum_index
     */
    let maxround = parseInt(document.getElementById("maxround-"+spectrum_index).value);

    /**
     * Get number input field with ID "combine_peak_cutoff-"+spectrum_index
     */
    let combine_peak_cutoff = parseFloat(document.getElementById("combine_peak_cutoff-"+spectrum_index).value);

    /**
     * Get subset of the picked peaks (within visible region)
     * start < end from the get_visible_region function call
     */
    [x_ppm_visible_start, x_ppm_visible_end, y_ppm_visible_start, y_ppm_visible_end] = main_plot.get_visible_region();

    let picked_peaks = hsqc_spectra[spectrum_index].picked_peaks.filter(function (peak) {
        return peak.cs_x >= x_ppm_visible_start && peak.cs_x <= x_ppm_visible_end && peak.cs_y >= y_ppm_visible_start && peak.cs_y <= y_ppm_visible_end;
    });


    /**
     * Combine hsqc_spectra[0].raw_data and hsqc_spectra[0].header into one Float32Array
     */
    let data = Float32Concat(hsqc_spectra[spectrum_index].header, hsqc_spectra[spectrum_index].raw_data);
    /**
     * Convert to Uint8Array to be transferred to the worker
     */
    let data_uint8 = new Uint8Array(data.buffer);

    webassembly_worker.postMessage({
        spectrum_data: data_uint8,
        picked_peaks: picked_peaks,
        spectrum_index: spectrum_index,
        combine_peak_cutoff: combine_peak_cutoff,
        maxround: maxround,
        flag: flag, //0: Voigt, 1: Gaussian
        scale: hsqc_spectra[spectrum_index].scale,
        scale2: hsqc_spectra[spectrum_index].scale2,
        noise_level: hsqc_spectra[spectrum_index].noise_level
    });
    /**
     * Let user know the processing is started
     */
    document.getElementById("webassembly_message").innerText = "Run Peak fitting, please wait...";

}

/**
 * Show or hide peaks on the plot
 */
function show_hide_peaks(index,flag,b_show)
{
    /**
     * Disable main_plot.allow_brush_to_remove and checkbox:
     * allow_brush_to_remove
     * allow_drag_and_drop
     * allow_click_to_add_peak
     */
    main_plot.allow_brush_to_remove = false;
    document.getElementById("allow_brush_to_remove").checked = false;
    document.getElementById("allow_brush_to_remove").disabled = true;
    document.getElementById("allow_drag_and_drop").checked = false;
    document.getElementById("allow_drag_and_drop").disabled = true;
    document.getElementById("allow_click_to_add_peak").checked = false;
    document.getElementById("allow_click_to_add_peak").disabled = true;
    
    /**
     * Turn off checkbox of all other spectra
     */
    for(let i=0;i<hsqc_spectra.length;i++)
    {
        if(i!==index)
        {
            /**
             * If spectrum is deleted, these checkboxes are no longer available.
             * So we need to check if they are available
             */
            if(hsqc_spectra[i].spectrum_origin !== -3)
            {
                document.getElementById("show_peaks-"+i).checked = false;
                document.getElementById("show_fitted_peaks-"+i).checked = false;
            }
        }
        /**
         * uncheck the checkbox of the current spectrum
         */
        else
        {
            if(flag === 'picked')
            {
                document.getElementById("show_fitted_peaks-"+i).checked = false;
            }
            else if(flag === 'fitted')
            {
                document.getElementById("show_peaks-"+i).checked = false;
            }
        }
    }

    /**
     * If index is not -2, we need to uncheck the checkbox of pseudo 3D peaks
     */
    if(index!==-2)
    {
        document.getElementById("show_pseudo3d_peaks").checked = false;
    }


    if(index==-2 && b_show)
    {
        current_spectrum_index_of_peaks = index;
        current_flag_of_peaks = 'fitted';
        /**
         * flag is always 'fitted' for pseudo 3D peaks.
         * First define a dummy hsqc_spectrum object. When flag is fitted, main_plot will only use fitted_peaks of the spectrum
         */
        let pseudo3d_spectrum = new spectrum();
        pseudo3d_spectrum.fitted_peaks = pseudo3d_fitted_peaks;

        main_plot.add_peaks(pseudo3d_spectrum,'fitted');
    }

    else if(b_show)
    {
        current_spectrum_index_of_peaks = index;
        current_flag_of_peaks = flag;

        /**
         * Get current lowest contour level of the spectrum
         */
        let level = hsqc_spectra[index].levels[main_plot.contour_lbs[index]];
        main_plot.set_peak_level(level);

        if(flag === 'picked')
        {
            /**
             * Only for picked peaks of an experimental spectrum, allow user to make changes
             */
            if(hsqc_spectra[index].spectrum_origin === -1 || hsqc_spectra[index].spectrum_origin === -2)
            {
                document.getElementById("allow_brush_to_remove").disabled = false;
                document.getElementById("allow_drag_and_drop").disabled = false;
                document.getElementById("allow_click_to_add_peak").disabled = false;
            }
        }
        main_plot.add_peaks(hsqc_spectra[index],flag);
        
    }
    else
    {
        current_spectrum_index_of_peaks = -1; // -1 means no spectrum is selected. flag is not important
        main_plot.remove_picked_peaks();
    }
    /**
     * There is no need to redraw the contour plot
     */
}

/**
 * Download pseudo 3D peak fitting result
 */
function download_pseudo3d(flag)
{
    /**
     * var pseudo3d_fitted_peaks is a long multi-line string in .tab format, 
     * we only need to save it as a text file
     */
    let blob;
    if(flag==0){
        blob = new Blob([pseudo3d_fitted_peaks_tab], { type: 'text/plain' });
    }
    else 
    {
        blob = new Blob([pseudo3d_fitted_peaks_tab_ass], { type: 'text/plain' });
    }
    let url = URL.createObjectURL(blob);
    let a = document.createElement('a');
    a.href = url;
    a.download = "pseudo3d.tab";
    a.click();
}


/**
 * Generate a list of peaks in nmrPipe .tab format
 */
function download_peaks(spectrum_index,flag)
{
    let file_buffer;

    if(flag === 'picked')
    {
        let peaks = hsqc_spectra[spectrum_index].picked_peaks;
        file_buffer = "VARS INDEX X_AXIS Y_AXIS X_PPM Y_PPM XW YW HEIGHT\nFORMAT %5d %9.3f %9.3f %10.6f %10.6f %7.3f %7.3f %+e\n";
        for(let i=0;i<peaks.length;i++)
        {   
            /**
             * Get points from ppm. Do not apply the reference ppm here !!
             */
            let x_point = Math.round((peaks[i].cs_x - hsqc_spectra[spectrum_index].x_ppm_start) / hsqc_spectra[spectrum_index].x_ppm_step);
            let y_point = Math.round((peaks[i].cs_y - hsqc_spectra[spectrum_index].y_ppm_start) / hsqc_spectra[spectrum_index].y_ppm_step);
            /**
             * Get FWHH from sigma and gamma as
             *  width = 0.5346 * gammax * 2 + sqrt(0.2166 * 4 * gammax * gammax + sigmax * sigmax * 8 * 0.6931);
             */
            let xw = 0.5346 * peaks[i].gammax * 2 + Math.sqrt(0.2166 * 4 * peaks[i].gammax * peaks[i].gammax + peaks[i].sigmax * peaks[i].sigmax * 8 * 0.6931);
            let yw = 0.5346 * peaks[i].gammay * 2 + Math.sqrt(0.2166 * 4 * peaks[i].gammay * peaks[i].gammay + peaks[i].sigmay * peaks[i].sigmay * 8 * 0.6931);
    
            /**
             * This is a peak object peaks[i] example for picked peaks.
             * cs_x: 1.241449 ==> X_PPM, need to add x_ppm_ref
             * cs_y : 20.02922 ==> Y_PPM, need to add y_ppm_ref
             * gammax : 0.61602
             * gammay : 0.40042
             * index : 8000088.5 ==> HEIGHT
             * sigmax : 1.304711
             * sigmay : 1.530022
             * type : 1
             * i will be the index of the peak
            */
            file_buffer += (i+1).toFixed(0).padStart(5) + " ";
            file_buffer += x_point.toFixed(3).padStart(9) + " ";
            file_buffer += y_point.toFixed(3).padStart(9) + " ";
            file_buffer += (peaks[i].cs_x + hsqc_spectra[spectrum_index].x_ppm_ref).toFixed(6).padStart(10) + " ";
            file_buffer += (peaks[i].cs_y + hsqc_spectra[spectrum_index].y_ppm_ref).toFixed(6).padStart(10) + " ";
            file_buffer += xw.toFixed(3).padStart(7) + " ";
            file_buffer += yw.toFixed(3).padStart(7) + " ";
            file_buffer += peaks[i].index.toExponential(6) + " ";
            file_buffer += "\n";
        }
    }
    else if(flag === 'fitted')
    {
        file_buffer = hsqc_spectra[spectrum_index].fitted_peaks_tab;
    }

    let blob = new Blob([file_buffer], { type: 'text/plain' });
    let url = URL.createObjectURL(blob);
    let a = document.createElement('a');
    a.href = url;
    a.download = hsqc_spectra[spectrum_index].filename + ".tab";
    a.click();

    /**
     * Remove the url and a
     */
    URL.revokeObjectURL(url);
    a.remove();
}

/**
 * Remove a reconstructed spectrum from the list and data.
 * This function will send a message to the contour worker,
 * The contour worker will send it back to the main thread 
 * then the main thread will call remove_spectrum(index) to remove the spectrum
 * This is to make sure that the contour plot is updated correctly (single thread for the contour plot)
 */
function remove_spectrum_caller(index)
{
    /**
     * Send a message to the contour worker to remove the spectrum
     */
    my_contour_worker.postMessage({ remove_spectrum: index });
}

/**
 * 
 * ACtually remove a reconstructed spectrum from the list and data
 */
function remove_spectrum(index)
{
    /**
     * Remove all children of the <li> element with id "spectrum-index"
     * but keep the <li> element, because main_plot.spectrum_order can't reduce the length
     * Also set it hidden
     */
    document.getElementById("spectrum-".concat(index)).innerHTML = "";
    document.getElementById("spectrum-".concat(index)).style.display = "none";

    /**
     * Because we make extensive use of spectrum index and we don't want to change the index of the spectrum
     * So we remove its data (array member only), but keep the object in the array
     */
    hsqc_spectra[index].raw_data = new Float32Array();
    hsqc_spectra[index].header = new Float32Array();
    hsqc_spectra[index].levels = [];
    hsqc_spectra[index].negative_levels = [];
    hsqc_spectra[index].picked_peaks = [];
    hsqc_spectra[index].fitted_peaks = [];
    hsqc_spectra[index].spectrum_origin = -3; // -3 means the spectrum is removed

    /**
     * Remove its contour data from main_plot and redraw the contour plot
     */
    main_plot.levels_length[index] = [];
    main_plot.polygon_length[index] = [];
    main_plot.levels_length_negative[index] = [];
    main_plot.polygon_length_negative[index] = [];
    /**
     * Now remove main_plot.points (type is Float32Array)
     * from the  main_plot.points_start[index] main_plot.points_start[index+1]
     * (This means we also removed the negative contour points)
     */
    if(index === hsqc_spectra.length - 1) //last spectrum
    {
        main_plot.points = main_plot.points.slice(0, main_plot.points_start[index]);
    }
    else
    {
        const n_removed = main_plot.points_start[index + 1] - main_plot.points_start[index];
        main_plot.points = Float32Concat( main_plot.points.slice(0, main_plot.points_start[index]), main_plot.points.slice(main_plot.points_start[index + 1]));
        /**
         * We need to update main_plot.points_start and main_plot.points_start_negative from index+1
         */
        for (let i = index + 1; i < main_plot.points_start.length; i++) {
            main_plot.points_start[i] -= n_removed;
            main_plot.points_start_negative[i] -= n_removed;
        }
    }
    main_plot.points_start_negative[index]=main_plot.points_start[index];

    main_plot.redraw_contour();
}

/**
 * Clear the textarea log
 */
function clear_log()
{
    document.getElementById("log").value = "";
}

/**
 * Save the current textarea log to a file
 */
function download_log()
{
    let log = document.getElementById("log").value;
    let blob = new Blob([log], { type: 'text/plain' });
    let url = URL.createObjectURL(blob);
    let a = document.createElement('a');
    a.href = url;
    a.download = "log.txt";
    a.click();

    /**
     * Remove the url and a
     */
    URL.revokeObjectURL(url);
    a.remove();
}


function median(values) 
{
    if (values.length === 0) {
      throw new Error('Input array is empty');
    }
  
    // Sorting values, preventing original array
    // from being mutated.
    values = [...values].sort((a, b) => a - b);
  
    const half = Math.floor(values.length / 2);
  
    return (values.length % 2
      ? values[half]
      : (values[half - 1] + values[half]) / 2
    );
  
}