/**
 * Workflows:
 * 1. Read ft2 or read fid files. If FID, run webassembly_worker to process the FID (webassembly_worker2 for NUS) 
 * 2. Once ft2 files are read or generated from FID, call functions pair: process_ft_file and draw_spectrum
 * 3. Draw_spectrum will push the new spectrum object to hsqc_spectra array. Order in the array depends on who is generated first (ft2 may jump before fid even if fid is read first)
 * 4. Draw_spectrum will call contour_worker to generate contour plot from the spectrum object
 * 5. When all contour (pos and neg) are generated, contour_worker will send the data back to the main thread to show call and add_to_list()
 */


/**
 * Make sure we can load WebWorker
*/

var my_contour_worker, webassembly_worker, webassembly_worker2;

try {
    my_contour_worker = new Worker('./js/contour.js');
    webassembly_worker = new Worker('./js/webass.js');
    webassembly_worker2 = new Worker('./js/webass2.js');
}
catch (err) {
    console.log(err);
    if (typeof (my_contour_worker) === "undefined" 
        || typeof (webassembly_worker) === "undefined"
        || typeof (webassembly_worker2) === "undefined")
    {
        alert("Failed to load WebWorker, probably due to browser incompatibility. Please use a modern browser, if you run this program locally, please read the instructions titled 'How to run COLMAR Viewer locally'");
    }
}


var main_plot = null; //hsqc plot object
var b_plot_initialized = false; //flag to indicate if the plot is initialized
var tooldiv; //tooltip div (used by myplot1_new.js, this is not a good practice, but it is a quick fix)
var current_spectrum_index_of_peaks = -1; //index of the spectrum that is currently showing peaks, -1 means none, -2 means pseudo 3D fitted peaks
var current_flag_of_peaks = 'picked'; //flag of the peaks that is currently showing, 'picked' or 'fitted
var pseudo3d_fitted_peaks_tab = ""; // pseudo 3D fitted peaks, a long multi-line string 
var pseudo3d_fitted_peaks_tab_ass = ""; // pseudo 3D fitted peaks with assignment, a long multi-line string 
var pseudo3d_fitted_peaks = []; //pseudo 3D fitted peaks, JSON array
var total_number_of_experimental_spectra = 0; //total number of experimental spectra

/**
 * For FID re-processing. Saved file data
 */
var fid_process_parameters; 
var current_reprocess_spectrum_index = -1;
    
// var acquisition_seq;
// var neg_imaginary;
// var apodization_direct;
// var apodization_indirect;
// var zf_direct;
// var zf_indirect;
// var phase_correction_direct_p0;
// var phase_correction_direct_p1;
// var auto_direct;
// var phase_correction_indirect_p0;
// var phase_correction_indirect_p1;
// var auto_indirect;
// var nuslist_as_string = '';
// var extract_direct_from = 0.0;
// var extract_direct_to = 1.0;




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
        this.spectrum_format = "ft2"; //ft2 is the default format
        this.process_ppm_j_change = new Float32Array(512); //header of the spectrum, 512 float32 numbers
        this.raw_data = new Float32Array(0); //raw data, real real
        this.raw_data_ri = new Float32Array(0); //raw data for real (along indirect dimension) and imaginary (along indirect dimension) part
        this.raw_data_ir = new Float32Array(0); //raw data for imaginary (along indirect dimension) and real (along indirect dimension) part
        this.raw_data_ii = new Float32Array(0); //raw data for imaginary (along indirect dimension) and imaginary (along indirect dimension) part
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
        this.frq1 = 850.0; //spectrometer frequency of direct dimension
        this.frq2 = 80.0; //spectrometer frequency of indirect dimension
        this.picked_peaks = []; //picked peaks
        this.fitted_peaks = []; //fitted peaks
        /**
         * spectrum origin: 
         * -4: unknown,
         * -2: experimental spectrum from fid, 
         * -1: experimental spectrum uploaded,  
         * n(n>=0 and n<10000): reconstructed from experimental spectrum n
         * n(n>=10000): pseudo 3D spectrum, whose first plane spectrum is n-1000
         */
        this.spectrum_origin = -4; 

        this.spectrum_index = -1; //index of the spectrum in the hsqc_spectra array. integer and >=0
        
        /**
         * Default median sigmax, sigmay, gammax, gammay
         */
        this.median_sigmax = 1.0;
        this.median_sigmay = 1.0;
        this.median_gammax = 1.0;
        this.median_gammay = 1.0;

        /**
         * Control the display of the spectrum
         */
        this.visible = true; //visible or not

        /**
         * fid process parameters is only valid when spectrum_origin is -2 (from fid)
         * and it is the first plane (of a pseudo 3D spectrum if it is a pseudo 3D fid)
         */
        this.fid_process_parameters = null;
        /**
         * If the spectrum is 1st plane of a pseudo 3D spectrum, 
         * pseudo3d_children will hold the indices of children spectra (other planes)
         */
        this.pseudo3d_children = [];
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
            if (file_id === "acquisition_file2" && file.name === "acqu3s") {
                document.getElementById(file_id).files = container.files;
            }
            else if(file_id === "acquisition_file2" && file.name === "acqu2s")
            {
                if(document.getElementById("acquisition_file2").files.length === 0)
                {
                    document.getElementById(file_id).files = container.files;
                }
            }
            else if(file_id === "nuslist_file")
            {
                document.getElementById(file_id).files = container.files;
                /**
                 * Special case for nuslist file. 
                 * Disable the auto_indirect checkboxes. 
                 * User has to manually set the phase correction values for indirect dimension for NUS experiments
                 */
                document.getElementById("auto_indirect").checked = false;
                document.getElementById("auto_indirect").disabled = true;
                /**
                 * At this moment, also disable extract_direct_from and extract_direct_to
                 * because smile (my implementation) doesn't support NUS processing
                 */
                document.getElementById("extract_direct_from").value = 0;
                document.getElementById("extract_direct_to").value = 100;
                document.getElementById("extract_direct_from").disabled = true;
                document.getElementById("extract_direct_to").disabled = true;
            }
            else
            {
                document.getElementById(file_id).files = container.files;
            }

            /**
             * If this.drop_area_id === "input_files" and we have 
             * at least 3 of all files_id filled, we will highlight the processing div
             */
            if(this.drop_area_id === "input_files")
            {
                let filled = 0;
                let required_files = [0,2,3];
                for(let i=0;i<required_files.length;i++)
                {
                    if(document.getElementById(this.files_id[required_files[i]]).files.length > 0)
                    {
                        filled++;
                    }
                }
                if(filled >= 3)
                {
                    document.getElementById("input_options").style.backgroundColor = "lightgreen";
                }
            }

            /**
             * If we can match file, will not try to match extension
             */
            return;
        }

        /**
         * Only if the dropped file's extension is as predefined, we will attach it to the corresponding file input
         * this.file_extension is an array of file extensions
         */
        let file_extension = file.name.split('.').pop();   
        if (this.file_extension.includes(file_extension)) {
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

/**
 * Read a file as array buffer
 * @param {*} file: file object
 * @returns 
 */
const read_file = (file) => {
    return new Promise((resolve, reject) => {

        var reader = new FileReader();
        reader.onload = function () {
            return resolve(reader.result);
        };
        reader.onerror = function (e) {
            reject("Error reading file");
        };
        reader.readAsArrayBuffer(file);
    });
}

/**
 * Read a file as text
 */
const read_file_text = (file) => {
    return new Promise((resolve, reject) => {

        var reader = new FileReader();
        reader.onload = function () {
            return resolve(reader.result);
        };
        reader.onerror = function (e) {
            reject("Error reading file");
        };
        reader.readAsText(file);
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
    .file_extension(["ft2","ft3"])  /** file extensions to be searched from upload */
    .files_id(["userfile","userfile"]) /** Corresponding file element IDs */
    .init();

    /**
    * INitialize the file drop processor for the time domain spectra
    */
    fid_drop_process = new file_drop_processor()
    .drop_area('input_files') /** id of dropzone */
    .files_name(["acqu2s", "acqu3s", "acqus", "ser", "fid","nuslist"])  /** file names to be searched from upload */
    .files_id(["acquisition_file2","acquisition_file2", "acquisition_file", "fid_file", "fid_file","nuslist_file"]) /** Corresponding file element IDs */
    .file_extension([])  /** file extensions to be searched from upload */
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
                     * If not a .ft2 file or .ft3 file, resolve the promise
                     */
                    if(this.querySelector('input[type="file"]').files[ii].name.endsWith(".ft2") || this.querySelector('input[type="file"]').files[ii].name.endsWith(".ft3"))
                    {
                        return read_file(this.querySelector('input[type="file"]').files[ii]);
                    }
                    else if(this.querySelector('input[type="file"]').files[ii].name.endsWith(".txt"))
                    {
                        return read_file_text(this.querySelector('input[type="file"]').files[ii]);
                    }
                    else
                    {
                        return Promise.resolve(null);
                    }
            }).then((file_data) => {
                /**
                 * If the file is a ft2 file (file_data is a array buffer), process it
                 */
                if(file_data !== null && file_data !== undefined )
                {   
                    /**
                     * If read as text file, 
                     */
                    if(typeof file_data === "string")
                    {
                        let result_spectrum = process_topspin_file(file_data,this.querySelector('input[type="file"]').files[ii].name);
                        draw_spectrum([result_spectrum],false/**from fid */,false/** re-process of fid or ft2 */);
                    }
                    else
                    {
                        let result_spectrum = process_ft_file(file_data,this.querySelector('input[type="file"]').files[ii].name,-1);
                        draw_spectrum([result_spectrum],false/**from fid */,false/** re-process of fid or ft2 */);
                    }
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

        let current_fid_files;

            
        /**
         * Function to process the file
         */
        function process_fid_files(processing_flag, spectrum_index) {

            /**
             * Get html checkbox water_suppression checked: true or false
             */
            let water_suppression = document.getElementById("water_suppression").checked;

            /**
             * Get html option "polynomial" value: -1,0,1,2,3
             */
            let polynomial = document.getElementById("polynomial").value;

            /**
             * Get HTML select "hsqc_acquisition_seq" value: "321" or "312"
            */
            let acquisition_seq = document.getElementById("hsqc_acquisition_seq").value;

            /**
             * Get HTML text input apodization_direct
             */
            let apodization_direct = document.getElementById("apodization_direct").value;

            /**
             * Get HTML select zf_direct value: "2" or "4" or "8"
             */
            let zf_direct = document.getElementById("zf_direct").value;

            /**
             * Get HTML number input phase_correction_direct_p0 and phase_correction_direct_p1
             * and checkbox auto_direct checked: true or false
             * and checkbox delete_direct checked: true or false
             */
            let phase_correction_direct_p0 = parseFloat(document.getElementById("phase_correction_direct_p0").value);
            let phase_correction_direct_p1 = parseFloat(document.getElementById("phase_correction_direct_p1").value);
            let auto_direct = document.getElementById("auto_direct").checked; //true or false
            let delete_direct = document.getElementById("delete_imaginary").checked; //true or false

            /**
             * Get HTML text input extract_direct_from and extract_direct_to. Input is in percentage
             */
            let extract_direct_from = parseFloat(document.getElementById("extract_direct_from").value) / 100.0;
            let extract_direct_to = parseFloat(document.getElementById("extract_direct_to").value) / 100.0;

            /**
             * Get HTML text input apodization_indirect
             */
            let apodization_indirect = document.getElementById("apodization_indirect").value;

            /**
             * Get HTML select zf_indirect value: "2" or "4" or "8"
             */
            let zf_indirect = document.getElementById("zf_indirect").value;


            /**
             * Get HTML number input phase_correction_indirect_p0 and phase_correction_indirect_p1
             * and checkbox auto_indirect checked: true or false
             * and checkbox delete_indirect checked: true or false
             */
            let phase_correction_indirect_p0 = parseFloat(document.getElementById("phase_correction_indirect_p0").value);
            let phase_correction_indirect_p1 = parseFloat(document.getElementById("phase_correction_indirect_p1").value);
            let auto_indirect = document.getElementById("auto_indirect").checked; //true or false
            let delete_indirect = document.getElementById("delete_imaginary_indirect").checked; //true or false


            /**
             * Get HTML checkbox "neg_imaginary".checked: true or false. Convert to "yes" or "no" for the worker
             */
            let neg_imaginary = document.getElementById("neg_imaginary").checked ? "yes" : "no";

            /**
             * Get radio group "Pseudo-3D-process" value: first_only or all_planes
             */
            let pseudo3d_process = document.querySelector('input[name="Pseudo-3D-process"]:checked').value;

            fid_process_parameters = {
                water_suppression: water_suppression,
                polynomial: polynomial,
                file_data: current_fid_files,
                acquisition_seq: acquisition_seq,
                pseudo3d_process: pseudo3d_process,
                neg_imaginary: neg_imaginary,
                apodization_direct: apodization_direct,
                apodization_indirect: apodization_indirect,
                auto_direct: auto_direct,
                auto_indirect: auto_indirect,
                delete_direct: delete_direct,
                delete_indirect: delete_indirect,
                phase_correction_direct_p0: phase_correction_direct_p0,
                phase_correction_direct_p1: phase_correction_direct_p1,
                phase_correction_indirect_p0: phase_correction_indirect_p0,
                phase_correction_indirect_p1: phase_correction_indirect_p1,
                zf_direct: zf_direct,
                zf_indirect: zf_indirect,
                extract_direct_from: extract_direct_from,
                extract_direct_to: extract_direct_to,
                processing_flag: processing_flag, //0: process, 1: reprocess
                spectrum_index: spectrum_index, //not used if not reprocessing
            };

            if(processing_flag==1)
            {
                fid_process_parameters.pseudo3d_children = hsqc_spectra[spectrum_index].pseudo3d_children;
            }
            else
            {
                fid_process_parameters.pseudo3d_children = [];
            }

            /**
             * Note. Add below 2 for reprocessing
             * spectrum_index: spectrum_index, 
             * flag: 1 (reprocess)
             */
            webassembly_worker.postMessage(fid_process_parameters);
            /**
             * Let user know the processing is started
             */
            document.getElementById("webassembly_message").innerText = "Processing time domain spectra, please wait...";
        }

        e.preventDefault();
        /**
         * The default value of the button is "Upload experimental files and process"
         * For reprocessing, the button value is set to "Reprocess" by JS code.
         */
        let button_value = e.submitter.value;


        if(button_value === "Reprocess")
        {
            current_fid_files = hsqc_spectra[current_reprocess_spectrum_index].fid_process_parameters.file_data;

            process_fid_files(1,current_reprocess_spectrum_index);   
        }

        else
        {
            /**
             * UN-highlight the input_options div
             */
            document.getElementById("input_options").style.backgroundColor = "white";

            let acquisition_file = document.getElementById('acquisition_file').files[0];
            let acquisition_file2 = document.getElementById('acquisition_file2').files[0];
            let fid_file = document.getElementById('fid_file').files[0];
            /**
             * Nuslist file is optional (for non-uniform sampling)
             * If it is not selected, it will be null
             */
            let nuslist_file = document.getElementById('nuslist_file').files[0];



            let promises;
            if (typeof nuslist_file === "undefined") {
                promises = [read_file(acquisition_file), read_file(acquisition_file2), read_file(fid_file)];
            }
            else {
                promises = [read_file(acquisition_file), read_file(acquisition_file2), read_file(fid_file), read_file(nuslist_file)];
            }

            Promise.all(promises)
                .then((result) => {

                    /**
                     * For each element in result (raw data of the files), we will convert it to Uint8Array
                     * so that they can be transferred to the worker
                     */
                    if (typeof nuslist_file === "undefined") {
                        current_fid_files = [new Uint8Array(result[0]), new Uint8Array(result[1]), new Uint8Array(result[2])];
                    }
                    else {
                        current_fid_files = [new Uint8Array(result[0]), new Uint8Array(result[1]), new Uint8Array(result[2]), new Uint8Array(result[3])];
                        /**
                         * convert nuslist file content (arrayBuffer) to string
                         */
                        let nuslist_array = new Uint8Array(result[3]);
                        nuslist_as_string = String.fromCharCode.apply(null, nuslist_array);
                    }

                    /**
                     * Clear file input
                     */
                    document.getElementById('acquisition_file').value = "";
                    document.getElementById('acquisition_file2').value = "";
                    document.getElementById('fid_file').value = "";
                    document.getElementById('nuslist_file').value = "";

                    process_fid_files(0,0);

                })
                .catch((err) => {
                    console.log(err);
                });
        }

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

    /**
     * Event listener for spin_system_table table tbody first row 2nd td input and 3rd td input
     */
    let input1=document.getElementById("spin_system_table").tBodies[0].rows[0].cells[1].querySelector("input");
    let input2=document.getElementById("spin_system_table").tBodies[0].rows[0].cells[2].querySelector("input");
    let input3=document.getElementById("spin_system_table").tBodies[0].rows[0].cells[3].querySelector("input");
    let input4=document.getElementById("spin_system_table").tBodies[0].rows[0].cells[4].querySelector("input");
    input1.addEventListener('change', function () {
        process_ppm_j_change(this.parentElement.parentElement.rowIndex,input1.value,input2.value,input3.value,input4.value);
    });
    input2.addEventListener('change', function () {
        process_ppm_j_change(this.parentElement.parentElement.rowIndex,input1.value,input2.value,input3.value,input4.value);
    });
    input3.addEventListener('change', function () {
        process_ppm_j_change(this.parentElement.parentElement.rowIndex,input1.value,input2.value,input3.value,input4.value);
    });
    input4.addEventListener('change', function () {
        process_ppm_j_change(this.parentElement.parentElement.rowIndex,input1.value,input2.value,input3.value,input4.value);
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
        if (hsqc_spectra[i].spectrum_origin === -1 || hsqc_spectra[i].spectrum_origin === -2 || hsqc_spectra[i].spectrum_origin>=10000) {
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

webassembly_worker2.onmessage = function (e) {

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
     * If result is spectrum_data, it is the processed spectrum
     */
    else if (e.data.spectrum_data) {
        console.log("Processed smile spectrum data received");
        let spectrum_data = new Uint8Array(e.data.spectrum_data);
        /**
         * Send e.data.spectrum_data to webassembly_worker to process it
         */
        webassembly_worker.postMessage({
            file_data: [spectrum_data],
            spectrum_index: e.data.spectrum_index,
            phase_correction_indirect_p0: phase_correction_indirect_p0,
            phase_correction_indirect_p1: phase_correction_indirect_p1,
            apodization_indirect: apodization_indirect,
            zf_indirect: zf_indirect,
            processing_flag: e.data.processing_flag,
        });
    }
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
        document.getElementById("run_voigt_fitter-".concat(e.data.spectrum_index)).disabled = false;
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
        hsqc_spectra[e.data.spectrum_origin].fitted_peaks = e.data.fitted_peaks.fitted_peaks; //The double fitted_peaks is correct
        hsqc_spectra[e.data.spectrum_origin].fitted_peaks_tab = e.data.fitted_peaks_tab; //a string of fitted peaks in nmrPipe format

        /**
         * Enable run deep picker and run voigt fitter buttons
         */
        document.getElementById("run_deep_picker-".concat(e.data.spectrum_origin)).disabled = false;
        document.getElementById("run_voigt_fitter-".concat(e.data.spectrum_origin)).disabled = false;

        /**
         * Enable the download fitted peaks button and show the fitted peaks button
         */
        document.getElementById("download_fitted_peaks-".concat(e.data.spectrum_origin)).disabled = false;
        document.getElementById("show_fitted_peaks-".concat(e.data.spectrum_origin)).disabled = false;

        /**
         * Uncheck the show_peaks checkbox then simulate a click event to show the peaks (with updated peaks from fitted_peaks)
         */
        document.getElementById("show_fitted_peaks-".concat(e.data.spectrum_origin)).checked = false;
        document.getElementById("show_fitted_peaks-".concat(e.data.spectrum_origin)).click();

        /**
         * Treat the received recon_spectrum as a frequency domain spectrum
         */
        let arrayBuffer = new Uint8Array(e.data.recon_spectrum).buffer;

        /**
         * Process the frequency domain spectrum, spectrum name is "recon-".spectrum_origin.".ft2"
         */
        let result_spectrum_name = "recon-".concat(e.data.spectrum_origin.toString(), ".ft2");
        let result_spectrum = process_ft_file(arrayBuffer,result_spectrum_name,e.data.spectrum_origin);

        /**
         * Replace its header with the header of the original spectrum
         * and noise_level, levels, negative_levels, spectral_max and spectral_min with the original spectrum
         */
        result_spectrum.header = hsqc_spectra[e.data.spectrum_origin].header;
        result_spectrum.noise_level = hsqc_spectra[e.data.spectrum_origin].noise_level;
        result_spectrum.levels = hsqc_spectra[e.data.spectrum_origin].levels;
        result_spectrum.negative_levels = hsqc_spectra[e.data.spectrum_origin].negative_levels;
        result_spectrum.spectral_max = hsqc_spectra[e.data.spectrum_origin].spectral_max;
        result_spectrum.spectral_min = hsqc_spectra[e.data.spectrum_origin].spectral_min;

        /**
         * Copy picked_peaks and fitted_peaks from the original spectrum
         */
        result_spectrum.picked_peaks = hsqc_spectra[e.data.spectrum_origin].picked_peaks;
        result_spectrum.fitted_peaks = hsqc_spectra[e.data.spectrum_origin].fitted_peaks;
        result_spectrum.fitted_peaks_tab = hsqc_spectra[e.data.spectrum_origin].fitted_peaks_tab;

        /**
         * Also copy scale and scale2 from the original spectrum, which are used to run deep picker and peak fitting
         */
        result_spectrum.scale = e.data.scale;
        result_spectrum.scale2 = e.data.scale2;
        draw_spectrum([result_spectrum],false/**from fid */,false/**re-process of fid or ft2 */);

        /**
         * Clear the processing message
         */
        document.getElementById("webassembly_message").innerText = "";
    }

    /**
     * IF result is file_data and file_type is "direct", it is a hybrid spectrum
     * (direct dimension only processing) from a NUS experiment
     */
    else if(e.data.file_data && e.data.file_type && e.data.file_type === 'direct')
    {
        /**
         * Update direct dimension phase correction values
         * from e.data.phasing_data
         */
        let current_phase_correction = e.data.phasing_data.split(/\s+/).map(Number);
        document.getElementById("phase_correction_direct_p0").value = current_phase_correction[0];
        document.getElementById("phase_correction_direct_p1").value = current_phase_correction[1];

        /**
         * Send e.data.file_data as Unit8Array to webass2 (smile) work to process it.
         * Also need:
         * nuslist file as a string
         * apodization_direct as a string
         * indirect phase correction p0 and p1 as numbers
        */   
        let arrayBuffer = new Uint8Array(e.data.file_data);

        webassembly_worker2.postMessage({
            spectrum_data: arrayBuffer,
            nuslist_as_string: nuslist_as_string, //saved as global variable
            apodization_direct: apodization_direct, //saved as global variable
            phase_correction_indirect_p0: phase_correction_indirect_p0, 
            phase_correction_indirect_p1: phase_correction_indirect_p1,
            /**
             * Pass the current spectrum index to the worker
             */
            spectrum_index: e.data.spectrum_index,
            processing_flag: e.data.processing_flag,
        });
    }

    /**
     * If result is file_data and phasing_data, it is the frequency domain spectrum returned from the worker
     * from the time domain spectrum
     */
    else if (e.data.file_data && e.data.file_type && (e.data.file_type ==='full' || e.data.file_type ==='indirect') && e.data.phasing_data) {

        /**
         * e.data.phasing_data is a string with 4 numbers separated by space(s)
         * Firstly replace all space(s) with a single space
         * Then convert it to an array of 4 numbers
         */
        let current_phase_correction = e.data.phasing_data.split(/\s+/).map(Number);

         /**
         * Fill HTML filed with id "phase_correction_direct_p0" and "phase_correction_direct_p1" with the first two numbers
         * and "phase_correction_indirect_p0" and "phase_correction_indirect_p1" with the last two numbers
         * IF these numbers are already filled (then send to the worker), they will be returned without change,
         * that is, there is no need to fill them again, but won't hurt to fill them again (because they are the same)
         */
        if (e.data.file_type === 'full') {
            document.getElementById("phase_correction_direct_p0").value = current_phase_correction[0];
            document.getElementById("phase_correction_direct_p1").value = current_phase_correction[1];
            document.getElementById("phase_correction_indirect_p0").value = current_phase_correction[2];
            document.getElementById("phase_correction_indirect_p1").value = current_phase_correction[3];
            /**
             * In case of full, also need to update apodization_indirect because auto phase correction may change it
             */
            apodization_indirect = e.data.apodization_indirect;
            document.getElementById("apodization_indirect").value = apodization_indirect;

            /**
             * Save the phase correction values to fid_process_parameters
             */
            fid_process_parameters.phase_correction_direct_p0 = current_phase_correction[0];
            fid_process_parameters.phase_correction_direct_p1 = current_phase_correction[1];
            fid_process_parameters.phase_correction_indirect_p0 = current_phase_correction[2];
            fid_process_parameters.phase_correction_indirect_p1 = current_phase_correction[3];
            fid_process_parameters.apodization_indirect = apodization_indirect;
        }
        
        /**
         * Determine whether this is a re-process or a new process
         * if b_reprocess is true, we will replace the current spectrum
         * if b_reprocess is false, we will add the spectrum to the hsqc_spectra array
         * Both are done in draw_spectrum function
         */
        let arrayBuffer = new Uint8Array(e.data.file_data).buffer;
        let result_spectrum = process_ft_file(arrayBuffer,"from_fid.ft2",-2);
        let b_reprocess = e.data.processing_flag == 1 ? true : false;
        
        result_spectrum.spectrum_index = e.data.spectrum_index; //only used when reprocess
        let result_spectra = [result_spectrum];
        

        /**
         * Process additional ft2 files (send back from webass worker) in case of pseudo 3D processing
         */
        for(let i=0;i<e.data.pseudo3d_files.length;i++)
        {
            let arrayBuffer = new Uint8Array(e.data.pseudo3d_files[i]).buffer;
            let result_spectrum = process_ft_file(arrayBuffer,"pseudo3d-".concat((i+1).toString(),".ft2"),-4);
            result_spectra.push(result_spectrum);
        }
        draw_spectrum(result_spectra,true/**from fid */,b_reprocess,e.data.pseudo3d_children);

        /**
         * Clear the processing message
         */
        document.getElementById("webassembly_message").innerText = "";
        /**
         * Unselect auto phase correction
         */
        document.getElementById("auto_direct").checked = false;
        document.getElementById("auto_indirect").checked = false;
    }

    /**
     * Only file_data, it is a phase corrected spectrum
     */
    else if (e.data.file_data && e.data.spectrum_name)
    {
        console.log("Phase corrected spectrum received");
        document.getElementById("webassembly_message").innerText = "";
        let arrayBuffer = new Uint8Array(e.data.file_data).buffer;
        let result_spectrum = process_ft_file(arrayBuffer,e.data.spectrum_name,-1);
        result_spectrum.spectrum_index = e.data.spectrum_index;
        draw_spectrum([result_spectrum],false/**from fid */,true/**re-process of fid or ft2 */);
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

    /**
     * Also resize cross_section_x width to be the same as the width of the visualization div
     * and cross_section_y height to be the same as the height of the visualization div
     */
    document.getElementById('cross_section_x').style.width = wid.toString().concat('px');
    document.getElementById('cross_section_svg_x').setAttribute("width", wid.toString().concat('px'));
    document.getElementById('cross_section_y').style.height = height.toString().concat('px');
    document.getElementById('cross_section_svg_y').setAttribute("height", height.toString().concat('px'));
}

/**
 * Drag and drop spectra to reorder them 
 */
const sortableList = document.getElementById("spectra_list_ol");

sortableList.addEventListener(
    "dragstart",
    (e) => {
        /**
         * We will move the parent element (div)'s parent (li) of the dragged item
         */
        draggedItem = e.target.parentElement.parentElement
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

function minimize_fid_area(self)
{
    /**
     * Get button text
     */
    let button_text = self.innerText;
    /**
     * if button_text is "+", change it to "-"
     * and set the height of the fid_file_area to 3rem, clip the overflow
     */
    if(button_text === "-")
    {
        self.innerText = "+";
        document.getElementById("fid_file_area").style.height = "3rem";
        document.getElementById("fid_file_area").style.overflow = "clip";
    }
    /**
     * if button_text is "-", change it to "+". Set the height of the fid_file_area to auto, visible overflow
     */
    else
    {
        self.innerText = "-";
        document.getElementById("fid_file_area").style.height = "auto";
        document.getElementById("fid_file_area").style.overflow = "visible";
    }
}

function minimize_file_area(self)
{
    /**
     * Get button text
     */
    let button_text = self.innerText;
    /**
     * if button_text is "+", change it to "-"
     * and set the height of the file_area to 3rem, clip the overflow
     */
    if(button_text === "-")
    {
        self.innerText = "+";
        document.getElementById("file_area").style.height = "3rem";
        document.getElementById("file_area").style.overflow = "clip";
    }
    /**
     * if button_text is "-", change it to "+". Set the height of the file_area to auto, visible overflow
    */
    else
    {
        self.innerText = "-";
        document.getElementById("file_area").style.height = "auto";
        document.getElementById("file_area").style.overflow = "visible";
    }
}


function minimize_spectrum(button,index)
{
    let spectrum_div = document.getElementById("spectrum-".concat(index)).querySelector("div");
    let minimize_button = button;
    if(minimize_button.innerText === "-")
    {
        minimize_button.innerText = "+";
        spectrum_div.style.height = "1.75rem";
        spectrum_div.style.overflow = "clip";
        /**
         * Also set lbs to hide all contours for this spectrum
         */
        hsqc_spectra[index].visible = false;

        /**
         * Loop all spectra, find children of this spectrum, hide them too
         */
        for(let i=0;i<hsqc_spectra.length;i++)
        {
            if(hsqc_spectra[i].spectrum_origin === index)
            {
                hsqc_spectra[i].visible = false;
            }
        }


        main_plot.redraw_contour();
    }
    else
    {
        minimize_button.innerText = "-";
        spectrum_div.style.height = "auto";
        hsqc_spectra[index].visible = true;

        /**
         * Loop all spectra, find children of this spectrum, show them too
         */
        for(let i=0;i<hsqc_spectra.length;i++)
        {
            if(hsqc_spectra[i].spectrum_origin === index)
            {
                hsqc_spectra[i].visible = true;
            }
        }

        main_plot.redraw_contour();
    }

}


function add_to_list(index) {
    let new_spectrum = hsqc_spectra[index];
    let new_spectrum_div_list = document.createElement("li");
    let new_spectrum_div = document.createElement("div");

    /**
     * Assign a ID to the new spectrum div
     */
    new_spectrum_div_list.id = "spectrum-".concat(index);

    /**
     * Add a draggable div to the new spectrum div, only if the spectrum is experimental
     */
    if(new_spectrum.spectrum_origin === -1 || new_spectrum.spectrum_origin === -2 || new_spectrum.spectrum_origin >=10000)
    {
        /**
         * Also add an minimize button to the new spectrum div
         */
        let minimize_button = document.createElement("button");
        minimize_button.innerText = "-";
        minimize_button.onclick = function () { minimize_spectrum(this,index); };
        new_spectrum_div.appendChild(minimize_button);

        let draggable_span = document.createElement("span");
        draggable_span.draggable = true;
        draggable_span.classList.add("draggable");
        draggable_span.appendChild(document.createTextNode("\u2195 Drag me. "));
        draggable_span.style.cursor = "move";
        new_spectrum_div.appendChild(draggable_span);
    }

    /**
     * Add a "Reprocess" button to the new spectrum div if
     * 1. spectrum_origin == -2 (experimental spectrum from fid, and must be first if from pseudo 3D)
     * TODO: 2. spectrum_origin == -1 (experimental spectrum from ft2) && raw_data_ri or raw_data_ir is not empty
     */
    if(new_spectrum.spectrum_origin === -2)
    {
        let reprocess_button = document.createElement("button");
        reprocess_button.innerText = "Reprocess";
        reprocess_button.onclick = function () { reprocess_spectrum(this,index); };
        new_spectrum_div.appendChild(reprocess_button);
    }

    /**
     * If this is a reconstructed spectrum, add a button called "Remove me"
     */
    if (new_spectrum.spectrum_origin >= 0 && new_spectrum.spectrum_origin < 10000) {
        let remove_button = document.createElement("button");
        remove_button.innerText = "Remove me";
        remove_button.onclick = function () { remove_spectrum_caller(index); };
        new_spectrum_div.appendChild(remove_button);
    }
    
    if(new_spectrum.spectrum_origin === -1 || new_spectrum.spectrum_origin === -2 || new_spectrum.spectrum_origin >=10000)
    {
        /**
         * The new DIV will have the following children:
         * A original index (which is different from the index in the list, because of the order change by drag and drop)
         */
        new_spectrum_div.appendChild(document.createTextNode("Original index: ".concat(index.toString(), ", ")));
        /**
         * Add filename as a text node
         */
        let fname_text = document.createTextNode(" File name: " + hsqc_spectra[index].filename + " ");
        new_spectrum_div.appendChild(fname_text);
        new_spectrum_div.appendChild(document.createElement("br"));


        new_spectrum_div.appendChild(document.createTextNode("Noise: " + new_spectrum.noise_level.toExponential(4) + ","));
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
         * Add 3 radio buttons to select:
         * 1. show cross section
         * 2. show projection (default, checked)
         * and a new line
         */
        let show_cross_section_radio = document.createElement("input");
        show_cross_section_radio.setAttribute("type", "radio");
        show_cross_section_radio.setAttribute("id", "show_cross_section-".concat(index));   
        show_cross_section_radio.setAttribute("name", "show-".concat(index));
        show_cross_section_radio.onclick = function () { show_cross_section(index); };
        let show_cross_section_label = document.createElement("label");
        show_cross_section_label.setAttribute("for", "show_cross_section-".concat(index));
        show_cross_section_label.innerText = " Cross section ";
        new_spectrum_div.appendChild(show_cross_section_radio);
        new_spectrum_div.appendChild(show_cross_section_label);

        let show_projection_radio = document.createElement("input");
        show_projection_radio.setAttribute("type", "radio");
        show_projection_radio.setAttribute("id", "show_projection-".concat(index));
        show_projection_radio.setAttribute("name", "show-".concat(index));
        show_projection_radio.checked = true;
        show_projection_radio.onclick = function () { show_projection(index); };
        let show_projection_label = document.createElement("label");
        show_projection_label.setAttribute("for", "show_projection-".concat(index));
        show_projection_label.innerText = " Projection ";
        new_spectrum_div.appendChild(show_projection_radio);
        new_spectrum_div.appendChild(show_projection_label);
    }


    /**
     * Add a download button to download the spectrum 
     * Allow download of from fid and from reconstructed spectrum
     */
    let download_button = document.createElement("button");
    download_button.innerText = "Download ft2";
    download_button.onclick = function () { download_spectrum(index,'original'); };
    new_spectrum_div.appendChild(download_button);
    /**
     * Add a different spectrum download button for reconstructed spectrum only
     */
    if (new_spectrum.spectrum_origin >=0 && new_spectrum.spectrum_origin < 10000) {
        let download_button = document.createElement("button");
        download_button.innerText = "Download diff.ft2";
        download_button.onclick = function () { download_spectrum(index,'diff'); };
        new_spectrum_div.appendChild(download_button);
    }
    new_spectrum_div.appendChild(document.createElement("br"));


    /**
     * If the spectrum is experimental, add a run_DEEP_Picker, run Voigt fitter, run Gaussian fitter, and download peaks button
     */
    if(new_spectrum.spectrum_origin === -1 || new_spectrum.spectrum_origin === -2 || new_spectrum.spectrum_origin >=10000)
    {
        /**
         * Add a run_DEEP_Picker button to run DEEP picker. Default is enabled
         */
        let deep_picker_button = document.createElement("button");
        deep_picker_button.setAttribute("id", "run_deep_picker-".concat(index));
        deep_picker_button.innerText = "DEEP Picker";
        deep_picker_button.onclick = function () { run_DEEP_Picker(index,0); };
        new_spectrum_div.appendChild(deep_picker_button);

        /**
         * Add a run_Simple_Picker button to run simple picker. Default is enabled
         */
        let simple_picker_button = document.createElement("button");
        simple_picker_button.setAttribute("id", "run_simple_picker-".concat(index));
        simple_picker_button.innerText = "Simple Picker";
        simple_picker_button.onclick = function () { run_DEEP_Picker(index,1); };
        new_spectrum_div.appendChild(simple_picker_button);

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
         * Add one buttons to call run_Voigt_fitter, with option 0,1, or 2
         * Default is disabled
         */
        let run_voigt_fitter_select = document.createElement("select");
        run_voigt_fitter_select.setAttribute("id", "run_voigt_fitter_select-".concat(index));
        let run_voigt_fitter_select_label = document.createElement("label");
        run_voigt_fitter_select_label.setAttribute("for", "run_voigt_fitter_select-".concat(index));
        run_voigt_fitter_select_label.innerText = " Peak profile: ";
        /**
         * Add three options: Voigt, Gaussian, and Voigt_Lorentzian
         */
        let voigt_option = document.createElement("option");
        voigt_option.setAttribute("value", "0");
        voigt_option.innerText = "Voigt";
        run_voigt_fitter_select.appendChild(voigt_option);

        let gaussian_option = document.createElement("option");
        gaussian_option.setAttribute("value", "1");
        gaussian_option.innerText = "Gaussian";
        run_voigt_fitter_select.appendChild(gaussian_option);

        let voigt_lorentzian_option = document.createElement("option");
        voigt_lorentzian_option.setAttribute("value", "2");
        voigt_lorentzian_option.innerText = "Voigt_Lorentzian";
        run_voigt_fitter_select.appendChild(voigt_lorentzian_option);
        
        
        new_spectrum_div.appendChild(run_voigt_fitter_select_label);
        new_spectrum_div.appendChild(run_voigt_fitter_select);

        let run_voigt_fitter_button0 = document.createElement("button");
        run_voigt_fitter_button0.innerText = "Peak Fitting";
        run_voigt_fitter_button0.onclick = function () { 
            /**
             * Get the value of run_voigt_fitter_options: 0, 1, or 2
             */
            let index = parseInt(this.id.split("-")[1]);
            let run_voigt_fitter_select = document.getElementById("run_voigt_fitter_select-".concat(index));
            let option = parseInt(run_voigt_fitter_select.value);
            run_Voigt_fitter(index, option); 
        };
        run_voigt_fitter_button0.disabled = true;
        run_voigt_fitter_button0.setAttribute("id", "run_voigt_fitter-".concat(index));
        new_spectrum_div.appendChild(run_voigt_fitter_button0);

       

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
    if(new_spectrum.spectrum_origin === -1 || new_spectrum.spectrum_origin === -2 || new_spectrum.spectrum_origin >=10000){
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
    if(new_spectrum.spectrum_origin === -1 || new_spectrum.spectrum_origin === -2 || new_spectrum.spectrum_origin >=10000){
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
    if(new_spectrum.spectrum_origin === -1 || new_spectrum.spectrum_origin === -2 || new_spectrum.spectrum_origin >=10000){
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
    if(new_spectrum.spectrum_origin === -1 || new_spectrum.spectrum_origin === -2 || new_spectrum.spectrum_origin >=10000){
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
    if(new_spectrum.spectrum_origin < 0 || new_spectrum.spectrum_origin >= 10000)
    {
        let reconstructed_spectrum_h5 = document.createElement("h5");
        reconstructed_spectrum_h5.innerText = "Reconstructed spectrum";
        new_spectrum_div.appendChild(reconstructed_spectrum_h5);
        let reconstructed_spectrum_ol = document.createElement("ol");
        reconstructed_spectrum_ol.setAttribute("id", "reconstructed_spectrum_ol-".concat(index));   
        new_spectrum_div.appendChild(reconstructed_spectrum_ol);
    }

    new_spectrum_div_list.appendChild(new_spectrum_div);

    /**
     * Add the new spectrum div to the list of spectra if it is from experimental data
    */
    if(hsqc_spectra[index].spectrum_origin < 0 || hsqc_spectra[index].spectrum_origin >= 10000)
    {
        document.getElementById("spectra_list_ol").appendChild(new_spectrum_div_list);
    }
    /**
     * If the spectrum is reconstructed, add the new spectrum div to the reconstructed spectrum list
     */
    else
    {
        document.getElementById("reconstructed_spectrum_ol-".concat(hsqc_spectra[index].spectrum_origin)).appendChild(new_spectrum_div_list);
    }

    if(new_spectrum.spectrum_origin === -1 || new_spectrum.spectrum_origin === -2 || new_spectrum.spectrum_origin >=10000)
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


    if (e.data.spectrum_type === "full" && e.data.spectrum_index > main_plot.levels_length_negative.length)
    {
        /**
         * This is impossible unless there is a bug in the code
         */
        console.log("Error: spectrum_index is larger than main_plot.levels_length_negative.length");
    }

    /**
     * Type is full and spectrum_index === main_plot.levels_length_negative.length, we are adding spectrum
     */
    else if (e.data.spectrum_type === "full" && e.data.spectrum_index === main_plot.levels_length_negative.length)
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
            if(e.data.spectrum_origin<0 || e.data.spectrum_origin >= 10000)
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
     * IMPORTANT: if might be a recalculated spectrum, so we need to update the spectral_information array
     * it can also be a recalculation of the contour of the same spectrum, which doesn't change the spectral_information array
     */
    else if (e.data.spectrum_type === "full" && e.data.spectrum_index < main_plot.levels_length.length)
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
         * Reprocess may change the spectral information, so we update the spectral_information array
         * so that we can redraw the contour plot correctly
         */
        main_plot.spectral_information[e.data.spectrum_index]={
            n_direct: hsqc_spectra[e.data.spectrum_index].n_direct,
            n_indirect: hsqc_spectra[e.data.spectrum_index].n_indirect,
            x_ppm_start: hsqc_spectra[e.data.spectrum_index].x_ppm_start,
            x_ppm_step: hsqc_spectra[e.data.spectrum_index].x_ppm_step,
            y_ppm_start: hsqc_spectra[e.data.spectrum_index].y_ppm_start,
            y_ppm_step: hsqc_spectra[e.data.spectrum_index].y_ppm_step,
            x_ppm_ref: hsqc_spectra[e.data.spectrum_index].x_ppm_ref,
            y_ppm_ref: hsqc_spectra[e.data.spectrum_index].y_ppm_ref,
        };

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

    if (b_plot_initialized) {
        return;
    }
    b_plot_initialized = true;

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
    input.horizontal = false;
    input.vertical = false;


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

function show_cross_section(index) {
    uncheck_all_1d_except(index);
    main_plot.current_spectral_index = index;
    main_plot.b_show_cross_section = true;
    main_plot.b_show_projection = false;

}

function show_projection(index) {
    uncheck_all_1d_except(index);
    main_plot.current_spectral_index = index;
    main_plot.b_show_cross_section = false;
    main_plot.b_show_projection = true;
    main_plot.show_projection();
}

function uncheck_all_1d_except(index) {

    /**
     * It is possible hsqc_spectra.length > main_plot.levels_length.length
     * (main_plot.levels_length.length === total # of all "spectrum-".concat(i) HTML elements)
     */
    let total_number_of_spectra = hsqc_spectra.length;
    if(main_plot.levels_length.length < total_number_of_spectra)
    {
        total_number_of_spectra = main_plot.levels_length.length;
    }

    for(let i=0;i<total_number_of_spectra;i++)
    {   
        /**
         * Only if this is not the current spectrum and
         * this is NOT a reconstructed spectrum or removed spectrum
         * we uncheck the checkbox
         */
        if(i!==index && (hsqc_spectra[i].spectrum_origin ==-2 || hsqc_spectra[i].spectrum_origin ==-1 || hsqc_spectra[i].spectrum_origin >= 10000)) {
            document.getElementById("show_cross_section".concat("-").concat(i)).checked = false;
            document.getElementById("show_projection".concat("-").concat(i)).checked = false;
            document.getElementById("spectrum-".concat(i)).style.backgroundColor = "white";
        }
    }
}



function resetzoom() {

    /**
     * this.xscale = [input.x_ppm_start, input.x_ppm_start + input.x_ppm_step * input.n_direct];
     * this.yscale = [input.y_ppm_start, input.y_ppm_start + input.y_ppm_step * input.n_indirect];
     */

    /**
     * Loop through all the spectra to get 
     * max of x_ppm_start and min of x_ppm_end (x_ppm_start + x_ppm_step * n_direct)
     * max of y_ppm_start and min of y_ppm_end (y_ppm_start + y_ppm_step * n_indirect)
     */
    let x_ppm_start = -1000.0;
    let x_ppm_end = 1000.0;
    let y_ppm_start = -1000.0;
    let y_ppm_end = 1000.0;

    for (let i = 0; i < hsqc_spectra.length; i++) {
        if (hsqc_spectra[i].x_ppm_start + hsqc_spectra[i].x_ppm_ref > x_ppm_start) {
            x_ppm_start = hsqc_spectra[i].x_ppm_start +  + hsqc_spectra[i].x_ppm_ref;
        }
        if (hsqc_spectra[i].x_ppm_start  + hsqc_spectra[i].x_ppm_ref + hsqc_spectra[i].x_ppm_step * hsqc_spectra[i].n_direct < x_ppm_end) {
            x_ppm_end = hsqc_spectra[i].x_ppm_start + hsqc_spectra[i].x_ppm_step * hsqc_spectra[i].n_direct  + hsqc_spectra[i].x_ppm_ref ;
        }
        if (hsqc_spectra[i].y_ppm_start  + hsqc_spectra[i].y_ppm_ref > y_ppm_start) {
            y_ppm_start = hsqc_spectra[i].y_ppm_start + hsqc_spectra[i].y_ppm_ref ;
        }
        if (hsqc_spectra[i].y_ppm_start + hsqc_spectra[i].y_ppm_step * hsqc_spectra[i].n_indirect + hsqc_spectra[i].y_ppm_ref < y_ppm_end) {
            y_ppm_end = hsqc_spectra[i].y_ppm_start + hsqc_spectra[i].y_ppm_step * hsqc_spectra[i].n_indirect+ hsqc_spectra[i].y_ppm_ref ;
        }
    }

    main_plot.resetzoom([x_ppm_start, x_ppm_end], [y_ppm_start, y_ppm_end]);
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


/**
 * Process the raw file data of a 2D FT spectrum (.txt from Topspin totxt command)
 * @param {*} file_text: raw file data as a string
 * @param {*} file_name: name of the file
 * Note: for topspin file, spectrum_origin is always -1 (user uploaded frequency file)
 *  
 */
function process_topspin_file(file_text, file_name) {
    let result = new spectrum();

    result.spectrum_format = "Topspin"
    result.spectrum_origin = -1;
    result.filename = file_name;

    
    let lines = file_text.split(/\r\n|\n/);
    
    /**
     * Loop all lines
     * 1. find line contained both "F1LEFT" and "F1RIGHT" to get the x_ppm_start and x_ppm_width
     * 2. find line contained both "F2LEFT" and "F2RIGHT" to get the y_ppm_start and y_ppm_width
     * 3. find line contained NROWS to get the n_indirect
     * 4. find line contained NCOLS to get the n_direct
     * Quit the loop if all 4 values are found. 
     */
    let number_of_info_retrieved = 0;
    let data_start = 0;
    result.n_direct = undefined;
    result.n_indirect = undefined;
    result.x_ppm_start = undefined;
    result.y_ppm_start = undefined;
    result.x_ppm_width = undefined;
    result.y_ppm_width = undefined;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes("F1LEFT") && lines[i].includes("F1RIGHT")) {
            /**
             * Separate the line by any number of space(s) and get the location of F1LEFT and F1RIGHT
             */
            let temp = lines[i].split(/\s+/); //split by any number of space(s)
            let left = temp.indexOf("F1LEFT");
            let right = temp.indexOf("F1RIGHT");
            result.y_ppm_start = parseFloat(temp[left + 2]);
            result.y_ppm_width = parseFloat(temp[right + 2]) - parseFloat(temp[left + 2]);
            number_of_info_retrieved++;
        }
        if (lines[i].includes("F2LEFT") && lines[i].includes("F2RIGHT")) {
            let temp = lines[i].split(/\s+/);
            let left = temp.indexOf("F2LEFT");
            let right = temp.indexOf("F2RIGHT");
            result.x_ppm_start = parseFloat(temp[left + 2]);
            result.x_ppm_width = parseFloat(temp[right + 2]) - parseFloat(temp[left + 2]);
            number_of_info_retrieved++;
        }
        if (lines[i].includes("NROWS")) {
            let temp = lines[i].split(/\s+/);
            let location = temp.indexOf("NROWS");
            result.n_indirect = parseInt(temp[location + 2]);
            number_of_info_retrieved++;
        }
        if (lines[i].includes("NCOLS")) {
            let temp = lines[i].split(/\s+/);
            let location = temp.indexOf("NCOLS");
            result.n_direct = parseInt(temp[location + 2]);
            number_of_info_retrieved++;
        }
        if (number_of_info_retrieved >=4 && result.n_direct !== undefined && result.n_indirect !== undefined && result.x_ppm_start !== undefined && result.y_ppm_start !== undefined) {
            number_of_info_retrieved = -1; //this is a flag to show that we have found all 4 values
            data_start = i + 1;
            break;
        }
    }

    if(number_of_info_retrieved !== -1)
    {
        result.error = "Cannot find all necessary information in the file";
        return result;
    }

    /**
     * Loop remaining lines to get the data
     */
    result.raw_data = new Float32Array(result.n_direct * result.n_indirect);
    let col_counter = 0;
    let row_counter = 0;
    for(let i=data_start;i<lines.length;i++)
    {
        /**
         * If line start with "# row = ", this is a start of a new row, we reset column counter to 0
         * and get row counter from the line immediately after "# row = "
         */
        if(lines[i].startsWith("# row = "))
        {
            col_counter = 0;
            row_counter = parseInt(lines[i].substring(8));
            continue;
        }
        /**
         * Other lines start with # are comments, we skip them
         * and also skip empty lines
         */
        else if(lines[i].startsWith("#") || lines[i] === "")
        {
            continue;
        }
        /**
         * Others are data line, only one number per line in Topspin totxt format
         */
        else
        {
            result.raw_data [row_counter * result.n_direct + col_counter] = parseFloat(lines[i]);
            col_counter++;
        }
    }

    /**
     * At the end, we should have col_counter = result.n_direct and row_counter = result.n_indirect-1
     */
    if(col_counter !== result.n_direct || row_counter !== result.n_indirect-1)
    {
        result.error = "Cannot find all data in the file";
        return result;
    }

    /**
     * Make x_ppm_width and y_ppm_width positive.
     * Set result.x_ppm_step and result.y_ppm_step. Note that the ppm_step is negative
     */
    result.x_ppm_width = Math.abs(result.x_ppm_width);
    result.y_ppm_width = Math.abs(result.y_ppm_width);
    result.x_ppm_step = -result.x_ppm_width / result.n_direct;
    result.y_ppm_step = -result.y_ppm_width / result.n_indirect;

    /**
     * Set default ref to 0
     */
    result.x_ppm_ref = 0;
    result.y_ppm_ref = 0;

    /**
     * Noise level, spectral_max and min, projection, levels, negative_levels code.
     */
    result = process_spectrum(result);

    /**
     * Setup a fake nmrPipe header, so that we can use the same code to 
     * run DEEP_Picker, VoigtFit, etc.
     */
    result.header = new Float32Array(512); //empty array

    result.header[99] = result.n_direct; //size of direct dimension of the input spectrum
    result.header[219] = result.n_indirect; //size of indirect dimension of the input spectrum
    result.header[221] = 0; // not transposed
    result.header[56] = 1; //real data along both dimensions
    result.header[55] = 1; //real data along both dimensions

    result.header[24] = 2; //direct dimension is the second dimension
    result.header[25] = 1; //indirect dimension is the first dimension

    /**
     * Suppose filed strength is 850 along direct dimension
     * and indirection dimension obs is 85.0
     */
    result.header[119] = 850.0; //observed frequency of direct dimension
    result.header[218] = 85.0; //observed frequency of indirect dimension

    result.header[100] = result.x_ppm_width*850.0; //spectral width of direct dimension
    result.header[229] = result.y_ppm_width*85.0; //spectral width of indirect dimension


    result.header[101] = (result.x_ppm_start-result.x_ppm_width)*850.0; //origin of direct dimension (last point frq in Hz)
    result.header[249] = (result.y_ppm_start-result.y_ppm_width)*85.0; //origin of indirect dimension (last point frq in Hz)

    /**
     * We did not fill carrier frequency, because we do not need it for DEEP_Picker, VoigtFit, etc.
     * They are needed in fid processing, not in spectrum processing.
     */

    return result;
}

/**
 * Process the raw file data of a 2D FT spectrum (nmrPipe .ft2 format)
 * @param {arrayBuffer} arrayBuffer: raw file data
 * @param {string} file_name: name of the file
 * @param {string} spectrum_origin: index to origin of the spectrum for reconstructed spectra, -1 for ft2, -2 for FID and -3 for removed spectra
 * @returns hsqc_spectra object
 */
function process_ft_file(arrayBuffer,file_name, spectrum_origin) {

    let result = new spectrum();

    result.spectrum_format = "ft2";

    result.spectrum_origin = spectrum_origin;

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
    result.datatype_direct = result.header[56];
    result.datatype_indirect = result.header[55];

    /**
     * result.datatype_direct: 1 means real, 0 means complex
     * result.datatype_indirect: 1 means real, 0 means complex
     */
    if ( result.datatype_direct == 0 && result.datatype_indirect == 0) {
        console.log("Complex data along both dimensions.");
        result.n_indirect /= 2; //complex data along both dimensions, per nmrPipe format, so we divide by 2
    }
    else if(result.datatype_direct == 0 && result.datatype_indirect == 1) {
        console.log("Complex data along direct dimension, real data along indirect dimension.");
    }
    else if(result.datatype_direct == 1 && result.datatype_indirect == 0) {
        console.log("Complex data along indirect dimension, real data along direct dimension.");
    }
    else if(result.datatype_direct == 1 && result.datatype_indirect == 1) {
        console.log("Real data along both dimensions.");
    }
    console.log("n_direct: ", result.n_direct);
    console.log("n_indirect: ", result.n_indirect);

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

    const spectral_data = new Float32Array(arrayBuffer);

    let data_size = arrayBuffer.byteLength / 4 - 512;

    /**
     * Let assess data_size, if it is not equal to n_direct * n_indirect * number_of_data_type, set error and return
     * number_of_data_type =1, if both direct and indirect dimensions are real
     * number_of_data_type =2, if either direct or indirect dimension is complex
     * number_of_data_type =4, if both direct and indirect dimensions are complex
     */
    let data_size_per_point = 1;
    if (result.datatype_direct === 1 && result.datatype_indirect === 1) {
        data_size_per_point = 1;
    }
    else if (result.datatype_direct === 0 && result.datatype_indirect === 1) {
        data_size_per_point = 2;
    }
    else if (result.datatype_direct === 1 && result.datatype_indirect === 0) {
        data_size_per_point = 2;
    }
    else if (result.datatype_direct === 0 && result.datatype_indirect === 0) {
        data_size_per_point = 4;
    }

    if (data_size !== result.n_direct * result.n_indirect * data_size_per_point) {
        result.error = "Data size does not match the size of the spectrum";
        return result;
    }

    /**
     * result.raw_data is a Float32Array of the spectrum data, real (along indirect) real (along direct)
     * result.raw_data_ri is a Float32Array of the spectrum data, real (along indirect) imaginary (along direct)
     * result.raw_data_ir is a Float32Array of the spectrum data, imaginary (along indirect) real (along direct)
     * result.raw_data_ii is a Float32Array of the spectrum data, imaginary (along indirect) imaginary (along direct)
     * 
     * They are all row major, size is  n_indirect (rows) * n_direct (columns).
     * Order of data in arrayBuffer, after the 512 float (4 bytes) header
     * raw_data row1, raw_data_ri row1, raw_data_ir row1, raw_data_ii row1, 
     * raw_data row2, raw_data_ri row2, raw_data_ir row2, raw_data_ii row2, ...
     */
    let current_position = 512;

    /**
     * Initialize result.raw_data, result.raw_data_ri, result.raw_data_ir, result.raw_data_ii
     * If no initialization here, it will have default size of 0 (empty array)
     */
    result.raw_data = new Float32Array(result.n_indirect*result.n_direct);
    if(result.datatype_direct === 0){
        result.raw_data_ri = new Float32Array(result.n_indirect*result.n_direct);
    }
    if(result.datatype_indirect === 0){
        result.raw_data_ir = new Float32Array(result.n_indirect*result.n_direct);
    }
    if(result.datatype_direct === 0 && result.datatype_indirect === 0){
        result.raw_data_ii = new Float32Array(result.n_indirect*result.n_direct);
    }
   

    for(let i=0;i<result.n_indirect;i++)
    {
        /**
         * Copy from spectral_data (from current_position, for a length of  result.n_direct)
         * to result.raw_data (from i*result.n_direct, for a length of result.n_direct)
         */
        result.raw_data.set(spectral_data.subarray(current_position,current_position+result.n_direct),i*result.n_direct);
        current_position += result.n_direct;

        if(result.datatype_direct === 0)
        {
            result.raw_data_ri.set(spectral_data.subarray(current_position,current_position+result.n_direct),i*result.n_direct);
            current_position += result.n_direct;
        }
        if(result.datatype_indirect === 0)
        {
            result.raw_data_ir.set(spectral_data.subarray(current_position,current_position+result.n_direct),i*result.n_direct);
            current_position += result.n_direct;
        }
        if(result.datatype_direct === 0 && result.datatype_indirect === 0)
        {
            result.raw_data_ii.set(spectral_data.subarray(current_position,current_position+result.n_direct),i*result.n_direct);
            current_position += result.n_direct;
        }
    }

    /**
     * Keep original file name
     */
    result.filename = file_name;

    result = process_spectrum(result);

    return result;
}

/**
 * Shared code to process the spectrum data to get
 * noise_level, spectral_max, spectral_min, projection_direct, projection_indirect, projection_direct_max, projection_direct_min,
 * projection_indirect_max, projection_indirect_min, levels, negative_levels
 * @param {*} result 
 * @returns 
 */
function process_spectrum(result) {
    /**
 * Get median of abs(z). If data_size is > 1024*1024, we will sample 1024*1024 points by stride
 */
    result.noise_level = estimate_noise_level(result.n_direct, result.n_indirect, result.raw_data);

    /**
     * Get max and min of z (z is sorted)
     */
    [result.spectral_max, result.spectral_min] = find_max_min(result.raw_data);

    /**
     * raw_data is row major, size is  n_indirect (rows) * n_direct (columns).
     * Get projection of the spectrum along direct and indirect dimensions
     */
    result.projection_direct = new Float32Array(result.n_direct);
    result.projection_indirect = new Float32Array(result.n_indirect);

    for (let i = 0; i < result.n_direct; i++) {
        let sum = 0.0;
        for (let j = 0; j < result.n_indirect; j++) {
            sum += result.raw_data[j * result.n_direct + i];
        }
        result.projection_direct[i] = sum;
    }

    for (let i = 0; i < result.n_indirect; i++) {
        let sum = 0.0;
        for (let j = 0; j < result.n_direct; j++) {
            sum += result.raw_data[i * result.n_direct + j];
        }
        result.projection_indirect[i] = sum;
    }

    /**
     * Get max,min of the projection
     */
    [result.projection_direct_max, result.projection_direct_min] = find_max_min(result.projection_direct);
    [result.projection_indirect_max, result.projection_indirect_min] = find_max_min(result.projection_indirect);

    /**
     * In case of reconstructed spectrum from fitting or from NUS, noise_level is usually 0.
     * In that case, we define noise_level as spectral_max/power(1.5,40)
     */
    if (result.noise_level <= Number.MIN_VALUE) {
        result.noise_level = result.spectral_max / Math.pow(1.5, 40);
    }

    /**
     * Calculate positive contour levels 
     */
    result.levels = new Array(40);
    result.levels[0] = 5.5 * result.noise_level;
    for (let i = 1; i < result.levels.length; i++) {
        result.levels[i] = 1.5 * result.levels[i - 1];
        if (result.levels[i] > result.spectral_max) {
            result.levels = result.levels.slice(0, i + 1);
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
            result.negative_levels = result.negative_levels.slice(0, i + 1);
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
         * case 1: both are real
         */
        if(hsqc_spectra[index].datatype_direct === 1 && hsqc_spectra[index].datatype_indirect === 1)
        {
            data = Float32Concat(hsqc_spectra[index].header, hsqc_spectra[index].raw_data);
        }
        /**
         * One or two dimension(s) are complex
         */
        else
        {   
            let n_size = hsqc_spectra[index].n_direct * hsqc_spectra[index].n_indirect;
            if(hsqc_spectra[index].datatype_direct === 0 && hsqc_spectra[index].datatype_indirect === 0)
            {
                n_size *= 4;
            }
            else if(hsqc_spectra[index].datatype_direct === 0 || hsqc_spectra[index].datatype_indirect === 0)
            {
                n_size *= 2;
            }

            data = new Float32Array(512 + n_size);
            let current_position = 0;
            data.set(hsqc_spectra[index].header, current_position);
            current_position += 512;
            for(let i=0;i<hsqc_spectra[index].n_indirect;i++)
            {
                data.set(hsqc_spectra[index].raw_data.subarray(i*hsqc_spectra[index].n_direct,(i+1)*hsqc_spectra[index].n_direct), current_position);
                current_position += hsqc_spectra[index].n_direct;

                if(hsqc_spectra[index].datatype_direct === 0)
                {
                    data.set(hsqc_spectra[index].raw_data_ri.subarray(i*hsqc_spectra[index].n_direct,(i+1)*hsqc_spectra[index].n_direct), current_position);
                    current_position += hsqc_spectra[index].n_direct;
                }
                if(hsqc_spectra[index].datatype_indirect === 0)
                {
                    data.set(hsqc_spectra[index].raw_data_ir.subarray(i*hsqc_spectra[index].n_direct,(i+1)*hsqc_spectra[index].n_direct), current_position);
                    current_position += hsqc_spectra[index].n_direct;
                }
                if(hsqc_spectra[index].datatype_direct === 0 && hsqc_spectra[index].datatype_indirect === 0)
                {
                    data.set(hsqc_spectra[index].raw_data_ii.subarray(i*hsqc_spectra[index].n_direct,(i+1)*hsqc_spectra[index].n_direct), current_position);
                    current_position += hsqc_spectra[index].n_direct;
                }
            }
        }
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
         * First, make a copy of the header and then concatenate with diff_data
         */
        let header = new Float32Array(hsqc_spectra[index].header);
        /**
         * Set datatype to 1, since the difference spectrum is always real
         */
        header[55] = 1.0;
        header[56] = 1.0;
        header[219] = hsqc_spectra[index].n_direct;
        data = Float32Concat(header, diff_data);
    }


    let blob = new Blob([data], { type: 'application/octet-stream' });
    let url = URL.createObjectURL(blob);
    let a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
 }

/**
 * Add a new spectrum to the list and update the contour plot. When contour is updated, add_to_list() is called to update the list of spectra
 * in the uses interface
 * @param {*} result_spectra: an array of object of hsqc_spectrum
 * @param {*} b_from_fid: boolean, whether the spectrum is from a fid file
 * @param {*} b_reprocess: boolean, whether this is a new spectrum or a reprocessed spectrum
 * @param {*} pseudo3d_children: array of indices of pseudo 3D children's previous spectrum_index, only valid if b_reprocess is true and b_from_fid is true
 * @returns 
 */
function draw_spectrum(result_spectra, b_from_fid,b_reprocess,pseudo3d_children=[])
{

    let spectrum_index;

    if(b_from_fid ==false && b_reprocess === false)
    {
        /**
         * New spectrum from ft2, set its index (current length of the spectral array) and color
         */
        spectrum_index = hsqc_spectra.length;
        result_spectra[0].spectrum_index = spectrum_index;
        result_spectra[0].spectrum_color = color_list[(spectrum_index*2) % color_list.length];
        result_spectra[0].spectrum_color_negative = color_list[(spectrum_index*2+1) % color_list.length];
        hsqc_spectra.push(result_spectra[0]);
    }
    else if(b_from_fid === true && b_reprocess === false)
    {
        /**
         * New spectra from fid, set its index (current length of the spectral array) and color
         * It is possible that there are multiple spectra from a single fid file (pseudo 3D)
         */
        let first_spectrum_index = -1;
        for(let i=0;i<result_spectra.length;i++)
        {
            result_spectra[i].spectrum_index = hsqc_spectra.length;
            result_spectra[i].spectrum_color = color_list[(result_spectra[i].spectrum_index*2) % color_list.length];
            result_spectra[i].spectrum_color_negative = color_list[(result_spectra[i].spectrum_index*2+1) % color_list.length];

            /**
             * For spectrum from fid, we need to include all FID files and processing parameters in the result_spectra object
             */
            if(i==0)
            {
                result_spectra[i].fid_process_parameters = fid_process_parameters;
                first_spectrum_index = result_spectra[i].spectrum_index;
                result_spectra[i].spectrum_origin = -2; //from fid
            }
            else
            {
                result_spectra[i].spectrum_origin = 10000 + first_spectrum_index;
                hsqc_spectra[first_spectrum_index].pseudo3d_children.push(result_spectra[i].spectrum_index);
            }

            hsqc_spectra.push(result_spectra[i]);
        }
    }
    else if( b_reprocess === true)
    {
        /**
         * Reprocessed spectrum, get its index and update the spectrum. 
         * Also, update the fid_process_parameters
         */
        spectrum_index = result_spectra[0].spectrum_index;
        result_spectra[0].fid_process_parameters = fid_process_parameters;
        result_spectra[0].spectrum_color = color_list[(spectrum_index*2) % color_list.length];
        result_spectra[0].spectrum_color_negative = color_list[(spectrum_index*2+1) % color_list.length];
        hsqc_spectra[spectrum_index] = result_spectra[0];

        /**
         * If the spectrum is the current spectrum of the main plot, clear its cross section plot because it becomes invalid
         */
        if(main_plot.current_spectral_index === spectrum_index)
        {
            /**
             * clear main_plot.y_cross_section_plot and x_cross_section_plot
             */
            main_plot.y_cross_section_plot.clear();
            main_plot.x_cross_section_plot.clear();
        }

        /**
         * For pseudo-3D, there several cases:
         * 1. Reprocessed all spectra, and previously also processed all spectra,
         *    so pseudo3d_children.length === result_spectra.length-1
         */
        if(result_spectra.length -1 ==pseudo3d_children.length)
        {
            for(let i=1;i<result_spectra.length;i++)
            {
                let new_spectrum_index = pseudo3d_children[i-1];
                result_spectra[i].spectrum_index = new_spectrum_index;
                result_spectra[i].spectrum_origin = 10000 + spectrum_index;
                /**
                 * Copy previous colors
                 */
                result_spectra[i].spectrum_color = hsqc_spectra[new_spectrum_index].spectrum_color;
                result_spectra[i].spectrum_color_negative = hsqc_spectra[new_spectrum_index].spectrum_color_negative;
                hsqc_spectra[new_spectrum_index] = result_spectra[i];
            }
        }
        else if(pseudo3d_children.length === 0 && result_spectra.length > 1)
        {
            /**
             * Reprocessed all spectra, and previously only processed the first spectrum
             */
            for(let i=1;i<result_spectra.length;i++)
            {
                const new_spectrum_index = hsqc_spectra.length;
                result_spectra[i].spectrum_index = new_spectrum_index;
                result_spectra[i].spectrum_color = color_list[(new_spectrum_index*2) % color_list.length];
                result_spectra[i].spectrum_color_negative = color_list[(new_spectrum_index*2+1) % color_list.length];
                result_spectra[i].spectrum_origin = 10000 + spectrum_index;
                hsqc_spectra[spectrum_index].pseudo3d_children.push(new_spectrum_index);
                hsqc_spectra.push(result_spectra[i]);
            }
        }
        else 
        {
            /**
             * Do nothing. Error or unexpected case
             * Or reprocessed only first spectrum and previously processed all spectra or first spectrum
             */
        }

    }
    

    /**
     * initialize the plot with the first spectrum. This function only run once
     */
    init_plot(hsqc_spectra[0]);

    for(let i=0;i<result_spectra.length;i++)
    {
    
        /**
         * Positive contour calculation for the spectrum
         */
        let spectrum_information = {
            /**
             * n_direct,n_indirect, and levels are required for contour calculation
             */
            n_direct: result_spectra[i].n_direct,
            n_indirect: result_spectra[i].n_indirect,
            levels: result_spectra[i].levels,

            /**
             * These are flags to be send back to the main thread
             * so that the main thread know which part to update
             * @var spectrum_type: "full": all contour levels or "partial": new level added at the beginning
             * @var spectrum_index: index of the spectrum in the hsqc_spectra array
             * @var contour_sign: 0: positive contour, 1: negative contour
             */
            spectrum_type: "full",
            spectrum_index: result_spectra[i].spectrum_index,
            spectrum_origin: result_spectra[i].spectrum_origin,
            contour_sign: 0
        };
        my_contour_worker.postMessage({ response_value: result_spectra[i].raw_data, spectrum: spectrum_information });

        /**
         * Negative contour calculation for the spectrum
         */
        spectrum_information.contour_sign = 1;
        spectrum_information.levels = result_spectra[i].negative_levels;
        my_contour_worker.postMessage({ response_value: result_spectra[i].raw_data, spectrum: spectrum_information });
    }
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
function run_DEEP_Picker(spectrum_index,flag)
{
    /**
     * Disable the buttons to run deep picker and voigt fitter
     */
    document.getElementById("run_deep_picker-".concat(spectrum_index)).disabled = true;
    document.getElementById("run_voigt_fitter-".concat(spectrum_index)).disabled = true;


    /**
     * Combine hsqc_spectra[0].raw_data and hsqc_spectra[0].header into one Float32Array
     * Need to copy the header first, modify complex flag (doesn't hurt even when not necessary), then concatenate with raw_data
     */
    let header = new Float32Array(hsqc_spectra[spectrum_index].header);
    header[55] = 1.0;
    header[56] = 1.0;
    header[219] = hsqc_spectra[spectrum_index].n_indirect; //size of indirect dimension of the input spectrum
    let data = Float32Concat(header, hsqc_spectra[spectrum_index].raw_data);
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
        noise_level: noise_level,
        flag: flag //0: DEEP Picker, 1: Simple Picker
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
    document.getElementById("run_voigt_fitter-".concat(spectrum_index)).disabled = true;

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
     * Combine hsqc_spectra[spectrum_index].raw_data and hsqc_spectra[spectrum_index].header into one Float32Array
     * Need to copy the header first, modify complex flag (doesn't hurt even when not necessary), then concatenate with raw_data
     */
    let header = new Float32Array(hsqc_spectra[spectrum_index].header);
    header[55] = 1.0;
    header[56] = 1.0;
    header[219] = hsqc_spectra[spectrum_index].n_indirect; //size of indirect dimension of the input spectrum
    /**
     * Also set 
     */
    let data = Float32Concat(header, hsqc_spectra[spectrum_index].raw_data);
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
        flag: flag, //0: Voigt, 1: Gaussian, 2: Voigt_Lorentzian
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
            if(hsqc_spectra[index].spectrum_origin === -1 || hsqc_spectra[index].spectrum_origin === -2 || hsqc_spectra[index].spectrum_origin >=10000)
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

function apply_current_pc()
{
    /**
     * Get the current PS from main_plot. array of 2 elements [p0,p1] in radian
     */
    let current_ps = main_plot.get_phase_correction();
    /**
     * Convert to degree from radian
     */
    current_ps[0][0] *= 180.0 / Math.PI;
    current_ps[0][1] *= 180.0 / Math.PI;
    current_ps[1][0] *= 180.0 / Math.PI;
    current_ps[1][1] *= 180.0 / Math.PI;


    /**
     * If main_plot.current_spectrum_index == current_reprocess_spectrum_index, we have fid data for the spectrum,
     * we need to update the phase correction for the fid data processing as well
     */
    if(main_plot.current_spectral_index === current_reprocess_spectrum_index)
    {
        let v;
        v=parseFloat(document.getElementById("phase_correction_direct_p0").value) + current_ps[0][0];
        document.getElementById("phase_correction_direct_p0").value = v.toFixed(1);
        hsqc_spectra[current_reprocess_spectrum_index].fid_process_parameters.phase_correction_direct_p0 = v;

        v=parseFloat(document.getElementById("phase_correction_direct_p1").value) + current_ps[0][1];
        document.getElementById("phase_correction_direct_p1").value = v.toFixed(1);
        hsqc_spectra[current_reprocess_spectrum_index].fid_process_parameters.phase_correction_direct_p1 = v;

        v=parseFloat(document.getElementById("phase_correction_indirect_p0").value) + current_ps[1][0];
        document.getElementById("phase_correction_indirect_p0").value = v.toFixed(1);
        hsqc_spectra[current_reprocess_spectrum_index].fid_process_parameters.phase_correction_indirect_p0 = v;

        v=parseFloat(document.getElementById("phase_correction_indirect_p1").value) + current_ps[1][1];
        document.getElementById("phase_correction_indirect_p1").value = v.toFixed(1);
        hsqc_spectra[current_reprocess_spectrum_index].fid_process_parameters.phase_correction_indirect_p1 = v;
        /**
         * To be safe, uncheck auto phase correction
         */
        document.getElementById("auto_direct").checked = false;
        document.getElementById("auto_indirect").checked = false;
        hsqc_spectra[current_reprocess_spectrum_index].fid_process_parameters.auto_direct = false;
        hsqc_spectra[current_reprocess_spectrum_index].fid_process_parameters.auto_indirect = false;
        
    }

    /**
     * Run webass worker to apply phase correction.
     * First, pass the spectrum as a file. 
     */
    let index  = main_plot.current_spectral_index;
    let n_size = hsqc_spectra[index].n_direct * hsqc_spectra[index].n_indirect * 4;
    let data = new Float32Array(512 + n_size);
    let current_position = 0;
    data.set(hsqc_spectra[index].header, current_position);
    current_position += 512;
    for (let i = 0; i < hsqc_spectra[index].n_indirect; i++) {
        data.set(hsqc_spectra[index].raw_data.subarray(i * hsqc_spectra[index].n_direct, (i + 1) * hsqc_spectra[index].n_direct), current_position);
        current_position += hsqc_spectra[index].n_direct;

        if (hsqc_spectra[index].datatype_direct === 0) {
            data.set(hsqc_spectra[index].raw_data_ri.subarray(i * hsqc_spectra[index].n_direct, (i + 1) * hsqc_spectra[index].n_direct), current_position);
            current_position += hsqc_spectra[index].n_direct;
        }
        if (hsqc_spectra[index].datatype_indirect === 0) {
            data.set(hsqc_spectra[index].raw_data_ir.subarray(i * hsqc_spectra[index].n_direct, (i + 1) * hsqc_spectra[index].n_direct), current_position);
            current_position += hsqc_spectra[index].n_direct;
        }
        if (hsqc_spectra[index].datatype_direct === 0 && hsqc_spectra[index].datatype_indirect === 0) {
            data.set(hsqc_spectra[index].raw_data_ii.subarray(i * hsqc_spectra[index].n_direct, (i + 1) * hsqc_spectra[index].n_direct), current_position);
            current_position += hsqc_spectra[index].n_direct;
        }
    }
    /**
     * Convert to Uint8Array to be transferred to the worker
     */
    let data_uint8 = new Uint8Array(data.buffer);
    webassembly_worker.postMessage({
        spectrum_data: data_uint8,
        phase_correction: current_ps,
        spectrum_index: main_plot.current_spectral_index,
        spectrum_name: hsqc_spectra[main_plot.current_spectral_index].filename,
    });
    /**
     * Let user know the processing is started
     */
    document.getElementById("webassembly_message").innerText = "Apply phase correction, please wait...";
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

/**
 * Estimate noise level of a spectrum.
 * Calculate RMSD of each 32*32 segment, and get the median value
 * @param {*} xdim: x dimension of the spectrum
 * @param {*} ydim: y dimension of the spectrum
 * @param {Float32Array} spect: the spectrum data, row major. y*xdim + x to access the element at (x,y)
 * @returns 
 */
function estimate_noise_level(xdim,ydim,spect)
{
    let n_segment_x = Math.floor(xdim / 32);
let n_segment_y = Math.floor(ydim / 32);

let variances = [];      // variance of each segment
let maximal_values = []; // maximal value of each segment

    /**
     * loop through each segment, and calculate variance
     */
    for (let i = 0; i < n_segment_x; i++) {
        for (let j = 0; j < n_segment_y; j++) {
            let t = [];
            for (let m = 0; m < 32; m++) {
                for (let n = 0; n < 32; n++) {
                    t.push(spect[(j * 32 + m) * xdim + i * 32 + n]);
                }
            }

            /**
             * calculate variance of this segment. Subtract the mean value of this segment first
             * also calculate the max value of this segment
             */
            let max_of_t = 0.0;
            let mean_of_t = 0.0;
            for (let k = 0; k < t.length; k++) {
                mean_of_t += t[k];
                if (Math.abs(t[k]) > max_of_t) {
                    max_of_t = Math.abs(t[k]);
                }
            }
            mean_of_t /= t.length;

            let variance_of_t = 0.0;
            for (let k = 0; k < t.length; k++) {
                variance_of_t += (t[k] - mean_of_t) * (t[k] - mean_of_t);
            }
            variance_of_t /= t.length;
            variances.push(variance_of_t);
            maximal_values.push(max_of_t);
        }
    }

    /**
     * Sort the variances and get the median value
     */
    let variances_sorted = [...variances]; // Copy of variances array
    variances_sorted.sort((a, b) => a - b); // Sort in ascending order
    let noise_level = Math.sqrt(variances_sorted[Math.floor(variances_sorted.length / 2)]);
    console.log("Noise level is " + noise_level + " using variance estimation.");

    /**
     * Loop through maximal_values and remove the ones that are larger than 10.0 * noise_level
     * Also remove the corresponding variance as well
     */
    for (let i = maximal_values.length - 1; i >= 0; i--) {
        if (maximal_values[i] > 10.0 * noise_level) {
            maximal_values.splice(i, 1);  // Remove the element at index i
            variances.splice(i, 1);       // Remove corresponding variance
        }
    }

    /**
     * Sort the variances again and get the new median value
     */
    variances_sorted = [...variances];  // Copy the updated variances array
    variances_sorted.sort((a, b) => a - b);  // Sort in ascending order
    noise_level = Math.sqrt(variances_sorted[Math.floor(variances_sorted.length / 2)]);

    console.log("Final noise level is estimated to be " + noise_level);

    return noise_level;

}

/**
 * User click on the button to reprocess the spectrum
 */
function reprocess_spectrum(self,spectrum_index)
{
    function set_fid_parameters(fid_process_parameters)
    {
        document.getElementById("water_suppression").checked = fid_process_parameters.water_suppression;
        document.getElementById("polynomial").value = fid_process_parameters.polynomial;
        document.getElementById("hsqc_acquisition_seq").value = fid_process_parameters.acquisition_seq;
        document.getElementById("apodization_direct").value = fid_process_parameters.apodization_direct;
        document.getElementById("zf_direct").value = fid_process_parameters.zf_direct;
        document.getElementById("phase_correction_direct_p0").value = fid_process_parameters.phase_correction_direct_p0;
        document.getElementById("phase_correction_direct_p1").value = fid_process_parameters.phase_correction_direct_p1;
        document.getElementById("auto_direct").checked = fid_process_parameters.auto_direct;
        document.getElementById("delete_imaginary").checked = fid_process_parameters.delete_direct;
        document.getElementById("extract_direct_from").value = fid_process_parameters.extract_direct_from * 100;
        document.getElementById("extract_direct_to").value = fid_process_parameters.extract_direct_to * 100;
        document.getElementById("apodization_indirect").value = fid_process_parameters.apodization_indirect;
        document.getElementById("zf_indirect").value = fid_process_parameters.zf_indirect;
        document.getElementById("phase_correction_indirect_p0").value = fid_process_parameters.phase_correction_indirect_p0;
        document.getElementById("phase_correction_indirect_p1").value = fid_process_parameters.phase_correction_indirect_p1;
        document.getElementById("auto_indirect").checked = fid_process_parameters.auto_indirect;
        document.getElementById("delete_imaginary_indirect").checked = fid_process_parameters.delete_indirect;
        document.getElementById("neg_imaginary").checked = fid_process_parameters.neg_imaginary === "yes" ? true : false;
    }

    function set_default_fid_parameters()
    {
        document.getElementById("water_suppression").checked = false;
        document.getElementById("polynomial").value =-1;
        document.getElementById("hsqc_acquisition_seq").value = "321"
        document.getElementById("apodization_direct").value = "SP off 0.5 end 0.98 pow 2 elb 0 c 0.5";
        document.getElementById("zf_direct").value = "2";
        document.getElementById("phase_correction_direct_p0").value = 0;
        document.getElementById("phase_correction_direct_p1").value = 0;
        document.getElementById("auto_direct").checked = true;
        document.getElementById("delete_imaginary").checked = false
        document.getElementById("extract_direct_from").value = 0;   
        document.getElementById("extract_direct_to").value =    100;
        document.getElementById("apodization_indirect").value = " SP off 0.5 end 0.98 pow 2 elb 0 c 0.5";
        document.getElementById("zf_indirect").value = "2";
        document.getElementById("phase_correction_indirect_p0").value = 0;
        document.getElementById("phase_correction_indirect_p1").value = 0;
        document.getElementById("auto_indirect").checked = true;
        document.getElementById("delete_imaginary_indirect").checked = false;
        document.getElementById("neg_imaginary").checked = false
    }
    /**
     * Get button text
     */
    let button_text = self.innerText;
    /**
     * If the button text is "Reprocess", we need to prepare for reprocess the spectrum
     */
    if(button_text === "Reprocess")
    {
        /**
         * hide input fid files
         */
        document.getElementById("input_files").style.display = "none";

        /**
         * Set hsqc_spectra[spectrum_index] as the current spectrum
         */
        document.getElementById("spectrum-" + spectrum_index).style.backgroundColor = "lightblue";
        document.getElementById("input_options").style.backgroundColor = "lightblue";
        /**
         * Change button text to "Quit reprocessing"
         */
        self.innerText = "Quit reprocessing";
        /**
         * Hide div "file_area" and "input_files" (of fid_file_area). 
         * Change the button "button_fid_process" text to "Reprocess"
         */
        document.getElementById("file_area").style.display = "none";
        document.getElementById("input_files").style.display = "none";
        document.getElementById("button_fid_process").value = "Reprocess";

        /**
         * Set html elements with the fid_process_parameters of the spectrum
         */
        set_fid_parameters(hsqc_spectra[spectrum_index].fid_process_parameters);
        
        /**
         * Switch to cross section mode for current spectrum
         */
        document.getElementById("show_cross_section".concat("-").concat(spectrum_index)).checked = true;
        document.getElementById("show_projection".concat("-").concat(spectrum_index)).checked = false;
        current_reprocess_spectrum_index = spectrum_index;

        /**
         * Enable apply_phase_correction button
         */
        document.getElementById("button_apply_ps").disabled = false;
    }
    else
    {
        /**
         * Undo hide of input fid files
         */
        document.getElementById("input_files").style.display = "flex";

        /**
         * Reset the spectrum color
         */
        document.getElementById("spectrum-" + spectrum_index).style.backgroundColor = "white";
        document.getElementById("input_options").style.backgroundColor = "white";
        /**
         * Change button text back to "Reprocess"
         */
        self.innerText = "Reprocess";
        /**
         * Show div "file_area" and "input_files" (of fid_file_area).
         * Change the button "button_fid_process"text back to "Upload experimental files and process"
         */
        document.getElementById("file_area").style.display = "block";
        document.getElementById("input_files").style.display = "flex";
        document.getElementById("button_fid_process").value = "Upload experimental files and process";
        current_reprocess_spectrum_index = -1;

        /**
         * Restore default values for html elements
         */
        set_default_fid_parameters();
        /**
         * Disable apply_phase_correction button
         */
        document.getElementById("button_apply_ps").disabled = true;
    }
}


/**
 * Click to add a row at the end to the tbody of table with id "spin_system_table"
 */
function add_one_peak()
{
    let table = document.getElementById("spin_system_table");
    let table_body = table.getElementsByTagName('tbody')[0];
    let row = table_body.insertRow(-1);

    /**
     * The row has 5 cells. 1st is index, 2nd is ppm_c, 3nd is ppm, 4rd is peak width, 5rd is j coupling
     */
    let cell0 = row.insertCell(0);
    let cell1 = row.insertCell(1);
    let cell2 = row.insertCell(2);
    let cell3 = row.insertCell(3);
    let cell4 = row.insertCell(4);


    cell0.innerHTML = row.rowIndex;

    /**
     * Create am input element for ppm_c, and set its type to number and step to any
     */
    let input_ppm_c = document.createElement('input');
    input_ppm_c.type = "number";
    input_ppm_c.step = "any";
    input_ppm_c.addEventListener('change', function () {
        process_ppm_j_change(this.parentElement.parentElement.rowIndex, input_ppm_c.value,input_ppm.value, input_width.value, input_j.value);
    });
    cell1.appendChild(input_ppm_c);
    
    /**
     * Create a input element for ppm, and set its type to number and step to any
     */
    let input_ppm = document.createElement('input');
    input_ppm.type = "number";
    input_ppm.step = "any";
    /**
     * Attach an event listener to input_ppm, so that when the value is changed, the corresponding peak on the plot will be updated
     */
    input_ppm.addEventListener('change', function () {
        process_ppm_j_change(this.parentElement.parentElement.rowIndex, input_ppm_c.value,input_ppm.value, input_width.value, input_j.value);
    });
    cell2.appendChild(input_ppm);

    /**
     * Create input element for peak width, and set its type to number and step to any
     */
    let input_width = document.createElement('input');
    input_width.type = "number";
    input_width.step = "any";
    cell3.appendChild(input_width);
    /**
     * Attach an event listener to input_width, so that when the value is changed, the corresponding peak on the plot will be updated
     */
    input_width.addEventListener('change', function () {
        process_ppm_j_change(this.parentElement.parentElement.rowIndex, input_ppm_c.value,input_ppm.value, input_width.value, input_j.value);
    });

    /**
     * Create a input element for j coupling, and set its type to text and value to ""
     */
    let input_j = document.createElement('input');
    input_j.type = "text";
    input_j.value = "";
    /**
     * Attach an event listener to input_j, so that when the value is changed, the corresponding peak on the plot will be updated
     */
    input_j.addEventListener('change', function () {
        process_ppm_j_change(this.parentElement.parentElement.rowIndex, input_ppm_c.value,input_ppm.value, input_width.value, input_j.value);
    });
    cell4.appendChild(input_j);
}

function process_ppm_j_change(row_index,ppm,ppm_c,width,j)
{
    ppm_c=parseFloat(ppm_c);
    ppm = parseFloat(ppm);
    console.log("Row index is " + row_index + ", ppm is " + ppm + "width is " + width + ", j is " + j);
    /**
     * Simulate peaks from ppm and j coupling
     * Step 1. Separate j coupling into an array of numbers (any number of spaces or commas)
     */
    let j_couplings = j.split(/[\s,]+/).map(Number);

    /**
     * For non-number or spaces, the map function will return NaN or 0, we need to remove them
     */
    j_couplings = j_couplings.filter(function (value) {
        return !isNaN(value) && value !== 0;
    });

    /**
     * Ignore if ppm is not a number
     */
    if(isNaN(ppm) || isNaN(ppm_c) || j_couplings.length === 0)
    {
        return;
    }

    /**
     * @var hz_2_ppm: 1 Hz is how many ppm (direct dimension)
     */
    let hz_2_ppm = 1/hsqc_spectra[0].frq1;
    /**
     * @var ppm_per_step: how many ppm per data point (direct dimension)
     */
    let ppm_per_step = hsqc_spectra[0].x_ppm_width / hsqc_spectra[0].n_direct;

    /**
     * Step 2, apply the j couplings to the ppm, one by one
     */
    let current_peaks = [ppm];
    let new_peaks = [];
    for(let i=0;i<j_couplings.length;i++)
    {
        /**
         * For any peak in current_peaks, apply j_couplings[i] to it
         * to make two new peaks, at ppm + j_couplings[i]/2 and ppm - j_couplings[i]/2
         */
        for(let j=0;j<current_peaks.length;j++)
        {
            new_peaks.push(current_peaks[j] + j_couplings[i] * hz_2_ppm / 2);
            new_peaks.push(current_peaks[j] - j_couplings[i] * hz_2_ppm / 2);
        }
        current_peaks = new_peaks;
        new_peaks = [];
    }

    /**
     * Sum of all j_couplings is the total span of the multiplet
     */
    let total_span = j_couplings.reduce((a,b) => a + b, 0);
    total_span *= hz_2_ppm; // convert to ppm
    total_span += ppm_per_step*10; // add 10 points to the total span

    /**
     * Make a 1D profile from all these peaks, which have same peak width and peak height.
     * Let generate the profile from -total_span/2 to total_span/2 around ppm, at step of ppm_per_step
    */
    let n_data = Math.floor(total_span / ppm_per_step) + 1;
    let x = new Float32Array(n_data);
    let y = new Float32Array(n_data);
    let x_start = ppm - total_span / 2;
    for(let i=0;i<n_data;i++)
    {
        x[i] = x_start + i * ppm_per_step;
        y[i] = 0.0;
    }

    /**
     * Generate the peak profile
     * Note: width is actually sigma, not FWHH
     */
    width *= ppm_per_step; // convert to ppm from points
    for(let i=0;i<current_peaks.length;i++)
    {
        for(let j=0;j<n_data;j++)
        {
            y[j] += Math.exp(-Math.pow(x[j] - current_peaks[i],2) / (2 * Math.pow(width,2)));
        }
    }

    /**
     * Convert x and y to array of [x,y] 
     * Remember y is the intensity of the peak, not the ppm_c value.
     * To plot it correct, we need to convert to ppm_c value
     * [0,1] will be projected to [ppm_c,ppm_c - profile]
     */
    let data = [];
    for(let i=0;i<n_data;i++)
    {
        data.push([x[i],ppm_c - y[i]]);
    }


    /**
     * Update the profile on the plot
     */
    main_plot.add_predicted_peaks(data,row_index-1);
}