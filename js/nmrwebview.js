
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
        alert("Failed to load WebWorker, probably due to browser incompatibility. Please use a modern browser, if you run this program locally, please read last paragraph of instructions");
    }
}


var main_plot; //hsqc plot object
var stage = 1; // Because we have only one stage in this program, we set it to 1 (shared code with other programs, which may have more than one stage)
var tooldiv; //tooltip div
var current_spectrum_index_of_peaks = -1; //index of the spectrum that is currently showing peaks, -1 means none

/**
 * DOM div for the processing message
 */
var oOutput;

var processing_message_title ="";
var processing_message = [];


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
        this.picked_peaks_visible = false; //picked peaks are visible or not
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
         * Only if the dropped file is  in the list
         */
        if (this.files_name.includes(file.name)) {
            let container = new DataTransfer();
            container.items.add(file);
            let file_id = this.files_id[this.files_name.indexOf(file.name)];
            document.getElementById(file_id).files = container.files;
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
            let container = new DataTransfer();
            container.items.add(file);
            let file_id = this.files_id[this.file_extension.indexOf(file_extension)];
            document.getElementById(file_id).files = container.files;
            /**
             * Simulate the change event
             */
            document.getElementById(file_id).dispatchEvent(new Event('change'));
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

    // api = {
    //     version: Module.cwrap("version", "number", []),
    //     deep: Module.cwrap("deep", "number", []),
    //     fid_phase: Module.cwrap("fid_phase", "number", []),
    // };


    // Module.print = function (text) {
    //     console.log("hehe"+text);
    // }

    // out = function (text) {
    //     oProcessing.innerHTML = text;
    // }


    /**
     * Initialize the big plot
     */
    resize_main_plot(1200, 800, 20, 70, 20);

    /**
     * Resize observer for the big plot
     */
    plot_div_resize_observer.observe(document.getElementById("vis_parent")); 

    /**
     * Initialize the file drop processor for the frequency domain spectra
     */
    new file_drop_processor()
    .drop_area('file_area') /** id of dropzone */
    .files_name([]) /** file names to be searched from upload. It is empty because we will use file_extension*/
    .file_extension("ft2")  /** file extenstion to be searched from upload */
    .files_id(["userfile"]) /** Corresponding file element IDs */
    .init();

    /**
     * INitialize the file drop processor for the time domain spectra
     */
    new file_drop_processor()
    .drop_area('fid_file_area') /** id of dropzone */
    .files_name(["acqu2s", "acqus", "ser", "fid"])  /** file names to be searched from upload */
    .files_id(["acquisition_file2", "acquisition_file", "fid_file", "fid_file"]) /** Corresponding file element IDs */
    .init();

    /**
     * When use selected a file, read the file and process it
     */
    document.getElementById('userfile').addEventListener('change', function () {

        /**
         * If no file is selected, do nothing
         */
        if (this.files.length === 0) {
            return;
        }


        /**
         * if filename end .ft2, it is a spectrum, otherwise, do nothing
         */
        if (!this.files[0].name.endsWith(".ft2")) {
            alert("Please select a .ft2 file");
            return;
        }

        read_file_and_process_ft2('userfile')
            .then((result_spectrum) => {

                draw_spectrum(result_spectrum);
  
            });
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
                 * Result is an array of Uint8Array
                 */
                processing_message_title = "Processing time domain spectra";
                webassembly_worker.postMessage({file_data: result});


            })
            .catch((err) => {
                console.log(err);
            });      
    });

});


webassembly_worker.onmessage = function (e) {

    /**
     * if result is stdout, it is the processing message
     */
    if (e.data.stdout) {

        /**
         * Keep a queue of 6 messages
         */
        processing_message.push(e.data.stdout);
        if (processing_message.length > 6) {
            processing_message.shift();
        }
        show_message(processing_message_title,processing_message);
    }
    /**
     * e.data.stdout is defined but empty, it is the end of the processing message
     */
    else if (typeof e.data.stdout !== "undefined" && e.data.stdout === "") {
        processing_message_title = "";
        show_message("",[]); //clear the processing message
    }

    /**
     * If result is peaks
     */
    else if (e.data.peaks) {
        hsqc_spectra[e.data.spectrum_index].picked_peaks = e.data.peaks.picked_peaks;
        processing_message_title = [];
        processing_message = [];
        show_message("",[]); //clear the processing message
        /**
         * Enable the download peaks button
         */
        document.getElementById("download_peaks-".concat(e.data.spectrum_index)).disabled = false;
        /**
         * Enable then simulate a click event to show the peaks
         */
        document.getElementById("show_peaks-".concat(e.data.spectrum_index)).disabled = false;
        document.getElementById("show_peaks-".concat(e.data.spectrum_index)).click();
    }

    /**
     * If result is fitted_peaks and recon_spectrum
     */
    else if (e.data.fitted_peaks && e.data.recon_spectrum) {
        console.log("Fitted peaks and recon_spectrum received");
        hsqc_spectra[e.data.spectrum_index].fitted_peaks = e.data.fitted_peaks;
    }

    /**
     * If result is file_data, it is the frequency domain spectrum
     */
    else if (e.data.file_data) {
        let arrayBuffer = new Uint8Array(e.data.file_data).buffer;
        let result_spectrum = process_ft_file(arrayBuffer,"from_fid.ft2");
        draw_spectrum(result_spectrum);
        processing_message_title = [];
        processing_message = [];
        show_message("",[]); //clear the processing message`
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

    if ('undefined' !== typeof (main_plot)) {
        main_plot.update(input);
    }
}

/**
 * Drag and drop spectra to reorder them 
 */
const sortableList =
    document.getElementById("spectra_list_ol");

 
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
 
const getDragAfterElement = (
    container, y
) => {
    const draggableElements = [
        ...container.querySelectorAll(
            "li:not(.dragging)"
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




function add_spectrum_to_list(index) {
    let new_spectrum = hsqc_spectra[index];
    let new_spectrum_div = document.createElement("li");

    /**
     * Assign a ID to the new spectrum div
     */
    new_spectrum_div.id = "spectrum-".concat(index);

    /**
     * Add a draggable div to the new spectrum div
     */
    let draggable_span = document.createElement("span");
    draggable_span.draggable = true;
    draggable_span.classList.add("draggable");
    draggable_span.appendChild(document.createTextNode("\u2630 Drag me. "));
    draggable_span.style.cursor = "move";
    new_spectrum_div.appendChild(draggable_span);
    
    /**
     * The new DIV will have the following children:
     * A span element with the spectrum noise level
     */
    new_spectrum_div.appendChild(document.createTextNode("Noise: " + new_spectrum.noise_level.toExponential(2) + ","));
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


    /**
     * Add a download button to download the spectrum
     */
    let download_button = document.createElement("button");
    download_button.innerText = "Download frequency domain spectrum";
    download_button.onclick = function () { download_spectrum(index); };
    new_spectrum_div.appendChild(download_button);

    /**
     * Add a run_DEEP_Picker button to run DEEP picker
     */
    let deep_picker_button = document.createElement("button");
    deep_picker_button.innerText = "Run DEEP Picker";
    deep_picker_button.onclick = function () { run_DEEP_Picker(index); };
    new_spectrum_div.appendChild(deep_picker_button);
    /**
     * Add a download peaks button to download the peaks. Default is disabled
     */
    let download_peaks_button = document.createElement("button");
    download_peaks_button.innerText = "Download peaks";
    download_peaks_button.disabled = true;
    download_peaks_button.setAttribute("id", "download_peaks-".concat(index));
    download_peaks_button.onclick = function () { download_peaks(index); };
    new_spectrum_div.appendChild(download_peaks_button);
    /**
     * Add a checkbox to show or hide the peaks. Default is unchecked
     * It has an event listener to show or hide the peaks
     */
    let show_peaks_checkbox = document.createElement("input");
    show_peaks_checkbox.setAttribute("type", "checkbox");
    show_peaks_checkbox.disabled = true;
    show_peaks_checkbox.setAttribute("id", "show_peaks-".concat(index));
    show_peaks_checkbox.onclick = function (e) {
        /**
         * If the checkbox is checked, show the peaks
         */
        if(e.target.checked) {
            show_hide_peaks(index,true);
        }
        else {
            show_hide_peaks(index,false);
        }
    }
    new_spectrum_div.appendChild(show_peaks_checkbox);
    let show_peaks_label = document.createElement("label");
    show_peaks_label.setAttribute("for", "show_peaks-".concat(index));
    show_peaks_label.innerText = "Show picked peaks";
    new_spectrum_div.appendChild(show_peaks_label);


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
    logarithmic_scale_input.setAttribute("value", "1.3");
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
    contour_color_input.addEventListener("change", (e) => { update_contour_color(e,index,0); });
    new_spectrum_div.appendChild(contour_color_label);
    new_spectrum_div.appendChild(contour_color_input);

    /**
     * Add a new line and a slider for the contour level
     * Add a event listener to update the contour level
     */
    let contour_slider = document.createElement("input");
    contour_slider.setAttribute("type", "range");
    contour_slider.setAttribute("id", "contour-slider-".concat(index));
    contour_slider.setAttribute("min", "1");
    contour_slider.setAttribute("max", "20");
    contour_slider.setAttribute("value", "1");
    contour_slider.style.width = "10%";
    contour_slider.addEventListener("input", (e) => {update_contour_slider(e,index,0); });
    new_spectrum_div.appendChild(contour_slider);

    

    /**
     * A span element with the current contour level, whose ID is "contour_level-".concat(index)
     */
    let contour_level_span = document.createElement("span");
    contour_level_span.setAttribute("id", "contour_level-".concat(index));
    contour_level_span.innerText = new_spectrum.levels[0].toFixed(2);
    new_spectrum_div.appendChild(contour_level_span);
    /**
     * Add a line break
     */
    new_spectrum_div.appendChild(document.createElement("br"));

    

    /**
     * Negative contour levels first
     * A input text element with the lowest contour level for contour calculation, whose ID is "contour0-".concat(index)
     */
        let contour0_input_label_negative = document.createElement("label");
        contour0_input_label_negative.setAttribute("for", "contour0_negative-".concat(index));
        contour0_input_label_negative.innerText = "Lowest: ";
        let contour0_input_negative = document.createElement("input");
        contour0_input_negative.setAttribute("type", "text");
        contour0_input_negative.setAttribute("id", "contour0_negative-".concat(index));
        contour0_input_negative.setAttribute("size", "8");
        contour0_input_negative.setAttribute("min",0.001);
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
        reduce_contour_button_negative.onclick = function() { reduce_contour(index,1); };
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
        logarithmic_scale_input_negative.setAttribute("value", "1.3");
        logarithmic_scale_input_negative.setAttribute("size", "3");
        logarithmic_scale_input_negative.setAttribute("min",1.05);
        new_spectrum_div.appendChild(logarithmic_scale_input_label_negative);
        new_spectrum_div.appendChild(logarithmic_scale_input_negative);
    
        /**
         * A button to update the contour plot with the new lowest level and logarithmic scale
         */
        let update_contour_button_negative = document.createElement("button");
        update_contour_button_negative.innerText = "Recalculate";
        update_contour_button_negative.onclick = function() { update_contour0_or_logarithmic_scale(index,1); };
        update_contour_button_negative.setAttribute("title","Update the contour plot with the new lowest level and logarithmic scale. This process might be slow.");
        update_contour_button_negative.style.marginLeft = "1em";
        update_contour_button_negative.style.marginRight = "1em";
        new_spectrum_div.appendChild(update_contour_button_negative);
    
    
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
        contour_color_input_negative.addEventListener("change", (e) => { update_contour_color(e,index,1); });
        new_spectrum_div.appendChild(contour_color_label_negative);
        new_spectrum_div.appendChild(contour_color_input_negative);
    
        /**
         * Add a new line and a slider for the contour level
         * Add a event listener to update the contour level
         */
        let contour_slider_negative = document.createElement("input");
        contour_slider_negative.setAttribute("type", "range");
        contour_slider_negative.setAttribute("id", "contour-slider_negative-".concat(index));
        contour_slider_negative.setAttribute("min", "1");
        contour_slider_negative.setAttribute("max", "20");
        contour_slider_negative.setAttribute("value", "1");
        contour_slider_negative.style.width = "10%";
        contour_slider_negative.addEventListener("input", (e) => { update_contour_slider(e,index,1); });
        new_spectrum_div.appendChild(contour_slider_negative);
    
        
    
        /**
         * A span element with the current contour level, whose ID is "contour_level-".concat(index)
         */
        let contour_level_span_negative = document.createElement("span");
        contour_level_span_negative.setAttribute("id", "contour_level_negative-".concat(index));
        contour_level_span_negative.innerText = new_spectrum.levels[0].toFixed(2);
        new_spectrum_div.appendChild(contour_level_span_negative);



    /**
     * Add the new spectrum div to the list of spectra
     */
    document.getElementById("spectra_list_ol").appendChild(new_spectrum_div);


    /**
     * initialize slider and text of the lowest contour level visible 
     */
    document.getElementById("contour0-".concat(index)).value = hsqc_spectra[index].levels[0].toFixed(2);
    document.getElementById("contour-slider-".concat(index)).max = hsqc_spectra[index].levels.length;
    document.getElementById("contour0_negative-".concat(index)).value = hsqc_spectra[index].negative_levels[0].toFixed(2);
    document.getElementById("contour-slider_negative-".concat(index)).max = hsqc_spectra[index].negative_levels.length;

}

my_contour_worker.onmessage = (e) => {

    if (typeof e.data.message !== "undefined") {
        document.getElementById("contour_message").innerText = e.data.message;
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
            main_plot.contour_lbs.push(0);

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
            add_spectrum_to_list(e.data.spectrum_index);
            main_plot.spectral_order.push(e.data.spectrum_index);
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
            main_plot.contour_lbs_negative.push(0);

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
        document.getElementById("contour_level-".concat(index)).innerText = hsqc_spectra[index].levels[0].toFixed(2);
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
        document.getElementById("contour_level_negative-".concat(index)).innerText = hsqc_spectra[index].negative_levels[0].toFixed(2);
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
                hsqc_spectrum.levels = hsqc_spectrum.levels.slice(0, i);
                break;
            }
        }

        spectrum_information.levels = hsqc_spectrum.levels;
        
        /**
         * Update slider.
         */
        document.getElementById("contour-slider-".concat(index)).max = hsqc_spectrum.levels.length;
        document.getElementById("contour-slider-".concat(index)).value = 1;
        document.getElementById("contour_level-".concat(index)).innerText = hsqc_spectrum.levels[0].toFixed(2);
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
                hsqc_spectrum.negative_levels = hsqc_spectrum.negative_levels.slice(0, i);
                break;
            }
        }

        /**
         * Update slider.
         */
        document.getElementById("contour-slider_negative-".concat(index)).max = hsqc_spectrum.negative_levels.length;
        document.getElementById("contour-slider_negative-".concat(index)).value = 1;
        document.getElementById("contour_level_negative-".concat(index)).innerText = hsqc_spectrum.negative_levels[0].toFixed(2);

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

    if(flag==0)
    {
        /**
         * Update text of corresponding contour_level
         */
        document.getElementById("contour_level-".concat(index)).innerText = hsqc_spectra[index].levels[level - 1].toFixed(2);

        /**
         * Update the current lowest shown level in main_plot
         */
        main_plot.contour_lbs[index] = level - 1;

        /**
         * Update peaks only if current index is the same as current spectrum index of peaks
         * and current spectrum has picked peaks and is visible
         */
        if(current_spectrum_index_of_peaks === index && hsqc_spectra[index].picked_peaks.length > 0 && hsqc_spectra[index].picked_peaks_visible)
        {
            let level = hsqc_spectra[index].levels[main_plot.contour_lbs[index]];
            /**
             * Filter hsqc_spectra[index].picked_peaks by level (index > level)
             * to get an subset of peaks
             */
            let new_peaks = hsqc_spectra[index].picked_peaks.filter(peak => peak.index > level);
            main_plot.add_picked_peaks(new_peaks);
        }

    }
    else if(flag==1)
    {
        /**
         * Update text of corresponding contour_level
         */
        document.getElementById("contour_level_negative-".concat(index)).innerText = hsqc_spectra[index].levels[level - 1].toFixed(2);

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



const read_file_and_process_ft2 = (file_id) => {
    return new Promise((resolve, reject) => {
        let file = document.getElementById(file_id).files[0];
        if (file) {
            var reader = new FileReader();
            reader.onload = function () {
                var arrayBuffer = reader.result;

                // var data = new Uint8Array(reader.result);
                // Module['FS_createDataFile']('/', 'test.ft2', data, true, true, true);

                let result = process_ft_file(arrayBuffer, file.name);
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
function process_ft_file(arrayBuffer,file_name) {

    let result = new spectrum();

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
    let z = new Float32Array(data_size / stride);
    for (var i = 0; i < data_size; i += stride) {
        z_abs[Math.floor(i / stride)] = Math.abs(result.raw_data[i]);
        z[Math.floor(i / stride)] = result.raw_data[i];
    }
    z_abs.sort();
    z.sort();
    result.noise_level = z_abs[Math.floor(z_abs.length / 2)];


    /**
     * Get max and min of z (z is sorted)
     */
    result.spectral_max = z[z.length - 1];
    result.spectral_min = z[0];

    /**
     * Calculate positive contour levels 
     */
    result.levels = new Array(40);
    result.levels[0] = 5.5 * result.noise_level;
    for (let i = 1; i < result.levels.length; i++) {
        result.levels[i] = 1.3 * result.levels[i - 1];
        if (result.levels[i] > result.spectral_max) {
            result.levels = result.levels.slice(0, i);
            break;
        }
    }

    /**
     * Calculate negative contour levels
     */
    result.negative_levels = new Array(40);
    result.negative_levels[0] = -5.5 * result.noise_level;
    for (let i = 1; i < result.negative_levels.length; i++) {
        result.negative_levels[i] = 1.3 * result.negative_levels[i - 1];
        if (result.negative_levels[i] < result.spectral_min) {
            result.negative_levels = result.negative_levels.slice(0, i);
            break;
        }
    }

    return result;
}

/**
 * Download spectrum
 *
 */
 function download_spectrum(index) {
    let filename = hsqc_spectra[index].filename;

    /**
     * generate a blob, which is hsqc_spectra[index].header + hsqc_spectra[index].raw_data
     */
    let data = Float32Concat(hsqc_spectra[index].header, hsqc_spectra[index].raw_data);
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
     * Combine hsqc_spectra[0].raw_data and hsqc_spectra[0].header into one Float32Array
     */
    let data = Float32Concat(hsqc_spectra[spectrum_index].header, hsqc_spectra[spectrum_index].raw_data);
    /**
     * Convert to Uint8Array to be transferred to the worker
     */
    let data_uint8 = new Uint8Array(data.buffer);

    processing_message_title = "Run DEEP Picker";
    webassembly_worker.postMessage({spectrum_data: data_uint8, spectrum_index: spectrum_index});
}

/**
 * Call Voigt fitter to run peak fitting on the spectrum
 * @param {int} spectrum_index: index of the spectrum in hsqc_spectra array
 */
function run_Voigt_fitter(spectrum_index)
{
    /**
     * Combine hsqc_spectra[0].raw_data and hsqc_spectra[0].header into one Float32Array
     */
    let data = Float32Concat(hsqc_spectra[spectrum_index].header, hsqc_spectra[spectrum_index].raw_data);
    /**
     * Convert to Uint8Array to be transferred to the worker
     */
    let data_uint8 = new Uint8Array(data.buffer);

    /**
     * Also send the picked peaks to the worker
     */
    let picked_peaks = hsqc_spectra[spectrum_index].picked_peaks;

    processing_message_title = "Run Voigt Fitter";
    webassembly_worker.postMessage({spectrum_data: data_uint8, picked_peaks: picked_peaks, spectrum_index: spectrum_index});

}

/**
 * Show a message on a floating div with id fixed65146
 * @param {string} message_title 
 * @param {array} message_content 
 */
function show_message(message_title,message_content)
{

    let h3=document.createElement("h3");
    h3.innerHTML = message_title;
    document.getElementById("fixed65146").innerHTML = "";
    document.getElementById("fixed65146").appendChild(h3);


    for(let i=0;i<message_content.length;i++)
    {
        let p = document.createElement("p");
        p.innerHTML = message_content[i];
        document.getElementById("fixed65146").appendChild(p);
    }
}

/**
 * Show or hide peaks on the plot
 */
function show_hide_peaks(index,b_show)
{
    /**
     * Turn off checkbox of all other spectra
     */
    for(let i=0;i<hsqc_spectra.length;i++)
    {
        if(i!==index)
        {
            document.getElementById("show_peaks-"+i).checked = false;
        }
    }

    if(b_show)
    {
        current_spectrum_index_of_peaks = index;
        hsqc_spectra[index].picked_peaks_visible = true;
        /**
         * Get current lowest contour level of the spectrum
         */
        let level = hsqc_spectra[index].levels[main_plot.contour_lbs[index]];
        /**
         * Filter hsqc_spectra[index].picked_peaks by level (index > level)
         * to get an subset of peaks
         */
        let new_peaks = hsqc_spectra[index].picked_peaks.filter(peak => peak.index > level);
        main_plot.add_picked_peaks(new_peaks);
    }
    else
    {
        hsqc_spectra[index].picked_peaks_visible = false;
        main_plot.remove_picked_peaks();
    }
    /**
     * There is no need to redraw the contour plot
     */
}

/**
 * Generate a list of peaks in nmrPipe .tab format
 */
function download_peaks(spectrum_index)
{
    let file_buffer = "VARS INDEX X_PPM Y_PPM HEIGHT\n";
    file_buffer += "FORMAT %5d %10.6f %10.6f %+e\n"; 

    for(let i=0;i<hsqc_spectra[spectrum_index].picked_peaks.length;i++)
    {
        let peak = hsqc_spectra[spectrum_index].picked_peaks[i];
        /**
         * This is a peak object example
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
        file_buffer += (peak.cs_x + hsqc_spectra[spectrum_index].x_ppm_ref).toFixed(6).padStart(10) + " ";
        file_buffer += (peak.cs_y + hsqc_spectra[spectrum_index].y_ppm_ref).toFixed(6).padStart(10) + " ";
        file_buffer += peak.index.toExponential() + " ";
        file_buffer += "\n";
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