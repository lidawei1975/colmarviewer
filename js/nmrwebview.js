function MyWorker() {

    importScripts('https://d3js.org/d3.v7.min.js');

    onmessage = (e) => {
        postMessage({ message: "Calculating " + e.data.spectrum.spectrum_type });
        let workerResult = {};
        process_spectrum_data(e.data.response_value, e.data.spectrum, workerResult);
        postMessage(workerResult);
    };


    function process_spectrum_data(response_value, spectrum, workerResult) {
        let polygons = d3.contours().size([spectrum.n_direct, spectrum.n_indirect]).thresholds(spectrum.levels)(response_value);
        let polygon_2d = [];


        workerResult.polygon_length = [];
        workerResult.levels_length = [];


        for (let m = 0; m < polygons.length; m++) {
            for (let i = 0; i < polygons[m].coordinates.length; i++) {
                for (let j = 0; j < polygons[m].coordinates[i].length; j++) {
                    let coors2 = polygons[m].coordinates[i][j];
                    polygon_2d = polygon_2d.concat(coors2);
                    workerResult.polygon_length.push(polygon_2d.length);
                }
            }
            workerResult.levels_length.push(workerResult.polygon_length.length);
        }
        let polygon_1d = new Array(polygon_2d.length * 2);

        for (let i = 0; i < polygon_2d.length; i++) {
            polygon_1d[i * 2] = polygon_2d[i][0];
            polygon_1d[i * 2 + 1] = polygon_2d[i][1];
        }
        workerResult.points = new Float32Array(polygon_1d);

        workerResult.spectrum_type = spectrum.spectrum_type;
        workerResult.spectrum_index = spectrum.spectrum_index;
    }

}

const fn = MyWorker.toString();
const fnBody = fn.substring(fn.indexOf('{') + 1, fn.lastIndexOf('}'));
const workerSourceURL = URL.createObjectURL(new Blob([fnBody]));
const my_contour_worker = new Worker(workerSourceURL);


var main_plot; //hsqc plot object
var stage = 1; // Because we have only one stage in this program, we set it to 1 (shared code with other programs, which may have more than one stage)


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
    }
};

var hsqc_spectra = []; //array of hsqc spectra


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

$(document).ready(function () {

    /**
     * This is the main information output area
     */
    oOutput = document.getElementById("infor");


    tooldiv = d3.select("body")
        .append("div")
        .attr("class", "tooltip2")
        .style("opacity", 0);

    /**
     * clear hsqc_spectra array
     */
    hsqc_spectra = [];


    /**
     * Initialize the big plot
     */
    resize_main_plot(1200, 800, 20, 50, 20);

    /**
     * Resize observer for the big plot
     */
    plot_div_resize_observer.observe(document.getElementById("vis_parent")); 



    /**
     * Form "upload_spectra" processing
    */
    $('form#upload_spectra').submit(function (e) {
        e.preventDefault();
        /**
         * We do not upload to any server, just read the file and process it
         * Get the file from the input field file1.
         * read_file() is a promise function. On success, it will process the data and return a promise
         * with resolve(response) where response is the spectrum object
        */
        read_file('userfile')
            .then((result_spectrum) => {

                let spectrum_index = hsqc_spectra.length;

                result_spectrum.spectrum_index = spectrum_index;
                result_spectrum.spectrum_color = color_list[spectrum_index % color_list.length];

                hsqc_spectra.push(result_spectrum);

                /**
                 * Define a new object to pass to the worker, it includes only the necessary information from hsqc_spectrum
                */
                let hsqc_spectrum_part = {
                    n_direct: result_spectrum.n_direct,
                    n_indirect: result_spectrum.n_indirect,
                    levels: result_spectrum.levels,
                    spectrum_type: "full",
                    spectrum_index: spectrum_index,
                };

                /**
                 * Add the new spectrum to the list of hsqc_spectra
                 */
                add_spectrum_to_list(spectrum_index);

                my_contour_worker.postMessage({ response_value: result_spectrum.raw_data, spectrum: hsqc_spectrum_part });
                set_scale_bigplot(hsqc_spectra.length - 1);
                if(hsqc_spectra.length === 1)
                {
                    init_plot(hsqc_spectra[0]);
                }
            });
    });
});


var plot_div_resize_observer = new ResizeObserver(entries => {
    for (let entry of entries) {

        const cr = entry.contentRect;
        let padding = 20;
        let margin_left = 50;
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
    let canvas_height = height - 70;
    let canvas_width = wid - 70;

    document.getElementById('canvas_parent').style.height = canvas_height.toString().concat('px');
    document.getElementById('canvas_parent').style.width = canvas_width.toString().concat('px');
    document.getElementById('canvas_parent').style.top = (padding + margin_top).toFixed(0).concat('px');
    document.getElementById('canvas_parent').style.left = (padding + margin_left).toFixed(0).concat('px');


    /**
     * Set canvas1 style width and height to be the same as its parent
     */
    document.getElementById('canvas1').style.height = canvas_height.toString().concat('px');
    document.getElementById('canvas1').style.width = canvas_width.toString().concat('px');
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




function add_spectrum_to_list(index) {
    let new_spectrum = hsqc_spectra[index];
    let new_spectrum_div = document.createElement("li");
    
    /**
     * The new DIV will have the following children:
     * A span element with the spectrum noise level
     */
    
    new_spectrum_div.appendChild(document.createTextNode("Noise level: " + new_spectrum.noise_level.toExponential(2) + " "));
    
    /**
     * A input text element with the lowest contour level for contour calculation, whose ID is "contour0-".concat(index)
     */
    let contour0_input_label = document.createElement("label");
    contour0_input_label.setAttribute("for", "contour0-".concat(index));
    contour0_input_label.innerText = "Lowest contour level: ";
    let contour0_input = document.createElement("input");
    contour0_input.setAttribute("type", "text");
    contour0_input.setAttribute("id", "contour0-".concat(index));
    contour0_input.setAttribute("size", "8");
    new_spectrum_div.appendChild(contour0_input_label);
    new_spectrum_div.appendChild(contour0_input);

    /**
     * A button element with the text "Reduce contour", with onclick event listener to reduce_contour(index)
     * Add two spaces around the button
     */
    let reduce_contour_button = document.createElement("button");
    /**
     * Create a text node with the text ">" and class rotate90
     */
    let textnode = document.createTextNode(">");
    let textdiv = document.createElement("div");
    textdiv.appendChild(textnode);
    textdiv.classList.add("rotate90");

    reduce_contour_button.appendChild(textdiv);
    reduce_contour_button.setAttribute("onclick", "reduce_contour(event)");
    reduce_contour_button.setAttribute("id", index);
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
    logarithmic_scale_input_label.innerText = "  Logarithmic scale: ";
    let logarithmic_scale_input = document.createElement("input");
    logarithmic_scale_input.setAttribute("type", "text");
    logarithmic_scale_input.setAttribute("id", "logarithmic_scale-".concat(index));
    logarithmic_scale_input.setAttribute("value", "1.3");
    logarithmic_scale_input.setAttribute("size", "3");
    new_spectrum_div.appendChild(logarithmic_scale_input_label);
    new_spectrum_div.appendChild(logarithmic_scale_input);

    /**
     * A button to update the contour plot with the new lowest level and logarithmic scale
     */
    let update_contour_button = document.createElement("button");
    update_contour_button.innerText = "Recalculate contour";
    update_contour_button.setAttribute("onclick", "update_contour0_or_logarithmic_scale(event)");
    update_contour_button.setAttribute("title","Update the contour plot with the new lowest level and logarithmic scale. This process might be slow.");
    /**
     * Add a id to the button, which is index, so that we know which spectrum to update
     */
    update_contour_button.setAttribute("id", index);
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
    contour_color_label.innerText = "Contour color: ";
    let contour_color_input = document.createElement("input");
    contour_color_input.setAttribute("type", "color");
    contour_color_input.setAttribute("value", rgbToHex(new_spectrum.spectrum_color));
    contour_color_input.setAttribute("id", "contour_color-".concat(index));
    contour_color_input.addEventListener("change", update_contour_color);
    new_spectrum_div.appendChild(contour_color_label);
    new_spectrum_div.appendChild(contour_color_input);

    /**
     * Add a new line and a slider for the contour level
     * Add a event listener to update the contour level
     */
    new_spectrum_div.appendChild(document.createElement("br"));
    let contour_slider = document.createElement("input");
    contour_slider.setAttribute("type", "range");
    contour_slider.setAttribute("id", "contour-slider-".concat(index));
    contour_slider.setAttribute("min", "1");
    contour_slider.setAttribute("max", "20");
    contour_slider.setAttribute("value", "1");
    contour_slider.style.width = "70%";
    contour_slider.addEventListener("input", update_contour_slider);
    new_spectrum_div.appendChild(contour_slider);

    /**
     * A span element with the current contour level, whose ID is "contour_level-".concat(index)
     */
    let contour_level_span = document.createElement("span");
    contour_level_span.setAttribute("id", "contour_level-".concat(index));
    contour_level_span.innerText = new_spectrum.levels[0].toFixed(2);
    new_spectrum_div.appendChild(contour_level_span);

    /**
     * Add the new spectrum div to the list of spectra
     */
    document.getElementById("spectra_list_ol").appendChild(new_spectrum_div);
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
     * Type is full and length is 1, this is the only spectrum
     */
    if (e.data.spectrum_type === "full" && hsqc_spectra.length === 1) {

        main_plot.points = new Float32Array(e.data.points);
        main_plot.polygon_length = [e.data.polygon_length.slice(0)];
        main_plot.levels_length = [e.data.levels_length.slice(0)];
        main_plot.colors = [hsqc_spectra[e.data.spectrum_index].spectrum_color];
        main_plot.contour_lbs = [0];
        main_plot.spectral_information = [{
            n_direct: hsqc_spectra[0].n_direct,
            n_indirect: hsqc_spectra[0].n_indirect,
            x_ppm_start: hsqc_spectra[0].x_ppm_start,
            x_ppm_step: hsqc_spectra[0].x_ppm_step,
            y_ppm_start: hsqc_spectra[0].y_ppm_start,
            y_ppm_step: hsqc_spectra[0].y_ppm_step
        }];

        /**
         * We need to keep track of the end of the arrays, so that we know where each spectrum ends and starts
         */
        main_plot.points_stop = [main_plot.points.length];

        /**
         * Draw the big plot with the new contour data, which has been updated above
         */
        main_plot.redraw_contour();
    }
    /**
     * Type is full and length is more than 1, spectrum_index === length - 1,
     * We are adding a new overlay to the main plot
     */
    else if (e.data.spectrum_type === "full" && hsqc_spectra.length > 1 && hsqc_spectra.length-1 === e.data.spectrum_index)
    {
        main_plot.levels_length.push(e.data.levels_length);
        main_plot.polygon_length.push(e.data.polygon_length);

        /**
         * Append new_overlay.points to main_plot.points
        */
        main_plot.points=Float32Concat(main_plot.points, new Float32Array(e.data.points));

        /**
         * Append new color to main_plot.colors
         */
        main_plot.colors.push(hsqc_spectra[e.data.spectrum_index].spectrum_color);

        /**
         * Append new contour_lb to main_plot.contour_lbs
         */
        main_plot.contour_lbs.push(0);

        /**
         * Append new spectral_information to main_plot.spectral_information
         */
        main_plot.spectral_information.push({
            n_direct: hsqc_spectra[e.data.spectrum_index].n_direct,
            n_indirect: hsqc_spectra[e.data.spectrum_index].n_indirect,
            x_ppm_start: hsqc_spectra[e.data.spectrum_index].x_ppm_start,
            x_ppm_step: hsqc_spectra[e.data.spectrum_index].x_ppm_step,
            y_ppm_start: hsqc_spectra[e.data.spectrum_index].y_ppm_start,
            y_ppm_step: hsqc_spectra[e.data.spectrum_index].y_ppm_step
        });

        /**
         * Keep track of the end of the points array (Float32Array)
         */
        main_plot.points_stop.push(main_plot.points.length);

        main_plot.redraw_contour();
    }

    /**
     * Type is full and length is more than 1, spectrum_index < length - 1,
     * We are updating an existing overlay to the main plot
     */
    else if (e.data.spectrum_type === "full" && hsqc_spectra.length > 1 && hsqc_spectra.length-1 > e.data.spectrum_index)
    {
        /**
         * Step 1, Get the size different between the old spectrum's levels_length, polygon_length and points.length and the updated one
         */
        let old_levels_length_size=main_plot.levels_length_stop[e.data.spectrum_index]-main_plot.levels_length_stop[e.data.spectrum_index-1];
        let old_polygon_length_size=main_plot.polygon_length_stop[e.data.spectrum_index]-main_plot.polygon_length_stop[e.data.spectrum_index-1];
        let old_points_size=main_plot.points_stop[e.data.spectrum_index]-main_plot.points_stop[e.data.spectrum_index-1];

        let new_levels_length_size=e.data.levels_length.length;

    }
   

    document.getElementById("contour_message").innerText = "";
};

/**
 * Update contour0-index to the lowest level of the contour plot of the spectrum with index
 * Update contour-slider-index to the number of levels of the contour plot of the spectrum with index
 * @param {int} index spectral index in hsqc_spectra array
 */
function set_scale_bigplot(index) {
    document.getElementById("contour0-".concat(index)).value = hsqc_spectra[index].levels[0].toFixed(2);
    document.getElementById("contour-slider-".concat(index)).max = hsqc_spectra[index].levels.length;
}

/**
 * This function should be called only once when the first spectrum is loaded
 * to initialize the big plot
 * @param {obj} input an spectrum object. 
 */
function init_plot(input) {

    let wid = 1200;
    let height = 800;

    document.getElementById('visualization').style.height = height.toString().concat('px');
    document.getElementById('visualization').style.width = wid.toString().concat('px');

    input.PointData = [];
    input.WIDTH = wid;
    input.HEIGHT = height;
    input.MARGINS = { top: 20, right: 20, bottom: 50, left: 50 };
    input.drawto = "#visualization";
    input.drawto_legend = "#legend";
    input.drawto_peak = "#peaklist";
    input.drawto_contour = "canvas1"; //webgl background as contour plot


    main_plot = new plotit(input);
    main_plot.draw();
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
 * Event listener for button reduce_contour
 */
function reduce_contour(e) {

    /**
     * Get spectrum index from the id of the button
     */
    let index = e.target.id;

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
    document.getElementById('contour0').value = current_level;

    /**
     * Update hsqc_spectrum.levels (add the new level to the beginning of the array)
     */
    hsqc_spectra[0].levels.unshift(current_level);

    /**
     * Recalculate the contour plot
     */
    let hsqc_spectrum_part = {
        n_direct: hsqc_spectrum.n_direct,
        n_indirect: hsqc_spectrum.n_indirect,
        levels: [hsqc_spectrum.levels[0]],
        spectrum_type: "partial",
        spectrum_index: 0
    };

    my_contour_worker.postMessage({ response_value: hsqc_spectrum.raw_data, spectrum: hsqc_spectrum_part });


    let tt = document.getElementById("contour-slider").value;
    document.getElementById("contour_level").innerText = hsqc_spectrum.levels[tt - 1].toFixed(2);
}

/**
 * Event listener for text input field contour0
 */
function update_contour0_or_logarithmic_scale(e) {

    /**
     * Get spectrum index from the id of the button
     */
    let index = parseInt(e.target.id);

    let current_level = parseFloat(document.getElementById('contour0-'+index.toFixed(0)).value);
    let scale = parseFloat(document.getElementById('logarithmic_scale-'+index.toFixed(0)).value);

    let hsqc_spectrum = hsqc_spectra[index]; 

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

    let hsqc_spectrum_part = {
        n_direct: hsqc_spectrum.n_direct,
        n_indirect: hsqc_spectrum.n_indirect,
        levels: hsqc_spectrum.levels,
        spectrum_type: "full",
        spectrum_index: index
    };

    my_contour_worker.postMessage({ response_value: hsqc_spectrum.raw_data, spectrum: hsqc_spectrum_part });

}

/**
 * Event listener for slider contour-slider
 * @param {*} e the slider event
 */
function update_contour_slider(e) {
    /**
     * Get the index of the spectrum from the id of the slider
     */
    let last_dash = e.target.id.lastIndexOf("-");
    let index = parseInt(e.target.id.substring(last_dash + 1));

    /**
     * Get new level from the slider value
     */
    let level = parseInt(e.target.value);

    /**
     * Update text of corresponding contour_level
     */
    document.getElementById("contour_level-".concat(index)).innerText = hsqc_spectra[index].levels[level - 1].toFixed(2);

    /**
     * Update the current lowest shown level in main_plot
     */
    main_plot.contour_lbs[index] = level - 1;
    main_plot.redraw_contour();
}


/**
 * Event listener for color picker contour_color
 * @param {*} e 
 */
function update_contour_color(e) {
    /**
     * Get spectral index from the id of the color picker
     * e.target.id is something like "contour_color-0"
     */
    let last_dash = e.target.id.lastIndexOf("-");
    let index = parseInt(e.target.id.substring(last_dash + 1));
    let color = e.target.value;

    /**
     * Update the color of the spectrum
    */
    hsqc_spectra[index].spectrum_color = color;
    
    /**
     * Update the color of the contour plot
     */
    main_plot.colors[index] = hexToRgb(color);
    main_plot.redraw_contour();
}

const read_file = (file_id) => {
    return new Promise((resolve, reject) => {
        let file = document.getElementById(file_id).files[0];
        if (file) {
            var reader = new FileReader();
            reader.onload = function (e_file_read) {
                var arrayBuffer = e_file_read.target.result;
                console.log(arrayBuffer.byteLength);

                let result = new spectrum();

                result.header = new Float32Array(arrayBuffer, 0, 512);

                result.n_indirect = result.header[219]; //size of indirect dimension of the input spectrum
                result.n_direct = result.header[99]; //size of direct dimension of the input spectrum

                result.tp = result.header[221];
                result.sw1 = result.header[100];
                result.sw2 = result.header[229];
                result.frq1 = result.header[119];
                result.frq2 = result.header[218];
                result.ref1 = result.header[101];
                result.ref2 = result.header[249];

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


                let data_size = arrayBuffer.byteLength / 4 - 512;

                result.raw_data = new Float32Array(arrayBuffer, 512 * 4, data_size);

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
                result.spectral_max = z_abs[z_abs.length - 1];

                result.levels = new Array(40);
                result.levels[0] = 5.5 * result.noise_level;
                for (let i = 1; i < result.levels.length; i++) {
                    result.levels[i] = 1.3 * result.levels[i - 1];
                    if (result.levels[i] > result.spectral_max) {
                        result.levels = result.levels.slice(0, i);
                        break;
                    }
                }

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
} //end of read_file


/**
 * Helper functions.
 */

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