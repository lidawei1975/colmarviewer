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


$(document).ready(function () {

    /**
     * This is the main information output area
     */
    oOutput = document.getElementById("infor");


    $(window).resize(function () {
        resize();
    });

    tooldiv = d3.select("body")
        .append("div")
        .attr("class", "tooltip2")
        .style("opacity", 0);

    /**
     * clear hsqc_spectra array
     */
    hsqc_spectra = [];


    /**
     * Set correct size for the big plot
     */
    resize();

    /**
     * Add event listener to the contour0 input text box
     */
    document.getElementById("contour0").addEventListener("change", update_contour0_or_logarithmic_scale);
    /**
     * Add event listener to the logarithmic_scale input text box
     */
    document.getElementById("logarithmic_scale").addEventListener("change", update_contour0_or_logarithmic_scale);

    /**
     * Add event listener to contour_color color picker
     */
    document.getElementById("contour_color").addEventListener("change", update_contour_color);

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

                hsqc_spectra.push(result_spectrum);

                /**
                 * Define a new object to pass to the worker, it includes only the necessary information from hsqc_spectrum
                */
                let hsqc_spectrum_part = {
                    n_direct: result_spectrum.n_direct,
                    n_indirect: result_spectrum.n_indirect,
                    levels: result_spectrum.levels,
                    spectrum_type: "hsqc",
                    spectrum_index: hsqc_spectra.length - 1,
                };

                my_contour_worker.postMessage({ response_value: result_spectrum.raw_data, spectrum: hsqc_spectrum_part });
                set_scale_bigplot();
                if(hsqc_spectra.length === 1)
                {
                    draw_bigplot(hsqc_spectra[0]);
                }
            });
    });

});



my_contour_worker.onmessage = (e) => {

    if (typeof e.data.message !== "undefined") {
        document.getElementById("contour_message").innerText = e.data.message;
        return;
    }

    /**
     * If the message is not a message, it is a result from the worker.
     */

    console.log("Message received from worker, spectral type: " + e.data.spectrum_type);

    if (e.data.spectrum_type === "hsqc" && e.data.spectrum_index === 0) {
        /**
         * We want to make sure main_plot object share same copy of points, polygon_length, levels_length with hsqc_spectrum
         */
        main_plot.points = new Float32Array(e.data.points);
        main_plot.polygon_length = e.data.polygon_length.slice(0);
        main_plot.levels_length = e.data.levels_length.slice(0);
        main_plot.overlays = [main_plot.levels_length.length];
        main_plot.colors = [[0, 0, 1, 1.0]]; //blue
        main_plot.spectral_information = [{
            n_direct: hsqc_spectra[0].n_direct,
            n_indirect: hsqc_spectra[0].n_indirect,
            x_ppm_start: hsqc_spectra[0].x_ppm_start,
            x_ppm_step: hsqc_spectra[0].x_ppm_step,
            y_ppm_start: hsqc_spectra[0].y_ppm_start,
            y_ppm_step: hsqc_spectra[0].y_ppm_step
        }];

        /**
         * Draw the big plot with the new contour data, which has been updated by above 3 lines
         */
        main_plot.redraw_contour();
        set_scale_bigplot();
    }
    else if (e.data.spectrum_type === "hsqc") {
        /**
         * This is not the 0st spectrum. Need to add new overlay to the main_plot object
         */
        /**
         * Update main_plot.overlays from [20] to [20 40] suppose new_overlay.levels_length.length is 20
         */
        main_plot.overlays.push(main_plot.overlays[main_plot.overlays.length-1]+e.data.levels_length.length);

        /**
         * Append new_overlay.levels_length to main_plot.levels_length
         * [8,13] + [5,7] ==> [8,13,18,20]
         */
        let current_levels_length=main_plot.levels_length[main_plot.levels_length.length-1];
        for(var i=0;i<e.data.levels_length.length;i++)
        {
            main_plot.levels_length.push(e.data.levels_length[i]+current_levels_length);
        }

        /**
         * Append new_overlay.polygon_length to main_plot.polygon_length
         * [8,13] + [5,7] ==> [8,13,18,20]
        */
        let current_polygon_length=main_plot.polygon_length[main_plot.polygon_length.length-1];
        for(var i=0;i<e.data.polygon_length.length;i++)
        {
            main_plot.polygon_length.push(e.data.polygon_length[i]+current_polygon_length);
        }

        /**
         * Append new_overlay.points to main_plot.points
        */
        main_plot.points=Float32Concat(main_plot.points, new Float32Array(e.data.points));

        /**
         * Append new color to main_plot.colors
         */
        main_plot.colors.push([1,0,0,1]);

        /**
         * Appned new spectral_information to main_plot.spectral_information
         */
        main_plot.spectral_information.push({
            n_direct: hsqc_spectra[e.data.spectrum_index].n_direct,
            n_indirect: hsqc_spectra[e.data.spectrum_index].n_indirect,
            x_ppm_start: hsqc_spectra[e.data.spectrum_index].x_ppm_start,
            x_ppm_step: hsqc_spectra[e.data.spectrum_index].x_ppm_step,
            y_ppm_start: hsqc_spectra[e.data.spectrum_index].y_ppm_start,
            y_ppm_step: hsqc_spectra[e.data.spectrum_index].y_ppm_step
        });

        main_plot.redraw_contour();


    }
    else if (e.data.spectrum_type === "hsqc-unshiftdd")
    {
        /**
         * For type hsqc-unshift, we will insert e.data.points,polygon_length,levels_length to the beginning of current contour data
         * Step 1, concat the new points and current points
        */
        let new_points = new Float32Array(e.data.points.length + main_plot.points.length);
        new_points.set(e.data.points, 0);
        new_points.set(main_plot.points, e.data.points.length);
        main_plot.points = new_points;

        /**
         * Step 2, concat the new polygon_length and current polygon_length 
         * Before that, add e.data.polygon_length[last_element] to each element of main_plot.polygon_length
         */
        let polygon_shift = e.data.polygon_length[e.data.polygon_length.length - 1];
        for (let i = 0; i < main_plot.polygon_length.length; i++) {
            main_plot.polygon_length[i] += polygon_shift;
        }
        main_plot.polygon_length = e.data.polygon_length.concat(main_plot.polygon_length);

        /**
         * Step 3, concat the new levels_length and current levels_length
         * Before that, add e.data.levels_length[last_element] to each element of main_plot.levels_length
         */
        let levels_shift = e.data.levels_length[e.data.levels_length.length - 1];
        for (let i = 0; i < main_plot.levels_length.length; i++) {
            main_plot.levels_length[i] += levels_shift;
        }
        main_plot.levels_length = e.data.levels_length.concat(main_plot.levels_length);

        /**
         * Step 4, update main_plot.overlays. Because new data is inserted to the beginning, we need to shift all elements of overlays by 1
         */
        for (let i = 0; i < main_plot.overlays.length; i++) {
            main_plot.overlays[i] += 1;
        }

        /**
         * Draw the big plot with the new contour data, which has been updated by above 3 lines
         */
        main_plot.redraw_contour();
        set_scale_bigplot();

    }

    document.getElementById("contour_message").innerText = "";
};


function set_scale_bigplot() {
    document.getElementById("contour0").value = hsqc_spectra[0].levels[0].toFixed(2);
    document.getElementById("contour-slider").max = hsqc_spectra[0].levels.length;
}

/**
 * 
 * @param {obj} input an spectrum object. 
 */
function draw_bigplot(input) {

    let wid = parseInt(document.getElementById('body').clientWidth) - 40;
    let wid2 = wid * 0.65 + 50;

    document.getElementById('visualization').style.height = wid2.toString().concat('px');
    document.getElementById('visualization').style.width = wid.toString().concat('px');

    input.PointData = [];
    input.WIDTH = wid;
    input.HEIGHT = wid2;
    input.MARGINS = { top: 20, right: 20, bottom: 50, left: 50 };
    input.drawto = "#visualization";
    input.drawto_legend = "#legend";
    input.drawto_peak = "#peaklist";
    input.drawto_contour = "canvas1"; //webgl background as contour plot


    main_plot = new plotit(input);
    main_plot.draw();
    main_plot.draw_peaks();

    d3.select("#contour-slider").on("input", function () {
        main_plot.update_contour(+this.value);
        /**
         * Update the text of contour_level
         */
        document.getElementById("contour_level").innerText = hsqc_spectra[0].levels[this.value - 1].toFixed(2);
    });
    let tt = document.getElementById("contour-slider").value;
    document.getElementById("contour_level").max = hsqc_spectra[0].levels.length;
    document.getElementById("contour_level").innerText = hsqc_spectra[0].levels[tt - 1].toFixed(2);
    main_plot.update_contour(+tt);

    document.getElementById("noise_level").value  = input.noise_level.toExponential(2);
};



/**
 * This function is called when the user resize the big plot by adjusting the window size
 */
function resize() {

    let wid0 = parseInt(document.getElementById('body').clientWidth) - 20;
    let wid = wid0 - 20;
    let wid2 = wid * 0.65 + 50;

    document.getElementById('plot').style.width = wid0.toString().concat('px');
    /**
     * Div plot will have auto height to fit the content (legend will change heights, others won't)
     */

    document.getElementById('visualization').style.height = wid2.toString().concat('px');
    document.getElementById('visualization').style.width = wid.toString().concat('px');

    /**
     * same size for svg_parent (parent of visualization), canvas_parent (parent of canvas1), canvas1, 
     * and vis_parent (parent of visualization and canvas_parent)
     */
    document.getElementById('svg_parent').style.height = wid2.toString().concat('px');
    document.getElementById('svg_parent').style.width = wid.toString().concat('px');
    document.getElementById('vis_parent').style.height = wid2.toString().concat('px');
    document.getElementById('vis_parent').style.width = wid.toString().concat('px');

    /**
     * canvas is shifted 50px to the right, 20 px to the bottom.
     * It is also shorttened by 20px in width on the right and 50px in height on the bottom.
     */
    let canvas_height = wid2 - 70;
    let canvas_width = wid - 70;

    document.getElementById('canvas_parent').style.height = canvas_height.toString().concat('px');
    document.getElementById('canvas_parent').style.width = canvas_width.toString().concat('px');
    document.getElementById('canvas_parent').style.top = "20px";
    document.getElementById('canvas_parent').style.left = "50px";
    document.getElementById('canvas1').style.height = canvas_height.toString().concat('px');
    document.getElementById('canvas1').style.width = canvas_width.toString().concat('px');

    /**
     * Set canvas1 width and height to be the same as its style width and height
     */
    document.getElementById('canvas1').setAttribute("height", canvas_height.toString());
    document.getElementById('canvas1').setAttribute("width", canvas_width.toString());

    let input = {
        WIDTH: wid,
        HEIGHT: wid2
    };

    if ('undefined' !== typeof (main_plot)) {
        main_plot.update(input);
    }

}


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
function reduce_contour() {
    /**
     * Get current lowest level from input field contour0
     * and current scale from input field logarithmic_scale
     */
    let current_level = parseFloat(document.getElementById('contour0').value);
    let scale = parseFloat(document.getElementById('logarithmic_scale').value);

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
        spectrum_type: "hsqc-unshift"
    };

    my_contour_worker.postMessage({ response_value: hsqc_spectrum.raw_data, spectrum: hsqc_spectrum_part });


    let tt = document.getElementById("contour-slider").value;
    document.getElementById("contour_level").innerText = hsqc_spectrum.levels[tt - 1].toFixed(2);
}

/**
 * Event listener for text input field contour0
 */
function update_contour0_or_logarithmic_scale(e) {
    let current_level = parseFloat(document.getElementById('contour0').value);
    let scale = parseFloat(document.getElementById('logarithmic_scale').value);



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
        spectrum_type: "hsqc"
    };

    my_contour_worker.postMessage({ response_value: hsqc_spectrum.raw_data, spectrum: hsqc_spectrum_part });

}

/**
 * Event listener for color picker contour_color
 * @param {*} e 
 */
function update_contour_color(e) {
    let color = document.getElementById('contour_color').value;
    main_plot.colors = [[parseInt(color.substring(1, 3), 16) / 255, parseInt(color.substring(3, 5), 16) / 255, parseInt(color.substring(5, 7), 16) / 255, 1.0]];
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



function Float32Concat(first, second)
{
    var firstLength = first.length,
        result = new Float32Array(firstLength + second.length);

    result.set(first);
    result.set(second, firstLength);

    return result;
}