function MyWorker() {

    importScripts('https://d3js.org/d3.v7.min.js');

    onmessage = (e) => {
        postMessage({ message: "Calculating " + e.data.spectrum.spectrum_type });
        let workerResult = {}; 
        process_spectrum_data(e.data.response_value, e.data.spectrum, workerResult);
        postMessage(workerResult);
    };


    function process_spectrum_data(response_value, spectrum, workerResult) {
        let z = new Float32Array(response_value);
        let polygons = d3.contours().size([spectrum.n_direct, spectrum.n_indirect]).thresholds(spectrum.levels)(z);
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
    }

}
  
  const fn = MyWorker.toString();
  const fnBody = fn.substring( fn.indexOf( '{' ) + 1, fn.lastIndexOf( '}' ) );
  const workerSourceURL = URL.createObjectURL( new Blob( [ fnBody ] ) );
  const my_contour_worker = new Worker( workerSourceURL );


var main_plot; //hsqc plot object

var b_recon = false; //reconstructed spectrum is there?


var oOutput; //global variable for output area



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
        this.raw_data = new ArrayBuffer(); //raw data from the server
        this.nosie_level = 0.001; //noise level of the input spectrum
        this.spectral_max = Number.MAX_VALUE; //maximum value of the spectrum
        this.n_direct = 4096; //size of direct dimension of the input spectrum. integer
        this.n_indirect = 1204; //size of indirect dimension of the input spectrum. integer
        this.x_ppm_start = 12.0; //start ppm of direct dimension
        this.x_ppm_width = 12.0; //width of direct dimension
        this.x_ppm_step = 12.0 / 4096; //step of direct dimension
        this.y_ppm_start = 120.0; //start ppm of indirect dimension
        this.y_ppm_width = 120.0; //width of indirect dimension
        this.y_ppm_step = 120.0 / 1024; //step of indirect dimension
    }
};


/**
 * webgl based contour plots variables 
 */
var hsqc_spectrum = new spectrum();

/**
 * Raw data for reconstruced hsqc spectrum
 */
var hsqc_recon_spectrum_data = new ArrayBuffer();




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


});

function run()
{
    /**
     * Get the file from the input field file1
     */
    read_file('file1')
        .then((response) => {
            oOutput.innerHTML = "File read successfully. Processing data.";
            /**
             * Submit the data to the server
             */
            process_get_data_from_server('process', '/index.php/deep_picker/getdata');
        })
        .catch((response) => {
            oOutput.appendChild(process_error(response, 0));
        });
}




/**
 * This function is called to submit form data to the server and get response (step1, either process or run_fid)
 * @param {*} form_id either process or run_fid
 * @param {*} resource_link either /index.php/deep_picker/getdata or /index.php/deep_picker/run_fid
 */
function process_get_data_from_server(form_id, resource_link) {

    /**
     * Promise chain of submitting data to the server and get response, and then get binary data from the server
     */
    let fd = new FormData(document.getElementById(form_id));

    /**
     * Chain of promises. 
     */
    form_submissions(fd, resource_link)
        .then((response_value, response_code) => {
            /**
             * Update session_id, user_exp_name
             * and many other spectrum information variables
             */
            process_spectrum_information(response_value, hsqc_spectrum);


            document.getElementById('id_info').innerHTML = "<p> Your session ID is " + session_id + " and user chosen name is " + user_exp_name + "</p>";
            /**
             * step 2: get binary data from the server
             */
            return get_data_from_server('/index.php/deep_picker/get_spectrum_as_binary', 'hsqc.bin');
        })
        .then((response_value, response_code) => {

            oOutput.innerHTML = "Received spectral data from the server. Processing data.";
            /**
             * response_values[1] is the status from submit_data()
             * response_values[0] is the response from submit_data(). It is an arraybuffer.
             * We will use it to calculate contour plot after converting it to Float32Array
             */
            hsqc_spectrum.raw_data =response_value;

            /**
             * Define a new object to pass to the worker, it includes only the necessary information from hsqc_spectrum
            */
            let hsqc_spectrum_part ={
                n_direct: hsqc_spectrum.n_direct,
                n_indirect: hsqc_spectrum.n_indirect,
                levels: hsqc_spectrum.levels,
                spectrum_type: "hsqc"
            };
            
            my_contour_worker.postMessage({ response_value: response_value, spectrum: hsqc_spectrum_part });

            document.getElementById("plot").style.display = "block";
            set_scale_bigplot();
            draw_bigplot(hsqc_spectrum);
            oOutput.innerHTML = '';
        })
        .catch((responseText, status) => {
            oOutput.appendChild(process_error(responseText, status));
        });
}

my_contour_worker.onmessage = (e) => {

    if(typeof e.data.message !== "undefined")
    {
        document.getElementById("contour_message").innerText = e.data.message;
        return;
    }

    /**
     * If the message is not a message, it is a result from the worker.
     */

    console.log("Message received from worker, spectral type: " + e.data.spectrum_type );

    if( e.data.spectrum_type === "hsqc")
    {
        /**
         * We want to make sure main_plot object share same copy of points, polygon_length, levels_length with hsqc_spectrum
         */
        main_plot.points =new Float32Array(e.data.points);
        main_plot.polygon_length = e.data.polygon_length.slice(0);
        main_plot.levels_length = e.data.levels_length.slice(0);
        main_plot.overlays = [main_plot.levels_length.length];
        main_plot.colors=[[0.7,0.7,0.7,1.0]]; //dark grey color for the contour plot

        /**
         * Draw the big plot with the new contour data, which has been updated by above 3 lines
         */
        main_plot.redraw_contour();
        set_scale_bigplot();
    }
    else if( e.data.spectrum_type === "hsqc-unshift")
    {
        /**
         * For type hsqc-unshift, we will insert e.data.points,polygon_length,levels_length to the beginning of current contour data
         * Step 1, concat the new points and current points
        */  
        let new_points = new Float32Array(e.data.points.length + main_plot.points.length);
        new_points.set(e.data.points,0);
        new_points.set(main_plot.points,e.data.points.length);
        main_plot.points = new_points;

        /**
         * Step 2, concat the new polygon_length and current polygon_length 
         * Before that, add e.data.polygon_length[last_element] to each element of main_plot.polygon_length
         */
        let polygon_shift = e.data.polygon_length[e.data.polygon_length.length-1];
        for(let i=0;i<main_plot.polygon_length.length;i++)
        {
            main_plot.polygon_length[i] += polygon_shift;
        }
        main_plot.polygon_length = e.data.polygon_length.concat(main_plot.polygon_length);

        /**
         * Step 3, concat the new levels_length and current levels_length
         * Before that, add e.data.levels_length[last_element] to each element of main_plot.levels_length
         */
        let levels_shift = e.data.levels_length[e.data.levels_length.length-1];
        for(let i=0;i<main_plot.levels_length.length;i++)
        {
            main_plot.levels_length[i] += levels_shift;
        }
        main_plot.levels_length = e.data.levels_length.concat(main_plot.levels_length);

        /**
         * Step 4, update main_plot.overlays. Because new data is inserted to the beginning, we need to shift all elements of overlays by 1
         */
        for(let i=0;i<main_plot.overlays.length;i++)
        {
            main_plot.overlays[i] += 1;
        }

        /**
         * Draw the big plot with the new contour data, which has been updated by above 3 lines
         */
        main_plot.redraw_contour();
        set_scale_bigplot();

    }
    else if( e.data.spectrum_type === "hsqcrecon")
    {
        /**
         * Reconstructed hsqc spectrum (from deconvolution) is received from the worker.
         * This step alway happen AFTER the hsqc spectrum is received and processed.
         * We add a new layer to the main_plot object to draw the reconstructed hsqc spectrum
         */
        var new_overlay ={
            polygon_length: e.data.polygon_length,
            levels_length: e.data.levels_length,
            color: [1.,0.,0.,1.] //red color for reconstructed spectrum
        }
        
        main_plot.add_overlay(new_overlay,new Float32Array(e.data.points));
        main_plot.redraw_contour();
    }
    else if (e.data.spectrum_type === 'hsqcrecon-unshift')
    {
        /**
         * For type hsqcrecon-unshift, we will insert e.data.points,polygon_length,levels_length to the beginning of overlay[1]
         * (overlay[0] is the original hsqc spectrum, overlay[1] is the reconstructed hsqc spectrum)
        */ 

        /**
         * Step 1
         * Because we need to insert new data into beginning of overlay[1],
         * we need to find starting indices of overlay[1] in main_plot.points, main_plot.polygon_length, main_plot.levels_length
         */
        let overlay1_start_in_levels_length = main_plot.overlays[0];
        let overlay1_start_in_polygon_length = main_plot.levels_length[overlay1_start_in_levels_length-1];
        let overlay1_start_in_points =  main_plot.polygon_length[overlay1_start_in_polygon_length -1] * 2; //each point has 2 elements
        
        
        /**
         * Step 2, concat the new points and current points
        */  
        let new_points = new Float32Array(e.data.points.length + main_plot.points.length);
        /**
         * Fill in new_points with main_plot.points from 0 to overlay1_start_in_points
         */
        new_points.set(main_plot.points.slice(0,overlay1_start_in_points),0);
        /**
         * Fill in new_points with e.data.points
         */
        new_points.set(e.data.points,overlay1_start_in_points);
        /**
         * Fill in new_points with main_plot.points from overlay1_start_in_points to the end
         */
        new_points.set(main_plot.points.slice(overlay1_start_in_points),overlay1_start_in_points + e.data.points.length);
        main_plot.points = new_points;



        /**
         * Step 3, concat current polygon_length from 0 to overlay1_start_in_polygon_length, e.data.polygon_length, and current polygon_length from overlay1_start_in_polygon_length to the end 
         * First, fill new_polygon_length with main_plot.polygon_length from 0 to overlay1_start_in_polygon_length
         */
        let new_polygon_length = main_plot.polygon_length.slice(0,overlay1_start_in_polygon_length);
        /**
         * Fill in new_polygon_length with e.data.polygon_length, but add main_plot.polygon_length[overlay1_start_in_polygon_length] to each element
         */
        for(let i=0;i<e.data.polygon_length.length;i++)
        {
            new_polygon_length.push(e.data.polygon_length[i] + main_plot.polygon_length[overlay1_start_in_polygon_length-1]);
        }
        /**
         * Fill in new_polygon_length with main_plot.polygon_length from overlay1_start_in_polygon_length to the end, but add e.data.polygon_length[last_element] to each element
         * and minus main_plot.polygon_length[overlay1_start_in_polygon_length] from each element
         */
        let overlay1_shift = e.data.polygon_length[e.data.polygon_length.length-1];
        for(let i=overlay1_start_in_polygon_length;i<main_plot.polygon_length.length;i++)
        {
            new_polygon_length.push(main_plot.polygon_length[i] + overlay1_shift);
        }
        main_plot.polygon_length = new_polygon_length;



        /**
         * Step 4, concat the new levels_length and current levels_length
         * First, fill new_levels_length with main_plot.levels_length from 0 to overlay1_start_in_levels_length
         */
        let new_levels_length = main_plot.levels_length.slice(0,overlay1_start_in_levels_length);
        /**
         * Fill in new_levels_length with e.data.levels_length, but add main_plot.levels_length[overlay1_start_in_levels_length] to each element
         */
        for(let i=0;i<e.data.levels_length.length;i++)
        {
            new_levels_length.push(e.data.levels_length[i] + main_plot.levels_length[overlay1_start_in_levels_length-1]);
        }
        /**
         * Fill in new_levels_length with main_plot.levels_length from overlay1_start_in_levels_length to the end, but add e.data.levels_length[last_element] to each element
         * and minus main_plot.levels_length[overlay1_start_in_levels_length] from each element
         */
        let overlay1_levels_shift = e.data.levels_length[e.data.levels_length.length-1];
        for(let i=overlay1_start_in_levels_length;i<main_plot.levels_length.length;i++)
        {
            new_levels_length.push(main_plot.levels_length[i] + overlay1_levels_shift);
        }
        main_plot.levels_length = new_levels_length;




        /**
         * Step 5, update main_plot.overlays. Because new data is inserted to the beginning of second overlay, we need to shift  elements of overlays from 2nd by 1
         */
        for(let i=1;i<main_plot.overlays.length;i++)
        {
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


/**
 * @param {object} hsqc_spectrum spectrum information and data. Pass by reference
 * @param {object} tocsy_spectrum spectrum information and data. Pass by reference
 * @param {object} hsqctocsy_spectrum spectrum information and data. Pass by reference
 * @param {string} response_value JSON string from the server
 */
function process_spectrum_information(response_value, hsqc_spectrum) {
    let result = JSON.parse(response_value);

    /**
     * session_id is a global variable. It may not be included in the response_value
     */

    if (typeof result.session_id !== "undefined") {
        session_id = result.session_id;
    }

    if (typeof result.user_exp_name !== "undefined") {
        user_exp_name = result.user_exp_name;
    }

    if (typeof result.recon !== "undefined" && result.recon === true) {
        b_recon = true;
    }


    /**
     *  Key hsqc must exist, while tocsy and hsqctocsy are both optional
    */
    if (typeof result.hsqc !== "undefined") {
        setup_spectrum_information(hsqc_spectrum, result.hsqc);
    }
}

function setup_spectrum_information(spectrum, result) {
    spectrum.n_indirect = result.n_indirect;
    spectrum.n_direct = result.n_direct;
    spectrum.x_ppm_start = result.begin_direct; //please notice the name of the variable in the server is different from the client
    spectrum.x_ppm_step = result.step_direct;
    spectrum.y_ppm_start = result.begin_indirect;
    spectrum.y_ppm_step = result.step_indirect;
    spectrum.noise_level = result.noise_level;

    if(typeof result.spectral_max !== "undefined" )
    {
        spectrum.spectral_max = result.spectral_max;
    }
    else
    {
        spectrum.spectral_max = Number.MAX_VALUE;
    }

    document.getElementById("noise_level").value  = spectrum.noise_level.toExponential(2);

    /**
    * adjust ppm_start and ppm_step by half of the bin size because the contour plot is defined by the center of each bin
    */
    spectrum.x_ppm_start -= spectrum.x_ppm_step / 2;
    spectrum.y_ppm_start -= spectrum.y_ppm_step / 2;

    /**
    * Define levels. We will use at most 40 levels for now.
    * We will stop early when the level is higher than spectral_max
    */
    spectrum.levels = new Array(40);
    spectrum.levels[0] = 5.5 * spectrum.noise_level;
    for (let i = 1; i < spectrum.levels.length; i++) {
        spectrum.levels[i] = 1.3 * spectrum.levels[i - 1];
        if ( spectrum.levels[i] > spectrum.spectral_max) {
            spectrum.levels = spectrum.levels.slice(0, i);
            break;
        }
    }
}



function set_scale_bigplot() {
    document.getElementById("contour0").value = hsqc_spectrum.levels[0].toFixed(2);
    document.getElementById("contour-slider").max = hsqc_spectrum.levels.length;
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
        document.getElementById("contour_level").innerText = hsqc_spectrum.levels[this.value-1].toFixed(2);
    });
    let tt = document.getElementById("contour-slider").value;
    document.getElementById("contour_level").innerText = hsqc_spectrum.levels[tt-1].toFixed(2);
    main_plot.update_contour(+tt);
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
function reduce_contour()
{
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
    hsqc_spectrum.levels.unshift(current_level);

    /**
     * Recalculate the contour plot
     */
    let hsqc_spectrum_part ={
        n_direct: hsqc_spectrum.n_direct,
        n_indirect: hsqc_spectrum.n_indirect,
        levels: [hsqc_spectrum.levels[0]],
        spectrum_type: "hsqc-unshift"
    };
    
    my_contour_worker.postMessage({ response_value: hsqc_spectrum.raw_data, spectrum: hsqc_spectrum_part });


    if(b_recon)
    {
        /**
         * Recon spectrum is received from the server. Process it in the worker
         * It has same format as the original hsqc spectrum (different data, same information)
         */
        let recon_spectrum_part = {
            n_direct: hsqc_spectrum.n_direct,
            n_indirect: hsqc_spectrum.n_indirect,
            levels: [hsqc_spectrum.levels[0]],
            spectrum_type: "hsqcrecon-unshift"
        };
        document.getElementById("contour_message").innerText = "Calculating contour plot.";
        my_contour_worker.postMessage({ response_value: hsqc_recon_spectrum_data, spectrum: recon_spectrum_part });
    }


    let tt = document.getElementById("contour-slider").value;
    document.getElementById("contour_level").innerText = hsqc_spectrum.levels[tt-1].toFixed(2);
}

/**
 * Event listener for text input field contour0
 */
function update_contour0_or_logarithmic_scale(e)
{
    let current_level = parseFloat(document.getElementById('contour0').value);
    let scale = parseFloat(document.getElementById('logarithmic_scale').value);

    

    /**
     * Recalculate the hsqc_spectrum.levels
     */
    hsqc_spectrum.levels[0] = current_level;
    for (let i = 1; i < 40; i++)
    {
        hsqc_spectrum.levels[i] = hsqc_spectrum.levels[i - 1] * scale;
        if ( hsqc_spectrum.levels[i] > hsqc_spectrum.spectral_max) {
            hsqc_spectrum.levels = hsqc_spectrum.levels.slice(0, i);
            break;
        }
    }

    let hsqc_spectrum_part ={
        n_direct: hsqc_spectrum.n_direct,
        n_indirect: hsqc_spectrum.n_indirect,
        levels: hsqc_spectrum.levels,
        spectrum_type: "hsqc"
    };
    
    my_contour_worker.postMessage({ response_value: hsqc_spectrum.raw_data, spectrum: hsqc_spectrum_part });

    if(b_recon)
    {
        /**
         * Recon spectrum is received from the server. Process it in the worker
         * It has same format as the original hsqc spectrum (different data, same information)
         */
        let recon_spectrum_part ={
            n_direct: hsqc_spectrum.n_direct,
            n_indirect: hsqc_spectrum.n_indirect,
            levels: hsqc_spectrum.levels,
            spectrum_type: "hsqcrecon"
        };
        
        my_contour_worker.postMessage({ response_value: hsqc_recon_spectrum_data, spectrum: recon_spectrum_part });
    }
}


const read_file = (file_id) => {
    return new Promise((resolve, reject) => {
        let file = document.getElementById(file_id).files[0];
        if (file) {
            var reader = new FileReader();
            reader.onload = function (e_file_read)
            {
                var arrayBuffer = e_file_read.target.result;
                console.log(arrayBuffer.byteLength);

                let header = new Float32Array(arrayBuffer, 0, 512);

                n_indirect = header[219]; //size of indirect dimension of the input spectrum
                n_direct = header[99]; //size of direct dimension of the input spectrum
                
                let tp = header[221];
                let sw1 = header[100];
                let sw2 = header[229];
                let frq1 = header[119];
                let frq2 = header[218];
                let ref1 = header[101];
                let ref2 = header[249];

                x_ppm_start=(ref1+sw1)/frq1;
                x_ppm_width=sw1/frq1;
                y_ppm_start=(ref2+sw2)/frq2;
                y_ppm_width=sw2/frq2;

                /**
                 * shift by half of the bin size because the contour plot is defined by the center of each bin
                 */
                x_ppm_start -= x_ppm_width/n_direct/2;
                y_ppm_start -= y_ppm_width/n_indirect/2;


                let data_size = arrayBuffer.byteLength / 4 - 512;

                let z = new Float32Array(arrayBuffer, 512 * 4, data_size);

                /**
                 * Get median of abs(z). If data_size is > 1024*1024, we will sample 1024*1024 points by stride
                 */
                let stride = 1;
                if (data_size > 1024 * 1024) {
                    stride = Math.floor(data_size / (1024 * 1024));
                }
                let z_abs = new Float32Array(data_size / stride);
                for (var i = 0; i < data_size; i += stride) {
                    z_abs[Math.floor(i / stride)] = Math.abs(z[i]);
                }
                z_abs.sort();

                let median = z_abs[Math.floor(z_abs.length / 2)];

                /**
                 * Define levels. We will use 20 levels for now
                 * levels[0]=5.5*median, levels[1]=1.3*levels[0], levels[2]=1.3*levels[1], etc.
                 */
                levels = new Array(20);
                levels[0] = 5.5 * median;
                for (var i = 1; i < levels.length; i++) {
                    levels[i] = 1.3 * levels[i - 1];
                }

                resolve("success");
            };
            reader.onerror = function (e)
            {
                reject("Error reading file");
            };
            reader.readAsArrayBuffer(file);
        }
        else {
            reject("No file selected");
        }
    });
} //end of read_file
